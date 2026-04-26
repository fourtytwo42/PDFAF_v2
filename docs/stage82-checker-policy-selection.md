# Stage 82 Checker-Policy Selection

Stage 82 is diagnostic-only. It adds no remediation, analyzer, scorer, or gate behavior change.

## Decision

Do not implement a Stage 82 fixer or deterministic analyzer aggregation policy yet. Keep Stage 78 as the current best checkpoint with p95 preserved, false-positive applied at `0`, and residual protected analyzer debt documented.

## Evidence

- Stage 82 diagnostic output is local at `Output/experiment-corpus-baseline/stage82-checker-policy-selection-2026-04-26-r1`.
- Stage 78 still fails only `protected_file_regressions`; p95 and false-positive applied remain preserved.
- Stage 81 shows intermittent table evidence on `structure-4076`, `long-4683`, and `long-4470`. That makes evidence aggregation unsafe until the analyzer can distinguish real checker-visible table/paragraph structure from wrapper/path artifacts.
- Stage 81 stable controls `font-4156`, `font-4172`, and `short-4214` should remain unchanged by any future analyzer policy.
- V1 edge A/B remains blocked without parked/manual rows. The only stable candidate, `v1-4145`, was already tested in Stage 73 and rejected because it stayed at `78/C`.

## Next Work

Stage 83 should be a checker-aligned table/paragraph evidence policy design. It should explain which analyzer table/paragraph observations are real checker-facing structure, and which are wrapper/path artifacts, before any Python traversal, aggregation, or scoring-adjacent behavior is changed.
