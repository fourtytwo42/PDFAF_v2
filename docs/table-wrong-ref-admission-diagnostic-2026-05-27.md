# Table Wrong-Ref Admission Diagnostic

Date: 2026-05-27

## Summary

This stage tested whether table-header remediation can safely stop targeting non-table structure objects before opening a strict table transaction rescue.

Decision: diagnostic-only. No planner, scorer, mutator, PAC gate, runtime, or remediation behavior change is accepted from this stage.

The durable source change is limited to diagnostic evidence:

- table snapshots may now expose `rawRole` and `resolvedRole`;
- `tableTargetGuards` defines the intended object-backed rule for future behavior proofs;
- focused unit coverage documents that `Span`, `P`, `L`, `LBody`, `TD`, roleless, unresolved, and unreachable refs are not safe table-header targets.

## Evidence Runs

Local scratch root: `/mnt/pdf-review/table-heavy-wrong-ref-guard-2026-05-27-r1/`.

The proof pack reused the 17-row table-heavy set from Montana Courts, U.S. Courts, Public Safety Canada, and original-50 controls. Public PDFs and generated artifacts were kept local only.

### Strict Live-Header Guard

Run: `run-r2`.

- Completed: `17/17`.
- Mean after: `80.2353`.
- `false_positive_applied`: `0`.
- Timeout/error rows: `0`.
- Diagnostic: `diagnostic-r2/table-transaction-root-cause.json`.

Useful result:

- `planner_wrong_ref`: `3 -> 0`.
- `control_table_side_effect`: `3 -> 0`.
- Later strict candidates: `mtcourts-05`, `mtcourts-06`, `mtcourts-09`, `pscan-08`, `uscourts-01`.

Remaining blocker:

- `non_table_pac_side_effect`: `orig-4683` (`figure_alt`), `pscan-13` (`figure_alt`), `uscourts-04` (`orphan_mcid`).

Original-50 gate with original basenames:

- Run: `/mnt/pdf-review/original50-wrong-ref-guard-2026-05-27-r2/run-r1/baseline_report.json`.
- Completed: `50/50`.
- Mean: `93.96`.
- Median: `94.5`.
- Grades: `48 A / 1 D / 1 F`.
- `false_positive_applied`: `0`.
- Timeout/error rows: `0`.
- p95/max: `178170ms / 287390ms`.

This fails the accepted original-50 floor of mean `94.24`, median `95`, `false_positive_applied=0`, no hard timeouts. The main lows were `4438` at `69/D` and `4683` at `59/F`.

### Narrow Planned-Ref Fallback Variant

Run: `run-r3`.

This variant allowed originally planned params only when they still resolved to real root-reachable `/Table` refs. It was rejected before broad validation:

- `orig-4076` timed out at the per-PDF limit.
- `pscan-02` timed out at the per-PDF limit.
- `orig-4438` still finished low at `69/D`.

The run was stopped after those gate failures.

## Conclusion

The wrong-ref blocker is real and now measurable with native role evidence, but the behavior guard is not accepted because it either regresses the original-50 floor or introduces timeouts.

The next table-heavy stage should not add strict transaction rescue yet. It should target the remaining blocker family:

1. attribute non-table PAC side effects before/after table moves;
2. isolate figure/alt and orphan-MCID regressions caused by table repair sequences;
3. only then reattempt object-backed table-header admission.

Any future behavior must preserve the original-50 floor and keep `false_positive_applied=0`.
