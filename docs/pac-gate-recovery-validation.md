# PAC Gate Recovery Validation

Generated: 2026-05-06

## Decision

Keep the PAC gate narrowing behavior, but do not treat this as a clean acceptance checkpoint. It materially restores score movement versus the strict PAC gate run while preserving diagnostic PAC evidence, but the new 15s checking cap exposes quality/runtime tradeoffs on large structural PDFs.

## What Changed

- PAC remediation gates no longer reject `not_applicable -> fail`.
- `pass/warn -> fail` and already-applicable `fail -> higher fail count` still reject.
- PAC scoring caps were not restored.
- Analysis/reanalysis now accepts abort signals, so the remediation wall can stop long benchmark rows.

## Validation

- Diagnostic before behavior change: `Output/experiment-corpus-baseline/pac-gate-recovery-diagnostic-2026-05-06-r1`
  - PAC gate rejections: `192`
  - Newly evaluable debt rejections: `79`
  - Blocked useful repairs: `169`
- Candidate run: `Output/experiment-corpus-baseline/run-pac-gate-recovery-2026-05-06-r4`
  - Completed remediation rows: `49/50`
  - Timed-out row: `structure-4438`
  - Mean after remediation: `84.45`
  - Median after remediation: `93`
  - Reanalyzed mean: `84.43`
  - Reanalyzed median: `94`
  - Grades after/reanalyzed: `30 A / 5 B / 3 C / 1 D / 10 F`
  - p95 wall: `164180ms`
  - false-positive applied: `0`
- Candidate gate: `Output/experiment-corpus-baseline/pac-gate-recovery-gate-2026-05-06-r4`
  - Stage 41 gate: `FAIL`
  - Failed gates: `analyze_success`, `remediate_success`, `route_summary_coverage`, `score_mean_floor`, `f_grade_count`, `protected_file_regressions`, `runtime_p95_wall`, `total_tool_attempts`
- Post-change diagnostic: `Output/experiment-corpus-baseline/pac-gate-recovery-diagnostic-2026-05-06-r4`
  - PAC gate rejections: `110`
  - Newly evaluable debt rejections: `0`
  - Blocked useful repairs: `90`

## Interpretation

The gate narrowing recovered a large part of the strict PAC score drop:

- Strict PAC gate run: mean `76.50`, median `74`, grades `22 A / 2 B / 3 C / 9 D / 14 F`.
- Recovery candidate: mean `84.45`, median `93`, grades `30 A / 5 B / 3 C / 1 D / 10 F`.
- Stage187 reference remains stronger: mean `95.98`, median `98`, grades `47 A / 2 B / 0 C / 1 D / 0 F` in-run.

The remaining gap is now a combination of:

- true remaining PAC gate rejections, mostly orphan MCIDs, tagged annotations, and figure alt;
- quality loss from strict 15s check analysis on hard structural rows;
- protected/runtime gate debt on known tail rows.

## Next Recommended Stage

Add a two-tier analysis budget:

- `/v1/analyze` and pure checking stay at 15s.
- remediation internal reanalysis gets a bounded larger per-analysis budget, such as 45s, while the whole PDF remains capped at 5 minutes.

Then rerun the same fixed 50-file validation. This should preserve the user-requested fast checking behavior without starving remediation evidence on complex PDFs.

## Two-Tier Analysis Budget Validation

Implemented after the recovery candidate:

- `CHECK_ANALYSIS_TIMEOUT_MS` remains `15000`.
- `REMEDIATION_ANALYSIS_TIMEOUT_MS` defaults to `45000`.
- `REMEDIATION_PDF_TIMEOUT_MS` remains `300000`.
- `/v1/remediate`, orchestrator reanalysis, guarded post-pass analysis, semantic verification analysis, and the remediation benchmark path use the remediation analysis budget.
- `/v1/analyze` and benchmark analyze-only rows keep the 15s check budget.

Validation artifacts:

- Candidate run: `Output/experiment-corpus-baseline/run-pac-analysis-budget-2026-05-06-r1`
- Stage 41 gate: `Output/experiment-corpus-baseline/pac-analysis-budget-gate-2026-05-06-r1`
- PAC diagnostic: `Output/experiment-corpus-baseline/pac-analysis-budget-diagnostic-2026-05-06-r1`

Results:

- Completed remediation rows: `48/50`
- Timed-out rows: `structure-4438`, `long-4516`
- Mean after remediation: `87.04`
- Median after remediation: `96`
- Reanalyzed mean: `86.69`
- Reanalyzed median: `94`
- Grades after/reanalyzed: `31 A / 6 B / 2 C / 1 D / 8 F`
- p95 wall: `104411ms`
- max wall: `282182ms`
- total attempts: `933`
- false-positive applied: `0`
- PAC gate rejections: `114`
- Newly evaluable debt rejections: `0`
- Blocked useful repairs: `90`

