# Official category artwork and trend exploration

Implemented 2026-10-29 after the user's request for real Twitch pictures and chart-based Categories / Keywords & tags pages. The six attached RoTerminal images served as visual references: a subject and context, signed comparison, a large filled line chart with a highlighted endpoint, and ranked rows with cover thumbnails and right-aligned counts. They are design references, not Roblox data or instructions to develop a Roblox game.

## Artwork acquisition with REA

The official `rea-agents@6.8.0` CLI captured the logged-out Twitch directory, then the Hollow Knight: Silksong, Phasmophobia, and Talk Shows & Podcasts category pages. The existing MCP session did not expose REA, so its supported CLI ran in a temporary package environment with Node 26.12.1. It changed no global tool configuration or app dependencies.

Artwork `src`, `alt`, and category-link values were extracted from **REA's DOM artifacts**, not guessed from fixture IDs. Nine known covers appeared in the directory capture; the other three were found in the category-page capture. Both captures are complete and report `terminated-owned-process` cleanup.

- Directory evidence: `ev_93a4bb024365ed2ee13a6b89ede1826d6d672a3fd3351a97f7120192fcd8ea45`.
- Category detail evidence: `ev_7b2116b075c0ef4b397002a3dfd7adffb8f169ad76fe87be5fb6cf2798e49b48`.
- [URL manifest, DOM digests and HTTP checks](rea/category-artwork.json).
- [Directory scenario](rea/twitch-artwork-scenario.json) and [detail scenario](rea/twitch-artwork-detail-scenario.json).

A subsequent HTTP GET verified all twelve normalized 285 × 380 URLs returned 200, an image content type, and `Access-Control-Allow-Origin: *`. The manifest preserves the exact observed URL as well as the dimension-normalized delivery URL. These HTTP checks supplement the REA observations; they are not attributed to REA.

The API uses validated Helix `box_art_url` metadata when available, with a verified name-based mapping for known/demo categories. Some synthetic fixture IDs differ from real Twitch IDs: Dead by Daylight's verified artwork uses `491487`, for example. The fixture IDs were preserved so existing analytics/watchlists remain intact. URLs accept only HTTPS on `static-cdn.jtvnw.net` under `/ttv-boxart/`, with no credentials, query or fragment.

Images load remotely with anonymous CORS and no referrer. Production CSP permits only the Twitch box-art path for image loading and export fetches; scripts/fonts remain restricted to the app origin. The first production pass caught the prior self-only image policy, which was corrected and covered by smoke assertions before these final captures. No standalone cover binaries are bundled. Failed/unavailable images use the existing geometric SVGs; demo-safe mode renders initials without image elements. Official cover artwork belongs to the respective owners and does not change the MIT license of the application code. Real cover images do not make the fictional analytics real.

## Chart behavior

**Categories:** a rising/falling chart pair appears above the cover directory. Genre and search filters apply to both the charts/rankings and the directory. Each card charts its named leading category and lists up to three matching categories with official artwork, signed changes, and average-viewer counts. The cards retain PNG export. A jump link scrolls directly to the cover grid; detail charts and the opportunity map remain available.

**Keywords & tags:** selecting a phrase or tag updates a large daily distinct-channel chart and its related-category ranking. The ranked term list is interactive, and the Title keywords / Tags controls select separate datasets. Week/Month requests update the two comparison windows. Numeric data tables are available from the charts. Existing Title Lab and controlled-lift previews remain below; their window counts use the same term observations.

Live term data counts distinct channels with observed title/tag **metadata updates**, not all continuously active title usage, audience size, or causal lift. UTC day buckets remain gaps when no covered collection exists. Comparisons require observed-hour coverage and prior channel support; opt-outs are excluded. Reads are capped at 25,000 metadata updates and 5,000 candidate terms, and only 24 supported candidates are returned. Limits are disclosed; truncated comparisons are withheld, and incomplete retained days stay blank. The bounded cache expires after 30 seconds and is invalidated after collection or opt-out. See [metric definitions](../METRICS.md#title-and-tag-adoption).

The keyless demo uses deterministic synthetic term cohorts and category associations. Synthetic labels remain visible at the page and card level; it does not pretend that the supplied Roblox examples are Twitch observations.

## Final REA captures

Fresh REA scenarios captured the production demo with real artwork and the new charts. All three are complete and report owned-browser cleanup. [The capture manifest](rea/artwork-trends-captures.json) records the IDs, screenshot digests, byte counts, and committed screenshot paths:

- [Category charts](../screenshots/categories-desktop.png) — `ev_1b8d67a61d02e64e34f2032f6d0d397aa922403d217ba2ce4927213b15094a90`.
- [Title keyword charts](../screenshots/keywords-desktop.png) — `ev_5d833de6a97f1fffa6b13c1cf0473fc6021febfd21b912734cb48e5f6ce06244`.
- [Tag charts](../screenshots/tags-desktop.png) — `ev_975b169ef0fbe0b5679b46869e49eb3cb9a0f5ea38fa1a5f9b2a802669a7b942`.

The corresponding `upswing-*-artwork-trends.json` inputs are committed beside the manifest. Raw envelopes/DOM remain in ignored `docs/design/reference/`. Reproduce with the REA command pattern and artifact extractor in [the earlier layout audit](twitch-style-audit.md#reproduction), substituting these scenario inputs. Reference pages and CDN artwork may change; fresh captures need not reproduce the digests.

The earlier layout screenshot is preserved at [layout-refresh-2026-10-29.png](../screenshots/layout-refresh-2026-10-29.png), keeping its historical capture digest valid as the current screenshots change.

## Verification

- TypeScript, ESLint and **57 tests** passed, including term/window deduplication, coverage/truncation, missing history, opt-out/cache invalidation, malformed tags, deterministic range changes, and artwork URL restrictions.
- Expanded API smoke verifies title/tag routes, ranges, source labels, consistent keyword counts, invalid inputs and empty live mode; the production build passes.
- Browser checks select phrases and tags, switch Week/Month, filter categories, inspect covers and chart data tables, navigate into category detail, use both themes and mobile navigation, and check widths 320, 390, 768, 1024 and 1440 without document overflow on the two updated pages.
- The final production flow had no page or console errors, a seven-row keyword data table, and a DropsEnabled comparison of +16.2% for Week versus +83.3% for Month in the synthetic fixture.
- All twelve covers loaded. Deliberately blocking CDN images exercised SVG fallback; demo-safe mode had zero cover image elements. A real 1080 × 1350 PNG export included official cover thumbnails with no download failure.

These checks establish the local UI/API behavior and public image availability at observation time. No live Twitch account, real collector dataset, OAuth mutation, paid Codex invocation, broadcast or public deployment was exercised.
