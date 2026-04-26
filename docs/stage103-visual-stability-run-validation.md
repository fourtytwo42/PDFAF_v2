# Stage 103 Visual Stability Run Validation

Stage 103 is diagnostic-only. It does not change remediation routing, scoring,
or gate behavior.

## Decision

Keep the reusable run-level visual stability validator. The comparison path is
now shared, and benchmark runs can be checked against their source PDFs across
all pages with a strict drift fail mode.

## Evidence

- Shared visual comparison helper:
  - `src/services/benchmark/visualStability.ts`
- Run-level validator:
  - `scripts/stage103-visual-stability-run.ts`
- Stage 101 helper refactor to reuse the shared comparison helper:
  - `scripts/stage101-visual-stability-diagnostic.ts`
- Validation artifact:
  - `Output/experiment-corpus-baseline/stage103-visual-stability-run-2026-04-26-r1`
- Refactor smoke check:
  - `Output/experiment-corpus-baseline/stage103-visual-stability-stage101-check-2026-04-26-r1`

The validated benchmark sample compared `fixture-inaccessible` against its
remediated PDF output across all 30 pages. The run stayed visually stable:

- rows compared: `1/1`
- stable rows: `1`
- drift rows: `0`
- missing rows: `0`
- worst row: `fixture-inaccessible`
- worst page: `1`
- page drift: `0 / 416256` different pixels on the worst page

## Next Work

Use the run-level validator as the default smoke check for any future
remediation behavior change that writes PDFs. Keep visible drift a blocker
unless it is intentionally accepted.