Stage 41 gate decision: `FAIL`.

Failed gates: `analyze_success`, `remediate_success`, `route_summary_coverage`, `f_grade_count`, `protected_file_regressions`, `runtime_p95_wall`, `total_tool_attempts`.

Interpretation:

- The timeout split is mechanically correct: check-only analysis still times out at 15s, remediation analysis uses 45s, and the 5-minute per-PDF wall aborts long remediation rows.
- It improves the quality envelope versus the prior recovery candidate (`84.45` mean / `10 F`) but is not an acceptance checkpoint.
- `structure-4438` and `long-4516` need a runtime-tail/analyzer strategy rather than a broader default timeout increase.
- Remaining protected regressions and blocked useful repairs are still driven by true PAC gate rejections, especially orphan-MCID-related debt, not newly evaluable debt.

Next recommendation:

- Keep the two-tier timeout plumbing.
- Do not raise the default remediation analysis budget above 45s.
- Open a narrow runtime-tail/analyzer stage for `structure-4438` and `long-4516`, plus a separate PAC gate recovery stage for the remaining true-regression blockers.

## Runtime Tail And PAC Gate Isolation

Implemented as diagnostic-only after the two-tier budget validation:

- Runtime diagnostic: `scripts/pac-runtime-tail-diagnostic.ts`
- PAC gate blocker diagnostic: `scripts/pac-gate-blocker-diagnostic.ts`
- Runtime artifacts: `Output/experiment-corpus-baseline/pac-runtime-tail-diagnostic-2026-05-06-r1`
- PAC blocker artifacts: `Output/experiment-corpus-baseline/pac-gate-blocker-diagnostic-2026-05-06-r1`

Runtime findings:

- Runtime tail rows classified: `4`
- Per-PDF timeout rows: `long-4516`, `structure-4438`
- `structure-4076`: `repeated_no_gain_tool_churn`
  - candidate wall `226245ms`
  - `18` applied-tool rows
  - `7` rejected, `7` no-effect
  - same-state no-gain early exits: `2`
- `long-4683`: `reanalysis_heavy_large_document`
  - candidate wall `282182ms`
  - stage reanalysis `102769ms`
  - mutation tool time `133028ms`
- `long-4680` was p95-adjacent but classified `not_runtime_tail` by the current diagnostic thresholds.

PAC gate blocker findings:

- PAC gate rows: `114`
- Focus gate rows: `114`
- Candidate policy-review rows: `2`
- Real harmful regressions: `9`
- Estimated recoverable files under the strict policy-review filter: `1`
- Top focus rule remains `pdfua.content.orphan_mcids_absent`: `80` rows across `22` files.
- The two policy-review candidates are both `repair_alt_text_structure` blocked by orphan-MCID count increases while same-category PDF/UA evidence improved:
  - `structure-3661`: rejected `86 -> 98`, PDF/UA `57 -> 67`, final `86`, estimated recovery `12`
  - `figure-4188`: rejected `46 -> 59`, PDF/UA `57 -> 67`, final `59`, no estimated final recovery under current final-score model

Decision:

- No behavior change is kept from this isolation stage.
- The evidence is not broad enough to safely narrow orphan-MCID PAC gates globally.
- Keep true PAC gate rejection behavior as-is.
- Next runtime work should target `structure-4438` and `long-4516` timeout attribution first, then `structure-4076` no-gain churn.
- Next PAC gate work, if pursued, should be a tightly scoped `repair_alt_text_structure` + orphan-MCID same-category-improvement experiment with `structure-3661` and `figure-4188` as primary targets and harmful-regression rows as controls.

## Runtime Tail Suppression Pilot

Implemented after the runtime/PAC blocker diagnostics:

- Benchmark remediation runs now write diagnostic-only timeout traces under `runtime-timeouts/<row-id>.json` inside the run directory when a row aborts or times out.
- Timeout traces capture the last known remediation phase, stage/round, tool, replay-state signature, rejected/no-effect reason, completed tool count, completed stage count, and completed reanalysis count/time.
- `scripts/pac-runtime-tail-diagnostic.ts` now reads those timeout traces when present and includes them in the runtime-tail matrix.
- Same-state runtime suppression is now limited to expensive no-gain work:
  - only `rejected`/`no_effect` outcomes;
  - only stable replay-state signatures;
  - only configured structural/checker-facing tool families;
  - only when tool duration is at least `PDFAF_EXPENSIVE_NO_GAIN_RUNTIME_SUPPRESSION_MS` (`12000ms` by default).
