# POC Checker Alignment Plan

Date: 2026-05-05

Reference: `docs/poc-decompiled-checker-map.md`

## Goal

Align PDFAF with the PAC-style checker in `Research/POC-decompiled` without replacing the current engine.

The alignment should be additive:

- keep the current `pdf.js + pikepdf` analyzer
- keep the current category scorer
- keep the current remediation planner and orchestrator
- keep current guarded acceptance, rollback, visual validation, protected gates, and `false_positive_applied` truthfulness
- add a PAC-style rule evidence layer beside the existing scorer

## Target Shape

```text
PDF
  -> existing PDFAF analyzer
      -> existing category scores
      -> existing remediation decisions

      -> new PAC-style rule evidence
          -> per-rule pass/warn/fail findings
          -> checker-alignment diagnostics
          -> optional scoring signals later
          -> optional repair gates later
```

The current `alt_text`, `pdf_ua_compliance`, `table_markup`, `reading_order`, and other category scores remain the product-facing grading model. The new layer emits checker-compatible evidence such as:

```json
{
  "ruleId": "pdfua.figure.alt_present",
  "status": "fail",
  "severity": "failure",
  "message": "Alternative text missing for Figure structure element",
  "source": {
    "page": 4,
    "structRef": "12 0 R"
  }
}
```

## Phased Plan

### Phase 1: Read-Only Rule Evidence

Add a new source module, likely `src/services/compliance/pacRuleEvidence.ts`, that derives PAC-style rule results from the existing `DocumentSnapshot`.

Rules should start as read-only evidence. They must not change scoring, planning, mutation, or acceptance.

Initial rule groups:

- metadata and settings: XMP exists, title exists, PDF/UA id exists, `/MarkInfo /Marked`, `/Suspects`, `DisplayDocTitle`
- language: document `/Lang` / metadata language syntax
- alternate text: Figure, Formula, annotation, form alternate-name presence
- structure basics: structure tree present, role-map issues, parent-key evidence where already available
- ParentTree and annotation ownership: missing structure, missing `/StructParent`, tab order `/S`
- tables: header presence, direct TH/TD under Table, irregular rows, strongly irregular rows
- content tagging: orphan MCIDs and path-paint outside marked content from existing audit signals
- generated content warnings: weak/generated alt and filename/path-like titles

### Phase 2: Diagnostic Script

Add `scripts/pac-parity-diagnostic.ts`.

The script should:

- analyze selected PDFs with current PDFAF analyzer
- write a PAC-style pass/warn/fail matrix
- group results by rule id and current PDFAF category
- identify gaps where current categories pass but PAC-style evidence fails
- identify noisy rules that need better source evidence before scoring

Output should be local artifact-only under `Output/...` unless promoted to docs.

### Phase 3: Reporting Integration

Expose the rule evidence in API/reporting without changing grades.

Possible outputs:

- JSON field on analysis result
- CSV diagnostic export
- web UI section named "PDF/UA rule checks" or equivalent

Each rule should carry:

- stable `ruleId`
- `status`: `pass`, `warn`, `fail`, or `not_applicable`
- severity
- confidence/evidence level
- source pointer if available: page, struct ref, annotation ref, object ref, category
- link to the current PDFAF category it informs

### Phase 4: Scoring Signals

Only after diagnostic runs show stable value, selected rule failures may influence category scoring.

Rules should first lower confidence or add manual-review reasons before changing category scores. Direct score penalties should require repeat evidence and agreement with existing category intent.

Good early candidates:

- rendered contrast once implemented
- explicit ParentTree consistency failures
- table header association failures
- low-level font/CMap failures
- natural-language syntax failures

### Phase 5: Remediation Gates

Selected PAC-style rules can become acceptance gates for mutations, but only when directly relevant to the tool.

Example:

- `set_figure_alt_text` should improve `pdfua.figure.alt_present`
- table normalization should improve table row/header rules
- link ParentTree repair should improve annotation ParentTree rules

Acceptance should still require:

- target category or score improvement where applicable
- no core category regression
- no visual regression for risky structural/font/OCR paths
- protected/repeat validation for sensitive rows
- `false_positive_applied = 0`

### Phase 6: New Repairs From Checker Gaps

Only after evidence and diagnostics are stable, add new remediation behavior for checker gaps.

Best candidates from the POC review:

1. Rendered text contrast measurement.
2. ParentTree consistency diagnostics and narrow repairs.
3. Table header-cell association checks.
4. Natural-language checks for alt, actual text, annotation contents, form `/TU`, outlines, and expansion text.
5. Low-level font/CMap/Unicode diagnostics.
6. Direct content-stream tagging/artifact auditing for text/path/image.
7. Optional link reachability in non-deterministic/manual-review mode.
8. AI visual-tag mismatch diagnostics.

## Guardrails

- Do not replace the current scorer with the POC model.
- Do not turn every POC warning into a remediation target.
- Do not add broad repairs from a new rule until the rule has repeatable evidence and a category-moving path.
- Keep network-dependent checks optional and disabled in deterministic benchmark runs.
- Keep generated PDFs, benchmark payloads, and large diagnostic artifacts out of commits.
- Treat new checker evidence as `diagnostic_only` first, then promote narrowly.

## Definition Of Done For First Slice

First implementation slice is complete when:

- `pacRuleEvidence.ts` emits at least 20 stable rule results from existing snapshot data.
- A diagnostic script can produce a rule matrix for a small corpus.
- Existing analysis/remediation scores are unchanged.
- Unit tests cover representative pass/fail evidence derivation.
- A short diagnostic report identifies the first high-value checker gap to implement.

