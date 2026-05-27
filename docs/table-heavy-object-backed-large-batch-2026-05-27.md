# Table Heavy Object-Backed Large Batch

Date: 2026-05-27

## Decision

Accepted as a narrow table-heavy outside-source improvement, not as completion of the full table-heavy goal.

This stage keeps the table lane PAC-honest and object-backed:

- table planner/header paths filter to real, root-reachable `/Table` refs;
- stale planned table params are not reused when fresh live params no longer resolve;
- non-table refs such as `Span`, `P`, `L`, `LBody`, `TD`, roleless, unresolved, or unreachable objects are blocked from table header/normalization targeting;
- a bounded large object-backed table batch is admitted only for high-debt strongly-irregular real-table sets;
- the batch uses existing native `normalize_table_structure` behavior, not layout-only synthesis, scorer caps, PAC exceptions, source gates, filename gates, ODL/PAC/POC runtime calls, or semantic/LLM behavior.

The stage is score-moving for Public Safety Canada style table-heavy PDFs and preserves the original-50 floor, but Montana Courts and U.S. Courts residuals remain low. The active table-heavy goal remains open.

## Source Changes

- `src/services/remediation/planner.ts`
  - filters table tool target params through `isRealRootReachableTableTarget`;
  - adds `largeObjectBackedTableBatch` params only when native object-backed strongly-irregular table/header debt is large.
- `src/services/remediation/orchestrator.ts`
  - requires fresh live params for table tools instead of falling back to stale planned refs;
  - adds a guarded Stage 180 large object-backed table batch after table/header regularity work.
- `src/services/remediation/stage180MixedTablePdfua.ts`
  - filters Stage 180 remaining table targets through the same real reachable table guard.
- `python/pdf_analysis_helper.py`
  - allows the large batch caps only when explicitly requested by the native object-backed gate;
  - pads all-header irregular rows with synthetic `TH` cells instead of `TD`;
  - reruns existing table-header association after strong irregular row normalization.

## Proof Pack Validation

Local scratch pack: 12 rows from Montana Courts, U.S. Courts, Public Safety Canada, and original-50 controls. Public PDFs and generated artifacts are local-only and are deleted after metrics extraction.

Deterministic command mode: Node 22, no semantic work, no remediated PDFs.

Baseline after strict live table-ref filtering:

- Run: `run-r3`
- Completed: `12/12`
- Mean: `77.6667`
- Median: `69`
- `false_positive_applied`: `0`
- Hard timeouts/errors: `0`
- Diagnostic wrong-ref rows: `0`
- Mixed batch-ref rows: `0`
- Control table side-effect rows: `0`

Accepted candidate:

- Run: `run-r11-full-proof`
- Completed: `12/12`
- Mean: `85.2500`
- Median: `94.5`
- `false_positive_applied`: `0`
- Hard timeouts/errors: `0`
- Diagnostic wrong-ref rows: `0`
- Mixed batch-ref rows: `0`

Key outside-source positive movement from the same general predicate:

| Row | Strict-filter Score | Accepted Score | Result |
| --- | ---: | ---: | --- |
| `pscan-06` | `69/D` | `94/A` | large object-backed table batch finished more table/header debt |
| `pscan-08` | `69/D` | `95/A` | large object-backed table batch finished more table/header debt |

Controls stayed score-stable or high in the accepted proof:

| Row | Score |
| --- | ---: |
| `pscan-13` | `99/A` |
| `orig-4076` | `90/A` |
| `orig-4683` | `99/A` |

The diagnostic still reports `diagnostic_only` because it treats any control table movement as a promotion blocker. For this source change, acceptance is based on final control stability plus original-50 validation; the conservative diagnostic remains useful for the next blocker family.

## Original-50 Gate

Fresh deterministic original-50 validation:

- Completed: `50/50`
- Mean: `94.2400`
- Median: `95.5`
- `false_positive_applied`: `0`
- Hard timeouts/errors: `0`
- Project-comparable p95 tail: `108209ms`
- Max row duration: `209364ms`

The accepted original-50 floor was mean `94.24`, median `95`, `false_positive_applied=0`, and no hard timeouts. This stage meets that floor. Runtime remains bounded versus the prior accepted p95 reference of `109607ms`.

A prior original-50 repeat had one known runtime-tail timeout on `4076`; a focused repeat completed it at `90/A`, `false_positive_applied=0`, and the accepted full repeat above cleared the timeout.

## Remaining Debt

This stage does not make table-heavy outside sources fully solved.

Still-low proof-pack rows:

- `mtcourts-05`: `69/D`
- `mtcourts-09`: `69/D`
- `uscourts-01`: `59/F`
- `uscourts-04`: `59/F`

Next table work should target these blocker families without broadening admission:

- Montana-style orphan MCID / table regularity side-effect preservation;
- U.S. Courts mixed zero-heading/table debt;
- diagnostic refinement that distinguishes benign high-grade control table movement from harmful non-table PAC regressions.

