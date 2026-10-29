import assert from 'node:assert/strict';
import { openDb } from '../src/db/db.js';
import { createApp } from '../src/server/app.js';
import { config } from '../src/server/config.js';
const db = openDb(':memory:'),
  app = await createApp(db, { demo: true, web: false });
try {
  for (const url of [
    '/api/pulse',
    '/api/cards',
    '/api/market-map',
    '/api/games',
    '/api/keywords',
    '/api/terms?kind=keyword&range=week',
    '/api/terms?kind=tag&range=month',
    '/api/opportunity?size=50',
    '/api/besttime?game=27471',
    '/api/streamers/rising',
    '/api/reports',
    '/api/collection',
    '/api/collection/history?kind=category&key=509658',
    '/admin/health',
  ]) {
    const result = await app.inject({ url });
    assert.equal(result.statusCode, 200, `${url}: ${result.body}`);
    console.log(`200 ${url}`);
  }
  const pulseResponse = await app.inject({ url: '/api/pulse' });
  const csp = String(pulseResponse.headers['content-security-policy']);
  assert.ok(csp.includes("img-src 'self' data: blob: https://static-cdn.jtvnw.net/ttv-boxart/;"));
  assert.ok(csp.includes("connect-src 'self' https://static-cdn.jtvnw.net/ttv-boxart/;"));
  assert.ok(csp.includes("script-src 'self';"));
  assert.ok(csp.includes("object-src 'none';"));
  const pulse = pulseResponse.json();
  assert.equal(pulse.source, 'synthetic');
  assert.equal(pulse.games.length, 12);
  assert.equal(pulse.range, 'week');
  const collection = (await app.inject({ url: '/api/collection' })).json();
  assert.equal(collection.totalSnapshots, 0);
  assert.equal(collection.items.length, 0);
  assert.equal((await app.inject('/api/collection/history?kind=channel&key=..%2F..')).statusCode, 400);
  const month = (await app.inject({ url: '/api/pulse?range=month' })).json();
  assert.equal(month.range, 'month');
  assert.notEqual(month.games[0].metric.deltaPct, pulse.games[0].metric.deltaPct);
  assert.ok(
    pulse.games.every((g: { boxArtUrl: string }) =>
      g.boxArtUrl.startsWith('https://static-cdn.jtvnw.net/ttv-boxart/'),
    ),
  );
  const terms = (await app.inject({ url: '/api/terms?kind=keyword&range=week' })).json();
  assert.equal(terms.source, 'synthetic');
  assert.equal(terms.terms[0].points.length, 7);
  const cozy = terms.terms.find((t: { term: string }) => t.term === 'cozy');
  assert.equal(cozy.channels, pulse.keywords.find((k: { word: string }) => k.word === 'cozy').channels);
  const tags = (await app.inject({ url: '/api/terms?kind=tag&range=month' })).json();
  assert.equal(tags.kind, 'tag');
  assert.equal(tags.terms[0].points.length, 30);
  assert.equal((await app.inject({ url: '/api/terms?kind=other' })).statusCode, 400);
  assert.equal((await app.inject({ url: '/api/terms?range=day' })).statusCode, 400);
  const ask = await app.inject({
    method: 'POST',
    url: '/api/codex/ask',
    headers: { origin: new URL(config.PUBLIC_URL).origin },
    payload: { prompt: 'What is taking off this week?', range: 'week' },
  });
  assert.equal(ask.statusCode, 200, ask.body);
  const run = ask.json();
  assert.equal(run.source, 'rules');
  assert.equal((await app.inject({ url: `/api/codex/runs/${run.id}` })).statusCode, 200);
  assert.equal((await app.inject({ url: '/api/pulse?range=day' })).statusCode, 400);
  assert.equal(
    (await app.inject({ method: 'POST', url: '/api/me/channel', payload: { confirmed: true } })).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/me/channel',
        headers: { origin: new URL(config.PUBLIC_URL).origin },
        payload: { confirmed: true },
      })
    ).statusCode,
    401,
  );
  console.log('Demo API, range switching, cached analyst and mutation guards passed.');
  const liveDb = openDb(':memory:');
  const live = await createApp(liveDb, { demo: false, web: false });
  try {
    const empty = (await live.inject({ url: '/api/pulse' })).json();
    assert.equal(empty.source, 'live');
    assert.equal(empty.games.length, 0);
    assert.equal(empty.platform.deltaPct, null);
    const emptyTerms = (await live.inject({ url: '/api/terms?kind=tag' })).json();
    assert.equal(emptyTerms.source, 'live');
    assert.equal(emptyTerms.terms.length, 0);
    console.log('Live mode stays empty without collected observations.');
  } finally {
    await live.close();
    liveDb.close();
  }
} finally {
  await app.close();
  db.close();
}
