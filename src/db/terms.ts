import type { Point, Range, TermKind, TermOverview, TermTrend } from '../shared/types.js';
import type { DB } from './db.js';
import { DAY, HOUR } from '../metrics/config.js';
import { tokenize } from '../metrics/index.js';
import { CATALOG } from './seed.js';

export interface TermEvent {
  ts: number;
  channelId: string;
  gameId: string;
  gameName: string;
  channelName: string;
  title: string;
  tags: string[];
}
const LIMIT = 25_000;
const caches = new WeakMap<DB, Map<string, { time: number; value: TermOverview }>>();
export function invalidateTerms(db: DB) {
  caches.delete(db);
}
const windowDays = (range: Range) => (range === 'week' ? 7 : 30);

/** Count distinct channels with observed metadata updates; never infer unseen title usage. */
export function rollTermEvents(
  events: TermEvent[],
  kind: TermKind,
  range: Range,
  now: number,
  hours: number[],
  truncated = false,
): TermOverview {
  const days = windowDays(range),
    start = now - days * DAY,
    since = start - days * DAY;
  const covered = new Set(hours.filter((h) => h * HOUR >= since && h * HOUR < now));
  const coverage = (from: number, to: number) =>
    [...covered].filter((h) => h * HOUR >= from && h * HOUR < to).length / ((to - from) / HOUR);
  const currentCoverage = coverage(start, now),
    previousCoverage = coverage(since, start);
  const retainedFrom = truncated ? Math.floor(Math.min(...events.map((e) => e.ts)) / DAY) * DAY : -Infinity;
  type Group = {
    term: string;
    current: Set<string>;
    previous: Set<string>;
    daily: Map<number, Set<string>>;
    categories: Map<string, Set<string>>;
  };
  const groups = new Map<string, Group>();
  let limited = truncated;
  for (const e of events) {
    if (e.ts < since || e.ts >= now) continue;
    const values =
      kind === 'keyword'
        ? tokenize(e.title.slice(0, 500), e.gameName, e.channelName).slice(0, 70)
        : e.tags.slice(0, 25);
    for (const raw of new Set(values)) {
      const term = raw.normalize('NFKC').trim().slice(0, 60),
        key = term.toLocaleLowerCase();
      if (!key) continue;
      let group = groups.get(key);
      if (!group) {
        if (groups.size >= 5000) {
          limited = true;
          continue;
        }
        group = { term, current: new Set(), previous: new Set(), daily: new Map(), categories: new Map() };
        groups.set(key, group);
      }
      if (e.ts < start) {
        group.previous.add(e.channelId);
        continue;
      }
      group.current.add(e.channelId);
      const day = Math.floor(e.ts / DAY) * DAY;
      const daily = group.daily.get(day) ?? new Set<string>();
      daily.add(e.channelId);
      group.daily.set(day, daily);
      const category = group.categories.get(e.gameId) ?? new Set<string>();
      category.add(e.channelId);
      group.categories.set(e.gameId, category);
    }
  }
  const terms: TermTrend[] = [];
  for (const g of groups.values()) {
    if (Math.max(g.current.size, g.previous.size) < 15) continue;
    const points: Point[] = [];
    for (let day = Math.floor(start / DAY) * DAY; day < now; day += DAY) {
      points.push({
        ts: day,
        value: g.daily.get(day)?.size ?? 0,
        coverage: day <= retainedFrom ? 0 : coverage(Math.max(day, start), Math.min(day + DAY, now)),
      });
    }
    terms.push({
      term: g.term,
      channels: g.current.size,
      previousChannels: g.previous.size,
      deltaPct:
        !limited && currentCoverage >= 0.9 && previousCoverage >= 0.9 && g.previous.size >= 15
          ? g.current.size / g.previous.size - 1
          : null,
      points,
      categories: [...g.categories]
        .map(([gameId, channels]) => ({ gameId, channels: channels.size }))
        .sort((a, b) => b.channels - a.channels)
        .slice(0, 4),
    });
  }
  return {
    kind,
    range,
    source: 'live',
    terms: terms.sort((a, b) => b.channels - a.channels).slice(0, 24),
    coverage: currentCoverage,
    truncated: limited,
    basis:
      'Distinct channels with observed title/tag updates. Unchanged titles between observations are not inferred.' +
      (limited
        ? ' Input limit reached: counts describe a bounded candidate pool; incomplete days are hidden.'
        : ''),
  };
}

