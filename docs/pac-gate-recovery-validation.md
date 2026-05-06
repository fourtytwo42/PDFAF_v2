# PAC Gate Recovery Validation

Generated: 2026-05-06

## Decision

Keep the PAC gate narrowing behavior, but do not treat this as a clean acceptance checkpoint. It materially restores score movement versus the strict PAC gate run while preserving diagnostic PAC evidence, but the new 15s checking cap exposes quality/runtime tradeoffs on large structural PDFs.

## What Changed

- PAC remediation gates no longer reject `not_applicable -> fail`.
- `pass/warn -> fail` and already-applicable `fail -> higher fail count` still reject.
- PAC scoring caps were not restored.
- Analysis/reanalysis now accepts abort signals, so the remediation wall can stop long benchmark rows.

## Validation

- Diagnostic before behavior change: `Output/experiment-corpus-baseline/pac-gate-recovery-diagnostic-2026-05-06-r1`
  - PAC gate rejections: `192`
  - Newly evaluable debt rejections: `79`
  - Blocked useful repairs: `169`
- Candidate run: `Output/experiment-corpus-baseline/run-pac-gate-recovery-2026-05-06-r4`
  - Completed remediation rows: `49/50`
  - Timed-out row: `structure-4438`
  - Mean after remediation: `84.45`
  - Median after remediation: `93`
  - Reanalyzed mean: `84.43`
  - Reanalyzed median: `94`
  - Grades after/reanalyzed: `30 A / 5 B / 3 C / 1 D / 10 F`
  - p95 wall: `164180ms`
  - false-positive applied: `0`
- Candidate gate: `Output/experiment-corpus-baseline/pac-gate-recovery-gate-2026-05-06-r4`
  - Stage 41 gate: `FAIL`
  - Failed gates: `analyze_success`, `remediate_success`, `route_summary_coverage`, `score_mean_floor`, `f_grade_count`, `protected_file_regressions`, `runtime_p95_wall`, `total_tool_attempts`
- Post-change diagnostic: `Output/experiment-corpus-baseline/pac-gate-recovery-diagnostic-2026-05-06-r4`
  - PAC gate rejections: `110`
  - Newly evaluable debt rejections: `0`
  - Blocked useful repairs: `90`

## Interpretation

The gate narrowing recovered a large part of the strict PAC score drop:

- Strict PAC gate run: mean `76.50`, median `74`, grades `22 A / 2 B / 3 C / 9 D / 14 F`.
- Recovery candidate: mean `84.45`, median `93`, grades `30 A / 5 B / 3 C / 1 D / 10 F`.
- Stage187 reference remains stronger: mean `95.98`, median `98`, grades `47 A / 2 B / 0 C / 1 D / 0 F` in-run.

The remaining gap is now a combination of:

- true remaining PAC gate rejections, mostly orphan MCIDs, tagged annotations, and figure alt;
- quality loss from strict 15s check analysis on hard structural rows;
- protected/runtime gate debt on known tail rows.

## Next Recommended Stage

Add a two-tier analysis budget:

- `/v1/analyze` and pure checking stay at 15s.
- remediation internal reanalysis gets a bounded larger per-analysis budget, such as 45s, while the whole PDF remains capped at 5 minutes.

Then rerun the same fixed 50-file validation. This should preserve the user-requested fast checking behavior without starving remediation evidence on complex PDFs.
