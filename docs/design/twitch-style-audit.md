# Twitch style audit

Observed 2026-10-29 in a logged-out Playwright browser at 1440 × 900 on [Twitch Directory](https://www.twitch.tv/directory). The supplied brief requested REA, but no REA tools were exposed in this session; Playwright DOM inspection and native theme controls supplied the evidence. No CSS or font files from Twitch were downloaded or bundled. The two RoTerminal screenshots mentioned in the brief were not attached, so the written card anatomy was the layout reference.

Evidence IDs: **L1** is the computed style of `document.documentElement` with `tw-root--theme-light`. **D1** is the same inspection after User Menu → Dark Theme, with `tw-root--theme-dark`. Both had a 10px root font. A local screenshot is in ignored `docs/design/reference/directory-dark.png`; it contains third-party imagery and is deliberately excluded from the deliverable.

| Observed token                      | Light (L1)    | Dark (D1)     | Upswing use                                                             |
| ----------------------------------- | ------------- | ------------- | ----------------------------------------------------------------------- |
| `--color-background-body`           | `#f7f7f8`     | `#0e0e10`     | Page background                                                         |
| `--color-background-base`           | `#ffffff`     | `#18181b`     | Panels, nav and cards                                                   |
| `--color-background-alt`            | `#efeff1`     | `#26262c`     | Hover and selected surfaces                                             |
| `--color-text-base`                 | `#0e0e10`     | `#efeff1`     | Primary type                                                            |
| `--color-text-alt-2`                | `#3b3b44`     | `#d3d3d9`     | Reference; app secondary text softened to independent accessible tokens |
| `--color-twitch-purple`             | `#9147ff`     | `#9147ff`     | Independent purple accent                                               |
| `--color-fill-live`                 | `#eb0400`     | `#eb0400`     | Live-only status                                                        |
| `--font-base`                       | Inter first   | Inter first   | Bundled open-source Inter from Fontsource                               |
| `--font-display`                    | Roobert first | Roobert first | Substituted open-source Inter; Roobert is not bundled                   |
| `--font-size-base`                  | `1.4rem`      | `1.4rem`      | Observed 14px; dense app content uses 11–14px                           |
| `--border-radius-medium`            | `0.4rem`      | `0.4rem`      | 4px compact elements, 6px buttons                                       |
| `--border-radius-large`             | `0.6rem`      | `0.6rem`      | Buttons and controls                                                    |
| `--border-radius-extra-extra-large` | `1.6rem`      | `1.6rem`      | 16px trend cards                                                        |
| `--button-size-default`             | `3.2rem`      | `3.2rem`      | 32–35px controls                                                        |

Design plan: near-black canvas, layered charcoal surfaces, purple navigation, signed mint/red trend indicators. Left-aligned Inter headings, tabular numbers, dense category browsing, and 4:5 exportable chart cards. The distinctive element is the linked market map and audience-size opportunity treatment. Original geometric SVG covers replace third-party game art; demo-safe mode reduces them to initials.

The finished Categories screen was visually reviewed against the observed directory at the same viewport: page/panel palette, purple actions, browse density and category hierarchy align. Deliberate differences: analytics sidebar in place of followed channels, a 60px top bar to fit range controls, rounded original covers, and charts below the grid. This is a human/agent visual comparison, not an automated REA pixel-difference result. `/styleguide` exposes both themes and the component kit.
