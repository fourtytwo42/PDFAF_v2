# Phase 8 - Edit PDF Page
## Visual PDF Problem Review And Guided Fix Workspace

**Status:** Planned

**Target app:** `apps/pdf-af-web`

**Goal:** Add an **Edit PDF** page where users can open an existing PDF, see accessibility problems directly on the rendered pages, apply easy guided fixes, and export a re-validated PDF. The experience should feel like the Create PDF editor where practical, but it must respect that imported PDFs can contain complex structure, broken tags, scanned pages, forms, annotations, and content that cannot always be cleanly transformed into editable objects.

---

## Product Outcome

Users can upload or select an existing PDF, inspect the document visually, see what is wrong, click highlighted issues, fix them in simple panels, and export an improved PDF after the app re-runs PDFAF scoring.

The target experience:

- visual page viewer with issue overlays
- right-side problem inspector grouped by page, category, and severity
- one-click or guided fixes for common problems
- direct edit handles where the source PDF can support them
- clear distinction between automatic fixes, user-confirmed fixes, and issues that require manual judgment
- export gate that shows the current score and remaining blockers

---

## Relationship To Existing Flows

This page complements both existing and planned workflows:

- **Fix PDFs** at `/`: batch queue for automated analyze/remediate/download.
- **Create PDF** at `/create`: author new PDFs from scratch with accessible output by construction.
- **Edit PDF** at `/edit`: inspect and repair one existing PDF in a visual workspace.

The batch page remains the fast path for many files. The edit page is the deep manual path for a single PDF that needs review, confirmation, or targeted corrections.

---

## Scope

### In Scope

- A new Next.js route at `/edit`
- Entry points from the batch queue: open any analyzed or remediated PDF in the editor
- Direct upload on the edit page for one PDF
- PDF page rendering with zoom, thumbnails, page navigation, search, and page fit modes
- Issue overlays that highlight affected pages, regions, objects, tags, links, tables, forms, and figures where coordinates are available
- A problem inspector that maps findings to plain-language fixes
- Guided fixes for metadata, language, headings, alt text, reading order, table headers, link text, bookmarks, form labels, and common tag issues
- Automatic fix actions using the existing remediation engine where safe
- Manual edit controls for fields that need human judgment, such as alt text and heading levels
- Before/after score display and category breakdown
- Export of the fixed PDF and re-analysis before download
- Browser-local storage for the original, working copy, fix state, and exported PDF

### Out Of Scope For First Release

- Full arbitrary visual content editing for every PDF primitive
- Perfect conversion of imported PDFs into the Create PDF structured authoring model
- Collaborative review workflows
- Permanent server-side storage
- Deep prepress or print-production editing
- Pixel-perfect repair of scanned PDFs beyond OCR-assisted workflows already supported elsewhere

---

## Success Criteria

1. A user can open a failing PDF and immediately see where the most important problems are.
2. Clicking a highlighted issue opens the relevant fix panel with the correct field focused.
3. Common problems can be fixed without reading raw JSON or PDF internals.
4. The page clearly explains when a problem was fixed, still needs user input, or cannot be safely fixed automatically.
5. Export runs re-analysis and shows before/after score movement.
6. No PDF payloads or base64 data are logged, documented, committed, or persisted on the web server.
7. The page can handle long PDFs through virtualization or incremental rendering.

---

## Information Architecture

Add **Edit PDF** to the top-level product switcher:

- **Fix PDFs**: batch automation
- **Create PDF**: new accessible PDF authoring
- **Edit PDF**: visual repair workspace for existing PDFs

Suggested editor regions:

- Left rail: page thumbnails, finding filters, and document outline
- Top toolbar: upload/open, analyze, auto-fix, undo/redo, zoom, previous/next issue, export
- Center: rendered PDF page with selectable issue overlays
- Right inspector: issue details, plain-language explanation, fix controls, standards links
- Bottom status strip: current score, remaining issue count, save state, export readiness

The first screen should be the editor shell with a compact upload/open state, not a landing page.

---

## Problem Highlighting

Findings should be converted into visual annotations whenever possible.

### Overlay Types

