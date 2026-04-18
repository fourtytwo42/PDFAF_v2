# Stage 7 Closeout

## Status

Stage 7 is closed in code, tests, API surface, benchmark reporting, and corpus acceptance.

The accepted Stage 7 full-corpus run used the embedded local `llama.cpp` runtime with `PDFAF_RUN_LOCAL_LLM=1`. The accepted artifacts are:

- `Output/experiment-corpus-baseline/run-stage7-full/`
- `Output/experiment-corpus-baseline/comparison-stage7-full-vs-stage6/`
- `Output/experiment-corpus-baseline/stage7-acceptance/`

## What Stage 7 Added

- additive runtime instrumentation across:
  - analyze/scoring
  - deterministic remediation stages
  - per-tool execution
  - semantic lanes
- additive `runtimeSummary` output in:
  - `AnalysisResult`
  - `POST /v1/remediate`
  - experiment-corpus benchmark rows
- benchmark and comparison reporting for:
  - stage/tool/lane runtime hotspots
  - bounded-work signals
  - score-per-second and confidence-per-second
- a Stage 7 acceptance audit with explicit runtime gates against the accepted Stage 6 baseline

## Verification Completed

- `pnpm exec tsc --noEmit`
- `pnpm exec swagger-cli validate openapi.yaml`
- `pnpm exec vitest run tests/benchmark/experimentCorpus.test.ts tests/benchmark/stage6Acceptance.test.ts tests/benchmark/stage7Acceptance.test.ts tests/integration/remediate.test.ts tests/routes/remediateSemanticMerge.test.ts tests/semantic/semanticService.test.ts tests/semantic/headingSemantic.test.ts tests/semantic/promoteHeadingSemantic.test.ts`
- `PDFAF_RUN_LOCAL_LLM=1 pnpm exec tsx scripts/experiment-corpus-benchmark.ts --mode full --semantic --out Output/experiment-corpus-baseline/run-stage7-full`
- `pnpm exec tsx scripts/compare-experiment-corpus-runs.ts Output/experiment-corpus-baseline/run-stage6-full Output/experiment-corpus-baseline/run-stage7-full Output/experiment-corpus-baseline/comparison-stage7-full-vs-stage6`
- `pnpm exec tsx scripts/stage7-acceptance-audit.ts Output/experiment-corpus-baseline/run-stage6-full Output/experiment-corpus-baseline/run-stage7-full Output/experiment-corpus-baseline/comparison-stage7-full-vs-stage6 Output/experiment-corpus-baseline/stage7-acceptance`

## Accepted Results

- `acceptedConfidenceRegressionCount = 0`
- `semanticOnlyTrustedPassCount = 0`
- Stage 6→7 remediation comparison:
  - wall-runtime median delta `-488.88 ms`
  - wall-runtime p95 delta `+572.79 ms`
  - after-score mean delta `-0.12`
  - reanalyzed mean delta `-0.04`
  - score-per-second delta `+1.230`
  - confidence-per-second delta `+0.0158`
- cohort runtime gates passed:
  - `20-figure-ownership` runtime median delta `-292.49 ms`, remediation delta mean `+0.40`
  - `30-structure-reading-order` runtime median delta `-510.19 ms`, remediation delta mean `+0.50`
  - `40-font-extractability` runtime median delta `-16565.11 ms`
  - `50-long-report-mixed` runtime median delta `-1266.73 ms`
- bounded-work signals in the accepted audit are dominated by legitimate gates rather than infrastructure failures:
  - `untagged_headings:unsupported_pdf (50)`
  - `figures:alt_text_sufficient (35)`
  - `headings:heading_structure_sufficient (32)`
  - `promote_headings:heading_structure_sufficient (30)`

These results satisfy the Stage 7 acceptance bar:

- analyze/remediate runtime regressions are visible in first-class benchmark artifacts
- expensive paths are attributed to specific stages and tools
- runtime gates passed on the accepted Stage 6→7 full-corpus comparison
- the engine remains interactively bounded on the corpus while preserving Stage 6 trust guarantees

## Next Stage

Stage 8 is now the next active stage: final experiment gate.
