# Current Fixed-50 Acceptance Diagnostic

Current checkpoint: commit `467fbbc` plus the diagnostic added in this stage.

The post-cleanup fixed original-50 run is:

- `Output/experiment-corpus-baseline/run-goal-current-fixed50-2026-05-09-r1`
- Diagnostic output: `Output/experiment-corpus-baseline/current-fixed50-acceptance-diagnostic-2026-05-09-r1`

The run was deterministic (`--no-semantic`) and did not write PDFs. It is not a literal Stage 41 gate run because the Stage 42 protected baseline artifact was removed during the local `Output/` cleanup. The source diagnostic therefore classifies the current run directly and records that Stage 42 must be restored or regenerated before an exact Stage 41 acceptance gate can be rerun.

## Result

- Reanalyzed mean: `91.06`
- Reanalyzed median: `93`
- Remediation success: `47/50`
- p95 wall: `111162.82ms`
- Attempts: `893`
- `false_positive_applied`: `0`

Key preserved rows:

- `font-3448`: `93/A`
- `figure-4702`: `91/A`
- `font-4699`: `95/A`
- `long-4700`: `86/B`
- `long-4683`: `92/A`

## Blockers

The run is blocked by non-parked runtime or score debt:

- `long-4516`: non-parked hard timeout in this run.
- `font-4057`: non-parked residual score blocker at `38/F`.

Parked or known volatile rows are still visible but should not drive broad behavior:

- `structure-4438`: parked hard-timeout/checkpoint debt.
- `structure-4076`: parked analyzer/table-applicability debt, timed out in this run.
- `fixture-inaccessible`, `figure-4754`, `structure-3775`: known route volatility.

## Decision

Do not make a broad runtime, PAC, scoring, or planner change from this run. The next checkpoint should be focused diagnostics for `long-4516` and `font-4057`, using targeted repeats with the current deterministic engine. If the Stage 42 baseline artifact is restored, rerun Stage 41 after targeted validation is clean.