- **Figure issue:** outline image or figure region; open alt text/decorative controls
- **Heading issue:** highlight heading text; open heading level controls
- **Reading order issue:** numbered order badges and reorder handles
- **Table issue:** outline table and affected header cells; open table header controls
- **Link issue:** underline or box link region; open link text/label controls
- **Metadata issue:** document-level badge in status strip and inspector
- **Bookmark issue:** outline panel warning with generate/fix action
- **Form issue:** highlight field widget; open label/tooltip controls
- **Contrast issue:** highlight text/background region when coordinates are available
- **Tag tree issue:** show page-level or object-level marker depending on available evidence

When exact coordinates are not available, the issue should still appear in the inspector with page/category context and a clear fix action.

### Overlay Behavior

- Click selects the issue and scrolls/focuses the inspector.
- Hover shows a compact tooltip with the issue name and severity.
- Previous/next issue shortcuts move through visible findings.
- Filters can show all issues, blockers, warnings, a category, or unresolved only.
- Fixed overlays should disappear or become low-emphasis confirmation markers after re-validation.

---

## Guided Fixes

The editor should translate PDFAF findings into focused workflows.

| Problem area | Guided fix |
| --- | --- |
| Title/language | Document settings panel with required title and language fields |
| Missing alt text | Select figure, enter alt text, or mark decorative |
| Poor alt text | Show current text, suggested guidance, replacement field |
| Heading structure | Select text/tag, assign H1-H6 or paragraph, show hierarchy preview |
| Reading order | Drag ordered chips or page badges into correct sequence |
| Missing bookmarks | Generate from headings, then let user rename/reorder |
| Table headers | Mark header row/column and preview header associations |
| Link quality | Edit visible text when possible or add accessible label |
| Form labels | Select form field and add label, tooltip, and role |
| Untagged content | Apply suggested tag role or mark as artifact |
| Scanned pages | Run OCR path or send to remediation path, then review text layer |
| Contrast | Pick an accessible color pair or mark as manual exception only when allowed |

Fix controls should be compact, mostly icon-led, and use plain labels only where text input or disambiguation is necessary.

---

## Edit Modes

Imported PDFs should support multiple edit levels because not every PDF can be safely treated like a native canvas document.

### Review Mode

- Default mode after analysis
- Page rendering and issue overlays
- No accidental content changes
- Best for triage and targeted fixes

### Accessibility Fix Mode

- Enables semantic and metadata edits
- Supports alt text, tags, headings, reading order, table headers, bookmarks, links, forms, and artifact marking
- Main target for first release

### Visual Touch-Up Mode

- Limited visual edits where technically safe: add text note, cover/redact-like block, add image, replace simple text object if supported
- Must not degrade accessibility structure
- Should be secondary to semantic repair in v1

### Rebuild In Create Mode

- For severely broken PDFs, offer "Rebuild as new document" when a clean import is impossible
- Converts detected text/images/tables into a Create PDF draft where feasible
- Clearly communicate that visual fidelity may need review

---

## Technical Approach

### Frontend

Continue using the existing Next.js frontend stack. Add editor-specific state for:

- current PDF draft
- rendered page cache
- findings normalized by page/object/category
- selected issue and selected page object
- pending fixes
- undo/redo history
- export/re-analysis status

Use virtualization for thumbnails and page surfaces so large PDFs remain usable.

### PDF Rendering

Use a robust PDF viewer layer capable of:

- rendering pages
- exposing text layer positions where available
- supporting annotation/link positions
- supporting zoom and high-DPI output
- allowing overlay layers above each page

PDF.js is the natural first candidate because the backend already uses PDF.js services, but the final choice should be verified against coordinate mapping, text extraction, and performance needs.

### Finding Normalization

Add a frontend normalization layer that maps analyzer/scorer findings into editor issues:

- `id`
- `category`
- `severity`
- `page`
- `objectRef`
- `bounds`
- `message`
- `whyItMatters`
- `fixType`
- `fixState`
- `standardsLinks`

The backend should provide better object/page/coordinate evidence over time. The editor should still work when some evidence is missing.

### Fix Application

Use a hybrid repair path:

