# Wyoming DOC Public Policies Holdout - 2026-05-25

## Source

- Public source: Wyoming Department of Corrections policies, procedures, and forms page.
- Source page: `https://corrections.wyo.gov/about-us/department-policies-procedures-and-forms`
- Sample: first 20 successfully downloaded public policy PDFs from the official page's Google Drive links, after skipping links that returned non-PDF HTML or unknown content.
- Size gate: every sampled PDF was under 10 MiB; sampled files were about `196 KB` to `465 KB`.
- Local PDFs and generated validation artifacts were temporary under `/mnt/pdf-review/public-holdouts/wyoming-doc-policies-2026-05-25/` and are not source assets.

## Baseline Validation

- Command family: deterministic bounded holdout validation with `--no-semantic --no-pdfs`.
- Run artifact: `/mnt/pdf-review/public-holdouts/wyoming-doc-policies-2026-05-25/run-r1/baseline_report.json`
- Completed: `20/20`
- Mean: `86.8000`
- Median: `97`
- Grades: `15 A / 0 B / 0 C / 0 D / 5 F`
- Rows below `93`: `5`
- Runtime p50/p95/max: `10436ms / 16007ms / 16155ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

Low-row diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/wyoming-doc-policies-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `no_safe_low_row_lane`
- Recommended lane: `none`
- Raw points needed for mean `93`: `124`
- Residual shape: five `59/F` rows with `heading_structure=0`, strong text extraction, and moderate table debt.

## Accepted Behavior

The baseline missed a general native tagged zero-heading pattern: several low rows had a high-confidence page-0 `/P` marked-content title anchor but no paragraph structure element, so `create_heading_from_candidate` had no target. Existing paragraph-backed controls from the same source already proved that heading creation could lift similar rows once admitted.

The accepted source change adds a narrow planner admission for the existing `create_heading_from_tagged_visible_anchor` mutator. It requires:

- native tagged PDF with structure tree present;
- `heading_structure=0` and no existing heading tree;
- strong text extraction;
- reading order at least `75`;
- table score at least `70`;
- no link, annotation, figure-alt, or form blockers;
- a high-confidence page-0 tagged visible `/P` MCID title anchor with `large_visible_text_mcid`.

The rule is structural and does not gate on filename, row id, source, path, hash, or corpus membership.

## Target And Source Validation

Target/control proof:

- Artifact: `/mnt/pdf-review/public-holdouts/wyoming-doc-policies-2026-05-25/target-control-proof-r1/run-r1/baseline_report.json`
- Rows: five Wyoming lows, five nearby Wyoming controls, and `pdfaf_fixture_accessible`.
- Result: `10/11` rows A-grade and one expected unchanged no-anchor row.
- Mean: `92.8182`
- `false_positive_applied`: `0`
- Key lifts: `wydocpol-01 59/F -> 96/A`, `wydocpol-03 59/F -> 98/A`, `wydocpol-05 59/F -> 97/A`, `wydocpol-09 59/F -> 93/A`.
- Stable no-anchor row: `wydocpol-07 59/F -> 59/F`.
- Control: `pdfaf_fixture_accessible 96/A -> 96/A`.

Patched full source run:

- Artifact: `/mnt/pdf-review/public-holdouts/wyoming-doc-policies-2026-05-25/run-r2-patched/baseline_report.json`
- Completed: `20/20`
- Mean: `94.6000`
- Median: `97`
- Grades: `19 A / 0 B / 0 C / 0 D / 1 F`
- Rows below `93`: `1` (`wydocpol-07`, no safe anchor)
- Runtime p50/p95/max: `9320ms / 12965ms / 14028ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

Patched low-row diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/wyoming-doc-policies-2026-05-25/low-row-diagnostic-r2-patched/outside-holdout-low-row-diagnostic.md`
- Decision: `holdout_target_met`
- Recommended lane: `none`

## Original-50 Gate

Comparable bounded original-50 validation:

- Artifact: `/mnt/pdf-review/pdfaf-validation/original50-tagged-moderate-heading-anchor-bounded-2026-05-25-r1/baseline_report.json`
- Input: `/mnt/pdf-review/pdfaf-validation/original50-table-parenttree-proof-2026-05-22-r1-input`
- Completed: `50/50`
- Mean: `94.6600`
- Median: `96`
- Grades: `48 A / 1 B / 0 C / 0 D / 1 F`
- Rows below `93`: `4076 90/A`, `4438 83/B`, `4516 90/A`, `4683 59/F`
- Runtime p50/p95/max: `13656ms / 143403ms / 300010ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

This clears the original-50 quality and speed gate relative to the accepted bounded original-50 checkpoints. The remaining `4683` low is known volatile/debt and was not introduced by this admission.

## Decision

Accept the tagged moderate-table heading-anchor admission as a general remediation improvement. It moved the Wyoming public source from mean `86.8000` to `94.6000`, preserved controls, kept `false_positive_applied=0`, and passed the comparable original-50 bounded validation without new hard timeouts.

The downloaded PDFs and generated artifacts should be deleted after metrics extraction.
