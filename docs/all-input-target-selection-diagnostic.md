# All-Input Target Selection Diagnostic

This diagnostic selects the next remediation direction for the all-input mean `>=93` goal. It combines:

- broad deterministic all-input scores from `Output/goal-all-input-mean-2026-05-09-r1/all-input-mean-diagnostic.json`;
- POC/PAC strong-area evidence from `Output/goal-all-input-mean-2026-05-09-r1/poc-strong-lowest-40/poc-strong-rule-matrix.json`.

Source helper: `scripts/all-input-target-selection-diagnostic.ts`.

## Result

The selected next direction is `heading_reading_recovery_target`.

| Classification | Count | Deficit to 93 | Decision |
| --- | ---: | ---: | --- |
| `heading_reading_recovery_target` | 18 | 650 | First target-selection lane. Largest recoverable score deficit; several rows also have PAC/POC content, structure, ParentTree, or table evidence that can guide object-level diagnostics. |
| `table_header_recovery_target` | 9 | 266 | Second lane. Strong PAC/POC table-header evidence, but should follow or run as a separate focused table/header object diagnostic. |
| `alt_recovery_target` | 8 | 280 | Candidate lane after checking stable figure object identity and PAC alt leaves. |
| `needs_more_pac_object_evidence` | 3 | 86 | Needs remediated trace/object evidence before behavior. |
| `parked_runtime_debt` | 2 | 81 | Not a first fixer lane; includes `structure-4438` and another extreme slow row. |

## Primary Heading/Reading Targets

The highest-priority target subset for the next diagnostic is:

- `0034-0fca5a3c849e-v1-4716.pdf`
- `0275-0af92eca8742-4002-driving-under-the-influence-dui-laws-andenforcement-in-illinois-and-the-.pdf`
- `0033-919b3d6f80f2-v1-4655.pdf`
- `0086-216764ae85f4-4567-safe-passage-report.pdf`
- `0096-27b779ba44ec-4646-youth-development-an-overview-of-related-factors-and-interventions.pdf`
- `0108-d08027579d0b-4614-an-evaluation-of-transitional-housing-programs-in-illinois-for-victims-o.pdf`
- `0181-7f17a4724723-4519-national-survey-of-residential-programs-for-victims-of-sex-trafficking.pdf`
- `0182-72c4a1d0c53f-4583-an-overview-of-medication-assisted-treatment-for-opioid-use-disorders-fo.pdf`
- `0183-06af35d281c0-4593-focused-deterrence-a-policing-strategy-to-combat-gun-violence.pdf`
- `0190-621b9b1cc3b8-3468-chicago-homicide-codebook-coding-instructions-coders-guide-to-the-chicag.pdf`

These should be handled by a diagnostic-first run that writes remediated PDFs and traces for the focused subset only. Do not run all `Input/` again before a narrower behavior hypothesis exists.

## PAC/POC Implications

The lowest-40 POC/PAC strong-area matrix shows that many heading/reading rows also have:

- direct content tagging failures (`pdfua.content.text_tagged_or_artifacted`, `pdfua.content.image_tagged_or_artifacted`);
- structure syntax failures (`pdfua.structure.child_roles_valid`);
- ParentTree/link object failures on some rows;
- table header failures on mixed rows.

The next diagnostic should therefore inspect both score movement and checker-visible object evidence: accepted/rejected heading tools, content marking state, ParentTree ownership, and whether PAC-style content/tag leaves are blocking useful structure recovery.

## Boundaries

- No PAC scoring changes.
- No PAC gate weakening.
- No font/CMap score caps restored.
- No broad planner expansion.
- No timeout increase.
- No all-input benchmark until a targeted behavior change passes focused validation.
- Generated PDFs and diagnostic matrices remain under `Output/` and are not committed.

## Focused Heading/Reading Run R1

Generated artifacts:

- Target symlink dir: `Output/goal-all-input-mean-2026-05-09-r1/focused-heading-reading-targets/`
- Remediation run: `Output/goal-all-input-mean-2026-05-09-r1/run-focused-heading-reading-targets-2026-05-09-r1/`
- POC/PAC strong-area pass over remediated PDFs: `Output/goal-all-input-mean-2026-05-09-r1/poc-strong-focused-heading-reading-r1/`

Result:

- `12/12` selected rows remained below the run target.
- Mean moved from `44.58` to `57.58`.
- Best row was `4519-national-survey...` at `79/C`; most rows stayed at `59/F` or lower.
- `4614-transitional-housing...` regressed from `59/F` to `53/F` in the focused path and needs route inspection before any recovery behavior.
- Several rows hit 45s remediation reanalysis timeouts, so runtime admission remains part of the eventual acceptance problem.

The remediated-PDF POC/PAC pass still found `44` failures across the 12 rows. Top fail rules:

