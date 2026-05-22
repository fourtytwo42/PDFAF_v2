# Structure-4438 Python Analysis Optimization

Date: 2026-05-22

This is a native analyzer/runtime fix for the active PAC/POC alignment goal. It does not change scoring, remediation planning, mutation acceptance, checkpoint policy, PAC evidence, Docker semantics, or any filename/source/corpus gate.

Local artifacts:

- `/mnt/pdf-review/pdfaf-validation/structure4438-analysis-phase-trace-2026-05-22-r1/`
- `/mnt/pdf-review/pdfaf-validation/structure4438-analysis-optimization-proof-2026-05-22-r1/`

## Problem

Fresh all-unique validation repeatedly lost `0031/structure-4438` as a hard timeout. The May 22 runtime trace from the bounded full run showed the row entering post-conformance reanalysis after `repair_structure_conformance`, then timing out at the 300s wall. Existing bridge logs showed repeated Python structural-analysis timeouts.

The new opt-in Python phase trace isolated the source-analysis bottlenecks on the original PDF:

| State | Parent-tree audit | Structure-syntax audit | Result |
| --- | ---: | ---: | --- |
| before optimization | `43152ms` | started, then timed out | direct analysis timed out |
| after parent-tree lookup cache | `373ms` | started, then timed out | direct analysis still timed out |
| after structure-syntax child cache | `365ms` | `382ms` | direct analysis completed |
| final ref reuse | `222ms` | `390ms` | direct analysis completed |

The final direct analysis preserved the same high-level evidence shape: `2` headings, `0` extracted figures, `29` tables, clean parent-tree audit counters, and `13` invalid child-role syntax findings.

## Change

The Python helper now supports opt-in phase timing with `PDFAF_PYTHON_ANALYSIS_PHASE_TRACE=1`. Timing is written to stderr only, so stdout remains the JSON analysis payload.

Two PAC-like audit paths were optimized without changing their evidence model:

- `collect_parent_tree_audit` now builds the structure-content reference list once and precomputes OBJR ownership by object reference instead of rescanning the whole structure tree for each annotation.
- `collect_structure_syntax_audit` now caches direct child keys per parent and compares stable object keys when validating `/P` back-pointers instead of rebuilding child lists and comparing wrapper objects repeatedly.

## Proof

The traced one-row deterministic run completed instead of timing out:

- Run: `/mnt/pdf-review/pdfaf-validation/structure4438-analysis-optimization-proof-2026-05-22-r1/run-r1/baseline_report.json`
- Result: `59/F -> 83/B`
- Duration: `211305ms`
- `false_positive_applied=0`
- Reanalysis stages were about `3.2s-3.4s` each.

The clean no-trace deterministic run also completed:

- Run: `/mnt/pdf-review/pdfaf-validation/structure4438-analysis-optimization-proof-2026-05-22-r1/run-r2-no-trace/baseline_report.json`
- Result: `59/F -> 83/B`
- Duration: `212013ms`
- `false_positive_applied=0`
- No semantic work and no remediated PDFs were requested.

This removes a hard timeout shape, but it does not make `4438` an A-grade row. The remaining debt is real table/header, figure-alt, PDF/UA, and link evidence, not analysis starvation.

## Validation

- `python3 -m py_compile python/pdf_analysis_helper.py`
- `TMPDIR=/mnt/pdf-review/pdfaf-tmp npx -y node@22 /usr/bin/pnpm run lint`
- `TMPDIR=/mnt/pdf-review/pdfaf-tmp npx -y node@22 /usr/bin/pnpm exec vitest run tests/integration/parentTreeRepair.integration.test.ts tests/threecc/phase3Invariants.test.ts tests/threecc/goldenAnalysis.test.ts tests/threecc/mcidResolvedText.test.ts`
- Direct traced analysis of `structure-4438` after the final ref-reuse optimization.
- One-row deterministic traced and no-trace benchmark proof for `structure-4438`.

## Decision

Accept the analyzer optimization as source progress. It is general native PAC-evidence work: it makes existing parent-tree and structure-syntax debt observable within bounded runtime instead of hiding it behind bridge timeouts.

Do not claim all-unique or original-50 completion from this alone. The next acceptance step is a fresh original-50 deterministic validation, followed by all-unique tracking if the original-50 gate stays clean.

## Original-50 Follow-Up

Fresh deterministic original-50 validation was run after this source change:

- Run: `/mnt/pdf-review/pdfaf-validation/original50-after-structure4438-analysis-opt-2026-05-22-r1/baseline_report.json`
- Rows: `50/50` completed
- All-row mean: `94.0000`
- Median: `95.5`
- Grades: `47 A / 1 B / 2 F`
- `false_positive_applied=0`
- Runtime p95/max: `133441ms / 289268ms`

This clears the broad original-50 runtime and mutation-truth gate for the analyzer optimization. Compared with `/mnt/pdf-review/pdfaf-validation/original50-table-parenttree-proof-2026-05-22-r1/baseline_report.json`, the hard `4438` timeout is recovered to `83/B`, and `4516` completes at `92/A`.

Two known volatile long-report rows dropped in the broad run:

- `4680`: `95/A -> 59/F`
- `4683`: `92/A -> 59/F`

Focused repeat evidence shows those drops are route volatility rather than a deterministic source regression from the analyzer optimization:

- Repeat: `/mnt/pdf-review/pdfaf-validation/original50-after-4438-opt-volatility-repeat-2026-05-22-r1/baseline_report.json`
- `4680`: `59/F -> 97/A`
- `4683`: `59/F -> 99/A`

The refreshed PAC/POC validation checkpoint is local-only at `/mnt/pdf-review/pdfaf-validation/pac-poc-validation-checkpoint-after-4438-opt-2026-05-22-r1/pac-poc-validation-checkpoint.md`. It reports `original_50` passing, the Virginia outside holdout passing, and `all_unique` still failing because the available all-unique artifact is the pre-optimization r2 checkpoint at mean `92.2821`.

Next broad work should either rerun all-unique from current source or first recover more all-unique timeout/low-score debt (`0120`, `0135`, and remaining long-report volatility) so the expensive full run has a plausible path back above the accepted fresh floor.
