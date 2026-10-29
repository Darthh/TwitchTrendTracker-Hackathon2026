import Fastify, { type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import middie from '@fastify/middie';
import { z } from 'zod';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DB } from '../db/db.js';
import { snapshot } from '../db/db.js';
import { dashboard } from '../db/queries.js';
import { seedDemo, DEMO_NOW } from '../db/seed.js';
import { termOverview, invalidateTerms } from '../db/terms.js';
import { explain } from '../why/index.js';
import { config } from './config.js';
import { accountFor, registerAuth, userToken, readyForAuth, type Account } from './auth.js';
import { helix } from '../twitch/helix.js';
import { Analyst, QUESTIONS, rulesAnswer } from '../codex/runtime.js';
import { guardSql } from '../codex/sql.js';
import { querySnapshot } from '../codex/verify.js';
import { Bot } from '../twitch/bot.js';
import { EventSub } from '../twitch/eventsub.js';
import { startCollector } from '../collector/poll.js';
import { downsample } from '../metrics/index.js';
import { DAY, HOUR } from '../metrics/config.js';
import type { Dashboard, Range, TermOverview } from '../shared/types.js';
import { startJobs } from './jobs.js';
import { collectionOverview, summaryHistory, startSummaryCollector } from '../sources/collector.js';
const querySchema = z.object({
  range: z.enum(['week', 'month']).default('week'),
  size: z.coerce.number().min(1).max(100000).default(50),
});
const idSchema = z.object({ id: z.string().min(1).max(120) });
const askSchema = z.object({
  prompt: z.string().trim().min(3).max(1500),
  range: z.enum(['week', 'month']).default('week'),
});
export async function createApp(
  db: DB,
  options: { demo?: boolean; dev?: boolean; web?: boolean; worker?: boolean; collectionDb?: DB } = {},
) {
  const demo = options.demo ?? false;
  const collectionDb = options.collectionDb ?? (demo ? null : db);
  const directActive =
    !!options.worker &&
    config.WORKER &&
    !!config.TWITCH_CLIENT_ID &&
    !!config.TWITCH_CLIENT_SECRET &&
    !!collectionDb;
  if (demo) seedDemo(db);
  const app = Fastify({ logger: false, bodyLimit: 32768, trustProxy: false });
  await app.register(cookie, { secret: config.SESSION_SECRET || randomBytes(32).toString('hex') });
  await app.register(rateLimit, { max: 180, timeWindow: '1 minute', allowList: [] });
  app.addHook('onRequest', async (req, reply) => {
    reply
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'same-origin')
      .header('X-Frame-Options', 'SAMEORIGIN');
    if (!options.dev)
      reply.header(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://static-cdn.jtvnw.net/ttv-boxart/; font-src 'self'; connect-src 'self' https://static-cdn.jtvnw.net/ttv-boxart/; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
      );
    if (req.method === 'POST' && req.headers.origin !== new URL(config.PUBLIC_URL).origin)
      return reply.code(403).send({ error: 'This action must originate from the Upswing dashboard.' });
  });
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(400).send({
        error: 'Check the request fields.',
        details: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
    const e = error as Error & { statusCode?: number };
    return reply.code(e.statusCode ?? 400).send({
      error:
        e.statusCode === 429
          ? 'Too many requests. Try again in a minute.'
          : e.message?.startsWith('Twitch request')
            ? 'Twitch is temporarily unavailable. Try reconnecting.'
            : e.message || 'The request could not be completed.',
    });
  });
  const cache = new Map<string, { time: number; data: Dashboard }>();
  const termCache = new Map<string, { time: number; data: TermOverview }>();
  const getData = (range: Range = 'week', size = 50) => {
    const key = `${range}:${size}`,
      existing = cache.get(key);
    if (existing && Date.now() - existing.time < 30_000) return existing.data;
    const data = dashboard(db, range, demo, size);
    if (cache.size > 60) cache.clear();
    cache.set(key, { time: Date.now(), data });
    return data;
  };
  const publicData = (data: Dashboard) => ({
    ...data,
    platformSeries: downsample(
      data.platformSeries.filter((p) => p.ts >= data.now - (data.range === 'week' ? 7 : 30) * DAY),
      data.range === 'week' ? 168 : 120,
    ),
    games: data.games.map((g) => ({
      ...g,
      viewers: [],
      series: downsample(
        g.series.filter((p) => p.ts >= data.now - (data.range === 'week' ? 7 : 30) * DAY),
        data.range === 'week' ? 168 : 120,
      ),
    })),
    streamers: data.streamers.map((s) => ({
      ...s,
      series: downsample(
        s.series.filter((p) => p.ts >= data.now - (data.range === 'week' ? 7 : 30) * DAY),
        168,
      ),
    })),
  });
  const analyst = new Analyst(db, demo),
    bot = new Bot(),
    eventsub = new EventSub(db, () => getData());
  registerAuth(app, db, demo);
  app.get('/api/pulse', (req) => {
    const q = querySchema.parse(req.query);
    return publicData(getData(q.range, q.size));
  });
  app.get('/api/cards', (req) => {
    const q = querySchema.parse(req.query);
    const d = getData(q.range, q.size);
    return {
      source: d.source,
      range: q.range,
      cards: [...d.games]
        .sort((a, b) => (b.metric.relDeltaPct ?? 0) - (a.metric.relDeltaPct ?? 0))
        .map((g) => ({
          id: g.id,
          title: g.name,
          metric: g.metric,
          series: downsample(g.series.slice(q.range === 'week' ? -168 : -720), 168),
        })),
    };
  });
  app.get('/api/market-map', (req) => {
    const q = querySchema.parse(req.query);
    return getData(q.range).games.map((g) => ({
      name: g.name,
      id: g.id,
      value: g.metric.value,
      change: g.metric.relDeltaPct,
    }));
  });
  app.get('/api/games', (req) => {
    const q = querySchema
      .extend({
        lang: z.string().max(10).optional(),
        sort: z.enum(['viewers', 'growth', 'opportunity']).default('viewers'),
        maxAgeDays: z.coerce.number().optional(),
      })
      .parse(req.query);
    let games = publicData(getData(q.range, q.size)).games;
    if (q.maxAgeDays) games = games.filter((g) => g.ageDays !== null && g.ageDays <= q.maxAgeDays!);
    return games.sort((a, b) =>
      q.sort === 'growth'
        ? (b.metric.deltaPct ?? 0) - (a.metric.deltaPct ?? 0)
        : q.sort === 'opportunity'
          ? b.opportunity - a.opportunity
          : b.metric.value - a.metric.value,
    );
  });
  app.get('/api/games/:id', (req, reply) => {
    const q = querySchema.parse(req.query),
      { id } = idSchema.parse(req.params);
    const game = publicData(getData(q.range, q.size)).games.find((g) => g.id === id);
    return game ?? reply.code(404).send({ error: 'Category not found.' });
  });
  app.get('/api/games/:id/why', (req, reply) => {
    const q = querySchema.parse(req.query),
      { id } = idSchema.parse(req.params),
      d = getData(q.range);
    const g = d.games.find((g) => g.id === id);
    return g ? explain(g, d) : reply.code(404).send({ error: 'Category not found.' });
  });
  app.get('/api/streamers/:login', (req, reply) => {
    const q = querySchema.parse(req.query),
      { login } = z.object({ login: z.string().max(100) }).parse(req.params);
    const list = publicData(getData(q.range)).streamers;
    if (['breakouts', 'growth', 'rising', 'new'].includes(login))
      return list
        .filter((s) =>
          login === 'rising'
            ? s.metric.value >= 100 && s.metric.value < 1000
            : login === 'new'
              ? s.ageDays < 180
              : true,
        )
        .sort((a, b) =>
          login === 'breakouts'
            ? b.breakout - a.breakout
            : (b.metric.deltaPct ?? 0) - (a.metric.deltaPct ?? 0),
        );
    return list.find((s) => s.login === login) ?? reply.code(404).send({ error: 'Streamer not found.' });
  });
  app.get('/api/keywords', (req) => getData(querySchema.parse(req.query).range).keywords);
  app.get('/api/collection', () => collectionOverview(collectionDb, directActive));
  app.get('/api/collection/history', (req) => {
    const query = z
      .object({
        kind: z.enum(['category', 'channel']),
        key: z.string().min(1).max(25),
        range: z.enum(['week', 'month']).default('week'),
      })
      .parse(req.query);
    return {
      provider: 'twitchtracker',
      period: 'provider_summary',
      points: summaryHistory(collectionDb, query.kind, query.key, query.range),
    };
  });
  app.get('/api/terms', (req) => {
    const { kind, range } = z
      .object({
        kind: z.enum(['keyword', 'tag']).default('keyword'),
        range: z.enum(['week', 'month']).default('week'),
      })
      .parse(req.query);
    const key = `${kind}:${range}`,
      cached = termCache.get(key);
    if (cached && Date.now() - cached.time < 30_000) return cached.data;
    const data = termOverview(db, kind, range, demo ? DEMO_NOW : Math.floor(Date.now() / HOUR) * HOUR, demo);
    termCache.set(key, { time: Date.now(), data });
    return data;
  });
  app.get('/api/opportunity', (req) => {
    const q = querySchema.parse(req.query);
    return publicData(getData(q.range, q.size)).games.sort((a, b) => b.opportunity - a.opportunity);
  });
  app.get('/api/besttime', (req) => {
    const q = querySchema
      .extend({ game: z.string().max(100), tz: z.string().default('UTC') })
      .parse(req.query);
    const formatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: q.tz,
    });
    const game = getData(q.range, q.size).games.find((g) => g.id === q.game);
    if (!game) return [];
    const hourlySupply = new Map(
      (
        db.prepare('SELECT hour,channels FROM game_hourly WHERE game_id=?').all(game.id) as {
          hour: number;
          channels: number;
        }[]
      ).map((r) => [r.hour, r.channels]),
    );
    const cells = new Map<string, number[]>();
    for (const p of game.series.filter(
      (p) => p.ts >= getData(q.range).now - (q.range === 'week' ? 7 : 30) * DAY,
    )) {
      const parts = formatter.formatToParts(p.ts),
        day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(
          parts.find((x) => x.type === 'weekday')!.value,
        ),
        hour = Number(parts.find((x) => x.type === 'hour')!.value);
      const key = `${day}:${hour}`;
      const vals = cells.get(key) ?? [];
      vals.push(p.value / Math.max(1, hourlySupply.get(p.ts) ?? game.channels));
      cells.set(key, vals);
    }
    return [...cells].map(([key, vals]) => ({
      day: Number(key.split(':')[0]),
      hour: Number(key.split(':')[1]),
      value: vals.reduce((s, v) => s + v, 0) / vals.length,
    }));
  });
  app.post('/api/title-lab', (req) => {
    const q = z
      .object({
        title: z.string().trim().min(1).max(140),
        game: z.string().max(100).default('your next adventure'),
      })
      .parse(req.body);
    const clean = q.title
      .replace(/\b(drops|giveaway)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      score: Math.min(
        95,
        45 + (clean.length >= 20 ? 20 : 0) + (clean.length <= 80 ? 15 : 0) + (/[?!]/.test(clean) ? 5 : 0),
      ),
      drafts: [`${clean} | come hang out`, `${q.game}: ${clean}`, `${clean} — what should we try next?`].map(
        (t) => t.slice(0, 140),
      ),
      notes: [
        'A clarity heuristic, not a predicted viewer gain.',
        'Drops and giveaway claims require your own verification and are excluded from generated drafts.',
      ],
    };
  });
  app.get('/api/codex/questions', () => ({ questions: QUESTIONS }));
  const ask = async (req: FastifyRequest) => {
    const q = askSchema.parse(req.body);
    const owner = createHash('sha256')
      .update(accountFor(db, req)?.id ?? req.ip)
      .digest('hex');
    const day = Math.floor(Date.now() / DAY) * DAY;
    const usage = (
      db.prepare('SELECT COUNT(*) n FROM analysis_usage WHERE owner=? AND day=?').get(owner, day) as {
        n: number;
      }
    ).n;
    if (usage >= 20)
      throw Object.assign(new Error('Daily analyst quota reached. Try again tomorrow.'), { statusCode: 429 });
    const run = analyst.ask(q.prompt, getData(q.range));
    db.prepare('INSERT OR IGNORE INTO analysis_usage VALUES(?,?,?)').run(owner, day, run.id);
    db.prepare('DELETE FROM analysis_usage WHERE day<?').run(day - 7 * DAY);
    return run;
  };
  app.post('/api/codex/ask', { config: { rateLimit: { max: 12, timeWindow: '1 hour' } } }, ask);
  app.post('/api/codex/deep-dive', { config: { rateLimit: { max: 12, timeWindow: '1 hour' } } }, ask);
  app.get(
    '/api/codex/runs/:id',
    (req, reply) =>
      analyst.get(idSchema.parse(req.params).id) ?? reply.code(404).send({ error: 'Analysis not found.' }),
  );
  app.get('/api/reports', (req) => {
    const { range } = querySchema.parse(req.query),
      data = getData(range);
    const id = `${data.source}-${range}-${data.now}`;
    const output = rulesAnswer(`Give me this ${range}'s trend report`, data);
    db.prepare('INSERT OR IGNORE INTO reports VALUES(?,?,?,?,?)').run(
      id,
      range,
      data.now,
      JSON.stringify(output),
      'rules',
    );
    const saved = db
      .prepare('SELECT * FROM reports WHERE range=? ORDER BY created_at DESC LIMIT 12')
      .all(range) as { id: string; range: Range; created_at: number; source: string; output_json: string }[];
    return saved.map((r) => ({
      id: r.id,
      range: r.range,
      date: r.created_at,
      source: r.source,
      output: JSON.parse(r.output_json),
    }));
  });
  app.get('/api/reports/:id', (req, reply) => {
    const row = db.prepare('SELECT * FROM reports WHERE id=?').get(idSchema.parse(req.params).id) as
      { output_json: string } | undefined;
    return row
      ? { ...row, output: JSON.parse(row.output_json) }
      : reply.code(404).send({ error: 'Report not found.' });
  });
  app.post('/api/mock-chat', (req) => {
    const q = z
      .object({
        message: z.string().min(1).max(500),
        moderator: z.boolean().default(true),
        range: z.enum(['week', 'month']).default('week'),
      })
      .parse(req.body);
    return {
      reply: bot.reply(q.message, 'demo-user', q.moderator, getData(q.range)),
      source: 'mock',
      sentToTwitch: false,
    };
  });
  app.post('/api/me/plan', (req) => {
    const { range, size } = querySchema.parse(req.body);
    return {
      source: 'rules',
      categories: [...getData(range, size).games]
        .filter((g) => g.opportunityReady)
        .sort((a, b) => b.opportunity - a.opportunity)
        .slice(0, 3)
        .map((g) => ({
          id: g.id,
          name: g.name,
          score: g.opportunity,
          reason: `Estimated rank #${g.rank} at ${size} viewers. Review observed time slots before scheduling.`,
        })),
    };
  });
  app.post(
    '/api/alerts/compile',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const account = accountFor(db, req),
        owner = account?.id ?? (demo ? 'demo' : '');
      if (!owner) return reply.code(401).send({ error: 'Connect Twitch before saving an alert.' });
      const q = z
        .object({ prompt: z.string().min(5).max(500), range: z.enum(['week', 'month']).default('week') })
        .parse(req.body);
      const game = getData(q.range).games.find((g) => q.prompt.toLowerCase().includes(g.name.toLowerCase()));
      const threshold = q.prompt.match(/(?:above|over|reaches|exceeds)\s+([\d,]+)\s*(k)?/i);
      if (!game || !threshold)
        return reply.code(422).send({
          error:
            'This build supports “Alert me when Minecraft is above 50000 average viewers”. Complex growth alert compilation is not enabled.',
        });
      const limit = z
        .number()
        .finite()
        .min(1)
        .max(1e9)
        .parse(Number(threshold[1].replaceAll(',', '')) * (threshold[2] ? 1000 : 1));
      const sql = guardSql(
        `SELECT hour, AVG(viewers) AS viewers FROM game_hourly WHERE game_id='${game.id.replaceAll("'", "''")}' GROUP BY hour HAVING AVG(viewers)>${limit} ORDER BY hour DESC LIMIT 30`,
      );
      await snapshot(db);
      const hits = await querySnapshot(sql);
      const id = randomUUID();
      db.prepare('INSERT INTO alerts VALUES(?,?,?,?,?,?)').run(id, owner, q.prompt, sql, 0, Date.now());
      return {
        id,
        name: q.prompt,
        sql,
        source: 'rules',
        hits,
        explanation: `Checks hourly averages for ${game.name} above ${limit.toLocaleString('en-US')} viewers. Backtest: ${hits.length}${hits.length === 30 ? '+' : ''} matching hours.`,
      };
    },
  );
  app.post('/api/alerts/:id/approve', (req, reply) => {
    const account = accountFor(db, req),
      owner = account?.id ?? (demo ? 'demo' : '');
    if (!owner) return reply.code(401).send({ error: 'Connect Twitch first.' });
    const { confirmed } = z.object({ confirmed: z.literal(true) }).parse(req.body);
    const result = db
      .prepare('UPDATE alerts SET approved=? WHERE id=? AND account_id=?')
      .run(+confirmed, idSchema.parse(req.params).id, owner);
    return result.changes ? { ok: true } : reply.code(404).send({ error: 'Alert not found.' });
  });
  app.get('/api/alerts', (req) => {
    const owner = accountFor(db, req)?.id ?? (demo ? 'demo' : '');
    return db
      .prepare('SELECT id,name,approved,created_at FROM alerts WHERE account_id=? ORDER BY created_at DESC')
      .all(owner);
  });
  app.get('/api/alerts/hits', (req) => {
    const owner = accountFor(db, req)?.id ?? (demo ? 'demo' : '');
    return db
      .prepare(
        'SELECT h.* FROM alert_hits h JOIN alerts a ON a.id=h.alert_id WHERE a.account_id=? ORDER BY h.ts DESC LIMIT 50',
      )
      .all(owner);
  });
  const requireAccount = (
    req: Parameters<typeof accountFor>[1],
    reply: { code: (n: number) => { send: (v: unknown) => unknown } },
  ) => {
    const a = accountFor(db, req);
    if (!a || demo) {
      reply.code(401).send({ error: 'Connect your Twitch account in live mode first.' });
      return null;
    }
    return a;
  };
  app.get('/api/me/channel', async (req, reply) => {
    const a = requireAccount(req, reply);
    if (!a) return;
    const result = await helix.request(
      `channels?broadcaster_id=${a.id}`,
      z.object({
        data: z.array(z.object({ title: z.string(), game_id: z.string(), game_name: z.string() })),
      }),
      {},
      await userToken(db, a),
    );
    return result.data[0] ?? null;
  });
  app.post('/api/me/channel', async (req, reply) => {
    const a = requireAccount(req, reply);
    if (!a) return;
    if (!(JSON.parse(a.scopes) as string[]).includes('channel:manage:broadcast'))
      return reply.code(403).send({
        error: 'Authorize channel editing first.',
        authorize: '/auth/twitch/login?feature=broadcast',
      });
    const q = z
      .object({
        title: z.string().min(1).max(140),
        game_id: z.string().regex(/^\d+$/),
        tags: z
          .array(z.string().regex(/^[\p{L}\p{N}]{1,25}$/u))
          .max(10)
          .optional(),
        confirmed: z.literal(true),
      })
      .parse(req.body);
    const token = await userToken(db, a),
      before = await helix.request(`channels?broadcaster_id=${a.id}`, z.unknown(), {}, token);
    await helix.request(
      `channels?broadcaster_id=${a.id}`,
      z.unknown(),
      { method: 'PATCH', body: JSON.stringify({ title: q.title, game_id: q.game_id, tags: q.tags }) },
      token,
    );
    eventsub.recordChange(a.id, before, q);
    return { ok: true };
  });
  app.get('/api/me/changes', (req) => {
    const a = accountFor(db, req);
    return a
      ? db.prepare('SELECT * FROM changes WHERE account_id=? ORDER BY ts DESC LIMIT 50').all(a.id)
      : [];
  });
  app.get('/api/me/raid-targets', (req) => {
    const q = querySchema.parse(req.query);
    return getData(q.range)
      .streamers.filter(
        (s) =>
          s.live &&
          s.metric.value >= q.size * 0.2 &&
          s.metric.value <= q.size &&
          (s.metric.deltaPct ?? 0) > 0,
      )
      .slice(0, 5);
  });
  app.post('/api/me/raid', async (req, reply) => {
    const a = requireAccount(req, reply);
    if (!a) return;
    if (!(JSON.parse(a.scopes) as string[]).includes('channel:manage:raids'))
      return reply
        .code(403)
        .send({ error: 'Authorize raids first.', authorize: '/auth/twitch/login?feature=raid' });
    const q = z.object({ targetId: z.string().regex(/^\d+$/), confirmed: z.literal(true) }).parse(req.body);
    await helix.request(
      `raids?from_broadcaster_id=${a.id}&to_broadcaster_id=${q.targetId}`,
      z.unknown(),
      { method: 'POST' },
      await userToken(db, a),
    );
    return { ok: true };
  });
  app.post('/api/me/bot', (req, reply) => {
    const a = requireAccount(req, reply);
    if (!a) return;
    const q = z.object({ enabled: z.boolean(), confirmed: z.literal(true) }).parse(req.body);
    if (
      q.enabled &&
      !['user:read:chat', 'user:write:chat'].every((s) => (JSON.parse(a.scopes) as string[]).includes(s))
    )
      return reply
        .code(403)
        .send({ error: 'Authorize chat first.', authorize: '/auth/twitch/login?feature=bot' });
    db.prepare('UPDATE accounts SET bot_enabled=? WHERE id=?').run(+q.enabled, a.id);
    if (q.enabled) eventsub.start(a);
    else eventsub.stop(a.id);
    return { ok: true };
  });
  app.post('/api/me/opt-out', async (req, reply) => {
    const a = requireAccount(req, reply);
    if (!a) return;
    z.object({ confirmed: z.literal(true) }).parse(req.body);
    eventsub.stop(a.id);
    db.prepare('UPDATE accounts SET bot_enabled=0 WHERE id=?').run(a.id);
    db.prepare('INSERT OR REPLACE INTO blocklist VALUES(?,?)').run(a.id, Date.now());
    db.prepare('DELETE FROM channel_hourly WHERE channel_id=?').run(a.id);
    db.prepare('DELETE FROM channel_daily WHERE channel_id=?').run(a.id);
    db.prepare('DELETE FROM codex_runs').run();
    db.prepare('DELETE FROM reports').run();
    analyst.invalidate();
    cache.clear();
    termCache.clear();
    invalidateTerms(db);
    await snapshot(db);
    return { ok: true };
  });
  app.get('/admin/health', () => {
    const d = getData();
    const failedPolls = (db.prepare("SELECT COUNT(*) n FROM polls WHERE errors!='[]'").get() as { n: number })
      .n;
    const hours = db.prepare("SELECT ts FROM polls WHERE errors='[]' ORDER BY ts").all() as { ts: number }[];
    const gaps = hours
      .flatMap((p, i) =>
        i && p.ts - hours[i - 1].ts > config.POLL_INTERVAL_MIN * 120000
          ? [{ from: hours[i - 1].ts, to: p.ts }]
          : [],
      )
      .slice(-30);
    return {
      source: d.source,
      daysTracked: d.daysTracked,
      latestPoll: d.latestPoll,
      polls: d.polls,
      coverage: d.coverage,
      failedPolls,
      gaps,
      databaseBytes: existsSync('data/upswing.db') ? statSync('data/upswing.db').size : 0,
      codex: {
        enabled: config.CODEX_LIVE && !demo,
        cost: null,
        costNote: 'No estimated cost without billing evidence.',
      },
    };
  });
  const connections = new Map<string, number>();
  const sse = (path: string, type: 'pulse' | 'codex') =>
    app.get(path, (req, reply) => {
      const q = querySchema.parse(req.query),
        id = type === 'codex' ? idSchema.parse(req.params).id : '';
      if (type === 'codex' && !analyst.get(id)) return reply.code(404).send({ error: 'Analysis not found.' });
      const active = connections.get(req.ip) ?? 0;
      if (active >= 8)
        return reply.code(429).send({ error: 'Close another live stream before opening a new one.' });
      connections.set(req.ip, active + 1);
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      const send = () => {
        const value =
          type === 'codex'
            ? analyst.get(id)
            : {
                now: Date.now(),
                source: demo ? 'synthetic' : 'live',
                range: q.range,
                latestPoll: getData(q.range).latestPoll,
                replayHour: demo ? Math.floor(Date.now() / 1000) % 24 : null,
              };
        reply.raw.write(`data: ${JSON.stringify(value)}\n\n`);
      };
      send();
      const timer = setInterval(send, type === 'codex' ? 700 : 10000);
      const expiry = setTimeout(() => reply.raw.end(), 30 * 60000);
      reply.raw.once('close', () => {
        clearInterval(timer);
        clearTimeout(expiry);
        const count = (connections.get(req.ip) ?? 1) - 1;
        if (count) connections.set(req.ip, count);
        else connections.delete(req.ip);
      });
    });
  sse('/sse/pulse', 'pulse');
  sse('/sse/overlay/:login', 'pulse');
  sse('/sse/codex/:id', 'codex');
  let stopCollector: (() => void) | undefined;
  if (options.worker && !demo && readyForAuth()) {
    const enabled = db
      .prepare(
        'SELECT * FROM accounts WHERE bot_enabled=1 AND id NOT IN (SELECT channel_id FROM blocklist) LIMIT 100',
      )
      .all() as Account[];
    enabled.forEach((account) => eventsub.start(account));
  }
  const stopJobs = options.worker ? startJobs(db, analyst, getData) : undefined;
  if (directActive && collectionDb)
    stopCollector = startCollector(collectionDb, () => {
      cache.clear();
      termCache.clear();
      invalidateTerms(collectionDb);
    });
  const stopSummaries =
    options.worker && config.WORKER && config.TWITCHTRACKER_ENABLED && collectionDb
      ? startSummaryCollector(collectionDb)
      : undefined;
  let vite: { close: () => Promise<void> } | undefined;
  if (options.web !== false) {
    if (options.dev) {
      await app.register(middie);
      const { createServer } = await import('vite');
      const server = await createServer({
        configFile: resolve('vite.config.ts'),
        server: { middlewareMode: true },
        appType: 'spa',
      });
      vite = server;
      app.use((req, res, next) => {
        if (/^\/(api|sse|auth|admin)(\/|$)/.test(req.url ?? '')) next();
        else server.middlewares(req, res, next);
      });
    } else if (existsSync(resolve('dist/assets')))
      await app.register(staticFiles, { root: resolve('dist/assets'), prefix: '/assets/' });
    app.setNotFoundHandler((req, reply) => {
      if (/^\/(api|sse|auth|admin)(\/|$)/.test(req.url))
        return reply.code(404).send({ error: 'Endpoint not found.' });
      const html = resolve('dist/index.html');
      return existsSync(html)
        ? reply.type('text/html').send(readFileSync(html, 'utf8'))
        : reply.code(503).send({ error: 'Run npm run build first, or npm run dev.' });
    });
  }
  app.addHook('onClose', async () => {
    await stopSummaries?.();
    stopCollector?.();
    stopJobs?.();
    eventsub.close();
    await vite?.close();
  });
  return app;
}
