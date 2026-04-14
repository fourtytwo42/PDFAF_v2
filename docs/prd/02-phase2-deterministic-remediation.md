# Phase 2 — Deterministic Remediation
## Rule-Based Repair Pipeline

**Prerequisite:** Phase 1 complete and passing (`docs/prd/01-phase1-foundation.md`).

**Goal:** `POST /v1/remediate` accepts a PDF and returns a remediated PDF with an improved grade, using only deterministic (rule-based) tools — no LLM required. This handles the majority of fixable accessibility issues.

**Visual fidelity (default):** Prefer **metadata, tags, annotations, and structure-tree** edits that do **not** change how the page renders. Defer or explicitly flag any tool that rewrites content streams, reflows text, or rasterizes pages. Learn from **PDFAF v1** (`pdfaf/` sibling repo): measure grade delta per tool and avoid “fix at all costs” that shifts layout.

**Completion criteria:** At least 60% of F/D PDFs in the ICJIA fixture set improve by at least one letter grade without LLM enabled (run locally where corpus exists). The **engine** itself must not depend on that corpus; see **Generalization** below.

---

## Generalization — not tied to specific PDFs or “families”

Remediation must work for **any customer and any PDF**, not only ICJIA rows or v1-style **residual family** labels. The following rules keep the design portable.

### 1. Inputs are only machine-readable analysis

The planner and tools consume **only** Phase 1 outputs: `AnalysisResult` / `DocumentSnapshot` — category scores, `applicable` flags, `pdfClass`, `pageCount`, structured `findings` (with **stable, repo-owned** codes such as `title.missing`, not customer-specific IDs).

**Forbidden in core planner code:** publication IDs, filenames as routing keys, hardcoded “family” enums copied from one corpus, or imports of batch manifests.

### 2. Criterion-anchored planning (already the default)

Use a static **category → tool list** map plus **`appliesWhen(snapshot)`** per tool (see **Core Concept** below). Ordering and tie-breaking use **weights, thresholds, and dependency rules** (e.g. structure bootstrap before heavy figure work when there is no tree) — all derivable from `config.ts` and the snapshot, not from document identity.

### 3. Optional priority without “families”

If v1-style **families** were useful for “what to fix first,” replace them in v2 with **priority derived from data**, for example:

- failing categories sorted by **redistributed weight × severity**, or  
- explicit **dependency graph** (structure before alt when untagged).

Same formula for every PDF.

### 4. Verification and risk flags are universal

After each batch: **re-run the same `analyzePdf`** on output bytes. Optional gates (pixel delta, size limits) are **global config**, not per-document exceptions in code. Expose **`visual_risk`** / **`human_review_recommended`** on the API when a tool is known to affect appearance — not a parallel classification system keyed to one org.

### 5. Corpus and campaigns stay outside the library

ICJIA manifests, agency batch runners, and promotion workflows live in **scripts or a separate ops repo**; they call **`POST /v1/remediate`** with a file. The remediation **service** remains a pure function of **PDF bytes + environment config**.

### 6. Playbooks (Phase 4) remain abstract

Playbook keys are **hashes of abstract failure shapes** (e.g. `pdfClass` + sorted failing category keys + coarse page bucket + major flags) — see `04-phase4-learning-playbooks.md`. Never key playbooks on file path, customer id, or internal queue row id.

---

## What gets built (incremental on Phase 1)

Phase 1 already ships `src/python/bridge.ts` and `python/pdf_analysis_helper.py` (**read-only** analysis). Phase 2 **extends** the bridge and Python script with **mutation batches** (new stdin protocol or sibling CLI mode — design at implementation time). Do **not** introduce a second Python entrypoint unless there is a strong reason; one script keeps ops simple.

```
src/
├── routes/
│   └── remediate.ts              # NEW
├── services/
│   ├── remediation/
│   │   ├── orchestrator.ts       # NEW — 3-round loop
│   │   ├── planner.ts            # NEW — criterion→tool mapping
│   │   └── tools/
│   │       ├── metadata.ts       # NEW
│   │       ├── structure.ts      # NEW
│   │       ├── fonts.ts          # NEW
│   │       ├── headings.ts       # NEW
│   │       ├── tables.ts         # NEW
│   │       ├── links.ts          # NEW
│   │       ├── bookmarks.ts      # NEW
│   │       └── ocr.ts            # NEW (conditional, needs tesseract)
│   └── python/
│       └── bridge.ts             # EXTEND — mutation batch API
python/
└── pdf_analysis_helper.py        # EXTEND — pikepdf mutations (+ existing read-only mode)
tests/
├── remediate.route.test.ts       # NEW
├── orchestrator.test.ts          # NEW
└── tools/
    ├── metadata.test.ts
    └── structure.test.ts
```

