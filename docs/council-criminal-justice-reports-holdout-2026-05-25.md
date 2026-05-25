# Council on Criminal Justice Reports Holdout - 2026-05-25

## Summary

This was a diagnostic-only public holdout set from the Council on Criminal Justice. The sample used 20 unique PDFs under 10 MB discovered from `counciloncj.org` sitemap/page crawling and hosted under `counciloncj.org/wp-content/uploads/`.

The deterministic no-semantic/no-PDF validation completed cleanly, but the source did not meet the 93 mean target.

- Local run before cleanup: `/mnt/pdf-review/public-holdouts/council-criminal-justice-reports-2026-05-25/run-r1`
- PDFs processed: `20/20`
- Mean: `62.30 -> 92.70`
- Median: `93`
- Grades after: `18 A / 2 B / 0 C / 0 D / 0 F`
- Rows below `93`: `7`
- Runtime p50/p95/max: `11838ms / 135779ms / 188914ms`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`

## Sample

The selected PDFs were:

| Row | Source URL | Bytes |
| --- | --- | ---: |
| `ccj-01` | `https://counciloncj.org/wp-content/uploads/2026/05/AI-Taxonomy.pdf` | `1302439` |
| `ccj-02` | `https://counciloncj.org/wp-content/uploads/2026/03/AI-User-Decision-Framework.pdf` | `4629725` |
| `ccj-03` | `https://counciloncj.org/wp-content/uploads/2026/03/Appendix-A.pdf` | `235498` |
| `ccj-04` | `https://counciloncj.org/wp-content/uploads/2026/03/Appendix-B.pdf` | `359724` |
| `ccj-05` | `https://counciloncj.org/wp-content/uploads/2026/03/Appendix-C.pdf` | `447659` |
| `ccj-06` | `https://counciloncj.org/wp-content/uploads/2026/03/Appendix-D.pdf` | `482136` |
| `ccj-07` | `https://counciloncj.org/wp-content/uploads/2026/03/Appendix-E.pdf` | `551836` |
| `ccj-08` | `https://counciloncj.org/wp-content/uploads/2026/03/Appendix-F.pdf` | `388196` |
| `ccj-09` | `https://counciloncj.org/wp-content/uploads/2026/03/Appendix-G.pdf` | `524284` |
| `ccj-10` | `https://counciloncj.org/wp-content/uploads/2026/03/Appendix-H.pdf` | `618935` |
| `ccj-11` | `https://counciloncj.org/wp-content/uploads/2026/03/Appendix-I.pdf` | `531772` |
| `ccj-12` | `https://counciloncj.org/wp-content/uploads/2026/03/Appendix-J.pdf` | `375237` |
| `ccj-13` | `https://counciloncj.org/wp-content/uploads/2026/04/VJC-Senate-Testimony-2026.pdf` | `771664` |
| `ccj-14` | `https://counciloncj.org/wp-content/uploads/2025/04/Vets-Summary_Revised.pdf` | `277892` |
| `ccj-15` | `https://counciloncj.org/wp-content/uploads/2024/05/ae-weisburd.pdf` | `121595` |
| `ccj-16` | `https://counciloncj.org/wp-content/uploads/2024/10/Pandemic_Social_Unrest_and_Crime_in_U.S._Cities-June_2022_Update-3.pdf` | `6973236` |
| `ccj-17` | `https://counciloncj.org/wp-content/uploads/2023/12/ae-wu-and-mcdowall.pdf` | `86427` |
| `ccj-18` | `https://counciloncj.org/wp-content/uploads/2025/10/CCJ-Centering-Justice_JJ-Past-Lessons_TWoods_20250930_no-notes.pdf` | `1570676` |
| `ccj-19` | `https://counciloncj.org/wp-content/uploads/2025/09/NSDUH-Methodology.pdf` | `305275` |
| `ccj-20` | `https://counciloncj.org/wp-content/uploads/2024/06/COVID-19_and_the_Changing_Landscape_of_SUD_Treatment-1.pdf` | `2502635` |

## Diagnostics

The standard low-row diagnostic returned:

- Decision: `plan_medium_impact_targeted_diagnostic`
- Recommended lane: `reading_link_order_candidate`
- Raw points needed for mean `93`: `6`
- Primary low rows: `ccj-02` at `84/B` and `ccj-03` at `82/B`
- Near misses: `ccj-05`, `ccj-06`, `ccj-10`, `ccj-12`, and `ccj-16`

Focused diagnostics did not support a safe production change:

- Reading-order shell diagnostic: `0` sequence candidates, `0` selected rows.
- Low-row repeat: `ccj-03` and near misses reproduced exactly; `ccj-02` dropped from `84/B` to `59/F`, indicating analyzer/repair-state volatility rather than a clean improvement lane.
- Table target-resolution diagnostic: only `ccj-03` had a stable object-backed table-shape focus candidate; `ccj-02` had a prior table attempt resolving as a non-table target. This is insufficient for a general behavior proof.
- Figure/alt diagnostic on the repeat classified `ccj-02` as `checker_alt_partial_existing_bound`, with bounded figure-alt writes improving coverage but not enough to move final alt text reliably. The baseline classified figure/alt as diagnostic-only as well.

## Decision

No source behavior was changed or accepted from this holdout.

The missed mean is real for this source under the current deterministic run: `92.70`, with a repeat showing potential downside volatility on `ccj-02`. The available evidence does not justify a PDF-family-specific fix, a table target broadening, a PAC exception, or a scorer relaxation. This set should remain diagnostic-only unless a future general analyzer-volatility or object-backed table/figure repair lane explains the same failure shape and passes controls.

No original-50 validation was required because no behavior changed.

Generated PDFs and benchmark artifacts were local-only and deleted after metrics extraction.
