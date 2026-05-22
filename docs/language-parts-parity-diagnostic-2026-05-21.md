# Language Parts Parity Diagnostic

Date: 2026-05-21

Update 2026-05-22: `docs/language-syntax-scoring-calibration-2026-05-22.md` supersedes the diagnostic-only decision for direct explicit language syntax only. Malformed document `/Lang` syntax and verified malformed structure-element `/Lang` overrides are now score-active at the baseline PAC cap. Heuristic language-of-parts evidence remains diagnostic-only.

This is a diagnostic-only PAC/POC parity checkpoint for natural-language rules. It adds a native PDFAF report for document language and language-of-parts evidence, but it does not change scoring, remediation routing, PAC gates, mutators, Docker/API behavior, or benchmark behavior.

## Artifacts

- Source script: `scripts/language-parts-parity-diagnostic.ts`
- Tests: `tests/scripts/languagePartsParityDiagnostic.test.ts`
- Local report: `/mnt/pdf-review/pdfaf-language-diagnostics/language-parts-parity-2026-05-21-r1/language-parts-parity.md`
- Local JSON: `/mnt/pdf-review/pdfaf-language-diagnostics/language-parts-parity-2026-05-21-r1/language-parts-parity.json`

The script runs native `analyzePdf`, reads native `languageAudit` and PAC-style rule evidence, and writes local JSON/Markdown. It does not call PAC, POC, ODL, Java, remediation, or PDF mutation paths.

## Sample

The diagnostic covered `16` PDFs:

- original language/form/annotation/figure/font/table rows;
- Virginia outside-holdout report rows;
- ADAM, Teams, and accessible controls.

## Result

Decision: `keep_language_parts_diagnostic_only`.

Classification distribution:

| classification | count |
| --- | ---: |
| `document_language_score_active` | 5 |
| `no_language_parts_debt` | 11 |
| `document_language_syntax_scoring_gap` | 0 |
| `explicit_structure_lang_scoring_candidate` | 0 |
| `language_parts_heuristic_evidence` | 0 |
| `language_parts_control_noise` | 0 |
| `analysis_error` | 0 |

The only failures found were missing document language. Those are already visible through the current `title_language` category and PAC baseline policy:

- `3981`
- `4673`
- `4674`
- `va-13`
- `ADAM2`

No sampled row had malformed explicit document language syntax, malformed structure-element `/Lang`, or malformed language-of-parts values for alt text, ActualText, annotation contents, form `/TU`, outline text, expansion text, or text objects.

Controls did not expose a language-of-parts behavior or scoring predicate:

- Teams original/remediated: no language-parts debt.
- `pdfaf_fixture_accessible`: no language-parts debt.
- `ADAM2`: only missing document language, which is already an existing score-active/basic metadata issue.

## Decision Rationale

POC/PAC checks natural-language syntax more broadly than the main category score, but this sample does not support a new native scoring rule or remediation behavior:

- Document language absence is already detected and score-impacting.
- No repeated focus rows showed malformed explicit `/Lang` syntax that is not already covered.
- No focus rows showed language-of-parts debt requiring evidence hardening.
- There is no object-backed remediation opportunity in this lane from the current evidence.

Do not add score caps for `pdfua.language.*_lang_valid` from this sample. The safe future rule remains:

- only malformed explicit `/Lang` values should ever become score-active without semantic language detection;
- inherited-language context and content-language identification require stronger native evidence before scoring.

## Next Step

Park language-parts promotion for now. The next useful PAC/POC lane is rendered-contrast opt-in diagnostics, because color contrast remains a known manual-review/PAC gap and is currently not measured by the default engine.
