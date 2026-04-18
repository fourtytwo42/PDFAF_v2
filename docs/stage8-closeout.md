# Stage 8 Closeout

## Status

Stage 8 is closed as a final evaluation stage, and the upgraded engine did **not** pass the final experiment gate.

The final Stage 8 full-corpus run used the embedded local `llama.cpp` runtime with `PDFAF_RUN_LOCAL_LLM=1`. The final artifacts are:

- `Output/experiment-corpus-baseline/run-stage8-full/`
- `Output/experiment-corpus-baseline/comparison-stage8-full-vs-stage0/`
- `Output/experiment-corpus-baseline/stage8-final-gate/`

## What Stage 8 Added

- a `stage8FinalGate` audit and script for final corpus-wide disposition and gate evaluation
- explicit final dispositions for every file:
  - `reached_100`
  - `reached_A_not_100`
  - `materially_improved_but_incomplete`
  - `honest_bounded_manual_review`
  - `honest_bounded_unsafe_to_autofix`
  - `not_materially_improved`
- final gate pass/fail rows encoded directly in machine-readable and markdown artifacts
- a reproducible material-improvement rule:
  - score delta `>= 10` vs Stage 0
  - or at least one full-grade improvement

## Verification Completed

- `pnpm exec tsc --noEmit`
- `pnpm exec vitest run tests/benchmark/stage7Acceptance.test.ts tests/benchmark/stage8FinalGate.test.ts tests/benchmark/experimentCorpus.test.ts`
- `PDFAF_RUN_LOCAL_LLM=1 pnpm exec tsx scripts/experiment-corpus-benchmark.ts --mode full --semantic --out Output/experiment-corpus-baseline/run-stage8-full`
- `pnpm exec tsx scripts/compare-experiment-corpus-runs.ts Output/experiment-corpus-baseline/run-stage1-pre-full Output/experiment-corpus-baseline/run-stage8-full Output/experiment-corpus-baseline/comparison-stage8-full-vs-stage0`
- `pnpm exec tsx scripts/stage8-final-gate.ts Output/experiment-corpus-baseline/run-stage1-pre-full Output/experiment-corpus-baseline/run-stage8-full Output/experiment-corpus-baseline/comparison-stage8-full-vs-stage0 Output/experiment-corpus-baseline/stage8-final-gate`

## Final Results

- final gate result: `FAIL`
- `reached100Count = 0`
- `reachedACount = 30`
- `materiallyImprovedCount = 0`
- `honestBoundedManualReviewCount = 0`
- `honestBoundedUnsafeToAutofixCount = 18`
- `notMateriallyImprovedCount = 2`
- Stage 0→8 median/p95:
  - analyze `808.65 / 1632.81 ms -> 741.33 / 1509.99 ms`
  - remediate `8550.67 / 96755.42 ms -> 8564.47 / 90232.21 ms`
- trust gates remained intact:
  - `acceptedConfidenceRegressionCount = 0`
  - `semanticOnlyTrustedPassCount = 0`

## Why The Final Gate Failed

The engine met the trust and runtime guardrails, and most remaining files ended in honest bounded states rather than optimistic passes. It failed the final roadmap gate because the stricter final engine did not convert a majority of the 50-file corpus to `100/100`.

The final disposition mix was:

- `reached_A_not_100 = 30`
- `honest_bounded_unsafe_to_autofix = 18`
- `not_materially_improved = 2`

The strongest positive cohort was `50-long-report-mixed`, with remediation mean delta `+2.63` and remediation runtime median delta `-510.76 ms` versus Stage 0. The weakest remaining cohorts were `10-short-near-pass`, `30-structure-reading-order`, and `40-font-extractability`, which still carry substantial structural or extractability debt that the staged deterministic-plus-gated-semantic engine does not fully clear.

## Final Conclusion

The staged upgrade program is complete, but the roadmap’s final experiment gate did not pass. The engine is faster, more bounded, and more honest than the optimistic baseline, but it should not be described as having solved the full 50-file corpus to the standard originally set in Stage 8.