- Metadata/title/language/catalog-only tools remain outside this suppression policy.
- PAC scoring caps and PAC gate allow-lists were not changed.

Validation status:

- Focused unit coverage passed for the runtime suppression helper and PAC runtime-tail diagnostic helper.
- Targeted 10-row validation ran at `Output/experiment-corpus-baseline/run-runtime-tail-suppression-target-2026-05-06-r1`; diagnostic output is `Output/experiment-corpus-baseline/runtime-tail-suppression-target-diagnostic-2026-05-06-r1`.
- The target run is not a clean checkpoint:
  - `structure-4076` completed and improved to `70/C`, but stayed runtime-heavy (`271347ms`) with no false-positive applied rows.
  - `structure-4438`, `long-4516`, and `long-4683` hit the 5-minute wall timeout.
  - Timeout traces were written for all three timeout rows and identified the last known phases:
    - `structure-4438`: `stage_reanalysis_start` after `normalize_annotation_tab_order`;
    - `long-4516`: `stage_finish` after `mark_untagged_content_as_artifact`;
    - `long-4683`: `final_reanalysis_start` after `mark_untagged_content_as_artifact`.
- Do not run the fixed 50-file benchmark from this pilot result; the next behavior stage should focus on reanalysis-heavy timeout rows, especially final/protected reanalysis after cheap late artifact tagging.

## Reanalysis Tail Soft-Stop

Implemented after the runtime-tail suppression pilot:

- Runtime soft-stop helpers now detect low remaining wall-clock budget and cumulative deterministic reanalysis tails.
- Soft-stop completion is quality-gated: the engine only keeps the current analyzed state when it has already reached the remediation target score.
- Benchmark full-mode final reanalysis can be skipped near the deadline only for target-quality rows; skipped rows reuse the current verified final analysis and record `soft_deadline_before_final_reanalysis`.
- PAC scoring, PAC gate allow-lists, planner routes, default timeout values, and repair behavior were not changed.

Validation artifacts:

- Broad first target run: `Output/experiment-corpus-baseline/run-reanalysis-tail-soft-stop-target-2026-05-06-r1`
- Narrowed target run: `Output/experiment-corpus-baseline/run-reanalysis-tail-soft-stop-target-2026-05-06-r2`
- Narrowed runtime diagnostic: `Output/experiment-corpus-baseline/reanalysis-tail-soft-stop-target-diagnostic-2026-05-06-r2`

Narrowed target result:

- `structure-4076`: completed at `70/C`, not worse than the runtime suppression pilot result.
- `long-4683`: completed at `96/A`.
- `structure-4438`: still hit the 5-minute wall; timeout trace ended at `stage_reanalysis_start` after `normalize_annotation_tab_order`.
- `long-4516`: still hit the 5-minute wall; timeout trace ended at `stage_reanalysis_start` after `mark_untagged_content_as_artifact`.
- Controls mostly recovered after quality-gating the soft-stop, but `figure-4188` remained volatile/low in the narrowed repeat (`59/F`).

Decision:

- Do not run the fixed 50-file benchmark from this result.
- Keep the quality-gated soft-stop machinery as a defensive runtime mechanism, but do not treat it as acceptance progress.
- The next runtime stage should target heavy stage reanalysis after cheap late artifact tagging, especially `long-4516` stage 9 and `structure-4438` stage 4, rather than accepting low partial states.

## Mean Recovery With Targeted Runtime Guards

Implemented after the reanalysis-tail soft-stop:

- Added a targeted late repeated-attempt guard for `mark_untagged_content_as_artifact`.
  - The guard skips only late round/high-reanalysis artifact attempts after the same tool has already produced no score movement in the same run.
  - It does not skip first attempts or prior positive artifact-tagging movement.
- Added a targeted late `normalize_annotation_tab_order` guard for low-score rows near the wall budget or high cumulative reanalysis.
  - The guard avoids starting cheap tab-order work that would likely force another expensive reanalysis and still not produce a target-quality state.
- Added a narrow PAC recovery override for `repair_alt_text_structure` blocked only by `pdfua.content.orphan_mcids_absent` count growth.
  - Recovery applies only when total score or `pdf_ua_compliance` improves.
  - Non-orphan PAC regressions, unrelated tools, and no-gain orphan-MCID increases still reject.
- PAC scoring caps, PAC gate allow-lists, default timeout values, planner routes, and mutator behavior were not broadened.

Validation artifacts:

