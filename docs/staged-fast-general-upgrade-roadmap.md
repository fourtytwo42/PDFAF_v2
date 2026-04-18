# Staged Fast General Upgrade Roadmap

## Summary

This roadmap is the execution plan for upgrading PDFAF v2 into a faster, more robust, and more honest general-purpose PDF accessibility engine.

The guiding rules are:

- improve detection and remediation together
- stay general, not family-specific
- keep analyze/remediate runtime bounded
- use experiments as the gate for every stage
- do not claim the engine works until it performs well on the experiment corpus with the tighter detection suite

The working experiment corpus for this roadmap is the 50-file set under [Input/experiment-corpus](/home/hendo420/PDFAF_v2/Input/experiment-corpus).

## Corpus And Working Method

The corpus is intentionally split into six cohorts so we can improve the engine piece by piece without losing generality:

- `00-fixtures`: baseline fixtures and Microsoft Teams checkpoints
- `10-short-near-pass`: short documents that should convert quickly if the engine is healthy
- `20-figure-ownership`: figure alt text, nested alt, ownership, and artifact pressure
- `30-structure-reading-order`: logical structure, heading, and reading-order debt
- `40-font-extractability`: encoding, Unicode, font embedding, and text extraction risk
- `50-long-report-mixed`: long multi-problem reports with runtime risk

For each stage below, the workflow is the same:

1. Run the stage against the full 50-file corpus.
2. Record before/after analyze and remediate results.
3. Compare score movement, manual-review movement, and runtime movement by cohort.
4. Keep the change only if it improves general results without materially inflating runtime.
5. Promote the stage only when all exit criteria for that stage are met.

## Stage 0: Freeze The Benchmark Surface

### Goal

Create a stable experimental loop so future changes are measured against the same truth set.

### Work

- Treat the 50-file corpus as the default development benchmark set.
- Add a benchmark manifest in code or docs that records:
  - file path
  - cohort
  - document intent
  - whether it is an original, fixture, or remediated checkpoint
- Add scripts or script inputs for:
  - analyze-only batch over the corpus
  - remediate batch over the corpus
  - before/after score comparison
  - runtime comparison by file and cohort
- Capture the current baseline before any scoring or remediation changes:
  - overall score and grade
  - category scores
  - findings
  - manual-review indicators
  - analyze duration
  - remediate duration

### Exit Criteria

- The same 50 PDFs can be re-run repeatedly without changing the benchmark surface.
- We can produce one before/after report for any change without ad hoc file selection.
- Median and p95 runtime are part of the baseline, not an afterthought.

## Stage 1: Honest Scoring And Evidence Model

### Goal

Make scoring more trustworthy before expanding repairs.

### Work

- Add an evidence model for category and finding outputs:
  - `verified`
  - `heuristic`
  - `inferred_after_fix`
  - `manual_review_required`
- Add additive API/report fields:
  - `verificationLevel`
  - `manualReviewRequired`
  - `manualReviewReasons`
  - `scoreCapsApplied`
  - per-category confidence/evidence metadata
- Cap categories that currently overstate certainty:
  - OCR-derived text layers
  - reading order without strong structure evidence
  - semantic alt text without structural confirmation
  - heuristic-only contrast
- Borrow from v1:
  - local standards style findings with confidence and inferred flags
  - failure visibility for machine-detectable but not fully repairable issues

### Exit Criteria

- No category returns a full-confidence pass when the underlying evidence is heuristic-only.
- The experiment corpus produces more honest outputs without large runtime growth.
- API/output compatibility is preserved for existing `score`, `grade`, `categories`, and `findings`.

### Status

- Implemented and calibrated.
- Benchmarked against the pre-Stage-1 baseline with formal comparison artifacts under `Output/experiment-corpus-baseline/comparison-stage1-analyze/` and `Output/experiment-corpus-baseline/comparison-stage1-full/`.
- Closed with a Stage 1 acceptance audit under `Output/experiment-corpus-baseline/stage1-acceptance/`.
- Acceptance result: `suspicious-overbroad = 0`, so no additional Stage 1 calibration patch was required.
- Stage 2 entry remains read-only classification and failure profiling; planner/routing changes stay out of scope until Stage 2.

