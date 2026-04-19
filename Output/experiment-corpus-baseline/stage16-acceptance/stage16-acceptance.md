# Stage 16 acceptance audit

- Generated: 2026-04-19T06:23:11.231Z
- Baseline (Stage 15) run: `Output/experiment-corpus-baseline/run-stage15-full`
- Stage 16 run: `Output/experiment-corpus-baseline/run-stage16-full`
- Comparison: `Output/experiment-corpus-baseline/comparison-stage16-vs-stage15`
- Acceptance: PASS
- Target non-A files (Stage 15 residual): 2
- Reached A from target set: 2
- Non-A before/after: 2 -> 0
- Regression count: 0
- Remediate wall median delta: -278.09 ms (budget: 500 ms)

## Gates

- **target_non_a_reach_a:** pass - targetReachedACount=2 targetFileCount=2
- **no_regressions:** pass - regressionCount=0
- **runtime_not_regressed:** pass - wallMedianDeltaMs=-278.09 threshold<=500

## Target Files

| File | Score | Grade | Heading Structure | Text Extractability |
| --- | --- | --- | --- | --- |
| 10-short-near-pass/4176-Illinois Offense and Arrest Trends Property Index Arrests 19992008.pdf | 83 -> 97 | B -> A | 80 -> 100 | 62 -> 96 |
| 10-short-near-pass/4214-Illinois Crime Victim Trends Reported Elder Abuse 20002009.pdf | 85 -> 98 | B -> A | 80 -> 100 | 64 -> 96 |

## Regressions

None.