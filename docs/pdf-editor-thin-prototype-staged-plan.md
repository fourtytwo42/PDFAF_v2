# PDF Editor Thin Prototype Staged Plan

## Summary

This plan breaks the Create PDF and Edit PDF work into small stages we can implement and verify without trying to build a full Canva-class editor in one pass.

Primary change docs:

- [Phase 7 - Create PDF Authoring Page](./prd/07-pdf-authoring-page.md)
- [Phase 8 - Edit PDF Page](./prd/08-pdf-editing-page.md)

The first milestone is a thin shared-editor prototype:

1. shared editor shell, inspector, status strip, and normalized issue list
2. `/create` with text, image, table, and live validation
3. simple export spike for a multi-page accessible PDF
4. `/edit` with PDF rendering, finding list, and issue overlays where evidence exists
5. re-analysis loop that shows before/after score movement

The goal is to prove the product shape and the hardest architecture choices before investing in advanced drag/resize polish, complex table editing, chart authoring, or full PDF visual editing.

---

## Working Rules

- Keep Create and Edit as two modes of one shared editor platform.
- Prefer semantic document and issue models over canvas-only state.
- Do not log PDF payloads, image payloads, or generated Base64.
- Store drafts, source PDFs, working state, and exports in browser-local storage only.
- Reuse the existing analyzer/scorer as the final export authority.
- Commit and push after each completed stage.
- Do not include local verification artifacts, generated PDFs, or reports in commits unless explicitly promoted as source fixtures.

---

## Stage 0 - Shared Editor Contracts

### Goal

Define the common editor primitives before creating route-specific UI.

### Work

- Add shared TypeScript types for:
  - editor mode: `create` or `edit`
  - document/page/object references
  - `EditorIssue`
  - issue severity and fix state
  - readiness summary
- Define shared UI slots:
  - left rail
  - top toolbar
  - center workspace
  - right inspector
  - bottom status strip
- Define issue list behavior:
  - filters
  - selected issue
  - next/previous issue
  - page/object navigation target
- Define storage responsibilities for IndexedDB and localStorage.

### Deliverables

- Shared editor type files under `apps/pdf-af-web`
- Skeleton shared editor shell components
- Basic unit tests for readiness aggregation and issue filtering

### Exit Criteria

- Both `/create` and `/edit` can be represented by the same shell contract.
- `EditorIssue` can represent authoring validation issues and analyzer findings.
- The shell can render without real PDF export or PDF viewing implemented yet.

---

## Stage 1 - Navigation And Shared Shell Prototype

### Goal

Add routes and prove the shared layout works.

### Work

- Add top-level navigation for:
  - Fix PDFs at `/`
  - Create PDF at `/create`
  - Edit PDF at `/edit`
- Add `/create` route with shared editor shell.
- Add `/edit` route with shared editor shell.
- Add compact icon-led toolbar placeholders with accessible labels and tooltips.
- Add status strip placeholder for readiness, score, page count, and save state.
- Add responsive behavior for desktop and narrow screens.

### Deliverables

- `/create` loads a real editor shell.
- `/edit` loads a real editor shell.
- Shared navigation is available from all three top-level workflows.

### Exit Criteria

- TypeScript passes.
- Routes render without runtime errors.
- The shell has no duplicate route-specific layout code beyond mode configuration.

---

## Stage 2 - Create PDF Minimal Authoring Model

### Goal

Prove that Create PDF can author a structured document without depending on visual-only canvas state.

### Work

- Add create-mode state for:
  - document metadata
  - pages
  - semantic objects
  - selected object
  - undo/redo history if lightweight enough for this stage
- Implement minimal object types:
  - heading text
  - paragraph text
  - image placeholder with alt text/decorative state
  - simple table with header row
- Add right inspector fields for selected object properties and accessibility fields.
- Add live validators for:
  - missing document title
  - missing document language
  - image missing alt/decorative decision
  - table missing header row/column
  - skipped heading level
- Render validation results through the shared issue list and status strip.

### Deliverables

- A user can create a two-page in-memory draft.
- A user can add and select text, image, and table objects.
- Readiness issues appear and navigate to the relevant object.

### Exit Criteria

- TypeScript passes.
- Unit tests cover create-mode validators.
- The readiness status changes as the user fixes required fields.

---

## Stage 3 - Create PDF Export Spike

### Goal

Prove the generated PDF path can produce accessible output for a narrow document shape.

### Work

- Select the first export strategy for the spike.
- Generate a deterministic PDF from the minimal create-mode model.
- Include:
  - real extractable text
  - document title
  - document language
  - heading structure
  - image alt text or artifact marking
  - table header semantics where supported by the export path
  - bookmarks for heading structure where applicable
- Re-submit the generated PDF to the existing analyzer/scorer.
- Show final score and blocking findings in the shared status/issue system.

### Deliverables

- Export action for the minimal Create PDF draft.
- Analyzer/scorer re-check after export.
- Clear pass/fail status in the editor.

### Exit Criteria

- A two-page sample with H1/H2, paragraphs, one image with alt text, and one table can be exported and analyzed.
- Any score below 100/100 is shown as concrete `EditorIssue` items.
- No generated PDFs or Base64 payloads are committed or logged.

