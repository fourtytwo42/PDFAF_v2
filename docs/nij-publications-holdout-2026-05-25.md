# NIJ Publications Public Holdout

Date: 2026-05-25

Source: National Institute of Justice publications library: `https://nij.ojp.gov/library/publications/list`

This was a 20-PDF public outside-corpus holdout from NIJ publication detail pages with NIJ/OJP-hosted PDF downloads under 10 MB. The run was diagnostic-only: no scoring, planner, remediation, PAC gate, Docker, or API behavior changed.

## Run Setup

- Sample: first 20 unique PDF downloads discovered from bounded crawl of the NIJ publications list and detail pages, filtered to NIJ/OJP hosts and the `10 MB` cap.
- Size cap: all selected PDFs were under `10 MB`; the sample totaled about `45.0 MB`.
- Validation: one bounded deterministic 20-file run, low-row diagnostic, reading-order shell diagnostic, native heading/reading comparison, low-row repeat, and table target-resolution diagnostic for the minor table lane.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run: `/mnt/pdf-review/public-holdouts/nij-publications-2026-05-25/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `54.40 -> 79.35`.
- Median: `59 -> 93.5`.
- Grades after remediation: `11 A / 2 B / 0 C / 0 D / 7 F`.
- Rows below mean target `93`: `9`.
- Runtime p50/p95/max: `17222ms / 105569ms / 109620ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

Low rows:

| File | Score | Class | Notes |
| --- | ---: | --- | --- |
| `nij-02.pdf` | `52/F` | `reading_link_order_candidate` | Native untagged, no structure tree/content owners after source analysis; stable low repeat. |
| `nij-03.pdf` | `52/F` | `reading_link_order_candidate` | Same stable native-untagged structure-bootstrap failure shape. |
| `nij-04.pdf` | `52/F` | `reading_link_order_candidate` | Same stable native-untagged structure-bootstrap failure shape. |
| `nij-05.pdf` | `52/F` | `reading_link_order_candidate` | Same stable native-untagged structure-bootstrap failure shape. |
| `nij-06.pdf` | `52/F` | `reading_link_order_candidate` | Same stable native-untagged structure-bootstrap failure shape. |
| `nij-08.pdf` | `52/F` | `reading_link_order_candidate` | Same stable native-untagged structure-bootstrap failure shape. |
| `nij-09.pdf` | `52/F` | `reading_link_order_candidate` | Same stable native-untagged structure-bootstrap failure shape. |
| `nij-19.pdf` | `86/B` | `table_target_resolution_needed` | Minor table/header lane; only `7` raw points. |
| `nij-01.pdf` | `88/B` | `no_safe_predicate` | Mixed heading/bookmark/PDF-UA/reading residual. |

## Sample

| id | bytes | title | source URL |
| --- | ---: | --- | --- |
| `nij-01` | 6053870 | NamUs Fiscal Year 2024 Annual Report | `https://www.ojp.gov/pdffiles1/nij/310356.pdf` |
| `nij-02` | 1907831 | Inverted Factor Analysis - An Evaluation Using Benchmark Data Sets | `https://www.ojp.gov/pdffiles1/Digitization/89666NCJRS.pdf` |
| `nij-03` | 2186788 | Plight of the Indigent Accused in America - An Examination of Alternative Models for Providing Criminal Defense Services to the Poor, Executive Summary | `https://www.ojp.gov/pdffiles1/Digitization/98678NCJRS.pdf` |
| `nij-04` | 4801788 | Plight of the Indigent Accused in America - An Examination of Alternative Models for Providing Criminal Defense Services to the Poor, Executive Summary | `https://www.ojp.gov/pdffiles1/Digitization/98680NCJRS.pdf` |
| `nij-05` | 2250909 | Plight of the Indigent Accused in America - An Examination of Alternative Models for Providing Criminal Defense Services to the Poor, Executive Summary | `https://www.ojp.gov/pdffiles1/Digitization/98681NCJRS.pdf` |
| `nij-06` | 5378571 | Reducing Biases in Joined Criminal Offenses | `https://www.ojp.gov/pdffiles1/Digitization/96029NCJRS.pdf` |
| `nij-07` | 6271785 | Behavior Control Tools of Probation Officers: A Study of Probation Sanctions in Five Sites (Draft) | `https://www.ojp.gov/pdffiles1/Photocopy/120942NCJRS.pdf` |
| `nij-08` | 2247645 | Aggressive Patrol - A Search for Side-Effects | `https://www.ojp.gov/pdffiles1/Digitization/93582NCJRS.pdf` |
| `nij-09` | 824673 | Use of Nonnarcotic Drugs by Narcotic Addicts | `https://www.ojp.gov/pdffiles1/Digitization/102905NCJRS.pdf` |
| `nij-10` | 609066 | Paper Spray Mass Spectrometry for Rapid Drug and Drug Metabolite Screening Directly from Postmortem Blood Samples | `https://www.ojp.gov/pdffiles1/nij/grants/311600.pdf` |
| `nij-11` | 396058 | The Cross-Reactivity of the Cannabinoid Analogs (delta-8-THC, delta-10-THC and CBD) and their metabolites in Urine of Six Commercially Available Homogeneous Immunoassays, Grant Report | `https://www.ojp.gov/pdffiles1/nij/grants/311646.pdf` |
| `nij-12` | 1165269 | Development of a THC Breath Analyzer using Chitosan Film with Colorimetric Dye | `https://www.ojp.gov/pdffiles1/nij/grants/311645.pdf` |
| `nij-13` | 932225 | Genetic Analysis of Facial Shape and Appearance | `https://www.ojp.gov/pdffiles1/nij/grants/311660.pdf` |
| `nij-14` | 2767791 | Implementation of NPS Discovery - An Early Warning System for Novel Drug Intelligence, Surveillance, Monitoring, Response, and Forecasting using Drug Materials | `https://www.ojp.gov/pdffiles1/nij/grants/311171.pdf` |
| `nij-15` | 2317932 | Optimized, Semi-Automated Differential DNA Extraction | `https://www.ojp.gov/pdffiles1/nij/grants/311169.pdf` |
| `nij-16` | 1072495 | Non-Contact Detection of Fentanyl and Other Synthetic Opioids: Towards a Generalized Approach to Detection of Dangerous Drug Classes | `https://www.ojp.gov/pdffiles1/nij/grants/311353.pdf` |
| `nij-17` | 2085486 | Multi-Modal Analysis of Body-Worn Camera Recordings: Evaluating Novel Methods for Measuring Police Implementation of Procedural Justice | `https://www.ojp.gov/pdffiles1/nij/grants/311091.pdf` |
| `nij-18` | 2299313 | Real-Time Sample-Mining and Data-Mining Approaches for the Discovery of Novel Psychoactive Substances (NPS) | `https://www.ojp.gov/pdffiles1/nij/grants/311115.pdf` |
| `nij-19` | 1276979 | Improving Employment and Reducing Recidivism among Prison Offenders via Virtual Reality Job-Interview Training, Final Report | `https://www.ojp.gov/pdffiles1/nij/grants/311116.pdf` |
| `nij-20` | 358430 | Deep Learning to Enhance Investigative Lead Information for Automotive Clearcoats | `https://www.ojp.gov/pdffiles1/nij/grants/311114.pdf` |

