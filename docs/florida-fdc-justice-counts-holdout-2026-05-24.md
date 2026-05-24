# Florida FDC Justice Counts Public Holdout

Date: 2026-05-24

Source: Florida Department of Corrections FDC Monthly Statistics page: `https://www.fdc.myflorida.com/statistics-and-publications/fdc-monthly-statistics`

This was a 20-PDF public holdout sample from official Florida Department of Corrections monthly Justice Counts reports under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: the newest 20 linked PDF monthly reports available from the source page, from `Apr2026` through `Aug2024`.
- Selection note: `May2026` and `Jun2026` had no linked PDFs on the source page at collection time, and `Aug2025` was linked as an XLSX, so it was skipped.
- Size cap: all 20 selected PDFs were under `10 MB`; selected files were about `80-84 KB`.
- Validation: one bounded deterministic 20-file run, low-row diagnostic, table target-resolution diagnostic, and representative table/structure sequence probe.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run before cleanup: `/mnt/pdf-review/public-holdouts/florida-fdc-justice-counts-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `69.00 -> 69.00`.
- Median after remediation: `69`.
- Grades after remediation: `0 A / 0 B / 0 C / 20 D / 0 F`.
- Rows below 93: `20`.
- Runtime p50/p95/max: `11081ms / 12155ms / 13153ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

Every row landed at `69/D` after deterministic remediation. The repeated category shape was:

- `table_markup=16`
- `heading_structure=80`
- `reading_order=94`
- `alt_text=100`
- `pdf_ua_compliance` usually `83`, with two lower PDF/UA variants at `79` and `71`

## Diagnostics

Low-row diagnostic:

- Decision: `plan_high_impact_targeted_diagnostic`.
- Recommended lane: `table_target_resolution_needed`.
- Raw points needed for 93 mean: `480`.
- Candidate rows: all 20 Florida rows.

Table target-resolution diagnostic:

- Decision: `plan_table_target_behavior_proof`.
- Stable focus candidates: all 20 Florida rows.
- Unsafe selected controls: `0`.
- Prior non-table target rows: `0`.
- Classification counts: `20 stable_normalize_target`, `5 control_or_high_grade_noise`.

The target-resolution evidence is useful, but it is not enough for behavior acceptance. A representative table/structure sequence probe was run on four Florida focus rows plus `pdfaf_fixture_accessible`, `ADAM2`, and a Teams control. It found:

- Sequence candidates: `0`.
- Florida rows: `normalize_table_structure_then_header_cleanup` applied, but final score stayed `69/D`.
- Controls: no useful movement, with harmful PAC regression on ADAM2 and Teams sequence probes.

Representative Florida final probe shape:

- `69/D`
- `table_markup=16`
- `heading_structure=80`
- `reading_order=94`
- `pdf_ua_compliance=57` to `83`
- `alt_text=100`

## Decision

No source behavior change is accepted from this source.

Florida exposes a large, repeated table/header normalization gap, but the current native table/header sequences did not produce score movement or demonstrated final PAC debt reduction on representative rows. This is another strong data point for the parked real table/header transaction lane, not a reason to broaden table admission, add target fallback, weaken PAC gates, hide failures, or add source/PDF-specific behavior.

Because no source behavior changed, no original-50 regression validation was required for this source.
