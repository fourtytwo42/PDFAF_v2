# All-Input Progress Overlay

The all-input `/goal` uses a broad 351-PDF deterministic baseline plus targeted validations. Full
reruns are expensive, so `scripts/all-input-progress-overlay.ts` merges trusted targeted run
results over the baseline to estimate current mean movement and select the next diagnostic lane.

Current overlay:

- Baseline root: `Output/goal-all-input-mean-2026-05-09-r1/shard-runs`
- Overlay run: `Output/goal-all-input-mean-2026-05-09-r1/run-heading-sequence-parent-targets-2026-05-09-r1`
- Output: `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-sequence-parent-2026-05-09-r2`

## Current Estimate

| Metric | Baseline | Overlay |
| --- | ---: | ---: |
| Mean | `88.5214` | `88.9373` |
| Median | `93` | `93` |
| Rows below target | `136` | `132` |
| Points needed for mean 93 | `1572` | `1426` |
| Runtime p95 ms | `351416` | `351416` |

Applied overlays:

- `0032`: `59/F -> 97/A`
- `0033`: `59/F -> 94/A`
- `4646`: `59/F -> 97/A`
- `4593`: `59/F -> 94/A`

All applied overlay rows had `false_positive_applied = 0` in targeted validation.

## Next Selection

Target selection after this overlay is at
`Output/goal-all-input-mean-2026-05-09-r1/target-selection-after-sequence-parent-2026-05-09-r1`.
The selected direction remains `heading_reading_recovery_target`, now with `17` rows and `588`
remaining deficit points. Table/header and alt debt remain second-tier score lanes.

Do not treat the overlay as final acceptance evidence; it is a planning artifact that avoids rerunning
all 351 PDFs after every small targeted change. Any behavior change still needs targeted validation,
and broad all-input validation is needed before claiming the mean goal is actually met.