---

## Core Concept: Criterion-Anchored Planning

Instead of an LLM planner deciding what tools to run, the planner uses a static mapping:

```
failing category → tools that can fix it
```

This is deterministic, testable, and fast.

```typescript
const CRITERION_TOOL_MAP: Record<CategoryId, ToolName[]> = {
  title_language:       ['set_document_title', 'set_document_language'],
  pdf_ua_compliance:    ['set_pdfua_identification', 'repair_structure_conformance'],
  alt_text:             ['set_figure_alt_text', 'mark_figure_decorative', 'retag_as_figure'],
  heading_structure:    ['normalize_heading_hierarchy'],      // deterministic only in Phase 2
  table_markup:         ['set_table_header_cells', 'repair_native_table_headers'],
  link_quality:         ['set_link_annotation_contents'],
  bookmarks:            ['replace_bookmarks_from_headings'],
  text_extractability:  ['bootstrap_struct_tree', 'ocr_scanned_pdf'],
  reading_order:        ['repair_native_reading_order'],
  form_accessibility:   [],    // deferred to future phase
  color_contrast:       [],    // not remediable automatically
}
```

Planner selects tools by:
1. Identifying which categories score below threshold
2. Looking up tools for those categories
3. Filtering tools by: not already attempted, not in exclusion list, applicable to PDF class
4. Returning ordered list (metadata → structure → fonts → content → navigation)

**Generalization check:** every step above must be expressible using **only** fields present on `AnalysisResult` / `DocumentSnapshot` and **config**. If a rule needs a specific PDF id or corpus label, it does not belong in the planner.

---

## Tool Stage Order

Tools always run in this order regardless of which categories are failing:

```
Stage 1 — Metadata (always, < 1s)
  set_document_title
  set_document_language
  set_pdfua_identification

Stage 2 — Structure Bootstrap (only if no structure tree)
  bootstrap_struct_tree
  → re-analyze after this stage

Stage 3 — Font Repair
  embed_missing_fonts_in_place
  repair_font_unicode_maps

Stage 4 — Native Structure Repair
  repair_native_link_structure
  repair_native_table_headers
  repair_native_reading_order
  repair_structure_conformance

Stage 5 — Content & Navigation
  normalize_heading_hierarchy     (deterministic: fix skipped levels only)
  replace_bookmarks_from_headings (only if headings exist)
  set_link_annotation_contents    (only for links with raw URL text)

→ re-analyze after Stage 5
→ if score improved ≥ 1 point, loop back (max 3 total loops)
→ stop if score ≥ 90 or no improvement
```

---

## File specs

### `src/python/bridge.ts` (extend)

The Python bridge is the foundation of all structural mutations. Every tool that touches the PDF tag tree goes through here. **Path in repo:** `src/python/bridge.ts` (not under `services/`).

```typescript
export interface PythonMutation {
  op: PythonMutationOp
  params: Record<string, unknown>
}

export type PythonMutationOp =
  | 'set_document_title'
  | 'set_document_language'
  | 'set_pdfua_identification'
  | 'bootstrap_struct_tree'
  | 'repair_structure_conformance'
  | 'repair_native_link_structure'
  | 'repair_native_table_headers'
  | 'repair_native_reading_order'
  | 'embed_missing_fonts'
  | 'repair_font_unicode_maps'
  | 'set_figure_alt_text'
  | 'mark_figure_decorative'
  | 'retag_as_figure'
  | 'normalize_heading_hierarchy'
  | 'create_heading_from_candidate'
  | 'set_table_header_cells'
  | 'set_link_annotation_contents'
  | 'replace_bookmarks_from_headings'
  | 'repair_malformed_bdc_operators'
  | 'normalize_nested_figure_containers'

export interface BatchMutationInput {
  mutations: PythonMutation[]
  inputPath: string
  outputPath: string
}

export interface BatchMutationResult {
  success: boolean
  appliedOps: string[]
  failedOps: Array<{ op: string; error: string }>
  outputPath: string
  elapsedMs: number
}

export async function runPythonMutationBatch(
  buffer: Buffer,
  mutations: PythonMutation[],
  options?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<{ buffer: Buffer; result: BatchMutationResult }>
```

