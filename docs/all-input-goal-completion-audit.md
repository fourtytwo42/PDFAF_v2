# All-Input Goal Completion Audit

Date: 2026-05-12

Objective: across the roughly `300` PDFs under `Input`, raise the overall remediated mean above `93` while keeping runtime bounded and repairs honest, using PAC/POC evidence as a reference, preserving `false_positive_applied = 0`, and avoiding weakened strictness, hidden failures, broad planner behavior, or timeout default increases.

## Checklist

| Requirement | Evidence | Status |
| --- | --- | --- |
| Inventory covers the all-input corpus | `Output/goal-all-input-mean-2026-05-09-r1/unique-input-manifest.json` dedupes `351` unique PDFs. | Covered |
| Current measured all-input source checkpoint | `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-diagnostic-2026-05-12-r18-cachekey-affected-merged-r1/all-input-mean-diagnostic.md` reports mean `92.5442` over `351` PDFs. | Below target |
| Mean above `93` | `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-r18-virtual-merged-diagnostic-2026-05-12-r1/all-input-mean-diagnostic.md` reports virtual overlay mean `93.0114`, but the counted-row repeat `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-r18-counted-repeat-2026-05-12-r1/repeat-source-reanalysis-summary.md` projects only `92.783476`. | Not complete |
| Candidate outputs are checked by current source scoring | `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-r18-source-overlay-2026-05-12-r2-remediation-budget/api-semantic-r18-source-overlay.md` reanalyzes API-produced PDFs with `45000ms` remediation analysis budget. | Covered for counted candidates |
| `false_positive_applied = 0` | r18 measured checkpoint reports `false_positive_applied=0`; counted overlay candidates are source-reanalyzed PDFs, but not a fresh all-input benchmark run. | Partially covered |
| Runtime remains bounded | r18 measured checkpoint reports p95/max `245745ms / 300008ms`; virtual overlay inherits r18 runtime and does not prove a fresh API end-to-end runtime profile. | Partially covered |
| PAC/POC strictness is not lowered | No PAC scoring, PAC gate, planner, timeout, or repair-tool changes were made for the API overlay checkpoint. | Covered |
| Repairs are honest, not hidden failures | Rows `0181` and `0287` were excluded because source reanalysis did not improve the current r18 rows. | Covered for candidate overlay |
| Completion is not based on proxy signal alone | The overlay is documented as planning evidence only, not a fresh validation. | Not complete |

## Decision

The active goal is not complete yet. The current strongest evidence is that source-reanalyzed API outputs can provide enough honest movement to project the all-input mean to `93.0114`, but this is still a virtual overlay and the first counted-row repeat did not reproduce it. A completion claim needs either:

- a fresh all-input validation path that produces those outputs under controlled runtime and confirms `false_positive_applied = 0`; or
- an explicit acceptance decision that the virtual source-reanalyzed overlay is an acceptable completion artifact.

Until then, continue with controlled validation rather than more broad remediation changes.
