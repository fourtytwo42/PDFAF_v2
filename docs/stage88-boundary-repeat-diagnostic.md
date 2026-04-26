# Stage 88 Boundary Repeat Diagnostic

Stage 88 is diagnostic-only. It does not change analyzer routing, aggregation,
scorer semantics, or gate behavior.

## Decision

Keep the parked boundary candidate excluded from aggregation and acceptance
reuse. Do not add a boundary-aware implementation yet.

## Evidence

- Focused repeat output is local at
  `Output/experiment-corpus-baseline/stage88-boundary-repeat-diagnostic-2026-04-26-r1`.
- The repeat run used the existing checker-evidence classifier script with
  six deterministic repeats over:
  - `structure-4076`
  - `long-4470`
  - `4699`
  - `4722`
- `4699` stayed boundary-stable: `paragraph:ref:422_0` was
  `boundary_candidate` across all six repeats.
- `structure-4076` stayed boundary-intermittent: `paragraph:ref:81928_0`
  appeared as a boundary candidate in the focused run, but not on every
  repeat.
- Boundary counts remained isolated from wrapper/path artifacts:
  - `wrapper/path=0` in every sampled row
  - checker-facing controls stayed checker-facing

## Implication

The evidence still supports the Stage 85-87 policy shape: treat explicit
checker-facing records separately from wrapper/path artifacts, but keep
boundary groups parked until a later policy can distinguish the stable
contentless-reachable case from the intermittent unreachable-but-content-bearing
case without broadening aggregation or adding route guards.

## Next Work

If boundary handling resumes, it should be a narrow subtype-aware policy with
repeat-preserving evidence, not a broader acceptance shortcut.