- Targeted subset run: `Output/experiment-corpus-baseline/run-mean-recovery-target-2026-05-06-r1`
- Runtime diagnostic: `Output/experiment-corpus-baseline/mean-recovery-target-diagnostic-2026-05-06-r1`
- Aborted experimental rerun: `Output/experiment-corpus-baseline/run-mean-recovery-target-2026-05-06-r2`

Targeted `r1` result:

- Selected rows: `10`
- Successful remediation rows: `7/10`
- Timed-out rows: `structure-4438`, `long-4516`, `long-4683`
- Successful-row mean after/reanalyzed: `88.29`
- Successful-row grades after/reanalyzed: `5 A / 1 C / 1 F`
- p95 wall on successful rows: `256955ms`
- Bounded-work signal included `late_artifact_reanalysis_guard: 2`
- `structure-3661` recovered to `98/A` through the narrow `repair_alt_text_structure` orphan-MCID recovery.
- `figure-4188` accepted the same narrow recovery but only moved to `59/F`, so it remains unresolved.
- `structure-4076` stayed at `70/C`, preserving the minimum target control quality from the prior soft-stop run.

Runtime interpretation:

- The late repeated-attempt guard fired, but it did not eliminate the hard timeout tail.
- Timeout traces show the remaining failures are still stage-reanalysis dominated:
  - `long-4516`: timed out after stage 9 `mark_untagged_content_as_artifact`, `completedStageReanalysisMs=117582`.
  - `long-4683`: timed out after stage 6 `mark_untagged_content_as_artifact`, `completedStageReanalysisMs=81681`.
  - `structure-4438`: timed out at `stage_reanalysis_start` after `tag_native_text_blocks`, `completedStageReanalysisMs=135133`.
- Therefore the fixed 50-file benchmark was not run from this candidate.

Rejected experiment:

- A broader follow-up that converted late `mark_untagged_content_as_artifact` `no_structural_change` mutations to `no_effect` before stage reanalysis was tested briefly in targeted run `r2`.
- It was stopped early because the harmful control `fixture-inaccessible` dropped to `79/C`.
- That broader suppression was removed; do not reintroduce it without a row-specific proof that protected controls stay stable.

Decision:

- Keep the narrow PAC recovery helper and the conservative late repeated-attempt guards.
- Do not treat this as a clean checkpoint and do not run the fixed 50 yet.
- Next work should target deadline-aware stage reanalysis admission itself: if a cheap late tool would require another 45s analysis and the current state is below target quality, the orchestrator should either skip the optional stage before mutation or require a target-quality verified state before starting that reanalysis.

## Stage Reanalysis Admission Guard

Implemented after the targeted runtime guards:

- Added a narrow pre-reanalysis admission helper for deterministic stages.
- The helper can roll back a stage and record `stage_reanalysis_admission_guard` when a low-score row would start another expensive reanalysis after only optional late cleanup.
- Scope is intentionally limited to stages whose applied mutations are only `mark_untagged_content_as_artifact` or `tag_native_text_blocks`.
- `mark_untagged_content_as_artifact` is guarded only when the row is near the wall budget; cumulative reanalysis alone is not enough because that broader shape regressed `fixture-inaccessible`.
- `tag_native_text_blocks` can also be guarded after high cumulative deterministic reanalysis.
- PAC scoring, PAC gate allow-lists, planner routes, repair tools, and timeout defaults were not changed.

Validation artifacts:

- Aborted broad first attempt: `Output/experiment-corpus-baseline/run-stage-reanalysis-admission-guard-target-2026-05-06-r1`
- Targeted subset run: `Output/experiment-corpus-baseline/run-stage-reanalysis-admission-guard-target-2026-05-06-r2`
- Runtime diagnostic: `Output/experiment-corpus-baseline/stage-reanalysis-admission-guard-diagnostic-2026-05-06-r2`

Targeted `r2` result:

- Selected rows: `10`
- Successful remediation rows: `7/10`
- Timed-out rows: `structure-4438`, `long-4516`, `long-4683`
- Successful-row mean after: `88.14`
- Successful-row grades after: `5 A / 1 D / 1 F`
- `fixture-inaccessible`, `fixture-teams-original`, `font-4035`, and `structure-3775` stayed A-grade.
- `structure-3661` stayed recovered at `98/A`.
- `figure-4188` remained unresolved at `59/F`.
- `structure-4076` finished below the target control threshold (`69/D` in the run output).

Runtime interpretation:

- The fixed 50-file benchmark was not run.
- The new admission guard did not materially recover the runtime tail in this validation.
- Timeout traces shifted away from the originally targeted exact shapes:
  - `structure-4438`: timed out at `stage_reanalysis_start` after `normalize_pdfua_catalog_settings`.
  - `long-4516`: timed out after `repair_list_li_wrong_parent`.
  - `long-4683`: timed out at `final_reanalysis_start` after artifact cleanup.
