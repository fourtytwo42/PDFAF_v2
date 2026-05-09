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

## Targeted Repeat

Targeted repeat:

- `Output/experiment-corpus-baseline/run-goal-blocker-repeat-2026-05-09-r1`

Rows:

- Blockers: `long-4516`, `font-4057`
- Controls: `font-3448`, `figure-4702`, `long-4683`, `long-4700`, `font-4699`, `font-4035`

Result:

- `font-4057` repeated at `38/F`, so it is a real current score blocker.
- `long-4516` recovered to `84/B`, so the full-run hard timeout is runtime/route-tail volatility, not a deterministic failure.
- `figure-4702` stayed `91/A`; the post-pass guard remains quality-preserving.
- `font-3448` stayed `93/A`; native tagging recovery remains stable.
- `font-4699` and `font-4035` stayed A-grade.
- `long-4700` stayed `86/B`.
- `long-4683` reached `96/A` in-run but reanalyzed to `60/D`, so it is still protected/reanalysis volatility and should not drive a broad runtime rule.

Next branch:

- Score branch: diagnose `font-4057` as a possible structure-then-annotation sequence candidate. It repeatedly has score-moving heading/table proposals rejected by `pdfua.annotations.tagged_annotations_present`, but unlike `figure-4702` it also has heavy table/alt debt, so a row-specific sequence must prove a final safe state before any behavior.
- Runtime branch: keep `long-4516` as targeted runtime volatility unless a repeat shows a same-state no-gain tail or an eligible checkpoint leak.

## Long-4516 Metadata Confirmation Fixed-50

After the long-4516 runtime route diagnostic and metadata confirmation probe, a deterministic fixed original-50 measurement was run:

- Run: `Output/experiment-corpus-baseline/run-long4516-metadata-confirm-fixed50-2026-05-09-r1`
- Diagnostic output: `Output/experiment-corpus-baseline/current-fixed50-acceptance-diagnostic-long4516-metadata-confirm-2026-05-09-r1`

Result:

- Reanalyzed mean: `90.18`
- Reanalyzed median: `93`
- Remediation success: `49/50`
- p95 wall: `240005.75ms`
- Attempts: `918`
- `false_positive_applied`: `0`
- Hard timeout rows: `structure-4438` only

Important row outcomes:

- `long-4516`: `87/B`, no hard timeout, `verified_checkpoint_timeout_return`
- `long-4683`: `91/A`, no hard timeout, `verified_checkpoint_timeout_return`
- `figure-4702`: `91/A`
- `font-3448`: `93/A`
- `font-4699`: `95/A`
- `long-4700`: `86/B`
- `font-4057`: `38/F`, repeated known mixed table/alt/annotation score debt
- `short-4074`: `95/A` in-run, `59/F` after reanalysis because alt evidence becomes applicable
- `structure-4076`: `42/F`, parked analyzer/table debt
- `structure-3775`: `79/C`, parked route volatility

Decision:

The metadata confirmation probe removed the non-parked `long-4516` hard timeout from this fixed-50 measurement without lowering floors or changing PAC strictness. The run is still not acceptance-ready because `short-4074` is a new non-parked protected/reanalysis drop and `font-4057` remains a non-parked residual score blocker. The next checkpoint should diagnose `short-4074` first because it was `95/A` in-run and failed only after reanalysis; `font-4057` remains the real score-debt branch after that.
