# PAC Table Header Batch Probe Validation

Date: 2026-05-08

## Source Artifacts

- Batch diagnostic: `Output/experiment-corpus-baseline/pac-table-header-batch-diagnostic-2026-05-08-r1`
- Broad target/control validation: `Output/experiment-corpus-baseline/run-table-header-batch-target-2026-05-08-r1`
- Narrowed target/control validation: `Output/experiment-corpus-baseline/run-table-header-batch-target-2026-05-08-r2`

## Decision

Keep the batch implementation bounded to high-volume many-table association debt, but do **not** run fixed-50 from this stage.

The broad first batch attempt classified both `figure-4754` and `long-4700`, but validation showed `figure-4754` is not safe for this batch policy. It route-dropped to `67/D` and should remain diagnostic-only until a separate route/figure-alt interaction stage proves a safe path.

The narrowed policy only batches rows with at least `4` missing table associations and at least `100` TD cells without headers. Under that policy:

- `long-4700` receives batched association repairs.
- `figure-4754` is not batched.
- `font-4699` keeps the previously proven small-table single-ref association path.

## Validation Result

Narrowed r2 target/control run:

| File | Result | Table outcome |
| --- | --- | --- |
| `long-4700` | `78/C` | batch repairs applied; missing associations reduced `10 -> 2`, TDs without headers reduced `220 -> 17`; strict table cap still remains |
| `font-4699` | `91/A` | small-table association path preserved |
| `figure-4754` | `67/D` | not batched; route volatility remains and must be handled separately |
| `fixture-accessible` | `96/A` | stable |
| `figure-4753` | `97/A` | stable |
| `long-4608` | `96/A` | stable |
| `fixture-inaccessible` | `79/C` | known route volatility resurfaced; no table batch tools ran |
| `structure-3775` | `93/A` | stable |
| `font-4035` | `94/A` | stable |
| `long-4516` | `89/B` | recovered without table batch tools |
| `long-4683` | `92/A` | recovered without table batch tools |

## Boundaries

- No PAC scoring cap changes.
- No PAC gate changes.
- No timeout default changes.
- No broad `normalize_table_structure` changes.
- No API or AI behavior changes.
- Generated PDFs and `Output/` artifacts remain untracked.

## Next Direction

Do not widen table batching further yet.

The next stage should isolate the non-table route volatility that blocks validation:

- `figure-4754`: route/figure-alt interaction before table work.
- `fixture-inaccessible`: known artifact/link route volatility resurfaced.

After those are stable, rerun the table batch target set and only then decide whether `long-4700` batch repair should be promoted into a fixed-50 validation.
