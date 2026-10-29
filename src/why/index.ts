import type { Dashboard, Game, WhyReport } from '../shared/types.js';
export function decompose(previousHW: number, currentHW: number, previousHS: number, currentHS: number) {
  if ([previousHW, currentHW, previousHS, currentHS].some((v) => v <= 0)) return null;
  return {
    supply: Math.log(currentHS / previousHS),
    demand: Math.log(currentHW / currentHS / (previousHW / previousHS)),
    total: Math.log(currentHW / previousHW),
  };
}
export function leaveOneOut(
  previous: number,
  current: number,
  contributorPrevious: number,
  contributorCurrent: number,
) {
  const base = previous - contributorPrevious;
  return base > 0 ? (current - contributorCurrent) / base - 1 : null;
}
export function conserveFlows(rows: { channel: string; from: string; to: string; hours: number }[]) {
  const flows = new Map<string, { source: string; target: string; value: number }>();
  rows
    .filter((x) => x.hours > 0 && x.from !== x.to)
    .forEach((x) => {
      const k = `${x.from}\0${x.to}`;
      const f = flows.get(k) ?? { source: x.from, target: x.to, value: 0 };
      f.value += x.hours;
      flows.set(k, f);
    });
  return [...flows.values()];
}
export function detectDrivers(s: {
  delta: number;
  platform: number;
  dropsChange?: number;
  releaseDays?: number;
  eventChange?: number;
  updateChange?: number;
  clipRatio?: number;
  movedIn?: number;
  movedOut?: number;
  scheduleChange?: number;
}) {
  const types: string[] = [];
  if (s.releaseDays !== undefined && Math.abs(s.releaseDays) <= 14) types.push('new_release');
  if (Math.abs(s.dropsChange ?? 0) >= 0.1)
    types.push((s.dropsChange ?? 0) > 0 ? 'drops_started' : 'drops_ended');
  if (Math.abs(s.eventChange ?? 0) >= 0.1) types.push((s.eventChange ?? 0) > 0 ? 'event' : 'post_event');
  if ((s.updateChange ?? 0) >= 0.1) types.push('update_or_season');
  if ((s.clipRatio ?? 0) >= 2) types.push('viral_clips');
  if ((s.movedIn ?? 0) > 0) types.push('streamer_moved_in');
  if ((s.movedOut ?? 0) > 0) types.push('streamer_moved_out');
  if (Math.abs(s.scheduleChange ?? 0) >= 0.25) types.push('streamer_schedule');
  if (Math.abs(s.delta - s.platform) < 0.03 && Math.abs(s.delta) > 0.02) types.push('platform_wide');
  return types.length ? types : ['unknown'];
}
export function explain(game: Game, data: Dashboard): WhyReport {
  const m = game.metric,
    delta = m.deltaPct ?? 0;
  const contributors = data.streamers
    .filter((s) => s.gameId === game.id)
    .map((s) => ({
      name: s.name,
      previous: s.metric.previous,
      current: s.metric.value,
      change: s.metric.deltaAbs,
      kind:
        s.metric.previous === 0
          ? 'joined'
          : s.metric.value === 0
            ? 'left'
            : s.metric.deltaAbs >= 0
              ? 'grew'
              : 'shrank',
    }))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  // Only calculate supply/demand when both windows have measured hours.
  const complete = !m.insufficientData && !game.supplyMetric.insufficientData;
  // Dashboard carries observed supply in its window summaries; no invented attribution.
  const types = detectDrivers({
    delta,
    platform: data.platform.deltaPct ?? 0,
    releaseDays: game.ageDays ?? undefined,
    clipRatio:
      game.clipBuzz.length > 1
        ? game.clipBuzz.at(-1)! /
          (game.clipBuzz.slice(0, -1).reduce((s, x) => s + x, 0) / (game.clipBuzz.length - 1) || Infinity)
        : undefined,
  });
  return {
    gameId: game.id,
    range: data.range,
    direction: delta > 0.02 ? 'up' : delta < -0.02 ? 'down' : 'flat',
    headline: m.insufficientData
      ? `${game.name} needs more history`
      : `${game.name} is ${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta * 100).toFixed(1)}%`,
    summary: m.insufficientData
      ? m.label
      : `${Math.round(m.deltaAbs).toLocaleString('en-US')} average viewers ${delta >= 0 ? 'gained' : 'lost'} ${m.label}. Sampled Twitch changed ${((data.platform.deltaPct ?? 0) * 100).toFixed(1)}%. The data shows association; it does not establish why people watched.`,
    drivers: types.map((type) => ({
      type,
      evidence:
        type === 'unknown'
          ? [{ label: 'No supported driver detected', value: 'More context needed' }]
          : type === 'new_release'
            ? [{ label: 'Days since release (fixture in demo)', value: game.ageDays ?? 0 }]
            : [{ label: 'Measured window change', value: delta }],
    })),
    decomposition: complete
      ? decompose(m.previous, m.value, game.supplyMetric.previous, game.supplyMetric.value)
      : null,
    contributors,
    flows: [],
    confidence: m.confidence,
    generatedBy: 'rules',
    verified: true,
  };
}
