# Washington DOC PREA Audit Reports Public Holdout

Date: 2026-05-24

Source: Washington State Department of Corrections PREA resources page: `https://doc.wa.gov/corrections/prea/resources.htm`

This was a 20-PDF public holdout sample from official Washington DOC PREA facility audit reports under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: the first 20 audit-report PDFs from the source page after filtering to audit/prea-audit links.
- Size cap: all 20 selected PDFs were under `10 MB`; the sample totaled about `22 MB`.
- Validation: one bounded deterministic 20-file run plus focused diagnostics over the produced benchmark JSON.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run: `/mnt/pdf-review/public-holdouts/washington-doc-prea-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `60.15 -> 80.20`.
- Median after remediation: `76`.
- Grades after remediation: `7 A / 3 B / 0 C / 9 D / 1 F`.
- Points needed for mean 93: `256`.
- Runtime p50/p95/max: `33579ms / 59736ms / 68761ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic selected `table_target_resolution_needed`.

| Candidate class | Rows | Raw points to target | Notes |
| --- | ---: | ---: | --- |
| Table target resolution needed | `12` | `238` | Repeated D/B rows with `table_markup=0` or `44`, PDF/UA table-header debt, and PAC table header-association guards. |
| No safe predicate | `1` | `34` | `wadoc-06` ended `59/F` with `heading_structure=0`, `table_markup=72`, and PAC table-header blockers. |

The high-priority repeated table group included `wadoc-02`, `wadoc-04`, `wadoc-07`, `wadoc-10`, `wadoc-13`, `wadoc-15`, `wadoc-17`, `wadoc-19`, and `wadoc-20`, mostly ending at `68-69/D`.

## Table Target Diagnostic

The table target-resolution diagnostic decided `keep_table_target_resolution_diagnostic_only`.

- Stable focus candidates: `wadoc-01`, `wadoc-02`, `wadoc-03`, `wadoc-04`, `wadoc-07`, `wadoc-10`, `wadoc-13`, `wadoc-15`, `wadoc-17`, `wadoc-19`, `wadoc-20`.
- Unsafe control candidate: `wadoc-12`.
- Prior non-table target rows: `wadoc-05`, `wadoc-08`, `wadoc-11`, `wadoc-14`, `wadoc-16`, `wadoc-18`.
- Classification counts: `12` stable normalize targets, `6` non-table target attempts, `1` control/high-grade noise row.

The diagnostic confirms real table/header debt on the low rows, but the current table target-resolution signal is not selective enough for behavior promotion. Several rows that remediated to A-grade had prior table-tool attempts resolving to non-table roles such as `H1`, `P`, `TD`, or `Part`, and one A-grade control still matched the stable normalize-target shape. This matches the risk seen in Connecticut, North Dakota, Indiana, and Wisconsin holdouts.

## Zero-Heading Residual

`wadoc-06` is the lone non-table-predicate F row. It ended at `59/F` with:

- `heading_structure=0`,
- `table_markup=72`,
- `reading_order=96`,
- `pdf_ua_compliance=71`.

The route evidence is not behavior-ready: heading/table/annotation normalization attempts were blocked by PAC table-header regressions or failed/no-effect states. This should stay parked with the broader zero-heading plus table/header transaction lane.

## Decision

No source behavior change is accepted from this source. The source fails the 93+ mean target with no hard errors and no false-positive applications, but the evidence supports a future general table/header transaction design rather than a planner threshold tweak or target fallback.

Do not patch with Washington/source/facility/year/PDF gates, scorer masking, PAC relaxations, broad table admission, table target fallback, or zero-heading fallback from this evidence. Any future accepted change should verify real table targets immediately before mutation, reduce final PAC table/header debt, preserve controls, and pass original-50 quality and speed validation.

Because no source behavior changed, no original-50 regression validation was required for this source.
