# POC Decompiled Checker Map

Date: 2026-05-05

Scope: read-only review of `Research/POC-decompiled`, mainly `PAC.readable` plus the generated catalog under `Research/POC-decompiled/analysis`. The POC appears to be a decompiled PAC-style PDF accessibility checker. Names are partly obfuscated, but the included resource captions and generated analysis map make the checking model recoverable.

## Executive Summary

The POC is primarily a validation engine. It parses a PDF into document, page, content, annotation, font, metadata, role-map, and structure-tree events, then dispatches those events to a large catalog of independent checks. It has broad coverage of PDF/UA, PDF syntax, logical structure, font encodings, natural language, metadata, table regularity/header assignment, annotation ownership, content tagged/artifacted state, text contrast, and a shallow AI-assisted tag-quality layer.

PDFAF is a remediation engine with a checker-facing scorer. We analyze with `pdf.js` plus Python/pikepdf, score into product categories, then mutate PDFs through guarded repair stages, reanalyze, rollback unsafe changes, run visual stability checks for risky changes, and benchmark against protected corpora. That is the main way we are better: we actually fix PDFs and prove fixes under repeat/visual/protected gates.

The POC is better as a pure checker in several areas: it has more explicit PDF/UA rule breadth, especially low-level font/CMap syntax, natural-language subchecks, optional-content/file-spec rules, rendered text contrast, Table header association checks, and direct event-driven content tagging checks. PDFAF covers many of these as heuristics or category scores, but not with the same per-rule failure fidelity.

## POC Architecture

Source map:

- `Research/POC-decompiled/analysis/README.md`: generated overview: 97 check sets, 130 individual checks, 66 classes with parser hooks.
- `Research/POC-decompiled/analysis/grading-logic/README.md`: expanded grading map: 227 checks/check sets, 152 direct issue emitters, 372 parent/child links.
- `Research/POC-decompiled/analysis/grading-logic/check-set-tree.md`: recovered hierarchy.
- `Research/POC-decompiled/analysis/grading-logic/issue-emissions.csv`: per-check emitted failures/warnings.
- `Research/POC-decompiled/analysis/grading-logic/shared-base-logic.md`: shared base classes and event hooks.

Runtime shape:

1. A parser walks the PDF and raises events such as `OnDocumentStart`, `OnMetadataStart`, `OnMarkInfo`, `OnViewerPreferences`, `OnPageStart`, `OnText`, `OnPath`, `OnImage`, `OnAnnotation`, `OnField`, `OnMarkedContentStart`, `OnStructureStart`, `OnStructureElementStart`, `OnStructureElementEnd`, `OnOutlineStart`, `OnFormXObjectStart`, and `OnParsingFailed`.
2. Individual checks subscribe to those events through a common validator base, `AtCjXLHXXLng0cDQEI68`, which owns pass/fail/warn counters, issue emission helpers, current page/document context, bounding-box lookup, and parser stubs.
3. Check-set groups inherit `M4iQqDHpSilgYwOCyTBF`, aggregate child results, and expose `UAIndex`.
4. Thin role-specific checks inherit shared role-filter bases, especially `cHIQQUHwGA6Ts5bqVYBO` for structure elements with matching resolved roles.
5. Failures/warnings are emitted with concrete check ids, resource messages, severity, element/page context, and sometimes bounding boxes.

## POC Rule Coverage

Top-level groups:

- `CheckSetPDFUA`: PDF/UA umbrella.
- `CheckSetPreCheck`: metadata and core structure precheck subset.
- `CheckSetA4PacQualityAssurance`: quality/advisory checks beyond strict PDF/UA.
- `CheckSetWCAG2`: WCAG grouping, mostly a mapping layer over PDF/UA checks plus rendered contrast and UI-style criteria.

PDF/UA basic requirements:

- PDF syntax parseability.
- Structural parent tree consistency: missing ParentTree, missing page `/StructParents`, missing MCID entries, invalid ParentTree entries, inconsistent references, missing annotation `/StructParent`.
- Structure element parent keys and corrupt structure syntax: missing `/P`, wrong parent, missing `/S`, invalid OBJR/MCR types, missing object/MCID references.
- Tagged content and artifacts: text/path/image must be inside marked content or artifact; artifacts must not appear inside tagged content; tagged content must not appear inside artifacts.
- Character Unicode mapping, font embedding, CMap validity, CIDToGIDMap, TrueType encoding rules, WMode consistency.
- Optional content config dictionary name and `/AS` rules.
- Embedded file file-spec `/F` and `/UF` rules.
- Natural language checks for document language, text objects, alt text, actual text, expansion text, outline items, annotation contents, and form alternate names.

