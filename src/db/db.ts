import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
export function openDb(path = resolve('data/upswing.db')) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.exec(readFileSync(resolve('schema.sql'), 'utf8'));
  db.pragma('busy_timeout = 5000');
  return db;
}
export type DB = ReturnType<typeof openDb>;
export const PUBLIC_TABLES = [
  'games',
  'game_hourly',
  'game_daily',
  'game_scan',
  'clip_weekly',
  'keyword_weekly',
  'context_events',
  'channels',
  'channel_hourly',
  'channel_daily',
];
let snapshotQueue: Promise<void> = Promise.resolve();
export function snapshot(db: DB) {
  const next = snapshotQueue.catch(() => {}).then(() => writeSnapshot(db));
  snapshotQueue = next;
  return next;
}
async function writeSnapshot(db: DB) {
  mkdirSync(resolve('analyst/db'), { recursive: true });
  const projection = new Database(':memory:');
  const blocked = new Set(
    (db.prepare('SELECT channel_id FROM blocklist').all() as { channel_id: string }[]).map(
      (r) => r.channel_id,
    ),
  );
  for (const table of PUBLIC_TABLES) {
    const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table) as {
      sql: string;
    };
    projection.exec(schema.sql);
    const rows = db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
    if (rows.length) {
      const insert = projection.prepare(
        `INSERT INTO ${table} VALUES(${Object.keys(rows[0])
          .map(() => '?')
          .join(',')})`,
      );
      projection.transaction(() =>
        rows.forEach((row) => {
          if (!blocked.has(String(row.channel_id ?? (table === 'channels' ? row.id : ''))))
            insert.run(...Object.values(row));
        }),
      )();
    }
  }
  const temp = resolve('analyst/db/upswing-next.db'),
    target = resolve('analyst/db/upswing-ro.db');
  rmSync(temp, { force: true });
  try {
    await projection.backup(temp);
    renameSync(temp, target);
  } finally {
    projection.close();
  }
}
