import { z } from 'zod';
import type { DB } from '../db/db.js';
import { snapshot } from '../db/db.js';
import { config } from '../server/config.js';
import { DAY, HOUR } from '../metrics/config.js';
import { quantile, tokenize } from '../metrics/index.js';
import { dedupeStreams, helix, streamsPage, type TwitchStream } from '../twitch/helix.js';
import { enrichIgdb } from '../twitch/igdb.js';
const gamesSchema = z.object({
  data: z.array(
    z.object({ id: z.string(), name: z.string(), box_art_url: z.string(), igdb_id: z.string().optional() }),
  ),
});
const usersSchema = z.object({
  data: z.array(z.object({ id: z.string(), profile_image_url: z.string(), created_at: z.string() })),
});
export function closeMissedSessions(db: DB, ts: number) {
  db.prepare('UPDATE streams SET missed=missed+1 WHERE ended_at IS NULL AND last_seen < ?').run(ts);
  db.prepare('UPDATE streams SET ended_at=last_seen+? WHERE ended_at IS NULL AND missed>=2').run(
    config.POLL_INTERVAL_MIN * 60_000,
  );
}
export function storePoll(db: DB, streams: TwitchStream[], ts: number) {
  db.transaction(() => {
    for (const s of dedupeStreams(streams)) {
      if (db.prepare('SELECT 1 FROM blocklist WHERE channel_id=?').get(s.user_id)) continue;
      db.prepare(
        'INSERT INTO channels(id,login,name,language,first_seen) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET login=excluded.login,name=excluded.name,language=excluded.language',
      ).run(s.user_id, s.user_login, s.user_name, s.language, ts);
      db.prepare(
        'INSERT INTO games(id,name,first_seen) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name',
      ).run(s.game_id, s.game_name, ts);
      db.prepare(
        'INSERT INTO streams(id,channel_id,started_at,last_seen) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen,missed=0,ended_at=NULL',
      ).run(s.id, s.user_id, Date.parse(s.started_at), ts);
      db.prepare('INSERT OR REPLACE INTO samples VALUES(?,?,?,?)').run(ts, s.id, s.viewer_count, s.game_id);
      const prev = db
        .prepare('SELECT title,game_id,tags FROM stream_meta WHERE stream_id=? ORDER BY ts DESC LIMIT 1')
        .get(s.id) as { title: string; game_id: string; tags: string } | undefined;
      const tags = JSON.stringify([...s.tags].sort());
      if (!prev || prev.title !== s.title || prev.game_id !== s.game_id || prev.tags !== tags)
        db.prepare('INSERT OR REPLACE INTO stream_meta VALUES(?,?,?,?,?)').run(
          s.id,
          ts,
          s.game_id,
          s.title,
          tags,
        );
    }
    closeMissedSessions(db, ts);
  })();
}
export function rollup(db: DB, ts: number) {
  const start = Math.floor(ts / HOUR) * HOUR;
  const expected = Math.max(1, 60 / config.POLL_INTERVAL_MIN);
  db.transaction(() => {
    const groups = db
      .prepare(
        'SELECT ts,game_id,SUM(viewers) viewers,COUNT(*) channels FROM samples WHERE ts>=? AND ts<? GROUP BY ts,game_id',
      )
      .all(start, start + HOUR) as { ts: number; game_id: string; viewers: number; channels: number }[];
    const pollCount =
      (
        db
          .prepare("SELECT COUNT(*) n FROM polls WHERE ts>=? AND ts<? AND errors='[]'")
          .get(start, start + HOUR) as { n: number }
      ).n || new Set(groups.map((x) => x.ts)).size;
    for (const id of new Set(groups.map((x) => x.game_id))) {
      const rows = groups.filter((x) => x.game_id === id),
        cov = Math.min(1, pollCount / expected);
      const viewers = rows.reduce((s, p) => s + p.viewers, 0) / pollCount;
      const channels = rows.reduce((s, p) => s + p.channels, 0) / pollCount;
      db.prepare('INSERT OR REPLACE INTO game_hourly VALUES(?,?,?,?,?,?,?,?)').run(
        start,
        id,
        viewers,
        channels,
        cov,
        Math.max(...rows.map((p) => p.viewers)),
        viewers * cov,
        channels * cov,
      );
    }
    const channels = db
      .prepare(
        'SELECT st.channel_id,s.game_id,AVG(s.viewers) viewers,MAX(s.viewers) peak,COUNT(DISTINCT s.ts) n,COUNT(DISTINCT s.stream_id) sessions FROM samples s JOIN streams st ON st.id=s.stream_id WHERE s.ts>=? AND s.ts<? GROUP BY st.channel_id,s.game_id',
      )
      .all(start, start + HOUR) as {
      channel_id: string;
      game_id: string;
      viewers: number;
      peak: number;
      n: number;
      sessions: number;
    }[];
    channels.forEach((c) =>
      db
        .prepare('INSERT OR REPLACE INTO channel_hourly VALUES(?,?,?,?,?,?,?)')
        .run(start, c.channel_id, c.game_id, c.viewers, Math.min(1, c.n / expected), c.peak, c.sessions),
    );
    const day = Math.floor(ts / DAY) * DAY;
    db.prepare(
      'INSERT OR REPLACE INTO game_daily SELECT ?,game_id,SUM(viewers*coverage)/SUM(coverage),SUM(hours_watched),SUM(hours_streamed) FROM game_hourly WHERE hour>=? AND hour<? GROUP BY game_id',
    ).run(day, day, day + DAY);
    db.prepare(
      'INSERT OR REPLACE INTO channel_daily SELECT ?,channel_id,SUM(viewers*coverage)/SUM(coverage),SUM(viewers*coverage) FROM channel_hourly WHERE hour>=? AND hour<? GROUP BY channel_id',
    ).run(day, day, day + DAY);
    db.prepare('DELETE FROM samples WHERE ts < ?').run(ts - config.RAW_RETENTION_DAYS * DAY);
  })();
}
export async function collectOnce(db: DB) {
  const owner = `${process.pid}-${Date.now()}`;
  const lock = db
    .prepare(
      "INSERT INTO job_locks VALUES('global-poll',?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE expires<?",
    )
    .run(owner, Date.now() + 90000, Date.now());
  if (!lock.changes) throw new Error('A collector poll is already running.');
  const heartbeat = setInterval(
    () =>
      db
        .prepare("UPDATE job_locks SET expires=? WHERE name='global-poll' AND owner=?")
        .run(Date.now() + 90000, owner),
    30000,
  );
  const started = Date.now(),
    ts = Math.floor(started / 60_000) * 60_000;
  let cursor: string | undefined,
    pages = 0,
    minReached: boolean;
  const rows: TwitchStream[] = [];
  try {
    do {
      const page = await helix.request(
        `streams?first=100${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`,
        streamsPage,
      );
      pages++;
      rows.push(...page.data);
      cursor = page.pagination.cursor;
      minReached = !!page.data.length && page.data.at(-1)!.viewer_count < config.MIN_VIEWERS;
      if (!page.data.length || minReached) break;
    } while (cursor && pages < config.MAX_PAGES);
    const streams = dedupeStreams(rows);
    storePoll(db, streams, ts);
    db.prepare('INSERT OR REPLACE INTO polls VALUES(?,?,?,?,?,?,?,?)').run(
      ts,
      Date.now() - started,
      pages,
      streams.length,
      streams.reduce((s, p) => s + p.viewer_count, 0),
      +minReached,
      helix.rateRemaining,
      '[]',
    );
    rollup(db, ts);
    try {
      await enrich(db, streams);
    } catch {
      console.error('Metadata enrichment was deferred; sampled observations were saved.');
    }
    try {
      await snapshot(db);
    } catch {
      console.error('The analyst snapshot could not refresh; sampled observations were saved.');
    }
    return {
      ts,
      pages,
      streams: streams.length,
      viewers: streams.reduce((s, p) => s + p.viewer_count, 0),
      minReached,
    };
  } catch (error) {
    db.prepare('INSERT OR REPLACE INTO polls VALUES(?,?,?,?,?,?,?,?)').run(
      ts,
      Date.now() - started,
      pages,
      0,
      0,
      0,
      helix.rateRemaining,
      JSON.stringify([error instanceof Error ? error.message : 'Poll failed']),
    );
    throw error;
  } finally {
    clearInterval(heartbeat);
    db.prepare("DELETE FROM job_locks WHERE name='global-poll' AND owner=?").run(owner);
  }
}
async function enrich(db: DB, streams: TwitchStream[]) {
  const ids = [...new Set(streams.map((s) => s.game_id))].filter(
    (id) =>
      !(db.prepare('SELECT box_art_url FROM games WHERE id=?').get(id) as { box_art_url: string } | undefined)
        ?.box_art_url,
  );
  for (let i = 0; i < ids.length; i += 100) {
    const games = await helix.request(
      `games?${ids
        .slice(i, i + 100)
        .map((id) => `id=${encodeURIComponent(id)}`)
        .join('&')}`,
      gamesSchema,
    );
    games.data.forEach((g) =>
      db
        .prepare('UPDATE games SET box_art_url=?,igdb_id=? WHERE id=?')
        .run(g.box_art_url, g.igdb_id ?? '', g.id),
    );
    await enrichIgdb(db, games.data);
  }
  const users = [...new Set(streams.map((s) => s.user_id))].filter(
    (id) =>
      !(db.prepare('SELECT avatar FROM channels WHERE id=?').get(id) as { avatar: string } | undefined)
        ?.avatar,
  );
  for (let i = 0; i < users.length; i += 100) {
    const result = await helix.request(
      `users?${users
        .slice(i, i + 100)
        .map((id) => `id=${encodeURIComponent(id)}`)
        .join('&')}`,
      usersSchema,
    );
    result.data.forEach((u) =>
      db
        .prepare('UPDATE channels SET avatar=?,created_at=? WHERE id=?')
        .run(u.profile_image_url, Date.parse(u.created_at), u.id),
    );
  }
}
export async function deepScan(db: DB, gameId: string) {
  let cursor: string | undefined;
  const rows: TwitchStream[] = [];
  do {
    const result = await helix.request(
      `streams?first=100&game_id=${encodeURIComponent(gameId)}${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`,
      streamsPage,
    );
    rows.push(...result.data);
    cursor = result.pagination.cursor;
  } while (cursor);
  const viewers = dedupeStreams(rows)
    .map((s) => s.viewer_count)
    .sort((a, b) => b - a);
  const edges = [0, 2, 5, 10, 25, 50, 100, 250, 500, 1000, Infinity];
  const histogram = edges.map(
    (end, i) => viewers.filter((v) => v <= end && (i === 0 || v > edges[i - 1])).length,
  );
  db.prepare('INSERT OR REPLACE INTO game_scan VALUES(?,?,?,?,?,?,?,?,?)').run(
    Math.floor(Date.now() / HOUR) * HOUR,
    gameId,
    viewers.length,
    viewers.reduce((s, v) => s + v, 0),
    quantile(viewers, 0.5),
    quantile(viewers, 0.75),
    quantile(viewers, 0.9),
    JSON.stringify(histogram),
    JSON.stringify(viewers),
  );
}
export async function backfillClips(db: DB) {
  const games: z.infer<typeof gamesSchema>['data'] = [];
  let cursor: string | undefined;
  do {
    const result = await helix.request(
      `games/top?first=100${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`,
      gamesSchema.extend({ pagination: z.object({ cursor: z.string().optional() }).default({}) }),
    );
    games.push(...result.data);
    cursor = result.pagination.cursor;
  } while (cursor && games.length < 300);
  const week = Math.floor(Date.now() / (7 * DAY)) * 7 * DAY;
  const schema = z.object({ data: z.array(z.object({ id: z.string(), view_count: z.number() })) });
  for (const g of games.slice(0, 300))
    for (let w = 0; w < 8; w++) {
      const start = week - w * 7 * DAY,
        end = Math.min(Date.now(), start + 7 * DAY);
      if (db.prepare('SELECT 1 FROM clip_weekly WHERE game_id=? AND week_start=?').get(g.id, start) && w)
        continue;
      const p = new URLSearchParams({
        game_id: g.id,
        first: '100',
        started_at: new Date(start).toISOString(),
        ended_at: new Date(end).toISOString(),
      });
      const clips = await helix.request(`clips?${p}`, schema);
      db.prepare('INSERT OR IGNORE INTO games(id,name,first_seen) VALUES(?,?,?)').run(
        g.id,
        g.name,
        Date.now(),
      );
      db.prepare('INSERT OR REPLACE INTO clip_weekly VALUES(?,?,?,?,?)').run(
        g.id,
        start,
        clips.data.reduce((s, c) => s + c.view_count, 0),
        clips.data.length,
        JSON.stringify(clips.data.map((c) => c.id)),
      );
    }
  return { categories: Math.min(300, games.length), weeks: 8 };
}
export async function pollWatched(db: DB) {
  const ids = (
    db.prepare('SELECT id FROM accounts WHERE id NOT IN (SELECT channel_id FROM blocklist)').all() as {
      id: string;
    }[]
  ).map((a) => a.id);
  for (let i = 0; i < ids.length; i += 100) {
    const page = await helix.request(
      `streams?first=100&${ids
        .slice(i, i + 100)
        .map((id) => `user_id=${encodeURIComponent(id)}`)
        .join('&')}`,
      streamsPage,
    );
    const ts = Date.now();
    db.transaction(() =>
      page.data.forEach((s) =>
        db
          .prepare('INSERT OR REPLACE INTO watched_samples VALUES(?,?,?,?)')
          .run(ts, s.user_id, s.viewer_count, s.game_id),
      ),
    )();
  }
  db.prepare('DELETE FROM watched_samples WHERE ts<?').run(Date.now() - 2 * DAY);
}
export function rollKeywords(db: DB) {
  const week = Math.floor(Date.now() / (7 * DAY)) * 7 * DAY;
  const rows = db
    .prepare(
      'SELECT m.title,g.name game,c.name channel,c.id channel_id FROM stream_meta m JOIN streams s ON s.id=m.stream_id JOIN channels c ON c.id=s.channel_id JOIN games g ON g.id=m.game_id WHERE m.ts>=?',
    )
    .all(week) as { title: string; game: string; channel: string; channel_id: string }[];
  const words = new Map<string, Set<string>>();
  rows.forEach((r) =>
    tokenize(r.title, r.game, r.channel).forEach((w) => {
      const set = words.get(w) ?? new Set();
      set.add(r.channel_id);
      words.set(w, set);
    }),
  );
  for (const [word, channels] of words)
    if (channels.size >= 15)
      db.prepare('INSERT OR REPLACE INTO keyword_weekly VALUES(?,?,?)').run(week, word, channels.size);
}
export function startCollector(db: DB, onPoll: () => void = () => {}) {
  let running = false,
    stopped = false,
    scanIndex = 0;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      console.log('Poll:', await collectOnce(db));
      rollKeywords(db);
      onPoll();
    } catch (e) {
      console.error(e instanceof Error ? e.message : 'Collector failed');
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), config.POLL_INTERVAL_MIN * 60_000);
  let scanning = false;
  const scanTimer = setInterval(
    async () => {
      if (scanning || stopped || !config.DEEPSCAN_GAMES) return;
      scanning = true;
      try {
        const games = db
          .prepare('SELECT game_id FROM game_hourly ORDER BY hour DESC,viewers DESC LIMIT ?')
          .all(config.DEEPSCAN_GAMES) as { game_id: string }[];
        if (games.length) await deepScan(db, games[scanIndex++ % games.length].game_id);
      } catch (e) {
        console.error(e instanceof Error ? e.message : 'Deep scan failed');
      } finally {
        scanning = false;
      }
    },
    Math.max(20_000, HOUR / Math.max(1, config.DEEPSCAN_GAMES)),
  );
  let watching = false;
  const watchedTimer = setInterval(async () => {
    if (watching || stopped) return;
    watching = true;
    try {
      await pollWatched(db);
    } catch {
      console.error('Watched-channel poll failed; it will retry.');
    } finally {
      watching = false;
    }
  }, config.WATCHED_POLL_SEC * 1000);
  return () => {
    stopped = true;
    clearInterval(timer);
    clearInterval(scanTimer);
    clearInterval(watchedTimer);
  };
}
