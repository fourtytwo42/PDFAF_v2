# Stage 6 Closeout

## Status

Stage 6 is closed in code, tests, API surface, reporting, and corpus acceptance.

The accepted Stage 6 full-corpus run used the embedded local `llama.cpp` runtime with `PDFAF_RUN_LOCAL_LLM=1`. The accepted artifacts are:

- `Output/experiment-corpus-baseline/run-stage6-full/`
- `Output/experiment-corpus-baseline/comparison-stage6-full-vs-stage5/`
- `Output/experiment-corpus-baseline/stage6-acceptance/`

## What Stage 6 Added

- shared semantic gate policy across all existing semantic lanes:
  - `semantic`
  - `semanticHeadings`
  - `semanticPromoteHeadings`
  - `semanticUntaggedHeadings`
- lane-specific skip reasons and candidate accounting before any LLM call
- semantic mutation rejection when:
  - score regresses beyond tolerance
  - structural classification confidence regresses
  - target category and candidate-state evidence do not improve
- trust capping after accepted semantic changes so semantic-only results do not become fully trusted passes
- additive semantic summaries in:
  - `POST /v1/remediate`
  - HTML reports
  - experiment-corpus benchmark rows and summary markdown
  - Stage 6 acceptance audit tooling

## Verification Completed

- `pnpm exec tsc --noEmit`
- `pnpm exec swagger-cli validate openapi.yaml`
- `pnpm exec vitest run tests/reporter/htmlReport.test.ts tests/integration/remediate.test.ts tests/benchmark/experimentCorpus.test.ts tests/benchmark/stage5Acceptance.test.ts tests/benchmark/stage6Acceptance.test.ts tests/semantic/semanticService.test.ts tests/semantic/headingSemantic.test.ts tests/semantic/promoteHeadingSemantic.test.ts tests/semantic/untaggedHeadingSemantic.test.ts tests/semantic/semanticPolicy.test.ts`
- `PDFAF_RUN_LOCAL_LLM=1 pnpm exec tsx scripts/experiment-corpus-benchmark.ts --mode full --semantic --out Output/experiment-corpus-baseline/run-stage6-full`
- `pnpm exec tsx scripts/compare-experiment-corpus-runs.ts Output/experiment-corpus-baseline/run-stage5-full Output/experiment-corpus-baseline/run-stage6-full Output/experiment-corpus-baseline/comparison-stage6-full-vs-stage5`
- `pnpm exec tsx scripts/stage6-acceptance-audit.ts Output/experiment-corpus-baseline/run-stage5-full Output/experiment-corpus-baseline/run-stage6-full Output/experiment-corpus-baseline/comparison-stage6-full-vs-stage5 Output/experiment-corpus-baseline/stage6-acceptance`

## Accepted Results

- `acceptedConfidenceRegressionCount = 0`
- `semanticOnlyTrustedPassCount = 0`
- semantic applied outcomes are present in the accepted audit:
  - `promote_headings:applied = 2`
  - `figures:applied = 1`
- Stage 5→6 remediation comparison:
  - after-score mean delta `+0.52`
  - reanalyzed mean delta `+0.50`
  - wall-runtime median delta `+879.57 ms`
  - wall-runtime p95 delta `-450.30 ms`
- cohort movement:
  - `20-figure-ownership` remediation delta mean `+1.40`
  - `50-long-report-mixed` remediation delta mean `+1.25`

These results satisfy the Stage 6 acceptance bar:

- figure-heavy and mixed cohorts improved
- accepted structural-confidence regressions remained `0`
- semantic-only trusted passes remained `0`
- long-report remediation `p95` stayed bounded and improved versus Stage 5

## Next Stage

Stage 7 is now the next active stage: performance hardening.