## Stage 2: Fast Structural Classification And Failure Profiling

### Goal

Route repairs by actual failure shape instead of broad guesses.

### Work

- Add structural classification derived from existing `pdfjs + pikepdf` evidence:
  - scanned
  - untagged digital
  - partially tagged
  - native tagged
  - well tagged
- Add a compact failure profile that groups:
  - deterministic issues
  - semantic issues
  - manual-only issues
- Reuse the v1 ideas, not the full v1 engine:
  - structural class
  - content profile
  - font-risk profile
  - grouped failure families
- Keep the implementation cheap:
  - no new whole-document expensive pass
  - no AI planning
  - no rendering-heavy analysis in the hot path

### Exit Criteria

- Every PDF in the corpus can be assigned a structural class and grouped failure profile.
- Planner inputs become more specific without noticeable analyze slowdown.
- Failure grouping is stable across multiple unrelated documents in the same cohort.

### Status

- Implemented as a read-only analysis layer on top of `DocumentSnapshot` and Stage 1 evidence outputs.
- Benchmarked on the full 50-file corpus in both `analyze` and `full` modes with additive benchmark/reporting output for structure class and failure family distributions.
- Full corpus coverage achieved:
  - every file received a `structuralClassification`
  - every file received a `failureProfile`
- Runtime remained in the same band as Stage 1 in the direct full-run comparison under `Output/experiment-corpus-baseline/comparison-stage2-full-vs-stage1/`.
- Closed as a read-only classification/failure-profiling stage; planner and routing changes remain deferred to Stage 4.

## Stage 3: Bounded Detection Upgrades

### Goal

Improve generic detection for the hardest machine-detectable gaps without broad runtime inflation.

### Work

- Strengthen reading-order analysis using bounded checks:
  - structure order vs page order on suspicious or sampled pages
  - repeated header/footer pollution
  - annotation ordering only where annotations exist
- Strengthen PDF/UA-oriented structural checks:
  - illegal role parent/child combinations
  - MCID ownership completeness
  - annotation `/StructParent` integrity
  - list and table legality
- Port or adapt fast v1 helpers where they are bounded:
  - tab-order analysis
  - local standards evidence rules
  - targeted structural invariants
- Keep contrast heuristic-only in this phase; reduce false confidence instead of adding rendering.

### Exit Criteria

- The corpus shows fewer false-clean results in figure, structure, and font cohorts.
- Analyze runtime growth stays small and attributable.
- Long-report p95 remains acceptable because new checks are sampled or gated.

### Status

- Implemented as a bounded detection layer with additive `detectionProfile` output and tighter structural category scoring.
- Benchmarked in both `analyze` and `full` modes against the fixed 50-file corpus.
- Closed with direct Stage 2→3 comparison artifacts and a Stage 3 acceptance audit under `Output/experiment-corpus-baseline/stage3-acceptance/`.
- Accepted with one calibration pass in `reading_order`; remaining post-remediation `pdf_ua_compliance` survivors are documented and deferred to Stage 4/5 work.
- Accepted as a detection-only stage; planner/routing changes remain deferred to Stage 4.

## Stage 4: Deterministic-First Remediation Routing

### Goal

Make repair selection cheaper, safer, and more explainable.

### Work

- Replace broad planner behavior with deterministic-first routing from the failure profile.
- Gate tools behind cheap preconditions so they do not run speculatively.
- Reuse v1 planner ideas selectively:
  - metadata stage
  - structure bootstrap stage
  - link/annotation stage
  - font stage
  - native structure stage
  - safe candidate stage
- Keep semantic work behind deterministic gates.
- Reject or roll back repairs that raise score while lowering structural confidence.

