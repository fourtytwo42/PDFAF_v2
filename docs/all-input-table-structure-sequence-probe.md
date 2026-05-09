# All-Input Table/Structure Sequence Probe

Date: 2026-05-09

This checkpoint is diagnostic-only for the active all-input mean goal. It does not change scoring,
PAC gates, timeout policy, planner breadth, or remediation behavior.

## Inputs

- Focused source PDFs: `Output/goal-all-input-mean-2026-05-09-r1/focused-table-header-targets`
- Prior focused remediated PDFs: `Output/goal-all-input-mean-2026-05-09-r1/run-focused-table-header-targets-2026-05-09-r1`
- Diagnostic output: `Output/goal-all-input-mean-2026-05-09-r1/table-structure-sequence-probe-r1`
- Script: `scripts/all-input-table-structure-sequence-probe.ts`

The probe replays existing tools outside the acceptance path and re-analyzes after each step. It
tests whether a final combined state can safely recover structure/table evidence after a rejected
intermediate proposal.

## Result

Rows probed: `0032`, `0057`, and `4722`.

Summary:

- `0` safe sequence candidates.
- `18` sequences ended with harmful PAC regression.
- `18` sequences had no useful score/category movement.
- `false_positive_applied` is not changed because this is not an engine run.

Best observed outcomes:

- `0032`: `create_heading_from_candidate` plus annotation cleanup from the remediated PDF reached
  `93/A`, but it is unsafe. Orphan MCID debt rose from `5` to `64` and
  `pdfua.structure.parent_links_valid` appeared. This is a useful signal, not an acceptable repair.
- `0057`: the same class of sequence improved heading evidence but stayed `69/D` and introduced
  `pdfua.parent_tree.annotation_object_refs_consistent`.
- `4722`: table/structure sequences did not move score; the best path stayed `69/D` while table
  header debt remained high.

## Decision

Do not promote a table/structure sequence from this probe. The current evidence says the most
interesting movement is a structural recovery that needs object-level ParentTree/orphan-MCID cleanup
before it can be honest. A PAC gate relaxation would hide real checker-facing debt and should not be
used.

Next diagnostic direction:

- For `0032`, inspect the exact MCID/ParentTree objects created by the `create_heading_from_candidate`
  path and determine whether existing orphan remap or ParentTree ownership tools can reduce the
  new `64` orphan MCIDs without losing the `93/A` structure gain.
- Keep `0057` and `4722` parked for this lane until a safer object-level table/ParentTree target is
  proven.
