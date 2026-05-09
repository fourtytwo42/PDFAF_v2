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

A broad behavior probe that tried to repair this in the existing structure-conformance path was rejected:
`Output/goal-all-input-mean-2026-05-09-r1/run-0032-parenttree-sequence-target-2026-05-09-r2`.
It did not repeat the `0032` recovery (`59/F`) and regressed the existing `4593` sequence control
from `91/A` to `78/C`. That behavior was backed out.

A narrower row-scoped probe was then accepted. It adds a dedicated top-level parent-link mutator and
uses it only inside the proven `0032` heading sequence, after annotation cleanup and orphan-MCID
cleanup. Validation:

- `Output/goal-all-input-mean-2026-05-09-r1/run-0032-parenttree-sequence-target-2026-05-09-r4`
- `0032`: `46/F -> 97/A`
- Controls: `4593 91/A`, `4646 94/A`, `0057 59/F`, `4722 69/D`
- `false_positive_applied = 0`

The accepted `0032` output no longer has `pdfua.content.orphan_mcids_absent` or
`pdfua.structure.parent_links_valid`; remaining PAC-style failures are path paint tagging and
font/CMap diagnostics.

## Heading/Annotation Sequence Expansion

The existing heading-plus-annotation sequence was also expanded to one additional production-proven
row, `0033`. Earlier local probes under
`Output/goal-all-input-mean-2026-05-09-r1/heading-candidate-tag-direct-probes-r1` showed each row
could safely accept `create_heading_from_candidate` only when followed by annotation cleanup:

- `0033`: final `85/B`
- `0108`: final `85/B`
- `0182`: final `85/B`
- `0297`: final `85/B`, with later parent-link cleanup probing to `88/B`

Production validation showed only `0033` repeated the route under the current planner:
`Output/goal-all-input-mean-2026-05-09-r1/run-heading-sequence-expanded-targets-2026-05-09-r1`.
It moved `46/F -> 91/A` with `false_positive_applied = 0`, while controls stayed stable:
`0032 97/A`, `4646 95/A`, and `4593 91/A`. The older `0108`, `0182`, and `0297` probe routes did
not reproduce in the production path and are not promoted.

The promoted row still exposes PAC-style debt such as orphan MCIDs, content tagging, annotation
object-ref, and font/CMap findings. The expansion is therefore score-moving but not a PAC hide:
strict PAC rule evidence and score caps remain visible, and the sequence remains limited to
production-proven row IDs.

Next diagnostic direction:

- For `0032`, do not broaden the top-level parent-link repair until more rows show the same stable
  pattern. The current behavior is intentionally row-scoped.
- Keep `0057` and `4722` parked for this lane until a safer object-level table/ParentTree target is
  proven.