### Exit Criteria

- Clean and near-pass PDFs finish faster because fewer unnecessary tools run.
- The planner can explain why each tool ran or was skipped.
- The corpus shows higher remediation consistency across cohorts, not just individual files.

### Status

- Implemented on top of the Stage 2 failure profile and Stage 3 bounded detection outputs.
- Planner behavior now routes through deterministic route families with additive `planningSummary` output across API, reporting, and benchmark artifacts.
- Benchmarked on the full 50-file corpus with direct Stage 3→4 comparison artifacts under `Output/experiment-corpus-baseline/comparison-stage4-full-vs-stage3/`.
- Closed with a Stage 4 acceptance audit under `Output/experiment-corpus-baseline/stage4-acceptance/`.
- Stage 4 now rejects score-improving stage results when they would lower `structuralClassification.confidence`; accepted confidence-regression survivors are required to remain at `0`.
- Accepted as a routing-and-safeguards stage; broader structural repair expansion remains deferred to Stage 5.

## Stage 5: Generic Structural Repair Expansion

### Status

- Closed as of 2026-04-18.
- Implemented the Stage 5 deterministic structural expansion already hinted by the planner/tooling: list legality, high-confidence table header repair, annotation ownership/tab-order normalization, orphan-MCID cleanup, and deterministic heading normalization.
- Kept Stage 4 structural-confidence rollback safeguards active across the expanded repair set and post-pass structural mutations.
- Added additive `remediationOutcomeSummary` output across the remediate API, HTML report, and experiment-corpus benchmark rows.
- Benchmarked on the full 50-file corpus with direct Stage 4→5 comparison artifacts under `Output/experiment-corpus-baseline/comparison-stage5-full-vs-stage4/`.
- Closed with a Stage 5 acceptance audit under `Output/experiment-corpus-baseline/stage5-acceptance/`.
- The accepted Stage 5 audit records `accepted confidence regressions = 0` and an outcome distribution of `fixed:14`, `partially_fixed:7`, `needs_manual_review:4`, `unsafe_to_autofix:25`.
- The accepted Stage 5 comparison package shows lower remediation runtime than Stage 4 on the accepted full-run comparison:
  - remediation wall-runtime median delta `-188.16 ms`
  - remediation wall-runtime p95 delta `-51.99 ms`
- Stage 5 remains an honest bounded-repair stage: unresolved structural debt is now surfaced explicitly rather than being silently retried or overclaimed.

### Goal

Add only the next set of generic repairs that are justified by the experiment data.

### Work

- Expand low-cost structural repair primitives:
  - list nesting legality
  - table header structure when high-confidence
  - annotation ownership and tab-order normalization
  - orphan MCID attachment or artifacting
  - heading promotion from strong structural/layout evidence
- Keep changes generic:
  - no authoring-tool-name routing
  - no file-family exceptions
  - no one-off corpus hacks
- Add explicit remediation outcomes:
  - `fixed`
  - `partially_fixed`
  - `needs_manual_review`
  - `unsafe_to_autofix`

### Exit Criteria

- The figure, structure, and font cohorts all improve measurably.
- Remediation runtime increases mainly on files that actually need the new repairs.
- Failures that remain unresolved are classified honestly rather than silently churned.

## Stage 6: Gated Semantic Improvement

### Status

- Closed as of 2026-04-18.
- Hardened all existing semantic lanes under a shared Stage 6 gate layer:
  - `semantic`
  - `semanticHeadings`
  - `semanticPromoteHeadings`
  - `semanticUntaggedHeadings`
- Semantic execution remains explicit opt-in by default; requested lanes now emit additive gate/result summaries instead of ad hoc skip behavior.
- Semantic apply/revert decisions now reuse Stage 4 rollback protections:
  - score-regression revert
  - structural-confidence-regression revert
  - no-target-improvement revert
