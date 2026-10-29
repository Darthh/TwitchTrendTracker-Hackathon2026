import { z } from 'zod';
import { config } from '../server/config.js';
const tokenSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  scope: z.array(z.string()).optional(),
});
export const streamSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  user_login: z.string(),
  user_name: z.string(),
  game_id: z.string(),
  game_name: z.string(),
  title: z.string(),
  tags: z.array(z.string()).default([]),
  viewer_count: z.number().int().min(0),
  started_at: z.string(),
  language: z.string(),
  is_mature: z.boolean().default(false),
  thumbnail_url: z.string().default(''),
});
export type TwitchStream = z.infer<typeof streamSchema>;
export const streamsPage = z.object({
  data: z.array(streamSchema),
  pagination: z.object({ cursor: z.string().optional() }).default({}),
});
export class Helix {
  private token = '';
  private expires = 0;
  private remaining = 800;
  private reset = 0;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private fetcher: typeof fetch = fetch,
    private sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  ) {}
  async appToken() {
    if (this.token && Date.now() < this.expires - 60_000) return this.token;
    if (!config.TWITCH_CLIENT_ID || !config.TWITCH_CLIENT_SECRET)
      throw new Error('Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in .env to collect live data.');
    const response = await this.fetcher('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: config.TWITCH_CLIENT_ID,
        client_secret: config.TWITCH_CLIENT_SECRET,
        grant_type: 'client_credentials',
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Twitch token request failed (${response.status})`);
    const data = tokenSchema.parse(await response.json());
    this.token = data.access_token;
    this.expires = Date.now() + data.expires_in * 1000;
    return this.token;
  }
  request<T>(path: string, schema: z.ZodType<T>, options: RequestInit = {}, userToken?: string): Promise<T> {
    const job = this.queue.then(async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        if (this.remaining <= 3 && this.reset > Date.now()) await this.sleep(this.reset - Date.now() + 100);
        const token = userToken ?? (await this.appToken());
        const response = await this.fetcher(`https://api.twitch.tv/helix/${path}`, {
          ...options,
          headers: {
            'Client-Id': config.TWITCH_CLIENT_ID,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(25_000),
        });
        this.remaining = Number(response.headers.get('Ratelimit-Remaining') ?? 800);
        this.reset = Number(response.headers.get('Ratelimit-Reset') ?? 0) * 1000;
        if (response.status === 429) {
          await this.sleep(Math.max(1000, this.reset - Date.now() + 100));
          continue;
        }
        if (response.status >= 500) {
          await this.sleep(Math.min(15000, 500 * 2 ** attempt) + Math.random() * 200);
          continue;
        }
        if (response.status === 401 && !userToken) {
          this.expires = 0;
          continue;
        }
        if (!response.ok) throw new Error(`Twitch request failed (${response.status})`);
        return schema.parse(response.status === 204 ? {} : await response.json());
      }
      throw new Error('Twitch request exhausted retries; the next scheduled poll will retry.');
    });
    this.queue = job.catch(() => {});
    return job;
  }
  get rateRemaining() {
    return this.remaining;
  }
}
export const helix = new Helix();
export function dedupeStreams(streams: TwitchStream[]) {
  return [...new Map(streams.map((s) => [s.id, s])).values()];
}
