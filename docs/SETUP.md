# Live setup and operations

[Back to the project overview](../README.md)

The keyless demo needs no credentials. This guide covers the optional live integrations; they still require authorized-account and deployment verification.

## Start real data without Twitch credentials

Use [the real-data collection guide](REAL_DATA.md). `npm run collect:twitchtracker:once` saves a due batch from TwitchTracker's documented API to `data/upswing.db`; `npm start` serves real summaries at `/`. `npm run collection:schedule` installs the Windows recovery task. No paid host or API key is required for this provider. The PC must be awake and the user logged in for that schedule.

The summary API is separate from direct Twitch audience/title/tag collection. The variables `TWITCHTRACKER_ENABLED`, `TWITCHTRACKER_INTERVAL_MIN`, `TWITCHTRACKER_CHANNELS` and `TWITCHTRACKER_CATEGORIES` configure it; see `.env.example`. The default cadence is 60 minutes and cannot be set below that.

## Twitch setup

1. Register an app in [Twitch Developer Console](https://dev.twitch.tv/console/apps). Set its OAuth redirect to `http://localhost:3000/auth/twitch/callback` for local use. Use the same origin in `PUBLIC_URL` and your browser.
2. Copy `.env.example` to `.env`. Set your client ID and secret. Generate a fresh 32-byte hex value for **each** of `TOKEN_ENC_KEY` and `SESSION_SECRET` with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep this file local.
3. Run `npm run build` and `npm start`. With credentials and `WORKER=true`, the collector starts automatically. `npm run dev` uses Vite middleware/HMR in the same process.
4. Run `npm run collect:once` to inspect a poll, then `npm run backfill:clips` for the top 300 categories across eight weeks. `npm run collect` is an alternative standalone worker; a database lease prevents concurrent global polls. On a separate web process use `WORKER=false`.
5. Connect Twitch. Basic login requests no write scopes. Enable permissions from **My Channel** only when needed. Review the title/category diff or raid target before confirming. Chat replies are sent as the authenticated broadcaster; a separate bot-account flow is not implemented.

Live data starts empty. Twitch does not supply historical concurrent audience data. Full Week comparisons require two covered weeks; Month requires two covered 30-day windows. Until then, supported partial comparisons are labeled with the actual baseline; otherwise change is unavailable. Keeping the collector running is your deployment responsibility.

### Environment

| Variable                                              | Purpose / default                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`            | Live Helix collection and OAuth; server only                                               |
| `TWITCH_REDIRECT_URI`                                 | `http://localhost:3000/auth/twitch/callback`                                               |
| `TOKEN_ENC_KEY`                                       | 64 hex characters; AES-256-GCM key for tokens at rest                                      |
| `SESSION_SECRET`                                      | At least 32 characters; signed httpOnly SameSite=Lax cookies                               |
| `PUBLIC_URL`                                          | Canonical origin, default `http://localhost:3000`; mutation Origin checks use it           |
| `PORT`, `HOST`                                        | `3000`, `127.0.0.1`; container sets HOST to `0.0.0.0`                                      |
| `POLL_INTERVAL_MIN`, `WATCHED_POLL_SEC`               | Global poll every 10 minutes; connected-channel poll every 120 seconds                     |
| `MIN_VIEWERS`, `MAX_PAGES`                            | Global pagination floor 15; cap 400 pages; sample coverage is not the entire platform      |
| `DEEPSCAN_GAMES`                                      | 150; category scans distributed across the hour                                            |
| `RAW_RETENTION_DAYS`                                  | 21; hourly/daily rollups remain                                                            |
| `WORKER`                                              | `true`; `false` disables the collector in the web process                                  |
| `CODEX_API_KEY`, `CODEX_MODEL`                        | Optional server-side Codex API key/model; no live calls by default                         |
| `CODEX_LIVE`, `CODEX_ISOLATED`                        | Both must be `true` on an isolated Linux deployment to allow the SDK runner; default false |
| `CODEX_MAX_RUNS_PER_HOUR`                             | Global limit 10; at most two live analyses concurrently; public route limit 12 per IP/hour |
| `BOT_USERNAME`                                        | Reserved; current bot sends as the connected broadcaster                                   |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_WEB_SEARCH` | Reserved for optional outside-news context; not used in this build                         |

### Scopes

| Enable from My Channel    | Requested scopes                    | Why                                                               |
| ------------------------- | ----------------------------------- | ----------------------------------------------------------------- |
| Basic login               | None                                | Public profile and a private app session                          |
| Authorize channel editing | `channel:manage:broadcast`          | Apply title/category; server also accepts validated optional tags |
| Authorize raids           | `channel:manage:raids`              | Raid only from the authenticated broadcaster                      |
| Authorize chat            | `user:read:chat`, `user:write:chat` | EventSub command reads and chat replies as that broadcaster       |

Permissions are incremental; previously granted scopes are retained on reauthorization. Tokens are refreshed server-side, encrypted at rest and never returned to the browser. Mutations require same-origin requests and explicit confirmation. Opt-out excludes the connected channel from named analytics, future collection and analyst snapshots; aggregate historical category totals remain anonymous.

## Runtime analyst

The implementation uses the installed [Codex TypeScript SDK](https://developers.openai.com/codex/sdk) and its inspected TypeScript definitions. It sends `runStreamed` progress through SSE and validates structured output with Zod. The SDK includes the Codex CLI dependency; see `npm ls @openai/codex`.

Live execution is **disabled on Windows and by default everywhere**. Before enabling it, use a dedicated Linux container/host without unrelated secrets or host mounts, verify its sandbox supports deny-read filesystem rules, and validate it with your own API account. A boolean flag does not create OS/container isolation. This session did not exercise a paid live run or prove a deployed sandbox.

The runner supplies a clean temporary HOME, scrubbed SDK environment, no inherited tool-shell environment, a named read-only filesystem profile that denies the root and grants only runtime libraries, the public analyst workspace and dependencies, disabled tool networking/web search, a 120-second deadline, and no approvals. Unsupported sandbox settings fail into the rules fallback. Do not relax sandbox settings to make a deployment pass.

Only public tables enter `analyst/db/upswing-ro.db`. A SQLite in-memory projection is saved with the backup API and atomically installed; accounts, sessions, tokens and user prompts never enter the snapshot. SQL must be one bounded SELECT against an approved table, with no joins/subqueries/extensions/writes. A read-only worker is terminated on timeout. Every accepted numeric finding is queried again. The app constructs displayed numeric claims from verified result fields and withholds unchecked model narrative/charts.

`npm run warm-codex -- --demo` warms eight deterministic **rules** answers. Live `npm run warm-codex` can cache real runs only after the isolated runtime is configured. No real Codex results are fabricated. Monday 9 AM Pacific and first-of-month 9 AM jobs can store reports while the server is running. Simple threshold alerts run hourly after approval; complex natural-language SQL compilation was cut.

## Hosting

**Always-on service:** build the included Dockerfile, attach persistent volumes at `/app/data` and `/app/analyst/db`, set environment secrets in the host, `HOST=0.0.0.0`, and `PUBLIC_URL`/redirect URI to your HTTPS origin. Run one collector process. Railway, Render or Fly can host this pattern; no paid service was created or deployed by this implementation. The container recipe has not been run in this Windows session.

**Your PC + Cloudflare Tunnel:** keep `npm start` running and use your own tunnel to `http://localhost:3000`; update PUBLIC_URL and the Twitch redirect to the HTTPS tunnel hostname before connecting accounts. Use an always-on PC and stable tunnel if judges need access. Do not enable live Codex on this Windows host.
