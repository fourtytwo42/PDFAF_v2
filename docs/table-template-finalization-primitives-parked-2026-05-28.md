# Table Template Finalization Primitives Parked

Date: 2026-05-28

## Decision

Diagnostic/infrastructure-only. Do not route this from the production planner yet.

The WV repeated-table proof showed that the short-header template repair could clear most table debt but still left one empty table shell, one single-column variance table, blank corner-cell debt, and one header-only orphan header. This follow-up adds explicit native Python primitives for those subtypes so they can be used in controlled table transactions without broadening default remediation.

## Source Change

- `python/pdf_analysis_helper.py`
  - adds explicit `tableFailureClass: empty_table_shell` to remove a `/Table` only when it has no cells, no MCIDs, no `/OBJR`, no text metadata, and only empty rows/sections;
  - adds explicit `tableFailureClass: single_column_variance_template` for narrow object-backed tables with row counts like `1,1,1,2,1,1,1,2`;
  - adds explicit `tableFailureClass: empty_corner_header_cell` to retag a blank top-left `/TD` as `/TH` when the surrounding regular table already proves row and column headers;
  - adds explicit `includeHeaderOnlyTables: true` for `associateAllTableHeaders` so header-only tables can get `/ID` and `/Scope`;
  - extends table mutation invariants with `tableCount` and `emptyTableShellCount` so empty-shell cleanup can be accepted only when that specific native debt decreases.
- `tests/integration/tableNormalization.integration.test.ts`
  - proves each new primitive is opt-in;
  - proves generic table normalization remains unchanged for these subtypes;
  - proves ownership and table/PAC-style invariants improve when the explicit subtype is requested.

No planner route, scorer rule, PAC gate, Docker/API behavior, ODL/PAC/POC runtime call, source gate, filename gate, row gate, hash gate, or semantic behavior was added.

## Local WV Probe

Scratch proof pack: `/mnt/pdf-review/pdfaf-table-empty-single-wv-2026-05-28-r1`

Source page: `https://dcr.wv.gov/resources/Pages/prea.aspx`

The scratch PDFs and generated PDFs/JSON were local only and were removed after metrics extraction.

Representative current low row: `wvdcrprea-07` (`KHRJC_Final_Report.pdf`).

Explicit diagnostic sequence:

1. eight `short_header_row_template` passes;
2. six existing `strongly_irregular_rows` passes;
3. two `single_column_variance_template` passes;
4. two `empty_table_shell` passes;
5. `associateAllTableHeaders` with `includeHeaderOnlyTables`;
6. two `empty_corner_header_cell` passes;
7. final `associateAllTableHeaders` with `includeHeaderOnlyTables`.

Result on `wvdcrprea-07`:

| Metric | Before | After |
| --- | ---: | ---: |
| Overall score | `69/D` | `89/B` |
| `table_markup` | `0` | `100` |
| `pdf_ua_compliance` | `71` | `79` |
| `heading_structure` | `58` | `58` |
| Tables checked | `248` | `247` |
| Header association missing | `246` | `0` |
| Orphan header cells | `512` | `0` |
| Data cells without headers | `1477` | `0` |
| Data cells with headers | `0` | `1562` |
| Irregular tables | `239` | `0` |
| Strongly irregular tables | `129` | `0` |

The proof is useful because it fully clears the table/header family on the representative WV low row. It is not a production behavior proof yet because the final overall score remains `89/B`; the remaining blocker is now non-table debt, especially `heading_structure=58` and PDF-UA/orphan-MCID debt.

## Interpretation

This changes the table-heavy roadmap:

- For WV-style repeated tables, the table/header remediation lane is technically capable of clearing the table family with explicit object-backed subtypes.
- The remaining row-level weakness after table finalization is not table markup; it is mixed heading/PDF-UA/content ownership debt.
- A production transaction still needs control validation and at least two independent outside-source positives before routing.
- The next table behavior stage should either find a second independent repeated-template source or build a bounded planner transaction for this exact native predicate, then validate same-source controls and original-50 controls.

Do not promote this as accepted remediation behavior until a routed transaction passes the active goal gates: at least two independent outside positives, stable controls, `false_positive_applied=0`, no non-table PAC regressions, bounded runtime, and original-50 deterministic validation.

## Verification

- `python3 -m py_compile python/pdf_analysis_helper.py`
- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/integration/tableNormalization.integration.test.ts`
- `npx -y node@22 /usr/bin/pnpm run lint`

No original-50 validation was required because the new behavior is accessible only through explicit diagnostic parameters and no production planner route uses it.
