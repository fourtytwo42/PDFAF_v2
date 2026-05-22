# All-Unique r2 Table/Alt Target-Resolution Diagnostic

Date: 2026-05-22

## Decision

Decision: `plan_table_shape_behavior_proof_for_0137_0287`.

This diagnostic follows the parked zero-heading route-stability lane and checks the next all-unique r2 table/alt lows for native object-backed table targets. It is diagnostic-only and does not change scoring, planner routing, mutation behavior, PAC gates, timeout policy, Docker, or API behavior.

The diagnostic ran native PDFAF analysis on four focus PDFs and five controls. It did not remediate PDFs, mutate PDFs, write remediated PDFs, call PAC/POC/ODL/Java, call semantic AI, or use filenames/source membership as production behavior.

## Artifacts

Generated artifacts stay local:

- Report: `/mnt/pdf-review/pdfaf-table-diagnostics/allunique-r2-table-alt-target-resolution-2026-05-22-r1/table-target-resolution-diagnostic.md`
- JSON: `/mnt/pdf-review/pdfaf-table-diagnostics/allunique-r2-table-alt-target-resolution-2026-05-22-r1/table-target-resolution-diagnostic.json`
- Prior-run evidence: `/mnt/pdf-review/pdfaf-validation/allunique-current-bounded-full-2026-05-22-r2/merged/baseline_report.json`

The r2 all-unique checkpoint remains source-documented in `docs/all-unique-current-bounded-full-2026-05-22-r2.md`.

## Summary

The diagnostic classified `9` rows:

| Classification | Count |
| --- | ---: |
| `stable_normalize_target` | `2` |
| `non_table_target_attempt` | `1` |
| `layout_only_no_table_target` | `1` |
| `control_or_high_grade_noise` | `5` |

Decision from the local diagnostic:

- Status: `plan_table_target_behavior_proof`
- Stable focus candidates: `0137`, `0287`
- Unsafe control candidates: `none`
- Prior non-table target rows: `0138`

## Focus Rows

| Row | r2 score | Diagnostic classification | Native evidence | Decision |
| --- | ---: | --- | --- | --- |
| `0137` | `69/D` in r2, `52/F` in analyze-only diagnostic | `stable_normalize_target` | `10` stable table refs, `8` normalize targets, table score debt, shape debt, header debt, PAC table failures | Behavior proof candidate. |
| `0287` | `69/D` in r2, `58/F` in analyze-only diagnostic | `stable_normalize_target` | `36` stable table refs, `12` normalize targets, table score debt, shape debt, PAC table failure | Behavior proof candidate. |
| `0138` | `69/D` in r2, `59/F` in analyze-only diagnostic | `non_table_target_attempt` | Stable table evidence exists, but prior `set_table_header_cells` targeted `3023_0` resolved as `/P` | Park until target selection avoids non-table refs. |
| `0223` | `59/F` in r2, `25/F` in analyze-only diagnostic | `layout_only_no_table_target` | Dense/layout table evidence exists, but native analysis found no stable table struct refs or PAC table debt | Park. Dense layout evidence alone is not enough. |

The analyze-only scores are lower than final r2 scores because this script does not run remediation. They are used only to inspect native table evidence.

## Controls

Controls did not match the table-target predicate:

| Control | Classification | Important reason |
| --- | --- | --- |
| `ADAM2` | `control_or_high_grade_noise` | No native table debt, table markup `100`. |
| `pdfaf_fixture_accessible` | `control_or_high_grade_noise` | Has residual table signals but is already `96/A`; do not broaden behavior into A-grade controls. |
| `fixture-teams-original` | `control_or_high_grade_noise` | No native table debt, table markup `100`. |
| `fixture-teams-remediated` | `control_or_high_grade_noise` | No native table debt, table markup `100`. |
| `fixture-teams-targeted-wave1` | `control_or_high_grade_noise` | No native table debt, table markup `100`. |

## Interpretation

This is the first current all-unique r2 table/alt lane that has at least two stable native object-backed focus candidates and no matching controls.

The evidence is still not an accepted behavior change. A behavior proof would need to show that existing table repair tools can improve final PAC/table debt on `0137` and `0287` without destabilizing controls. In particular:

- `0137` previously had table tools rejected/no-effect because header-association PAC evidence regressed; a behavior proof must either use a safer normalize target order or prove normalize/header association as a final-safe transaction.
- `0287` already had some table tools apply in r2, including table-header association improvement, but final table score stayed low; a behavior proof must show additional final table/PAC debt reduction rather than more no-effect attempts.
- `0138` is unsafe for now because a prior header target resolved as `/P`; do not route behavior through non-table refs.
- `0223` is layout-only in this diagnostic; do not promote dense-layout evidence without stable native `/Table` object targets.

## Next Direction

Plan a narrow table-shape behavior proof for `0137` and `0287` only.

The proof should:

- use only native structural evidence and existing table tools;
- require stable `/Table` refs, low table score, shape debt, PAC table debt, and clean controls;
- reject rows with prior non-table target resolution like `0138`;
- reject layout-only rows like `0223`;
- validate targeted positives plus controls with deterministic `--no-semantic --no-pdfs`;
- accept only if at least one, preferably both, of `0137` and `0287` reduce final table/PAC debt with `false_positive_applied=0`, no new hard timeout, and no meaningful p95 regression.

Do not run a fresh full all-unique validation until a targeted table behavior proof either passes or is parked.
