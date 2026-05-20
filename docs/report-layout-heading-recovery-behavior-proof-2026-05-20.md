# Report-Layout Heading Recovery Behavior Proof

- Date: 2026-05-20
- Stage type: provisional behavior proof
- Source change: native planner admission for `create_heading_from_candidate` when report-scale layout evidence has paragraph-backed existing targets
- ODL use: none in normal API, analyzer, scorer, remediation, Docker, or benchmark paths

## Implementation

The planner now computes a native `report_layout_heading_recovery_candidate` predicate from existing analysis/snapshot evidence only:

- low `reading_order` or `heading_structure`
- at least 60 native layout heading candidates
- at least 20 repeated header/footer pages
- layout heading density at least 2 per sampled page
- at least two existing native target matches
- at least one eligible paragraph-structure heading target

When the predicate is true, the planner can schedule `create_heading_from_candidate` even when the older zero-heading route does not admit it. This stage does not enable `create_heading_from_tagged_visible_anchor`, does not change scoring, and does not add mutators.

The orchestrator preserves the planned report-layout paragraph target for this admission path. The existing live guard that skips generic heading creation when exported headings already exist still applies to all other heading paths.

## Validation

Focused source checks passed:

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/remediation/reportLayoutHeadingRecovery.test.ts tests/remediation/planner.test.ts`
- `npx -y node@22 /usr/bin/pnpm run lint`

Target/control deterministic run:

- Run: `/mnt/pdf-review/pdfaf-validation/report-layout-heading-recovery-2026-05-20-r1/run-r2`
- Command shape: `scripts/baseline-corpus-batch.ts ... --no-semantic --no-pdfs`
- Rows: 11
- Mean after: `94.7273`
- Errors: `0`
- `false_positive_applied`: `0`
- Paragraph-backed positives:
  - `va-02`: `62 -> 95`
  - `va-04`: `69 -> 94`
  - `va-07`: `65 -> 95`
- Same-source non-promoted rows:
  - `va-03`: no `create_heading_from_candidate`
  - `va-05`: no `create_heading_from_candidate`
  - `va-06`: no `create_heading_from_candidate`
- Controls:
  - `ADAM2`, three Teams variants, and `pdfaf_fixture_accessible` did not schedule the new report-layout heading admission.

Original-50 deterministic run:

- Run: `/mnt/pdf-review/pdfaf-validation/report-layout-heading-recovery-2026-05-20-r1/original50-r1/run-2026-05-20T11-43-19-027Z`
- Mode: `remediate`
- Semantic: disabled
- PDFs written: no
- Completed remediation rows: `49/50`
- Mean across completed rows: `90.9592`
- Median across completed rows: `95`
- `false_positive_applied`: `0`
- New `report_layout_heading_recovery_candidate` signal on original-50 rows: `0`
- Hard error: `structure-4438` aborted due to timeout, matching known parked runtime/analyzer debt.

## Decision

This is safe to keep as a narrow provisional admission proof because the predicate did not trigger on controls or original-50 rows, and mutation truth stayed clean.

It should not be claimed as a proven score-moving heading repair yet. On the target positives, `create_heading_from_candidate` was scheduled, but the actual heading mutations were rejected or recorded as no-effect by PAC/invariant checks. The A-grade target outcomes came from the existing deterministic pipeline. Any future promotion should focus on why these report-layout paragraph targets become PAC-rejected/no-effect, not on broadening the predicate.
