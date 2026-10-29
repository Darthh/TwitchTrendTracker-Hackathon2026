import { parentPort, workerData } from 'node:worker_threads';
import Database from 'better-sqlite3';
try {
  const db = new Database(workerData.path, { readonly: true, fileMustExist: true });
  db.pragma('query_only = ON');
  const rows = db.prepare(workerData.sql).all();
  parentPort.postMessage({ rows });
  db.close();
} catch {
  parentPort.postMessage({ error: 'The query could not run against this snapshot.' });
}
