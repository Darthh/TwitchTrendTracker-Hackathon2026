import { describe, it, expect } from 'vitest';
import { TwitchTracker, parseSummary, summaryUrl, SummaryRateLimit } from './twitchtracker.js';
import { ensureSourceWatches, collectSummaries, collectionOverview, summaryHistory } from './collector.js';
import { openDb, type DB } from '../db/db.js';
import { HOUR } from '../metrics/config.js';
import { createApp } from '../server/app.js';
const category = { avg_viewers: 12345, avg_channels: 240, rank: 5, hours_watched: 7654321 };
const channel = {
  rank: 63,
  minutes_streamed: 13090,
  avg_viewers: 9690,
  max_viewers: 19982,
  hours_watched: 2114101,
  followers: -1040,
  followers_total: 11291981,
};
const noop = async () => {};
const client = (response = category) => new TwitchTracker(async () => Response.json(response), noop);
function watch(db: DB, kind = 'category', key = '509658', label = 'Just Chatting') {
  db.prepare('INSERT INTO source_watches(provider,kind,entity_key,label) VALUES(?,?,?,?)').run(
    'twitchtracker',
    kind,
    key,
    label,
  );
}
describe('TwitchTracker public summary connector', () => {
  it('accepts negative follower change but rejects invalid counters, HTML and unexpected error objects', async () => {
    expect(parseSummary('channel', channel).followers).toBe(-1040);
    expect(() => parseSummary('category', { ...category, avg_viewers: -1 })).toThrow();
    await expect(
      new TwitchTracker(async () => new Response('<h1>blocked</h1>'), noop).summary('category', '509658'),
    ).rejects.toThrow('invalid JSON');
    await expect(
      client({ error: 'private upstream detail' } as unknown as typeof category).summary(
        'category',
        '509658',
      ),
    ).rejects.toThrow('public summary schema');
  });
  it('uses only documented endpoints and rejects path/host injection', () => {
    expect(summaryUrl('category', '509658')).toBe('https://twitchtracker.com/api/games/summary/509658');
    expect(summaryUrl('channel', 'shroud')).toContain('/api/channels/summary/shroud');
    for (const key of ['../api', 'https://evil.test', 'shroud?token=x', 'a/b'])
      expect(() => summaryUrl('channel', key)).toThrow();
  });
  it('backs off on 429, retries one server error, and caps response bodies', async () => {
    await expect(
      new TwitchTracker(
        async () => new Response('', { status: 429, headers: { 'retry-after': '120' } }),
        noop,
      ).summary('channel', 'shroud'),
    ).rejects.toMatchObject({ retryAfterMs: 120000 });
    let calls = 0;
    const retry = new TwitchTracker(
      async () => (++calls === 1 ? new Response('', { status: 503 }) : Response.json(category)),
      noop,
    );
    expect((await retry.summary('category', '509658')).metrics).toEqual(category);
    expect(calls).toBe(2);
    await expect(
      new TwitchTracker(async () => new Response('x'.repeat(70000)), noop).summary('category', '509658'),
    ).rejects.toThrow('size limit');
    expect(new SummaryRateLimit(1000)).toBeInstanceOf(Error);
  });
  it('configures real category identifiers and a bounded starter watchlist', () => {
    const db = openDb(':memory:');
    try {
      ensureSourceWatches(db);
      const rows = db.prepare('SELECT kind,entity_key FROM source_watches WHERE enabled=1').all();
      expect(rows).toHaveLength(16);
      expect(rows).toContainEqual({ kind: 'category', entity_key: '491487' });
      expect(rows).toContainEqual({ kind: 'channel', entity_key: 'shroud' });
    } finally {
      db.close();
    }
  });
  it('persists timestamped provenance, deduplicates each hour, and never fabricates viewer-history rows', async () => {
    const db = openDb(':memory:');
    try {
      watch(db);
      let now = Date.now();
      await collectSummaries(db, { client: client(), now: () => now, sleep: noop });
      await collectSummaries(db, { client: client(), now: () => now, sleep: noop, force: true });
      expect(db.prepare('SELECT COUNT(*) n FROM source_snapshots').get()).toEqual({ n: 1 });
      const snapshot = db.prepare('SELECT period,source_url,raw_sha256 FROM source_snapshots').get() as {
        period: string;
        source_url: string;
        raw_sha256: string;
      };
      expect(snapshot.period).toBe('provider_summary');
      expect(snapshot.source_url).toContain('/api/games/summary/509658');
      expect(snapshot.raw_sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(db.prepare('SELECT COUNT(*) n FROM game_hourly').get()).toEqual({ n: 0 });
      expect(db.prepare('SELECT COUNT(*) n FROM samples').get()).toEqual({ n: 0 });
      now += HOUR * 2;
      await collectSummaries(db, { client: client(), now: () => now, sleep: noop });
      expect(summaryHistory(db, 'category', '509658', 'week')).toHaveLength(2);
    } finally {
      db.close();
    }
  });
  it('keeps prior observations after provider failure and respects the next collection time', async () => {
    const db = openDb(':memory:');
    try {
      watch(db);
      let now = Date.now();
      await collectSummaries(db, { client: client(), now: () => now, sleep: noop });
      expect((await collectSummaries(db, { client: client(), now: () => now, sleep: noop })).skipped).toBe(
        true,
      );
      now += HOUR * 2;
      await collectSummaries(db, {
        client: new TwitchTracker(async () => new Response('', { status: 403 }), noop),
        now: () => now,
        sleep: noop,
      });
      const overview = collectionOverview(db, false);
      expect(overview.items[0].metrics).toEqual(category);
      expect(overview.items[0].lastError).toContain('HTTP 403');
      expect(overview.totalSnapshots).toBe(1);
    } finally {
      db.close();
    }
  });
  it('persists rate-limit cooldown and only runs one worker even after time advances', async () => {
    const db = openDb(':memory:');
    try {
      watch(db);
      let clock = Date.now();
      const limited = new TwitchTracker(
        async () => new Response('', { status: 429, headers: { 'retry-after': '7200' } }),
        noop,
      );
      const result = await collectSummaries(db, { client: limited, now: () => clock, sleep: noop });
      expect(result.failures).toBe(1);
      expect(result.nextDue).toBeGreaterThanOrEqual(clock + 2 * HOUR);
      clock += HOUR;
      expect((await collectSummaries(db, { client: client(), now: () => clock, sleep: noop })).skipped).toBe(
        true,
      );
      expect(db.prepare('SELECT COUNT(*) n FROM source_snapshots').get()).toEqual({ n: 0 });
      expect(collectionOverview(db, false).items[0].lastError).toContain('rate limited');
    } finally {
      db.close();
    }
  });
  it('uses a cross-process lease and enforces opted-out channel exclusions', async () => {
    const db = openDb(':memory:');
    try {
      watch(db);
      db.prepare("INSERT INTO job_locks VALUES('twitchtracker-summary','other',?)").run(Date.now() + HOUR);
      expect((await collectSummaries(db, { client: client(), sleep: noop })).skipped).toBe(true);
      db.prepare('DELETE FROM job_locks').run();
      watch(db, 'channel', 'blocked', 'blocked');
      db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?,?)').run(
        'id',
        'blocked',
        'blocked',
        'encrypted',
        '',
        0,
      );
      db.prepare('INSERT INTO blocklist VALUES(?,?)').run('id', Date.now());
      await collectSummaries(db, { client: client(), sleep: noop });
      expect(collectionOverview(db, false).items).toHaveLength(1);
      expect(summaryHistory(db, 'channel', 'blocked', 'week')).toEqual([]);
    } finally {
      db.close();
    }
  });
  it('serves actual source records separately from the synthetic dashboard, with bounded read-only history', async () => {
    const live = openDb(':memory:'),
      demo = openDb(':memory:');
    watch(live);
    await collectSummaries(live, { client: client(), sleep: noop });
    const app = await createApp(demo, { demo: true, web: false, collectionDb: live });
    try {
      const response = await app.inject('/api/collection');
      expect(response.statusCode).toBe(200);
      expect(response.json().items[0].metrics).toEqual(category);
      expect((await app.inject('/api/pulse')).json().source).toBe('synthetic');
      expect(
        (await app.inject('/api/collection/history?kind=category&key=509658')).json().points,
      ).toHaveLength(1);
      expect((await app.inject('/api/collection/history?kind=invalid&key=509658')).statusCode).toBe(400);
      expect((await app.inject('/api/collection/history?kind=channel&key=..%2F..')).statusCode).toBe(400);
    } finally {
      await app.close();
      live.close();
      demo.close();
    }
  });
  it('does not save an in-flight result when the channel opts out before the response arrives', async () => {
    const db = openDb(':memory:');
    try {
      watch(db, 'channel', 'blocked', 'blocked');
      db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?,?)').run(
        'id',
        'blocked',
        'blocked',
        'encrypted',
        '',
        0,
      );
      const source = new TwitchTracker(async () => {
        db.prepare('INSERT INTO blocklist VALUES(?,?)').run('id', Date.now());
        return Response.json(channel);
      }, noop);
      await collectSummaries(db, { client: source, sleep: noop });
      expect(db.prepare('SELECT COUNT(*) n FROM source_snapshots').get()).toEqual({ n: 0 });
      expect(collectionOverview(db, false).items).toEqual([]);
    } finally {
      db.close();
    }
  });
});