| Rule | Failed files | Notes |
| --- | ---: | --- |
| `pdfua.font.to_unicode_cmap_valid` | 10 | Still diagnostic-only for scoring because prior validation found font/CMap numeric caps noisy. |
| `pdfua.font.to_unicode_cmap_present` | 9 | Same as above. |
| `pdfua.structure.child_roles_valid` | 8 | Strong signal that heading/reading recovery is entangled with invalid structure child roles. |
| `pdfua.table.header_association_present` | 5 | Table/header follow-up remains a second lane. |
| `pdfua.table.header_cells_associated` | 4 | Same table/header lane. |
| `pdfua.parent_tree.annotation_object_refs_consistent` | 2 | Link/annotation ownership should be checked on affected rows. |
| `pdfua.structure.parent_links_valid` | 1 | Direct structure parent-link issue on the DUI row. |
| `pdfua.parent_tree.page_structparents_present` | 1 | Direct ParentTree/page ownership issue on `4574-juvenile-justice-in-illinois-2015`. |

Decision from R1:

- Do not add a broad heading scheduler from this run.
- The next focused diagnostic should inspect tool timelines and object evidence for the selected rows, especially why heading remains `0` after remediation and why `tag_native_text_blocks`, `synthesize_basic_structure_from_layout`, `create_heading_from_candidate`, or structure conformance tools do not produce safe final states.
- Prioritize rows with repeatable direct PAC structure/content evidence over font/CMap-only rows.

## Focused Tool Trace Sample

Generated artifacts:

- Trace output: `Output/goal-all-input-mean-2026-05-09-r1/focused-heading-reading-traces-r1/`
- Rows traced: `v1-4655`, `4646`, `4614`, and `4519`.

Observed patterns:

- `v1-4655`: structural/heading proposals (`create_heading_from_tagged_visible_anchor`, `repair_structure_conformance`, `synthesize_basic_structure_from_layout`, orphan remap, and annotation cleanup) were rejected from the same score plateau because the intermediate state triggered `pdfua.annotations.tagged_annotations_present`; later link/annotation cleanup attempts regressed score.
- `4646`: structural and heading proposals were again blocked by `pdfua.annotations.tagged_annotations_present`; a later artifact marking path applied but did not move score/category evidence.
- `4614`: most stage work was rejected as `stage_no_gain_orphan_artifact_mutation` or score regression; no clear heading recovery path is proven from this trace.
- `4519`: real partial progress exists (`35/F -> 59/F` in trace, `79/C` in the focused batch path), with figure/table/header tools applying, but later useful repairs were blocked by `pdfua.table.headers_present` or `pdfua.figure.alt_present` PAC regressions. This row is mixed and should not drive a heading-only behavior change.

The most promising next diagnostic is a generalized structure-then-annotation sequencing diagnostic modeled after the successful `figure-4702` probe, but only for rows where the rejected structural proposal improves total score and heading/reading evidence, and final bounded annotation/link cleanup can clear annotation PAC debt. This should be diagnostic-first; do not globally weaken `pdfua.annotations.tagged_annotations_present` or orphan-MCID gates.

## Structure/Annotation Sequence Diagnostic R1

Generated artifacts:

- Diagnostic output: `Output/goal-all-input-mean-2026-05-09-r1/structure-annotation-sequence-diagnostic-r1/`
- Source helper: `scripts/all-input-structure-annotation-sequence-diagnostic.ts`

Result:

- Rows inspected: `4`
- Sequence probe candidates: `1`
- Candidate: `0096-27b779ba44ec-4646-youth-development-an-overview-of-related-factors-and-interventions.pdf`
- Non-candidates:
  - `v1-4655`: score-moving heading proposals exist, but every cleanup attempt in the trace was score-regressive.
  - `4614`: no annotation-blocked score-moving structural proposal.
  - `4519`: mixed table/figure PAC blockers, not a heading-only sequence candidate.

For `4646`, the trace shows `create_heading_from_candidate` can project `54/59 -> 79` with `heading_structure 0 -> 95`, blocked by `pdfua.annotations.tagged_annotations_present`. Existing bounded cleanup tools were scheduled in the row and were not classified as score-regressive in this trace. This is a valid next behavior probe candidate, scoped to this row and this sequence shape only.

Next behavior checkpoint:

- Add no broad PAC gate or scoring change.
- A row-scoped attempt to reuse the existing `figure-4702` sequence machinery for `4646` was tested and rejected/not kept: targeted run `Output/goal-all-input-mean-2026-05-09-r1/run-structure-annotation-sequence-target-2026-05-09-r1/` left `4646` at `59/F`.
- Trace `Output/goal-all-input-mean-2026-05-09-r1/structure-annotation-sequence-target-trace-r1/` showed why: the score-moving `54/59 -> 79` proposal exists in rejected tool replay details, but the existing sequence extension point only receives the stage-level analyzed state, not the rejected proposal buffer. Reusing that path cannot recover this row.
- Accept only the final combined state when final reanalysis is PAC-safe for annotations, page/text/tag evidence is preserved, `false_positive_applied = 0`, and score improves into at least the observed `79/C` range.
- Validate on the focused heading/reading subset plus controls before any broader all-input run.

Revised next checkpoint:

- Do not keep the attempted row-scoped behavior.
- If continuing this lane, build a proposal-buffer sequencing diagnostic/probe that can rerun one structural candidate and then cleanup from that candidate buffer, rather than relying on the stage-level rejected state.
