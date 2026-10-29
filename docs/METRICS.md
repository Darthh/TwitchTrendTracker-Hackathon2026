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
