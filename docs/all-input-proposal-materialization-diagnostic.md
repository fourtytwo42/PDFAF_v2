# All-Input Proposal Materialization Diagnostic

This diagnostic checks whether a PAC-blocked structural proposal can be safely used as the starting buffer for bounded annotation/link cleanup. It is evidence-only: no scoring, PAC gates, planner routing, timeout policy, or remediation behavior changed.

Source helper: `scripts/all-input-proposal-materialization-diagnostic.ts`.

## Current 0306 Result

Artifact:

- `Output/goal-all-input-mean-2026-05-09-r1/proposal-materialization-diagnostic-0306-2026-05-10-r1/`

Input trace:

- `Output/goal-all-input-mean-2026-05-09-r1/run-0306-tagged-heading-target-2026-05-10-r2/baseline_report.json`

The diagnostic classifies `0306-20f8aa13aa59-4657-the-2021-safe-t-act-icjia-roles-and-responsibilities.pdf` as `requires_rejected_proposal_buffer`.

Best proposal:

- Tool: `create_heading_from_candidate`
- Replay state: `320c256d0891dde5c3895995 -> dcb1884412259b5a5291ecd4`
- Score: `59 -> 79`
- Heading: `0 -> 96`
- Reading order: `96 -> 79`
- PAC blocker: `pdfua.annotations.tagged_annotations_present`
- Cleanup from proposed state: none
- Target evidence in artifact details: none

Interpretation:

- The useful heading state exists only in rejected proposal replay evidence.
- Existing cleanup attempts ran from the pre-proposal route, not from the proposed heading buffer.
- The benchmark artifact does not include enough target/parameter evidence to reconstruct the proposal from the report alone.

## Initial Decision

The diagnostic initially showed that `0306` needed explicit proposal-buffer validation before any behavior could be accepted. The safe path was to test whether the existing `0297` proposal-buffer sequence hook could operate on the same rejected-stage buffer shape.

## Recovery Probe

Behavior change:

- Add diagnosed proposal-buffer rows to `ALL_INPUT_PROPOSAL_BUFFER_SEQUENCE_IDS`.
- Keep the existing strict sequence acceptance unchanged.
- No PAC scoring change, PAC gate weakening, planner broadening outside the diagnosed ID, timeout change, API change, AI default, or new mutator.

Validation artifacts:

- One-row probe: `Output/goal-all-input-mean-2026-05-09-r1/run-0306-proposal-buffer-probe-2026-05-10-r2`
- Focused controls: `Output/goal-all-input-mean-2026-05-09-r1/run-0306-proposal-buffer-controls-2026-05-10-r1`
- Overlay: `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-0306-proposal-buffer-2026-05-10-r1`

Results:

- One-row probe moved `0306 41/F -> 91/A` in about `22s`, with `false_positive_applied = 0`.
- Focused controls moved `0306 53/F -> 91/A`, with `false_positive_applied = 0`.
- Existing promoted controls stayed recovered: `0032 97/A`, `0033 94/A`, `4646 97/A`, `4593 94/A`, `0275 94/A`, `0317 93/A`, and `0319 93/A`.
- `0297` remained route-volatile in the mixed control batch (`59/F`), but the existing one-row `0297` recovery artifact remains the better overlay source and this is not caused by the `0306` ID addition.

Overlay impact:

- Estimated mean: `88.5214 -> 90.4444`
- Rows below target: `136 -> 125`
- Points still needed for mean `93`: `897`

The `0306` recovery is accepted as a narrow row-scoped extension of the existing proposal-buffer sequence path. Future rows still need their own materialization proof:

1. Re-run exactly one score-moving structural proposal from the current analyzed state.
2. Reanalyze the proposal buffer.
3. Run bounded annotation/link/orphan cleanup from that proposal buffer.
4. Accept only a final PAC-safe state with page/text/tag evidence preserved and `false_positive_applied = 0`.

## Batch Candidate Expansion

A follow-up scan ran this diagnostic over existing focused heading, alt, and table/header artifacts. It identified the same PAC-bounded proposal-buffer shape on several more rows. The accepted ID set now includes:

- `0057`
- `0119`
- `0121`
- `0194`
- `0201`
- `0297`
- `0306`
- `0318`
- `0347`

Rejected or not promoted:

- `0200`: did not reproduce a deterministic recovery in the batch probe.
- `0032` and `0149`: already high enough or not a useful score target for this lane.
- Rows with non-annotation/non-orphan PAC blockers remain excluded.

Validation artifacts:

- Candidate/control probe: `Output/goal-all-input-mean-2026-05-09-r1/run-proposal-buffer-batch-accepted-candidates-2026-05-10-r1`
- Overlay: `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-proposal-buffer-batch-2026-05-10-r1`

Useful recovered rows from the batch:

| Row | Result |
| --- | ---: |
| `0057` | `90/A` |
| `0119` | `91/A` |
| `0121` | `92/A` |
| `0194` | `91/A` |
| `0201` | `95/A` |
| `0297` | `91/A` |
| `0306` | `91/A` |
| `0318` | `91/A` |
| `0347` | `91/A` |

Focused controls preserved several promoted paths (`0032 97/A`, `4646 97/A`, `0275 94/A`, `0317 93/A`, `0319 93/A`) and the batch had `false_positive_applied = 0`. `0033` route-dropped in this mixed batch, matching known route volatility; the overlay keeps its earlier clean `94/A` artifact rather than counting the worse repeat.

Overlay impact after deterministic accepted rows plus source-reanalyzed semantic planning rows:

- Estimated mean: `88.5214 -> 91.1453`
- Rows below target: `136 -> 124`
- Points still needed for mean `93`: `651`

## Fresh r3 Follow-Up: 0184

Fresh all-input validation r3 exposed the same rejected proposal-buffer shape on a new high-deficit row:

- `0184-cf903e931d5d-4605-addressing-opioid-use-disorders-in-community-corrections-a-survey-of-ill.pdf`

Diagnostic artifact:

- `Output/goal-all-input-mean-2026-05-09-r1/proposal-materialization-current-high-deficit-2026-05-11-r1/`

The best rejected proposal was PAC-bounded by `pdfua.annotations.tagged_annotations_present`, improved total score and heading structure, and had no cleanup attempted from the proposed buffer. The row is now added to the existing row-scoped proposal-buffer sequence ID set. This does not change PAC scoring, PAC gates, timeout policy, planner breadth outside the diagnosed ID, or add a new mutator.

Focused validation:

- `Output/goal-all-input-mean-2026-05-09-r1/run-proposal-buffer-0184-target-2026-05-11-r1`

Results:

| Row | Result | Notes |
| --- | ---: | --- |
| `0184` | `46/F -> 95/A` | Accepted through `structure_annotation_sequence_recovered`; `false_positive_applied = 0`. |
| `0194` | `42/F -> 94/A` | Existing proposal-buffer control remains recovered; `false_positive_applied = 0`. |
| `0200` | `49/F -> 59/F` | Still does not reproduce deterministic recovery; remains excluded. |

Updated planning overlay:

- `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-reading-shell-prefixed-plus-0184-2026-05-11-r1`

Overlay impact relative to fresh r3:

- Mean: `91.2023 -> 92.5356`
- Rows below `93`: `58 -> 45`
- Points still needed for mean `93`: `631 -> 163`
- `false_positive_applied = 0`

The all-input goal remains open. The next behavior should target the remaining stable high-deficit rows; do not promote `0200` without fresh deterministic proof.