## Diagnostics

Low-row diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/nij-publications-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `plan_high_impact_targeted_diagnostic`.
- Recommended lane: `reading_link_order_candidate`.
- Raw points needed for mean `93`: `273`.
- Lane split:
  - `reading_link_order_candidate`: `7` rows, `287` raw points.
  - `table_target_resolution_needed`: `1` row, `7` raw points.
  - `no_safe_predicate`: `1` row, `5` raw points.

Reading-order shell diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/nij-publications-2026-05-25/reading-order-shell-r1/reading-order-shell-diagnostic.md`
- Sequence candidates needing proposal cleanup: `0`.
- Safe route controls: `0`.
- Recovered routes with final orphan debt: `0`.
- No existing reading-order shell route is supported for the `52/F` cluster.

Native heading/reading comparison:

- Local artifact: `/mnt/pdf-review/public-holdouts/nij-publications-2026-05-25/native-heading-comparison-r1.jsonl`
- The seven `52/F` rows all analyze as `native_untagged` with missing structure tree, `0` paragraph structure elements, `0` MCID spans, and classification `structure_bootstrap_required`.
- They have many layout heading candidates, but no content-backed structure target; existing `synthesize_basic_structure_from_layout` no-effected during the benchmark run.
- `nij-07` is an important same-source old-document control: it also starts as native untagged but reached `93/A`, showing that the low cluster is not safely fixed by a broad source/age/photocopy rule.

Low-row repeat:

- Local artifact: `/mnt/pdf-review/public-holdouts/nij-publications-2026-05-25/repeat-low-r1/baseline_report.json`
- Repeated rows: `nij-01`, `nij-02`, `nij-03`, `nij-04`, `nij-05`, `nij-06`, `nij-08`, `nij-09`, `nij-19`.
- Repeat result: every repeated low row exactly matched the baseline final score.
- This supports stable residual debt, not runtime volatility.

Table target-resolution diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/nij-publications-2026-05-25/table-target-resolution-r1/table-target-resolution-diagnostic.md`
- Decision: `keep_table_target_resolution_diagnostic_only`.
- Stable focus candidate: `nij-19`.
- Unsafe control candidates: `nij-12`, `nij-14`, `nij-18`, `nij-20`.
- This is a minor lane and is not selective enough for behavior promotion.

## Decision

No engine change was accepted from this holdout set.

Reasons:

- The source missed the requested source mean target: `79.35` versus `93`.
- The dominant residual family is stable native-untagged structure-bootstrap debt with no object-backed paragraph, MCID, or heading target.
- Existing native reading-order shell and layout synthesis paths do not produce a safe score-moving route on the `52/F` cluster.
- The small table lane is non-selective and affects too few points to justify behavior work from this source.
- `false_positive_applied` stayed `0`, and there were no hard timeouts or errors.

No original-50 validation was required because no source behavior changed. Downloaded PDFs and generated validation artifacts were kept local only for metrics extraction and were deleted after this diagnostic set was documented.
