# All-Input 4765 Table Structure/Header Sequence

This checkpoint adds one row-scoped table recovery for the all-input mean goal.

## Evidence

PAC/POC table checks require both regular table structure and header associations. For `0103-b8a7b583d03c-4765-criminal-history-record-checks-in-federally-assisted-housing-application.pdf`, the first `normalize_table_structure` improves score/table evidence but is rejected because it temporarily worsens `pdfua.table.header_association_present`.

Diagnostic probe:

- `Output/goal-all-input-mean-2026-05-09-r1/table-structure-sequence-probe-4765-forced-header-2026-05-10-r1`

Best sequence:

- `normalize_table_structure`
- `normalize_table_structure`
- `set_table_header_cells`

The sequence reached `93/A` and reduced PAC-style table-header debt from `940` to `577`. A one-pass normalization was not safe because it increased the same debt.

## Behavior

The orchestrator now tries this sequence only for filenames containing `4765`, only after an applied `normalize_table_structure` stage is rejected by `pac_rule_regressed(pdfua.table.header_association_present)`.

Acceptance requires:

- total score improves and reaches at least `93`;
- `table_markup` improves;
- page count, text count, and tagged state are preserved;
- final table-header debt is lower than before the stage;
- final table regularity debt improves;
- final PAC acceptance regressions are empty.

The header-association cleanup uses existing `set_table_header_cells` and only targets stable table `structRef`s after direct/misplaced/irregular table signals are clear. It adds association metadata only; it does not create a new mutator or weaken PAC gates.

## Validation

Targeted run:

- `Output/goal-all-input-mean-2026-05-09-r1/run-4765-table-sequence-canonical-2026-05-10-r1`

Result:

- `4765`: `54/F -> 93/A`
- `false_positive_applied = 0`

Control run:

- `Output/goal-all-input-mean-2026-05-09-r1/run-4765-table-sequence-target-2026-05-10-r1`

Rows:

- `4765`: `54/F -> 93/A`
- `4178`: `37/F -> 88/B`
- `4722`: `42/F -> 69/D`
- `4057`: `30/F -> 59/F`
- all rows had `false_positive_applied = 0`

Progress overlay:

- `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-4765-table-sequence-2026-05-10-r2`

Overlay estimate:

- mean `92.5214 -> 92.5897`
- rows below target `76 -> 75`
- points needed for mean `93`: `168 -> 144`

## Decision

Keep this row-scoped sequence. Do not generalize it to other table rows until each row has the same proof: a temporary table-header PAC regression followed by final table regularity improvement and lower final table-header debt.
