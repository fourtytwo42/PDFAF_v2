# Original-50 Guarded Candidate Side-Effect Diagnostic

Date: 2026-05-29

## Summary

Added `scripts/original50-guarded-candidate-side-effect-diagnostic.ts`, a read-only follow-up to the route-state timeline diagnostic. It inspects rejected high-scoring tool candidates in existing `baseline_report.json` artifacts, compares replay states against accepted references, and separates:

- accepted-reference same-state acceptance-context divergence;
- structure-stable analysis count drift;
- PAC count increments without score drops;
- real side effects that need cleanup.

No production behavior changed. The script does not analyze PDFs, remediate PDFs, write remediated PDFs, or call ODL/PAC/POC/Java/LLM.

Source tests:

- `tests/scripts/original50GuardedCandidateSideEffectDiagnostic.test.ts`

Local artifacts:

- Report: `/mnt/pdf-review/pdfaf-validation/original50-guarded-candidate-side-effect-diagnostic-2026-05-29-r1/original50-guarded-candidate-side-effect-diagnostic.md`
- JSON: `/mnt/pdf-review/pdfaf-validation/original50-guarded-candidate-side-effect-diagnostic-2026-05-29-r1/original50-guarded-candidate-side-effect-diagnostic.json`

## Inputs

Gate artifact:

- `/mnt/pdf-review/original50-stabilization-2026-05-29-r2/original50-table-continuation-gate-r1/baseline_report.json`

References:

- `/mnt/pdf-review/pdfaf-validation/original50-repeated-template-route-2026-05-28-r1/baseline_report.json`
- `/mnt/pdf-review/pdfaf-validation/original50-table-wrong-ref-guard-2026-05-28-r3/baseline_report.json`
- `/mnt/pdf-review/pdfaf-validation/original50-mcr-pg-bounded-2026-05-28-r2/baseline_report.json`
- `/mnt/pdf-review/original50-stabilization-2026-05-29-r1/focus-repeat-r1/baseline_report.json`
- `/mnt/pdf-review/original50-stabilization-2026-05-29-r1/focus-blockers-repeat-r2/baseline_report.json`
- `/mnt/pdf-review/original50-stabilization-2026-05-29-r2/table-continuation-targeted-r1/baseline_report.json`
- `/mnt/pdf-review/original50-route-drop-repeat-2026-05-29-r1/run-4754-r1/baseline_report.json`

Focused rows:

- `4683`
- `4754`

## Decision

Decision: `diagnose_acceptance_context_determinism`

The diagnostic found `7` rejected high-scoring candidates across `2` rows:

- `2` accepted-reference same-state context divergences;
- `5` structure-stable analysis count drift cases.

The next safest lane is `same_state_pac_acceptance_context_probe`, focused first on `4754`, because it reaches the exact accepted-reference final state but is rejected in the current gate for a PAC count increment. This is not a reason to suppress PAC; it is a reason to compare acceptance context and PAC replay for the same state.

## Row Findings

### `4754`

`4754` has two rejected high candidates:

- `normalize_heading_hierarchy`
- `repair_native_table_headers`

Both replay from `85/B` to `94/A`, both are rejected for `pac_rule_regressed(pdfua.table.header_association_present)`, and both land on state signature `6b3ea8d4ebfa0766e461f72f`, which matches the accepted-template reference final state.

The PAC count change is `21 -> 22` table header-association issues while category scores do not drop. This is acceptance-context / PAC replay evidence, not table-admission evidence. The next useful diagnostic should attribute why the same final state is accepted in one route but rejected in another.

### `4683`

`4683` has five rejected high candidates reaching `98/A`:

- `canonicalize_figure_alt_ownership`
- `retag_as_figure`
- two `set_figure_alt_text` attempts
- `set_table_header_cells`

All are rejected for `stage_regressed_category(reading_order:100->96)`. The native structural signals remain stable, while extracted-analysis counts swing sharply:

- `extractedHeadingCount 20 -> 1`
- `extractedFigureCount 13 -> 3`
- `checkerVisibleFigureCount 7 -> 8`
- `checkerVisibleFigureAltCount 5 -> 8`

This supports a native analysis count-drift diagnostic before any behavior promotion. Do not accept the high state unless the reading-order drop is proven to be analyzer noise and controls remain stable.

## Guardrails

- No behavior change is accepted from this diagnostic.
- Do not relax PAC regression guards, category regression guards, score caps, timeout policy, or false-positive truth.
- Do not accept high rejected candidates just because their score is high.
- Do not reopen parked table-heavy outside-source lanes from this evidence alone.
- Future behavior must either prevent the side effect or prove same-state acceptance/PAC replay determinism with controls.
