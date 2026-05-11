# All-Input Heading Residual Object Diagnostic

Date: 2026-05-11

This diagnostic is a selection step after the fresh r5 all-input validation. It narrows the broad `heading_reading_recovery_target` bucket into concrete evidence classes before any remediation behavior changes.

## Inputs

- Fresh merged row artifact: `Output/goal-all-input-mean-2026-05-09-r1/r5-merged-baseline-report-2026-05-11-r1/baseline_report.json`
- Fresh target selection: `Output/goal-all-input-mean-2026-05-09-r1/target-selection-diagnostic-r5-2026-05-11-r1/target-selection-diagnostic.json`
- POC/PAC rule matrix: `Output/goal-all-input-mean-2026-05-09-r1/poc-strong-lowest-40/poc-strong-rule-matrix.json`
- Local output: `Output/goal-all-input-mean-2026-05-09-r1/heading-residual-object-diagnostic-r5-2026-05-11-r1/`

## Purpose

The r5 target selector still says heading/reading is the largest score-moving family, but the rows have different causes. This diagnostic separates:

- hard timeouts that need runtime/checkpoint evidence first;
- runtime-heavy rows where behavior should not be added from score data alone;
- rows with direct PAC content-tagging evidence;
- rows where the only current POC evidence is font/CMap, which remains diagnostic-only;
- near-pass heading caps;
- route plateaus needing repeat or object evidence.

## Decision Rule

Use the selected class as the next diagnostic branch only. Do not treat it as permission to weaken PAC gates, lower checkpoint floors, broaden planner routes, or accept intermediate states. Any future behavior must still prove final page/text/tag/PAC safety and preserve `false_positive_applied = 0`.

## r5 Result

The r5 run selected `content_tagging_object_candidate` as the next actionable class. The only row in that class is:

- `0346-03919ce2e4ea-4673-understanding-police-officer-stress-a-review-of-the-literature.pdf`

Current state:

- Score: `59/F`
- Deficit to `93`: `34`
- Weak categories: `heading_structure=0`, `reading_order=79`, `pdf_ua_compliance=80`
- POC/PAC evidence: `pdfua.content.image_tagged_or_artifacted`, plus font/CMap diagnostic rows
- Tool shape: structure tools ran but did not produce score-moving accepted heading evidence

Other heading rows are not ready for the same behavior:

- `0114` and `0208` are hard-timeout rows with no eligible checkpoint.
- `4215` is runtime-route-heavy.
- `0316` is a route plateau without direct POC/PAC object evidence.
- `4139` currently has only font/CMap POC evidence, which remains diagnostic-only.
- `4082-two-bad-headings` is near-pass debt and should be lower priority.

Next branch should inspect content-stream/object ownership on `0346` using PAC/POC content-tagging logic before any remediation change.

## 0346 Follow-Up

Focused deterministic rerun:

- Run: `Output/goal-all-input-mean-2026-05-09-r1/run-content-tagging-0346-2026-05-11-r1`
- Result: `42/F -> 94/A`
- `false_positive_applied`: `0`

Route comparison:

- Diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/route-recovery-0346-rerun-vs-r5-2026-05-11-r1/all-input-route-recovery-diagnostic.md`
- Classification: `upstream_route_volatility`
- First divergence: at replay state `312fa263390e741c26f9476b`, the good route rejects `create_heading_from_tagged_visible_anchor` and later applies `create_heading_from_candidate`, while the r5 route treats the same first tool as `no_effect` and then follows a lower-scoring orphan-remap path.

This is useful overlay evidence but not a source behavior proof. Do not add a same-state guard or PAC recovery from this comparison; the route diverges before the score-moving tool sequence.

## Table/Header Cross-Check

Because the heading branch did not yield a behavior proof, the r5 table/header candidates were rechecked with the existing object diagnostic:

- Diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/table-header-object-diagnostic-r5-2026-05-11-r1/all-input-table-header-object-diagnostic.md`
- Candidate files: none

Classifications:

- `irregular_or_direct_table_shape`: `4057`, `4722`, `4147`, `4678`
- `needs_stable_table_identity`: `4567`, `4519`

This keeps table-header association batching parked for these r5 rows. The evidence points to irregular table-structure or table-identity work first, not a `/TH` association metadata broadening.
