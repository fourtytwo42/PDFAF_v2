# All-Input Table/Structure Tool Diagnostic

Generated on 2026-05-09 for the active all-input mean goal.

## Inputs

- Focused table target input: `Output/goal-all-input-mean-2026-05-09-r1/focused-table-header-targets`
- Tool-enriched deterministic run: `Output/goal-all-input-mean-2026-05-09-r1/run-focused-table-header-targets-tools-2026-05-09-r1`
- Earlier object diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/table-header-object-diagnostic-r1`

## Result

The table/header lane remains behavior-blocked, but the new tool-enriched report gives a clearer reason. The nine focused rows finished with `falsePositiveApplied = 0`, but all remained below target:

- five rows ended at `59/F`;
- four rows ended at `69/D`;
- runtime ranged from about `37s` to `304s`;
- applied-tool counts ranged from `30` to `61`.

Rejected proposal patterns:

- `create_heading_from_candidate`, `normalize_heading_hierarchy`, `repair_structure_conformance`, `repair_native_table_headers`, and `synthesize_basic_structure_from_layout` frequently produce score-moving structural states but are rejected by `pdfua.annotations.tagged_annotations_present`.
- `normalize_table_structure` repeatedly improves local table shape on rows such as `4722`, `4765`, `4147`, and `4678`, but is rejected when `pdfua.table.header_association_present` count increases or when orphan-MCID debt worsens.
- `set_table_header_cells` is not enough on this lane; the earlier object diagnostic found `0` association-only candidates and `8` irregular/direct table-shape blockers.

Representative examples from the tool-enriched run:

- `0032` has rejected structural proposals from replay state `2ef9f98916c8334cc0406adf` that project score `50 -> 79`, heading `0 -> 95`, table `44 -> 100`, and alt `0 -> 100`, but expose `107` unowned annotations.
- `0057` repeats the same mixed shape and remains `59/F`; a previous fixed-50 diagnostic classified it as mixed table/alt/annotation debt.
- `4722` has repeated `normalize_table_structure` rejections due to table-header association count increases from an already-failing state.

## Decision

Do not widen `set_table_header_cells`, weaken PAC gates, or allow a single-step table/structure proposal from this evidence.

The next behavior candidate, if pursued, should be a proposal-buffer sequence that accepts only a final combined state:

1. a score-moving structure/table proposal,
2. bounded annotation cleanup,
3. bounded header-association cleanup when the table proposal worsens header association counts,
4. final reanalysis that improves total score and table/heading evidence while clearing annotation PAC debt and avoiding harmful non-table PAC regressions.

Rows with the strongest evidence for this next diagnostic are `0032`, `0057`, and `4722`. Keep the scope targeted; do not run all `Input/` until one of these sequences validates cleanly.

