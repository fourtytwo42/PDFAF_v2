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

## Validation

Passed:

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/services/pacRuleEvidence.test.ts tests/scorer.test.ts tests/scripts/languagePartsParityDiagnostic.test.ts`
- `npx -y node@22 /usr/bin/pnpm run lint`

Still required before treating this as a broad benchmark-accepted scoring checkpoint:

- full original-50 deterministic validation if the team requires every score-active scoring hardening to pass the complete remediation benchmark gate;
- all-unique and outside-holdout checkpoint updates when a broader PAC/POC validation checkpoint is next run.

## Current State

This is a stricter scoring/evidence alignment, not a score-moving remediation lane. It closes a direct PAC/POC parity gap for malformed explicit language syntax while keeping heuristic language-of-parts evidence parked.
