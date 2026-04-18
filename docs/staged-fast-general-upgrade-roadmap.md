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

## Immediate Next Actions

1. Add a benchmark manifest and batch runner over [Input/experiment-corpus](/home/hendo420/PDFAF_v2/Input/experiment-corpus).
2. Capture the Stage 0 baseline for all 50 PDFs.
3. Implement Stage 1 first: evidence model, score caps, and additive reporting fields.
4. Do not expand remediation breadth until the baseline and honest scoring work are complete.
