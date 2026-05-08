# PAC Strict-Cap Remediation Target Decision

Date: 2026-05-08

## Source Runs

- Strict fixed-50 run: `Output/experiment-corpus-baseline/run-pac-strict-grader-fixed50-2026-05-08-r1`
- Five-review PAC gap diagnostic: `Output/review-five-a-pdfs-2026-05-08-r1/pac-gap-diagnostic/`
- Selection diagnostic: `Output/experiment-corpus-baseline/pac-strict-cap-target-diagnostic-2026-05-08-r1/`

## Decision

The next remediation target should be **table/header association**.

The strict-cap diagnostic selected the `table_header_structure` family:

- Rules: `pdfua.table.header_association_present`, `pdfua.table.header_cells_associated`
- Low-score target files: `figure-4754`, `font-4699`, `long-4700`
- Five-PDF PAC relevance: external PAC `Structure elements` bucket maps to the same table/header leaf family
- Existing repair coverage: `normalize_table_structure` is already available, but the next stage should first prove stable table object identity and protected score movement

## Why This Beats Parent Links First

`pdfua.structure.parent_links_valid` is the most frequent strict cap, but it is not the best first fixer target:

- It appears on many A-grade rows, so most occurrences are not score-moving.
- Low-score occurrences need direct object identity before a repair can be chosen safely.
- A broad structure/ParentTree fixer has higher route and PAC gate risk than a bounded table/header repair.

Table/header caps are lower frequency, but they are score-moving and map to an existing deterministic repair family.

## Candidate Rows

| File | Score | Grade | Strict PAC Rules | Category |
| --- | ---: | --- | --- | --- |
| `figure-4754` | 78 | C | `pdfua.table.header_association_present`, `pdfua.table.header_cells_associated` | `table_markup` |
| `font-4699` | 88 | B | `pdfua.table.header_association_present`, `pdfua.table.header_cells_associated` | `table_markup` |
| `long-4700` | 78 | C | `pdfua.table.header_association_present`, `pdfua.table.header_cells_associated` | `table_markup` |

`long-4700` also has `pdfua.list.lbl_lbody_parent_valid`; keep that as secondary evidence unless the table diagnostic proves list structure is the true blocker.

## Controls

Use rows with table/header caps but A-grade outcomes as controls before accepting behavior:

- `fixture-accessible`
- `figure-4753`
- `long-4608`

Also keep current sensitive controls in scope:

- `fixture-inaccessible`
- `structure-3775`
- `font-4035`
- `long-4516`
- `long-4683`

## Parked Or Tracked Families

- `pdfua.structure.parent_links_valid`: track and deepen object identity; do not select first.
- `pdfua.content.orphan_mcids_absent`: frequent but mostly A-grade after current recovery rules.
- `pdfua.content.path_paint_tagged_or_artifacted`: track as PAC parity debt; not currently score-moving on low rows.
- Font/CMap rules: remain diagnostic-only; prior scoring promotion was too noisy.
- `structure-4438`: remains parked runtime/checkpoint debt.
- `structure-4076`: remains parked table/analyzer-applicability debt.

## Recommended Next Stage

Run a **Table/Header Association Object Diagnostic** before changing remediation behavior:

1. Compare `figure-4754`, `font-4699`, and `long-4700` against A-grade controls with the same table/header strict caps.
2. Extract stable table identifiers: struct refs, object refs, row/cell counts, TH `/Scope`, `/Headers`/`/ID`, orphan headers, and TD-without-header counts.
3. Identify whether existing `normalize_table_structure` can target the bad table without creating non-table PAC regressions.
4. Only add behavior if protected reanalysis shows `table_markup` and total score movement with page/text/tag/PAC safety preserved.

This keeps the stricter PAC grader useful for selecting remediation targets without weakening PAC gates or adding broad table retries.
