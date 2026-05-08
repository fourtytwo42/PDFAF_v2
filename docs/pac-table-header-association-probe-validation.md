# PAC Table Header Association Probe Validation

Date: 2026-05-08

## Source Artifacts

- Target/control validation r1: `Output/experiment-corpus-baseline/run-table-header-association-target-2026-05-08-r1`
- Narrowed target/control validation r2: `Output/experiment-corpus-baseline/run-table-header-association-target-2026-05-08-r2`
- Prior diagnostic: `Output/experiment-corpus-baseline/pac-table-header-target-diagnostic-2026-05-08-r1/`

## Decision

Keep only the **small bounded table-header association probe**.

The broader first attempt proved unsafe or incomplete:

- `font-4699` improved to A-grade and cleared the strict table PAC caps.
- `figure-4754` was too large/noisy for this probe and route-dropped in r1.
- `long-4700` has too many affected tables for the current two-target cap and retained table PAC caps.

The kept behavior therefore only targets below-A rows with:

- strict PAC table/header caps;
- direct `tableHeaderAudit` association debt;
- stable table `structRef`;
- small bounded debt: at most `4` checked tables, at most `2` missing associations, and at most `12` TD cells without headers.

## Validation Result

Narrowed r2 target/control run:

| File | Result | Table outcome |
| --- | --- | --- |
| `font-4699` | `91/A` | table caps cleared; two `set_table_header_cells` association mutations applied |
| `figure-4754` | `78/C` | unchanged; still capped, intentionally not targeted by the narrowed policy |
| `long-4700` | `78/C` | unchanged; still capped, intentionally not targeted by the narrowed policy |
| `fixture-accessible` | `96/A` | stable control |
| `figure-4753` | `97/A` | stable control |
| `long-4608` | `96/A` | stable control |
| `fixture-inaccessible` | `95/A` | stable control |
| `structure-3775` | `93/A` | stable control |
| `font-4035` | `95/A` | stable control |

The full fixed-50 run was not started from this stage because two selected table targets remain unsolved by design. The next table stage should design a separate batch policy for many-table association debt rather than widening this small-table probe.

## Next Direction

The next remediation target should be **many-table header association batching** for `figure-4754` and `long-4700`.

That needs a separate diagnostic/behavior stage because those rows require more than one or two table association edits and must avoid route drift, PAC figure-alt regressions, and orphan-MCID side effects.

## Boundaries Preserved

- No PAC scoring cap changes.
- No PAC gate changes.
- No timeout default changes.
- No broad `normalize_table_structure` changes.
- No API or AI behavior changes.
- Generated PDFs and `Output/` artifacts remain untracked.
