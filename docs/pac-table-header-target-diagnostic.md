# PAC Table/Header Target Diagnostic

Date: 2026-05-08

## Source Artifacts

- Strict fixed-50 run: `Output/experiment-corpus-baseline/run-pac-strict-grader-fixed50-2026-05-08-r1`
- Strict-cap selection: `Output/experiment-corpus-baseline/pac-strict-cap-target-diagnostic-2026-05-08-r1/`
- Table/header diagnostic: `Output/experiment-corpus-baseline/pac-table-header-target-diagnostic-2026-05-08-r1/`

## Decision

The next behavior stage should target **table header association via `set_table_header_cells`**, not broad `normalize_table_structure`.

The three selected low-score rows all have stable table object identity and direct PAC-style header-association failures:

| File | Score | Grade | Table audit finding |
| --- | ---: | --- | --- |
| `figure-4754` | 78 | C | `42` tables checked, `2` missing associations, `242` orphan headers, `22` TD cells without headers |
| `font-4699` | 88 | B | `2` tables checked, `2` missing associations, `12` orphan headers, `10` TD cells without headers |
| `long-4700` | 78 | C | `10` tables checked, `10` missing associations, `240` orphan headers, `220` TD cells without headers |

These rows have table structs with stable `structRef` values and no direct-cell, misplaced-cell, or irregular-row signal in the target artifacts. Existing table tools ran with no effective header-association change, usually without a specific target ref.

## Controls And Risk

A-grade controls can still carry the same strict PAC table caps:

- `fixture-accessible`
- `figure-4753`
- `long-4608`

That means the next behavior stage must not treat every table/header cap as requiring mutation. It should apply only when the row is below A-grade and a stable table target has direct missing-association evidence.

Sensitive controls with no table/header target remain unchanged in this diagnostic:

- `fixture-inaccessible`
- `structure-3775`
- `font-4035`
- `long-4516`
- `long-4683`

## Recommended Next Stage

Implement a narrow `set_table_header_cells` association probe:

- Select only below-A rows with `pdfua.table.header_association_present` or `pdfua.table.header_cells_associated` strict caps.
- Require direct `tableHeaderAudit` evidence: missing associations or TD cells without derivable headers.
- Require at least one stable table `structRef`.
- Prefer targeted table refs from audit/table evidence instead of running with empty params.
- Accept only if protected reanalysis improves `table_markup` or removes the strict table PAC cap, preserves total score at or above the prior value, and has no page/text/tag or harmful non-table PAC regressions.

Do not broaden `normalize_table_structure` from this evidence. The target rows are not row-regularity or direct-cell failures.

## Boundaries

- No PAC scoring cap changes.
- No PAC gate changes.
- No timeout default changes.
- No planner broadening beyond the future narrow table-header association candidate.
- `structure-4438` remains parked runtime/checkpoint debt.
- `structure-4076` remains parked table/analyzer-applicability debt and should not drive this next behavior.
