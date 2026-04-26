# Stage 106 Font Visual Stability Diagnostic

Date: 2026-04-26

Stage 106 stayed diagnostic-first. It did not change remediation routing,
scoring, or gate behavior.

## Decision

Keep the reusable visual stability validator as the smoke check for future
PDF mutation work. No behavior change was justified in this pass.

## Evidence

- Remediation benchmark run:
  - `Output/experiment-corpus-baseline/run-stage106-font-visual-r1`
- Run-level visual stability report:
  - `Output/experiment-corpus-baseline/stage106-font-visual-stability-run-validation-2026-04-26-r1`

The sampled legacy font-extractability row `font-4172` remediated from
`59/F` to `84/B`, and the run-level comparison stayed visually stable:

- rows compared: `1/1`
- stable rows: `1`
- drift rows: `0`
- missing rows: `0`
- worst row: `font-4172`
- worst page drift: `0 / 455424` different pixels

## Next Work

Use the run-level visual stability validator before any future remediation
behavior change that could affect rendering. If a later stage targets font,
figure, table, or heading behavior, keep pixel drift a blocker unless it is
explicitly accepted.