- Accepted semantic changes no longer promote a semantic-only result to a fully trusted pass; final verification stays capped unless deterministic evidence corroborates the fix.
- Added additive semantic summary output across the remediate API, HTML report, OpenAPI surface, experiment-corpus benchmark rows, and the Stage 6 acceptance audit tooling.
- Verification is complete for source changes:
  - `pnpm exec tsc --noEmit`
  - `pnpm exec swagger-cli validate openapi.yaml`
  - targeted semantic/report/benchmark/integration Vitest coverage
- Accepted on the full 50-file corpus using the embedded local `llama.cpp` runtime with artifacts under:
  - `Output/experiment-corpus-baseline/run-stage6-full/`
  - `Output/experiment-corpus-baseline/comparison-stage6-full-vs-stage5/`
  - `Output/experiment-corpus-baseline/stage6-acceptance/`
- Accepted Stage 6 audit signals:
  - `acceptedConfidenceRegressionCount = 0`
  - `semanticOnlyTrustedPassCount = 0`
  - semantic applied outcomes present: `promote_headings:applied = 2`, `figures:applied = 1`
- Accepted Stage 5→6 comparison signals:
  - remediation after-score mean delta `+0.52`
  - remediation reanalyzed mean delta `+0.50`
  - remediation wall-runtime median delta `+879.57 ms`
  - remediation wall-runtime p95 delta `-450.30 ms`
  - `20-figure-ownership` remediation delta mean `+1.40`
  - `50-long-report-mixed` remediation delta mean `+1.25`
- Accepted as a gated semantic stage: semantic lanes now produce bounded, explainable improvements without semantic-only trusted passes or accepted structural-confidence regressions.

### Goal

Use semantic passes only where they improve results without turning the engine slow or overconfident.

### Work

- Tighten figure and heading semantic entry conditions.
- Require deterministic evidence before and after semantic mutation.
- Do not allow semantic outputs alone to create a fully trusted pass.
- Prioritize:
  - figure alt text wording
  - decorative vs informative decisions
  - heading-level refinement
- Keep semantic work optional and subset-based on long reports.

### Exit Criteria

- Semantic passes improve the figure-heavy and mixed cohorts without broad runtime inflation.
- No semantic-only fix is allowed to hide structural debt.
- Remediation p95 remains bounded on long-report files.

## Stage 7: Performance Hardening

### Status

- Closed as of 2026-04-18.
- Added additive runtime instrumentation across analyze/scoring, deterministic remediation stages, per-tool execution, and semantic lanes.
- Added additive `runtimeSummary` output to `AnalysisResult`, `POST /v1/remediate`, and experiment-corpus benchmark rows.
- Benchmarked on the full 50-file corpus with direct Stage 6→7 comparison artifacts under `Output/experiment-corpus-baseline/comparison-stage7-full-vs-stage6/`.
- Closed with a Stage 7 acceptance audit under `Output/experiment-corpus-baseline/stage7-acceptance/`.
- Accepted Stage 7 audit signals:
  - `acceptedConfidenceRegressionCount = 0`
  - `semanticOnlyTrustedPassCount = 0`
  - all coded runtime gates passed
- Accepted Stage 6→7 comparison signals:
  - remediation wall-runtime median delta `-488.88 ms`
  - remediation wall-runtime p95 delta `+572.79 ms`
  - remediation after-score mean delta `-0.12`
  - remediation reanalyzed mean delta `-0.04`
  - score-per-second delta `+1.230`
  - confidence-per-second delta `+0.0158`
- Accepted cohort runtime signals:
  - `20-figure-ownership` remediation runtime median delta `-292.49 ms`
  - `30-structure-reading-order` remediation runtime median delta `-510.19 ms`
  - `40-font-extractability` remediation runtime median delta `-16565.11 ms`
  - `50-long-report-mixed` remediation runtime median delta `-1266.73 ms`
- Stage 7 closes as an observability-and-gating stage: runtime costs are now explicit, attributable, and mechanically audited against the Stage 6 baseline.

