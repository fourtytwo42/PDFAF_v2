# Stage 81 Quality-Preserving Analyzer Determinism

Stage 81 is diagnostic-only. It does not keep an analyzer behavior change.

## Decision

Do not implement deterministic per-`structRef` aggregation yet. Keep Stage 78 as the current best checkpoint with documented analyzer debt.

## Evidence

- Stage 81 evidence-diff output is local at `Output/experiment-corpus-baseline/stage81-evidence-diff-diagnostic-2026-04-26-r1`.
- The projection can preserve maximum observed collection counts, but protected rows contain intermittent table evidence:
  - `structure-4076`
  - `long-4683`
  - `long-4470`
- Intermittent table evidence changes scoring shape. This matches the rejected Stage 80 stable-identity experiment, which stabilized raw output but lost the Stage 78 `long-4683` floor-safe/B result and dropped `font-4172` from A to B.

## Next Work

A safe analyzer fix needs a checker-aligned policy for distinguishing real table/paragraph evidence from harmful wrapper/path artifacts before any deterministic aggregation is applied. Do not add remediation route guards, scorer changes, or benchmark-only inflation to force acceptance.
