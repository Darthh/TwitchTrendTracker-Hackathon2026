import 'dotenv/config';
import { z } from 'zod';
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
export const config = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.string().default('127.0.0.1'),
    PUBLIC_URL: z.string().url().default('http://localhost:3000'),
    TWITCH_CLIENT_ID: z.string().default(''),
    TWITCH_CLIENT_SECRET: z.string().default(''),
    TWITCH_REDIRECT_URI: z.string().url().default('http://localhost:3000/auth/twitch/callback'),
    TOKEN_ENC_KEY: z.string().default(''),
    SESSION_SECRET: z.string().default(''),
    MIN_VIEWERS: z.coerce.number().int().min(0).default(15),
    MAX_PAGES: z.coerce.number().int().min(1).max(1000).default(400),
    POLL_INTERVAL_MIN: z.coerce.number().min(1).default(10),
    WATCHED_POLL_SEC: z.coerce.number().min(30).default(120),
    DEEPSCAN_GAMES: z.coerce.number().int().min(0).max(300).default(150),
    RAW_RETENTION_DAYS: z.coerce.number().int().min(1).default(21),
    WORKER: bool.default(true),
    CODEX_LIVE: bool.default(false),
    CODEX_API_KEY: z.string().default(''),
    CODEX_MODEL: z.string().default(''),
    CODEX_MAX_RUNS_PER_HOUR: z.coerce.number().int().min(1).max(100).default(10),
  })
  .parse(process.env);
