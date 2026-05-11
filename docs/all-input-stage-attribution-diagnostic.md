# All-Input Stage Attribution Diagnostic

Date: 2026-05-11

This diagnostic supports the active all-input mean goal after complete r5 validation. It does not change scoring, PAC gates, timeout policy, planner routing, or remediation behavior.

## Inputs

- Complete r5 merged report: `Output/goal-all-input-mean-2026-05-09-r1/r5-complete-baseline-report-2026-05-11-r1/baseline_report.json`
- Script: `scripts/all-input-stage-attribution-diagnostic.ts`
- Local output: `Output/goal-all-input-mean-2026-05-09-r1/stage-attribution-diagnostic-r5-complete-2026-05-11-r1`

## Result

The diagnostic scans tool timeline rows for attribution patterns that can make route-recovery reports look more behavior-ready than they are.

Complete r5 results:

- Files with tool rows: `348`
- Tool rows scanned: `6514`
- `no_effect` rows with score movement: `697`
- `rejected` rows with score movement: `1`
- `applied` rows with no score movement: `1028`
- Low final-score files with `no_effect` score movement: `38`

The important low-row examples include:

- `0346`: low route has `no_effect` structural rows carrying `51 -> 59` stage movement, while the true low-route score mover is `remap_orphan_mcids_as_artifacts`.
- `0108`: several `no_effect` rows carry stage-level movement; prior explicit sequence probing still did not prove a safe behavior.
- `4139`, `4215`, `0200`, `4722`, `4678`, and related rows show similar attribution noise.

## Decision

Use this diagnostic to filter route-recovery evidence. A `no_effect_score_movement` row is not independent proof that the named tool safely repairs the file. It usually means a stage-level reanalysis movement was copied onto several tool rows in the timeline.

Future route behavior still requires:

- a concrete replay state,
- a specific tool or bounded tool sequence,
- final PAC-safe reanalysis,
- preserved page/text/tag evidence,
- `false_positive_applied = 0`,
- targeted repeat validation.

Do not use this report to weaken PAC gates, lower strictness, broaden planner routing, or count volatile one-off high routes as goal progress.