- The runtime diagnostic still classified `3` per-PDF timeouts and `1` reanalysis-heavy large-document row.

Decision:

- Keep the helper and diagnostic classification as narrow defensive plumbing, but do not treat this stage as quality/runtime recovery.
- Do not broaden the guard to catalog-only or list-repair tools without a separate control-safe proof.
- The next useful work is a trace-driven admission redesign that considers final reanalysis and broader late-stage optional-tool admission, with explicit controls for `fixture-inaccessible` and `structure-4076`.

## Trace-Driven Final Reanalysis And Optional Tool Admission

Implemented after the stage reanalysis admission guard:

- Added a benchmark final-reanalysis decision helper.
  - Target-quality rows near the remediation wall can skip final reanalysis and record `soft_deadline_before_final_reanalysis`.
  - High-B rows (`>=85`) near the remediation wall can skip final reanalysis and record `bounded_final_reanalysis_guard`.
  - Rows below `85` do not use the final-reanalysis guard; they keep the existing hard-timeout behavior rather than accepting poor partial states.
- Added narrow late optional-tool admission guards for repeated tail-shape attempts.
  - `normalize_pdfua_catalog_settings` can record `late_catalog_reanalysis_guard` only after a prior no-movement attempt for the same tool and near-wall or high cumulative reanalysis pressure.
  - `repair_list_li_wrong_parent` can record `late_list_reanalysis_guard` under the same repeated/no-movement tail conditions.
  - First attempts, prior positive movement, target-quality rows, planner routes, mutators, default timeouts, PAC scoring, and PAC gate allow-lists were not changed.
- Extended the runtime-tail diagnostic to classify `bounded_final_reanalysis_guarded` and `late_optional_reanalysis_guarded` rows separately from hard timeouts and soft-stop rows.

Validation artifacts:

- Targeted subset run: `Output/experiment-corpus-baseline/run-trace-driven-final-reanalysis-target-2026-05-06-r2`
- Runtime diagnostic: `Output/experiment-corpus-baseline/trace-driven-final-reanalysis-diagnostic-2026-05-06-r2`
- Earlier single-row route-volatility smokes: `Output/experiment-corpus-baseline/run-trace-driven-fixture-inaccessible-smoke-2026-05-06-r1` and `r2`

Targeted `r2` result:

- Selected rows: `10`
- Successful remediation rows: `7/10`
- Timed-out rows: `structure-4076`, `structure-4438`, `long-4516`
- Successful-row mean after: `92.00`
- Successful-row grades after: `6 A / 1 F`
- Successful-row p95 wall: `262148ms`
- `false_positive_applied = 0`
- Controls `fixture-inaccessible`, `fixture-teams-original`, `font-4035`, and `structure-3775` finished A-grade in the completed targeted run.
- `structure-3661` stayed recovered at `98/A`.
- `figure-4188` remained unresolved at `59/F`.
- `long-4683` completed at `96/A` and recorded `soft_deadline_before_final_reanalysis`.

Runtime interpretation:

- The fixed 50-file benchmark was not run.
- The final-reanalysis protection was useful for `long-4683`, which avoided a hard timeout while preserving an A-grade state.
- The new late catalog/list guards did not fire in the accepted targeted run; the remaining hard timeouts were still active stage/reanalysis tails:
  - `structure-4076`: timed out after `synthesize_basic_structure_from_layout` with `structure_depth_not_improved`.
  - `structure-4438`: timed out at `stage_reanalysis_start` after `normalize_pdfua_catalog_settings`.
  - `long-4516`: timed out after `mark_untagged_content_as_artifact`.
- `fixture-inaccessible` showed route volatility in two single-row smokes (`79/C`) but recovered to `97/A` in the completed targeted run; no new bounded-work reason fired on that row.

Decision:

- Keep the trace-driven final-reanalysis helper and diagnostic classifications as narrow defensive plumbing.
- Do not treat this stage as mean/runtime recovery and do not run fixed 50 from this result.
- The remaining blockers are not PAC policy. They are active long-row reanalysis/mutation tails on `structure-4076`, `structure-4438`, and `long-4516`.
- The next stage should either isolate those active phases with finer timeout attribution or design a quality-preserving way to checkpoint/return the best verified current state for timed-out rows without masking low-score partial outcomes.

## Verified Checkpoint Timeout Recovery

Implemented after trace-driven final reanalysis:

