# Stage 35/36 Benchmark Summary

Generated: 2026-04-21

## Checkpoint

- Base implementation checkpoint: `e1ac6d6` (`Stage 35: validate structural mutations with invariants`)
- Follow-up implementation under test:
  - bounded repeated-target heading retries
  - typed structural-benefit payloads
  - route-contract metadata and enforcement
  - Node 22 benchmark helper scripts

## Verification

Passed:

- `python3 -m py_compile python/pdf_analysis_helper.py`
- `npx -y node@22 /usr/bin/pnpm exec tsc --noEmit`
- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/remediation/orchestrator.test.ts tests/remediation/orchestratorStage35.test.ts tests/remediation/planner.test.ts`
- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/scorer.test.ts tests/integration/stage14DeterministicTools.integration.test.ts`

## Targeted Structural Smoke

Run:

- `Output/experiment-corpus-baseline/run-stage35-target4-2026-04-21-r5`

Result:

- `figure-4188`: `27/F -> 55/F`
- `figure-4754`: `54/F -> 58/F`
- `structure-4207`: `48/F -> 58/F`
- `long-4680`: `59/F -> 59/F`

Runtime:

- mean wall remediation: `19055ms`
- median wall remediation: `8779ms`
- p95 wall remediation: `33839ms`

Important finding:

- The initial Stage 35 benchmark attempt exposed an unbounded repeated-target heading retry loop.
- Both protected and non-protected heading retry paths are now guarded against retrying the same `targetRef`.

## Full 50-File Benchmark

Run:

- `Output/experiment-corpus-baseline/run-stage36-full-2026-04-21-r1`

Comparison baseline:

- `Output/experiment-corpus-baseline/run-stage32.5-full-2026-04-20-r1`

Local legal-remediation score:

- baseline mean: `79.50`
- current mean: `74.82`
- baseline median: `86`
- current median: `69`

Grade distribution:

- current: `15 A / 8 B / 4 D / 23 F`

Runtime:

- baseline mean wall remediation: `23091ms`
- current mean wall remediation: `27618ms`
- baseline median wall remediation: `9139ms`
- current median wall remediation: `12191ms`
- baseline p95 wall remediation: `94875ms`
- current p95 wall remediation: `122995ms`

## Acceptance Status

Stage 35 implementation and Stage 36/37 plumbing are code-complete and test-clean, but the full benchmark does **not** meet acceptance yet.

Acceptance failures:

- local mean regressed materially
- local median regressed materially
- p95 runtime regressed materially

Likely cause:

- Stage 35 is now correctly downgrading many formerly optimistic structural mutations to `no_effect`.
- This exposes remaining planner/scorer dependence on unproven mutation success, especially in heading and figure ownership lanes.

Next corrective work:

- tighten route failure proofs so repeated `no_effect` structural tools stop earlier across rounds
- review whether local scoring should distinguish "honest unresolved structural debt" from remediation regression
- keep Stage 36 structural benefits, but only preserve score-regressing stages when benefits are both typed and invariant-backed

## Stage 36.5 Corrective Run

Implementation changes:

- added invariant `targetRef` to mutation details
- suppress repeated invariant-backed `no_effect` signatures across rounds
- tightened route failure proofs for structural routes
- stopped relying on legacy note-only structural-benefit preservation

Targeted run:

- `Output/experiment-corpus-baseline/run-stage36.5-target4-2026-04-21-r1`

Targeted runtime:

- mean wall remediation: `15628ms`
- median wall remediation: `8610ms`
- p95 wall remediation: `24170ms`

Full run:

- `Output/experiment-corpus-baseline/run-stage36.5-full-2026-04-21-r1`

Full-run score:

- mean: `76.80`
- median: `81`
- grades: `17 A / 9 B / 4 D / 20 F`

Full-run runtime:

- mean wall remediation: `26018ms`
- median wall remediation: `10220ms`
- p95 wall remediation: `87568ms`

Acceptance read:

- p95 improved from failed Stage 36 `122995ms` to `87568ms`, better than the Stage 32.5 baseline `94875ms`
- median improved from failed Stage 36 `12191ms` to `10220ms`
- local mean recovered from failed Stage 36 `74.82` to `76.80`
- mean runtime is still above the Stage 32.5 baseline, but the retry suppression achieved the primary p95/no-hang goal without weakening invariant truthfulness

## Stage 37.5 Route Contract Closeout

Implementation changes:

- made route contracts exhaustive for every `RemediationRoute`
- kept route enforcement internal and public API-compatible
- preserved route summaries across multi-round planning merges
- added tests for contract completeness, deterministic stopped-route reporting, route contract rejection before Python mutation, and legacy note-only regression rejection

Verification:

- `python3 -m py_compile python/pdf_analysis_helper.py`
- `npx -y node@22 /usr/bin/pnpm exec tsc --noEmit`
- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/remediation/orchestrator.test.ts tests/remediation/orchestratorStage35.test.ts tests/remediation/planner.test.ts tests/scorer.test.ts tests/integration/stage14DeterministicTools.integration.test.ts`

Targeted run:

- `Output/experiment-corpus-baseline/run-stage37.5-target4-2026-04-21-r2`

Targeted runtime:

- mean wall remediation: `13553ms`
- median wall remediation: `8654ms`
- p95 wall remediation: `21152ms`

Targeted route reporting:

- all 4 rows include `planningSummary.routeSummaries`
- stopped routes include deterministic reasons such as `route_failure_repeated_signature(...)` and `route_failure_no_benefit_prior_round(...)`

Full run:

- `Output/experiment-corpus-baseline/run-stage37.5-full-2026-04-21-r1`

Full-run score:

- mean: `77.80`
- median: `84`
- grades: `17 A / 10 B / 5 D / 18 F`

Full-run runtime:

- mean wall remediation: `24884ms`
- median wall remediation: `10479ms`
- p95 wall remediation: `81658ms`
- max wall remediation: `230244ms`

Comparison to Stage 36.5:

- mean score improved `76.80 -> 77.80`
- median score improved `81 -> 84`
- p95 runtime improved `87568ms -> 81658ms`
- total tool attempts dropped `976 -> 934`
- route summaries are now present on all 50 benchmark rows

Residual caveat:

- `create_heading_from_candidate/no_effect` rose `39 -> 49`, even though total tool attempts and p95 improved.
- `repair_structure_conformance/no_effect` dropped `68 -> 49`.
- This should feed Stage 38 failure-profile deepening rather than weakening Stage 35/36 structural truthfulness.
