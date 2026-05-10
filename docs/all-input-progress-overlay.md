# All-Input Progress Overlay

The all-input `/goal` uses a broad 351-PDF deterministic baseline plus targeted validations. Full
reruns are expensive, so `scripts/all-input-progress-overlay.ts` merges trusted targeted run
results over the baseline to estimate current mean movement and select the next diagnostic lane.

Current overlay:

- Baseline root: `Output/goal-all-input-mean-2026-05-09-r1/shard-runs`
- Output: `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-near-pass-87-89-current-2026-05-10-r1`

## Current Estimate

| Metric | Baseline | Overlay |
| --- | ---: | ---: |
| Mean | `88.5214` | `91.7521` |
| Median | `93` | `93` |
| Rows below target | `136` | `91` |
| Points needed for mean 93 | `1572` | `438` |
| Runtime p95 ms | `351416` | `351023` |

Recently added validation overlays:

- Near-pass current repeat `Output/goal-all-input-mean-2026-05-09-r1/run-near-pass-current-targets-2026-05-10-r1` moved the stale `87/B` set to mostly `93-94/A`, with `0127` only `88/B` and `false_positive_applied=0`.
- Near-pass `87-89` current repeat `Output/goal-all-input-mean-2026-05-09-r1/run-near-pass-87-89-current-2026-05-10-r1` moved many remaining low-runtime `87-89` rows to `93-94/A`, with `false_positive_applied=0`.
- A larger `90-92` exploratory repeat was stopped after roughly 20 minutes because it entered long mutation paths and produced no report; do not use it as evidence.

All applied overlay rows had `false_positive_applied = 0` in targeted validation.

## Next Selection

The remaining gap is too large for near-pass polish alone. The next source of score movement should
come from higher-deficit rows that still have direct object or PAC/POC evidence, especially
heading/reading rows with stable proposal-buffer proof, table rows with a safe structure/header target,
or explicitly source-reanalyzed semantic rows. Keep strict PAC caps visible; do not raise scores by
hiding verified PAC failures.

Do not treat the overlay as final acceptance evidence; it is a planning artifact that avoids rerunning
all 351 PDFs after every small targeted change. Any behavior change still needs targeted validation,
and broad all-input validation is needed before claiming the mean goal is actually met.