### Goal

Lock in speed as a product requirement, not just a hope.

### Work

- Add timing instrumentation for:
  - scorer categories
  - structural audits
  - remediation tools
  - semantic calls
- Publish benchmark output with:
  - median
  - p95
  - slowest files
  - slowest stages
  - score/confidence delta per added cost
- Add acceptance gates that fail the stage if runtime drifts too far without enough quality gain.

### Exit Criteria

- Analyze and remediate regressions are visible immediately.
- Each expensive path is either justified, gated, sampled, or removed.
- The engine remains fast enough to use interactively on the corpus.

## Stage 8: Final Experiment Gate

### Goal

Decide whether the engine is genuinely better.

### Work

- Re-run the full 50-file corpus with the completed staged changes.
- Compare against the Stage 0 baseline by cohort and by file.
- Produce a final report with:
  - count of files that reach `100/100`
  - count of files that reach `A`
  - count of files improved materially but still not complete
  - count of files correctly classified as manual-review or unsafe-to-autofix
  - analyze/remediate median and p95 before vs after

### Acceptance Gate

We should not say the upgraded engine works until:

- a majority of the 50-file corpus reaches `100/100` under the improved detection suite
- most remaining files either improve materially or end in an honest bounded classification
- the long-report and mixed cohorts improve without a large p95 runtime blow-up
- no stage depended on file-family-specific logic to reach those results

### Status

- Implemented as a final evaluation-only stage with an explicit `stage8FinalGate` audit and per-file final dispositions.
- Final artifacts generated under:
  - `Output/experiment-corpus-baseline/run-stage8-full/`
  - `Output/experiment-corpus-baseline/comparison-stage8-full-vs-stage0/`
  - `Output/experiment-corpus-baseline/stage8-final-gate/`
- Stage 8 is closed, and the upgraded engine did **not** pass the final experiment gate.
- Final gate result:
  - `reached100Count = 0`
  - `reachedACount = 30`
  - `materiallyImprovedCount = 0`
  - `honestBoundedUnsafeToAutofixCount = 18`
  - `notMateriallyImprovedCount = 2`
- Trust and honesty gates still held at the final run:
  - `acceptedConfidenceRegressionCount = 0`
  - `semanticOnlyTrustedPassCount = 0`
- Runtime remained bounded versus the practical Stage 0 baseline:
  - analyze median/p95 `808.65 / 1632.81 ms -> 741.33 / 1509.99 ms`
  - remediate median/p95 `8550.67 / 96755.42 ms -> 8564.47 / 90232.21 ms`
- Final conclusion: the staged engine is more honest and operationally bounded, but it does not meet the original Stage 8 bar of converting a majority of the corpus to `100/100`.

## Final State

All eight roadmap stages are now complete as stages of record.

The final outcome is mixed:

- Stages 0 through 7 closed successfully.
- Stage 8 closed as an honest final experiment gate.
- The final engine passed the trust and runtime guardrails.
- The final engine did not pass the original majority-`100/100` corpus bar.

Future work, if any, should start from the Stage 8 final artifacts rather than reopening this staged roadmap with revised success criteria.

## Post-Stage-8 Follow-On Plan

### Goal

Increase true remediation coverage and push the corpus as close to `100/100` as possible while preserving the Stage 8 trust guarantees and avoiding speed regressions.

This follow-on plan is separate from the completed Stage 0-8 roadmap. It starts from the Stage 8 final artifacts and treats runtime as a hard gate on every change.

### Non-Negotiable Rules

- no accepted confidence regressions
- no semantic-only trusted passes
- no broad new whole-document expensive passes in the hot path
- every new repair path must be tightly preconditioned
- every new lane must report score gain per added cost
- analyze and remediate median/p95 runtime must stay flat or improve on the full corpus

### Strategy

The work should proceed on two tracks in parallel:

- recovery track:
  - recover score on files already near the top band, especially `10-short-near-pass` and `20-figure-ownership`
  - convert `A` files into real `100/100` results using cheap deterministic repair completion and tighter final verification credit
