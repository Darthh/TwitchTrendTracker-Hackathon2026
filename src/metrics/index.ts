import type { Metric, Point, Range } from '../shared/types.js';
import { DAY, HOUR, MIN_COVERAGE, OPPORTUNITY_WEIGHTS } from './config.js';
export function weightedMean(points: Point[]) {
  const weight = points.reduce((s, p) => s + p.coverage, 0);
  return weight ? points.reduce((s, p) => s + p.value * p.coverage, 0) / weight : 0;
}
export function compare(
  points: Point[],
  range: Range,
  now: number,
  platformDelta = 0,
  min = 0,
  coveragePoints: Point[] = points,
): Metric {
  const end = Math.floor(now / HOUR) * HOUR;
  const width = (range === 'week' ? 7 : 30) * DAY;
  const pick = (a: number, b: number) => points.filter((p) => p.ts >= a && p.ts < b);
  const covered = (a: number, b: number) => coveragePoints.filter((p) => p.ts >= a && p.ts < b);
  let current = pick(end - width, end),
    previous = pick(end - 2 * width, end - width);
  const observedCurrent = weightedMean(current);
  const coverageOf = (p: Point[], hours: number) =>
    Math.min(1, p.reduce((s, x) => s + x.coverage, 0) / hours);
  let coverage = Math.min(
    coverageOf(covered(end - width, end), width / HOUR),
    coverageOf(covered(end - 2 * width, end - width), width / HOUR),
  );
  const comparison: 'full' | 'partial' = coverage >= MIN_COVERAGE ? 'full' : 'partial';
  let label = range === 'week' ? 'vs previous week' : 'vs previous month';
  if (comparison === 'partial') {
    const available = covered(end - width, end).sort((a, b) => a.ts - b.ts);
    const first = available[0]?.ts ?? end;
    const span = (end - first) / DAY;
    const block = range === 'month' ? 7 * DAY : DAY;
    const lastEnd = Math.floor(end / DAY) * DAY;
    const lastStart = lastEnd - block;
    let firstStart = Math.ceil(first / DAY) * DAY;
    if (range === 'week') {
      const candidates: number[] = [];
      for (let t = firstStart; t + block <= lastStart; t += DAY) {
        if (coverageOf(covered(t, t + block), block / HOUR) >= MIN_COVERAGE) candidates.push(t);
      }
      firstStart =
        candidates.find((t) => new Date(t).getUTCDay() === new Date(lastStart).getUTCDay()) ??
        candidates[0] ??
        end;
    }
    current = pick(lastStart, lastEnd);
    previous = firstStart + block <= lastStart ? pick(firstStart, firstStart + block) : [];
    coverage = Math.min(
      coverageOf(covered(lastStart, lastEnd), block / HOUR),
      firstStart + block <= lastStart ? coverageOf(covered(firstStart, firstStart + block), block / HOUR) : 0,
    );
    const day = new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(firstStart);
    label =
      range === 'month'
        ? `vs first week tracked (${span.toFixed(1)} days tracked)`
        : `vs ${day} (${span.toFixed(1)} days tracked)`;
  }
  const value = current.length ? weightedMean(current) : observedCurrent,
    prev = weightedMean(previous);
  const insufficientData =
    coverage < MIN_COVERAGE || !previous.length || prev <= 0 || prev < min || value < min;
  const deltaPct = insufficientData ? null : value / prev - 1;
  if (insufficientData)
    label = `Needs more history (${((end - (points[0]?.ts ?? end)) / DAY).toFixed(1)} days tracked)`;
  return {
    value,
    previous: prev,
    deltaAbs: value - prev,
    deltaPct,
    relDeltaPct: deltaPct === null ? null : (1 + deltaPct) / (1 + platformDelta) - 1,
    comparison,
    coverage,
    n: current.length + previous.length,
    confidence: insufficientData ? 'low' : comparison === 'full' ? 'high' : 'medium',
    insufficientData,
    label,
  };
}
export function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b),
    i = (sorted.length - 1) * q;
  return sorted[Math.floor(i)] + (sorted[Math.ceil(i)] - sorted[Math.floor(i)]) * (i % 1);
}
export function percentile(value: number, values: number[]) {
  if (values.length < 2) return 0.5;
  const less = values.filter((x) => x < value).length,
    equal = values.filter((x) => x === value).length;
  return (less + (equal - 1) / 2) / (values.length - 1);
}
export function opportunity(
  items: { viewers: number[]; relative: number; tailVPC: number; top5Share: number }[],
  size: number,
) {
  const ranks = items.map((g) => 1 + g.viewers.filter((v) => v > size).length);
  return items.map((g, i) => {
    const values = [
      1 - percentile(ranks[i], ranks),
      percentile(
        g.relative,
        items.map((x) => x.relative),
      ),
      percentile(
        g.tailVPC,
        items.map((x) => x.tailVPC),
      ),
      1 -
        percentile(
          g.top5Share,
          items.map((x) => x.top5Share),
        ),
    ];
    return {
      rank: ranks[i],
      page: Math.ceil(ranks[i] / 20),
      score: Math.round(100 * values.reduce((s, v, j) => s + v * OPPORTUNITY_WEIGHTS[j], 0)),
      breakdown: ['Discoverability', 'Relative growth', 'Small-channel demand', 'Audience distribution'].map(
        (label, j) => ({ label, value: values[j], weight: OPPORTUNITY_WEIGHTS[j] }),
      ),
    };
  });
}
export function sessionMean(samples: { ts: number; viewers: number }[], end: number, maxGap = 10 * 60_000) {
  let area = 0,
    duration = 0;
  const rows = [...samples].sort((a, b) => a.ts - b.ts);
  rows.forEach((p, i) => {
    const dt = Math.max(0, Math.min((rows[i + 1]?.ts ?? end) - p.ts, maxGap));
    area += p.viewers * dt;
    duration += dt;
  });
  return { average: duration ? area / duration : 0, hours: duration / HOUR, hoursWatched: area / HOUR };
}
export function breakout(current: number, previous: number, sessions: number) {
  return current >= 100 && previous >= 50 && sessions >= 2
    ? Math.log2(current / previous) * Math.min(1, sessions / 3)
    : 0;
}
export function sizeTier(previous: number) {
  return previous < 100 ? '<100' : previous < 1000 ? '100–999' : previous < 10_000 ? '1k–9.9k' : '10k+';
}
export function detectRaid(samples: { ts: number; viewers: number }[], baseline: number) {
  return samples.flatMap((p, i) => {
    if (!i || p.viewers - samples[i - 1].viewers < 100 || p.viewers < samples[i - 1].viewers * 1.4) return [];
    const after = samples.filter((x) => x.ts >= p.ts && x.ts <= p.ts + 30 * 60_000);
    const continuous = after.every((x, j) => !j || x.ts - after[j - 1].ts <= 10 * 60_000);
    const retained =
      continuous &&
      (after.at(-1)?.ts ?? 0) >= p.ts + 30 * 60_000 &&
      after.every((x) => x.viewers >= baseline * 1.3);
    return [{ ts: p.ts, label: retained ? 'retained raid' : 'spike: likely raid/host' }];
  });
}
const stopwords = new Set(
  'the a an and or for with to in of on is my you your en el la de con los las y para un una o der die das und mit ein le les et des du avec il lo di e per da do os as em com na no は の に を が と です'.split(
    ' ',
  ),
);
export function tokenize(title: string, game = '', channel = '') {
  const excluded = new Set(`${game} ${channel}`.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  const words = (title.toLocaleLowerCase().match(/!?[\p{L}\p{N}]+|\p{Extended_Pictographic}/gu) ?? []).filter(
    (w) => !stopwords.has(w) && !excluded.has(w),
  );
  return [...new Set([...words, ...words.slice(1).map((w, i) => `${words[i]} ${w}`)])];
}
export function keywordLift(withKeyword: number[], without: number[], distinctChannels: number) {
  const baseline = quantile(without, 0.5);
  return {
    lift: distinctChannels >= 15 && baseline > 0 ? quantile(withKeyword, 0.5) / baseline : null,
    iqr: [quantile(withKeyword, 0.25), quantile(withKeyword, 0.75)],
    n: distinctChannels,
  };
}
export function downsample(points: Point[], max = 1000) {
  if (points.length <= max) return points;
  const size = Math.ceil(points.length / max),
    output: Point[] = [];
  for (let i = 0; i < points.length; i += size) {
    const group = points.slice(i, i + size);
    output.push({
      ts: group[0].ts,
      value: weightedMean(group),
      coverage: group.reduce((s, p) => s + p.coverage, 0) / group.length,
    });
  }
  return output;
}
