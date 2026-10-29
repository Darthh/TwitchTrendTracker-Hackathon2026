import { describe, expect, it } from 'vitest';
import {
  breakout,
  compare,
  detectRaid,
  keywordLift,
  opportunity,
  quantile,
  sessionMean,
  sizeTier,
  tokenize,
} from './index.js';
import { DAY, HOUR } from './config.js';
import type { Point } from '../shared/types.js';
const end = Date.UTC(2026, 9, 28);
const fixture = (days: number, fn: (h: number) => number): Point[] =>
  Array.from({ length: days * 24 }, (_, h) => ({
    ts: end - days * DAY + h * HOUR,
    value: fn(h),
    coverage: 1,
  }));
describe('covered Week / Month comparisons', () => {
  it('calculates full weeks, absolute change and platform-relative delta', () => {
    const m = compare(
      fixture(14, (h) => (h < 168 ? 1000 : 1500)),
      'week',
      end,
      0.1,
      200,
    );
    expect(m.comparison).toBe('full');
    expect(m.value).toBe(1500);
    expect(m.previous).toBe(1000);
    expect(m.deltaAbs).toBe(500);
    expect(m.deltaPct).toBe(0.5);
    expect(m.relDeltaPct).toBeCloseTo(1.5 / 1.1 - 1);
    expect(m.confidence).toBe('high');
  });
  it('does not flag the daily or weekly audience cycle as growth', () => {
    const m = compare(
      fixture(
        14,
        (h) =>
          2000 +
          500 * Math.sin(((h % 24) / 24) * Math.PI * 2) +
          200 * Math.cos(((h % 168) / 168) * Math.PI * 2),
      ),
      'week',
      end,
    );
    expect(m.deltaPct).toBeCloseTo(0, 10);
  });
  it('uses distinct complete days for partial week with an honest label', () => {
    const m = compare(
      fixture(4, (h) => (h < 24 ? 1000 : 1340)),
      'week',
      end,
    );
    expect(m.comparison).toBe('partial');
    expect(m.deltaPct).toBeCloseTo(0.34);
    expect(m.label).toMatch(/vs Sat \(4.0 days tracked\)/);
  });
  it('uses last and first tracked week for partial Month', () => {
    const m = compare(
      fixture(20, (h) => (h < 168 ? 1000 : 1200)),
      'month',
      end,
    );
    expect(m.comparison).toBe('partial');
    expect(m.deltaPct).toBeCloseTo(0.2);
    expect(m.label).toContain('vs first week tracked');
  });
  it('refuses overlapping partial windows and insufficient support', () => {
    expect(
      compare(
        fixture(1, () => 1000),
        'week',
        end,
      ).insufficientData,
    ).toBe(true);
    expect(
      compare(
        fixture(8, () => 1000),
        'month',
        end,
      ).deltaPct,
    ).toBeNull();
    expect(
      compare(
        fixture(14, (h) => (h < 168 ? 10 : 1000)),
        'week',
        end,
        0,
        200,
      ).deltaPct,
    ).toBeNull();
  });
  it('weights observations by coverage and does not silently fill gaps', () => {
    const rows = fixture(14, () => 1000);
    rows[0].value = 3000;
    rows[0].coverage = 0.5;
    const m = compare(rows, 'week', end);
    expect(m.previous).toBeCloseTo((167000 + 1500) / 167.5);
    expect(
      compare(
        rows.filter((_, i) => i % 2),
        'week',
        end,
      ).insufficientData,
    ).toBe(true);
  });
  it('requires a nonzero previous baseline', () =>
    expect(
      compare(
        fixture(14, (h) => (h < 168 ? 0 : 100)),
        'week',
        end,
      ).deltaPct,
    ).toBeNull());
});
describe('streamer statistics and title features', () => {
  it('uses poll coverage for a part-time streamer and averages only covered stream hours', () => {
    const timeline = fixture(14, () => 1000);
    const live = timeline.filter((_, h) => h % 24 < 4).map((p, i) => ({ ...p, value: i < 28 ? 100 : 150 }));
    const result = compare(live, 'week', end, 0, 50, timeline);
    expect(result.comparison).toBe('full');
    expect(result.value).toBe(150);
    expect(result.previous).toBe(100);
    expect(result.deltaPct).toBe(0.5);
  });
  it('weights samples by time and caps uncovered gaps', () => {
    const value = sessionMean(
      [
        { ts: 0, viewers: 100 },
        { ts: HOUR / 6, viewers: 300 },
      ],
      HOUR / 2,
    );
    expect(value.average).toBe(200);
    expect(value.hours).toBeCloseTo(1 / 3);
  });
  it('detects raid patterns and requires a continuous retention interval', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ ts: i * 10 * 60_000, viewers: i ? 250 : 100 }));
    expect(detectRaid(rows, 100)[0].label).toBe('retained raid');
    expect(detectRaid([rows[0], rows[1], rows[4]], 100)[0].label).toBe('spike: likely raid/host');
  });
  it('computes breakout score with sample safeguards and baseline tiers', () => {
    expect(breakout(400, 100, 3)).toBe(2);
    expect(breakout(400, 100, 2)).toBeCloseTo(4 / 3);
    expect(breakout(400, 10, 3)).toBe(0);
    expect(sizeTier(90)).toBe('<100');
    expect(sizeTier(100)).toBe('100–999');
    expect(sizeTier(10000)).toBe('10k+');
  });
  it('keeps multilingual words, emojis, commands and bigrams while dropping own names', () => {
    const tokens = tokenize('The Minecraft with CozyByte !drops 🎮 rápido 日本語', 'Minecraft', 'CozyByte');
    expect(tokens).toContain('!drops');
    expect(tokens).toContain('🎮');
    expect(tokens).toContain('rápido');
    expect(tokens).toContain('日本語');
    expect(tokens).toContain('!drops 🎮');
    expect(tokens).not.toContain('minecraft');
    expect(tokens).not.toContain('the');
  });
  it('requires fifteen channels and uses median-based lift and IQR', () => {
    expect(keywordLift([1, 2, 3], [1, 1, 1], 15).lift).toBe(2);
    expect(keywordLift([2], [1], 14).lift).toBeNull();
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75);
  });
});
describe('size-aware opportunity', () => {
  it('calculates exact estimated rank and weighted percentile breakdown', () => {
    const results = opportunity(
      [
        { viewers: [200, 80, 30], relative: 0.5, tailVPC: 20, top5Share: 0.1 },
        { viewers: [500, 300, 200], relative: 0, tailVPC: 5, top5Share: 0.8 },
      ],
      50,
    );
    expect(results[0].rank).toBe(3);
    expect(results[0].score).toBe(100);
    expect(results[1].score).toBe(0);
    expect(results[0].breakdown.reduce((s, x) => s + x.weight, 0)).toBe(1);
  });
  it('does not manufacture a tie advantage', () => {
    const one = { viewers: [100, 40], relative: 0.1, tailVPC: 10, top5Share: 0.2 };
    expect(opportunity([one, one], 50).map((x) => x.score)).toEqual([50, 50]);
  });
});
