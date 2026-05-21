# Table Header Transaction Behavior Proof - 2026-05-21

## Decision

Decision: `park_table_header_transaction_behavior`.

The prior diagnostic supported a narrow table transaction behavior stage, but the first target/control proof did not show enough useful table-tool behavior to accept planner changes.

No scoring, planner, mutator, PAC gate, Docker/API, or benchmark behavior was kept from this proof.

## Local Validation

Local run:

- `/mnt/pdf-review/pdfaf-validation/table-header-transaction-2026-05-21-r1/run-r1`

Rows:

- Positives: `va-08`, `va-09`, `va-10`, `va-11`
- Controls: `fixture-adam2`, `fixture-teams-original`, `fixture-teams-remediated`, `fixture-teams-targeted-wave1`, `fixture-accessible`

Summary:

- Completed: `9/9`
- Mean: `52.67 -> 87.78`
- Median: `53 -> 94`
- Final grades: `6 A / 0 B / 2 C / 0 D / 1 F`
- `false_positive_applied`: `0`

## What Worked

`va-11` proved that existing `set_table_header_cells` can reduce real PAC/table-header association debt on a dense outside-corpus report:

- `table_markup: 79 -> 100`
- `headerAssociationMissingCount: 1 -> 0`
- `orphanHeaderCellCount: 7 -> 0`
- `dataCellsWithoutHeaderCount: 5 -> 0`
- tool outcome: `set_table_header_cells: applied`

The accessible control remained stable:

- `fixture-accessible: 96/A -> 96/A`
- no false-positive applied

## What Failed The Gate

The shape-first positives did not prove useful table normalization behavior:

- `va-08`: `normalize_table_structure` returned `no_effect`
- `va-09`: `normalize_table_structure` returned `no_effect`
- `va-10`: `normalize_table_structure` returned `no_effect`

Those rows improved overall through other deterministic structural lanes, but the table transaction candidate did not produce the accepted repair. The attempted table targets resolved as non-table roles in mutation details on the failed/no-effect rows, so the shape-first predicate is not object-backed enough for production planner promotion.

This fails the behavior acceptance bar:

- fewer than two positives had accepted table-tool behavior attributable to the new lane;
- shape-first normalization did not reduce table/PAC debt directly;
- accepting the broader predicate would mostly add no-effect planner work.

## Parked Lane

Park broad `table_header_transaction` behavior for now.

Do not promote dense row-band table evidence directly into planner routing until a follow-up proves stable table-object target resolution. A future attempt must require stronger native object evidence, such as verified `/Table` target role, stable root reachability, and pre-mutation table audit debt on the exact target.

The one supported sub-lane is narrower:

- dense outside-corpus reports with explicit header-association audit debt can benefit from existing `set_table_header_cells`;
- current evidence is only one row, so it is not enough to accept a new general planner admission.

## Next Lane

Move to the next PAC/POC parity gap from `docs/pac-poc-parity-gap-map-2026-05-21.md`:

- `font_cmap_scoring_hardening`

That lane should start diagnostic-only and separate true text extraction/Unicode mapping debt from harmless CMap/font syntax noise before any score-active cap is added.
