# Phase 7 - Create PDF Authoring Page
## Accessible PDF Creator For 100/100 Native Output

**Status:** Planned

**Target app:** `apps/pdf-af-web`

**Goal:** Add a second frontend page, **Create PDF**, where users can author new PDFs from scratch with a polished Canva-like editor. PDFs produced by this page must be designed to pass the PDFAF scoring model at 100/100 by construction, with export-time validation before download.

This feature is different from remediation. The user is not fixing an existing PDF; they are building a new PDF in a controlled authoring system where accessibility metadata, structure, reading order, and export constraints can be enforced from the start.

---

## Product Outcome

Users can open the web app, switch from the existing batch remediation dashboard to **Create PDF**, design a PDF using text, images, charts, tables, and layout tools, then export a tagged accessible PDF that passes every PDFAF metric that applies to authored documents.

The editor should feel powerful but not heavy:

- dense, clean, icon-led controls with hover tooltips
- direct manipulation for moving, resizing, aligning, grouping, deleting, and reordering objects
- sensible defaults that produce accessible structure automatically
- live readiness feedback that points to the exact page/object blocking export
- clear validation feedback without exposing raw implementation details first
- export blocked only when the document has issues that would prevent a 100/100 score

---

## Shared Editor Platform

Create PDF and Edit PDF should be implemented as two modes of one shared editor platform, not two unrelated applications. The shared platform should own the shell, selection model, inspector framework, keyboard shortcuts, issue list, validation model, undo/redo, zoom, page thumbnails, and export status patterns.

Shared editor regions:

- left rail: pages, assets, findings, outline
- top toolbar: mode tools, undo/redo, zoom, validation, export
- center workspace: authored page canvas or imported PDF viewer
- right inspector: properties, accessibility, issue details, fix controls
- bottom status strip: score/readiness, page count, save state, current mode

Mode-specific behavior:

- `/create` starts from a blank or template-backed structured document.
- `/edit` starts from an imported PDF plus analyzer findings.
- both modes use the same validation/readiness language and issue navigation where possible.
- both modes preserve PDF payloads in browser-local storage and avoid server persistence.

The first implementation should extract reusable editor primitives early, even if `/create` ships first, so the later `/edit` page does not duplicate layout, inspectors, and state conventions.

## Scope

### In Scope

- A new Next.js route at `/create`
- App navigation that lets users switch between the current dashboard and the authoring page
- Multi-page PDF authoring canvas
- Drag, resize, duplicate, delete, group, align, distribute, lock, and layer-order controls
- Text blocks with heading, paragraph, list, caption, quote, and label roles
- Image blocks with required alt text or decorative marking
- Chart blocks with accessible title, summary, data table, and chart image output
- Table blocks with required header semantics and simple table editing
- Shape, line, divider, page number, header, and footer blocks
- Page templates with guaranteed semantic defaults
- Reading order panel derived from object order and semantic roles
- Document settings for title, language, page size, margins, author, subject, and keywords
- Live accessibility readiness checklist backed by the same issue model used by the Edit PDF page
- Client-side draft persistence in IndexedDB
- Export to PDF with tags, metadata, embedded fonts, language, reading order, bookmarks, alt text, table headers, and link annotations
- Automatic call into the existing analyzer/scorer after export
- Export gate that requires a 100/100 score or explains the blocking issues

### Out Of Scope For First Release

- Editing arbitrary existing PDFs in the authoring canvas
- Real-time multiplayer collaboration
- User accounts, shared cloud workspaces, or team template libraries
- Server-side permanent storage of authored drafts or exported PDFs
- Freeform scripting, plug-ins, or untrusted embedded HTML
- Advanced print-production features such as spot colors, bleed imposition, CMYK conversion, or prepress checks

---

## Success Criteria

1. A user can create a simple report PDF with title, headings, paragraphs, image, chart, and table without reading documentation.
2. The exported PDF scores 100/100 in the PDFAF scorer for all applicable categories.
3. Accessibility-critical fields cannot be accidentally skipped: document title/language, heading roles, image alt/decorative status, table headers, chart summaries, and link labels.
4. The editor supports mouse, keyboard, and touch-friendly interactions for common operations.
5. Controls use compact icons with hover/focus tooltips where icons are not self-explanatory.
6. The UI remains responsive with at least 30 pages and 500 canvas objects in a draft.
7. Generated PDFs and base64 payloads are never logged, committed, or persisted on the web server.
8. The editor shell, inspector, issue list, and export readiness components can be reused by the Edit PDF page.

---

## Information Architecture

Add a top-level product switcher:

