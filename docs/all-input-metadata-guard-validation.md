# All-Input Metadata-Only Guard Validation

This note records the narrow metadata-only acceptance guard added during the all-input mean recovery work.

## Context

Complete r5 all-input validation:

- Report: `Output/goal-all-input-mean-2026-05-09-r1/r5-complete-baseline-report-2026-05-11-r1/baseline_report.json`
- Mean: `92.0456`
- Rows: `351`
- `false_positive_applied`: `0`
- Points needed for mean `93`: `335`

Metadata drift diagnostics showed repeated cases where `set_document_title` / `set_document_language` improved title/language and total score, while analyzer reanalysis reported a small unrelated `heading_structure` or `reading_order` category drift. The new guard allows only metadata-only stages through that narrow shape.

## Accepted Guard

The guard applies only when all of the following are true:

- The stage applied only `set_document_title` and/or `set_document_language`.
- The rejection reason is `stage_regressed_category(heading_structure:...)` or `stage_regressed_category(reading_order:...)`.
- `title_language` improves.
- Total score does not drop.
- Page count, text character count, and tagged state are preserved.
- No new PAC failures appear except metadata/language-family failures.

It does not allow score drops, mixed-tool stages, page/text/tag loss, or new non-metadata PAC failures.

## Validation

Focused proof:

- Diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/metadata-only-proof-r5-complete-2026-05-11-r4`
- Targeted run: `Output/goal-all-input-mean-2026-05-09-r1/run-metadata-only-guard-target-2026-05-11-r1`
- Result: `false_positive_applied = 0`; useful movement appeared on metadata-sensitive rows, but this lane alone is not enough to close the all-input mean gap.

Top bounded-candidate repeat with the guard:

- Run: `Output/goal-all-input-mean-2026-05-09-r1/run-bounded-repeat-top-2026-05-11-r1`
- Result: `false_positive_applied = 0`.
- Recovered or improved: `0316 -> 97/A`, `0346 -> 94/A`, `0097 -> 92/A`, `0319 -> 93/A`.
- Not reproduced: `4139`, `4567`, `0149`, `0325`, and `4082` remained below target.

The repeat result rejects a broad bounded-retry policy for now. Route recovery is still row/family specific, and grouped retries can remain slow or unstable.

## Standard Checks

Passed:

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/remediation/orchestrator.test.ts tests/remediation/pacRuleAcceptanceGate.test.ts tests/benchmark/allInputMetadataOnlyProof.test.ts tests/benchmark/allInputMetadataDriftDiagnostic.test.ts`
- `npx -y node@22 /usr/bin/pnpm lint`

## Decision

Keep the metadata-only analyzer-drift tolerance as a narrow accepted behavior step. Do not promote broad bounded retry from the current evidence. The next work should target repeatable route recovery on specific high-deficit rows or a new PAC-object-backed repair lane.
