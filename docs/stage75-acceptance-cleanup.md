# Stage 75 Acceptance Cleanup

Date: 2026-04-25

Stage 75 local font substitution was tightened after the first full run showed broad post-pass reach. The cleanup keeps the feature enabled for concrete font-risk rows while rejecting high-score or score-neutral local font rewrites that can add runtime and reanalysis churn.

## Implemented Cleanup

- `shouldTryLocalFontSubstitution` now receives current analysis evidence from the orchestrator.
- The gate requires native extractable text, a risky repairable font, text-extractability font risk evidence, and either score below 98 or materially limiting text extractability.
- `embed_local_font_substitutes` post-pass acceptance now rejects score loss and score-neutral mutations, while preserving page count, text count, tagged structure, and font evidence checks.
- Focused tests were expanded for high-score skip and text-extractability evidence requirements.

## Validation

- Focused tests passed:
  - `tests/remediation/fontEmbed.test.ts`
  - `tests/integration/embedLocalFontSubstitutes.integration.test.ts`
  - `tests/integration/embedUrwType1Substitutes.integration.test.ts`
  - `tests/scorer.test.ts`
  - `tests/remediation/planner.test.ts`
- `pnpm build` passed with the existing local Node engine warning.
- Protected target run `Output/experiment-corpus-baseline/run-stage75-cleanup-score-benefit-target-2026-04-25-r1` preserved the intended font gains:
  - `font-4156`: `88/B`
  - `font-4172`: `94/A`
  - `font-4699`: `91/A`
- Edge smoke passed:
  - `Output/from_sibling_pdfaf_v1_edge_mix/run-stage75-cleanup-edge-smoke-2026-04-25-r1`
  - `Output/from_sibling_pdfaf_v1_edge_mix_2/run-stage75-cleanup-edge-smoke-2026-04-25-r1`

## Acceptance Result

Best cleanup full run: `Output/experiment-corpus-baseline/run-stage75-cleanup-full-2026-04-25-r3`

- Mean `91.54`, median `96`
- Grades `34 A / 8 B / 3 C / 2 D / 3 F`
- Attempts `850`
- False-positive applied `0`
- Local font rows reduced to score-improving accepted mutations plus rejected non-beneficial attempts; accepted local font rows are no longer the main gate failure source.

Formal gate `Output/experiment-corpus-baseline/stage75-cleanup-benchmark-gate-2026-04-25-r3` still fails:

- `protected_file_regressions`
- `runtime_p95_wall`

The remaining failures classify as parked structural/runtime volatility rather than Stage 75 local-font regression. Dominant rows include `long-4683`, `long-4516`, `structure-4076`, `structure-4207`, and `fixture-teams-remediated`.

## Decision

Stage 75 font-substitution cleanup is implemented and validated, but the branch is not hard-gate acceptance-clean. The next acceptance work should be a dedicated protected-volatility/runtime-tail project, not further broadening or rollback of local font substitution.
