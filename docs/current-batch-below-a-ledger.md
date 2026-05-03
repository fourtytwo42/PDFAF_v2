# Current Batch Below-A Ledger

Durable list of rows below `A` from current-engine batch refreshes. Generated benchmark artifacts stay local; this source ledger records only the row ids, grades, and concise blocker notes needed for later stage planning.

## 2026-05-03 - Holdout 6 Current Engine

- Run: `Output/from_sibling_pdfaf_v1_holdout_6/run-current-engine-2026-05-03-r1`
- Batch: `Input/from_sibling_pdfaf_v1_holdout_6/manifest.json`
- Result: `17 A / 0 B / 1 C / 0 D / 2 F`, mean `92.90`, median `98`, false-positive applied `0`

Below-A rows:

| Row | Grade | Score | Main blockers | Notes |
| --- | ---: | ---: | --- | --- |
| `v1-3506` | F | 59 | `heading_structure=0` | OCR/manual heading-zero residual. |
| `v1-4673` | F | 59 | `heading_structure=0`, `pdf_ua_compliance=67` | Backslid from Stage 171 `79/C`; table/link/annotation row. |
| `v1-4693` | C | 79 | `heading_structure=45`, `reading_order=45` | Backslid from Stage 171 `92/A`; partial heading/reading-order residual. |

## 2026-05-03 - Heading-Zero 1 Current Engine

- Run: `Output/from_sibling_pdfaf_v1_heading_zero_1/run-current-engine-2026-05-03-r1`
- Batch: `Input/from_sibling_pdfaf_v1_heading_zero_1/manifest.json`
- Result: `19 A / 0 B / 1 C / 0 D / 0 F`, mean `98.25`, median `99.5`, false-positive applied `0`

Below-A rows:

| Row | Grade | Score | Main blockers | Notes |
| --- | ---: | ---: | --- | --- |
| `v1-4611` | C | 79 | `reading_order=55`, `link_quality=73` | Heading is now strong (`heading_structure=97`); residual is mixed reading-order/link ownership rather than heading-zero. |

## 2026-05-03 - Legacy 17 Refresh Current Engine

- Run: `Output/from_sibling_pdfaf_v1_legacy_17_refresh/run-current-engine-2026-05-03-r1`
- Batch: `Input/from_sibling_pdfaf_v1_legacy_17_refresh/manifest.json`
- Result: `15 A / 0 B / 2 C / 0 D / 0 F`, mean `94.82`, median `97`, false-positive applied `0`

Below-A rows:

| Row | Grade | Score | Main blockers | Notes |
| --- | ---: | ---: | --- | --- |
| `v1-legacy-4078-4078-community-reentry-challenges-daunt-exoff` | C | 77 | `heading_structure=45`, `reading_order=45` | Partial heading/reading-order reachability residual; alt/link/table are strong. |
| `v1-legacy-4188-4188-corrections-data-illustrate-juvenile-inc` | C | 77 | `heading_structure=45`, `reading_order=45` | Same partial heading/reading-order cap shape as `4078`; alt/link/table are strong. |

## 2026-05-03 - Edgecase Corpus Current Engine Parallel-8

- Run: `Output/from_sibling_pdfaf_edgecase_corpus/run-current-engine-parallel8-2026-05-03-r3`
- Batch: `Input/from_sibling_pdfaf_edgecase_corpus/manifest.json`
- Result: `37 A / 3 B / 3 C / 5 D / 2 F`, mean `90.54`, median `97`, false-positive applied `0`
- Parallelism note: per-file `xargs -P 8`; no PDFs written; root disk stayed tight but stable, `/tmp` stayed safe, and memory did not approach OOM.

Below-A rows:

