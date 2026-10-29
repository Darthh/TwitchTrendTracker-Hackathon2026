import type { Metric } from '../../src/shared/types';
export const compact = (v: number, digits = 1) =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: digits }).format(v);
export const percent = (v: number | null, digits = 1) =>
  v === null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(digits)}%`;
export const absolute = (v: number) => `${v >= 0 ? '+' : '−'}${compact(Math.abs(v))}`;
export const metricText = (m: Metric) =>
  m.insufficientData
    ? m.label
    : `${m.deltaAbs >= 0 ? 'Up' : 'Down'} ${Math.abs((m.deltaPct ?? 0) * 100).toFixed(1)}% ${m.label}`;
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    path,
    body === undefined
      ? {}
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Could not load data. Try again.');
  return data as T;
}