- Added a remediation-internal verified checkpoint return path.
  - The orchestrator records eligible verified checkpoints after successful stage and post-pass reanalysis.
  - Near the 5-minute wall, it can restore the best eligible checkpoint, truncate later tool rows, and record `verified_checkpoint_timeout_return`.
  - Default checkpoint floor is `85/B`.
  - Targeted runtime-tail floors are `structure-4076 >=70/C`, `long-4516 >=80/B`, and `structure-4438 >=90/A`.
- Checkpoint eligibility rejects unsafe states.
  - No checkpoint return without score improvement over the input state.
  - Page count, text count, tagged state, and structure tree must not regress.
  - Applied mutation-truth contradictions are rejected as `false_positive_applied(...)`.
  - Existing PAC acceptance gates must not detect harmful PAC regressions.
- Runtime traces and `scripts/pac-runtime-tail-diagnostic.ts` now report verified checkpoint fields and classify `verified_checkpoint_timeout_returned` separately.
- PAC scoring caps, PAC gate allow-lists, planner routes, mutators, and timeout defaults were not changed.

Validation artifacts:

- Targeted subset run: `Output/experiment-corpus-baseline/run-verified-checkpoint-timeout-recovery-target-2026-05-07-r1`
- Runtime diagnostic: `Output/experiment-corpus-baseline/verified-checkpoint-timeout-recovery-diagnostic-2026-05-07-r1`

Targeted result:

- Selected rows: `10`
- Successful remediation rows: `9/10`
- Timed-out rows: `structure-4438`
- Successful-row mean after: `86.11`
- Successful-row grades after: `4 A / 2 B / 2 C / 1 F`
- `false_positive_applied = 0`
- `structure-4076` completed at `70/C`, meeting its targeted floor.
- `long-4516` completed at `89/B` with `verified_checkpoint_timeout_return`.
- `long-4683` completed at `86/B` with `verified_checkpoint_timeout_return`.
- `structure-4438` still timed out; the last verified checkpoint was only `36/F` and was correctly rejected as `checkpoint_below_floor(36<90)`.
- Controls were mixed: `fixture-teams-original`, `font-4035`, and `structure-3775` stayed A-grade, but `fixture-inaccessible` took the known volatile `79/C` route.
- `structure-3661` stayed recovered at `98/A`; `figure-4188` remained unresolved at `59/F`.

Decision:

- Do not run the fixed 50-file benchmark from this result.
- Keep the verified checkpoint return mechanism because it recovered two hard timeout rows without false-positive-applied evidence.
- The remaining blockers are `structure-4438` lack of any eligible checkpoint and `fixture-inaccessible` route volatility.
- Next work should target `structure-4438` early-stage route/analyzer progress or checkpoint floor feasibility, plus a separate route-volatility isolation for `fixture-inaccessible`; do not lower the `structure-4438` checkpoint floor below `90/A` without explicit acceptance-policy approval.

## Structure-4438 Feasibility And Fixture Route Stabilization

Implemented as diagnostic-first after verified checkpoint timeout recovery:

- Added `scripts/pac-target-route-diagnostic.ts`.
  - Compares good/bad `fixture-inaccessible` routes at tool-timeline level.
  - Reports first divergence, replay-state signatures, PAC rejection reasons, link-repair outcome, and score movement.
  - Classifies `structure-4438` checkpoint feasibility from timeout trace checkpoint history.
- Extended timeout traces with `verifiedCheckpointHistory` so future timeout artifacts show every checkpoint candidate, not only the last one.
- No remediation behavior was changed.
  - No PAC scoring caps or PAC gate changes.
  - No timeout increases.
  - No planner broadening or new repair tools.
  - `structure-4438` checkpoint floor remains `90/A`.

Diagnostic artifacts:

- Initial comparison: `Output/experiment-corpus-baseline/pac-target-route-diagnostic-2026-05-07-r1`
- Focused `structure-4438` repeat: `Output/experiment-corpus-baseline/run-structure4438-feasibility-repeat-2026-05-07-r1`
- Final comparison using repeat trace: `Output/experiment-corpus-baseline/pac-target-route-diagnostic-2026-05-07-r2`

Findings:

- `fixture-inaccessible` is confirmed route-volatile:
  - Good route `run-trace-driven-final-reanalysis-target-2026-05-06-r2`: `97/A`
  - Bad route `run-verified-checkpoint-timeout-recovery-target-2026-05-07-r1`: `79/C`
  - First divergence occurs at `mark_untagged_content_as_artifact` from the same replay-state signature: good route rejects it, bad route applies it.
  - `repair_native_link_structure` applies only in the good route and is rejected in the bad route.
