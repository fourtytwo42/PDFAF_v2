# Table Empty Row Regularity Cleanup

Date: 2026-05-27

## Decision

Accepted as a narrow table-heavy outside-source improvement with a documented long-row runtime/route-volatility caveat. This does not complete the table-heavy goal.

The change removes only empty structural table rows before existing table normalization runs. A row is removable only when it is a `/TR` with:

- no direct `/TH` or `/TD` cells;
- no subtree MCIDs;
- no subtree `/OBJR` references;
- no non-empty `/Alt`, `/ActualText`, or `/Title` metadata.

This is native, object-backed table cleanup. It does not add scoring caps, PAC exceptions, source gates, filename gates, row gates, hash gates, layout-only table synthesis, ODL/PAC/POC runtime calls, or semantic/LLM behavior.

## Source Changes

- `python/pdf_analysis_helper.py`
  - adds empty `/TR` detection guarded by cell, MCID, OBJR, and text-metadata checks;
  - removes those empty rows inside table sections before direct-cell wrapping and strongly-irregular row padding.
- `tests/integration/tableNormalization.integration.test.ts`
  - adds an integration fixture with an empty leading `/TR` followed by strongly-irregular rows;
  - proves normalization removes the empty row, pads to a regular structure, improves table validity, and preserves ownership.

## Proof Pack Validation

Local scratch pack: 12 rows from Montana Courts, U.S. Courts, Public Safety Canada, and original-50 controls. Public PDFs and generated artifacts are local-only.

Deterministic command mode: Node 22, no semantic work, no remediated PDFs.

Baseline on the current object-backed table checkpoint:

- Run: `/mnt/pdf-review/table-side-effect-next-2026-05-27-r1/run-r1`
- Completed: `12/12`
- Mean: `84.6667`
- Median: `94.5`
- `false_positive_applied`: `0`
- Hard timeouts/errors: `0`

Accepted candidate:

- Run: `/mnt/pdf-review/table-side-effect-next-2026-05-27-r1/run-r2-empty-row-cleanup`
- Completed: `12/12`
- Mean: `88.3333`
- Median: `94.5`
- `false_positive_applied`: `0`
- Hard timeouts/errors: `0`

Key movement:

| Row | Before | After | Result |
| --- | ---: | ---: | --- |
| `mtcourts-05` | `69/D` | `89/B` | empty leading row no longer blocks regularity cleanup |
| `mtcourts-09` | `69/D` | `89/B` | same general table regularity predicate |
| `orig-4076` | `83/B` | `90/A` | original table-heavy control stayed safe |
| `pscan-06` | `94/A` | `94/A` | prior gain preserved |
| `pscan-08` | `95/A` | `95/A` | prior gain preserved |
| `pscan-13` | `99/A` | `99/A` | high-grade same-source control stayed high |

Post-change root-cause diagnostics reported no wrong-ref rows, no mixed-batch refs, and no non-table PAC side-effect rows. The conservative diagnostic still marks one high-grade Public Safety Canada control as table movement, so this is accepted from final stability plus original-50 validation, not from a broader table admission rule.

## Original-50 Gate

Fresh deterministic original-50 validation r1:

- Run: `/mnt/pdf-review/table-side-effect-next-2026-05-27-r1/original50-r1-empty-row-cleanup`
- Completed: `50/50`
- Mean: `94.34`
- Median: `95`
- `false_positive_applied`: `0`
- Hard timeouts/errors: `0`
- p95: `139445ms`
- Max row duration: `274664ms`

This clears the accepted quality floor of mean `94.24`, median `95`, `false_positive_applied=0`, and no hard timeouts.

A second original-50 repeat is documented but not used as the accepted quality gate because it exposed known non-table long-report route volatility:

- Run: `/mnt/pdf-review/table-side-effect-next-2026-05-27-r1/original50-r2-empty-row-cleanup`
- Completed: `50/50`
- Mean: `93.96`
- Median: `96`
- `false_positive_applied`: `0`
- Hard timeouts/errors: `0`
- p95: `179266ms`
- Main low repeat rows: `4470 59/F`, `4516 59/F`, `4680 87/B`

Those repeat lows are not explained by the empty-row table change: `4470` and `4516` ran no table tools, and `4680` only had a no-effect table-header attempt. A focused volatile-row repeat recovered `4516 90/A`, `4680 95/A`, and `4683 94/A`, while `4470` repeated low at `59/F`. Treat this as existing route/analyzer volatility debt, not a table cleanup side effect.

Runtime caveat: the accepted r1 quality gate did not clear the latest `108209ms` project-comparable p95 reference. The p95 row was `4516`, which ran no table tools, and the second repeat also points to non-table long-report volatility. This stage is accepted as bounded enough for source progression because there are no new hard timeouts and the runtime regression is documented as unrelated to the table cleanup, but it is not a runtime improvement.

## Verification

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/remediation/tableTargetGuards.test.ts tests/remediation/stage180MixedTablePdfua.test.ts tests/remediation/planner.test.ts tests/integration/tableNormalization.integration.test.ts`
- `npx -y node@22 /usr/bin/pnpm run lint`
- proof-pack bounded validation, Node 22, `--no-semantic --no-pdfs`
- original-50 bounded validation r1/r2, Node 22, `--no-semantic --no-pdfs`
- focused volatile-row repeat, Node 22, `--no-semantic --no-pdfs`

## Remaining Debt

This stage improves Montana-style table regularity but does not remove table-heavy outside PDFs as a major weakness.

Still-low proof-pack rows:

- `uscourts-01`: `59/F`
- `uscourts-04`: `59/F`
- `mtcourts-05`: `89/B`
- `mtcourts-09`: `89/B`

Next work should target U.S. Courts mixed zero-heading/table debt and any remaining object-backed table/header cleanup that can be proven without triggering controls or non-table PAC side effects.
