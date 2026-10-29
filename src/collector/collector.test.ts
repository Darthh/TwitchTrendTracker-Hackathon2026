import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { openDb } from '../db/db.js';
import { closeMissedSessions, storePoll, rollup } from './poll.js';
import { Helix, dedupeStreams, type TwitchStream } from '../twitch/helix.js';
const databases: ReturnType<typeof openDb>[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));
const stream: TwitchStream = {
  id: 's1',
  user_id: 'c1',
  user_login: 'cozy',
  user_name: 'Cozy',
  game_id: 'g1',
  game_name: 'Garden',
  title: 'A good stream',
  tags: ['Cozy'],
  viewer_count: 100,
  started_at: new Date(0).toISOString(),
  language: 'en',
  is_mature: false,
  thumbnail_url: '',
};
it('deduplicates pagination by broadcast ID', () =>
  expect(dedupeStreams([stream, { ...stream, viewer_count: 110 }])).toEqual([
    { ...stream, viewer_count: 110 },
  ]));
it('is restart/idempotence safe and writes metadata only on change', () => {
  const db = openDb(':memory:');
  databases.push(db);
  storePoll(db, [stream, stream], 1000);
  storePoll(db, [stream], 1000);
  storePoll(db, [stream], 2000);
  expect((db.prepare('SELECT COUNT(*) n FROM samples').get() as { n: number }).n).toBe(2);
  expect((db.prepare('SELECT COUNT(*) n FROM stream_meta').get() as { n: number }).n).toBe(1);
  storePoll(db, [{ ...stream, title: 'New title' }], 3000);
  expect((db.prepare('SELECT COUNT(*) n FROM stream_meta').get() as { n: number }).n).toBe(2);
});
it('closes broadcasts only after two missed global polls', () => {
  const db = openDb(':memory:');
  databases.push(db);
  storePoll(db, [stream], 1000);
  closeMissedSessions(db, 2000);
  expect(
    (db.prepare('SELECT ended_at FROM streams').get() as { ended_at: number | null }).ended_at,
  ).toBeNull();
  closeMissedSessions(db, 3000);
  expect(
    (db.prepare('SELECT ended_at FROM streams').get() as { ended_at: number | null }).ended_at,
  ).not.toBeNull();
});
it('waits on a 429 and retries without crashing', async () => {
  let requests = 0;
  const sleeps: number[] = [];
  const fetcher = (async () => {
    requests++;
    return requests === 1
      ? new Response('{}', {
          status: 429,
          headers: { 'Ratelimit-Reset': String(Math.ceil(Date.now() / 1000) + 1) },
        })
      : new Response('{"data":[]}');
  }) as typeof fetch;
  const client = new Helix(fetcher, async (ms) => {
    sleeps.push(ms);
  });
  expect(await client.request('streams', z.object({ data: z.array(z.unknown()) }), {}, 'test-token')).toEqual(
    { data: [] },
  );
  expect(requests).toBe(2);
  expect(sleeps[0]).toBeGreaterThanOrEqual(1000);
});
it('does not overweight a category that disappears during a covered poll', () => {
  const db = openDb(':memory:');
  databases.push(db);
  storePoll(db, [stream], 0);
  db.prepare("INSERT INTO polls VALUES(0,0,1,1,100,0,800,'[]')").run();
  db.prepare("INSERT INTO polls VALUES(600000,0,1,0,0,0,800,'[]')").run();
  rollup(db, 600000);
  const row = db.prepare('SELECT viewers,coverage FROM game_hourly').get() as {
    viewers: number;
    coverage: number;
  };
  expect(row.viewers).toBe(50);
  expect(row.coverage).toBeCloseTo(2 / 6);
});
