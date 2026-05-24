# Connecticut DOC PREA Audits Public Holdout

Date: 2026-05-24

Source: Connecticut Department of Correction PREA page: `https://portal.ct.gov/DOC/Miscellaneous/PREA`

This was a 20-PDF public holdout sample from official Connecticut DOC PREA final audit reports under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: 20 links whose source-page visible text included `PREA Final Report`.
- Validation: one bounded deterministic 20-file run plus focused diagnostics over the produced benchmark JSON.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run: `/mnt/pdf-review/public-holdouts/connecticut-doc-prea-audits-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `55.60 -> 84.90`.
- Median after remediation: `88`.
- Grades after remediation: `9 A / 5 B / 0 C / 6 D / 0 F`.
- Points needed for mean 93: `162`.
- Runtime p50/p95/max: `32401ms / 45552ms / 45705ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic selected one lane: `table_target_resolution_needed`.

| Candidate class | Rows | Raw points to target | Notes |
| --- | ---: | ---: | --- |
| Table target resolution needed | `11` | `171` | Six D-grade rows with `table_markup=0`, plus five B-grade rows with `table_markup=44`; all also carried PDF/UA table-header debt. |

The six high-priority rows were `ctdoc-03`, `ctdoc-05`, `ctdoc-09`, `ctdoc-13`, `ctdoc-16`, and `ctdoc-18`. They remained at `67-69/D` with table markup `0` and recurring PAC-style table header association failures.

## Table Target Diagnostic

The table target-resolution diagnostic decided `keep_table_target_resolution_diagnostic_only`.

- Stable focus candidates: `ctdoc-03`, `ctdoc-05`, `ctdoc-09`, `ctdoc-13`, `ctdoc-16`, `ctdoc-18`.
- Unsafe control candidate: `ctdoc-07`.
- Prior non-table target rows: `ctdoc-10`, `ctdoc-14`, `ctdoc-19`.
- Classification counts: `7` stable normalize targets, `3` non-table target attempts, `2` control/high-grade noise rows.

The diagnostic confirms the table debt is real on the low rows, but the current table target-resolution signal is not selective enough for behavior promotion. Some post-remediation A-grade controls still show stable table-shape target evidence, and several controls have prior table tool attempts that resolved to non-table roles such as paragraph or table-row nodes. That is the same risk shape seen in earlier public holdouts.

## Decision

No source behavior change is accepted from this source. The source fails the 93+ mean target with no hard errors and no false-positive applications, but the evidence supports a future general table/header transaction design rather than an immediate planner or mutation tweak.

Do not patch with Connecticut/source/facility/year/PDF gates, scorer masking, PAC relaxations, broad table admission, or table target fallback from this evidence. Any future accepted change should prove stable real table targets, reduce final PAC table/header debt, preserve controls, and pass original-50 quality and speed validation.

Because no source behavior changed, no original-50 regression validation was required for this source.
