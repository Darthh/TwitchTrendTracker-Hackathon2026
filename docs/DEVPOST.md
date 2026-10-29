# Upswing

**See what’s taking off on Twitch, and why.**

This is a draft. Replace placeholders and validate the current contest rules before submitting. No Devpost submission or public video was created by this coding task.

## Inspiration

Small streamers do not need only a list of the biggest categories. They need context: where audience demand is rising, how competitive a category is at their size, and what the numbers actually support.

## What it does

Upswing combines a trend-card dashboard, category market map, Week/Month comparisons, rising streamer rankings, and size-aware Opportunity scores. Category detail connects audience timelines to an exact supply/demand decomposition and an average-viewer waterfall. Unknown causes remain unknown.

Ask Upswing offers an always-available rules analyst and an optional Codex SDK runtime. Title Lab offers honest title drafts with a clarity heuristic. Reports summarize the selected range. Threshold alerts are backtested before approval. My Channel includes mock chat, OBS browser-source links, and OAuth-protected interfaces for own-channel edits, raids and bot opt-in.

## How we built it

Codex built the repository from its initial license-only state in one thread: Node/TypeScript, Fastify, React/Vite, ECharts, SQLite WAL, Zod, and Vitest. The work included pure numerical utilities, a rate-limited collector, UI design, API contracts, security tests, source documentation, browser verification and Git delivery. The original brief is preserved in `docs/PROMPT.md`. No parallel coding agents were used.

Runtime integration uses the Codex TypeScript SDK, streamed steps, a public-only read-only snapshot, a strict SQL guard and killable query worker, and independent numeric checks. Live execution is disabled by default and requires an isolated Linux deployment. The supplied sample edition contains synthetic fixtures and deterministic rules answers; it does not contain fabricated live observations or recorded Codex responses.

The visual design reimplements observed public Twitch token values with open-source Inter and original SVG geometry. The audit records a logged-out Playwright inspection in both themes. REA was not exposed by the build environment and was not used.

## Challenges

Twitch has no concurrent-viewer history API. Upswing therefore collects its own observations, distinguishes clips from viewer history, tests daily-cycle cancellation, and labels partial comparisons. Pagination can duplicate streams; the collector deduplicates by broadcast ID. A verified numeric field is not proof of model-written narrative, so unchecked prose and chart datasets are withheld in the live analyst path.

## Accomplishments

- A coherent keyless sample application with real interactive filtering, analysis, card export, mock chat and overlays.
- Tested coverage-weighted comparisons, size-aware scoring and exact decomposition.
- Explicit boundaries among synthetic data, rules output, live Twitch actions and independently checked Codex results.
- An implementation log, repeatable checks, screenshots, and a scoped review workflow.

## What we learned

The useful product question is personal: “where could I get found?” The useful engineering question is evidentiary: “what can this observation actually establish?” A polished demo is stronger when its limitations are legible.

## What’s next

Collect durable real history; validate OAuth, chat replies and OBS on the authorized test channel; validate the Linux analyst sandbox; add real cached Codex runs; refine language/category raid fit, live keyword controls, richer context and feedback from plans to outcomes.

## Testing instructions

`npm install` then `npm run demo`; open http://localhost:3000. No keys required. See README for live environment configuration. Run `npm run check` and `npm run smoke` for local verification. The demo disables all Twitch writes. The live adapters need your own Twitch app and explicit user authorization.

## Before submission

- Codex session ID: **copy the actual session ID from your Codex interface; unavailable as a tool field in this session.**
- Repository: https://github.com/Darthh/TwitchTrendTracker-Hackathon2026
- Public demo URL: **not deployed in this task.**
- Public video URL: **not recorded/uploaded in this task.**
- Authorized live Twitch demonstration: **not yet recorded.**
- Real Codex runtime footage and cache: **not yet produced.**
- Confirm registration, deadline, API terms, asset permissions and video length against the current official contest page; the brief’s claims were not treated as verified contest rules.