- **Fix PDFs**: existing upload, queue, analyze, remediate workflow at `/`
- **Create PDF**: new authoring workflow at `/create`
- **Edit PDF**: visual repair workflow for existing PDFs at `/edit` (planned separately in [Phase 8](./08-pdf-editing-page.md))

The `/create` page should be the actual editor, not a marketing or onboarding page.

Suggested editor regions:

- Left rail: add object tools and page thumbnails
- Top toolbar: document, selection, formatting, arrangement, zoom, undo/redo, export
- Center: paginated canvas workspace
- Right inspector: selected object properties, accessibility fields, validation
- Bottom or floating status strip: page count, zoom, score readiness, save state

Mobile and tablet behavior should preserve document review and light edits. Full dense authoring can remain desktop-first, but the page must not break on narrow screens.

---

## UX Principles

- Use icons for high-frequency commands: select, text, image, table, chart, shape, undo, redo, align, distribute, lock, delete, zoom, export.
- Every icon-only control needs an accessible name and hover/focus tooltip.
- Do not expose raw PDF internals as primary UI labels. Use terms like "Reading order", "Alt text", "Table headers", and "Document language".
- Make accessible authoring the default path. The user should not need to know PDF/UA internals to produce a good file.
- Avoid chunky panels. Use compact segmented controls, popovers, property groups, and inline validation.
- Preserve direct manipulation: users should drag, resize, snap, align, and duplicate objects without modal workflows.
- Use restrained visual design suited to a work tool: clear hierarchy, tight spacing, consistent iconography, and predictable panels.
- Prefer semantic insert tools over raw drawing tools. Users add a heading, paragraph, figure, table, chart, or list; the editor can still render them visually, but the underlying object starts with a meaningful role.
- Show accessibility blockers close to the object that caused them. A readiness panel is useful, but users should not have to hunt across the document to find the object that needs attention.

---

## Authoring Model

Use an internal structured document model rather than treating the canvas as a screenshot. The model must be rich enough to generate tagged PDF output and to validate accessibility before export.

### Document

- `id`
- `title`
- `language`
- `author`
- `subject`
- `keywords`
- `pageSize`
- `margins`
- `theme`
- `pages`
- `assets`
- `createdAt`
- `updatedAt`

### Page

- `id`
- `index`
- `size`
- `background`
- `objects`
- `readingOrder`
- `templateId`

### Object Base

- `id`
- `type`
- `x`
- `y`
- `width`
- `height`
- `rotation`
- `locked`
- `visible`
- `zIndex`
- `semanticRole`
- `readingOrderIndex`
- `ariaLabel`
- `style`

### Object Types

- `text`: heading level, paragraph, list, caption, quote, font, size, line height, color, alignment
- `image`: asset reference, crop, fit mode, alt text, decorative flag
- `table`: cells, rows, columns, header rows, header columns, caption, scope rules
- `chart`: chart type, data series, accessible title, summary, fallback table, palette
- `shape`: rectangle, ellipse, line, arrow, divider, decorative flag
- `link`: URL, visible text, accessible label
- `pageNumber`: format and position
- `headerFooter`: repeated content with semantic handling

Decorative shapes and purely visual elements must be exported as artifacts. Informational objects must be represented in the structure tree.

---

## Shared Issue Model

The Create PDF page should use the same normalized issue concept as the Edit PDF page, even though create-mode issues come from local validators before export rather than from imported-PDF analysis.

```ts
type EditorIssue = {
  id: string;
  source: 'authoring-validator' | 'analyzer' | 'export-check';
  category: string;
  severity: 'blocker' | 'warning' | 'info';
  page?: number;
  objectId?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  message: string;
  whyItMatters?: string;
  fixType: string;
  fixState: 'open' | 'needs-input' | 'ready' | 'fixed';
};
```

Create-mode examples:

- image object has neither alt text nor decorative marking
- chart object has no accessible summary
- table object has no header row or header column
- heading levels skip from H1 to H3
- text/background contrast falls below threshold
- document title or language is missing

This model lets the right inspector, readiness status, next/previous issue controls, and export gate work consistently across `/create` and `/edit`.

---

## 100/100 By Construction

The authoring system should satisfy scorer categories without relying on remediation after export.

| Scorer category | Authoring requirement |
| --- | --- |
| `text_extractability` | Render real text with embedded fonts. Do not flatten text into images. |
| `title_language` | Require document title and language before export. Write PDF metadata and catalog language. |
| `heading_structure` | Provide heading roles and prevent skipped heading levels unless explicitly fixed. |
| `alt_text` | Require alt text or decorative marking for every image and informational shape/chart. |
| `pdf_ua_compliance` | Export tagged PDF with correct markers, structure tree, role mapping, and metadata. |
| `bookmarks` | Auto-generate bookmarks from heading structure when page count reaches the scorer threshold. |
| `table_markup` | Require table header rows or columns and export header associations. |
| `color_contrast` | Check text/background contrast in the editor and block failing combinations. |
| `link_quality` | Require descriptive visible text or accessible label for every link. |
| `reading_order` | Maintain an explicit reading order per page and expose a reorder panel. |
| `form_accessibility` | First release can omit form fields. If added later, labels and tooltips are required. |

