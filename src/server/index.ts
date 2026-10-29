import { openDb } from '../db/db.js';
import { createApp } from './app.js';
import { config } from './config.js';
const demo = process.argv.includes('--demo'),
  db = openDb(demo ? 'data/demo.db' : undefined);
const app = await createApp(db, { demo, dev: process.argv.includes('--dev'), worker: true });
await app.listen({ port: config.PORT, host: config.HOST });
console.log(`Upswing: ${config.PUBLIC_URL} (${demo ? 'synthetic sample demo' : 'live mode'})`);
let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
