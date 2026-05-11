# All-Input Alt Batch Feasibility Diagnostic

Date: 2026-05-11

This checkpoint is diagnostic-only for the active all-input mean goal. It does not change scoring, PAC gates, timeout defaults, planner routes, mutation behavior, AI defaults, or remediation acceptance.

## Inputs

- Alt object diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/alt-object-diagnostic-r5-complete-2026-05-11-r1/all-input-alt-object-diagnostic.json`
- Second-pass proof: `Output/goal-all-input-mean-2026-05-09-r1/run-alt-0136-secondpass-r5-complete-2026-05-11-r1/baseline_report.json`
- Diagnostic output: `Output/goal-all-input-mean-2026-05-09-r1/alt-batch-feasibility-r5-complete-2026-05-11-r1/`
- Script: `scripts/all-input-alt-batch-feasibility-diagnostic.ts`

## Result

The diagnostic reviewed six r5 alt-object rows and selected one bounded many-figure-alt batch candidate:

| classification | count |
| --- | ---: |
| `many_alt_batch_candidate` | 1 |
| `protected_drift_blocked` | 1 |
| `current_recovery_control` | 1 |
| `not_alt_first` | 3 |
| `insufficient_second_pass_proof` | 0 |

Selected candidate:

- `0136-1557962e554c-4503-2019-illinois-methamphetamine-study.pdf`

Why it is selected:

- r5 current score is `59/F`.
- `alt_text` is `0`.
- all `102/102` checker-visible figures are missing alternate text.
- second-pass probe reaches `80/B` with `alt_text=20`.
- second-pass applied five `set_figure_alt_text` mutations and kept `false_positive_applied = 0`.

Why it is not behavior-ready yet:

- the second-pass route is slow: about `225704ms`;
- it only reaches the low alt threshold, not enough for the goal by itself;
- current one-by-one `set_figure_alt_text` reanalysis is too expensive for a 102-figure document;
- a behavior stage needs a bounded batch mutation plus protected reanalysis proof, not a broad second-pass route.

## Non-Candidates

- `long-4683` is `protected_drift_blocked`: its run score reaches `92/A`, but protected reanalysis drops to `59/F`. Do not batch alt on that row until protected/analyzer drift is explained.
- `0149` is a current-code recovery/control at `94/A`.
- `0200`, `0296`, and `0325` are not alt-first in the current diagnostic. Their direct alt score is already high or their remaining blocker is another family.

## Next Decision

The next behavior stage, if pursued, should be a narrow `0136` many-figure-alt batch probe:

- extend only existing `set_figure_alt_text` semantics, not a new repair family;
- target a bounded list of stable checker-visible figure refs in one mutation/reanalysis cycle;
- preserve page/text/tag/PAC safety and `false_positive_applied = 0`;
- require protected reanalysis improvement in `alt_text` and total score;
- keep generated/weak alternate text visible as manual-review evidence rather than hiding it;
- validate targeted controls before any all-input shard refresh.

Do not promote one-by-one second-pass alt routing from the current evidence.
