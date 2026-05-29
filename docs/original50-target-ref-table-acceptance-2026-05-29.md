# Original-50 Target-Ref Table Acceptance

Date: 2026-05-29

## Summary

This change fixes a narrow table mutation validator blocker: strict table operations can now be accepted when every requested target ref is a real, root-reachable `/Table` and the requested table refs show object-backed table/header improvement, even when global table traversal is blind.

This does not complete the original-50 gate. It is a foundation for table recovery and stable-key traversal work. The focused original-50 repeat still shows final reanalysis/analyzer volatility on `long-4516`, `long-4680`, `long-4683`, and `figure-4754`.

## Implementation

`python/pdf_analysis_helper.py` now records target-ref table improvement evidence in table mutation invariants:

- `targetRefTableImproved`
- `targetRefTableImprovements`
- `targetRefTableBlockers`

The validator only accepts this path when all requested refs satisfy the strict object-backed predicate before and after mutation:

- resolved object,
- root reachable,
- raw role `/Table`,
- resolved role `/Table`,
- no skip reason.

It also requires at least one target-level improvement and no target-level debt regression. Improvement evidence includes reduced irregular rows, reduced direct cells, reduced header-association debt, reduced orphan headers, reduced data cells without headers, increased scoped/header-associated cells, and boolean table debt transitions such as strongly irregular table becoming false.

Mixed or non-table refs remain blocked; this does not broaden planner admission.

## Local Probe

Local artifact:

`/mnt/pdf-review/pdfaf-validation/original50-stable-table-mutprobe-targetref-accept-2026-05-29-r1/4516-strong-irregular-result.json`

The strict `long-4516` probe targeted stable refs `1614_0`, `2438_0`, and `2448_0`.

Result:

- `normalize_table_structure`: `applied`, note `target_ref_table_invariants_improved`
- `targetRefTableImproved=true`
- `24` target-ref improvements
- `0` target-ref blockers
- changed refs: `1614_0`, `2438_0`, `2448_0`
- `set_table_header_cells`: `no_effect`, note `no_structural_change`
- follow-up skipped refs stayed resolved as `/Table` with `skipReason=no_change`

This fixes the prior rollback/ref-renumbering failure where the second operation saw the same refs as `TD`/`TH`/`P` after the first real target-level improvement was rejected.

## Focused Original-50 Repeat

Local artifact:

`/mnt/pdf-review/original50-targetref-table-accept-focus-2026-05-29-r1/run-2026-05-29T20-21-05-832Z`

Command shape:

`scripts/experiment-corpus-benchmark.ts --mode full --no-semantic` over `structure-4076`, `structure-4438`, `long-4516`, `long-4680`, `long-4683`, and `figure-4754`. Remediated PDFs were not written.

Result:

- selected rows: `6`
- remediation successes: `6`
- remediation errors: `0`
- hard timeouts: `0`
- `false_positive_applied=0`

Scores:

| Row | After | Final reanalysis |
| --- | ---: | ---: |
| `figure-4754` | `59/F` | `59/F` |
| `structure-4076` | `90/A` | `90/A` |
| `structure-4438` | `69/D` | `69/D` |
| `long-4516` | `92/A` | `65/D` |
| `long-4680` | `59/F` | `59/F` |
| `long-4683` | `59/F` | `52/F` |

Interpretation:

- `structure-4438` did not show a new table-control regression; it stayed at the recent focused baseline `69/D`.
- `long-4516` still reaches an A-range remediation after-state, but final reanalysis collapses table/heading/alt evidence and returns `65/D`.
- The remaining original-50 blocker is not this strict table validator path. The next stabilization work should target final reanalysis/analyzer variance for `4516`/`4683` and route volatility for `4680`/`4754`.

## Validation

Passed:

- `python3 -m py_compile python/pdf_analysis_helper.py`
- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/integration/tableNormalization.integration.test.ts`
- `npx -y node@22 /usr/bin/pnpm run lint`

No fresh full original-50 gate was run for this validator step. The original-50 acceptance gate remains open.
