# Stage 107 Visual Stability Run Validation

Date: 2026-04-26

Stage 107 stayed diagnostic-first. It did not change remediation routing,
scoring, or gate behavior.

## Decision

Keep the reusable run-level visual stability validator and expose it through
the benchmark run-validation path. The existing stage-level visual smoke check
now has a shared helper and a simple benchmark CLI switch for future use.

## Evidence

- Shared validator and report writer:
  - `src/services/benchmark/visualStability.ts`
- Stage 103 script refactor to reuse the shared validator:
  - `scripts/stage103-visual-stability-run.ts`
- Benchmark run validation now accepts `--validate-visual`:
  - `scripts/experiment-corpus-benchmark.ts`
- Validation artifacts:
  - `Output/experiment-corpus-baseline/run-stage106-font-visual-r1/visual-stability-validation`
  - `Output/experiment-corpus-baseline/stage107-visual-stability-run-validation-2026-04-26-r1`

The reused validation path stayed visually stable on the sampled
`font-4172` run:

- rows compared: `1/1`
- stable rows: `1`
- drift rows: `0`
- missing rows: `0`
- worst row: `font-4172`
- page drift: `0 / 455424` different pixels

## Next Work

Use `--validate-visual` or the stage-level visual validator as the default
smoke check before any future remediation behavior change that could affect
rendering. Treat visible drift as a blocker unless it is intentionally
accepted.
