# Stage 6 Closeout

## Status

Stage 6 implementation is complete in code, tests, API surface, and reporting.

Full-corpus semantic acceptance is not closed from this environment because no semantic runtime was configured on 2026-04-18. In this workspace, `OPENAI_COMPAT_BASE_URL` was unset and `PDFAF_RUN_LOCAL_LLM` was not enabled, so the 50-file Stage 5→6 semantic benchmark and acceptance artifacts could not be regenerated truthfully at that time.

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

## Remaining Acceptance Step

Run the full Stage 5→6 semantic benchmark in an environment with semantic access configured, then publish:

- `Output/experiment-corpus-baseline/run-stage6-full/`
- `Output/experiment-corpus-baseline/comparison-stage6-full-vs-stage5/`
- `Output/experiment-corpus-baseline/stage6-acceptance/`

The semantic runtime may be either:

- an external OpenAI-compatible endpoint exposed through `OPENAI_COMPAT_BASE_URL`
- the embedded local `llama.cpp` path enabled with `PDFAF_RUN_LOCAL_LLM=1`

The acceptance bar remains:

- figure-heavy and mixed cohorts improve without broad runtime inflation
- accepted structural-confidence regressions remain `0`
- semantic-only trusted passes remain `0`
- long-report p95 remains bounded

## Next Stage

After the Stage 6 corpus run is completed and accepted, Stage 7 is the next active stage: performance hardening.
