# Public Table Transaction Probe

Date: 2026-05-18

Decision: diagnostic-only. No remediation behavior change was made.

## Purpose

Recent public holdouts repeatedly exposed the same residual shape: table-heavy public reports plateau around `69/D` because table/heading/link tools are rejected by PAC table-header association rules or make no scorer-visible progress.

This probe used one representative public PDF from each recent source family:

| Row | Source | PDF |
| --- | --- | --- |
| 01 | New York DCJS | `FINAL 2024 Missing Persons Clearinghouse Annual Report.pdf` |
| 02 | Washington SAC | `sentencing_guidelines_and_offender_score.pdf` |
| 03 | Maryland GOCPP | `Centers-of-Excellence-2025-Report.pdf` |
| 04 | Utah CCJJ | `2024-DUI-Annual-Report-Final.pdf` |

All files were public PDFs under 10 MB. They were downloaded only for the diagnostic and deleted after evidence capture.

## Baseline Repeat

Command shape:

```bash
PDFAF_RUN_LOCAL_LLM=0 OPENAI_COMPAT_BASE_URL= \
PDFAF_CHECK_ANALYSIS_TIMEOUT_MS=15000 REQUEST_TIMEOUT_ANALYZE_MS=15000 \
PDFAF_REMEDIATION_PDF_TIMEOUT_MS=300000 REQUEST_TIMEOUT_REMEDIATE_MS=300000 \
timeout 1800s npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  Input/public_table_transaction_probe_2026_05_18 \
  /mnt/pdf-review/pdfaf-validation/public-table-transaction-probe-remediate-2026-05-18-r1 \
  --no-semantic
```

Result:

- processed: `4/4`
- mean: `56.50 -> 69.00`
- all four rows ended at `69/D`
- `false_positive_applied=0`

Rows:

| Row | Before | After | Runtime |
| --- | ---: | ---: | ---: |
| 01 NY | 55/F | 69/D | 51.1s |
| 02 WA | 69/D | 69/D | 236.0s |
| 03 MD | 51/F | 69/D | 49.2s |
| 04 UT | 51/F | 69/D | 187.4s |

## Focused Replay

A narrow replay started from the remediated `69/D` states and repeated the existing strongly-irregular table normalizer. It intentionally did not relax PAC gates, lower scoring strictness, or add PDF/source-specific behavior.

Summary:

| Row | Best replay score | Table movement | Remaining blocker |
| --- | ---: | --- | --- |
| 01 NY | 89/B | `0 -> 79` | heading remains `60`; header association debt grew `943 -> 1103`; orphan header debt remains `412` |
| 02 WA | 69/D | `0 -> 0` | very large header debt grew `14089 -> 14623`; no scorer movement |
| 03 MD | 69/D | `0 -> 0` | already in a Stage 180-like state; extra normalization no-effect |
| 04 UT | 89/B | `0 -> 72` | stops before 93 with heading/reading/PDF-UA residuals and orphan MCID debt |

Continuation checks on the rows that moved did not cross the acceptance target:

- NY stopped at `89/B`, table `79`, after irregular table debt reached zero.
- Utah stopped at `89/B`, table `72`, before another useful normalization pass was available.

## Interpretation

The existing normalizer can reduce strongly-irregular table row debt on some public rows, but it is not a complete transaction:

- `normalize_table_structure` can improve table regularity while increasing or preserving `pdfua.table.header_association_present` debt.
- `set_table_header_cells` is often skipped or no-effect once the row still has irregular table shape, because the current header-association parameter builders avoid unsafe irregular-table states.
- Stage 180-style same-handle header regularization helps some header counts, but it does not make these representative rows reach `93+`.

The useful next design is not another broad Stage 180 admission widening. It needs a general table transaction that can:

- preserve or rebuild `/Scope`, `/ID`, and `/Headers` after synthetic table cells are introduced
- reduce final `pdfua.table.header_association_present` and `pdfua.table.header_cells_associated` debt
- preserve page/text/tag evidence and `false_positive_applied=0`
- improve runtime on long table-heavy rows or at least avoid adding tail work
- pass targeted public rows plus original-50 quality and speed validation

## Decision

No source change is accepted from this probe. The best movement is below the 93 target and still leaves PAC table debt. Running original-50 validation would not be meaningful without an accepted behavior candidate.

## Cleanup

Temporary public PDFs and generated artifacts were deleted after metrics extraction. This document is the durable source-tracked record.
