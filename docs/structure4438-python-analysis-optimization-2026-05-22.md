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
