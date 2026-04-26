# Stage 111 Runtime Tail Diagnostic

Date: 2026-04-26

Stage 111 stayed diagnostic-first. It did not change remediation routing,
scoring, or gate behavior.

## Decision

Keep runtime-tail debt parked for now. The fresh no-semantic sample did not
expose a repeat-preserving, score-safe runtime shortcut that is safe to
generalize.

## Evidence

Fresh sample:

- `Output/experiment-corpus-baseline/stage111-runtime-tail-sample-2026-04-26-r1/run-2026-04-26T05-26-34-674Z`

Repeat isolation against the earlier Stage 99 sample:

- `Output/experiment-corpus-baseline/stage111-runtime-repeat-isolation-2026-04-26-r1/stage46-runtime-regression-isolation.md`

The fresh sample covered the known tail rows plus a protected control:

- `fixture-teams-targeted-wave1`: `80/B -> 96/A`, `3.68s`
- `long-4516`: `46/F -> 89/B`, `72.25s`
- `long-4683`: `80/B -> 80/B`, `12.51s`

The Stage 46 comparisons show the problem is still not a safe global runtime
guard:

- `fixture-teams-targeted-wave1` remained a planner-loop control path, not a
  safe runtime shortcut target.
- `long-4516` stayed expensive and score-sensitive. The repeat comparison only
  moved `90/A -> 89/B` while wall time stayed essentially flat
  (`71.39s -> 72.25s`).
- `long-4683` got faster (`26.48s -> 12.51s`) but regressed materially
  (`94/A -> 80/B`).

The fresh sample also showed that the same file can land on very different
upstream states between runs, which means the runtime tail is entangled with
analysis/planner variability rather than a repeat-preserving no-gain pattern.

## Implication

There is still no evidence-backed runtime-tail guard that preserves score
floor, protected rows, and false-positive applied `0`. The safest next step is
to park this family and return to a different residual branch unless a future
stage can isolate a repeat-stable, quality-preserving tail mechanism.
