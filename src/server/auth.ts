import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DB } from '../db/db.js';
import { config } from './config.js';
import { helix } from '../twitch/helix.js';
export function encrypt(value: string, key: string) {
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('TOKEN_ENC_KEY must contain 64 hexadecimal characters.');
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
export function decrypt(value: string, key: string) {
  const raw = Buffer.from(value, 'base64'),
    decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}
export type Account = {
  id: string;
  login: string;
  name: string;
  scopes: string;
  tokens: string;
  bot_enabled: number;
};
const tokensSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  scope: z.array(z.string()).default([]),
});
export function readyForAuth() {
  return (
    !!config.TWITCH_CLIENT_ID &&
    !!config.TWITCH_CLIENT_SECRET &&
    /^[a-f0-9]{64}$/i.test(config.TOKEN_ENC_KEY) &&
    config.SESSION_SECRET.length >= 32
  );
}
export function accountFor(db: DB, req: FastifyRequest): Account | null {
  const cookie = req.cookies.session;
  if (!cookie) return null;
  const signed = req.unsignCookie(cookie);
  if (!signed.valid || !signed.value) return null;
  return (
    (db
      .prepare('SELECT a.* FROM accounts a JOIN sessions s ON s.account_id=a.id WHERE s.id=? AND s.expires>?')
      .get(signed.value, Date.now()) as Account) ?? null
  );
}
export async function userToken(db: DB, account: Account) {
  const tokens = JSON.parse(decrypt(account.tokens, config.TOKEN_ENC_KEY)) as {
    access_token: string;
    refresh_token: string;
    expires: number;
  };
  if (tokens.expires > Date.now() + 60_000) return tokens.access_token;
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: config.TWITCH_CLIENT_ID,
      client_secret: config.TWITCH_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Reconnect your Twitch account to refresh authorization.');
  const fresh = tokensSchema.parse(await response.json());
  db.prepare('UPDATE accounts SET tokens=?,scopes=? WHERE id=?').run(
    encrypt(
      JSON.stringify({ ...fresh, expires: Date.now() + fresh.expires_in * 1000 }),
      config.TOKEN_ENC_KEY,
    ),
    JSON.stringify(fresh.scope),
    account.id,
  );
  return fresh.access_token;
}
export function registerAuth(app: FastifyInstance, db: DB, demo: boolean) {
  const pending = new Map<string, { scopes: string[]; expires: number }>();
  const secure = config.PUBLIC_URL.startsWith('https:');
  app.get('/auth/twitch/login', async (req, reply) => {
    if (demo || !readyForAuth())
      return reply.code(503).send({
        error: demo
          ? 'Twitch login is disabled in the sample demo. Run live mode with your local .env.'
          : 'Set Twitch credentials, TOKEN_ENC_KEY and SESSION_SECRET in your local .env first.',
      });
    const { feature } = z
      .object({ feature: z.enum(['basic', 'broadcast', 'raid', 'bot']).default('basic') })
      .parse(req.query);
    const requestedScopes =
      feature === 'broadcast'
        ? ['channel:manage:broadcast']
        : feature === 'raid'
          ? ['channel:manage:raids']
          : feature === 'bot'
            ? ['user:read:chat', 'user:write:chat']
            : [];
    const existing = accountFor(db, req);
    const scopes = [
      ...new Set([...(existing ? (JSON.parse(existing.scopes) as string[]) : []), ...requestedScopes]),
    ];
    for (const [key, value] of pending) if (value.expires < Date.now()) pending.delete(key);
    const state = randomBytes(24).toString('hex');
    pending.set(state, { scopes, expires: Date.now() + 10 * 60_000 });
    reply.setCookie('oauth_state', state, {
      path: '/auth/twitch',
      httpOnly: true,
      secure,
      sameSite: 'lax',
      signed: true,
      maxAge: 600,
    });
    return reply.redirect(
      `https://id.twitch.tv/oauth2/authorize?${new URLSearchParams({ client_id: config.TWITCH_CLIENT_ID, redirect_uri: config.TWITCH_REDIRECT_URI, response_type: 'code', scope: scopes.join(' '), state })}`,
    );
  });
  app.get('/auth/twitch/callback', async (req, reply) => {
    const query = z.object({ code: z.string().max(500), state: z.string().max(100) }).parse(req.query);
    const signed = req.unsignCookie(req.cookies.oauth_state ?? ''),
      item = pending.get(query.state);
    pending.delete(query.state);
    reply.clearCookie('oauth_state', { path: '/auth/twitch' });
    if (
      demo ||
      !readyForAuth() ||
      !signed.valid ||
      signed.value !== query.state ||
      !item ||
      item.expires < Date.now()
    )
      return reply.code(400).send({ error: 'Authorization expired. Start Twitch login again.' });
    const response = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: config.TWITCH_CLIENT_ID,
        client_secret: config.TWITCH_CLIENT_SECRET,
        code: query.code,
        grant_type: 'authorization_code',
        redirect_uri: config.TWITCH_REDIRECT_URI,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      return reply.code(502).send({ error: 'Twitch authorization failed. Try reconnecting.' });
    const token = tokensSchema.parse(await response.json());
    const users = await helix.request(
      'users',
      z.object({ data: z.array(z.object({ id: z.string(), login: z.string(), display_name: z.string() })) }),
      {},
      token.access_token,
    );
    const user = users.data[0];
    if (!user) throw new Error('Twitch did not return an account.');
    db.prepare(
      'INSERT INTO accounts(id,login,name,tokens,scopes) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET login=excluded.login,name=excluded.name,tokens=excluded.tokens,scopes=excluded.scopes',
    ).run(
      user.id,
      user.login,
      user.display_name,
      encrypt(
        JSON.stringify({ ...token, expires: Date.now() + token.expires_in * 1000 }),
        config.TOKEN_ENC_KEY,
      ),
      JSON.stringify(token.scope),
    );
    db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    const session = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(session, user.id, Date.now() + 7 * 86400000);
    reply.setCookie('session', session, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure,
      signed: true,
      maxAge: 7 * 86400,
    });
    return reply.redirect('/channel');
  });
  app.post('/auth/twitch/logout', async (req, reply) => {
    const signed = req.unsignCookie(req.cookies.session ?? '');
    if (signed.valid) db.prepare('DELETE FROM sessions WHERE id=?').run(signed.value);
    reply.clearCookie('session', { path: '/' });
    return { ok: true };
  });
  app.get('/api/me', (req) => {
    const a = accountFor(db, req);
    return {
      account: a
        ? {
            id: a.id,
            login: a.login,
            name: a.name,
            scopes: JSON.parse(a.scopes),
            botEnabled: !!a.bot_enabled,
          }
        : null,
      authConfigured: readyForAuth() && !demo,
      demo,
    };
  });
}
