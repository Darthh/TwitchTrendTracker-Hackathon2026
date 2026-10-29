import { describe, it, expect } from 'vitest';
import { rollTermEvents, termOverview, invalidateTerms, type TermEvent } from './terms.js';
import { DAY, HOUR } from '../metrics/config.js';
import { openDb } from './db.js';
import { categoryArtwork } from '../shared/category-artwork.js';
const now = Date.UTC(2026, 9, 28);
const hours = Array.from({ length: 14 * 24 }, (_, i) => (now - 14 * DAY) / HOUR + i);
const event = (id: number, ago: number): TermEvent => ({
  ts: now - ago * DAY,
  channelId: `ch${id}`,
  gameId: 'game',
  gameName: 'Minecraft',
  channelName: `streamer${id}`,
  title: 'Cozy Minecraft cozy',
  tags: ['English', 'English'],
});
describe('title and tag trend observations', () => {
  it('deduplicates channels across updates, counts windows separately, and keeps category counts', () => {
    const rows = [
      ...Array.from({ length: 15 }, (_, i) => event(i, 9)),
      ...Array.from({ length: 30 }, (_, i) => event(i, 2)),
      event(0, 2),
      event(1, 1),
    ];
    const result = rollTermEvents(rows, 'keyword', 'week', now, hours);
    const cozy = result.terms.find((t) => t.term === 'cozy')!;
    expect(cozy.channels).toBe(30);
    expect(cozy.previousChannels).toBe(15);
    expect(cozy.deltaPct).toBe(1);
    expect(cozy.categories).toEqual([{ gameId: 'game', channels: 30 }]);
    expect(cozy.points.find((p) => p.ts === now - 2 * DAY)?.value).toBe(30);
    expect(result.terms.some((t) => t.term.includes('minecraft'))).toBe(false);
  });
  it('separates tags from title tokens and ignores future/out-of-window events', () => {
    const rows = [...Array.from({ length: 15 }, (_, i) => event(i, 1)), event(98, 0), event(99, 20)];
    const result = rollTermEvents(rows, 'tag', 'week', now, hours);
    expect(result.terms.map((t) => t.term)).toEqual(['English']);
    expect(result.terms[0].channels).toBe(15);
  });
  it('withholds unsupported, incompletely covered, and truncated comparisons', () => {
    const rows = [
      ...Array.from({ length: 15 }, (_, i) => event(i, 9)),
      ...Array.from({ length: 20 }, (_, i) => event(i, 1)),
    ];
    expect(rollTermEvents(rows, 'keyword', 'week', now, []).terms[0].deltaPct).toBeNull();
    expect(rollTermEvents(rows, 'keyword', 'week', now, hours, true).terms[0].deltaPct).toBeNull();
    const clipped = rollTermEvents(
      rows.filter((e) => e.ts >= now - DAY),
      'keyword',
      'week',
      now,
      hours,
      true,
    );
    expect(clipped.terms[0].points.at(-1)?.coverage).toBe(0);
    expect(
      rollTermEvents(
        Array.from({ length: 5001 }, (_, i) => ({ ...event(i, 1), tags: [`unique-${i}`] })),
        'tag',
        'week',
        now,
        hours,
      ).truncated,
    ).toBe(true);
    expect(rollTermEvents([event(0, 1)], 'keyword', 'week', now, hours).terms).toEqual([]);
    expect(
      rollTermEvents(rows, 'keyword', 'week', now, []).terms[0].points.every((p) => p.coverage === 0),
    ).toBe(true);
  });
  it('demo history and comparisons change with range and preserve explicit synthetic source', () => {
    const db = openDb(':memory:');
    try {
      const week = termOverview(db, 'keyword', 'week', now, true),
        month = termOverview(db, 'keyword', 'month', now, true);
      const w = week.terms.find((t) => t.term === 'cozy')!,
        m = month.terms.find((t) => t.term === 'cozy')!;
      expect(week.source).toBe('synthetic');
      expect(w.points).toHaveLength(7);
      expect(m.points).toHaveLength(30);
      expect(w.deltaPct).not.toBe(m.deltaPct);
      expect(w.channels).toBe(Math.max(...w.points.map((p) => p.value)));
      expect(termOverview(db, 'tag', 'week', now, true).terms.some((t) => t.term === 'English')).toBe(true);
      expect(termOverview(db, 'tag', 'week', now, false).terms).toEqual([]);
    } finally {
      db.close();
    }
  });
  it('live queries exclude opted-out channels and ignore malformed tag metadata', () => {
    const db = openDb(':memory:');
    try {
      db.prepare('INSERT INTO games(id,name,first_seen) VALUES(?,?,?)').run(
        'game',
        'Minecraft',
        now - 20 * DAY,
      );
      for (let i = 0; i < 16; i++) {
        db.prepare('INSERT INTO channels(id,login,name,language,first_seen) VALUES(?,?,?,?,?)').run(
          `ch${i}`,
          `user${i}`,
          `user${i}`,
          'en',
          now - 20 * DAY,
        );
        db.prepare('INSERT INTO streams(id,channel_id,started_at,last_seen) VALUES(?,?,?,?)').run(
          `s${i}`,
          `ch${i}`,
          now - 2 * DAY,
          now - DAY,
        );
        db.prepare('INSERT INTO stream_meta VALUES(?,?,?,?,?)').run(
          `s${i}`,
          now - DAY,
          'game',
          'Cozy Minecraft',
          i === 0 ? 'bad json' : '["English"]',
        );
      }
      db.prepare('INSERT INTO blocklist VALUES(?,?)').run('ch15', now);
      expect(
        termOverview(db, 'keyword', 'week', now, false).terms.find((t) => t.term === 'cozy')?.channels,
      ).toBe(15);
      expect(termOverview(db, 'tag', 'week', now, false).terms).toEqual([]);
      db.prepare('INSERT INTO blocklist VALUES(?,?)').run('ch14', now);
      invalidateTerms(db);
      expect(termOverview(db, 'keyword', 'week', now, false).terms).toEqual([]);
    } finally {
      db.close();
    }
  });
});
describe('official category artwork', () => {
  it('uses verified name mappings rather than assuming synthetic IDs match Twitch', () => {
    expect(categoryArtwork('Dead by Daylight')).toContain('/491487-');
    expect(categoryArtwork('Minecraft')).toContain('/27471_IGDB-');
    expect(categoryArtwork('Uncollected category')).toBeNull();
  });
  it('normalizes Helix dimensions and rejects external or credential-bearing URLs', () => {
    expect(categoryArtwork('Other', 'https://static-cdn.jtvnw.net/ttv-boxart/123-{width}x{height}.jpg')).toBe(
      'https://static-cdn.jtvnw.net/ttv-boxart/123-285x380.jpg',
    );
    for (const url of [
      'javascript:alert(1)',
      'https://evil.example/art.jpg',
      'https://static-cdn.jtvnw.net.evil.example/ttv-boxart/1-2x3.jpg',
      'https://user:pass@static-cdn.jtvnw.net/ttv-boxart/1-2x3.jpg',
    ])
      expect(categoryArtwork('Other', url)).toBeNull();
  });
});
