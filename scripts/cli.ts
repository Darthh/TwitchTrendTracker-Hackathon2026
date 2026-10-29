import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { openDb, snapshot, PUBLIC_TABLES } from '../src/db/db.js';
import { seedDemo } from '../src/db/seed.js';
import { dashboard } from '../src/db/queries.js';
import { backfillClips, collectOnce, startCollector } from '../src/collector/poll.js';
import { explain } from '../src/why/index.js';
import { Analyst, QUESTIONS } from '../src/codex/runtime.js';
import {
  ensureSourceWatches,
  collectSummaries,
  startSummaryCollector,
  collectionOverview,
} from '../src/sources/collector.js';
const command = process.argv[2],
  demo = process.argv.includes('--demo');
const db = openDb(demo ? 'data/demo.db' : undefined);
if (demo) seedDemo(db);
try {
  if (command === 'collect:twitchtracker:once' || command === 'collect:twitchtracker') {
    if (demo) throw new Error('Real source collection must use the live database; omit --demo.');
    ensureSourceWatches(db);
    if (command === 'collect:twitchtracker:once') {
      const result = await collectSummaries(db);
      console.log(JSON.stringify(result, null, 2));
      if (result.failures) process.exitCode = 1;
    } else {
      const stop = startSummaryCollector(db);
      process.on('SIGINT', () => {
        void stop().then(() => {
          db.close();
          process.exit(0);
        });
      });
      process.on('SIGTERM', () => {
        void stop().then(() => {
          db.close();
          process.exit(0);
        });
      });
      await new Promise(() => {});
    }
  } else if (command === 'collection:status')
    console.log(JSON.stringify(collectionOverview(db, false), null, 2));
  else if (command === 'collect:once') console.log(JSON.stringify(await collectOnce(db), null, 2));
  else if (command === 'collect') {
    const stop = startCollector(db);
    process.on('SIGINT', () => {
      stop();
      db.close();
      process.exit(0);
    });
    await new Promise(() => {});
  } else if (command === 'backfill:clips') console.log(await backfillClips(db));
  else if (command === 'report') {
    for (const range of ['week', 'month'] as const) {
      const data = dashboard(db, range, demo);
      console.log(`\n${range.toUpperCase()} · ${data.source} · ${data.daysTracked.toFixed(1)} days tracked`);
      const sorted = [...data.games].sort(
        (a, b) => (b.metric.deltaPct ?? -Infinity) - (a.metric.deltaPct ?? -Infinity),
      );
      console.table(
        sorted.slice(0, 10).map((g) => ({
          category: g.name,
          avgViewers: Math.round(g.metric.value),
          delta: g.metric.deltaPct === null ? 'insufficient' : `${(g.metric.deltaPct * 100).toFixed(1)}%`,
          absolute: Math.round(g.metric.deltaAbs),
          comparison: g.metric.label,
        })),
      );
      if (sorted[0]) console.log(JSON.stringify(explain(sorted[0], data), null, 2));
    }
  } else if (command === 'warm-codex') {
    await snapshot(db);
    const analyst = new Analyst(db, demo),
      data = dashboard(db, 'week', demo);
    for (const q of QUESTIONS) {
      const run = analyst.ask(q, data);
      while (analyst.get(run.id)?.status !== 'complete') await new Promise((r) => setTimeout(r, 100));
      console.log(JSON.stringify({ id: run.id, question: q, source: analyst.get(run.id)?.source }));
    }
    console.log('Runs persisted locally. Rules output is labeled rules; no live Codex output is fabricated.');
  } else if (command === 'export-sample') {
    const result: Record<string, unknown> = {
      source: demo ? 'synthetic' : 'collected',
      exportedAt: new Date().toISOString(),
      tables: {},
    };
    const tables: Record<string, unknown> = {};
    const blocked = new Set(
      (db.prepare('SELECT channel_id FROM blocklist').all() as { channel_id: string }[]).map(
        (x) => x.channel_id,
      ),
    );
    for (const t of PUBLIC_TABLES)
      tables[t] = (db.prepare(`SELECT * FROM ${t}`).all() as Record<string, unknown>[]).filter(
        (row) => !blocked.has(String(row.channel_id ?? (t === 'channels' ? row.id : ''))),
      );
    result.tables = tables;
    mkdirSync('data', { recursive: true });
    writeFileSync('data/export.json', JSON.stringify(result));
    console.log(
      'Wrote public-only data/export.json (gitignored). Review before redistributing public channel metadata.',
    );
  } else if (command === 'import-sample') {
    const data = JSON.parse(readFileSync('data/export.json', 'utf8')) as {
      tables: Record<string, Record<string, unknown>[]>;
    };
    db.transaction(() => {
      for (const table of PUBLIC_TABLES) {
        const rows = data.tables[table] ?? [];
        if (!rows.length) continue;
        const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
          (c) => c.name,
        );
        const insert = db.prepare(
          `INSERT OR REPLACE INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
        );
        for (const row of rows) insert.run(...columns.map((c) => row[c] ?? null));
      }
    })();
    console.log('Imported approved public tables.');
  } else if (command === 'bot')
    console.log(
      'Start npm run dev or npm start, connect Twitch, authorize chat in My Channel, then explicitly enable the bot. Use the mock chat before enabling live replies.',
    );
  else throw new Error('Unknown command');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Command failed');
  process.exitCode = 1;
} finally {
  if (command !== 'collect' && command !== 'collect:twitchtracker') db.close();
}
