# All-Unique Timeout Trace and Runner Grace

Date: 2026-05-22

## Decision

Decision: `bounded_runner_grace_fix_accepted_for_validation_paths`.

This stage fixes the bounded validation wrapper, not the scorer, planner, remediation mutators, PAC gates, API, or Docker behavior. The fresh all-unique run still does not pass the active goal, but the timeout trace showed the wrapper was killing some rows at the same wall-clock boundary where the engine could otherwise return an honest verified checkpoint.

The accepted source change is limited to `scripts/bounded-holdout-validation.ts`:

- `--per-pdf-timeout-ms` now sets the child process `PDFAF_REMEDIATION_PDF_TIMEOUT_MS`.
- the external process kill waits an additional `--external-timeout-grace-ms`, default `10000ms`;
- reports record child remediation timeout, external grace, and external kill timeout.

This preserves failure visibility. Rows that still time out internally remain timeout/error rows and count as zero in all-row means.

## Artifacts

Generated artifacts stay local:

- Focused six-row trace: `/mnt/pdf-review/pdfaf-validation/allunique-timeout-trace-current-2026-05-22-r1`
- Wrapper smoke: `/mnt/pdf-review/pdfaf-validation/bounded-runner-grace-smoke-2026-05-22-r1`
- Prior failing all-unique validation: `/mnt/pdf-review/pdfaf-validation/allunique-current-bounded-full-2026-05-22-r1`

## Timeout Trace Results

The focused trace re-ran the six timeout rows from the current all-unique validation with deterministic `--no-semantic --no-pdfs` settings and runtime trace output.

| Row | Focused result | Runtime | Classification |
| --- | ---: | ---: | --- |
| `0019/long-4516` | `43/F -> 59/F` | `240518ms` | verified low-score checkpoint returned |
| `0028/structure-4076` | `50/F -> 68/D` | `229456ms` | verified low-score checkpoint returned |
| `0031/structure-4438` | `25/F -> 0/?` | `300016ms` | true Python/remediation timeout |
| `0097/4694` | `42/F -> 59/F` | `197234ms` | verified low-score checkpoint returned |
| `0120/4690` | `54/F -> 0/?` | `300003ms` | true timeout/error return |
| `0135/4453` | `55/F -> 0/?` | `300002ms` | true timeout/error return |

The broad all-unique bounded run had no child row artifacts for the recoverable rows because its external timeout was exactly `300000ms`, matching the child remediation timeout. The focused run allowed a `310000ms` external guard and recovered honest artifacts for three rows.

## Wrapper Smoke

The patched bounded wrapper was smoke-tested on `0019/long-4516`:

- Artifact: `/mnt/pdf-review/pdfaf-validation/bounded-runner-grace-smoke-2026-05-22-r1/baseline_report.json`
- Child remediation timeout: `300000ms`
- External grace: `10000ms`
- External kill timeout: `310000ms`
- Result: `43/F -> 85/B`
- Runtime: `259687ms`
- `false_positive_applied=0`
- Early exit: `verified_checkpoint_timeout_return`

This proves the wrapper can now capture a verified engine return instead of converting it into an external-kill zero.

## Interpretation

This does not close the all-unique goal. It removes a validation-runner artifact and gives future full runs a fair chance to count verified checkpoint states.

Projected arithmetic from the focused trace is useful for planning only:

- prior all-unique current run needed `392` raw points for mean `93`;
- replacing the three avoidable external-kill zeroes with the weaker focused trace scores would add `+186` raw points;
- the run would still need about `206` raw points, so real engine/runtime remediation work remains.

The true timeout family is now clearer:

- `0031/structure-4438`: repeated Python bridge analysis timeouts;
- `0120/4690`: timeout/error after low-score verified state existed but was not returnable as final score;
- `0135/4453`: pdf.js abort plus Python no-output timeout.

## Validation

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/scripts/boundedHoldoutValidation.test.ts`
- `npx -y node@22 /usr/bin/pnpm exec tsc --noEmit --pretty false`
- One-row wrapper smoke on `0019/long-4516`, deterministic, `--no-semantic --no-pdfs`, `false_positive_applied=0`

## Next Direction

Use the patched bounded runner for the next all-unique validation attempt. If the all-unique mean still misses, prioritize general runtime/analyzer recovery for `0031`, `0120`, and `0135`, then return to non-timeout structural tails.

Do not describe this stage as a remediation quality gain. It is a validation honesty and runtime-boundary fix.
