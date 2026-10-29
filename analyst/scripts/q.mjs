import { Worker } from 'node:worker_threads';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const sql = process.argv[2] ?? '';
if (
  !/^\s*SELECT\b/i.test(sql) ||
  /;|--|\/\*|\b(pragma|attach|insert|update|delete|drop|alter|create|load_extension|recursive)\b/i.test(sql)
)
  throw new Error('Single SELECT only');
const dir = dirname(fileURLToPath(import.meta.url));
const worker = new Worker(resolve(dir, 'query-worker.mjs'), {
  workerData: {
    path: resolve(dir, '../db/upswing-ro.db'),
    sql: `${sql} ${/\bLIMIT\s+\d+\s*$/i.test(sql) ? '' : 'LIMIT 500'}`,
  },
  resourceLimits: { maxOldGenerationSizeMb: 32 },
});
const timer = setTimeout(() => {
  void worker.terminate();
  process.exitCode = 1;
}, 1200);
worker.once('message', (value) => {
  clearTimeout(timer);
  console.log(JSON.stringify(value));
  void worker.terminate();
});
worker.once('error', () => {
  clearTimeout(timer);
  process.exitCode = 1;
});
