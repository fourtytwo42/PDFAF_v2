# All-Input Target Selection Diagnostic

This diagnostic selects the next remediation direction for the all-input mean `>=93` goal. It combines:

- broad deterministic all-input scores from `Output/goal-all-input-mean-2026-05-09-r1/all-input-mean-diagnostic.json`;
- POC/PAC strong-area evidence from `Output/goal-all-input-mean-2026-05-09-r1/poc-strong-lowest-40/poc-strong-rule-matrix.json`.

Source helper: `scripts/all-input-target-selection-diagnostic.ts`.

## Result

The selected next direction is `heading_reading_recovery_target`.

Latest overlay checkpoint after the `0319` title/reading sequence and existing-code heading rerun:

- Overlay: `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-next-heading-existing-2026-05-10-r1`
- Target selection: `Output/goal-all-input-mean-2026-05-09-r1/target-selection-after-next-heading-existing-2026-05-10-r1`
- Estimated mean: `88.5214 -> 89.8575`
- Rows below target: `136 -> 125`
- Points still needed for mean `93`: `1103`

No behavior change was needed for the latest existing-code heading pass. Run
`Output/goal-all-input-mean-2026-05-09-r1/run-next-heading-existing-2026-05-10-r1`
confirmed current code already lifts `0072` to `94/A`, `0097` to `95/A`,
`0149` to `91/A`, and `0235` to `94/A` with `false_positive_applied = 0`.
Rows `0068`, `0069`, and `0284` improved but stayed below target, while `0073`
was skipped in the overlay because this repeat was worse than the current best.

The top remaining heading/reading rows are not all equal: `0034`, `0085`,
`0114`, and parked `structure-4438` are runtime/route-heavy; `0297` has
PAC-blocked heading proposal evidence but a quick rejected-proposal behavior
probe did not reach a reliable production extension point and was not kept.
The next behavior stage should therefore be a route/proposal-buffer diagnostic,
not a broad PAC gate change.

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

## Focused Table/Header Object Diagnostic R1

Generated artifacts:

- Target symlink dir: `Output/goal-all-input-mean-2026-05-09-r1/focused-table-header-targets/`
- Remediation run: `Output/goal-all-input-mean-2026-05-09-r1/run-focused-table-header-targets-2026-05-09-r1/`
- POC/PAC strong-area pass: `Output/goal-all-input-mean-2026-05-09-r1/poc-strong-focused-table-header-r1/`
- Object diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/table-header-object-diagnostic-r1/`
- Source helper: `scripts/all-input-table-header-object-diagnostic.ts`

Result:

- The focused table/header subset completed `9/9` rows, moving mean `42.89 -> 63.44`.
- All `9` rows remained below target: one reached `69/D` class on several rows, while the rest stayed `59/F`.
- The remediated-PDF POC/PAC pass still found `45` failures: `15` verified table-header failures, `16` verified font/CMap failures, `9` structure syntax/RoleMap failures, `2` ParentTree failures, and `3` TOCI/bookmark issues.
- The object diagnostic found `0` safe association-only candidates for current table-header batching.
- Classification distribution: `8 irregular_or_direct_table_shape`, `1 not_table_first`.

Key table evidence:

| Row | Score | Table markup | Classification | Direct table reason |
| --- | ---: | ---: | --- | --- |
| `v1-4637` | `59/F` | `44` | `irregular_or_direct_table_shape` | `2` irregular and strongly-irregular tables; no stable association refs. |
| `font-4057` | `59/F` | `0` | `irregular_or_direct_table_shape` | `23` checked tables, `1079` TD-without-header debt, `6` strongly-irregular tables. |
| `4722` | `69/D` | `0` | `irregular_or_direct_table_shape` | `12` checked tables, `934` TD-without-header debt, `9` strongly-irregular tables. |
| `4765` | `69/D` | `0` | `irregular_or_direct_table_shape` | `734` TD-without-header debt, `6` strongly-irregular tables. |
| `4147` | `69/D` | `0` | `irregular_or_direct_table_shape` | `98` checked tables, `7358` TD-without-header debt, `62` strongly-irregular tables. |
| `4427` | `59/F` | `100` | `not_table_first` | Remediated artifact has no direct table-header debt; remaining issues are structure/font/TOCI. |

Decision:

- Do not widen `set_table_header_cells` batching from this evidence. PAC/POC is still reporting table-header failures, but the blocker is table shape regularity first, not missing `/Headers` metadata on otherwise regular tables.
- The next table lane should be diagnostic-first around strongly-irregular table normalization on rows like `4722`, `4765`, `4147`, and `font-4057`, using existing `normalize_table_structure` only if object identity and protected reanalysis prove safe improvement.
- Keep font/CMap failures diagnostic-only for now; they are frequent but remain excluded from behavior selection because prior corpus validation found font/CMap numeric policy noisy.
- Do not run a broad all-input benchmark from this table result. Validate any table-shape behavior on the focused table subset and controls first.

Follow-up trace sample:

- Trace output: `Output/goal-all-input-mean-2026-05-09-r1/table-tool-trace-r1/`
- `4722`: `normalize_table_structure` projects table markup `0 -> 16`, but is rejected because `pdfua.table.header_association_present` worsens (`934 -> 966` or `945` depending route). This is not safe for a PAC gate exception unless a combined table-normalization-plus-header-association sequence reduces the final table PAC debt.
- `font-4057`: `normalize_table_structure` / `repair_native_table_headers` can project large heading/table movement (`heading_structure 0 -> 96`, one proposal `table_markup 0 -> 44`, score up to `61`), but the intermediate state triggers `pdfua.annotations.tagged_annotations_present` with `28` unowned visible annotations. Existing `set_table_header_cells` can create local header improvements but leaves overall table markup `0`.

Revised next checkpoint:

- Do not add a single-step PAC allow-list for these table tools.
- If continuing the table lane, build a proposal-buffer sequencing diagnostic that can start from a rejected table/structure proposal and immediately run bounded annotation plus table-header cleanup, then accept only the final PAC-safe state.
- Candidate rows for that diagnostic are `font-4057` and `4722`; controls should include prior table successes (`font-4699`, `long-4700`) plus fixed-50 controls (`font-4035`, `fixture-accessible`, `figure-4753`).

## API Semantic Smoke And Post-Alt Guard

Generated artifacts:

- API semantic sample: `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-heading-sample-r1/`
- Source validation run: `Output/goal-all-input-mean-2026-05-09-r1/run-one-4519-regression-guard-2026-05-09-r1/`

Findings:

- The running Docker API has an embedded LLM configured and reachable via `/v1/health`, while port `1234` is not exposed on the host. Treat API semantic samples as production-path evidence, not clean in-repo `:memory:` benchmark evidence.
- API samples showed useful learned deterministic routes on hard heading rows: `v1-4655 46/F -> 97/A`, `4614 59/F -> 96/A`, and `4646 50/F -> 89/B` in the repeat sample.
- API sample `4519` exposed an honesty bug: after all major tools were rejected, final post-semantic `repair_alt_text_structure` dropped `51 -> 45`, with `alt_text 89 -> 20` and `table_markup 100/not-applicable -> 0/applicable`.

Source change:

- `shouldKeepPostRemediationAltRepair(...)` now rejects post-remediation alt cleanup when total score drops or core non-alt categories regress.
- The API route and `scripts/baseline-corpus-batch.ts` now use that guard for direct post-alt cleanup paths. The main orchestrator was already using guarded post-pass acceptance.
- Focused source validation on `4519` completed `35/F -> 60/D` without accepting a lower final cleanup state.
- Focused 12-row heading/reading validation after the guard completed at mean `42.58 -> 59.25`; every row improved, `4574` reached `93/A`, and `4519` completed `35/F -> 59/F` instead of accepting the API-observed `45/F` cleanup regression. This guard is an honesty fix, not a mean-recovery stage by itself.
