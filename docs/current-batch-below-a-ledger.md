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