**Implementation:**
- Write input PDF to temp file
- Serialize mutations as JSON to stdin
- Spawn `python3 python/pdf_analysis_helper.py` (or dedicated mutation module if split later)
- Pass input/output paths + mutations JSON via stdin
- Parse stdout JSON result
- Read output file into buffer
- Cleanup temp files in `finally`
- On timeout: kill child process, throw TimeoutError
- On non-zero exit: throw PythonBridgeError with stderr

**Atomic commit pattern:**
- Python always writes to a NEW temp output file (never overwrites input)
- Only after Python exits successfully does bridge.ts return the new buffer
- If anything fails, original buffer is returned unchanged

### `python/pdf_analysis_helper.py` (extend)

Phase 1: analysis mode (PDF path argv, JSON to stdout). Phase 2 adds mutation mode, e.g. JSON from stdin: `{ "input_path": "...", "output_path": "...", "mutations": [...] }`

Applies each mutation sequentially using pikepdf. Outputs result JSON to stdout.

**Mutation implementations (Python):**

```python
def set_document_title(pdf, params):
    pdf.docinfo['/Title'] = params['title']

def set_document_language(pdf, params):
    # Set /Lang in document catalog
    pdf.Root['/Lang'] = params['language']  # e.g. "en-US"

def set_pdfua_identification(pdf, params):
    # Set /Metadata XMP with pdfuaid:part=1
    # Add /MarkInfo /Marked=true

def bootstrap_struct_tree(pdf, params):
    # Create minimal /StructTreeRoot with /Document root
    # Tag all marked content as /P (paragraph) initially
    # This is the most complex operation

def repair_structure_conformance(pdf, params):
    # Fix common PDF/UA failures:
    # - Ensure all tags have /P (parent) pointers
    # - Fix orphaned /MCID references
    # - Validate role map entries

def set_figure_alt_text(pdf, params):
    # params: { figure_id, alt_text }
    # Find /Figure tag by id/MCID, set /Alt attribute

def mark_figure_decorative(pdf, params):
    # params: { figure_id }
    # Change /Figure to /Artifact

def normalize_heading_hierarchy(pdf, params):
    # Fix heading level skips (H1→H3 → H1→H2→H3)
    # Only fix definitively wrong hierarchies
    # Never create headings from non-heading content

def set_table_header_cells(pdf, params):
    # params: { table_id, header_cell_ids }
    # Set /Scope attribute on /TH cells

def replace_bookmarks_from_headings(pdf, params):
    # Walk structure tree for H1-H6 tags
    # Generate /Outlines from heading text + page refs

def embed_missing_fonts(pdf, params):
    # For each font not embedded:
    # - Try to find system font by name
    # - Embed subset using fonttools
    # - Update /FontDescriptor

def repair_font_unicode_maps(pdf, params):
    # Fix /ToUnicode streams for extractability
    # Handles Type1, TrueType, CIDFont

def repair_native_table_headers(pdf, params):
    # Promote first row cells to /TH if heuristic confirms header row

def set_link_annotation_contents(pdf, params):
    # params: { link_id, contents }
    # Set /Contents on link annotation

def repair_native_reading_order(pdf, params):
    # Reorder /K children in structure tree to match
    # top-to-bottom, left-to-right page order
    # Heuristic: sort by page number then bbox y then x
```

### `src/services/remediation/orchestrator.ts`

The main loop. Drives stages, re-analysis, convergence detection.

```typescript
export interface RemediationOptions {
  targetScore?: number        // default 90
  maxRounds?: number          // default 3
  semantic?: boolean          // default false (Phase 2: always false)
  signal?: AbortSignal
  onProgress?: (event: RemediationProgressEvent) => void
}

export interface RemediationResult {
  before: AnalysisResult
  after: AnalysisResult
  remediatedBuffer: Buffer
  appliedTools: AppliedTool[]
  rounds: RoundSummary[]
  totalMs: number
  improved: boolean
}

export interface AppliedTool {
  toolName: string
  stage: number
  round: number
  scoreBefore: number
  scoreAfter: number
  delta: number
  outcome: 'applied' | 'no_effect' | 'rejected' | 'failed'
}

export async function remediatePdf(
  buffer: Buffer,
  filename: string,
  initialAnalysis: AnalysisResult,
  options?: RemediationOptions
): Promise<RemediationResult>
```

