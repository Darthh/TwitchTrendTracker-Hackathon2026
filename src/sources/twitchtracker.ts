import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { SourceKind } from '../shared/types.js';
const count = z.number().finite().nonnegative();
const categorySchema = z.object({
  avg_viewers: count,
  avg_channels: count,
  rank: count,
  hours_watched: count,
});
const channelSchema = z.object({
  rank: count,
  minutes_streamed: count,
  avg_viewers: count,
  max_viewers: count,
  hours_watched: count,
  followers: z.number().finite(),
  followers_total: count,
});
export function summaryUrl(kind: SourceKind, key: string) {
  if (!(kind === 'category' ? /^\d{1,15}$/ : /^[a-zA-Z0-9_]{1,25}$/).test(key))
    throw new Error('Invalid TwitchTracker entity identifier.');
  return `https://twitchtracker.com/api/${kind === 'category' ? 'games' : 'channels'}/summary/${encodeURIComponent(key)}`;
}
export function parseSummary(kind: SourceKind, value: unknown): Record<string, number> {
  return (kind === 'category' ? categorySchema : channelSchema).parse(value);
}
export class SummaryRateLimit extends Error {
  constructor(public retryAfterMs: number) {
    super('TwitchTracker rate limited collection; cooling down.');
  }
}
export class TwitchTracker {
  constructor(
    private fetcher: typeof fetch = fetch,
    private sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  ) {}
  async summary(kind: SourceKind, key: string) {
    const url = summaryUrl(kind, key);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.fetcher(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent':
            'Upswing/1.0 (+https://github.com/Darthh/TwitchTrendTracker-Hackathon2026; public summary collector)',
        },
        signal: AbortSignal.timeout(20_000),
        redirect: 'error',
      });
      if (response.status === 429) {
        const header = response.headers.get('retry-after'),
          seconds = Number(header);
        const delay =
          header && Number.isFinite(seconds)
            ? seconds * 1000
            : header
              ? Date.parse(header) - Date.now()
              : 3600000;
        await response.body?.cancel();
        throw new SummaryRateLimit(Math.max(60_000, Number.isFinite(delay) ? delay : 3600000));
      }
      if (response.status >= 500 && attempt === 0) {
        await response.body?.cancel();
        await this.sleep(1000);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`TwitchTracker request failed (HTTP ${response.status}).`);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error('TwitchTracker returned an empty response.');
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 65536) throw new Error('TwitchTracker response exceeded its size limit.');
          chunks.push(value);
        }
      } catch (e) {
        await reader.cancel();
        throw e;
      } finally {
        reader.releaseLock();
      }
      const raw = Buffer.concat(chunks);
      let value: unknown;
      try {
        value = JSON.parse(raw.toString('utf8'));
      } catch {
        throw new Error('TwitchTracker returned invalid JSON.');
      }
      const parsed = (kind === 'category' ? categorySchema : channelSchema).safeParse(value);
      if (!parsed.success) throw new Error('TwitchTracker response did not match the public summary schema.');
      return { metrics: parsed.data, sourceUrl: url, sha256: createHash('sha256').update(raw).digest('hex') };
    }
    throw new Error('TwitchTracker request failed after retry.');
  }
}
