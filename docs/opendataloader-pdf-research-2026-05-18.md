# OpenDataLoader PDF Research

Date: 2026-05-18

Source: <https://github.com/opendataloader-project/opendataloader-pdf>

Local clone: `Research/opendataloader-pdf`

Inspected commit: `d6b010c` (`Update verapdf version`)

License: Apache-2.0

## Summary

OpenDataLoader PDF is worth using as a reference implementation for extraction and tag-tree synthesis, but it should not replace the PDFAF remediation path directly. Its open core builds a semantic object model from layout, then writes a new tagged PDF. Its README distinguishes this from final PDF/UA export, which is described as an enterprise feature. For our goals, the useful parts are the general algorithms and diagnostics: reading-order extraction, table shape detection, CID/no-ToUnicode detection, content filtering, heading inference, figure/caption linking, and parent-tree/content-stream tagging patterns.

No PDFAF behavior was changed in this pass.

## Architecture Notes

- Java core depends on veraPDF WCAG algorithms (`wcag-algorithms` and veraPDF `1.31.61`) and exposes Java, Node, and Python wrappers.
- `DocumentProcessor` runs preprocessing, page extraction, filtering, table/list/heading/caption processing, reading-order sorting, and output writing.
- `AutoTagger` calls `DocumentProcessor.extractContents()` and then `AutoTaggingProcessor.tagDocument()` to create a tagged `PDDocument`.
- `AutoTaggingProcessor` creates `/StructTreeRoot`, writes `/Document` children, creates `/ParentTree`, assigns page and XObject `/StructParents`, wraps content stream operators in marked content, and artifacts unowned operators.
- The output JSON model includes element type, ID, page number, bounding box, heading level, table row/cell structure, images, captions, and optional hybrid metadata.
- Wrappers execute the Java CLI as a subprocess. The Node wrapper buffers library calls and streams only CLI mode; the Python wrapper similarly shells out to the bundled JAR.

## Strongest Incorporation Candidates

1. OpenDataLoader sidecar diagnostic

   Add an optional diagnostic script that runs OpenDataLoader JSON on selected low-score PDFs and compares its object model to our analyzer snapshot. This should initially be diagnostic-only. Useful comparisons include heading count/levels, table count/row/column shape, image/caption links, bounding boxes, and native-struct-tree versus heuristic extraction. This is the lowest-risk way to use OpenDataLoader immediately because it does not mutate PDFs or affect scoring.

2. XY-Cut++ reading-order evidence

   `XYCutPlusPlusSorter` is a compact geometric reading-order sorter with recursive horizontal/vertical cuts, narrow outlier filtering, and cross-layout element handling. This maps to our recurring reading-order and degenerate-native-structure debt. A safe PDFAF adaptation would be a diagnostic predicate first: compare our current layout order against an XY-cut order on rows where `reading_order` or `heading_structure` is low, then only promote it if target/control evidence shows better PAC-visible structure.

3. Table shape and table triage evidence

   OpenDataLoader combines border-based tables, optional cluster table detection, table triage signals, and a row-band normalizer for undersegmented tables. This is relevant to our outside-corpus table/header failures. The most promising general idea is not broad table mutation; it is better admission evidence for `normalize_table_structure` and `set_table_header_cells`, especially when dense columns and repeated row bands prove that a table was undersegmented.

4. CID/no-ToUnicode replacement-character signal

   OpenDataLoader measures the U+FFFD replacement-character ratio before replacing invalid glyphs and routes high-ratio pages to OCR/hybrid handling. We already inspect ToUnicode/font syntax, but a direct extracted-text replacement ratio would be a useful analyzer invariant. It could distinguish true text-extraction failure from ordinary font syntax debt without relaxing any score cap.

5. Content safety and hidden-text filtering as diagnostics

   OpenDataLoader filters tiny text, off-page content, hidden optional-content groups, and low-contrast hidden text. For PDFAF this should remain diagnostic first. It can help classify prompt-injection/OCR-layer/noisy-content rows, but it must not be used to hide checker-visible failures or artifact real content.

6. ParentTree and XObject tagging patterns

   The `AutoTaggingProcessor` content-stream writer is a useful reference for correct `/StructParents`, `/ParentTree`, MCR dictionaries for XObjects, and operator-level marked-content wrapping. This can inform our `synthesize_basic_structure_from_layout`, `repair_parent_tree_mcid_references`, and link/annotation ownership work. It should be adopted in narrow audited pieces, not copied wholesale.

7. Native structure-tree trust check

   OpenDataLoader supports `use_struct_tree`, but its own docs warn that bad native tags can make output worse than heuristic extraction. We should use this as a design pattern: run native-tree and heuristic/layout evidence side by side for suspicious tagged PDFs, then gate production behavior on structural evidence rather than blindly trusting `/StructTreeRoot`.

## Lower-Fit Or Risky Ideas

- Do not use OpenDataLoader tagged-PDF output as a final remediated artifact without PAC/scorer validation. The free path creates tagged PDFs; it is not presented as full PDF/UA export.
- Do not vendor the whole Java engine into PDFAF as the default remediation engine. It would add subprocess/JVM packaging, duplicated PDF mutation logic, and a second acceptance model.
- Do not enable its hybrid AI backend in our default benchmark path. It would introduce new runtime dependencies and volatility before we have a deterministic sidecar comparison.
- Do not copy first-row table-header tagging as a broad fix. OpenDataLoader writes first table rows as `TH` with `Scope=Column`; our PAC evidence often needs object-specific `/ID` and `/Headers` associations, so this is only safe for synthesized or clearly rebuilt tables.

## Proposed Next Experiments

1. Build a local diagnostic runner for 5 to 10 current low rows and 5 controls:
   - Input: PDF path.
   - Output: OpenDataLoader JSON, no tagged PDF.
   - Compare: PDFAF snapshot versus OpenDataLoader headings/tables/images/captions/reading order.
   - Keep artifacts local under `/mnt/pdf-review`.

2. Use that comparison to choose one narrow lane:
   - reading-order mismatch with stable geometry,
   - table undersegmentation with dense repeated row bands,
   - CID replacement ratio with text-extractability failure,
   - native-tagged document where heuristic layout is clearly better than native tree.

3. Only after a lane has a clear predicate, implement a PDFAF-native change and validate:
   - targeted rows,
   - at least one negative/control row,
   - original 50 regression and speed check,
   - `false_positive_applied=0`.

## Decision

Keep the clone local under `Research/` and do not commit third-party source. Promote only this research note. The best immediate incorporation is a diagnostic sidecar, followed by one narrow general behavior candidate if the sidecar proves a repeatable structural failure shape.