Metadata/settings:

- `/MarkInfo /Marked true`.
- `/MarkInfo /Suspects false`.
- XMP metadata exists.
- PDF/UA identifier exists.
- XMP title exists.
- viewer preference `DisplayDocTitle` is true.
- accessible encryption settings.
- dynamic XFA is rejected.
- pages with annotations have tab order `/S`.

Logical structure:

- Alternative descriptions for figures, formulas, annotations, and form fields.
- Figure bounding box.
- RoleMap: non-standard roles remapped, standard roles not remapped, no circular mappings.
- Large standard tag syntax catalog: `Document`, `Part`, `Art`, `Sect`, `Div`, `P`, `H`, `H1`-`H6`, `L`, `LI`, `Lbl`, `LBody`, `Table`, `TR`, `TH`, `TD`, `THead`, `TBody`, `TFoot`, `Figure`, `Formula`, `Form`, `Link`, `Annot`, `TOC`, `TOCI`, `Note`, `Reference`, `BibEntry`, `Code`, `Quote`, Ruby/Warichu tags, and others.
- Heading rules: first heading is H1, no skipped numbered heading levels, do not mix generic `H` with numbered `Hn`, only one `H` per parent node.
- Table rules: regularity by row width with row/col spans, header-cell association, completeness warnings for missing TH/TD.
- Annotation nesting: Link annotations in Link tags, Widget annotations in Form tags, annotations in Annot tags, no TrapNet/PrinterMark tagging issues.
- Notes and TOC checks: Note IDs/unique IDs, Note has label/reference, TOCI contains link and points to headings.

Quality/AI:

- Auto-generated alt text and titles are detected as warnings using filename/path-like regexes.
- Artifacted body paragraphs are warned.
- Missing Link tags are detected from marked content.
- Tagged content outside page boundaries is warned.
- Text tags with only whitespace and text tags with alt text are warned.
- AI-assisted checks compare predicted page elements against structure elements using filtering and IoU-like matching to warn on likely misclassification, false positives, and false negatives.

Rendered checks:

- Text contrast renders page bitmaps with Skia, samples pixels around text glyph positions, and applies WCAG-like thresholds, 4.5 for smaller text and 3.0 for larger/bold-style text.

## PDFAF Architecture

Entry points:

- `src/services/pdfAnalyzer.ts`: main analysis pipeline.
- `src/services/pdfjsService.ts`: pdf.js extraction.
- `src/services/structureService.ts` and `python/pdf_analysis_helper.py`: pikepdf structural analysis and mutation helpers.
- `src/services/scorer/scorer.ts`: category scoring and score caps.
- `src/services/scorer/categories/*.ts`: category-specific checks.
- `src/services/scorer/finalizeEvidence.ts`: verification/manual-review policy.
- `src/services/remediation/planner.ts`: route/tool selection.
- `src/services/remediation/orchestrator.ts`: mutation, reanalysis, rollback, replay signatures, protected reanalysis hooks.

Pipeline:

1. Hash/caches input unless bypassed.
2. Run pdf.js extraction and Python/pikepdf structural analysis in parallel.
3. Merge into a `DocumentSnapshot`.
4. Derive bounded detection signals for headings, figures, tables, reading order, annotations, PDF/UA, lists, and structural confidence.
5. Score into product categories:
   - `text_extractability`
   - `title_language`
   - `heading_structure`
   - `alt_text`
   - `pdf_ua_compliance`
   - `bookmarks`
   - `table_markup`
   - `color_contrast`
   - `link_quality`
   - `reading_order`
   - `form_accessibility`
6. Apply score caps for critical blockers such as no extractable text, no real headings, no checker-visible alt on informative figures, poor table markup, weak reading order, and annotation ownership debt.
7. Finalize evidence levels as verified, heuristic, or manual-review-required.
8. Remediation planner selects bounded tools; orchestrator mutates PDFs, reanalyzes, accepts only category/score-safe improvements, records tool outcomes, and rolls back unsafe/no-gain changes.

## Direct Comparison

Where PDFAF is stronger:

