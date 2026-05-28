# Short Header Template Table Proof Parked

Date: 2026-05-28

## Decision

Diagnostic/infrastructure-only. Do not route this from the production planner yet.

The repeated-template diagnostic showed that WV-style lows are dominated by many small real `/Table` objects with header rows shorter than body rows, especially `2-3` row templates. This proof added dormant native Python primitives to test that subtype without broadening existing behavior.

## Source Change

- `python/pdf_analysis_helper.py`
  - adds explicit `tableFailureClass: short_header_row_template` support inside `normalize_table_structure`;
  - in that explicit mode only, normalizes tables whose first row is all `/TH` and shorter than uniform body rows, for example `2-3 -> 3-3`;
  - keeps generic `strongly_irregular_rows` behavior unchanged;
  - adds explicit `associateAllTableHeaders: true` support to `set_table_header_cells` so diagnostics can associate existing headers across current real `/Table` objects without stale per-ref batches.
- `tests/integration/tableNormalization.integration.test.ts`
  - proves generic normalization does not touch `2-3` tables;
  - proves the explicit short-header subtype improves table invariants;
  - proves no-ref all-table header association is disabled unless `associateAllTableHeaders` is explicitly requested.

No TypeScript planner route, scorer rule, PAC gate, Docker/API behavior, ODL/PAC/POC runtime call, source gate, filename gate, row gate, or semantic behavior was added.

## Local WV Probe

Scratch proof pack: `/mnt/pdf-review/pdfaf-short-header-template-proof-2026-05-28-r1`

Source page: `https://dcr.wv.gov/resources/Pages/prea.aspx`

The scratch PDFs and generated artifacts were local only and cleaned after metrics extraction.

### One-Table Probe

On `wvdcrprea-02`, a representative real table ref `2698_0` changed cleanly:

- row pattern: `2-3 -> 3-3`
- header cells: `2 -> 3`
- irregular rows: `1 -> 0`
- header association missing: `1 -> 0`
- orphan header cells: `2 -> 0`
- data cells without headers: `3 -> 0`
- header cells with scope/ID: `0 -> 3`
- data cells with headers: `0 -> 3`
- MCID/ParentTree ownership preserved

This proves the subtype is real and object-backed.

### Full-Row Combined Probe

Diagnostic sequence on `wvdcrprea-02`:

1. eight `short_header_row_template` normalize passes;
2. six existing `strongly_irregular_rows` normalize passes;
3. explicit all-table header association.

Result:

| Metric | Before | After |
| --- | ---: | ---: |
| Overall score | `69/D` | `85/B` |
| `table_markup` | `0` | `79` |
| `pdf_ua_compliance` | `71` | `79` |
| Header association missing | `246` | `7` |
| Orphan header cells | `512` | `1` |
| Data cells without headers | `1477` | `8` |
| Data cells with headers | `0` | `1555` |
| Irregular tables | `239` | `1` |
| Strongly irregular tables | `129` | `1` |

The remaining blockers after the proof were:

- one empty/root-reachable `/Table` with `0` cells and no headers;
- one single-column-dominant irregular table with row counts `1,1,1,2,1,1,1,2`;
- residual PAC table/header caps from those objects.

## Interpretation

This is meaningful table movement but not enough to promote production behavior. The combined proof still stops at `85/B`, below the goal for table-heavy outside sources, and it is currently a diagnostic sequence rather than a bounded planner transaction with control validation.

The useful next lane is not broader table admission. It is a narrow follow-up subtype:

- empty zero-cell `/Table` cleanup when the table has no cells, MCIDs, OBJR, or text metadata;
- single-column repeated table variance handling for true object-backed table rows;
- then a bounded planner transaction that runs short-header template normalization, existing strongly-irregular normalization, and header association in one controlled path.

Acceptance still requires at least two independent outside-source positives, same-source and original controls stable, `false_positive_applied=0`, no non-table PAC side effects, no new hard timeout, and original-50 deterministic validation before routing this behavior.

## Verification

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/integration/tableNormalization.integration.test.ts`
- `npx -y node@22 /usr/bin/pnpm run lint`

No original-50 run was required because no planner route or production behavior was added.
