# Table/ParentTree Stress Diagnostic

Date: 2026-05-22

This diagnostic follows the PAC stress sample selector. It is diagnostic-only: it runs native PDFAF table target-resolution analysis against selected outside rows and controls, reads the parked table behavior-proof JSON, and does not call ODL/PAC/POC/Java, route remediation, mutate PDFs, or write remediated PDFs.

## Artifacts

- Source script: `scripts/table-target-resolution-diagnostic.ts`
- Local report: `/mnt/pdf-review/pdfaf-table-diagnostics/table-parenttree-stress-2026-05-22-r2/table-target-resolution-diagnostic.md`
- Local JSON: `/mnt/pdf-review/pdfaf-table-diagnostics/table-parenttree-stress-2026-05-22-r2/table-target-resolution-diagnostic.json`
- Prior behavior proof input: `/mnt/pdf-review/pdfaf-validation/table-header-transaction-2026-05-21-r1/run-r1/remediate.results.json`

The earlier `r1` stress run is superseded by `r2` because one Teams control path was wrong.

## Result

Decision: `plan_table_target_behavior_proof`.

The run inspected 11 rows:

| classification | count |
| --- | ---: |
| `control_or_high_grade_noise` | 5 |
| `non_table_target_attempt` | 3 |
| `stable_header_assoc_target` | 1 |
| `stable_normalize_target` | 2 |

Stable focus candidates:

- `va-11`: stable header-association target, table score `79`, selected association ref `63_0`, PAC failures `pdfua.table.header_association_present` and `pdfua.table.header_cells_associated`.
- `va-15`: stable normalization target, table score `0`, 22 stable table refs, 12 normalize targets, 5 association targets, selected association refs `1458_0`, `1684_0`, `1722_0`, and `1662_0`.
- `va-17`: stable normalization target, table score `0`, 27 stable table refs, 11 normalize targets, 11 association targets, selected association ref `2866_0`.

Known blockers / negative examples:

- `va-08`: prior `normalize_table_structure` target resolved as `/TD`.
- `va-09`: prior `normalize_table_structure` target resolved as `/Figure`.
- `va-10`: prior `normalize_table_structure` target resolved as `/Figure`.

Controls:

- `fixture-accessible`, `fixture-adam2`, `fixture-teams-original`, `fixture-teams-remediated`, and `fixture-teams-targeted-wave1` did not match the promotion predicate.
- `fixture-accessible` still has table-like residual evidence, but it is an A-grade control and remains excluded from behavior promotion.

## Decision Rationale

The table/ParentTree lane is not ready for production behavior yet, but it now has enough object-backed evidence for a narrow behavior-proof stage:

- At least two outside focus rows have stable `/Table` targets before mutation.
- Controls do not match the target predicate.
- The previous failure mode is explicit and can be guarded: dense row-band positives such as `va-08`, `va-09`, and `va-10` can select refs that resolve as non-table roles.

This means layout/dense table evidence should remain supporting evidence only. Behavior admission must be based on stable object-backed table refs plus PAC/table-header debt.

## Behavior-Proof Requirements

A future behavior proof may use only existing table tools:

- `normalize_table_structure`
- `set_table_header_cells`
- existing bounded table/header sequence logic

It must not add scorer caps, PAC relaxations, checker masking, ODL runtime calls, source/filename/row gates, or broad dense-table planner routing.

The proof must require all of:

- selected target refs resolve as `/Table` immediately before mutation;
- pre-mutation table audit debt exists on the selected target;
- PAC table/header debt exists before mutation;
- rows with prior non-table target attempts are rejected or parked;
- high-grade controls are rejected even when layout table evidence exists;
- final table/PAC debt is reduced on at least two positives;
- `false_positive_applied=0`;
- no new hard timeout or material p95 runtime regression.

## Next Step

Plan a narrow table target behavior proof around `va-11`, `va-15`, and `va-17`, with `va-08`, `va-09`, `va-10`, `fixture-accessible`, `ADAM2`, and the Teams variants as blockers/controls.

If the behavior proof cannot produce at least two accepted object-backed table/PAC debt reductions, park table behavior again and move to the next PAC/POC parity lane rather than broadening dense-table admission.
