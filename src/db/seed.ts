import type { DB } from './db.js';
import { DAY, HOUR } from '../metrics/config.js';
export const DEMO_NOW = Date.UTC(2026, 9, 28);
export const CATALOG = [
  {
    id: '509658',
    name: 'Just Chatting',
    genre: 'Community',
    color: '#c7a0ff',
    art: 'chat',
    base: 315000,
    growth: 0.146,
    channels: 6400,
    age: 2900,
  },
  {
    id: '516575',
    name: 'VALORANT',
    genre: 'Shooter',
    color: '#ff6d84',
    art: 'valor',
    base: 121000,
    growth: -0.184,
    channels: 5900,
    age: 2340,
  },
  {
    id: '27471',
    name: 'Minecraft',
    genre: 'Sandbox',
    color: '#86cf82',
    art: 'blocks',
    base: 58000,
    growth: 0.384,
    channels: 3100,
    age: 5400,
  },
  {
    id: '33214',
    name: 'Fortnite',
    genre: 'Battle royale',
    color: '#73bdff',
    art: 'portal',
    base: 85000,
    growth: 0.213,
    channels: 5100,
    age: 3380,
  },
  {
    id: '493549',
    name: 'Dead by Daylight',
    genre: 'Horror',
    color: '#bea5f7',
    art: 'forest',
    base: 19000,
    growth: 0.687,
    channels: 610,
    age: 3780,
  },
  {
    id: '18122',
    name: 'World of Warcraft',
    genre: 'MMORPG',
    color: '#f7bf65',
    art: 'castle',
    base: 45000,
    growth: -0.091,
    channels: 1700,
    age: 8000,
  },
  {
    id: '518203',
    name: 'Hollow Knight: Silksong',
    genre: 'Adventure',
    color: '#e88b9c',
    art: 'silk',
    base: 18000,
    growth: 0.926,
    channels: 270,
    age: 18,
  },
  {
    id: '21779',
    name: 'League of Legends',
    genre: 'MOBA',
    color: '#80c9d4',
    art: 'crystal',
    base: 158000,
    growth: 0.071,
    channels: 7200,
    age: 6200,
  },
  {
    id: '512710',
    name: 'Phasmophobia',
    genre: 'Horror',
    color: '#a5d3c5',
    art: 'ghost',
    base: 6900,
    growth: 0.543,
    channels: 180,
    age: 2240,
  },
  {
    id: '509672',
    name: 'Talk Shows & Podcasts',
    genre: 'Community',
    color: '#f4b780',
    art: 'radio',
    base: 12500,
    growth: 0.287,
    channels: 230,
    age: 3000,
  },
  {
    id: '515025',
    name: 'Escape from Tarkov',
    genre: 'Shooter',
    color: '#bdc284',
    art: 'forest',
    base: 27000,
    growth: -0.242,
    channels: 1300,
    age: 3300,
  },
  {
    id: '509660',
    name: 'Art',
    genre: 'Creative',
    color: '#e79bda',
    art: 'art',
    base: 9600,
    growth: 0.173,
    channels: 420,
    age: 4000,
  },
];
const names = [
  'lunarose',
  'cozybyte',
  'mossyplays',
  'novastreams',
  'pixelpilot',
  'fernandfox',
  'sunnyside',
  'orbitally',
  'theowlet',
  'juniperlive',
  'rivenvale',
  'peachykai',
  'astralynn',
  'tinyquest',
  'sablecast',
  'skylarktv',
  'zennith',
  'cindercloud',
  'mellowmika',
  'emberlane',
  'wispworks',
  'atlasarc',
  'riverplays',
  'cloudberry',
];
export function seedDemo(db: DB) {
  if (
    db.prepare('SELECT COUNT(*) n FROM game_hourly').get() &&
    (db.prepare('SELECT COUNT(*) n FROM game_hourly').get() as { n: number }).n > 0
  )
    return;
  db.transaction(() => {
    const game = db.prepare(
      'INSERT OR REPLACE INTO games(id,name,first_seen,release_date,genre) VALUES(?,?,?,?,?)',
    );
    const hourly = db.prepare('INSERT OR REPLACE INTO game_hourly VALUES(?,?,?,?,?,?,?,?)');
    const scan = db.prepare('INSERT OR REPLACE INTO game_scan VALUES(?,?,?,?,?,?,?,?,?)');
    const clip = db.prepare('INSERT OR REPLACE INTO clip_weekly VALUES(?,?,?,?,?)');
    CATALOG.forEach((g, gi) => {
      game.run(g.id, g.name, DEMO_NOW - 64 * DAY, DEMO_NOW - g.age * DAY, g.genre);
      for (let h = 0; h < 64 * 24; h++) {
        const ts = DEMO_NOW - 64 * DAY + h * HOUR,
          recent = h / (64 * 24);
        const cycle =
          1 +
          0.23 * Math.sin((((h % 24) - 10) * Math.PI) / 12) +
          0.05 * Math.cos(((h / 24) * Math.PI * 2) / 7);
        const trend = Math.exp((Math.log(1 + g.growth) * (h - (64 * 24 - 168))) / 168);
        const value = Math.max(
          300,
          Math.round(g.base * cycle * trend * (1 + 0.022 * Math.sin(h * 1.27 + gi))),
        );
        const channels = Math.round(g.channels * cycle * (0.85 + recent * 0.15));
        hourly.run(ts, g.id, value, channels, 1, Math.round(value * 1.14), value, channels);
      }
      const viewers = Array.from({ length: g.channels }, (_, i) =>
        Math.max(1, Math.round((g.base * 0.19) / (i + 1) ** 1.02)),
      );
      const sum = viewers.reduce((s, v) => s + v, 0);
      scan.run(
        DEMO_NOW - HOUR,
        g.id,
        viewers.length,
        sum,
        viewers[Math.floor(viewers.length / 2)],
        viewers[Math.floor(viewers.length / 4)],
        viewers[Math.floor(viewers.length / 10)],
        '{}',
        JSON.stringify(viewers),
      );
      for (let w = 0; w < 8; w++)
        clip.run(
          g.id,
          DEMO_NOW - (8 - w) * 7 * DAY,
          Math.round(g.base * 16 * (1 + (w * g.growth) / 6)),
          100,
          '[]',
        );
    });
    const channel = db.prepare(
      'INSERT OR REPLACE INTO channels(id,login,name,language,created_at,first_seen) VALUES(?,?,?,?,?,?)',
    );
    const ch = db.prepare('INSERT OR REPLACE INTO channel_hourly VALUES(?,?,?,?,?,?,?)');
    names.forEach((name, i) => {
      const g = CATALOG[(i * 5 + 4) % CATALOG.length],
        base = 80 + ((i * 137) % 790);
      channel.run(
        `demo-${i}`,
        name,
        name,
        i % 6 === 0 ? 'es' : 'en',
        DEMO_NOW - (34 + i * 19) * DAY,
        DEMO_NOW - 64 * DAY,
      );
      for (let h = 0; h < 64 * 24; h++) {
        const factor = Math.exp((Math.log(1.16 + (24 - i) * 0.032) * (h - (64 * 24 - 168))) / 168);
        ch.run(
          DEMO_NOW - 64 * DAY + h * HOUR,
          `demo-${i}`,
          g.id,
          Math.round(base * factor * (1 + 0.14 * Math.sin(h / 5 + i))),
          1,
          Math.round(base * factor * 1.5),
          1,
        );
      }
    });
    const poll = db.prepare('INSERT OR REPLACE INTO polls VALUES(?,?,?,?,?,?,?,?)');
    for (let h = 0; h < 64 * 24; h++)
      poll.run(DEMO_NOW - 64 * DAY + h * HOUR, 1200, 100, 34000, 1500000, 1, 650, '[]');
  })();
}