- hard-problem track:
  - reduce the `unsafe_to_autofix` population in `30-structure-reading-order` and `40-font-extractability`
  - add bounded new repairs only where deterministic or strongly gated execution is defensible

### Stage 9: Stage 8 Miss Triage

#### Goal

Turn the Stage 8 final artifacts into an actionable backlog of real misses.

#### Work

- cluster every non-`100` result by residual failure family
- separate misses into:
  - fix exists but is not attempted
  - fix is attempted but not fully credited
  - genuinely unsafe or still out of scope
- rank files and families by:
  - score loss
  - cohort frequency
  - runtime cost
  - likely repairability
- produce a triage artifact that identifies:
  - top `A-not-100` files likely convertible with cheap deterministic work
  - top `unsafe_to_autofix` reasons by cohort
  - top residual failures in `10-short-near-pass`, `30-structure-reading-order`, and `40-font-extractability`

#### Exit Criteria

- every Stage 8 miss is assigned to a concrete failure bucket
- top score-loss families are ranked and attributable
- the next repair stages have a bounded target list rather than broad hypotheses

### Stage 10: Near-Pass Completion

#### Goal

Convert as many `A-not-100` files as possible into true `100/100` results with cheap, bounded work.

#### Work

- strengthen deterministic figure ownership and alt cleanup where the existing engine already has good anchors
- finish cheap structural completion work for headings, lists, tables, links, and annotations
- improve final-state verification so valid deterministic repairs receive full credit instead of remaining under-scored
- keep all new work narrowly gated to files that already show the relevant residual debt

#### Exit Criteria

- `A-not-100` count drops materially on the full corpus
- `10-short-near-pass` and `20-figure-ownership` improve without median or p95 runtime regression
- no trust-gate regressions are introduced

### Stage 11: Structural Hard Cases

#### Goal

Reduce the structural `unsafe_to_autofix` backlog without broad speculative reconstruction.

#### Work

- add bounded structure reconstruction for tagged-but-broken documents where deterministic anchors exist
- improve reading-order repair for fixable structure-order mismatches
- tighten orphan-content, heading, and annotation recovery on deeply broken but still repairable files
- keep honest refusal for files where deterministic safe reconstruction still does not exist

#### Exit Criteria

- `unsafe_to_autofix` decreases in `30-structure-reading-order`
- the worst structure-heavy files improve materially or move into a smaller honest bounded set
- runtime growth remains attributable and acceptable on the affected cohort

### Stage 12: Font And Extractability Lane

#### Goal

Target the remaining extractability and font-driven score loss with a dedicated bounded repair lane.

#### Work

- isolate the exact font and extractability failure families that dominate `40-font-extractability`
- add deterministic or tightly gated remediation only where the engine can genuinely improve extractability outcomes
- ensure the lane does not run on files without clear font/extractability debt
- keep honest bounded outcomes for cases that remain unsafe or not machine-fixable

#### Exit Criteria

- `40-font-extractability` improves materially on the full corpus
- the font lane stays bounded and does not inflate runtime on unaffected files
- unresolved cases remain explicitly surfaced rather than overclaimed

### Stage 13: Final Speed-And-Score Gate

#### Goal

Re-evaluate the engine after the follow-on work and prove that score gains came without speed regression.

#### Work

- rerun the full corpus after Stages 9-12
- compare against the Stage 8 final run and the original Stage 0 baseline
- report:
  - new `100/100` count
  - new `A` count
  - remaining bounded states
  - cohort-level score movement
  - median and p95 runtime movement
- fail the follow-on program if score gains require slower processing on the corpus

#### Exit Criteria

- score movement is positive on the targeted cohorts
- median and p95 runtime stay flat or improve versus Stage 8
- trust gates remain intact
- the resulting engine is measurably closer to `100/100` across the corpus without sacrificing bounded performance
