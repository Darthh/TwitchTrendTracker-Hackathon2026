import type { DB } from '../db/db.js';
import type { Dashboard, Range } from '../shared/types.js';
import { Analyst } from '../codex/runtime.js';
import { querySnapshot } from '../codex/verify.js';
import { snapshot } from '../db/db.js';
export function startJobs(db: DB, analyst: Analyst, data: (range: Range) => Dashboard) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const alerts = db.prepare('SELECT id,sql FROM alerts WHERE approved=1').all() as {
        id: string;
        sql: string;
      }[];
      if (alerts.length) await snapshot(db);
      const hour = Math.floor(Date.now() / 3600000) * 3600000;
      for (const alert of alerts) {
        // Rules compiled by the fallback are historical hourly queries: only the latest hour is a new hit.
        try {
          const rows = await querySnapshot(alert.sql);
          const latest = rows.filter((r) => typeof r.hour === 'number' && r.hour >= hour - 3600000);
          if (latest.length)
            db.prepare('INSERT OR IGNORE INTO alert_hits VALUES(?,?,?)').run(
              alert.id,
              hour,
              JSON.stringify(latest),
            );
        } catch {
          /* A rejected alert never interrupts other jobs. */
        }
      }
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        hourCycle: 'h23',
      }).formatToParts();
      const part = (name: string) => parts.find((p) => p.type === name)?.value ?? '';
      if (Number(part('hour')) !== 9) return;
      for (const range of ['week', 'month'] as const) {
        if (range === 'week' ? part('weekday') !== 'Mon' : part('day') !== '01') continue;
        const id = `scheduled-${range}-${part('year')}-${part('month')}-${part('day')}`;
        if (db.prepare('SELECT 1 FROM reports WHERE id=?').get(id)) continue;
        const run = analyst.ask(`Give me this ${range}'s trend report`, data(range));
        // No keys: the deterministic answer completes synchronously. Live runs stream in the background.
        const deadline = Date.now() + 125000;
        while (run.status === 'queued' || run.status === 'running') {
          if (Date.now() > deadline) break;
          await new Promise((r) => setTimeout(r, 500));
        }
        if (run.status === 'complete' && run.output)
          db.prepare('INSERT OR IGNORE INTO reports VALUES(?,?,?,?,?)').run(
            id,
            range,
            Date.now(),
            JSON.stringify(run.output),
            run.source,
          );
      }
    } catch {
      console.error('An analytics background job failed; it will retry on the next tick.');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 60_000);
  return () => clearInterval(timer);
}
