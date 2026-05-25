# West Virginia DCR PREA Audits Public Holdout

Date: 2026-05-25

Source: West Virginia Division of Corrections and Rehabilitation PREA resources page: `https://dcr.wv.gov/resources/Pages/prea.aspx`

This was a 20-PDF public holdout sample from official West Virginia DCR PREA annual and facility audit report PDFs under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: the first 20 under-cap PREA annual/facility audit PDFs linked from the source page.
- Size cap: all selected PDFs were under `10 MB`; the sample totaled about `14 MB`.
- Validation: one bounded deterministic 20-file run plus low-row and table target diagnostics.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run: `/mnt/pdf-review/public-holdouts/west-virginia-dcr-prea-audits-2026-05-25/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `55.80 -> 77.30`.
- Median after remediation: `69`.
- Grades after remediation: `6 A / 0 B / 0 C / 14 D / 0 F`.
- Points needed for mean 93: `314`.
- Runtime p50/p95/max: `29853ms / 34468ms / 37680ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic selected `table_target_resolution_needed`.

| Candidate class | Rows | Raw points to target | Notes |
| --- | ---: | ---: | --- |
| Table target resolution needed | `14` | `336` | `wvdcrprea-02`, `04`, `05`, `06`, `07`, `08`, `10`, `11`, `13`, `14`, `15`, `17`, `18`, and `19` all finished `69/D` with `table_markup=0`, strong reading/link/alt scores, and table-header/PDF-UA debt. |

The A-grade controls were `wvdcrprea-01`, `03`, `09`, `12`, `16`, and `20`.

## Table Target Diagnostic

The table target-resolution diagnostic returned `plan_table_target_behavior_proof`.

- Stable focus candidates: all 14 D-grade rows.
- Unsafe control candidates: `0`.
- Control/high-grade noise rows: the six A-grade controls.
- Classification counts: `14` stable normalize targets and `6` control/high-grade noise rows.

This is a cleaner table discriminator than several earlier PREA/report holdouts: the low rows have stable object-backed table targets and the selected same-source controls did not match the promotion predicate.

## Threshold Proof

A narrow Stage 180 report-scale table admission threshold experiment was tested and rejected. The experiment lowered only the report-table heading gate from `60` to `55` and reran all 20 WV rows.

Local rejected run: `/mnt/pdf-review/public-holdouts/west-virginia-dcr-prea-audits-2026-05-25/run-threshold-r1/baseline_report.json`

- Mean remained `55.80 -> 77.30`.
- Median remained `69`.
- Grades remained `6 A / 0 B / 0 C / 14 D / 0 F`.
- Runtime p50/p95/max was `32872ms / 37742ms / 41161ms`.
- `false_positive_applied`: `0`.

The opened table attempts still rejected on `pdfua.table.header_association_present` or returned `no_structural_change`; one late row also hit `pdfua.content.orphan_mcids_absent`. Because the experiment did not reduce final PAC-style table/PDF-UA debt or improve scores, the source/test patch was reverted and no original-50 validation was required.

## Decision

No source behavior change is accepted from this source. The source fails the 93+ mean target, but the current evidence supports a deeper table/header transaction rather than a planner threshold tweak.

This source is useful because it separates table target admission from table mutation truth: admission can be clean on these rows, but existing `normalize_table_structure`, `repair_native_table_headers`, and `set_table_header_cells` still do not preserve or rebuild final header association evidence. Future table work should target `/Scope`, `/ID`, and `/Headers` preservation/reconstruction after shape normalization, prove final PAC table-header debt reduction on at least two WV-style positives, keep A-grade controls stable, and pass original-50 quality and speed validation.

Do not patch with West Virginia/source/facility/year/PDF gates, scorer masking, PAC relaxations, broad table admission, or a lower Stage 180 heading threshold from this evidence.

Because no source behavior changed, no original-50 regression validation was required for this source.
