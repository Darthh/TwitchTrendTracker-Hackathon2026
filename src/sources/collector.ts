import { randomUUID } from 'node:crypto';
import type { DB } from '../db/db.js';
import { CATALOG } from '../db/seed.js';
import { categoryArtwork } from '../shared/category-artwork.js';
import { config } from '../server/config.js';
import type { CollectionOverview, SourceItem, SourceKind, Range } from '../shared/types.js';
import { DAY, HOUR } from '../metrics/config.js';
import { TwitchTracker, SummaryRateLimit, summaryUrl } from './twitchtracker.js';
const PROVIDER = 'twitchtracker';
type Watch = {
  kind: SourceKind;
  entity_key: string;
  label: string;
  last_success: number | null;
  last_error: string | null;
};
const allowedWatch = `w.enabled=1 AND NOT (w.kind='channel' AND (EXISTS(SELECT 1 FROM accounts a JOIN blocklist b ON b.channel_id=a.id WHERE LOWER(a.login)=LOWER(w.entity_key)) OR EXISTS(SELECT 1 FROM channels c JOIN blocklist b ON b.channel_id=c.id WHERE LOWER(c.login)=LOWER(w.entity_key))))`;
export function ensureSourceWatches(db: DB) {
  const categories = config.TWITCHTRACKER_CATEGORIES.trim()
    ? config.TWITCHTRACKER_CATEGORIES.split(',').map((id) => {
        id = id.trim();
        if (!/^\d{1,15}$/.test(id))
          throw new Error('TWITCHTRACKER_CATEGORIES must contain comma-separated Twitch category IDs.');
        const known = CATALOG.find(
          (g) =>
            categoryArtwork(g.name)?.includes(`/ttv-boxart/${id}-`) ||
            categoryArtwork(g.name)?.includes(`/ttv-boxart/${id}_`),
        );
        return { kind: 'category' as const, key: id, label: known?.name ?? `Category ${id}` };
      })
    : CATALOG.map((g) => ({
        kind: 'category' as const,
        key: categoryArtwork(g.name)!.match(/ttv-boxart\/(\d+)/)![1],
        label: g.name,
      }));
  const channels = config.TWITCHTRACKER_CHANNELS.split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .map((key) => {
      if (!/^[a-z0-9_]{1,25}$/.test(key))
        throw new Error('TWITCHTRACKER_CHANNELS must contain comma-separated Twitch logins.');
      return { kind: 'channel' as const, key, label: key };
    });
  if (categories.length > 20 || channels.length > 20)
    throw new Error('Track at most 20 categories and 20 channels with the public summary provider.');
  db.transaction(() => {
    db.prepare('UPDATE source_watches SET enabled=0 WHERE provider=?').run(PROVIDER);
    const put = db.prepare(
      'INSERT INTO source_watches(provider,kind,entity_key,label,enabled) VALUES(?,?,?,?,1) ON CONFLICT(provider,kind,entity_key) DO UPDATE SET label=excluded.label,enabled=1',
    );
    [...categories, ...channels].forEach((w) => put.run(PROVIDER, w.kind, w.key, w.label));
    db.prepare('INSERT OR IGNORE INTO source_collector(provider) VALUES(?)').run(PROVIDER);
  })();
}
export async function collectSummaries(
  db: DB,
  options: {
    client?: TwitchTracker;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    force?: boolean;
  } = {},
) {
  const now = options.now ?? Date.now,
    client = options.client ?? new TwitchTracker(),
    sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const state = db.prepare('SELECT next_due FROM source_collector WHERE provider=?').get(PROVIDER) as
    { next_due: number } | undefined;
  if (!options.force && state && state.next_due > now())
    return { skipped: true, successes: 0, failures: 0, nextDue: state.next_due };
  const owner = randomUUID();
  const acquired = db
    .prepare(
      "INSERT INTO job_locks VALUES('twitchtracker-summary',?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE expires<?",
    )
    .run(owner, now() + 300000, now());
  if (!acquired.changes)
    return { skipped: true, successes: 0, failures: 0, nextDue: state?.next_due ?? now() };
  const heartbeat = setInterval(
    () =>
      db
        .prepare("UPDATE job_locks SET expires=? WHERE name='twitchtracker-summary' AND owner=?")
        .run(now() + 300000, owner),
    30000,
  );
  const interval = config.TWITCHTRACKER_INTERVAL_MIN * 60000;
  let successes = 0,
    failures = 0,
    error: string | null = null,
    nextDue = now() + interval;
  try {
    db.prepare(
      'INSERT INTO source_collector(provider,last_started,next_due) VALUES(?,?,?) ON CONFLICT(provider) DO UPDATE SET last_started=excluded.last_started,next_due=excluded.next_due',
    ).run(PROVIDER, now(), nextDue);
    const watches = db
      .prepare(
        `SELECT w.* FROM source_watches w WHERE w.provider=? AND ${allowedWatch} ORDER BY w.kind,w.entity_key`,
      )
      .all(PROVIDER) as Watch[];
    for (const w of watches) {
      if (!options.force && w.last_success && now() - w.last_success < interval) continue;
      db.prepare('UPDATE source_watches SET last_attempt=? WHERE provider=? AND kind=? AND entity_key=?').run(
        now(),
        PROVIDER,
        w.kind,
        w.entity_key,
      );
      try {
        const result = await client.summary(w.kind, w.entity_key),
          observedAt = now();
        const stillAllowed = db
          .prepare(
            `SELECT 1 FROM source_watches w WHERE w.provider=? AND w.kind=? AND w.entity_key=? AND ${allowedWatch}`,
          )
          .get(PROVIDER, w.kind, w.entity_key);
        if (!stillAllowed) continue;
        db.transaction(() => {
          db.prepare('INSERT OR IGNORE INTO source_snapshots VALUES(?,?,?,?,?,?,?,?,?)').run(
            PROVIDER,
            w.kind,
            w.entity_key,
            Math.floor(observedAt / HOUR) * HOUR,
            observedAt,
            JSON.stringify(result.metrics),
            result.sourceUrl,
            result.sha256,
            'provider_summary',
          );
          db.prepare(
            'UPDATE source_watches SET last_success=?,last_error=NULL WHERE provider=? AND kind=? AND entity_key=?',
          ).run(observedAt, PROVIDER, w.kind, w.entity_key);
        })();
        successes++;
      } catch (e) {
        failures++;
        error =
          e instanceof SummaryRateLimit
            ? e.message
            : e instanceof Error && e.message.startsWith('TwitchTracker')
              ? e.message
              : 'TwitchTracker network request failed; saved observations were retained.';
        db.prepare('UPDATE source_watches SET last_error=? WHERE provider=? AND kind=? AND entity_key=?').run(
          error,
          PROVIDER,
          w.kind,
          w.entity_key,
        );
        if (e instanceof SummaryRateLimit) {
          nextDue = Math.max(nextDue, now() + e.retryAfterMs);
          break;
        }
      }
      await sleep(750);
    }
    nextDue = Math.max(nextDue, now() + interval);
    db.prepare(
      'UPDATE source_collector SET last_finished=?,last_success=CASE WHEN ?>0 THEN ? ELSE last_success END,last_error=?,next_due=?,successes=?,failures=? WHERE provider=?',
    ).run(now(), successes, now(), error, nextDue, successes, failures, PROVIDER);
    return { skipped: false, successes, failures, nextDue };
  } finally {
    clearInterval(heartbeat);
    db.prepare("DELETE FROM job_locks WHERE name='twitchtracker-summary' AND owner=?").run(owner);
  }
}
export function startSummaryCollector(db: DB) {
  ensureSourceWatches(db);
  const owner = randomUUID();
  let stopped = false,
    inFlight: Promise<unknown> | undefined;
  const tick = () => {
    if (stopped) return;
    db.prepare('UPDATE source_collector SET heartbeat=?,owner=? WHERE provider=?').run(
      Date.now(),
      owner,
      PROVIDER,
    );
    if (!inFlight)
      inFlight = collectSummaries(db)
        .then((result) => {
          if (!result.skipped)
            console.log(`TwitchTracker: ${result.successes} summaries saved; ${result.failures} failures.`);
        })
        .catch(() =>
          db
            .prepare('UPDATE source_collector SET last_error=? WHERE provider=?')
            .run('Summary collector failed; it will retry on the next tick.', PROVIDER),
        )
        .finally(() => {
          inFlight = undefined;
        });
  };
  tick();
  const timer = setInterval(tick, 30000);
  return async () => {
    stopped = true;
    clearInterval(timer);
    await inFlight;
    db.prepare('UPDATE source_collector SET heartbeat=NULL,owner=NULL WHERE provider=? AND owner=?').run(
      PROVIDER,
      owner,
    );
  };
}
export function collectionOverview(db: DB | null, directActive: boolean): CollectionOverview {
  const state = db?.prepare('SELECT * FROM source_collector WHERE provider=?').get(PROVIDER) as
    | { heartbeat: number | null; next_due: number; last_finished: number | null; last_error: string | null }
    | undefined;
  const watches = db
    ?.prepare(
      `SELECT w.* FROM source_watches w WHERE w.provider=? AND ${allowedWatch} ORDER BY w.kind,w.label`,
    )
    .all(PROVIDER) as Watch[] | undefined;
  const items: SourceItem[] = (watches ?? []).map((w) => {
    const latest = db!
      .prepare(
        'SELECT observed_at,metrics_json,source_url FROM source_snapshots WHERE provider=? AND kind=? AND entity_key=? ORDER BY observed_at DESC LIMIT 1',
      )
      .get(PROVIDER, w.kind, w.entity_key) as
      { observed_at: number; metrics_json: string; source_url: string } | undefined;
    const count = db!
      .prepare('SELECT COUNT(*) n FROM source_snapshots WHERE provider=? AND kind=? AND entity_key=?')
      .get(PROVIDER, w.kind, w.entity_key) as { n: number };
    return {
      kind: w.kind,
      key: w.entity_key,
      label: w.label,
      observedAt: latest?.observed_at ?? null,
      lastError: w.last_error,
      metrics: latest ? JSON.parse(latest.metrics_json) : null,
      sourceUrl: latest?.source_url ?? summaryUrl(w.kind, w.entity_key),
      artwork: w.kind === 'category' ? categoryArtwork(w.label) : null,
      observations: count.n,
    };
  });
  const count = db
    ?.prepare('SELECT COUNT(*) n,MIN(observed_at) first FROM source_snapshots WHERE provider=?')
    .get(PROVIDER) as { n: number; first: number | null } | undefined;
  const direct = db?.prepare("SELECT COUNT(*) polls,MAX(ts) last FROM polls WHERE errors='[]'").get() as
    { polls: number; last: number | null } | undefined;
  const samples = db?.prepare('SELECT COUNT(*) n FROM samples').get() as { n: number } | undefined;
  return {
    provider: PROVIDER,
    period: 'provider_summary',
    active: !!state?.heartbeat && Date.now() - state.heartbeat < 90000,
    intervalMin: config.TWITCHTRACKER_INTERVAL_MIN,
    heartbeat: state?.heartbeat ?? null,
    nextDue: state?.next_due ?? null,
    lastFinished: state?.last_finished ?? null,
    lastError: state?.last_error ?? null,
    totalSnapshots: count?.n ?? 0,
    firstObserved: count?.first ?? null,
    items,
    directTwitch: {
      configured: !!config.TWITCH_CLIENT_ID && !!config.TWITCH_CLIENT_SECRET,
      active: directActive,
      polls: direct?.polls ?? 0,
      samples: samples?.n ?? 0,
      lastPoll: direct?.last ?? null,
    },
  };
}
export function summaryHistory(db: DB | null, kind: SourceKind, key: string, range: Range) {
  summaryUrl(kind, key);
  if (!db) return [];
  const watch = db
    .prepare(
      `SELECT w.entity_key FROM source_watches w WHERE w.provider=? AND w.kind=? AND w.entity_key=? AND ${allowedWatch}`,
    )
    .get(PROVIDER, kind, key);
  if (!watch) return [];
  const rows = db
    .prepare(
      'SELECT observed_at,metrics_json FROM source_snapshots WHERE provider=? AND kind=? AND entity_key=? AND observed_at>=? ORDER BY observed_at DESC LIMIT 1000',
    )
    .all(PROVIDER, kind, key, Date.now() - (range === 'week' ? 7 : 30) * DAY) as {
    observed_at: number;
    metrics_json: string;
  }[];
  return rows
    .reverse()
    .map((r) => ({ ts: r.observed_at, metrics: JSON.parse(r.metrics_json) as Record<string, number> }));
}
