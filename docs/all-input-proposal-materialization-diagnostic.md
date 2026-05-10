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

## Decision

Do not add `0306` to the existing `0297` applied-stage proposal-buffer recovery path. That hook only works when the rejected stage has an actual intermediate buffer available to the orchestrator.

A future behavior stage for `0306` needs explicit rejected-proposal materialization:

1. Re-run exactly one score-moving structural proposal from the current analyzed state.
2. Reanalyze the proposal buffer.
3. Run bounded annotation/link/orphan cleanup from that proposal buffer.
4. Accept only a final PAC-safe state with page/text/tag evidence preserved and `false_positive_applied = 0`.

Until that exists, keep `0306` parked as a proposal-materialization candidate rather than weakening `pdfua.annotations.tagged_annotations_present` or orphan-MCID gates.