**Loop logic:**

```
currentBuffer = buffer
currentAnalysis = initialAnalysis
appliedTools = []
rounds = []

for round in 1..maxRounds:
  plan = planner.planForAnalysis(currentAnalysis, appliedTools)
  if plan.tools.length === 0:
    break  // nothing left to try

  stageResults = []
  for stage in plan.stages:
    stageBefore = currentAnalysis.score
    [newBuffer, stageApplied] = await executeStage(currentBuffer, stage)
    
    if stage.reanalyzeAfter:
      // Always use the same authoritative analyze path as Phase 1 (no separate
      // "fast" profile) — see docs/prd/learnings-from-v1-memory.md.
      currentAnalysis = await analyzePdf(tempPathFromBuffer(newBuffer), filename)
      if currentAnalysis.score < stageBefore:
        // REGRESSION: revert this stage
        log("stage regressed, reverting")
        continue
      currentBuffer = newBuffer
    else:
      currentBuffer = newBuffer
    
    stageResults.push(...)
    appliedTools.push(...stageApplied)
    
    if currentAnalysis.score >= targetScore:
      break  // early exit

  rounds.push({ round, stageSummaries: stageResults, scoreAfter: currentAnalysis.score })
  
  if currentAnalysis.score >= targetScore:
    break
  if noImprovementThisRound(rounds):
    break

return { before: initialAnalysis, after: currentAnalysis, remediatedBuffer: currentBuffer, ... }
```

**Re-analysis:** Every post-mutation score uses **`analyzePdf`** exactly as Phase 1 (write buffer to temp file, full pdfjs + Python + scorer). If a future **`analysisProfile`** is added, intermediate remediation must not use a looser profile than production unless the API explicitly labels it non-authoritative.

### `src/services/remediation/planner.ts`

```typescript
export interface RemediationPlan {
  stages: RemediationStage[]
}

export interface RemediationStage {
  stageNumber: number
  tools: PlannedTool[]
  reanalyzeAfter: boolean
}

export interface PlannedTool {
  toolName: ToolName
  params: Record<string, unknown>
  rationale: string
}

export function planForAnalysis(
  analysis: AnalysisResult,
  alreadyAttempted: AppliedTool[]
): RemediationPlan
```

**Planning logic:**
1. Find categories with score < 90 and `applicable: true`
2. For each failing category, look up tools in `CRITERION_TOOL_MAP`
3. Filter: remove tools already attempted with `outcome: 'applied'` (don't retry success), remove tools with `outcome: 'no_effect'` (don't retry dead ends)
4. Filter: remove tools not appropriate for PDF class (e.g. `bootstrap_struct_tree` not needed if already tagged)
5. Group tools into stages by `TOOL_STAGE_ORDER`
6. Set `reanalyzeAfter: true` for Stage 2 (structure bootstrap) and Stage 5 (content)

### `src/services/remediation/tools/*.ts`

Each tool file exports a single async function. Tools call the Python bridge or use pdf-lib directly (for simple metadata changes).

**metadata.ts:**
```typescript
export async function setDocumentTitle(buffer: Buffer, title: string): Promise<Buffer>
export async function setDocumentLanguage(buffer: Buffer, language: string): Promise<Buffer>
export async function setPdfUaIdentification(buffer: Buffer): Promise<Buffer>
```
These use pdf-lib directly (no Python needed) for simple XMP/info dict changes.

**structure.ts:**
```typescript
export async function bootstrapStructTree(buffer: Buffer): Promise<Buffer>
export async function repairStructureConformance(buffer: Buffer): Promise<Buffer>
export async function repairMalformedBdcOperators(buffer: Buffer): Promise<Buffer>
```
These always go through Python bridge (pikepdf required for tag tree surgery).

**fonts.ts:**
```typescript
export async function embedMissingFonts(buffer: Buffer, fonts: FontInfo[]): Promise<Buffer>
export async function repairFontUnicodeMaps(buffer: Buffer): Promise<Buffer>
```

**headings.ts:**
```typescript
export async function normalizeHeadingHierarchy(buffer: Buffer): Promise<Buffer>
// Phase 2: deterministic only — fix skipped levels, no creation
```