| Row | Grade | Score | Main blockers | Notes |
| --- | ---: | ---: | --- | --- |
| `v1-4147` | D | 69 | `table_markup=0`, `alt_text=52`, `pdf_ua_compliance=71` | Mixed table/alt/PDF-UA residual. |
| `v1-4164` | D | 69 | `form_accessibility=0`, `reading_order=35` | Strong headings/alt/PDF-UA; form/reading-order blocker. |
| `v1-4427` | C | 79 | `pdf_ua_compliance=71`, `heading_structure=78` | Near-pass PDF/UA plus partial heading evidence. |
| `v1-4453` | D | 69 | `table_markup=16`, `alt_text=20`, `pdf_ua_compliance=63` | Mixed table/alt/PDF-UA residual. |
| `v1-4503` | B | 80 | `alt_text=20`, `table_markup=72` | Near-pass table/alt residual. |
| `v1-4519` | F | 59 | `heading_structure=0`, `reading_order=0`, `pdf_ua_compliance=57` | Native shell heading/reading-order failure. |
| `v1-4583` | C | 79 | near-pass aggregate | No single reported category under `80`; inspect weighted/rounding and accepted timeline later. |
| `v1-4690` | D | 66 | `table_markup=6`, `alt_text=20`, `title_language=50` | Table/alt plus title/language residual. |
| `v1-4694` | F | 53 | `table_markup=10`, `alt_text=20`, `heading_structure=45`, `reading_order=45`, `pdf_ua_compliance=57` | Mixed heading/table/alt/PDF-UA residual. |
| `v1-4730` | B | 87 | `text_extractability=62`, `pdf_ua_compliance=71` | Runtime tail; single job dominated wall time. |
| `v1-4735` | D | 69 | `table_markup=35`, `alt_text=60` | Table/alt residual. |
| `v1-4748` | B | 82 | `alt_text=20` | Stable low-alt residual. |
| `v1-4761` | C | 79 | `alt_text=60`, `pdf_ua_compliance=71` | Near-pass alt/PDF-UA residual. |

## 2026-05-03 - All Remaining Unique Current Engine Parallel-8

- Run: `Output/all-remaining-current-engine/run-current-engine-parallel8-2026-05-03-r1`
- Batch: `/tmp/pdfaf-all-remaining-current-engine-manifest-2026-05-03.json`
- Scope: `203` unique PDFs from remaining unprocessed `Input/` manifests, deduped by SHA-256 against the current-engine batches already run.
- Result: `187 A / 2 B / 4 C / 4 D / 6 F`, mean `94.69`, median `97`, false-positive applied `0`
- Before result: `0 A / 3 B / 2 C / 7 D / 191 F`, mean `32.63`, median `34`
- Parallelism note: per-file `xargs -P 8`; no PDFs written. Parallel 8 completed without OOM; root disk stayed tight but stable, `/tmp` stayed safe, and OCR-heavy rows dominated wall time. Pipeline p95 was `214802 ms`; max was `v1_evolve_4-3513` at `668669 ms`.

Below-A rows:

