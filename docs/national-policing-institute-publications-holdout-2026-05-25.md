# National Policing Institute Publications Holdout - 2026-05-25

## Summary

This was a public outside-source holdout against National Policing Institute publication PDFs. The final sample used 20 unique direct PDFs under 10 MB discovered from `/publications/` and `/publication/...` detail pages. A broader first crawler pass was discarded because it selected administrative/event PDFs; the accepted sample below is publication-detail based.

The initial deterministic run missed the mean target, but a fresh full-source rerun cleared it without any behavior change.

- Local r1 run before cleanup: `/mnt/pdf-review/public-holdouts/national-policing-institute-publications-2026-05-25/run-r1`
- Local r2 run before cleanup: `/mnt/pdf-review/public-holdouts/national-policing-institute-publications-2026-05-25/run-r2`
- PDFs processed: `20/20` in both runs
- r1 mean: `55.85 -> 92.10`, median `93`
- r2 mean: `54.90 -> 93.40`, median `93.5`
- r2 grades after: `19 A / 1 B / 0 C / 0 D / 0 F`
- r2 rows below `93`: `7`
- r2 runtime p50/p95/max: `12169ms / 53091ms / 69382ms`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`

## Sample

| Row | Source URL | Bytes |
| --- | --- | ---: |
| `npi-01` | `https://www.policinginstitute.org/wp-content/uploads/2018/07/DC-Inauguration-Report-Final-070918.pdf` | `1402935` |
| `npi-02` | `https://www.policinginstitute.org/wp-content/uploads/2023/03/2022-NPI-Annual-Report.pdf` | `5022712` |
| `npi-03` | `https://www.policinginstitute.org/wp-content/uploads/2025/02/Twenty-first-Century-Protest-Response_NPI_COPS-r1159-pub.pdf` | `194221` |
| `npi-04` | `https://www.policinginstitute.org/wp-content/uploads/2022/09/e062201018_Protest_Response_v16_06sep22_final_508-1.pdf` | `1259334` |
| `npi-05` | `https://www.policinginstitute.org/wp-content/uploads/2017/03/5-Things-on-Analyzing-Police-Traffic-Stop-Data-1.pdf` | `75956` |
| `npi-06` | `https://www.policinginstitute.org/wp-content/uploads/2019/01/5things_platform.pdf` | `72571` |
| `npi-07` | `https://www.policinginstitute.org/wp-content/uploads/2017/07/5-THINGS-to-Know-About-Crime-Gun-Intelligence-Centers.pdf` | `83378` |
| `npi-08` | `https://www.policinginstitute.org/wp-content/uploads/2021/09/5-Things-You-Need-to-Know-About-Ghost-Guns_Final_2021.pdf` | `88293` |
| `npi-09` | `https://www.policinginstitute.org/wp-content/uploads/2015/06/PF_FiveThings_HotSpotsPolicing_Handout_RBG.pdf` | `443394` |
| `npi-10` | `https://www.policinginstitute.org/wp-content/uploads/2017/07/5ThingsLEOnearmiss_Final.pdf` | `2526773` |
| `npi-11` | `https://www.policinginstitute.org/wp-content/uploads/2015/06/PF_FiveThings_MarijuanaLegal_Handout_RGB.pdf` | `621406` |
| `npi-12` | `https://www.policinginstitute.org/wp-content/uploads/2015/06/PF_FiveThings_OpenDateInPolicing_Handout_RGB.pdf` | `359126` |
| `npi-13` | `https://www.policinginstitute.org/wp-content/uploads/2021/03/5-Things-Militias_final-2.pdf` | `360220` |
| `npi-14` | `https://www.policinginstitute.org/wp-content/uploads/2016/10/PF_FiveThings_UAS_Handout_8.30.16_RGB.pdf` | `9319341` |
| `npi-15` | `https://www.policinginstitute.org/wp-content/uploads/2018/07/5-THINGS-Stop_Question_Frisk.pdf` | `79821` |
| `npi-16` | `https://www.policinginstitute.org/wp-content/uploads/2019/02/ASV-Comparison-of-Averted-and-Completed-School-Attacks_Final-Report-2019.pdf` | `8115218` |
| `npi-17` | `https://www.policinginstitute.org/wp-content/uploads/2025/01/A-Crisis-of-Trust-NPF-FINALNEW.pdf` | `9785922` |
| `npi-18` | `https://www.policinginstitute.org/wp-content/uploads/2015/08/A-Heist-Gone-Bad-Critical-Incident-Review.pdf` | `2117986` |
| `npi-19` | `https://www.policinginstitute.org/wp-content/uploads/2019/02/ASV-Preliminary-Report-on-Averted-School-Violence-Database_Final-Report-2019.pdf` | `7859819` |
| `npi-20` | `https://www.policinginstitute.org/wp-content/uploads/2022/10/NPI_Study-of-Bias-in-DC-Police-Threat-Assessment-Process_Oct2022-2.pdf` | `5668892` |

## Diagnostics

r1 low-row diagnostic:

- Decision: `plan_medium_impact_targeted_diagnostic`
- Recommended lane: `reading_link_order_candidate`
- Raw points needed for mean `93`: `18`
- Main rows: `npi-03` at `79/C`, `npi-14` at `81/B`, plus a near-miss cluster

Focused diagnostics did not support a production change:

- Reading-order shell diagnostic found `0` sequence candidates, `0` safe route controls, and no selected rows.
- Figure/alt no-gain diagnostic returned `keep_figure_alt_diagnostic_only`, with `0` scoring candidates and `0` behavior candidates.
- PDF/UA catalog syntax diagnostic returned `keep_pdfua_catalog_syntax_diagnostic_only`; most catalog debt was already score-active, and the lone catalog behavior candidate was not enough for promotion.
- Font/CMap diagnostic returned `keep_font_cmap_diagnostic_only`; `npi-14` has real existing low text-extractability/CMap debt, but no new score-active cap or repair lane was justified.

Repeat and rerun evidence:

- Low-row repeat recovered `npi-03` from `79/C` to `96/A`, but left `npi-14` and the near-miss cluster stable. Repeat-overlay mean was only `92.95`.
- Fresh full-source r2 recovered `npi-03` to `100/A`, moved `npi-06` and `npi-18` up, and cleared the source with mean `93.40`.
- `npi-14` repeated at `81/B` and remains stable no-safe/font-CMap/text-extractability debt.

## Decision

No source behavior was changed or accepted.

This source should be treated as source-passing on the fresh r2 run, with documented route variance on `npi-03` and stable parked debt on `npi-14`. The observed misses do not justify source-specific gates, scorer relaxation, broad reading-order admission, catalog behavior, font/CMap scoring changes, or PAC exceptions.

No original-50 validation was required because no behavior changed.

Generated PDFs and benchmark artifacts were local-only and deleted after metrics extraction.