**tables.ts:**
```typescript
export async function setTableHeaderCells(buffer: Buffer, tableId: string, headerCellIds: string[]): Promise<Buffer>
export async function repairNativeTableHeaders(buffer: Buffer): Promise<Buffer>
```

**links.ts:**
```typescript
export async function setLinkAnnotationContents(buffer: Buffer, linkId: string, contents: string): Promise<Buffer>
export async function repairNativeLinkStructure(buffer: Buffer): Promise<Buffer>
```

**bookmarks.ts:**
```typescript
export async function replaceBookmarksFromHeadings(buffer: Buffer): Promise<Buffer>
```

**ocr.ts:**
```typescript
export async function isOcrAvailable(): Promise<boolean>
export async function ocrPdf(buffer: Buffer, signal?: AbortSignal): Promise<Buffer>
// Uses tesseract: render pages to PNG, OCR to PDF, merge with qpdf
```

### `src/routes/remediate.ts`

```typescript
// POST /v1/remediate
// Accepts: multipart/form-data
//   file: PDF
//   options (JSON string, optional): { targetGrade, maxRounds, semantic }
// Returns:
//   application/json: { before, after, appliedTools, rounds, totalMs }
//   OR multipart: includes remediatedPdf as binary part
//
// Query param: ?format=json (default) | ?format=multipart
```

Middleware chain:
1. multer upload
2. Validate PDF
3. `analyzePdf()` for initial analysis
4. `remediatePdf()` with options
5. Return based on format param

For `?format=json`: encode `remediatedPdf` as base64 in response body (< 10MB PDFs only).
For `?format=multipart` (default): stream PDF as binary attachment + JSON metadata.

---

## Regression Prevention

After every stage that calls `reanalyzeAfter: true`:

```typescript
if (newScore < previousScore - 1) {
  // Regression threshold: more than 1 point drop = revert
  revertBuffer()
  logRejected(stage, scoreDelta)
} else if (newScore === previousScore) {
  // No effect — record tool as no_effect but keep buffer
  logNoEffect(stage)
} else {
  // Improvement — commit
  currentBuffer = newBuffer
  currentAnalysis = newAnalysis
}
```

This is simpler than v1's binary-search isolation. For Phase 2 (deterministic tools only), whole-stage revert is acceptable because deterministic tools are predictable and each stage is independent.

---

## Python Bridge Error Handling

```typescript
class PythonBridgeError extends Error {
  constructor(
    message: string,
    public readonly op: string,
    public readonly stderr: string,
    public readonly exitCode: number
  ) { super(message) }
}

class PythonBridgeTimeoutError extends Error {
  constructor(public readonly op: string, public readonly timeoutMs: number) {
    super(`Python operation ${op} timed out after ${timeoutMs}ms`)
  }
}
```

On `PythonBridgeTimeoutError`: return original buffer, mark stage as failed, continue to next stage.
On `PythonBridgeError` with exitCode !== 0: same treatment.
Never propagate Python errors to the HTTP response as 500s — degrade gracefully.

---

## Tests

### `tests/orchestrator.test.ts`
- Mock `analyzePdf` to return canned results
- Verify planner selects correct tools for each failing category
- Verify regression detection reverts correctly
- Verify early exit when score >= 90
- Verify max rounds limit

### `tests/remediate.route.test.ts`
- POST PDF with known metadata issues → 200, title/language fixed in response
- POST already-passing PDF → 200, minimal tool applications
- POST scanned PDF (no text) → 200, OCR applied (if tesseract available)
- Verify response shape: `{ before, after, appliedTools, rounds, totalMs }`

### Integration test
- Take 5 lowest-scoring ICJIA fixtures
- Run `remediatePdf()`
- Assert `after.score > before.score`
- Assert `after.score >= 70` for docs that were grade D (score 60–69)

---

## Definition of Done (Phase 2)

- [ ] `POST /v1/remediate` returns remediated PDF + before/after scores
- [ ] Metadata fixes applied for all test PDFs with missing title/language
- [ ] Structure bootstrap works for untagged PDFs
- [ ] Font embedding works for PDFs with missing fonts
- [ ] Heading hierarchy normalization works for docs with skipped levels
- [ ] Bookmark generation works for docs with headings
- [ ] Regression prevention: no test PDF scores lower after remediation
- [ ] All Phase 1 tests still pass
- [ ] Python bridge error handling: timeout/crash does not propagate as 500
- [ ] `pnpm test` passes including new tests
