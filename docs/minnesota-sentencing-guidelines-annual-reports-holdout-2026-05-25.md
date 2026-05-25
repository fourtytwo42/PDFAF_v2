# Minnesota Sentencing Guidelines Annual Reports Public Holdout - 2026-05-25

## Source And Sample

- Source: `https://www.lrl.mn.gov/edocs/edocs?oclcnumber=12832227`
- Sample: `20` Minnesota Sentencing Guidelines Commission annual-report PDFs, each verified under `10MB`.
- Selection notes: selected the first 20 direct annual-report PDFs from the Minnesota Legislative Reference Library edocs record, covering `2026` through `2007`.
- Local artifact root: `/mnt/pdf-review/public-holdouts/minnesota-sentencing-guidelines-annual-reports-2026-05-25`
- Validation mode: deterministic bounded holdout, Node 22, `--no-semantic --no-pdfs`, row artifacts cleaned.

## Full-Source Result

Run: `/mnt/pdf-review/public-holdouts/minnesota-sentencing-guidelines-annual-reports-2026-05-25/run-r1/baseline_report.json`

- Completed: `18/20`
- Completed-row mean: `49.6111 -> 73.7778`
- All-row mean after: `66.4000`
- Median after: `69`
- Grades after: `4 A / 1 B / 12 D / 1 F / 2 timeout`
- Rows below `93`: `16`
- `false_positive_applied`: `0`
- Timeout/error rows: `2`
- Runtime p50/p95/max: `138317ms / 300033ms / 300050ms`

Low rows were dominated by table structure/header debt:

| Group | Rows | Evidence |
| --- | ---: | --- |
| `table_target_resolution_needed` | `11` | mostly `table_markup=0` or low table score with PAC table debt |
| `timeout_or_error` | `2` | `mnsgc-07.pdf`, `mnsgc-08.pdf` hit `per_pdf_timeout_300000ms` |
| `figure_alt_object_candidate` | `1` | `mnsgc-12.pdf`, secondary to table debt |
| `table_object_candidate` | `1` | `mnsgc-03.pdf`, table debt without visible table-tool proof in baseline artifact |
| `figure_alt_target_discovery_needed` | `1` | `mnsgc-16.pdf`, secondary near-tail debt |

## Diagnostics

Low-row diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/minnesota-sentencing-guidelines-annual-reports-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `532`
- Table-target rows carried `285` points; timeout rows carried `186` points.

Corrected table target-resolution diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/minnesota-sentencing-guidelines-annual-reports-2026-05-25/table-target-resolution-minnesota-r1/table-target-resolution-diagnostic.md`
- Decision: `plan_table_target_behavior_proof`
- Stable focus candidates: `mnsgc-01`, `mnsgc-03`, `mnsgc-04`, `mnsgc-06`, `mnsgc-09`, `mnsgc-10`, `mnsgc-14`, `mnsgc-15`
- Unsafe high-score controls: `0`
- Prior non-table target rows: `mnsgc-02`, `mnsgc-05`, `mnsgc-11`, `mnsgc-13`, and control `mnsgc-20`

The corrected table diagnostic shows real object-backed table debt, but it is not enough by itself to accept a behavior change. Several same-source rows still show prior table tools resolving to non-table targets, and the current table/header sequence path is expensive on these annual reports.

## Runtime Repeat

Timeout repeat: `/mnt/pdf-review/public-holdouts/minnesota-sentencing-guidelines-annual-reports-2026-05-25/timeout-repeat-r1/baseline_report.json`

- Completed: `0/2`
- `mnsgc-07.pdf`: repeated `per_pdf_timeout_300000ms`
- `mnsgc-08.pdf`: repeated `per_pdf_timeout_300000ms`
- `false_positive_applied`: `0`

This confirms reproducible runtime/analyzer debt for the two hard-timeout rows.

## Behavior Probe

A small table/structure sequence proof was attempted on `mnsgc-01`, `mnsgc-03`, and control `mnsgc-17` using `scripts/all-input-table-structure-sequence-probe.ts`. It was manually stopped before the first row completed because the first proof row ran for several minutes without producing a row result. No source behavior was changed and no probe result was accepted.

## Decision

This source is diagnostic-only. No engine behavior was accepted and no original-50 validation was required because there were no source changes.

The source exposes a real high-impact table/header and runtime lane, but current evidence is not sufficient to implement a general fix safely:

- the full source has two reproducible hard timeouts;
- the proof path is too slow for a speed-bounded acceptance lane;
- same-source rows include prior non-table target resolution, including one high-scoring control;
- no sequence candidate proved score/PAC improvement on two target rows with stable controls.

Do not add Minnesota/source/year gates, report-family gates, filename/hash gates, PAC relaxations, scorer masking, or broad table admission from this evidence. A future table lane should first prove a faster bounded transaction on at least two stable focus rows while preserving controls and avoiding non-table target resolution.

## Cleanup

Downloaded PDFs and generated artifacts were local-only and were deleted after metrics extraction.
