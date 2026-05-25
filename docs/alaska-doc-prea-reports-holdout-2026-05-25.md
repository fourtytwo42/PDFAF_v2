# Alaska DOC PREA Reports Public Holdout

Date: 2026-05-25

Source: Alaska Department of Corrections Prison Rape Elimination Act page: `https://doc.alaska.gov/prison-rape-elimination-act`

This was a 20-PDF public holdout sample from official Alaska DOC PREA annual and facility audit report PDFs under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: the first 20 under-cap PREA annual/audit PDFs linked from the source page.
- Size cap: all selected PDFs were under `10 MB`; the sample totaled about `14 MB`.
- Validation: one bounded deterministic 20-file run plus low-row and table target diagnostics.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run: `/mnt/pdf-review/public-holdouts/alaska-doc-prea-reports-2026-05-25/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `46.35 -> 90.25`.
- Median after remediation: `96`.
- Grades after remediation: `16 A / 0 B / 0 C / 4 D / 0 F`.
- Points needed for mean 93: `55`.
- Runtime p50/p95/max: `15965ms / 34753ms / 45182ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Sample

| id | title | bytes |
| --- | --- | ---: |
| `akprea-01` | 2016 Annual PREA Report | 273828 |
| `akprea-02` | 2017 Annual PREA Report | 289562 |
| `akprea-03` | 2020 Annual PREA Report | 866880 |
| `akprea-04` | 2021 Annual PREA Report | 1271856 |
| `akprea-05` | 2022 Annual PREA Report | 640267 |
| `akprea-06` | 2023 Annual PREA Report | 694575 |
| `akprea-07` | 2024 Annual PREA Report | 856938 |
| `akprea-08` | Goose Creek Correctional Center -- 8/4/2014 | 1252832 |
| `akprea-09` | Palmer Correctional Center -- 8/07/2014 | 675205 |
| `akprea-10` | Lemon Creek Correctional Center -- 8/11/2014 | 272434 |
| `akprea-11` | Ketchikan Correctional Center -- 8/14/2014 | 275444 |
| `akprea-12` | Fairbanks Correctional Center -- 4/04/2019 | 827176 |
| `akprea-13` | Mat-Su Pre-Trial -- 6/03/2019 | 1012521 |
| `akprea-14` | Anchorage Correctional Complex -- 6/05/2019 | 1005138 |
| `akprea-15` | Hiland Mountain Correctional Center -- 6/11/2019 | 953380 |
| `akprea-16` | Wildwood Correctional Center -- 07/14/2019 | 911402 |
| `akprea-17` | Spring Creek Correctional Center -- 07/17/2019 | 871909 |
| `akprea-18` | Anvil Mountain Correctional Center -- 10/01/2019 | 1035010 |
| `akprea-19` | Yukon-Kuskokwim Correctional Center -- 10/04/2019 | 997895 |
| `akprea-20` | Anchorage Correctional Complex -- 5/19/2024 | 245680 |

## Low-Row Diagnostic

The low-row diagnostic selected `table_target_resolution_needed`.

| Candidate class | Rows | Raw points to target | Notes |
| --- | ---: | ---: | --- |
| Table target resolution needed | `4` | `96` | `akprea-03`, `akprea-04`, `akprea-06`, and `akprea-07` were annual PREA reports that finished `69/D` with table/PDF-UA debt. |

The other annual reports and facility audit controls reached A-grade:

- `akprea-01`: `97/A`.
- `akprea-02`: `97/A`.
- `akprea-05`: `96/A`.
- `akprea-08` through `akprea-20`: `93-97/A`.

## Table Target Diagnostic

The table target-resolution diagnostic decided `keep_table_target_resolution_diagnostic_only`.

- Stable focus candidates: `akprea-03`, `akprea-04`, `akprea-06`, and `akprea-07`.
- Unsafe control candidates: `akprea-01`, `akprea-02`, `akprea-05`, and `akprea-20`.
- Prior non-table target rows: `akprea-12`.
- Classification counts: `8 stable_normalize_target`, `1 non_table_target_attempt`, and `1 control_or_high_grade_noise`.

The low rows expose real table/header debt, but the available stable table-shape predicate is too broad because several A-grade controls match it too. One A-grade control also shows a prior `normalize_table_structure` target resolving as `P`, which is the target-identity risk seen in earlier public PREA/report holdouts.

## Decision

No remediation, scorer, planner, analyzer, or PAC-gate behavior was accepted from this holdout.

Alaska narrowly misses the source mean target but does not justify a production change. Existing table tools already attempted the relevant family on the D-grade rows: they either returned `no_structural_change`, applied without score movement, or remained blocked by PAC-visible table-header association debt. The evidence supports the broader parked table/header transaction lane, not a source-specific or threshold-based fix.

Do not patch with Alaska/source/year/PDF gates, scorer masking, PAC relaxations, broad table admission, table target fallback, or a lower Stage 180 heading threshold from this evidence. A future accepted change would need to preserve or rebuild final `/Scope`, `/ID`, and `/Headers` evidence after table normalization, keep the A-grade annual/audit controls stable, and pass original-50 quality and speed validation.

Because no source behavior changed, original-50 validation was not required.
