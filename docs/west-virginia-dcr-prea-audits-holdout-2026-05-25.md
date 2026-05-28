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

## Current-Code Follow-up - 2026-05-28

A fresh current-code proof pack was rebuilt from the same WV DCR PREA source page under local scratch:

- `/mnt/pdf-review/pdfaf-table-wv-proof-2026-05-28-r1`

All selected PDFs were public PDFs under 10 MB. Generated PDFs and JSON/Markdown artifacts remained local scratch only.

Current deterministic bounded result:

- Processed: `20/20`
- Mean: `56.10 -> 76.85`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`
- A/high rows: `wvdcrprea-01 94/A`, `03 96/A`, `09 96/A`, `12 96/A`, `13 93/A`, `17 96/A`
- Remaining lows: `14` rows at `69/D`, mostly `table_markup=0` or `5`, strong heading/reading/link/alt, and real table/PDF-UA debt

The current target-resolution diagnostic is still a clean discriminator:

- Decision: `plan_table_target_behavior_proof`
- Stable focus candidates: all `14` low rows
- Same-source controls matching the target predicate: `0`
- Prior non-table target rows: `0`

However, behavior is still not ready:

- Default strict table probes skip because planner params are empty on the plateau state.
- Direct strict `set_table_header_cells` on selected association refs reduces `dataCellsWithoutHeaderCount` but does not move score.
- Direct strict normalize/header over `24` real `/Table` refs reduces table/header debt but leaves the row at `69/D`.
- A diagnostic multi-pass over `wvdcrprea-02` normalized `126` real table refs and then associated headers across `246` table refs. It reduced `dataCellsWithoutHeaderCount` `1477 -> 122`, increased `dataCellsWithHeadersCount` `0 -> 1439`, and reduced strong irregularity `129 -> 3`, but the final score stayed `69/D` and `table_markup` only reached `5`.
- A tested `/ColSpan`/span-aware header-row idea was not kept: focused production validation on `wvdcrprea-02` and `wvdcrprea-04` still ended `69/D`.

Decision: still no source behavior change is accepted from WV.

This source proves the next table weakness is not wrong-ref admission and not a simple one-pass transaction. It is a high-volume repeated-table finalization problem: many real table refs can be improved PAC-honestly, but the current bounded repair cannot clear enough residual regularity/header debt to produce material final score movement. A future behavior stage should target a faster general repeated-table-template transaction or a stricter subtype-specific table-regularity model, then prove score movement on WV plus at least one independent outside source before original-50 validation.
