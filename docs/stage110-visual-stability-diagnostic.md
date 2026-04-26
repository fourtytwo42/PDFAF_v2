# Stage 110 Visual Stability Diagnostic

Date: 2026-04-26

Stage 110 stayed diagnostic-first. It did not change remediation routing,
scoring, or render behavior.

## Decision

Keep the existing reusable before/after visual stability validator. The new
focused page-2 diagnostic confirms the visible drift on `edge-4661`, so no
remediation behavior change was justified in this pass.

## Evidence

- Focused page-2 comparison:
  - `Output/from_sibling_pdfaf_edgecase_corpus/stage110-visual-stability-page2-2026-04-26-r1`
- Prior run-level validation:
  - `Output/from_sibling_pdfaf_edgecase_corpus/stage109-visual-stability-run-2026-04-26-r1`

The focused comparison compared `edge-4661` page 2 before and after
remediation. The page stayed the same dimensions but drifted visibly:

- page 2: `39,528 / 455,424` different pixels
- mean absolute channel delta: `7.611178`
- max channel delta: `255`

The earlier run-level report still showed `edge-4660` stable and `edge-4661`
drifting, so the candidate remains a visual-drift blocker rather than an
acceptance-ready remediation rule.

## Next Work

Keep the visual comparison path in the loop for future remediation changes and
reject any candidate that introduces unexplained pixel drift. If a follow-up
stage targets this family, it needs a narrower safe rule or a better causal
diagnostic before any behavior change is accepted.
