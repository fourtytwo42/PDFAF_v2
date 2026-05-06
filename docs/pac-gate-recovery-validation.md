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
