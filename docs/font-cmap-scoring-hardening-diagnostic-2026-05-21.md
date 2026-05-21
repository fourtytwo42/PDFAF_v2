# Font/CMap Scoring-Hardening Diagnostic - 2026-05-21

## Decision

Decision: `keep_font_cmap_diagnostic_only`.

No new score-active CMap cap, PAC gate, planner route, mutator behavior, Docker/API behavior, or benchmark behavior is accepted from this stage.

This stage adds a native diagnostic classifier that separates:

- already score-active replacement-character debt;
- verified CMap syntax debt with clean text extraction;
- existing low text-extractability rows where another score path is already active;
- manual-review-only font risks;
- rows with no font/CMap debt.

## Source Change

- `scripts/font-cmap-scoring-hardening-diagnostic.ts`

The script runs native PDFAF analysis only. It does not call `Research/POC-decompiled`, PAC, ODL, Java, network tools, semantic AI, remediation, or PDF mutation paths.

## Local Diagnostic

Local artifact:

- `/mnt/pdf-review/pdfaf-font-cmap-diagnostics/font-cmap-scoring-hardening-2026-05-21-r1`

Sample:

- `14` PDFs from historical font/CMap-risk rows and nearby controls.
- Includes original-50 font rows, prior PAC-promotion cap-regression rows, `pdfaf_fixture_accessible`, and `ADAM2`.

Result:

- Decision: `keep_font_cmap_diagnostic_only`
- `candidate_focus=0`
- `candidate_controls=0`
- `replacement_score_active=0`
- `analysis_errors=0`

Classification distribution:

- `font_cmap_syntax_only`: `8`
- `font_cmap_existing_low_text_score`: `3`
- `font_cmap_no_debt`: `3`

Suggested action distribution:

- `keep_diagnostic`: `11`
- `no_action`: `3`

## Key Evidence

Rows with verified CMap syntax debt generally had dense clean native text extraction and `replacementCharacterRatio=0.0000`, so direct CMap caps would not distinguish true Unicode mapping debt from harmless syntax debt.

Examples:

| Row | Score | Text | CMap Debt | Replacement Ratio | Class |
| --- | ---: | ---: | ---: | ---: | --- |
| `4699` | `74/C` | `96` | `18` | `0.0000` | `font_cmap_syntax_only` |
| `4057` | `30/F` | `96` | `15` | `0.0000` | `font_cmap_syntax_only` |
| `4172` | `59/F` | `96` | `11` | `0.0000` | `font_cmap_syntax_only` |
| `4188` | `24/F` | `96` | `9` | `0.0000` | `font_cmap_syntax_only` |
| `4078` | `24/F` | `98` | `7` | `0.0000` | `font_cmap_syntax_only` |
| `4122` | `29/F` | `100` | `1` | `0.0000` | `font_cmap_syntax_only` |
| `4074` | `25/F` | `100` | `4` | `0.0000` | `font_cmap_syntax_only` |

Important control:

- `pdfaf_fixture_accessible`: `96/A`, `text_extractability=96`, CMap debt `6`, replacement ratio `0.0000`, classified `font_cmap_syntax_only`.

This control confirms that a direct CMap syntax cap would still be noisy and would penalize an otherwise accessible control without native evidence of failed text extraction.

## Current Accepted State

Keep the existing replacement-character scoring path:

- `replacementCharacterRatio >= 0.01` caps `text_extractability` at `90`;
- `>= 0.05` caps at `70`;
- `>= 0.20` or high-replacement pages `>=25%` caps at `40`.

Keep direct font/CMap syntax evidence diagnostic-only:

- `pdfua.font.to_unicode_cmap_present`
- `pdfua.font.to_unicode_cmap_valid`
- `pdfua.font.cid_to_gidmap_valid`
- `pdfua.font.truetype_encoding_consistent`
- `pdfua.font.wmode_consistent`

`pdfua.content.characters_unicode_mappable` remains useful evidence, but should become score-active only when native text extraction debt is visible, such as replacement-character evidence, suspiciously low native text density, or another repeatable native signal with stable controls.

## Next Lane

Move to the next PAC/POC parity gap:

- `content_event_tagging_fidelity`

Start diagnostic-only. The useful question is whether PDFAF can split verified full content-stream text/image/path tagging debt from sampled or heuristic XObject evidence, then decide if any verified debt should become score-active or gate-active.
