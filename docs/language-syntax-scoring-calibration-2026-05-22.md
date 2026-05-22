# Language Syntax Scoring Calibration

Date: 2026-05-22

## Decision

Decision: `provisional_direct_language_syntax_scoring_hardening`.

This is a native PAC/POC alignment change for explicit language syntax evidence. It does not change remediation routing, mutation behavior, PAC gates, Docker/API dependencies, benchmark behavior, or any non-native runtime dependency.

## Source Change

Two direct language syntax rules are now score-active at the baseline PAC cap (`89`):

- `pdfua.language.document_lang_syntax_valid`
- `pdfua.language.structure_lang_valid`

`pdfua.language.document_lang_syntax_valid` now has `verified` confidence because the rule checks the explicit effective document language string already present in the snapshot.

The following language-of-parts rules remain diagnostic because inherited language context and text-object context are not complete enough for score-active promotion:

- `pdfua.language.text_object_lang_valid`
- `pdfua.language.alt_text_lang_valid`
- `pdfua.language.actual_text_lang_valid`
- `pdfua.language.annotation_contents_lang_valid`
- `pdfua.language.form_tu_lang_valid`
- `pdfua.language.outline_lang_valid`

No scorer cap was relaxed and no PAC failure is hidden. This can only hold scores down when explicit malformed language syntax is present.

Changed source paths:

- `src/services/compliance/pacRuleEvidence.ts`
- `src/services/scorer/finalizeEvidence.ts`
- `scripts/language-parts-parity-diagnostic.ts`
- focused tests under `tests/services`, `tests/scripts`, and `tests/scorer.test.ts`

## Evidence

POC/PAC reference notes already identify natural-language validation as a broader checker family than the original PDFAF category score:

- `docs/poc-decompiled-checker-map.md`
- `docs/poc-checker-alignment-plan.md`
- `scripts/pac-review-gap-diagnostic.ts`

The prior language-parts diagnostic found no malformed language syntax in its 16-row sample, so it correctly did not justify broad language-of-parts behavior. This change is narrower: it only makes explicit malformed `/Lang` syntax score-active when native evidence is direct.

### 16-Row Language Sample

Local rerun:

- `/mnt/pdf-review/pdfaf-language-diagnostics/language-syntax-scoring-calibration-2026-05-22-r1/language-parts-parity.md`

Result:

- `document_language_score_active`: `5`
- `language_parts_score_active`: `0`
- `document_language_syntax_scoring_gap`: `0`
- `explicit_structure_lang_scoring_candidate`: `0`
- `language_parts_heuristic_evidence`: `0`
- `language_parts_control_noise`: `0`
- `no_language_parts_debt`: `11`
- `analysis_error`: `0`

No malformed document-language or structure-language syntax triggered in this focused sample, and controls stayed clean for this lane.

### Original-50 Analyze-Only Sweep

Local rerun:

- `/mnt/pdf-review/pdfaf-language-diagnostics/language-syntax-original50-2026-05-22-r1/language-parts-parity.md`

Result:

- `document_language_score_active`: `36`
- `language_parts_score_active`: `1`
- `document_language_syntax_scoring_gap`: `0`
- `explicit_structure_lang_scoring_candidate`: `0`
- `language_parts_heuristic_evidence`: `0`
- `language_parts_control_noise`: `0`
- `no_language_parts_debt`: `13`
- `analysis_error`: `0`

The one direct structure-language syntax row was `font-4172`. It had:

- `structureLangInvalidCount=1`
- `pdfua.language.structure_lang_valid` verified failure
- `title_language=50`
- no applied score-cap record because the category was already below the new `89` cap

This proves the new cap can detect a real original-corpus explicit `/Lang` syntax failure without inflating scores. It does not prove full remediation benchmark acceptance.

### Original-50 Deterministic Validation

Local bounded validation:

- `/mnt/pdf-review/pdfaf-validation/original50-language-syntax-bounded-2026-05-22-r1/baseline_report.json`

Command shape:

- `scripts/bounded-holdout-validation.ts /mnt/pdf-review/pdfaf-validation/original50-language-syntax-flat-2026-05-22-r1 ... --limit 50 --per-pdf-timeout-ms 300000`
- Per-row child process runs `scripts/baseline-corpus-batch.ts --no-semantic --no-pdfs`.

Result:

- `50` rows selected
- `49/50` completed
- completed-row mean `93.2449`
- all-row mean `91.3800`
- `false_positive_applied=0`
- one hard timeout: `structure-4438`
- runtime p95/max: `214971ms / 300039ms`

Below-93 rows:

- `font-4057`: `90/A`
- `long-4516`: `59/F`
- `long-4680`: `59/F`
- `long-4683`: `59/F`
- `structure-4076`: `89/B`
- `structure-4438`: external timeout, counted as zero

The relevant language-syntax row, `font-4172`, completed at `93/A`. Its final `title_language` category was `89`, consistent with the new verified structure-language cap, but the overall row remained A-grade with `false_positive_applied=0`.

This validation is useful but not a complete broad acceptance pass versus the current best original-50 reference, because known runtime/route debt still pulls the all-row mean below recent reference artifacts. The observed low rows are the existing long/structure runtime and route-volatility families, not new language-syntax controls.

## Validation

Passed:

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/services/pacRuleEvidence.test.ts tests/scorer.test.ts tests/scripts/languagePartsParityDiagnostic.test.ts`
- `npx -y node@22 /usr/bin/pnpm run lint`

Still required before treating this as a broad benchmark-accepted scoring checkpoint:

- all-unique and outside-holdout checkpoint updates when a broader PAC/POC validation checkpoint is next run.

## Current State

This is a stricter scoring/evidence alignment, not a score-moving remediation lane. It closes a direct PAC/POC parity gap for malformed explicit language syntax while keeping heuristic language-of-parts evidence parked.
