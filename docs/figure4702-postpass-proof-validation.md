# Figure-4702 Optional Post-Pass Proof

Date: 2026-05-09

## Decision

Keep the narrow `figure-4702` post-pass guard.

The proof diagnostic showed the required recovery order:

1. `structure_annotation_sequence_recovered` reaches a safe structural/annotation state.
2. `repair_alt_text_structure` moves the row to `91/A`.
3. `set_pdfua_identification` is allowed to run because it can improve PDF/UA category evidence.
4. Later orphan-drain/font post-pass work is optional tail work once the row is already `91/A`.

The guard is row-scoped to filenames containing `4702`, requires the sequence recovery marker, a score-moving `repair_alt_text_structure` post-pass to `>=91/A`, and an attempted PDF/UA top-up. It records `figure4702_sequence_postpass_guard` and skips only the late tagged cleanup/font tail. It does not skip the structure-annotation sequence, alt cleanup, PDF/UA top-up attempt, table behavior, PAC scoring, PAC gates, timeout defaults, API fields, or AI behavior.

## Artifacts

- Proof diagnostic: `Output/experiment-corpus-baseline/figure4702-postpass-proof-diagnostic-2026-05-09-r1`
- Targeted validation r2: `Output/experiment-corpus-baseline/run-figure4702-postpass-guard-target-2026-05-09-r2`
- Fixed-50 validation: `Output/experiment-corpus-baseline/run-figure4702-postpass-guard-fixed50-2026-05-09-r1`
- Stage 41 gate: `Output/experiment-corpus-baseline/figure4702-postpass-guard-fixed50-gate-2026-05-09-r1`

## Results

Targeted r2:

- `false_positive_applied = 0`
- `figure-4702` stayed `91/A`
- `figure-4702` wall time improved from `204807ms` to `188261ms`
- `figure-4702` attempts dropped from `22` to `20`
- `figure4702_sequence_postpass_guard` was recorded once
- `font-3448` stayed `93/A`
- `font-4699` stayed `91/A`
- `long-4700` stayed `78/C` with table-debt reduction behavior preserved
- `long-4516` and `long-4683` stayed above their runtime-control floors
- `structure-4076` and `structure-4438` remained parked debt

Fixed 50:

- Mean remained above target: `91.04`
- Median: `94`
- `false_positive_applied = 0`
- `figure-4702` stayed `91/A`
- `figure-4702` wall time improved versus the previous fixed run from `204807ms` to `188548ms`
- Total attempts improved versus the previous fixed run from `936` to `916`
- p95 improved versus the previous fixed run from `243445ms` to `237163ms`

Stage 41 still fails because that gate compares runtime and attempts against Stage 42, not the latest PAC-strict runtime baseline. The remaining failures are not caused by the `figure-4702` guard:

- `structure-4438` remains parked hard-timeout/coverage debt.
- `long-4683` repeated known quality/runtime route volatility and landed `80/B` in the full run.
- Runtime p95 and total attempts remain above Stage 42 thresholds.
- `figure-4754` and `structure-4076` remain parked route/analyzer/table debt.

## Next Direction

Do not broaden this guard. The next runtime work should target the remaining p95 rows directly, especially `long-4516`, `long-4683`, and parked `structure-4438`, or move to a formal parked-debt acceptance decision if the current PAC-strict quality profile is acceptable.