| Row | Grade | Score | Main blockers | Notes |
| --- | ---: | ---: | --- | --- |
| `v1_edge_mix_2-4171` | D | 69 | `heading_structure=45`, `reading_order=45`, `alt_text=60`, `pdf_ua_compliance=67` | Mixed partial heading/reading-order plus alt/PDF-UA residual. |
| `v1_edge_mix-4145` | C | 78 | `alt_text=20` | Stable low-alt residual after earlier figure/alt gains. |
| `v1_edge_mix-4567` | D | 66 | `heading_structure=45`, `reading_order=45`, `alt_text=20`, `pdf_ua_compliance=67` | Mixed partial heading/reading-order plus alt/PDF-UA residual. |
| `v1_evolve_2-3451` | F | 59 | `heading_structure=0` | Parked OCR/manual no-safe-title-owner style residual. |
| `v1_evolve_2-3459` | F | 59 | `heading_structure=0` | Parked OCR/manual no-safe-title-owner style residual. |
| `v1_evolve_2-4614` | C | 79 | `heading_structure=78` | Near-pass partial heading residual. |
| `v1_evolve_3-4635` | F | 59 | `heading_structure=0`, `title_language=50` | Native/tagged zero-heading plus title/language residual. |
| `v1_evolve_4-3602` | F | 59 | `heading_structure=0` | Parked OCR/manual no-safe-title-owner style residual. |
| `v1_hard_1-4213` | F | 59 | `alt_text=0` | Known mixed alt/table/PDF-UA ordered-transaction debt; heading is no longer the blocker. |
| `v1_hard_1-4767` | B | 82 | `alt_text=20`, `pdf_ua_compliance=71` | Near-pass low-alt/PDF-UA residual. |
| `v1_hard_2-4105` | D | 68 | `table_markup=0`, `alt_text=20` | Known parked table/alt analyzer-debt row after Stage 184 heading lift. |
| `v1_holdout_4-holdout4-03-2c974ae2` | F | 45 | `heading_structure=0`, `reading_order=0` | Native shell heading/reading-order residual. |
| `v1_holdout_4-holdout4-04-27f9d243` | C | 76 | `heading_structure=45`, `reading_order=45` | Partial heading/reading-order residual. |
| `v1_holdout_4-holdout4-05-ad762d4a` | C | 76 | `heading_structure=76`, `alt_text=20` | Mixed heading/alt residual. |
| `v1_holdout_4-holdout4-11-5c9522ae` | D | 66 | `table_markup=0`, `alt_text=20`, `pdf_ua_compliance=56` | Mixed table/alt/PDF-UA residual. |
| `v1_holdout_5-4760` | B | 89 | `heading_structure=78` | Improved from former F; remaining partial heading evidence keeps it below A. |

## 2026-05-03 - Combined Unique Input Current Snapshot

- Scope: all `Input/**/manifest.json` PDFs, deduped by content SHA across overlapping corpora.
- Result source: latest current-engine artifacts available locally; original 50 uses `Output/experiment-corpus-baseline/run-stage184-full-2026-05-03-r1` in-run grades, while v1 batches use the current-engine refreshes logged above.
- Unique processed PDFs: `348/348`
- Grade distribution: `309 A / 6 B / 13 C / 10 D / 10 F`
- Mean: `94.18`; median: `97`

### B Rows

| Row | Score | Main blockers | Source |
| --- | ---: | --- | --- |
| `4503` | 80 | alt_text=20, table_markup=72 | `from_sibling_pdfaf_edgecase_corpus` |
| `4748` | 82 | alt_text=20 | `from_sibling_pdfaf_edgecase_corpus` |
| `long-4516` | 82 | title_language=50, heading_structure=78, pdf_ua_compliance=43 | `experiment-corpus` |
| `v1_hard_1-4767` | 82 | alt_text=20, pdf_ua_compliance=71 | `from_sibling_pdfaf_v1_hard_1` |
| `4730` | 87 | text_extractability=62, pdf_ua_compliance=71 | `from_sibling_pdfaf_edgecase_corpus` |
| `v1_holdout_5-4760` | 89 | heading_structure=78 | `from_sibling_pdfaf_v1_holdout_5` |

### C Rows

| Row | Score | Main blockers | Source |
| --- | ---: | --- | --- |
| `structure-4076` | 70 | heading_structure=45, pdf_ua_compliance=63, table_markup=72, reading_order=45 | `experiment-corpus` |
| `v1_holdout_4-holdout4-04-27f9d243` | 76 | heading_structure=45, reading_order=45 | `from_sibling_pdfaf_v1_holdout_4` |
| `v1_holdout_4-holdout4-05-ad762d4a` | 76 | heading_structure=76, alt_text=20 | `from_sibling_pdfaf_v1_holdout_4` |
| `legacy-4078-4078-community-reentry-challenges-daunt-exoff` | 77 | heading_structure=45, reading_order=45 | `from_sibling_pdfaf_v1_legacy_17_refresh` |
| `legacy-4188-4188-corrections-data-illustrate-juvenile-inc` | 77 | heading_structure=45, reading_order=45 | `from_sibling_pdfaf_v1_legacy_17_refresh` |
| `v1_edge_mix-4145` | 78 | alt_text=20 | `from_sibling_pdfaf_v1_edge_mix` |
| `4427` | 79 | heading_structure=78, pdf_ua_compliance=71 | `from_sibling_pdfaf_edgecase_corpus` |
| `4583` | 79 | near-pass aggregate | `from_sibling_pdfaf_edgecase_corpus` |
| `4611` | 79 | link_quality=73, reading_order=55 | `from_sibling_pdfaf_v1_heading_zero_1` |
| `4693` | 79 | heading_structure=45, reading_order=45 | `from_sibling_pdfaf_v1_holdout_6` |
| `4761` | 79 | alt_text=60, pdf_ua_compliance=71 | `from_sibling_pdfaf_edgecase_corpus` |
| `short-4176` | 79 | link_quality=58 | `experiment-corpus` |
| `v1_evolve_2-4614` | 79 | heading_structure=78 | `from_sibling_pdfaf_v1_evolve_2` |

