# Twitch layout audit

Updated 2026-10-29 for the user's request to move the UI closer to Twitch's dark layout using [REA](https://github.com/morluto/rea).

## Observation method

The initial implementation used Playwright to inspect Twitch's native light/dark tokens. This refresh used **REA 6.8.0's CLI** to capture a logged-out dark [Twitch directory](https://www.twitch.tv/directory), Upswing before the change, and Upswing after it. REA was not exposed as a connected MCP tool, so its supported CLI ran from a temporary directory with `node@26.12.1`. This changed no global MCP configuration or application dependencies.

Each scenario launched a headless Chrome browser with a temporary owned profile, a 1440 × 900 viewport, dark color scheme, and America/Los_Angeles timezone. The Twitch scenario dismissed the visible “Proceed” cookie notice. REA captured screenshots, DOM, accessibility, and URL artifacts. All three final captures report **complete** with **terminated-owned-process** cleanup. A Chrome DevTools browser at the same size supplied the complementary computed-style and geometry measurements below; those measurements are not attributed to REA's pixel comparator.

The app baseline was the prior production build at `a795f6d7f01bd1fc7d92c80e5fc0a784d06c9568`, served at port 3000. The refreshed interface ran in synthetic demo development mode at port 3020. Production-mode checks later verified the new built client at port 3000. Only public, logged-out reference content was inspected. No Twitch CSS, font, logo, or game artwork was downloaded and bundled into the application.

## Measured geometry

Measurements are CSS pixels at 1440 × 900. The browser reserves a 15px vertical scrollbar; Upswing's directory content begins at x=264 after the sidebar and 24px gutter.

| Element             | Twitch dark directory                         | Previous Upswing                 | Refreshed Upswing                                           |
| ------------------- | --------------------------------------------- | -------------------------------- | ----------------------------------------------------------- |
| Header height       | 50                                            | 60                               | 50                                                          |
| Sidebar width       | 240                                           | 224                              | 240; collapses to 50                                        |
| Sidebar background  | `#26262c`                                     | Base panel tone                  | `#26262c`                                                   |
| Base text           | 14px                                          | Smaller dense labels             | 14px; 12–14px metadata                                      |
| Center search       | 356px input + 36px button, 36px high          | Compact search plus range switch | 400px including button, 36px high; range moved below header |
| Browse heading      | 60px / 60px line height                       | 31px page title                  | 60px / 60px line height                                     |
| Genre shortcuts     | Five purple rectangles, 45px high, 6px radius | Small filter pills               | Five purple rectangles, 45px high, 6px radius               |
| Cover geometry      | 213 × 284; 3:4; square corners                | Short rounded covers             | 217.8 × 290.4; 3:4; square corners                          |
| Category metadata   | 14px names; 12px rounded tags                 | Dense dashboard labels           | 14px names; 12px, 20px-high tags                            |
| Sidebar channel row | About 45px; avatar, name/category, audience   | Compressed row                   | 45px; avatar, name/category, average viewers and growth     |

The 4.8px cover-width difference is deliberate: Upswing uses a 12px grid gap instead of Twitch's wider spacing. It keeps five columns at this viewport and original geometric illustrations. The directory title starts higher because Upswing has no advertising banner.

## Color and type reference

These native light/dark tokens were observed during the initial pass; the dark values were checked again during this refresh.

| Token               | Light                                | Dark            | Upswing use                                                        |
| ------------------- | ------------------------------------ | --------------- | ------------------------------------------------------------------ |
| Page                | `#f7f7f8`                            | `#0e0e10`       | Page canvas                                                        |
| Base panel          | `#ffffff`                            | `#18181b`       | Header, inputs, chart panels                                       |
| Alternate surface   | `#efeff1`                            | `#26262c`       | Sidebar and hover surfaces                                         |
| Primary text        | `#0e0e10`                            | `#efeff1`       | Text; light app text uses `#18181b`                                |
| Secondary text      | `#3b3b44`                            | `#d3d3d9`       | App uses independent muted text tokens                             |
| Brand purple        | `#9147ff`                            | `#9147ff`       | Action accent; selected text `#bf94ff` in dark mode                |
| Live red            | `#eb0400`                            | `#eb0400`       | Actual live status only; no red live dot on synthetic sidebar rows |
| Base / display type | Inter / Roobert                      | Inter / Roobert | Locally bundled open-source Inter; no Roobert files                |
| Control geometry    | 4px / 6px radii, 32px default button | Same            | Compact controls; 8px analytics cards                              |

## REA evidence

[Capture manifest](rea/capture-manifest.json) records complete IDs, screenshot SHA-256 digests, byte counts, environment, and cleanup status. The screenshot identities are:

| Capture        | Evidence ID                                                           | Screenshot SHA-256                                                 |
| -------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Twitch dark    | `ev_e9e212a0cff45e61c85834a5aa9943625881d298d4c880522c334837b666d3b7` | `287fcdbf7e639e9009faa83f61f6a84668537021dd989bc913f1b3e8a60fc751` |
| Upswing before | `ev_b8c4863c9196e787a23bd4f7554f9208ea95d3deda76b7d28eb9d997ed87a2be` | `6083e68569aeb1df75a53e0cebe2a4da1568681f81e4cf0c6f99b5ea20ed2d94` |
| Upswing after  | `ev_002996cd5e25630efead16daa9eb7feba18b826a6a54d261e1d2c434126d1f54` | `3fc076b4e102ae066c3772bf87ed52bf1d9474a2880deda209f7113f01a45876` |

REA's actual `compare_web_screenshots` outputs are committed without image payloads:

| Comparison              | Changed pixels at threshold 0 | Mean absolute channel delta | Output                              |
| ----------------------- | ----------------------------- | --------------------------- | ----------------------------------- |
| Upswing before → after  | 970,978 / 1,296,000 (74.92%)  | 44.85                       | [JSON](rea/before-after-diff.json)  |
| Twitch → Upswing before | 975,284 / 1,296,000 (75.25%)  | 42.82                       | [JSON](rea/twitch-before-diff.json) |
| Twitch → Upswing after  | 827,575 / 1,296,000 (63.86%)  | 44.22                       | [JSON](rea/twitch-after-diff.json)  |

**These are pixel differences, not a similarity score or proof of design accuracy.** REA's comparator performs no OCR, semantic layout analysis, or perceptual color correction. Ad placement, original covers, different text, cookie state, and live reference content affect the totals. The lower changed-pixel ratio and higher mean channel delta in the reference comparisons are both reported; neither replaces geometry measurement and visual review. REA also reports that source artifact identity is unavailable for the comparison observation. The supplied screenshot digests identify its input bytes, not the provenance of the websites.

The [after screenshot](../screenshots/categories-desktop.png) is committed byte-for-byte from the REA artifact. Full raw envelopes, DOM, and third-party reference screenshots remain local under ignored `docs/design/reference/`. No third-party reference imagery is shipped as a product asset.

## Reproduction

The [Twitch scenario](rea/twitch-scenario.json), [before scenario](rea/upswing-before.json), and [after scenario](rea/upswing-after.json) contain the actual inputs. They use the Windows Chrome executable path; edit that path for another host. Start the baseline revision on port 3000 and the refreshed demo on port 3020 in separate checkouts. Each must finish loading before capture. The baseline input is historical and is not expected to recreate the old layout against the current build.

Run from the repository root, writing large outputs only to ignored local storage:

```sh
npx --yes --package=node@26.12.1 --package=rea-agents@6.8.0 rea capture-browser-scenario docs/design/rea/twitch-scenario.json --json > docs/design/reference/twitch-evidence.json
node docs/design/rea/extract-screenshot.mjs docs/design/reference/twitch-evidence.json docs/design/reference/twitch-dark

npx --yes --package=node@26.12.1 --package=rea-agents@6.8.0 rea capture-browser-scenario docs/design/rea/upswing-after.json --json > docs/design/reference/after-evidence.json
node docs/design/rea/extract-screenshot.mjs docs/design/reference/after-evidence.json docs/design/reference/after

npx --yes --package=node@26.12.1 --package=rea-agents@6.8.0 rea compare-web-screenshots docs/design/reference/twitch-dark.artifact.json docs/design/reference/after.artifact.json --json
```

Create `docs/design/reference/` first in a fresh checkout. Twitch can change; a cookie notice may already be absent or have different wording. Inspect the actual reference and adjust that action if needed. Fresh captures are not expected to reproduce these hashes. Node 26 here is only the temporary REA CLI runtime; the application's Node requirement did not change.

## Product differences and validation

Upswing retains its own arrow mark, original covers, analytics, audience-size controls, source disclosures, and independently branded copy. It does not add fake login/sign-up controls, live badges, ad slots, or a Twitch join banner. The sidebar shows observed rising streamers and average viewers rather than pretending to be a live followed-channel list. Workspace navigation stays in the sidebar; main discovery pages use underline tabs below the header. Week/Month remain available on every screen.

Browser checks exercised genre filtering, search and Enter submission, cover/table view, category detail, sidebar collapse/expand, mobile drawer navigation and dismissal, watchlist behavior, themes, and comparison updates. At widths 320, 390, 580, 768, 1024, 1100, 1440, and 1920 the category page had no document horizontal overflow and the source label remained visible. Pulse was checked at desktop and 390px mobile. Screenshots in `docs/screenshots/` record the refreshed interface in dark/light and desktop/mobile. These local checks do not establish live Twitch, OAuth, Codex, deployment, or OBS-broadcast behavior.
