# Virginia DCJS Outside-Corpus Holdout

Date: 2026-05-17

## Scope

This is a first outside-corpus check against public PDFs from the Virginia Department of Criminal Justice Services (DCJS), a comparable state criminal justice agency and Statistical Analysis Center-style research source.

Source page: https://www.dcjs.virginia.gov/criminal-justice-research-center/publications-links

Local input set:

`Input/virginia_dcjs_holdout_2026_05_17/`

The folder contains 20 public DCJS PDFs plus a local `manifest.json`. The PDFs are local benchmark inputs and should not be committed unless explicitly accepted as source assets.

## Run

Command:

```sh
PDFAF_RUN_LOCAL_LLM=0 OPENAI_COMPAT_BASE_URL= \
  npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  Input/virginia_dcjs_holdout_2026_05_17 \
  Output/virginia-dcjs-holdout-2026-05-17-r1 \
  --no-semantic --no-pdfs
```

Artifact:

`Output/virginia-dcjs-holdout-2026-05-17-r1/baseline_report.json`

## Summary

- PDFs processed: 20/20
- Mean: 49.25 -> 86.20
- Median: 52 -> 95.5
- Final grades: 13 A, 6 D, 1 F
- Rows below 95: 9
- Rows below 93: 8
- Errors: 0
- `false_positive_applied`: 0

The engine is not failing this outside corpus wholesale. It recovers many chart/report PDFs to A grade, but a recurring class of DCJS report templates remains stuck around 69/D because table markup stays at 0 after attempted structural repairs.

## Row Results

| File | Report family | Before | After | Main residual |
|---|---:|---:|---:|---|
| `01-va-dcjs-drug-cases-2024.pdf` | drug cases | 42/F | 97/A | none |
| `02-va-dcjs-drug-cases-2019.pdf` | drug cases | 65/D | 99/A | none |
| `03-va-dcjs-drug-cases-2023.pdf` | drug cases | 35/F | 97/A | none |
| `04-va-dcjs-drug-overdose-2025q4.pdf` | quarterly drug/overdose | 53/F | 59/F | alt text remains 20 |
| `05-va-dcjs-drug-overdose-2026q1.pdf` | quarterly drug/overdose | 54/F | 99/A | none |
| `06-va-dcjs-pedestrian-stop-fy2022.pdf` | stop data | 69/D | 96/A | none |
| `07-va-dcjs-traffic-stop-fy2021.pdf` | traffic stop | 59/F | 69/D | table markup 0, PDF/UA 57 |
| `08-va-dcjs-traffic-stop-fy2022.pdf` | traffic stop | 54/F | 69/D | table markup 0, heading 60 |
| `09-va-dcjs-surveillance-tech-2024.pdf` | surveillance tech | 53/F | 96/A | none |
| `10-va-dcjs-traffic-stop-fy2024.pdf` | traffic stop | 54/F | 69/D | table markup 0, heading/link/PDF-UA debt |
| `11-va-dcjs-assault-murder-q3-2025.pdf` | crime trend | 51/F | 94/A | reading order 75, table markup 79 |
| `12-va-dcjs-crime-arrest-2006-2015.pdf` | crime trend | 42/F | 96/A | none |
| `13-va-dcjs-crime-drug-arrest-2014-2023.pdf` | crime trend | 70/C | 91/A | table/reading/PDF-UA residual |
| `14-va-dcjs-crime-drug-arrest-2015-2024.pdf` | crime trend | 69/D | 69/D | table markup 0 |
| `15-va-dcjs-index-crime-drug-2007-2016.pdf` | crime trend | 28/F | 97/A | none |
| `16-va-dcjs-index-crime-drug-2008-2017.pdf` | crime trend | 28/F | 98/A | none |
| `17-va-dcjs-index-crime-drug-2011-2020.pdf` | crime trend | 28/F | 95/A | none |
| `18-va-dcjs-index-crime-drug-2012-2021.pdf` | crime trend | 40/F | 69/D | table markup 0 |
| `19-va-dcjs-index-crime-drug-2013-2022.pdf` | crime trend | 40/F | 69/D | table markup 0 |
| `20-va-dcjs-lap-2017-2022.pdf` | victims/LAP | 51/F | 96/A | none |