### D Rows

| Row | Score | Main blockers | Source |
| --- | ---: | --- | --- |
| `4690` | 66 | title_language=50, alt_text=20, table_markup=6 | `from_sibling_pdfaf_edgecase_corpus` |
| `v1_edge_mix-4567` | 66 | heading_structure=45, alt_text=20, pdf_ua_compliance=67, reading_order=45 | `from_sibling_pdfaf_v1_edge_mix` |
| `v1_holdout_4-holdout4-11-5c9522ae` | 66 | alt_text=20, pdf_ua_compliance=56, table_markup=0 | `from_sibling_pdfaf_v1_holdout_4` |
| `v1_hard_2-4105` | 68 | alt_text=20, table_markup=0 | `from_sibling_pdfaf_v1_hard_2` |
| `4147` | 69 | alt_text=52, pdf_ua_compliance=71, table_markup=0 | `from_sibling_pdfaf_edgecase_corpus` |
| `4164` | 69 | reading_order=35, form_accessibility=0 | `from_sibling_pdfaf_edgecase_corpus` |
| `4453` | 69 | alt_text=20, pdf_ua_compliance=63, table_markup=16 | `from_sibling_pdfaf_edgecase_corpus` |
| `4735` | 69 | alt_text=60, table_markup=35 | `from_sibling_pdfaf_edgecase_corpus` |
| `short-4214` | 69 | link_quality=75, reading_order=0 | `experiment-corpus` |
| `v1_edge_mix_2-4171` | 69 | heading_structure=45, alt_text=60, pdf_ua_compliance=67, reading_order=45 | `from_sibling_pdfaf_v1_edge_mix_2` |

### F Rows

| Row | Score | Main blockers | Source |
| --- | ---: | --- | --- |
| `v1_holdout_4-holdout4-03-2c974ae2` | 45 | heading_structure=0, reading_order=0 | `from_sibling_pdfaf_v1_holdout_4` |
| `4694` | 53 | heading_structure=45, alt_text=20, pdf_ua_compliance=57, table_markup=10, reading_order=45 | `from_sibling_pdfaf_edgecase_corpus` |
| `3506` | 59 | heading_structure=0 | `from_sibling_pdfaf_v1_holdout_6` |
| `4519` | 59 | heading_structure=0, pdf_ua_compliance=57, reading_order=0 | `from_sibling_pdfaf_edgecase_corpus` |
| `4673` | 59 | heading_structure=0, pdf_ua_compliance=67 | `from_sibling_pdfaf_v1_holdout_6` |
| `v1_evolve_2-3451` | 59 | heading_structure=0 | `from_sibling_pdfaf_v1_evolve_2` |
| `v1_evolve_2-3459` | 59 | heading_structure=0 | `from_sibling_pdfaf_v1_evolve_2` |
| `v1_evolve_3-4635` | 59 | title_language=50, heading_structure=0 | `from_sibling_pdfaf_v1_evolve_3` |
| `v1_evolve_4-3602` | 59 | heading_structure=0 | `from_sibling_pdfaf_v1_evolve_4` |
| `v1_hard_1-4213` | 59 | alt_text=0 | `from_sibling_pdfaf_v1_hard_1` |