- `structure-4438` is confirmed `no_eligible_checkpoint_available` at the current floor:
  - Focused repeat wrote `6` checkpoint candidates.
  - Best checkpoint remained `36/F`.
  - Every checkpoint was rejected as `checkpoint_below_floor(...<90)`.

Decision:

- Do not run fixed 50-file validation from this stage.
- Do not lower the `structure-4438` floor or mask its timeout with a low checkpoint.
- Do not add a broad orphan-MCID/PAC exception for `fixture-inaccessible`.
- Next behavior work, if pursued, should be a narrow same-state artifact-route stabilization for `fixture-inaccessible`: when `mark_untagged_content_as_artifact` has the known same replay state and no score/link/category benefit, prefer the rejected/no-effect path that leaves `repair_native_link_structure` available.

## Fixture-Inaccessible Same-State Artifact Route Stabilization

Implemented as a narrow route-stabilization behavior:

- Added a same-state artifact guard for `mark_untagged_content_as_artifact`.
  - Targets replay-state signature `1d49f4344e1db6615a17c1f8`.
  - Applies only from score `79` when total score and `link_quality` do not improve and no checker-facing structural benefit is present.
  - Rejects the no-route-benefit artifact mutation with `fixture_inaccessible_artifact_route_stabilized`.
- Added a narrow orphan-MCID PAC recovery for `repair_native_link_structure`.
  - Applies only when all PAC regressions are `pdfua.content.orphan_mcids_absent`.
  - Requires total score or link-quality movement.
  - Keeps unrelated tools and non-orphan PAC regressions rejected.
- PAC scoring caps, PAC gate allow-lists, timeout defaults, planner breadth, and repair tools were not changed.
- `structure-4438` remains diagnostic-only with checkpoint floor `90/A`.

Validation artifacts:

- First exact-guard smoke, failed: `Output/experiment-corpus-baseline/run-fixture-artifact-route-stabilization-smoke-2026-05-07-r1`
- Adjusted artifact guard smoke, still failed before link recovery: `Output/experiment-corpus-baseline/run-fixture-artifact-route-stabilization-smoke-2026-05-07-r2`
- Final fixture smoke, passed: `Output/experiment-corpus-baseline/run-fixture-artifact-route-stabilization-smoke-2026-05-07-r3`
- Targeted 10-row subset: `Output/experiment-corpus-baseline/run-fixture-artifact-route-stabilization-target-2026-05-07-r1`

Fixture smoke result:

- `fixture-inaccessible`: `40/F -> 97/A`
- `repair_native_link_structure` applied with `pac_orphan_mcid_recovery(repair_native_link_structure)`.
- Runtime was about `15.3s`.
- No generated PDFs were written.

Targeted subset result:

- Selected rows: `10 / 50`
- Remediation success/errors: `8 / 2`
- Reanalyzed scores: mean `86.9`, median `97.0`, p95 `99.0`
- Reanalyzed row outcomes:
  - `fixture-teams-original`: `98/A`
  - `fixture-inaccessible`: `97/A`
  - `figure-4188`: `59/F`
  - `structure-3661`: `98/A`
  - `structure-3775`: `97/A`
  - `structure-4076`: after `69/D`, reanalyzed `56/F`
  - `structure-4438`: hard timeout; trace shows best checkpoint `36/F`, below `90/A` floor
  - `font-4035`: `99/A`
  - `long-4516`: hard timeout; trace shows eligible `86/B` checkpoint was recorded but not returned before wall timeout
  - `long-4683`: `91/A`
- Runtime timeout traces were written for `structure-4438` and `long-4516`.

Decision:

- Do not run the fixed 50-file benchmark from this candidate.
- Keep the fixture route stabilization as useful but not sufficient for a full acceptance run.
- The remaining blockers are runtime/checkpoint-return timing on `long-4516`, persistent no-eligible-checkpoint behavior on `structure-4438`, and `structure-4076` route drift below its `70/C` floor.
- Next work should isolate why the eligible `long-4516` checkpoint was not returned before the wall timeout and why `structure-4076` regressed from the prior `70/C` checkpoint result to `69/D`/`56/F`.

## Long-4516 Checkpoint Return And Structure-4076 Drift Isolation

Implemented after fixture route stabilization:

- Added an earlier verified-checkpoint admission window before risky work.
  - Existing low-budget soft-stop behavior remains unchanged.
  - Checkpoint return now uses a larger risky-work threshold before starting another tool, stage reanalysis, post-pass, or final reanalysis.
  - The returned checkpoint still has to meet existing safety floors and regression checks.
- Preserved checkpoint floors:
  - default: `85/B`
  - `structure-4076`: `70/C`
  - `long-4516`: `80/B`
  - `structure-4438`: `90/A`
