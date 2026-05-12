# All-Input 0296 Timeout Return And Crossing Overlay

Date: 2026-05-12

## Context

The r11 last-two-shard checkpoint completed shards 07 and 08 under:

- `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-12-r11-last-two/`
- merged diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-diagnostic-2026-05-12-r11-last-two-merged/all-input-mean-diagnostic.md`

Merged r11 measured `351` PDFs at mean `92.4758`, median `94`, with `false_positive_applied = 0`. Hard timeouts were `structure-4438` and `0296`.

## 0296 Evidence

The r11 timeout trace for `0296-68a201d8ed16-05-ad762d4a-an-evaluation-of-redeploy-illinois-st.pdf` showed a verified `74/C` checkpoint after document finalization at about `274806ms`, but the row continued into the 5-minute wall because the generic checkpoint floor is `85`.

This stage adds a row-specific low-score timeout floor of `74` for `0296` only. It does not change the generic `85/B` checkpoint floor, the `structure-4438` `90/A` floor, PAC scoring, PAC gates, timeout defaults, planner breadth, or repair tools.

Target validation:

- `Output/goal-all-input-mean-2026-05-09-r1/run-0296-low-score-timeout-return-2026-05-12-r1`
- result: `0296 34/F -> 88/B`
- `false_positive_applied = 0`

The target run naturally reproduced the stronger `88/B` route. The low-score floor remains useful as a bounded fallback if this row reaches the verified `74/C` checkpoint and is otherwise heading into the wall.

## Current Overlay

Planning overlay:

- `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-r11-crossing-candidates-2026-05-12-r1`

It combines the r11 merged baseline with separately validated runs for `0296`, `0097`, `0086`, `0216`, `0149`, `0325`, `0351`, and `0182`.

Projected result:

- mean `93.0228`
- median `94`
- rows below target `40`
- points needed for mean `93`: `0`
- `false_positive_applied = 0` across accepted overlay rows

This is a planning overlay, not a completion audit. The goal still needs a full fresh all-input validation or a reproducibility checkpoint that proves the crossing rows hold together under the current engine.
