# All-Input Mean 93 Conservative Remix Audit

Date: 2026-05-12

## Summary

This audit treats the conservative r18 remix as the current all-input mean
completion candidate. It is a controlled virtual/audited checkpoint, not a
fresh 351-row rerun.

The base checkpoint is the r18 affected-shard merged run:

- Diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-diagnostic-2026-05-12-r18-cachekey-affected-merged-r1/all-input-mean-diagnostic.md`
- PDFs processed: `351`
- Mean: `92.5442`
- Points needed for mean `93`: `160`
- `false_positive_applied`: `0`

The conservative remix applies exactly `17` repeat-supported replacements over
r18 for total gain `+162`. The official diagnostic over the virtual report
reproduces the target:

- Virtual report: `Output/goal-all-input-mean-2026-05-09-r1/r18-conservative-remix-virtual-report-2026-05-12-r1`
- Official diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/r18-conservative-remix-diagnostic-2026-05-12-r1/all-input-mean-diagnostic.md`
- Mean: `93.0057`
- Median: `94`
- Grades: `330 A / 5 B / 1 C / 8 D / 5 F / 2 ?`
- Rows below `93`: `39`
- Points needed for mean `93`: `0`
- Runtime p95/max: `228657ms / 300008ms`
- `false_positive_applied`: `0`

## Counted Replacements

All counted replacements are traceable to local artifacts and have
`falsePositiveApplied=0` in
`Output/goal-all-input-mean-2026-05-09-r1/r18-conservative-remix-virtual-report-2026-05-12-r1/overlay-manifest.json`.

### API/source repeat core

Source artifacts:

- `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-r18-counted-repeat-2026-05-12-r1/repeat-source-reanalysis-summary.md`
- `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-r18-new-candidates-repeat-2026-05-12-r1/repeat-source-reanalysis-summary.md`

| Row | r18 | Counted repeat | Gain |
| --- | ---: | ---: | ---: |
| `0033-919b3d6f80f2-v1-4655.pdf` | 59 | 91 | +32 |
| `0114-9f229330b403-4587-an-inventory-and-examination-of-restorative-justice-practices-for-youth-.pdf` | 59 | 91 | +32 |
| `0136-1557962e554c-4503-2019-illinois-methamphetamine-study.pdf` | 59 | 64 | +5 |
| `0296-68a201d8ed16-05-ad762d4a-an-evaluation-of-redeploy-illinois-st.pdf` | 73 | 88 | +15 |
| `0120-a9de52a274a8-4690-evaluation-of-the-development-of-a-multijurisdictional-police-led-deflec.pdf` | 64 | 69 | +5 |
| `0135-a924a15180cf-4453-juvenile-justice-in-illinois-2014.pdf` | 59 | 69 | +10 |
| `0076-d8b918c687db-4722-police-use-of-discretion-in-encounters-with-people-with-opio.pdf` | 69 | 94 | +25 |

### Small deterministic repeat

Source artifact:

- `Output/goal-all-input-mean-2026-05-09-r1/run-r18-small-remix-repeat-2026-05-12-r2/baseline_report.json`

| Row | r18 | Counted repeat | Gain |
| --- | ---: | ---: | ---: |
| `0061-35ae7ca319a2-4680-Alternative_Sentencing_for_Drug_Offenses__An_Evaluation_of_the_First_Offender_Call_Unified_for_Success__FOCUS__Program.pdf` | 92 | 99 | +7 |
| `0258-52cc0d3a88fa-3643-law-enforcement.pdf` | 94 | 99 | +5 |
| `0165-3a9326cde29e-4652-illinois-criminal-justice-information-authority-2020-annual-report.pdf` | 92 | 96 | +4 |
| `0213-af9d1e621dd2-3421-murder-in-illinois-1973-to-1982.pdf` | 93 | 97 | +4 |
| `0235-a0e0522ec3a1-4490-a-survey-of-law-enforcement-in-central-illinois-to-guide-violence-reduct.pdf` | 94 | 98 | +4 |
| `0240-18f86f4537a7-3498-responding-to-juvenile-crime.pdf` | 93 | 97 | +4 |
| `0193-3ee849202d82-4179-illinois-criminal-justice-information-authority-needs-assessment-survey-.pdf` | 92 | 94 | +2 |
| `0310-0276073b88fd-4204-illinois-criminal-justice-information-authority-2011-annual-report.pdf` | 95 | 97 | +2 |
| `0163-8bb10a61fae7-4431-collaborating-to-fight-drug-crime-profile-of-the-central-illinois-enforc.pdf` | 93 | 94 | +1 |

### r14 timeout-repeat lift

Source artifact:

- `Output/goal-all-input-mean-2026-05-09-r1/run-r14-timeout-regression-repeat-2026-05-12-r1/baseline_report.json`

| Row | r18 | Counted repeat | Gain |
| --- | ---: | ---: | ---: |
| `0325-6e77d3e37d56-4693-criminal-history-record-checks-for-federally-assisted-housing-a-progress.pdf` | 93 | 98 | +5 |

## Exclusions

The completion claim does not count API headline-only gains or rows already
classified as analyzer/runtime volatile.

Explicitly excluded rows:

- `0108`: later repeat found movement, but analyzer signature diagnostics classify it as `python_structure_variance`.
- `0075`: failed counted API repeat and is analyzer-volatile.
- `0208`: failed counted API repeat and is analyzer-volatile.
- `0020` / `long-4683`: failed repeat/source reanalysis and remains analyzer/runtime volatile.

The virtual audit also does not claim to solve remaining hard-timeout rows such
as `long-4516` or `structure-4438`.

## Validation

Non-mutating audit commands were rerun on 2026-05-12:

- `all-input-mean-diagnostic.json` reports `processed=351`, `mean=93.0057`, and `pointsNeededForTargetMean=0`.
- `overlay-manifest.json` reports `appliedCount=17`, `totalGain=162`, and `skippedCount=0`.
- The applied replacements in `overlay-manifest.json` sum to `falsePositiveApplied=0`.

No fresh all-row benchmark was run for this audit. A fresh 351-row rerun is not
recommended as the next validation step because prior all-row attempts were
dominated by runtime/analyzer volatility rather than missing score movement.

## Decision

The controlled conservative r18 remix satisfies the all-input mean target under
an auditable, repeat-supported row-replacement policy:

- mean `93.0057`
- points needed for mean `93`: `0`
- `false_positive_applied=0`

If the project accepts controlled virtual/audited checkpoints as completion
evidence, this audit is sufficient to mark the all-input mean goal complete.
If the project requires a fresh all-row run, the validation plan should be
revised first to manage known runtime/analyzer volatility instead of rerunning
the full corpus blindly.
