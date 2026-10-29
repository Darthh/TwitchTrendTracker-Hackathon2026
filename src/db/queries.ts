import type { DB } from './db.js';
import type { Dashboard, Game, Point, Range, Streamer } from '../shared/types.js';
import { breakout, compare, opportunity, quantile } from '../metrics/index.js';
import { DAY, HOUR } from '../metrics/config.js';
import { CATALOG, DEMO_NOW } from './seed.js';
type Hour = {
  hour: number;
  viewers: number;
  coverage: number;
  channels: number;
  peak: number;
  hours_watched: number;
  hours_streamed: number;
};
export function dashboard(db: DB, range: Range, demo: boolean, size = 50): Dashboard {
  const now = demo ? DEMO_NOW : Math.floor(Date.now() / HOUR) * HOUR;
  const since = now - (range === 'week' ? 14 : 60) * DAY;
  const all = db
    .prepare(
      'SELECT hour,SUM(viewers) viewers,MIN(coverage) coverage FROM game_hourly WHERE hour>=? GROUP BY hour ORDER BY hour',
    )
    .all(since) as { hour: number; viewers: number; coverage: number }[];
  const series = all.map((p) => ({ ts: p.hour, value: p.viewers, coverage: p.coverage }));
  const platform = compare(series, range, now);
  const catalog = db
    .prepare(
      'SELECT g.* FROM games g LEFT JOIN (SELECT game_id,AVG(viewers) v FROM game_hourly WHERE hour>=? GROUP BY game_id) h ON h.game_id=g.id ORDER BY COALESCE(h.v,0) DESC LIMIT 300',
    )
    .all(since) as {
    id: string;
    name: string;
    genre: string;
    release_date: number | null;
    first_seen: number;
  }[];
  const games: Game[] = catalog.map((g, i) => {
    const meta = CATALOG.find((c) => c.id === g.id),
      color = meta?.color ?? ['#c7a0ff', '#80c9d4', '#f7bf65'][i % 3];
    const rows = db
      .prepare('SELECT * FROM game_hourly WHERE game_id=? AND hour>=? ORDER BY hour')
      .all(g.id, since) as Hour[];
    const points: Point[] = rows.map((p) => ({ ts: p.hour, value: p.viewers, coverage: p.coverage }));
    const supply = rows.map((p) => ({ ts: p.hour, value: p.channels, coverage: p.coverage }));
    const metric = compare(points, range, now, platform.deltaPct ?? 0, 200);
    const scan = db
      .prepare('SELECT viewers_json FROM game_scan WHERE game_id=? ORDER BY hour DESC LIMIT 1')
      .get(g.id) as { viewers_json: string } | undefined;
    const viewers = scan ? (JSON.parse(scan.viewers_json) as number[]) : [];
    const total = viewers.reduce((s, v) => s + v, 0);
    const current = rows.filter((r) => r.hour >= now - (range === 'week' ? 7 : 30) * DAY && r.hour < now);
    const clip = db
      .prepare('SELECT top100_views FROM clip_weekly WHERE game_id=? ORDER BY week_start')
      .all(g.id) as { top100_views: number }[];
    return {
      ...g,
      color,
      art: meta?.art ?? 'crystal',
      ageDays: g.release_date ? Math.floor((now - g.release_date) / DAY) : null,
      metric,
      supplyMetric: compare(supply, range, now),
      series: points,
      channels: current.length
        ? current.reduce((s, p) => s + p.channels * p.coverage, 0) /
          current.reduce((s, p) => s + p.coverage, 0)
        : 0,
      tailVPC: quantile(viewers.slice(10), 0.5),
      top5Share: total ? viewers.slice(0, 5).reduce((s, v) => s + v, 0) / total : 0,
      hoursWatched: current.reduce((s, p) => s + p.hours_watched, 0),
      hoursStreamed: current.reduce((s, p) => s + p.hours_streamed, 0),
      clipBuzz: clip.map((c) => c.top100_views),
      viewers,
      opportunity: 0,
      opportunityReady: !!scan && !metric.insufficientData,
      rank: 0,
      breakdown: [],
    };
  });
  const scores = opportunity(
    games.map((g) => ({ ...g, relative: g.metric.relDeltaPct ?? 0 })),
    size,
  );
  games.forEach((g, i) => {
    g.opportunity = g.opportunityReady ? scores[i].score : 0;
    g.rank = g.opportunityReady ? scores[i].rank : 0;
    g.breakdown = g.opportunityReady ? scores[i].breakdown : [];
  });
  const channels = db
    .prepare(
      'SELECT * FROM channels WHERE id NOT IN (SELECT channel_id FROM blocklist) AND (id IN (SELECT id FROM accounts) OR id IN (SELECT channel_id FROM channel_hourly WHERE hour>=? GROUP BY channel_id HAVING AVG(viewers)>=50 ORDER BY SUM(CASE WHEN hour>=? THEN viewers*coverage ELSE 0 END)/NULLIF(SUM(CASE WHEN hour<? THEN viewers*coverage ELSE 0 END),0) DESC LIMIT 500))',
    )
    .all(since, now - (range === 'week' ? 7 : 30) * DAY, now - (range === 'week' ? 7 : 30) * DAY) as {
    id: string;
    login: string;
    name: string;
    language: string;
    created_at: number | null;
  }[];
  const streamers: Streamer[] = channels
    .map((c, i) => {
      const rows = db
        .prepare(
          'SELECT hour,SUM(viewers*coverage)/SUM(coverage) viewers,MIN(1,SUM(coverage)) coverage,MAX(peak) peak,game_id FROM channel_hourly WHERE channel_id=? AND hour>=? GROUP BY hour ORDER BY hour',
        )
        .all(c.id, since) as (Hour & { game_id: string })[];
      const points = rows.map((r) => ({ ts: r.hour, value: r.viewers, coverage: r.coverage }));
      const metric = compare(points, range, now, platform.deltaPct ?? 0, 0, series);
      const window = (range === 'week' ? 7 : 30) * DAY;
      const sessionCount = demo
        ? 5
        : (
            db
              .prepare(
                'SELECT COUNT(*) n FROM streams WHERE channel_id=? AND started_at < ? AND last_seen >= ?',
              )
              .get(c.id, now, now - window) as { n: number }
          ).n;
      const previousSessionCount = demo
        ? 5
        : (
            db
              .prepare(
                'SELECT COUNT(*) n FROM streams WHERE channel_id=? AND started_at < ? AND last_seen >= ?',
              )
              .get(c.id, now - window, now - 2 * window) as { n: number }
          ).n;
      if (metric.previous < 50 || sessionCount < 2 || previousSessionCount < 2) {
        metric.insufficientData = true;
        metric.deltaPct = null;
        metric.relDeltaPct = null;
        metric.confidence = 'low';
        metric.label = 'Needs a 50-viewer baseline and 2 sessions in each window';
      }
      const current = points.filter((p) => p.ts >= now - (range === 'week' ? 7 : 30) * DAY);
      return {
        ...c,
        gameId: rows.at(-1)?.game_id ?? '',
        color: ['#c7a0ff', '#86cf82', '#f7bf65', '#73bdff', '#e79bda'][i % 5],
        metric,
        series: points,
        peak: Math.max(0, ...rows.map((r) => r.peak)),
        sessions: sessionCount,
        consistency: current.length
          ? current.filter((p) => p.value > metric.previous).length / current.length
          : 0,
        breakout: breakout(metric.value, metric.previous, sessionCount),
        ageDays: c.created_at ? Math.floor((now - c.created_at) / DAY) : 0,
        latestViewers: (
          db
            .prepare(
              'SELECT viewers FROM watched_samples WHERE channel_id=? AND ts>? ORDER BY ts DESC LIMIT 1',
            )
            .get(c.id, Date.now() - 300000) as { viewers: number } | undefined
        )?.viewers,
        live: demo
          ? i < 9
          : !!db.prepare('SELECT id FROM streams WHERE channel_id=? AND ended_at IS NULL LIMIT 1').get(c.id),
      };
    })
    .sort((a, b) => (b.metric.deltaPct ?? -Infinity) - (a.metric.deltaPct ?? -Infinity));
  const keywordRows = db
    .prepare('SELECT keyword, channels FROM keyword_weekly ORDER BY week DESC LIMIT 20')
    .all() as { keyword: string; channels: number }[];
  const keywords = demo
    ? [
        'first playthrough',
        'drops',
        'cozy',
        'ranked',
        'halloween',
        'community',
        'no backseating',
        'challenge run',
      ].map((word, i) => ({
        word,
        channels: 342 - i * 31,
        previousChannels: 167 - i * 12,
        lift: 1.64 - i * 0.065,
        iqr: [1.12, 1.9] as [number, number],
        series: [20, 24 + i, 29, 26, 38, 44 + i, 57, 64],
      }))
    : keywordRows.map((k) => ({
        word: k.keyword,
        channels: k.channels,
        previousChannels: 0,
        lift: 0,
        iqr: [0, 0] as [number, number],
        series: [],
      }));
  const firstPoll = db.prepare('SELECT MIN(ts) first, MAX(ts) last, COUNT(*) n FROM polls').get() as {
    first: number | null;
    last: number | null;
    n: number;
  };
  return {
    range,
    source: demo ? 'synthetic' : 'live',
    now,
    start: firstPoll.first ?? now,
    daysTracked: firstPoll.first ? (now - firstPoll.first) / DAY : 0,
    platform,
    platformSeries: series,
    games: games.sort((a, b) => b.metric.value - a.metric.value),
    streamers,
    keywords,
    polls: firstPoll.n,
    latestPoll: firstPoll.last,
    coverage: platform.coverage,
    replay: demo,
  };
}
