# Public Table Stage 180 Low-Heading Experiment

Date: 2026-05-18

Decision: rejected and reverted. No remediation behavior was accepted.

## Why This Was Tested

The Oregon CJC STOP and Michigan MSP CPL public holdouts both exposed the same residual annual-report shape seen in California CJSC diagnostics: high text/reading/alt recovery, but low final score because table/PDF-UA debt remains. Representative rows were:

- `mi-07-cpl-2018-2019.pdf`: `54/F -> 69/D`
- `or-06-stop-2024.pdf`: `58/F -> 69/D`

Both rows repeatedly left table/header fixes blocked by `pdfua.table.header_association_present` regressions.

## Temporary Predicate

A temporary Stage 180 admission extension was tested for low-heading table-only cleanup. It was structure-based, not source-specific:

- low table score
- stable non-table categories
- no annotation debt
- no direct/misplaced malformed-table shape
- header-association debt present
- table targets available

The goal was to see whether admitting this annual-report shape into the existing bounded Stage 180 table/header sequence would create measurable movement without adding source-, row-, or PDF-specific behavior.

## Validation

Unit test coverage for the temporary predicate passed while the experiment was present:

```text
tests/remediation/stage180MixedTablePdfua.test.ts: 7 passed
```

The public target/control repeat used deterministic remediation only:

```bash
PDFAF_RUN_LOCAL_LLM=0 OPENAI_COMPAT_BASE_URL= \
PDFAF_CHECK_ANALYSIS_TIMEOUT_MS=15000 REQUEST_TIMEOUT_ANALYZE_MS=15000 \
PDFAF_REMEDIATION_PDF_TIMEOUT_MS=300000 REQUEST_TIMEOUT_REMEDIATE_MS=300000 \
timeout 1800s npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  Input/public_table_stage180_experiment_2026_05_18 \
  /mnt/pdf-review/pdfaf-validation/public-table-stage180-experiment-2026-05-18-r1 \
  --no-semantic --no-pdfs
```

Run summary:

- processed: `4/4`
- mean: `57.50 -> 84.00`
- rows below target: `2`
- `false_positive_applied=0`

Rows:

| PDF | Before | After | Runtime |
| --- | ---: | ---: | ---: |
| `mi-04-cpl-2021-2022-control.pdf` | 59 | 98 | 36.5s |
| `mi-07-cpl-2018-2019.pdf` | 54 | 69 | 53.2s |
| `or-06-stop-2024.pdf` | 58 | 69 | 256.5s |
| `or-07-stop-2025-control.pdf` | 59 | 100 | 44.9s |

The target rows did not improve. Controls stayed high.

## Tool Evidence

The same blocker remained after the wider admission:

- `normalize_table_structure` rejected on `mi-07` because `pdfua.table.header_association_present` worsened, including `663 -> 683` issues on one proposal and `663 -> 667` on another.
- `repair_native_table_headers` rejected for the same PAC rule on `mi-07`.
- `set_table_header_cells` returned `no_effect` on the low rows.
- `or-06` also repeated rejected/no-effect table tools and remained `69/D`.

This means the problem is not simply Stage 180 admission. The engine needs a real general table/header transaction that reduces final header-association debt instead of only widening which rows enter the current sequence.

## Revert And Cleanup

The temporary source/test edits were reverted. Post-revert verification:

```text
tests/remediation/stage180MixedTablePdfua.test.ts: 6 passed
```

No original-50 gate was required because no behavior was accepted. Temporary public PDFs and generated artifacts were deleted after metrics extraction.

## Next Useful Lane

Design a general large/annual-report table transaction that:

- updates table structure and header association in the same accepted state
- proves final `pdfua.table.header_association_present` debt is reduced, not increased
- preserves page/text/tag evidence and `false_positive_applied=0`
- passes targeted public rows plus original-50 quality and speed validation

