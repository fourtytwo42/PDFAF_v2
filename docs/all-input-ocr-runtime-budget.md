# All-Input OCR Runtime Budget Checkpoint

This checkpoint addresses fresh all-input hard timeouts caused by `ocr_scanned_pdf` consuming nearly the full 5-minute remediation wall budget.

## Decision

- Keep the per-PDF remediation wall at `300000ms`.
- Keep check-only analysis at the existing fast budget.
- Do not change PAC scoring, PAC gates, planner breadth, AI behavior, or repair acceptance policy.
- Bound the OCR mutation subprocess by the remaining per-PDF wall budget, reserving one remediation analysis budget plus buffer for finalization.
- If OCR exhausts that budget, return the current analyzed state with bounded-work reasons instead of continuing into a hard per-PDF timeout.
- In `baseline-corpus-batch.ts`, do not start the optional second deterministic remediation pass unless enough wall budget remains for another remediation analysis plus buffer.

This is an honesty/runtime fix: low-quality OCR rows stay low-quality rather than being promoted, but they no longer become operational failures solely because OCR or a second pass ran into the wall.

## Validation

Targeted validation:

- Output: `Output/goal-all-input-mean-2026-05-09-r1/run-ocr-budget-target-2026-05-10-r2`
- Command shape: `baseline-corpus-batch.ts --no-semantic --no-pdfs`
- Rows:
  - `0209`: `10/F -> 51/F`, no hard timeout.
  - `0218`: `10/F -> 92/A`, no hard timeout.
  - `0219`: `10/F -> 95/A`, successful OCR control preserved.

Regression checks:

- `python3 -m py_compile python/pdf_analysis_helper.py`
- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/remediation/orchestrator.test.ts tests/remediation/pacRuleAcceptanceGate.test.ts tests/remediation/planner.test.ts tests/services/pacRuleEvidence.test.ts tests/scorer.test.ts`
- `npx -y node@22 /usr/bin/pnpm lint`

All checks passed.

## Follow-Up

Run a broader timeout-focused shard before another full all-input validation. The next subset should include the remaining fresh hard-timeout rows plus OCR controls:

- timeout rows: `0114`, `0170`, `0212`, `0218`, `0221`, `0222`, `0287`, `0296`, `long-4683`, `4215`, `structure-4438`
- controls: successful OCR rows such as `0204`, `0219`, `0220`

Acceptance for the next checkpoint is fewer hard timeouts, no `false_positive_applied`, and preserved A-grade OCR controls.

## Resource Note

An attempted broader timeout shard at `Output/goal-all-input-mean-2026-05-09-r1/run-timeout-broader-2026-05-10-r1` was stopped before completion because OCR mutation timeouts left `ocrmypdf`/Tesseract/Ghostscript children running after the Python parent was killed. The Python mutation bridge now starts mutation workers in their own process group and kills the full group on timeout or abort. Retry broader OCR/runtime shards only after confirming no orphan OCR children remain.
