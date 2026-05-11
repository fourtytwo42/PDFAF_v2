# All-Input Validation Regression Diagnostic

This diagnostic compares fresh all-input validation runs and optional targeted overlay runs so the next goal checkpoint can focus on repeatability failures instead of treating overlay projections as acceptance evidence.

Current artifact:

- Previous fresh run: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-10-r2`
- Current fresh run: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-11-r3`
- Diagnostic output: `Output/goal-all-input-mean-2026-05-09-r1/fresh-r3-regression-diagnostic-2026-05-11-r1`

Result:

- Mean moved `91.943 -> 91.2023`.
- Points needed for mean `93` moved `371 -> 631`.
- The diagnostic classified `1` runtime-timeout regression, `4` overlay-not-repeated rows, and `40` stable low-debt rows.

Highest-value next targets:

- `0019-0a38740f0b13-long-4516.pdf`: fresh timeout regression from `87/B -> 0/?`.
- `0236-a2bb02152d99-4705-a-survey-of-civil-legal-aid-service-providers-in-illinois.pdf`: targeted route reached `97/A`, but fresh r3 stayed `59/F`.
- `0108-d08027579d0b-4614-an-evaluation-of-transitional-housing-programs-in-illinois-for-victims-o.pdf`: targeted route reached `94/A`, but fresh r3 stayed `59/F`.
- `0316`, `0194`, and `0325`: fresh regressions from A/B routes to `59/F` without overlay proof yet.

Decision:

- Do not mark the all-input goal complete from overlay evidence.
- Do not weaken PAC gates, lower checkpoint floors, or change scoring strictness.
- Next behavior work should start with route-repeatability diagnostics for `0236` and `0108`, plus a separate runtime-tail check for `long-4516`.
