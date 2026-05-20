# Report-Layout Heading Mutation Root Cause

- Date: 2026-05-20
- Stage type: diagnostic plus narrow behavior guard
- Base commit: `22fa7d3`
- ODL use: none

## Diagnostic

Read-only diagnostic script:

- `scripts/report-layout-heading-mutation-diagnostic.ts`
- Input artifact: `/mnt/pdf-review/pdfaf-validation/report-layout-heading-recovery-2026-05-20-r1/run-r2/baseline_report.json`
- Output artifact: `/mnt/pdf-review/pdfaf-validation/report-layout-heading-mutation-diagnostic-2026-05-20-r1`

The diagnostic found `5` report-layout `create_heading_from_candidate` attempts:

- `2` `target_ref_fallback_mismatch`
- `2` `root_rewrite_collapse`
- `1` `pac_figure_alt_side_effect`

The actionable root cause was on `va-04` and `va-07`: planned paragraph-backed target refs (`193_0`, `232_0`) were not the objects actually mutated (`409_0`, `487_0`). The fallback mutation then collapsed the root/top-level structure shape, so strict target behavior was justified. The `va-02` failure was figure-alt PAC side effect evidence and did not justify a PAC exception.

## Behavior Change

The planner now adds `strictTargetRef: true` only when `create_heading_from_candidate` is admitted by `report_layout_heading_recovery_candidate`.

Python heading mutation honors strict mode by:

- refusing text/live-candidate fallback;
- mutating only the requested resolved target;
- returning `no_effect` with `strict_target_not_resolved`, `strict_target_not_paragraph_like`, or `strict_target_not_root_safe` when the requested target cannot be safely used.

Generic `create_heading_from_candidate` behavior outside report-layout admission is unchanged. No scoring, PAC gates, report-layout predicate thresholds, ODL integration, or `create_heading_from_tagged_visible_anchor` admission changed.

## Validation

Focused tests passed:

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/benchmark/reportLayoutHeadingMutationDiagnostic.test.ts tests/remediation/reportLayoutHeadingRecovery.test.ts tests/remediation/planner.test.ts tests/integration/strictHeadingTarget.integration.test.ts`
- `npx -y node@22 /usr/bin/pnpm run lint`

Target/control deterministic run:

- Run: `/mnt/pdf-review/pdfaf-validation/report-layout-heading-recovery-2026-05-20-r1/run-strict-r1`
- Rows: `11/11`
- Mean after: `95.0000`
- `false_positive_applied`: `0`
- Positives:
  - `va-02`: `57 -> 94`
  - `va-04`: `69 -> 94`
  - `va-07`: `65 -> 95`
- Controls stayed A-grade or unchanged enough for this targeted proof:
  - `ADAM2`: `34 -> 94`
  - Teams remediated: `73 -> 96`
  - Teams wave1: `73 -> 93`
  - Teams original: `54 -> 98`
  - `pdfaf_fixture_accessible`: `96 -> 96`

Post-strict diagnostic:

- Output artifact: `/mnt/pdf-review/pdfaf-validation/report-layout-heading-mutation-diagnostic-2026-05-20-r2-strict`
- `target_ref_fallback_mismatch`: `0`
- `strict_target_would_skip`: `2`
- `root_rewrite_collapse`: `4`

Strict mode converted the first `va-04` and `va-07` report-layout attempts into clear `strict_target_not_paragraph_like` no-effects, preventing the earlier fallback mutation. Later generic heading attempts can still show root-collapse no-effects, so this is a mutation-truth guard rather than a completed heading recovery.

Original-50 deterministic run:

- Run: `/mnt/pdf-review/pdfaf-validation/report-layout-heading-recovery-2026-05-20-r1/original50-strict-r1/run-2026-05-20T20-34-46-498Z`
- Remediation successes: `47/50`
- Completed-row mean: `92.8723`
- Completed-row median: `95`
- Grades: `41 A / 3 B / 1 C / 1 D / 1 F`
- `false_positive_applied`: `0`
- Report-layout signal triggers: `0`
- Errors/timeouts: `structure-4438`, `long-4516`, `long-4683`

The original-50 timeout differences are known runtime/analyzer tail volatility and are not attributable to this report-layout strict-target path because the new signal did not trigger on original-50 rows.

## Decision

Keep the strict-target behavior as a narrow report-layout mutation-truth guard. It prevents the proven fallback-away-from-target failure without broadening heading admission or masking PAC failures.

Do not claim this as a score-moving heading recovery yet. The next reading/heading work should only continue if it targets the remaining generic root-collapse no-effect path with separate evidence. Otherwise, park reading/heading behavior and move to table-undersegmentation diagnostics.
