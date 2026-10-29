import { Worker } from 'node:worker_threads';
import { resolve } from 'node:path';
import type { Finding } from '../shared/types.js';
import { guardSql } from './sql.js';
export async function querySnapshot(
  sql: string,
  path = resolve('analyst/db/upswing-ro.db'),
  timeout = 1200,
): Promise<Record<string, unknown>[]> {
  const guarded = guardSql(sql);
  return new Promise((resolveQuery, reject) => {
    const worker = new Worker(resolve('analyst/scripts/query-worker.mjs'), {
      workerData: { sql: guarded, path },
      resourceLimits: { maxOldGenerationSizeMb: 32 },
    });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error('Query exceeded the time limit.'));
    }, timeout);
    worker.once('message', (result: { rows?: Record<string, unknown>[]; error?: string }) => {
      clearTimeout(timer);
      void worker.terminate();
      if (result.error) reject(new Error(result.error));
      else resolveQuery(result.rows ?? []);
    });
    worker.once('error', () => {
      clearTimeout(timer);
      reject(new Error('Query worker failed.'));
    });
    worker.once('exit', (code) => {
      if (code !== 0) {
        clearTimeout(timer);
        reject(new Error('Query worker stopped.'));
      }
    });
  });
}
export function matchesNumbers(finding: Finding, rows: Record<string, unknown>[], tolerance = 0.005) {
  if (!Object.keys(finding.numbers).length || !rows.length) return false;
  return Object.entries(finding.numbers).every(([key, expected]) => {
    const actual = rows[0][key];
    return (
      typeof actual === 'number' &&
      Number.isFinite(expected) &&
      Math.abs(actual - expected) <= Math.max(0.01, Math.abs(actual) * tolerance)
    );
  });
}
export async function verifyFindings(findings: Finding[]) {
  const verified: Finding[] = [];
  let failed = 0;
  for (const finding of findings) {
    try {
      if (matchesNumbers(finding, await querySnapshot(finding.sql))) verified.push(finding);
      else failed++;
    } catch {
      failed++;
    }
  }
  return { verified, failed };
}
