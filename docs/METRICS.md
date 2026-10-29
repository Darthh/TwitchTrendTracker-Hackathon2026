# Metric definitions

[Back to the project overview](../README.md)

- **Week / Month:** coverage-weighted hourly means over 7/30 days versus the preceding 7/30 days. Full comparisons require 90% coverage in both windows. Partial Week uses separate complete daily blocks, preferring matching weekday; partial Month uses separate first/last complete tracked weeks.
- **Relative change:** `(1 + categoryChange) / (1 + sampledPlatformChange) − 1`. Both signed absolute and percentage changes are shown.
- **Support:** category average ≥200 in both windows; channel baseline ≥50 and two broadcasts in each window; keyword ≥15 distinct channels.
- **Breakout:** `log2(current / previous) × min(1, sessions / 3)`, current average ≥100. Raid patterns use +40% and +100 viewers; retained spikes require 30 minutes above 1.3× baseline with continuous observations.
- **Opportunity:** percentile-weighted discoverability 35%, relative growth 25%, smaller-channel demand 25%, audience distribution 15%. Deep scans and supported comparisons are required. Directory rank is an estimate, not a promised search position.
- **Why:** exact log supply/demand identity; measured channel contributions; an explicit unattributed remainder. The UI never invents external causes. Migration flow math exists with conservation tests; a user-facing Sankey was cut.
- **Titles:** multilingual tokenization, commands, emoji, bigrams and within-channel median lift utilities. Live keyword lift is withheld without controls; sample lifts are synthetic. Title Lab scores clarity heuristically, not expected growth.
- **Best time:** observed average viewers per channel by local day/hour, with missing cells left empty. This is descriptive demand/supply, not a causal recommendation.

## Title and tag adoption

`/api/terms` counts distinct channels with observed title/tag metadata updates over the selected 7/30-day window and its preceding window. Title tokenization excludes the current game's and broadcaster's name, applies multilingual stopwords, and includes phrases; tags are normalized and deduplicated case-insensitively. A broadcaster counts once per term per day/window/category even after repeated updates. A channel can appear in multiple categories, so category counts need not sum to the window total.

These counts describe observed metadata changes, not all channels continuously using an unchanged title/tag, viewer totals, controlled lift, or causal performance. Daily buckets use UTC. Dates with no covered collection hour render as gaps, and no absent history is generated. Full comparisons require 90% observed-hour coverage in both windows and at least 15 prior observed channels. A term needs at least 15 channels in either window to appear. Coverage here means hours containing a successful poll, not a guarantee of exhaustive Twitch sampling or complete within-hour coverage.

Queries exclude opted-out channels, bound reads to the two windows, and cap input at 25,000 metadata updates and 5,000 candidate terms. A truncated query is labeled, withholds percentage comparisons, and renders incompletely retained days as gaps. Counts from a limited candidate pool are lower bounds. Up to 24 terms are selected by observed channel support; the UI ranks that candidate pool by supported growth. Live controlled title lift remains unavailable without controls. The older weekly title rollup remains stored for analyst queries, with its own weekly/update-only basis.

The demo uses deterministic nested synthetic channel cohorts for daily counts and window totals. Its existing keyword table uses these same window counts, while its controlled lift remains an explicitly synthetic fixture. The demo's category associations are fictional. Real Twitch artwork is independent of this data provenance.
