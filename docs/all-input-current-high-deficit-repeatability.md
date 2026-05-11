# All-Input Current High-Deficit Repeatability

Checkpoint date: 2026-05-11

This checkpoint follows fresh all-input validation r3:

- Run: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-11-r3`
- Measured mean: `91.2023`
- Rows processed: `351`
- `false_positive_applied`: `0`
- Points still needed for mean `93`: `631`

## Focused Current-Code Run

Run:

- `Output/goal-all-input-mean-2026-05-09-r1/run-current-code-high-deficit-2026-05-11-r1`

Purpose:

- Recheck high-deficit rows after the reading-shell PAC recovery and branch-order fixes.
- Keep validation deterministic with `--no-semantic --no-pdfs`.
- Use the result for target selection only, not as completion proof.

Key result:

- `21` rows processed.
- `false_positive_applied = 0`.
- Strong current-code recoveries:
  - `long-4516`: `0/?` in fresh r3, `85/B` in focused run.
  - `0316 / 4553`: `59/F` in fresh r3, `97/A` in focused run.
  - `0325 / 4693`: `59/F` in fresh r3, `98/A` in focused run.
  - `0216 / 4767`: `79/C` in fresh r3, `92/A` or better in focused repeat.
- Volatile or still blocked:
  - `4567` reached `92/A` with non-prefixed input but only `61/D` in the prefixed repeat.
  - `4503` and `4587` hard-timed out in the focused run.
  - `0108`, `0184`, `0194`, `0200`, `0236`, `4722`, and related table/alt rows did not move materially.

## Prefixed Repeat

Run:

- `Output/goal-all-input-mean-2026-05-09-r1/run-current-recoveries-prefixed-2026-05-11-r1`

Rows:

- `0019-...long-4516.pdf`
- `0316-...4553...pdf`
- `0325-...4693...pdf`
- `0086-...4567...pdf`
- `0216-...4767...pdf`

Result:

| Row | Fresh r3 | Prefixed repeat | Decision |
| --- | ---: | ---: | --- |
| `long-4516` | `0/?` | `85/B` | current-code runtime/route recovery candidate |
| `0316 / 4553` | `59/F` | `97/A` | current-code route recovery candidate |
| `0325 / 4693` | `59/F` | `98/A` | current-code route recovery candidate |
| `0216 / 4767` | `79/C` | `95/A` | recovered control candidate |
| `4567` | `75/C` | `61/D` | route volatility, do not promote |

All prefixed-repeat rows had `false_positive_applied = 0`.

## Projection

Overlay:

- `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-reading-shell-plus-prefixed-recoveries-2026-05-11-r1`

This overlays:

- reading-shell cluster r2,
- current prefixed recovery repeat,
- alt-candidate repeat.

Projection from fresh r3:

- Mean: `91.2023 -> 92.3390`
- Rows below `93`: `58 -> 47`
- Points still needed for mean `93`: `631 -> 232`
- p95: `245314ms -> 244940ms`
- Overlay `false_positive_applied`: `0`

This is planning evidence only. It is not a fresh all-input completion proof.

## Route Classifications

Current-vs-r3 route diagnostics:

- `0316 / 4553`: `upstream_route_volatility`
  - Good route applies `create_heading_from_candidate` and parent-link cleanup from a different state.
  - No same-state guard is justified.
- `0325 / 4693`: `no_safe_route_proof`
  - Current route reaches A-grade, but the diagnostic does not expose a narrow same-state recovery target.
- `long-4516`: `missing_score_moving_tool`
  - Fresh r3 timed out before tool evidence; current focused run reaches `85/B`.
  - Treat as runtime/route admission work, not PAC policy.

## Decision

Do not run another full all-input validation yet. Even with current recovered rows overlaid, the projected mean is only `92.3390`.

Do not add route guards for `0316`, `0325`, or `4567` from this checkpoint:

- `0316` is upstream route volatility.
- `0325` lacks a safe route proof.
- `4567` failed the prefixed repeat.

Next useful branch:

- Diagnose remaining high-deficit rows that still account for the last `232` projected points:
  - heading/reading: `4215`, `0108`, `0181`, `0184`, `0194`, `0208`, `4139`
  - alt/table-alt: `0136`, `0200`, `0236`, `4453`, `4690`, `4105`, `4678`
  - table: `4587`, `4722`, `4694`, `4147`, `4735`, `0287`, `4057`
- Prefer object/proposal diagnostics or targeted semantic smoke over another overlay-only full run.
- Keep `structure-4438` parked unless a real eligible high-quality checkpoint appears.

## Semantic Smoke

The local API listener was up, but `/v1/health` reported `llm.configured=false`. A temporary text-only `llama-server` was started on `127.0.0.1:1234` using the local `gemma-4-E2B-it-Q4_K_M.gguf`; the multimodal projector failed to load, so visual/figure AI was not used.

Smoke target:

- `0108 / 4614-an-evaluation-of-transitional-housing-programs...`

Runs:

- `Output/goal-all-input-mean-2026-05-09-r1/semantic-smoke-0108-2026-05-11-r1`
- `Output/goal-all-input-mean-2026-05-09-r1/semantic-smoke-0108-2026-05-11-r2`

Result:

- Text-only semantic passes found no heading/promote candidates.
- `0108` remained `59/F`.
- The first smoke exposed that `scripts/run-remediate-one.ts` could keep an unsafe post-alt cleanup and drop `59/F -> 51/F`, even though batch/API paths already guard this.
- `scripts/run-remediate-one.ts` now uses `shouldKeepPostRemediationAltRepair(...)`; rerun `r2` kept `59/F` and did not accept the regressing cleanup.

Validation:

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/remediation/altStructureRepair.test.ts tests/remediation/pacRuleAcceptanceGate.test.ts`
- `npx -y node@22 /usr/bin/pnpm lint`

The temporary `llama-server` was stopped after the smoke. This did not add score movement, but it keeps future semantic probes honest.
