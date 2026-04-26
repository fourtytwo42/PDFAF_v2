# Stage 101 Visual Stability Diagnostic

Stage 101 is diagnostic-only. It does not change remediation routing,
scoring, or gate behavior.

## Decision

Keep the new reusable before/after render comparison utility. No remediation
behavior change was required in this pass.

## Evidence

- New comparison helper:
  - `src/services/benchmark/visualStability.ts`
- New diagnostic script:
  - `scripts/stage101-visual-stability-diagnostic.ts`
- Sample remediation run:
  - `Output/experiment-corpus-baseline/stage101-visual-stability-sample-2026-04-26-r1`
- Visual comparison report:
  - `Output/experiment-corpus-baseline/stage101-visual-stability-diagnostic-2026-04-26-r1`

The sample compared `Input/experiment-corpus/00-fixtures/pdfaf_fixture_inaccessible.pdf`
to the remediated output PDF for `fixture-inaccessible` on pages 1 and 2.
Both pages rendered at the same dimensions and produced zero pixel drift:

- page 1: `0 / 416256` different pixels
- page 2: `0 / 416256` different pixels

## Next Work

Use the new visual comparison helper as the default smoke check before any
future remediation behavior change that could affect rendered output. If a
candidate changes pixels, treat that as a blocker until the drift is explained
and accepted intentionally.
