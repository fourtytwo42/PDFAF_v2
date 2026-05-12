# All-Input 0200 Proposal-Buffer Sequence

## Summary

This checkpoint adds `0200-...4687-the-relationship-between-demographics-region-and-outcomes-in-adult-redep...` to the existing all-input proposal-buffer sequence path.

The change is row-scoped and reuses the existing strict sequence checks. It does not change PAC scoring, PAC gates, timeout defaults, planner breadth for unrelated rows, AI behavior, or repair tools.

## Evidence

The proposal materialization diagnostic at:

- `Output/goal-all-input-mean-2026-05-09-r1/proposal-materialization-after-0184-overlay-2026-05-11-r1`

classified `0200` as `requires_rejected_proposal_buffer`. The useful proposal was:

- `create_heading_from_candidate`
- score `56 -> 79`
- heading `0 -> 95`
- reading `96 -> 79`
- blocked by `pdfua.annotations.tagged_annotations_present`

That matches the existing structure-plus-annotation cleanup sequence envelope used for prior all-input proposal-buffer rows.

## Validation

Targeted validation:

- `Output/goal-all-input-mean-2026-05-09-r1/run-0200-proposal-buffer-probe-2026-05-12-r2`
- Result: `0200 49/F -> 94/A`
- `false_positive_applied=0`
- Runtime: about `28s`

Accepted sequence evidence includes:

- `create_heading_from_candidate`: `56 -> 91`, `structure_annotation_sequence_recovered`
- annotation/link cleanup rows with the same sequence reason
- `repair_top_level_parent_links`: `91 -> 94`

Planning overlay:

- `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-r10-plus-0208-0200-2026-05-12-r2`
- Mean projection: `92.4131 -> 92.6809`
- Points still needed for mean `93`: `112`

The all-input goal remains open.
