# Stage 123 Long-4516 Protected State Capture

Stage 123 adds benchmark-only protected checkpoint capture and a repeat diagnostic for protected-baseline rows. It does not change normal remediation routing, font behavior, scorer semantics, Stage 41 gate logic, or auto-evolve behavior.

## What Changed

- Added an opt-in `onProtectedDebugState` remediation callback.
- Added `--write-protected-debug-states` to `scripts/experiment-corpus-benchmark.ts`.
- When the flag is supplied with `--protected-baseline-run`, benchmark output can include `protected-states/<row-id>/` checkpoint PDFs plus JSON metadata.
- Added `scripts/stage123-protected-state-diagnostic.ts` to reanalyze captured checkpoint bytes and compare raw Python helper repeats.

The JSON metadata records checkpoint reason, score, grade, category scores, applied-tool count, SHA-256, and floor status. It does not include PDF payloads or Base64.

## Evidence

Primary target run:

- `Output/experiment-corpus-baseline/run-stage123-target-protected-2026-04-26-r1`
- Diagnostic: `Output/experiment-corpus-baseline/stage123-protected-state-diagnostic-2026-04-26-r1`

For `long-4516`, all four captured checkpoint buffers were identical and classified as `external_floor_safe_checkpoint`, but only two of five external repeats reached the protected floor on each checkpoint. The repeated external scores were:

- `001-tagged-cleanup-post-pass`: `69, 69, 89, 89, 69`
- `002-document-finalization`: `89, 89, 69, 69, 69`
- `003-checkpoint-decision-final`: `69, 89, 69, 69, 89`
- `004-checkpoint-decision-best`: `89, 69, 69, 69, 89`

A second target repeat showed the other side of the same problem:

- `Output/experiment-corpus-baseline/run-stage123-target-protected-2026-04-26-r2`
- Diagnostic: `Output/experiment-corpus-baseline/stage123-protected-state-diagnostic-2026-04-26-r2`

That repeat captured only a below-floor `long-4516` checkpoint. External scores were `46, 46, 78, 46, 46`, with raw Python structural signatures changing across repeats.

Full candidate run:

- `Output/experiment-corpus-baseline/run-stage123-full-2026-04-26-r1`
- Gate: `Output/experiment-corpus-baseline/stage123-benchmark-gate-2026-04-26-r1`

The full gate still failed on `protected_file_regressions = 3`. Runtime p95 passed, false-positive applied remained `0`, F count stayed below baseline, and Stage 75 font gains remained present on `font-4156`, `font-4172`, and `font-4699`.

## Decision

Stage 123 is diagnostic-only. The evidence proves same-buffer protected analyzer volatility on `long-4516`, but it does not prove a general safe checkpoint restore rule:

- Some repeats expose a floor-safe checkpoint.
- Other repeats create no externally floor-safe checkpoint.
- The full gate still has protected regressions.

The experimental behavior change that accepted any floor-safe protected reanalysis repeat was not kept. The retained value is the capture and diagnostic tooling, which can now prove whether future protected rows have a real externally floor-safe intermediate state before we consider a restore rule.