If a category is not applicable, the exported document should make that non-applicability clear through the document model rather than producing ambiguous output.

---

## Editor Features

### Canvas

- Multi-page vertical canvas with zoom levels from 25% to 400%
- Page thumbnails with add, duplicate, reorder, delete
- Snap guides for margins, page center, object edges, and equal spacing
- Keyboard nudging with arrow keys and accelerated nudging with modifiers
- Selection handles for resize and rotation
- Multi-select with marquee and shift-click
- Copy, paste, duplicate, undo, and redo
- Layer order controls: bring forward, send backward, bring to front, send to back
- Object locking and visibility toggles

### Text

- Heading levels H1-H6
- Paragraph, caption, quote, list, and label styles
- Font family, size, weight, style, color, alignment, spacing
- Bulleted and numbered lists with real list semantics
- Automatic document outline from headings
- Warnings for empty headings, skipped levels, and text contrast failures

### Images

- Upload PNG, JPEG, and SVG assets into browser-local draft storage
- Drag/drop images onto the canvas
- Crop, fit, fill, replace, and reset crop
- Require alt text or decorative marking
- Warn when an image appears to contain text and no text equivalent is present

### Tables

- Insert table with chosen row and column counts
- Add/remove rows and columns
- Mark header row, header column, or both
- Cell text formatting
- Caption support
- Export with table structure, header semantics, and predictable reading order

### Charts

- Bar, line, area, pie/donut, and simple scatter charts
- Data editor with import from pasted CSV
- Accessible chart title and summary required
- Auto-generated fallback data table
- Contrast-safe chart palettes
- Export chart visual as figure plus accessible summary and data table, unless native vector tagging is implemented

### Templates

First release should include a small set of high-quality accessible templates:

- one-page flyer
- simple report
- agenda
- invoice-style table document
- chart summary
- multi-section handout

Templates must include semantic roles, reading order, heading hierarchy, and placeholder guidance in the inspector, not large instructional text on the page.

### Live Readiness

The editor should continuously compute readiness from the structured document model and surface it without interrupting the user.

- status strip shows current readiness: ready, needs attention, or export blocked
- readiness panel groups issues by page, object, and scorer category
- clicking a readiness item selects the object and opens the relevant inspector field
- insert flows prevent obvious invalid states where practical, such as image without alt/decorative decision
- export still runs the real analyzer/scorer as the final authority

Readiness should feel like a quiet quality meter, not a noisy checklist.

---

## Technical Approach

### Frontend Stack

Continue using:

- Next.js app router
- React
- Tailwind CSS
- Zustand for editor state if it remains the app's store pattern
- IndexedDB for draft assets and exported blobs

Add likely dependencies after evaluation:

- `@dnd-kit/core` or equivalent for robust drag/drop and keyboard-accessible interactions
- a canvas/layout library only if it does not block accessible document export
- a charting library with deterministic SVG output and accessible data model support
- a PDF generation path that can create tagged PDFs, embedded fonts, metadata, outlines, annotations, and structure trees

Do not choose a PDF library only because it renders pages visually. The export library must support the accessibility structure needed for a 100/100 authored file, or we need a server-side export service using a toolchain that does.

### Shared Editor Packages

Create shared frontend modules before the editor grows large:

- `editor-shell`: common rails, toolbar slots, workspace frame, inspector frame, status strip
- `editor-state`: page/object selection, undo/redo, zoom, keyboard command routing
- `editor-issues`: normalized issue model, filters, next/previous navigation, readiness aggregation
- `editor-inspector`: property groups, accessibility fields, validation messages
- `editor-storage`: IndexedDB draft, asset, export, and queue handoff helpers

These modules should be UI-framework-local to `apps/pdf-af-web` at first. Avoid extracting a package until the boundaries are proven.

### Export Pipeline

1. Validate the structured authoring model in the browser.
2. Normalize layout into pages, content streams, resources, and semantic structure.
3. Generate tagged PDF output.
4. Run the existing analyze/scorer endpoint against the generated PDF.
5. If score is 100/100, allow download.
6. If score is below 100, show blocking findings grouped by page/object and keep the user in the editor.

The export validation path should be deterministic and testable. A successful export should not depend on an LLM.

### Storage