## Findings

1. The major outside-corpus gap is table repair generalization, not title/language/basic structure.

Rows `07`, `08`, `10`, `14`, `18`, and `19` all finish at 69/D with `table_markup=0`. The tool timelines show repeated `normalize_table_structure`, `repair_native_table_headers`, and `set_table_header_cells` attempts, often rejected or no-effect. This is a strong signature that the current table repair predicates do not recognize or safely normalize these DCJS table/chart templates.

2. One short quarterly report exposes alt recovery debt.

`04-va-dcjs-drug-overdose-2025q4.pdf` stays at 59/F with final `alt_text=20` despite multiple `set_figure_alt_text` attempts. The March 2026 report from the same family reaches 99/A, so this is a useful paired positive/negative comparison.

3. Runtime is concentrated in the traffic-stop rows.

The 69/D traffic-stop rows took roughly 196-233 seconds each. They do not hard-timeout, but they consume most of the batch time while still failing to improve table markup. That makes this a good target family for diagnostic-first runtime and score improvement.

4. Mutation truth stayed clean.

No row reported `false_positive_applied`, so the poor outside-corpus scores are honest failures rather than hidden mutation/scorer issues.

## Recommended Next Diagnostic

Use this holdout as a new generalization corpus. The first focused lane should be a DCJS table-template diagnostic over:

- `07-va-dcjs-traffic-stop-fy2021.pdf`
- `08-va-dcjs-traffic-stop-fy2022.pdf`
- `10-va-dcjs-traffic-stop-fy2024.pdf`
- `14-va-dcjs-crime-drug-arrest-2015-2024.pdf`
- `18-va-dcjs-index-crime-drug-2012-2021.pdf`
- `19-va-dcjs-index-crime-drug-2013-2022.pdf`

The diagnostic should compare table object identity, row/column regularity, header inference, and chart/table confusion before adding any fixer behavior. A useful accepted fix should raise at least one of these rows out of the 69/D plateau while preserving `false_positive_applied=0` and proving a nearby high-scoring DCJS control stays stable.

## 2026-05-18 Candidate Follow-Up

A general candidate was tested locally after the table-template diagnostic. It combined root-only figure evidence and a guarded table structure/header sequence. This was not a PDF- or source-specific fix.

Virginia candidate artifact:

`Output/virginia-dcjs-holdout-2026-05-18-r2/baseline_report.json`

Candidate result:

- PDFs processed: 20/20
- Mean: 49.30 -> 93.20
- Median: 95
- `false_positive_applied`: 0
- Total deterministic runtime: 1,129,458 ms
- Slowest row: `07-va-dcjs-traffic-stop-fy2021.pdf` at 222,880 ms

This cleared the Virginia holdout mean/median target locally, but the behavior was not accepted because the original 50-corpus gate was not clean.

Original-50 validation artifacts:

- Full fixed-50 candidate run: `/mnt/pdf-review/pdfaf-validation/run-public-holdout-va-fixed50-2026-05-18-r2`
- Focused repeat after narrowing: `/mnt/pdf-review/pdfaf-validation/run-public-holdout-va-fixed50-regression-repeat-2026-05-18-r2`
- Figure-alt PAC recovery probe: `/mnt/pdf-review/pdfaf-validation/run-public-holdout-va-fixed50-figurealt-sequence-2026-05-18-r1`

Fixed-50 blockers:

- Full fixed-50 candidate run had reanalyzed mean 92.8958 and median 94, but p95 wall time rose to 206,166 ms and hard timeouts remained on `structure-4438` and `long-4516`.
- Focused repeat still regressed `font-4699` from 95 to 91 and `long-4680` from 95 to 92, with `long-4680` much slower than the fixed-50 baseline.
- A later figure-alt PAC recovery probe recovered `figure-4754` back to 78, but did not recover `font-4699` and produced a bad `long-4680` repeat, so that probe is diagnostic only.

Decision: reject this candidate for now. The Virginia source set proves useful outside-corpus pressure and shows a plausible 93+ path, but no behavior change should be committed or pushed until the original 50-corpus quality and speed regressions are resolved.
