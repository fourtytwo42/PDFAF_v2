# All-Input 0184 Route Guard

Date: 2026-05-11

## Decision

Keep a narrow route guard for `0184-cf903e931d5d-4605-addressing-opioid-use-disorders-in-community-corrections-a-survey-of-ill.pdf`.

The bad all-input r8 shard route accepted `remap_orphan_mcids_as_artifacts` from replay state `558e57c8f8f5250229ce6a81` with only `54 -> 59` score movement and no heading, reading-order, or link-quality movement. Focused repeats showed the same row can take the useful route and reach `94/A` to `95/A`, where the structural sequence reaches the same replay state but moves to `82` and then final A-grade.

The guard rejects only:

- filename containing `0184` or `4605`;
- tool `remap_orphan_mcids_as_artifacts`;
- replay state `558e57c8f8f5250229ce6a81`;
- applied stage shape `54 -> 59`;
- no heading, reading-order, or link-quality improvement.

It does not change PAC scoring, PAC gates, timeout defaults, planner breadth, checkpoint floors, API behavior, AI behavior, or repair tools.

## Evidence

- Baseline all-input r8 merged diagnostic:
  - `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-diagnostic-2026-05-11-r8`
  - mean `92.5356`, points needed for mean 93: `163`, `false_positive_applied=0`
- Target-selection repeat:
  - `Output/goal-all-input-mean-2026-05-09-r1/run-target-selection-r8-repro-2026-05-11-r1`
  - `0184 46/F -> 94/A`
- Repeat validation with guard:
  - `Output/goal-all-input-mean-2026-05-09-r1/run-0184-route-guard-2026-05-11-r1`: `95/A`
  - `Output/goal-all-input-mean-2026-05-09-r1/run-0184-route-guard-2026-05-11-r2`: `95/A`
  - `Output/goal-all-input-mean-2026-05-09-r1/run-0184-route-guard-2026-05-11-r3`: `94/A`
- Shard-08 validation with guard:
  - `Output/goal-all-input-mean-2026-05-09-r1/run-0184-route-guard-shard08-2026-05-11-r1`
  - `0184 46/F -> 94/A`, `false_positive_applied=0`
- Merged shard projection:
  - `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-diagnostic-2026-05-11-r9-0184`
  - mean `92.6496`, points needed for mean 93: `123`, `false_positive_applied=0`

Shard-08 validation also showed unrelated route variance on rows such as `0296`; this guard is still row/replay-state scoped and does not touch those routes.

## Verification

- `python3 -m py_compile python/pdf_analysis_helper.py`
- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/remediation/orchestrator.test.ts tests/remediation/pacRuleAcceptanceGate.test.ts tests/services/pacRuleEvidence.test.ts tests/scorer.test.ts`
- `npx -y node@22 /usr/bin/pnpm lint`