- Store drafts, uploaded image assets, chart data, and recent exports in IndexedDB.
- Store only small preferences in localStorage.
- Do not persist original assets or generated PDFs on the Next.js server.
- Do not log PDF payloads, image payloads, or base64 data.

### API Additions

The first implementation can reuse existing analysis endpoints by posting the generated PDF as a file. If export requires server-side PDF generation, add routes with strict transient handling:

- `POST /api/pdfaf/create/export`
- `POST /api/pdfaf/create/validate`

Server routes must stream or hold payloads in memory only and must not write PDFs to disk.

---

## Validation And Tests

### Unit Tests

- document model validators
- heading hierarchy validator
- reading order validator
- alt text/decorative validator
- table header validator
- contrast checker
- chart summary/data table validator

### Integration Tests

- export simple text document and verify 100/100
- export document with image alt text and verify 100/100
- export table document and verify table category passes
- export chart document and verify alt/data fallback passes
- export multi-page heading document and verify bookmarks/outline behavior
- verify export is blocked when required accessibility data is missing

### UI Tests

- create a document from template
- add text, image, chart, and table
- drag/resize objects
- reorder reading order
- fix validation issues
- export and download

### Visual Tests

- desktop editor at common widths
- tablet layout
- narrow mobile fallback layout
- dense documents with many objects

---

## Implementation Plan

### Stage 0 - Shared Editor Core

- Define shared editor shell regions and responsive behavior
- Define `EditorIssue`, readiness aggregation, and issue navigation
- Define shared inspector field patterns and icon tooltip behavior
- Add IndexedDB draft/export abstractions that can support both Create and Edit

### Stage 1 - Product Shell And Route

- Add `/create`
- Add app-level navigation between **Fix PDFs** and **Create PDF**
- Build the editor shell: rail, toolbar, canvas, inspector, status strip
- Add icon-only controls with accessible names and tooltips
- Add draft state store and IndexedDB draft persistence

### Stage 2 - Structured Document Model

- Define document, page, object, asset, style, and validation types
- Implement object CRUD and undo/redo
- Implement reading order model
- Implement document settings for title and language
- Add validators for all scorer categories that can be checked before export

### Stage 3 - Core Canvas Authoring

- Add text, image, table, chart, shape, and link objects
- Implement drag, resize, multi-select, align, distribute, duplicate, lock, and delete
- Add page thumbnails and page operations
- Add keyboard shortcuts with visible focus states and accessible names

### Stage 4 - Accessibility Inspector

- Add per-object accessibility fields
- Add document-level readiness checklist
- Add page-level reading order editor
- Add inline warnings for contrast, headings, links, images, tables, and charts
- Prevent invalid states where practical instead of only reporting them later

### Stage 5 - Export Engine

- Select or build the tagged PDF export path
- Embed fonts and metadata
- Export structure tree, role mappings, table headers, figure alt text, links, outlines, and artifacts
- Run analyzer/scorer after export
- Block download unless the score is 100/100 or the user explicitly exports a draft marked as not final

### Stage 6 - Templates And Polish

- Add accessible templates
- Add polished empty states, tooltips, inspector groups, and compact controls
- Add responsive behavior
- Tune performance for large drafts
- Add end-to-end tests and export fixtures

---

## Open Technical Questions

1. Which PDF generation library or service can reliably produce the required tagged PDF and PDF/UA metadata?
2. Should export run entirely in the browser, or should the API provide a transient export endpoint for stronger PDF tooling?
3. How should authored templates be represented: TypeScript fixtures, JSON files, or a persisted template registry?
4. Should chart visuals export as tagged vector content, or as figures with mandatory summaries and backing data tables for v1?
5. How strict should the "draft export" bypass be, and should it be hidden behind an advanced option?

---

## Risks

- Browser-first PDF libraries may not support full tagged PDF/PDF-UA output.
- A visual canvas library can make editing easy while making semantic export difficult.
- Chart and table authoring can produce visually valid but semantically weak output unless constrained.
- Canva-like interaction quality is a substantial UI engineering effort; staged delivery is required.
- 100/100 scoring requires export fixtures to stay synchronized with scorer behavior as the scorer evolves.

---

## Recommended First Slice

Build a thin shared-editor prototype before deep canvas polish:

1. Shared editor shell, inspector, status strip, and `EditorIssue` list.
2. `/create` with text, image, table, and live validation.
3. A spike export path for a simple multi-page tagged PDF.
4. Analyzer/scorer re-check after export.

The first Create PDF acceptance target should be:

1. Create a two-page document.
2. Include title, language, H1/H2 headings, paragraphs, one image with alt text, one table with headers, and bookmarks.
3. Export it.
4. Run it through the existing analyzer.
5. Reach 100/100 without remediation.

This proves the hardest architectural requirement before investing deeply in advanced canvas polish.