/** Nested synthetic channel cohorts make both window totals and daily counts reproducible. */
function demoTerms(kind: TermKind, range: Range, now: number): TermOverview {
  const names =
    kind === 'keyword'
      ? [
          'first playthrough',
          'drops',
          'cozy',
          'ranked',
          'halloween',
          'community',
          'no backseating',
          'challenge run',
        ]
      : ['English', 'DropsEnabled', 'Chill', 'Cozy', 'Horror', 'Competitive'];
  const days = windowDays(range);
  const terms = names.map((term, i): TermTrend => {
    const rate = i === 3 ? -0.1 : 0.12 + i * 0.045;
    const history: Point[] = Array.from({ length: 60 }, (_, day) => ({
      ts: now - (60 - day) * DAY,
      value: Math.max(
        15,
        Math.round(
          (95 + i * 24) *
            Math.exp((Math.log(1 + rate) * (day - 46)) / 7) *
            (1 + 0.1 * Math.sin(day * 0.9 + i)),
        ),
      ),
      coverage: 1,
    }));
    const points = history.slice(-days),
      previous = history.slice(-2 * days, -days);
    const channels = Math.max(...points.map((p) => p.value)),
      previousChannels = Math.max(...previous.map((p) => p.value));
    const categories = Array.from({ length: 4 }, (_, n) => ({
      gameId: CATALOG[(i + n * 3) % CATALOG.length].id,
      channels: Math.floor(channels / 4) + (n < channels % 4 ? 1 : 0),
    }));
    return {
      term,
      channels,
      previousChannels,
      deltaPct: channels / previousChannels - 1,
      points,
      categories,
    };
  });
  return {
    kind,
    range,
    source: 'synthetic',
    terms: terms.sort((a, b) => b.channels - a.channels),
    coverage: 1,
    truncated: false,
    basis:
      'Synthetic daily title/tag activity. Fictional channels and associations, not real Twitch observations.',
  };
}
export function termOverview(db: DB, kind: TermKind, range: Range, now: number, demo: boolean): TermOverview {
  const key = `${demo}:${kind}:${range}:${now}`,
    cache = caches.get(db) ?? new Map();
  const found = cache.get(key);
  if (found && Date.now() - found.time < 30_000) return found.value;
  const value = readTermOverview(db, kind, range, now, demo);
  if (cache.size > 8) cache.clear();
  cache.set(key, { time: Date.now(), value });
  caches.set(db, cache);
  return value;
}
function readTermOverview(db: DB, kind: TermKind, range: Range, now: number, demo: boolean): TermOverview {
  if (demo) return demoTerms(kind, range, now);
  const since = now - 2 * windowDays(range) * DAY;
  const rows = db
    .prepare(
      `SELECT m.ts,m.title,m.tags,m.game_id,s.channel_id,g.name game,c.name channel
    FROM stream_meta m JOIN streams s ON s.id=m.stream_id
    JOIN games g ON g.id=m.game_id JOIN channels c ON c.id=s.channel_id
    WHERE m.ts>=? AND m.ts<? AND s.channel_id NOT IN (SELECT channel_id FROM blocklist)
    ORDER BY m.ts DESC,m.stream_id LIMIT ?`,
    )
    .all(since, now, LIMIT + 1) as {
    ts: number;
    title: string;
    tags: string;
    game_id: string;
    channel_id: string;
    game: string;
    channel: string;
  }[];
  const hours = db
    .prepare(
      "SELECT DISTINCT CAST(ts / 3600000 AS INTEGER) hour FROM polls WHERE ts>=? AND ts<? AND errors='[]'",
    )
    .all(since, now) as { hour: number }[];
  return rollTermEvents(
    rows.slice(0, LIMIT).map((r) => {
      let tags: string[] = [];
      try {
        const parsed: unknown = JSON.parse(r.tags);
        if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === 'string');
      } catch {
        /* Ignore malformed tag metadata. */
      }
      return {
        ts: r.ts,
        title: r.title,
        tags,
        gameId: r.game_id,
        channelId: r.channel_id,
        gameName: r.game,
        channelName: r.channel,
      };
    }),
    kind,
    range,
    now,
    hours.map((h) => h.hour),
    rows.length > LIMIT,
  );
}