- Extended `scripts/pac-target-route-diagnostic.ts` with `structure-4076` drift comparison.
- No PAC scoring caps, PAC gate allow-list changes, timeout increases, planner broadening, new mutators, or API changes were added.

Diagnostic artifacts:

- Route/drift diagnostic: `Output/experiment-corpus-baseline/pac-target-route-diagnostic-2026-05-07-r3`
- Targeted validation r1: `Output/experiment-corpus-baseline/run-long4516-checkpoint-return-target-2026-05-07-r1`
- Targeted validation r2: `Output/experiment-corpus-baseline/run-long4516-checkpoint-return-target-2026-05-07-r2`
- Focused `structure-3775` smoke: `Output/experiment-corpus-baseline/run-long4516-checkpoint-return-structure3775-smoke-2026-05-07-r1`
- Fixed 50 run: `Output/experiment-corpus-baseline/run-long4516-checkpoint-return-full-2026-05-07-r1`
- Stage 41 gate: `Output/experiment-corpus-baseline/long4516-checkpoint-return-gate-2026-05-07-r1`

Targeted r2 result:

- Selected rows: `10 / 50`
- Remediation success/errors: `9 / 1`
- Reanalyzed mean/median: `89.1 / 97`
- `false_positive_applied = 0`
- `fixture-inaccessible`: `97/A`
- `fixture-teams-original`: `98/A`
- `structure-3661`: `98/A`
- `structure-3775`: `97/A`
- `font-4035`: `99/A`
- `long-4516`: `89/B` via `verified_checkpoint_timeout_return`
- `long-4683`: `96/A`
- `structure-4076`: `69/D`, below the target floor but left unchanged because the drift diagnostic shows route divergence rather than a proven safe same-state behavior fix.
- `structure-4438`: hard timeout with trace showing best checkpoint `36/F`, correctly below the `90/A` floor.
- `figure-4188`: unresolved at `59/F`, not regressed.

Structure-4076 drift finding:

- Good reference: `run-verified-checkpoint-timeout-recovery-target-2026-05-07-r1`
- Bad comparison: `run-fixture-artifact-route-stabilization-target-2026-05-07-r1`
- Classification: `route_drift`
- Good score/reanalysis: `70 / 70`
- Bad score/reanalysis: `69 / 56`
- Final reanalysis drop in the bad route: `13`
- First divergence is the first tool row:
  - good: `normalize_pdfua_catalog_settings` applied from score `48`
  - bad: `normalize_pdfua_catalog_settings` rejected from score `53`
- Decision: do not add a `structure-4076` route guard until a safe same-state/order issue is proven.

Fixed 50 result:

- Selected rows: `50 / 50`
- Remediation success/errors: `48 / 2`
- Remediation after mean/median/p95: `89.9 / 97.0 / 100.0`
- Reanalyzed mean/median/p95: `88.9 / 97.0 / 99.0`
- Runtime wall mean/median/p95: `33169.6ms / 14143.3ms / 111286.1ms`
- Bounded-work signals included `verified_checkpoint_timeout_return: 2`.
- `long-4516` recovered to `86/B` with no hard timeout.
- `structure-4076` reached `70/C`.
- `structure-4438` still hard-timed out with best checkpoint `36/F`, below floor.
- `long-4683` hard-timed out in the full run; its timeout trace shows best checkpoint `80/B`, below the default `85/B` floor.
- `structure-3775` showed volatility (`79/C` in the full run, `97/A` in the targeted repeat and focused smoke).
- `long-4470` showed a large final reanalysis drop (`96/A` in-run to `59/F` reanalyzed).
- `font-4057` remained low at `69/D`.

Stage 41 gate decision: `FAIL`.

Failed gates:

- `analyze_success`
- `remediate_success`
- `route_summary_coverage`
- `f_grade_count`
- `protected_file_regressions`
- `runtime_p95_wall`
- `total_tool_attempts`

Decision:

- Keep the earlier risky-work checkpoint return behavior because it recovered `long-4516` and improved runtime handling without weakening PAC strictness.
- Do not treat the fixed 50 as acceptance-ready: reanalyzed mean is still below the `90+` goal, two rows still time out, and route/reanalysis volatility remains.
- Do not lower the `structure-4438` floor.
- Do not lower the default checkpoint floor for `long-4683` without a separate safety plan.
- Next work should isolate:
  - `long-4683` timeout versus its below-floor `80/B` checkpoint;
  - `structure-3775` route volatility;
  - `long-4470` final reanalysis drop;
  - `font-4057` low-score residual.
