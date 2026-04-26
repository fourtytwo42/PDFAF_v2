# Stage 125 Python Structural Traversal Trace

Stage 125 adds opt-in structural traversal tracing for the Python helper and a TypeScript diagnostic runner. It does not change remediation routing, fonts, scorer semantics, Stage 41 gate logic, or auto-evolve behavior.

## What Changed

- Added `python/pdf_analysis_helper.py --trace-structure <pdf>`.
- Added `scripts/stage125-structural-trace-diagnostic.ts`.
- The trace records root `/StructTreeRoot` and `/K` shape, enqueue/visit counts, duplicate visit decisions, bounded visited samples, exceptions, caps, and final family counts.
- The diagnostic repeats trace mode against Stage 123/124 `protected-states/<row-id>/` checkpoints and classifies each checkpoint.

## Evidence

Primary diagnostic:

- `Output/experiment-corpus-baseline/stage125-structural-trace-diagnostic-2026-04-26-r1`

Before any analyzer experiment, the trace classified the 53 captured checkpoints as:

- `enqueue_drop`: 4
- `visited_key_collapse`: 40
- `cap_or_order_instability`: 3
- `trace_inconclusive`: 6

Key protected-row examples:

- `long-4516` showed queue/visit swings such as `18 -> 6323` queue pops, with core structure evidence changing `4 -> 1675`.
- `long-4683` showed similar swings, including `7 -> 4021` queue pops and core evidence `0 -> 1672`.
- No root-missing pattern or family collector exception pattern was found.

## Rejected Experiment

A narrow keepalive experiment was tested locally: retain objectless pikepdf wrapper objects while using visited IDs, to avoid Python object-ID reuse during traversal.

It improved same-byte raw repeat stability on existing checkpoint PDFs, but it was rejected because the fresh target benchmark stabilized important rows to lower scores:

- `long-4516`: `67/D`, externally stable below protected floor.
- `long-4683`: `62/D`, externally stable below protected floor.
- `font-4172`: dropped to `84/B`, losing the prior A-grade control gain.

The experiment was not kept.

## Decision

Stage 125 remains diagnostic-only. The trace proves that the broad same-byte variance is driven by traversal/enqueue/visited behavior inside the Python helper, but the first plausible fix stabilized some routes to lower-quality outcomes.

Next work should isolate pikepdf wrapper/object access more deeply before changing production analysis behavior. A safe future fix must preserve the high-evidence traversal, not merely make traversal deterministic.
