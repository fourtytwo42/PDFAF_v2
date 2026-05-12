# All-Input API Semantic r18 Overlay Checkpoint

Date: 2026-05-12

This checkpoint measures API-produced remediated PDFs against the current source analyzer using the remediation analysis budget. It is planning evidence only: it does not replace a fresh all-input validation run and does not complete the active mean goal by itself.

## Artifacts

- Baseline checkpoint: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-diagnostic-2026-05-12-r18-cachekey-affected-merged-r1/all-input-mean-diagnostic.md`
- API/source overlay: `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-r18-source-overlay-2026-05-12-r2-remediation-budget/api-semantic-r18-source-overlay.md`
- Overlay JSON: `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-r18-source-overlay-2026-05-12-r2-remediation-budget/api-semantic-r18-source-overlay.json`
- Virtual 351-row report root: `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-r18-virtual-merged-report-2026-05-12-r1/`
- Virtual mean diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-r18-virtual-merged-diagnostic-2026-05-12-r1/all-input-mean-diagnostic.md`
- API candidate output roots:
  - `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-r18-0033-2026-05-12-r1/`
  - `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-r18-candidate-batch-2026-05-12-r1/`
  - `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-r18-candidate-batch-2026-05-12-r2/`
  - `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-r18-candidate-0287-2026-05-12-r1/`

## Result

- Baseline rows: `351`
- Baseline mean: `92.5442`
- Points needed for mean `93`: `160`
- Source reanalysis timeout: `45000ms`
- Counted source-reanalyzed gain: `164`
- Projected overlay mean: `93.011396`
- Existing diagnostic virtual mean: `93.0114`
- Crosses mean `93`: yes

Counted rows:

| Row | Current r18 | Source reanalysis | Gain |
| --- | ---: | ---: | ---: |
| `0033 / v1-4655` | `59/F` | `91/A` | `32` |
| `0075 / v1-4487` | `59/F` | `93/A` | `34` |
| `0114` | `59/F` | `91/A` | `32` |
| `0208` | `59/F` | `87/B` | `28` |
| `0136 / v1-4503` | `59/F` | `64/D` | `5` |
| `0296 / ad762d4a` | `73/C` | `94/A` | `21` |
| `0108 / v1-4614` | `79/C` | `91/A` | `12` |

Excluded rows:

| Row | Current r18 | Source reanalysis | Reason |
| --- | ---: | ---: | --- |
| `0181 / v1-4519` | `69/D` | `59/F` | Source reanalysis did not improve the current row. |
| `0287` | `69/D` | `69/D` | API headline reached `92/A`, but source reanalysis did not improve the current row. |

## Decision

The overlay proves that the current engine plus API semantic route has enough source-reanalyzed candidate movement to cross the mean target, while preserving the existing strict-grader posture. The virtual 351-row report replaces only the counted rows and lets the existing all-input mean diagnostic reproduce the `93.0114` projection. It is not sufficient to close the goal because the result has not been validated as a fresh all-input run or a reproducible controlled shard plan.

The next checkpoint should validate the counted API-produced PDFs in a controlled way that avoids overloading the VM:

- keep API/LLM requests sequential or very low concurrency;
- reanalyze all returned PDFs with the remediation analysis budget;
- exclude candidates that do not improve under source reanalysis;
- preserve `false_positive_applied = 0`;
- keep generated PDFs and API JSON under `Output/` only.

Do not mark the long-running goal complete until an audit maps the all-input objective to concrete evidence and confirms the current validation path covers it.

## Repeatability Check

A sequential rerun of the seven counted API rows did not reproduce the crossing overlay:

- Repeat output: `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-r18-counted-repeat-2026-05-12-r1/repeat-source-reanalysis-summary.md`
- Counted repeat gain: `84`
- Projected repeat mean: `92.783476`
- Crosses mean `93`: no

Repeat results:

| Row | Current r18 | Repeat API | Repeat source reanalysis | Repeat gain |
| --- | ---: | ---: | ---: | ---: |
| `0033` | `59/F` | `97/A` | `91/A` | `32` |
| `0075` | `59/F` | `59/F` | `59/F` | `0` |
| `0114` | `59/F` | `96/A` | `91/A` | `32` |
| `0208` | `59/F` | `59/F` | `59/F` | `0` |
| `0136` | `59/F` | `64/D` | `64/D` | `5` |
| `0296` | `73/C` | `91/A` | `88/B` | `15` |
| `0108` | `79/C` | `54/F` | `59/F` | `0` |

Decision: `0033`, `0114`, `0136`, and `0296` have repeat evidence worth preserving; `0075`, `0208`, and `0108` are not completion evidence because their high routes did not repeat. The next recovery work should target route/analyzer repeatability or find additional stable source-reanalyzed candidates worth at least `76` points over the r18 baseline.

## Additional Candidate Discovery

Follow-up API/source probes looked for repeat-stable replacement gains:

- r3 output: `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-r18-candidate-batch-2026-05-12-r3/source-reanalysis-summary.md`
- r4 output: `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-r18-candidate-batch-2026-05-12-r4/source-reanalysis-summary.md`
- new-candidate repeat: `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-r18-new-candidates-repeat-2026-05-12-r1/repeat-source-reanalysis-summary.md`
- r5 output: `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-r18-candidate-batch-2026-05-12-r5/source-reanalysis-summary.md`
- r6 output: `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-r18-candidate-batch-2026-05-12-r6/source-reanalysis-summary.md`

Best observed source-reanalyzed outputs are enough to cross the mean target, but the repeat-supported subset is not. Conservative repeat-supported gains are:

| Row | Repeat-supported gain | Notes |
| --- | ---: | --- |
| `0033` | `32` | Repeated at `91/A`. |
| `0114` | `32` | Repeated at `91/A`. |
| `0136` | `5` | Repeated at `64/D`. |
| `0296` | `15` | Repeat produced `88/B`, lower than the first `94/A` source reanalysis. |
| `0120` | `5` | Repeat produced `69/D`, lower than the first `90/A` source reanalysis. |
| `0135` | `10` | Repeated at `69/D`. |
| `0076` | `25` | Repeated at `94/A`. |

Total repeat-supported gain: `124`, projected mean `92.897436`.

Volatile/non-counted rows from these probes include `0075`, `0208`, `0108`, `0223`, `0137`, and `0020/long-4683`; they produced useful one-off routes but failed repeat or source reanalysis. Treat them as route/analyzer volatility evidence, not accepted completion rows.

## Later Probe Result

Additional volatile/near-pass probing did not close the repeat-supported gap:

- volatile repeat: `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-r18-volatile-repeat-2026-05-12-r1/repeat-source-reanalysis-summary.md`
- near-pass batch: `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-r18-near-pass-batch-2026-05-12-r1/source-reanalysis-summary.md`

The volatile repeat recovered `0108` again at `91/A` (`+12`), but `0075`, `0208`, and `0020/long-4683` did not recover. Near-pass candidates `0092`, `0071`, `0073`, and `0061` had high API headline scores in some cases, but current-source reanalysis did not improve any of them.

Conservative decision: do not count API headline-only gains, and do not count one-off volatile high routes as completion evidence. The remaining gap is no longer a candidate-discovery problem; it needs a targeted route/analyzer repeatability stage for high-value volatile rows such as `0075`, `0208`, `0108`, and `0020/long-4683`.
