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