- Remediation, not just validation. The POC reports failures; PDFAF plans and applies PDF mutations for metadata, headings, alt, tables, links/ParentTree, OCR, role-map issues, font embedding, reading-order shells, and selected semantic alt.
- Acceptance discipline. PDFAF uses before/after scoring, guarded category regressions, replay-state signatures, protected corpus gates, `false_positive_applied` tracking, visual pixel stability reports, and rollback of no-gain mutations.
- Product-level prioritization. PDFAF turns low-level signals into graded categories and actionable scores for real workflows.
- Semantic alt generation. The POC has AI warning checks, but PDFAF has a guarded semantic figure-alt lane with bbox/ownership/nearby-text context and acceptance checks.
- Corpus-driven learning. PDFAF has durable stage reports, holdout corpora, protected baselines, and repeated diagnostics for volatility and regressions.
- OCR/manual-PDF repair. PDFAF has OCR title/heading ownership recovery paths that a pure checker does not attempt.

Where the POC is stronger:

- Per-rule fidelity. It emits explicit pass/fail/warn issues tied to named PDF/UA/Matterhorn-style checks rather than broader category findings.
- Parser-event completeness. It directly checks text/path/image marked-content state during content parsing; PDFAF approximates several of these through pikepdf audits.
- Low-level font/CMap/Unicode checks are deeper and more standards-specific.
- Natural language validation is much broader: text, alt, actual text, expansion text, annotation contents, outline items, and form alternate names.
- Rendered contrast is implemented; PDFAF currently marks color contrast as not measured/manual-review.
- Table header assignment appears more precise than PDFAF’s current header/regularity heuristics.
- Link reachability and TOCI destination correctness exist; PDFAF focuses more on link text and annotation ownership.
- Optional content, embedded file specs, dynamic XFA, file-spec keys, reference XObjects, and some annotation subtypes have explicit checks.
- AI tag classification/false-positive/false-negative warning layer compares predicted visual elements to tags; PDFAF has semantic lanes but less of this page-element-vs-tag classifier coverage.

## Recommended Improvements

1. Add a PAC/Matterhorn-style rule catalog layer in PDFAF. Keep the current category scorer, but also emit stable rule ids for metadata, structure, parent tree, font, table, annotation, language, and content-tagging checks. This would make findings more actionable and easier to compare with external checkers.

2. Promote color contrast from `not_measured` to a rendered pixel check. The POC’s Skia strategy is a workable model: render the page, sample around text glyph boxes, use 4.5/3.0 thresholds, and mark uncertainty/manual-review when geometry or paint state is ambiguous.

3. Expand low-level PDF/UA syntax checks. Add explicit scoring/evidence for CMap embedding/reference validity, CIDToGIDMap, TrueType symbolic/non-symbolic encoding, WMode consistency, external reference XObjects, dynamic XFA, optional-content config `/Name` and `/AS`, and embedded file `/F`/`/UF`.

4. Add direct ParentTree consistency diagnostics. PDFAF already repairs link ParentTree debt and tracks orphan MCIDs, but should expose PAC-like failures for missing ParentTree, missing page `/StructParents`, missing MCID ParentTree entries, invalid entries, and inconsistent annotation/object references.

5. Improve natural-language checks. Validate BCP-47 syntax and coverage not only for document `/Lang`, but also alt text, actual text, annotation `/Contents`, form `/TU`, outline items, expansion text, and text objects with language overrides.

6. Build table header association checks. Current table scoring catches headers, row regularity, misplaced cells, and dense rowless tables. Add `TH` scope/header-id association validation and emit explicit table-header-cell assignment findings.

7. Add content-event style auditing for text/path/image tagging. Reuse or extend pikepdf content-stream parsing to distinguish text, path paint, image XObjects, artifacts, and marked content blocks more like `CheckContentIsTaggedOrArtifacted`.

8. Add generated-alt/generated-title warnings as first-class findings. PDFAF has weak-alt heuristics and filename-title rejection in remediation; expose these as checker findings even when no remediation is run.

9. Add TOC/Note quality checks. POC’s Note ID/unique ID/Lbl/reference and TOCI link/destination rules are not core PDFAF strengths today.

10. Add link reachability as optional network/manual mode. Keep it disabled by default for deterministic local runs, but make URI reachability and redirect warnings available as a user-selected check.

11. Add AI visual-tag mismatch diagnostics. PDFAF’s semantic alt can inspect figures, but a separate non-mutating classifier comparing visual page elements to structure roles would help find false positives, false negatives, and tag-classification drift without changing the PDF.

12. Preserve PDFAF’s guardrails when borrowing POC checks. Do not turn every POC warning into remediation behavior. New checks should first be evidence-only, then candidate repairs should require repeatability, category gain, false-positive truthfulness, and visual/protected validation.

