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

## Follow-Up Object Evidence

After this probe, a local `0032` artifact replay was generated under
`Output/goal-all-input-mean-2026-05-09-r1/0032-parenttree-sequence-artifacts-r1`.
It showed a possible final sequence:

1. `create_heading_from_candidate`
2. `tag_unowned_annotations`
3. `remap_orphan_mcids_as_artifacts`
4. top-level structure parent repair

The first three existing tools can bring the row to `93/A` and remove orphan-MCID debt, but
`pdfua.structure.parent_links_valid` remains. A new diagnostic-only Python helper mode,
`--dump-structure-syntax`, identifies the remaining object-level issue as a missing `/P` on the
top-level `/Document` structure element.

A behavior probe that tried to repair this in the existing structure-conformance path was rejected:
`Output/goal-all-input-mean-2026-05-09-r1/run-0032-parenttree-sequence-target-2026-05-09-r2`.
It did not repeat the `0032` recovery (`59/F`) and regressed the existing `4593` sequence control
from `91/A` to `78/C`. The behavior was backed out; only the diagnostic object dump remains.

Next diagnostic direction:

- For `0032`, design a row-scoped top-level parent repair probe that does not perturb existing
  `4593`/`4646` sequence routing. Do not route it through broad `repair_structure_conformance`
  without repeat proof.
- Keep `0057` and `4722` parked for this lane until a safer object-level table/ParentTree target is
  proven.
