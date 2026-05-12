# All-Input API Repeatability Diagnostic

Date: 2026-05-12

This diagnostic summarizes the API/source candidate probes used after the r18 all-input checkpoint. It is diagnostic-only: it does not change scoring, PAC gates, timeout defaults, planner behavior, or repair tools.

## Artifacts

- Script: `scripts/all-input-api-repeatability-diagnostic.ts`
- Test: `tests/benchmark/allInputApiRepeatabilityDiagnostic.test.ts`
- Local diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/api-repeatability-diagnostic-2026-05-12-r1/api-repeatability-diagnostic.md`
- Baseline checkpoint: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-diagnostic-2026-05-12-r18-cachekey-affected-merged-r1/all-input-mean-diagnostic.md`

## Findings

The diagnostic compares repeated API outputs and current-source reanalysis summaries for candidate rows. It distinguishes API headline-only improvements from source-counted improvements.

Conservative conclusions:

- The original `93.0114` overlay remains a one-off planning checkpoint, not completion evidence.
- Repeat-supported gains are still below the active mean target.
- API headline scores cannot be counted unless source reanalysis also improves.
- Several high-value rows are route/analyzer volatile rather than same-state behavior candidates.

Important row decisions:

| Row | Decision |
| --- | --- |
| `0033` | Useful repeated source reanalysis exists, but one repeat summary was outside the per-run directory shape; keep as manually verified repeat-supported evidence from earlier overlay docs. |
| `0114` | Repeated source-counted gain exists, but route details are volatile; count only in conservative overlay, do not patch from this diagnostic. |
| `0136` | Small repeated source-counted gain (`+5`), not enough to drive behavior. |
| `0296` | Repeated source-counted gain, but lower than first observed; keep conservative gain only. |
| `0120` | Volatile; repeat-supported floor is only `+5`, not the first observed `+26`. |
| `0135` | Repeat-supported `+10`. |
| `0076` | Repeat-supported `+25`; useful table-shape gain already present in API/source route. |
| `0108` | High route can recur but also fails; route stabilization may be useful, but the gain is only `+12`. |
| `0020 / long-4683` | One high source reanalysis (`+30`) exists, but subsequent repeats failed and API/source scores disagree in the high artifact. Treat as analyzer/route volatility, not a safe guard yet. |
| `0075`, `0208`, `0223`, `0137` | One-off high/source gains did not repeat; do not count toward completion. |
| `0091`, `0127`, `0092`, `0071`, `0073`, `0061` | API headline scores may look high, but source reanalysis does not improve the r18 rows. |

## Decision

The next work should not be more broad API probing. The highest-value branch is a targeted route/analyzer repeatability stage for volatile rows, especially `0075`, `0208`, `0108`, and `0020/long-4683`.

Behavior remains blocked unless a diagnostic proves one of these narrow safe shapes:

- same replay state, same tool, high run applies and low run rejects solely for a recoverable reason;
- final source reanalysis is stable across repeats;
- PAC/page/text/tag evidence remains safe;
- `false_positive_applied` remains `0`.

Until that exists, the active all-input goal remains open.

## Analyzer Signature Follow-Up

The volatile rows were checked with a deeper source-analysis signature diagnostic:

- Local output: `Output/goal-all-input-mean-2026-05-09-r1/analyzer-signature-api-volatile-2026-05-12-r1/analyzer-signature-diagnostic.md`

Result:

| Row | Classification | Notes |
| --- | --- | --- |
| `0075` | `python_structure_variance` | pdf.js signature stable; Python structure signature changes while score stays `52/F`. |
| `0208` | `python_structure_variance` | pdf.js signature stable; Python structure and detection signatures change. |
| `0108` | `python_structure_variance` | pdf.js signature stable; scores swing `59/F, 45/F, 45/F`. |
| `0020 / long-4683` | `python_structure_variance` | pdf.js signature stable; scores swing `59/F, 59/F, 48/F`. |

Decision: the remaining high-value volatility is extractor-level, not a safe same-state remediation guard. The next behavior-capable stage should be a Python structural-analysis stabilization design, with quality-preserving object identity checks. Do not add row-level mutator suppression or PAC exceptions from these API route artifacts.