---

## Stage 4 - Edit PDF Review Shell

### Goal

Prove the Edit PDF page can load an existing PDF and show findings in the same issue system.

### Work

- Add one-PDF upload/open flow on `/edit`.
- Store the source PDF in IndexedDB.
- Call the existing analyze endpoint.
- Normalize findings into `EditorIssue`.
- Render:
  - page thumbnails or a page list placeholder
  - current score
  - category/finding list
  - issue filters
  - next/previous issue controls

### Deliverables

- A user can upload one PDF into `/edit`.
- The page shows analyzer score and normalized findings.
- The issue inspector uses the same shared components as `/create`.

### Exit Criteria

- TypeScript passes.
- Analyzer failures produce a useful UI error state.
- PDF source data remains browser-local except for transient analyzer upload.

---

## Stage 5 - Edit PDF Page Rendering And Overlays

### Goal

Prove that findings can be connected to the visual PDF page where evidence exists.

### Work

- Add PDF page rendering in the center workspace.
- Add zoom controls and page navigation.
- Add overlay layer above rendered pages.
- Map findings with page/bounds evidence to visual highlights.
- For findings without bounds, show page-level markers or inspector-only issues.
- Synchronize selected overlay, selected issue, and inspector panel.

### Deliverables

- Rendered PDF pages in `/edit`.
- Clickable issue overlays when coordinates exist.
- Fallback issue presentation when coordinates do not exist.

### Exit Criteria

- Selecting an issue scrolls/focuses the relevant page or inspector fallback.
- Overlay positions remain correct across zoom levels.
- Long PDFs do not require rendering every page at once.

---

## Stage 6 - Guided Fix Loop For Metadata And Alt Text

### Goal

Prove the smallest useful edit loop: fix a problem, apply it, re-analyze, and show score movement.

### Work

- Add guided fix panels for:
  - document title
  - document language
  - image alt text
  - decorative image marking where supported
- Build structured fix instructions from inspector input.
- Send original PDF plus fix instructions through the remediation/export path.
- Re-run analyze on the fixed PDF.
- Update current score, before/after score, and issue states.

### Deliverables

- A user can fix title/language issues in `/edit`.
- A user can fix at least one image alt text issue where analyzer evidence supports it.
- The page shows before/after score movement.

### Exit Criteria

- Re-analysis updates the issue list and overlays.
- Original PDF, pending fixes, and exported result remain separate.
- No PDFs or generated reports are committed as part of normal verification.

---

## Stage 7 - Prototype Review Gate

### Goal

Decide whether the shared-editor architecture is strong enough for the full Create/Edit roadmap.

### Work

- Review code boundaries:
  - shared shell
  - create mode
  - edit mode
  - issue model
  - storage
  - export/re-analysis
- Review UX with at least:
  - one authored Create PDF sample
  - one existing PDF with metadata issues
  - one existing PDF with figure/alt issues
- Document gaps before advanced features.
- Decide the next tranche:
  - Create canvas polish
  - Create charts/tables/templates
  - Edit reading order/headings/bookmarks
  - Edit table/link/form fixes
  - export engine hardening

### Deliverables

- Prototype review note under [`docs/pdf-editor-prototype-review-stage7.md`](./pdf-editor-prototype-review-stage7.md)
- Updated implementation plan if architecture changes are needed
- Follow-up stage list for the next tranche

### Exit Criteria

- We know whether the export strategy can support the 100/100 Create goal.
- We know how much analyzer coordinate evidence exists for useful Edit highlights.
- We have a clear next stage with known risks instead of a vague full-editor build.

### Stage 7 Outcome

Stage 7 closes the thin prototype and recommends the next tranche:

1. Stage 8 - Create export hardening toward real 100/100 output.
2. Stage 9 - Create authoring UX polish for tables, images, and layout.
3. Stage 10 - Edit evidence enrichment for coordinates and object references.
4. Stage 11 - Edit reading order, headings, and bookmarks.
5. Stage 12 - Edit table, link, and form fixes.

---

## Thin Prototype Acceptance Target

The thin prototype is complete when all of these are true:

1. `/create` and `/edit` use the same editor shell.
2. Create mode supports a minimal two-page semantic document.
3. Create mode shows live readiness issues for metadata, image alt/decorative state, table headers, and headings.
4. Create mode can export a minimal sample and send it through the analyzer/scorer.
5. Edit mode can upload one existing PDF and show analyzer findings as normalized editor issues.
6. Edit mode can render PDF pages and highlight findings where coordinates are available.
7. Edit mode can apply at least metadata and alt-text guided fixes, then re-analyze.
8. The implementation avoids committing or logging generated PDF payloads.

---

## Deferred Until After Thin Prototype

- Full Canva-grade drag/resize/group/layer polish
- Advanced chart authoring
- Full table editor
- Complex page templates
- Full arbitrary visual PDF editing
- Reading order drag handles for imported PDFs
- Form repair UI
- Batch-to-edit multi-file workflows
- Final production-grade tagged PDF export hardening beyond the narrow export spike