1. Apply lightweight client-side fix state for inspector fields and previews.
2. Send the original PDF plus structured fix instructions to the remediation/export API.
3. Generate a fixed PDF through deterministic tools.
4. Re-run analyze/scorer.
5. Update overlays from the new findings.

Do not mutate the only copy of the original PDF. Keep original, working fix state, and exported result separate in browser-local storage.

### API Additions

Likely endpoints:

- `POST /api/pdfaf/edit/analyze`
- `POST /api/pdfaf/edit/apply-fixes`
- `POST /api/pdfaf/edit/preview-fix`
- `POST /api/pdfaf/edit/export`

Payloads should be multipart or structured JSON plus browser-held file blobs. Server handling must be transient unless the existing API already owns a temporary processing path. Do not persist user PDFs on the web server.

---

## Validation And Tests

### Unit Tests

- finding-to-overlay normalization
- issue filtering and sorting
- fix instruction builders
- reading order edit model
- table header edit model
- metadata validator
- undo/redo state transitions

### Integration Tests

- analyze PDF and render issue list
- select overlay and open matching inspector panel
- add missing alt text and re-export
- fix document title/language and re-export
- generate bookmarks from headings
- fix link label
- fix table header metadata
- verify re-analysis updates score and overlays

### UI Tests

- upload PDF into `/edit`
- navigate pages and thumbnails
- filter findings
- previous/next issue controls
- guided fix workflow
- export fixed PDF

### Performance Tests

- long PDF page virtualization
- many findings on one page
- large image-heavy PDF
- repeated fix/re-analysis cycles

---

## Implementation Plan

### Stage 1 - Route And Review Shell

- Add `/edit`
- Add top-level navigation entry
- Build upload/open state and editor shell
- Render PDF pages with thumbnails and zoom
- Show normalized finding list after analysis

### Stage 2 - Issue Overlays

- Map findings to page overlays where evidence exists
- Add hover/click/focus behavior
- Add filters and previous/next issue navigation
- Keep inspector and canvas selection synchronized

### Stage 3 - Guided Metadata And Figure Fixes

- Implement title/language fix panel
- Implement image alt text/decorative controls
- Send fix instructions to remediation/export API
- Re-run analyze and update score

### Stage 4 - Structure Fixes

- Add heading hierarchy editor
- Add reading order editor
- Add bookmark generation/reorder flow
- Add artifact/tag role controls

### Stage 5 - Tables, Links, And Forms

- Add table header repair controls
- Add link text/label repair controls
- Add form label/tooltip controls
- Add focused tests and fixtures for each

### Stage 6 - Visual Touch-Ups And Rebuild Path

- Add limited safe visual edits
- Add "Rebuild in Create PDF" handoff for heavily broken documents
- Add polish, keyboard support, responsive behavior, and performance tuning

---

## Open Technical Questions

1. How much coordinate evidence can the analyzer provide today for each finding category?
2. Which fixes can be safely previewed client-side, and which require backend PDF mutation?
3. Should `/edit` operate on queue items from `/` through a shared IndexedDB file store?
4. How should the UI represent issues that the automated engine can fix but the user may want to review first?
5. What threshold should trigger recommending "Rebuild in Create PDF" instead of continuing targeted repair?

---

## Risks

- Existing PDFs can have malformed internals that make visual edits risky.
- Some findings may not have precise coordinates, which limits highlighting fidelity.
- Full content editing and accessibility repair are different problems; combining them too early can make the UI heavy.
- Re-analysis after each fix may be expensive for large PDFs, so the editor needs staged validation and explicit apply/export moments.
- Users may expect every visual object to be editable like a native design tool; the UI must set expectations through modes and available controls.

---

## Recommended First Slice

Build `/edit` as a focused visual accessibility review and guided-fix page:

1. Upload one PDF.
2. Analyze it.
3. Render pages and thumbnails.
4. Show problem list and page overlays for findings with coordinates.
5. Support document title/language and image alt text fixes.
6. Apply fixes through the remediation/export path.
7. Re-run analysis and show before/after score.

This proves the visual repair loop before adding heavier table, reading order, form, and visual content editing.
