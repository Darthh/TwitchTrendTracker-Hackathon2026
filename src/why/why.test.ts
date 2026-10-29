import { expect, it } from 'vitest';
import { conserveFlows, decompose, detectDrivers, leaveOneOut } from './index.js';
it('supply + demand equals the exact total log change', () => {
  const d = decompose(100000, 124000, 4000, 4800)!;
  expect(d.supply + d.demand).toBeCloseTo(d.total, 12);
  expect(d.total).toBeCloseTo(Math.log(1.24));
  expect(decompose(0, 100, 50, 60)).toBeNull();
});
it('computes leave-one-out without dividing by zero', () => {
  expect(leaveOneOut(1000, 1500, 300, 800)).toBe(0);
  expect(leaveOneOut(100, 100, 100, 100)).toBeNull();
});
it('conserves moved hours in the flow matrix and excludes same-category hours', () => {
  const f = conserveFlows([
    { channel: 'a', from: 'A', to: 'B', hours: 10 },
    { channel: 'b', from: 'A', to: 'B', hours: 20 },
    { channel: 'c', from: 'B', to: 'C', hours: 5 },
    { channel: 'd', from: 'A', to: 'A', hours: 9 },
  ]);
  expect(f.reduce((s, x) => s + x.value, 0)).toBe(35);
  expect(f[0].value).toBe(30);
});
it.each([
  [{ releaseDays: 7 }, 'new_release'],
  [{ dropsChange: 0.2 }, 'drops_started'],
  [{ dropsChange: -0.2 }, 'drops_ended'],
  [{ eventChange: 0.2 }, 'event'],
  [{ eventChange: -0.2 }, 'post_event'],
  [{ updateChange: 0.2 }, 'update_or_season'],
  [{ clipRatio: 3 }, 'viral_clips'],
  [{ movedIn: 1 }, 'streamer_moved_in'],
  [{ movedOut: 1 }, 'streamer_moved_out'],
  [{ scheduleChange: -0.5 }, 'streamer_schedule'],
] as const)('fires evidence-based drivers on their fixtures: %s', (signal, type) =>
  expect(detectDrivers({ delta: 0.5, platform: 0.1, ...signal })).toContain(type),
);
it('identifies the platform effect and returns unknown on noise', () => {
  expect(detectDrivers({ delta: 0.12, platform: 0.11 })).toEqual(['platform_wide']);
  expect(detectDrivers({ delta: 0.07, platform: 0.01 })).toEqual(['unknown']);
});
