# Implementation and evidence

Updated 2026-10-29, America/Los_Angeles.

## Implemented

- One-process Node/TypeScript Fastify service and React/Vite client; SQLite WAL and persistent local data.
- Rate-limited Helix app-token client, retry/reset behavior, broadcast-ID deduplication, global polling with a cross-process lease and heartbeat, two-missed-poll session closure, change-only stream metadata, watched-channel observations kept separate from global rollups, hourly/daily rollups, retention, enrichment and category scans.
- Eight-week top-100 clip backfill for up to 300 categories; clear clip-view labeling. IGDB release/genre/theme adapter and attribution.
- Full/partial Week and Month comparison engine, sampled-platform relative deltas, support thresholds, breakout/raid/tokenization/lift/opportunity utilities, exact supply/demand identity, leave-one-out and flow-conservation utilities.
- Pulse, category browse/table/search/filter, category and streamer detail, Opportunity, keywords/Title Lab, Ask, Reports, Alerts, My Channel, About Data and Styleguide screens. Original SVG art, local open-source Inter, two themes, watchlists, mobile navigation, keyboard focus, reduced motion and chart data tables.
- Trend-card PNG export, area/sparkline, treemap, scatter, waterfall, bars and local-time heatmap charts.
- Optional Codex SDK streaming/caching path, schema validation, public-only snapshots, strict SQL guard, timed read-only workers, numeric re-query checks, global/concurrent/daily/IP quotas, rules fallback. Live execution requires Linux + explicit configuration and isolation.
- Rules-based reports, scheduled Monday/first-of-month jobs, approved hourly threshold rules and alert-hit storage.
- OAuth state, signed httpOnly cookies, AES-256-GCM encryption, token refresh, incremental scopes, same-origin mutation guard, own-channel edit/raid/bot routes and explicit UI confirmations. Edit preview shows current/proposed title/category; omitted tags stay intact.
- EventSub chat adapter with replay deduplication, reconnect/backoff/watchdog, moderator/broadcaster-only ask, message caps and cooldowns; persistent bot opt-in. Mock chat makes no Twitch writes.
- Transparent OBS ticker/momentum/card/alert browser sources. Sample overlays replay fixture values, explicitly labeled synthetic; this is not replay of real collected polls.
- Source brief, README, design evidence audit, demo/submission drafts, CI and manual Codex review workflow, Docker recipe.

## Verification completed in this session

- `npm run check`: TypeScript + ESLint + **50 Vitest tests passed** before the final delivery pass.
- `npm run smoke`: Pulse, cards, map, games, keywords, Opportunity, heatmap, streamers, reports and health returned 200 with synthetic data; Week/Month differ; cached analyst returns correctly labeled rules output; invalid ranges and unauthorized/foreign-origin writes are rejected.
- `npm run report -- --demo`: real command output from the synthetic database, with both ranges and exact decomposition. It was not represented as real Twitch data.
- `npm run warm-codex -- --demo`: eight local rules answers persisted with `source: rules`; no API charge or real Codex run.
- Browser at 1440 × 900: Pulse, category browse/detail, six detail charts, exact decomposition/waterfall, Week/Month recomputation, Ask result and caveats, Title Lab, threshold backtest/approval, mock `!trending` reply, and PNG download with no download error.
- Mobile 390 × 844: Pulse has no document horizontal overflow. Screenshots are committed under `docs/screenshots/`. Final responsive checks are recorded in CODEX_LOG.
- Public Twitch design tokens were read from logged-out light/dark directory DOM; no official Twitch/game asset files are bundled.

Fresh-checkout validation also passed: clean `npm ci`, all 50 tests, API smoke, production build, and actual `npm run demo` startup plus browser/API verification on a temporary port. See CODEX_LOG for the exact evidence. A fresh checkout is not a separate clean OS or hosted-deployment test.

## 2026-10-29 layout and documentation refresh

The interface now follows the measured Twitch dark directory proportions: 50px top bar, 240px sidebar, larger type, purple genre shortcuts and square-cornered 3:4 covers. Light mode and responsive navigation remain available, and synthetic-data labels stay visible at all checked widths. The README follows AgentHandshake's visual/documentation structure, with separate [setup](SETUP.md) and [metrics](METRICS.md) guides.

REA 6.8.0 CLI captures and comparisons were run in owned temporary browsers; all three final captures are complete and report cleanup. [The design audit](design/twitch-style-audit.md) links the actual scenario inputs, manifest, exact pixel comparison outputs and limitations. This supersedes the initial pass's lack of REA evidence. Local browser checks and the existing test/build/smoke suite were rerun for this refresh; external integration status below is unchanged.

## Deliberate cuts and remaining product depth

The supplied brief allows cuts to protect the core. This build omits candlesticks, arbitrary custom chart authoring/pinning, full weekly growth-plan scheduling/title/feedback loops (a labeled shortlist exists), complex natural-language alert SQL generation, complete raid fit by category/language, automatic 30-minute change-impact attribution, migration Sankey, and outside-news phrasing/search. The UI does not claim these exist. Live keywords show support counts but withhold controlled lift without enough controls. Streamer consistency currently describes covered hours above baseline, not session-level consistency; the UI labels it that way. Opportunity uses the latest category scan in the selected history, not a personalized Twitch sort. All-axis language segmentation, session timelines/title-history deep dives, a separate bot identity and real recorded-poll replay remain follow-up depth.

Driver detectors have pure tests, but only supported release/clip/platform evidence is connected to the current rules report. Unwired Drops/event/migration/schedule drivers are not invented in UI reports. Contributor bars represent measured average-viewer changes, not a causal allocation; the remainder is explicit.

Interactive materialization is bounded to 300 categories and 500 growth candidates plus connected channels. The platform baseline sums all collected categories, while leaderboard positions describe this observed candidate pool. Historical rollups remain stored beyond the selected query windows.

## Not externally verified

No Twitch app credentials, authorized test channel, real collected dataset or API key were supplied. Consequently no live collector request, OAuth login/refresh, bot subscription/reply, own-channel change/raid, real Codex run, deployed filesystem/network sandbox, durable hosted worker, OBS broadcast, public deployment, public video or hackathon submission was exercised. Docker/CI workflows are provided but were not run on their target services. This application is a locally verified core implementation, not proof that the original live hackathon submission criteria have been satisfied.
