# Phase 1 — Foundation
## Analysis-Only API

**Goal:** A working `POST /v1/analyze` endpoint that accepts a PDF and returns a WCAG grade, score, and per-category findings. No remediation yet. This is the bedrock everything else builds on.

**Completion criteria:** `pnpm test` passes, `POST /v1/analyze` returns a valid grade for any PDF in the ICJIA corpus.

---

## What Gets Built

```
src/
├── index.ts
├── config.ts
├── types.ts
├── routes/
│   ├── analyze.ts
│   └── health.ts
├── services/
│   ├── analyzer/
│   │   ├── pdfjsService.ts
│   │   ├── qpdfService.ts
│   │   └── pdfAnalyzer.ts
│   └── scorer/
│       └── scorer.ts
├── db/
│   └── schema.ts        (minimal — queue_items only)
tests/
├── fixtures/            (5+ sample PDFs from ICJIA corpus)
├── scorer.test.ts
├── analyzer.test.ts
└── analyze.route.test.ts
package.json
tsconfig.json
.env.example
.gitignore
README.md (initial stub)
```

---

## File Specs

### `src/config.ts`

Single source of truth for all constants. No inline magic numbers anywhere else.

```typescript
export const PORT = Number(process.env.PORT ?? 6200)
export const MAX_FILE_SIZE_MB = 100
export const MAX_CONCURRENT_ANALYSES = 5
export const QPDF_TIMEOUT_MS = 60_000
export const QPDF_MAX_BUFFER_BYTES = 50 * 1024 * 1024

// Scoring weights (must sum to 1.0)
export const SCORING_WEIGHTS = {
  text_extractability: 0.175,
  title_language:      0.130,
  heading_structure:   0.130,
  alt_text:            0.130,
  pdf_ua_compliance:   0.095,
  bookmarks:           0.085,
  table_markup:        0.085,
  color_contrast:      0.045,
  link_quality:        0.045,
  reading_order:       0.040,
  form_accessibility:  0.040,
} as const

// Grade thresholds (inclusive lower bound)
export const GRADE_THRESHOLDS = { A: 90, B: 80, C: 70, D: 60 } as const

// Severity thresholds
export const SEVERITY_THRESHOLDS = { Pass: 90, Minor: 70, Moderate: 40 } as const

// Analysis limits
export const BOOKMARKS_PAGE_THRESHOLD = 10
export const READING_ORDER_DISORDER_THRESHOLD = 0.20
export const COLOR_CONTRAST_SAMPLE_PAGES = 3    // sample first N pages only
export const LINK_GENERIC_PHRASES = ['click here', 'here', 'read more', 'learn more', 'more', 'link']
```

### `src/types.ts`

All shared types. Keep in one file for Phase 1; may split later.

```typescript
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'
export type Severity = 'Pass' | 'Minor' | 'Moderate' | 'Critical'

export type CategoryId =
  | 'text_extractability'
  | 'title_language'
  | 'heading_structure'
  | 'alt_text'
  | 'pdf_ua_compliance'
  | 'bookmarks'
  | 'table_markup'
  | 'color_contrast'
  | 'link_quality'
  | 'reading_order'
  | 'form_accessibility'

export interface CategoryResult {
  id: CategoryId
  label: string
  score: number           // 0–100
  weight: number
  severity: Severity
  findings: Finding[]
  applicable: boolean     // false = excluded from score (e.g. bookmarks on 1-page doc)
}

export interface Finding {
  key: string             // e.g. "missing_document_title"
  message: string
  wcagCriterion?: string  // e.g. "2.4.2"
  blocking: boolean
  count?: number
}

export interface AnalysisResult {
  filename: string
  fileHash: string        // SHA-256 of PDF bytes
  pageCount: number
  score: number           // weighted 0–100
  grade: Grade
  categories: CategoryResult[]
  isTagged: boolean
  isScanned: boolean      // all/most pages are raster images
  hasStructureTree: boolean
  pdfClass: PdfClass
  analysisMs: number
  analyzedAt: string      // ISO timestamp
}

export type PdfClass =
  | 'native_tagged'       // has structure tree, text-based
  | 'native_untagged'     // text-based but no tags
  | 'scanned'             // image-only pages
  | 'mixed'               // some scanned, some text

// Internal extraction types
export interface PdfjsResult {
  pageCount: number
  title: string | null
  language: string | null
  author: string | null
  subject: string | null
  createdAt: string | null
  links: Array<{ url: string; text: string; pageNumber: number }>
  imageCountPerPage: number[]
  textPerPage: string[]
  hasOutlines: boolean
  isEncrypted: boolean
}

export interface QpdfResult {
  hasStructureTree: boolean
  structureTreeDepth: number
  headingCandidates: HeadingInfo[]
  figureCount: number
  figuresWithAlt: number
  figuresWithoutAlt: number
  tableCount: number
  tablesWithHeaders: number
  formFieldCount: number
  bookmarkCount: number
  fonts: FontInfo[]
  links: LinkInfo[]
  mcidCount: number
  isTagged: boolean
  isLinearized: boolean
  tagRoleMap: Record<string, string>
}

export interface HeadingInfo {
  text: string
  level: number | null    // null = candidate (not yet tagged)
  pageNumber: number
  fontSize?: number
}

export interface FontInfo {
  name: string
  isEmbedded: boolean
  isSubset: boolean
  encoding: string | null
  isCidFont: boolean
}

export interface LinkInfo {
  url: string
  text: string | null
  pageNumber: number
  isDescriptive: boolean
}
```

### `src/services/analyzer/pdfjsService.ts`

Extracts text, metadata, links, images from PDF using pdfjs-dist.

**Key function:**
```typescript
export async function extractWithPdfjs(
  buffer: Buffer,
  signal?: AbortSignal
): Promise<PdfjsResult>
```

**Implementation notes:**
- Use `pdfjs-dist/legacy/build/pdf.mjs` (CommonJS-compat build)
- Set `disableFontFace: true`, `useSystemFonts: false` to avoid rendering
- Iterate pages, extract text items, count images via operator list
- Extract metadata from `pdfDocument.getMetadata()`
- Extract outlines with `pdfDocument.getOutline()`
- Normalize link text: trim, collapse whitespace
- Timeout: reject after 60s
- Handle encrypted PDFs gracefully (return minimal result, set `isEncrypted: true`)

### `src/services/analyzer/qpdfService.ts`

Runs `qpdf --json` as a subprocess and parses the JSON to extract structural information.

**Key function:**
```typescript
export async function analyzeWithQpdf(
  buffer: Buffer,
  signal?: AbortSignal
): Promise<QpdfResult>
```

**Implementation notes:**
- Write buffer to temp file, run `qpdf --json --json-stream-data=none <infile>`
- Parse `qpdf-json` format: `/qpdf[1]/pages`, `/qpdf[0]` (trailer/catalog)
- If JSON > 30MB, re-run with `--json-object-streams=disable` and parse subset
- Extract structure tree presence from `/StructTreeRoot` in catalog
- Extract figures by looking for `/Figure` tags in struct tree
- Extract heading candidates by scanning struct tree for `/H`, `/H1`–`/H6` tags
- Extract fonts from `/Font` resources across all pages
- Check `/Marked` in `/MarkInfo` for `isTagged`
- Cleanup temp file in `finally`
- Timeout: `QPDF_TIMEOUT_MS` (60s)

**Parse helpers (private):**
- `parseStructTree(obj)` → depth, figure count, figures with/without alt
- `parseFonts(resources)` → FontInfo[]
- `parseLinks(annots)` → LinkInfo[]
- `parseHeadingCandidates(structTree)` → HeadingInfo[]
- `parseBookmarks(outline)` → count

### `src/services/analyzer/pdfAnalyzer.ts`

Orchestrates pdfjs + qpdf in parallel, combines results, runs scorer.

**Key function:**
```typescript
export async function analyzePdf(
  buffer: Buffer,
  filename: string,
  options?: { signal?: AbortSignal; profile?: 'full' | 'fast' }
): Promise<AnalysisResult>
```

**Implementation:**
```
1. Compute SHA-256 of buffer (fileHash)
2. Run pdfjsService.extractWithPdfjs() and qpdfService.analyzeWithQpdf() in parallel (Promise.all)
3. Merge results into a unified document snapshot
4. Classify PDF (native_tagged / native_untagged / scanned / mixed) based on:
   - qpdf.isTagged → tagged or untagged
   - pdfjs.imageCountPerPage vs text per page → scanned detection
5. Call scorer.scoreDocument(snapshot) → CategoryResult[]
6. Compute weighted score, derive grade
7. Return AnalysisResult
```

**Concurrency:** Use a simple in-module semaphore (counter + Promise queue) to cap at `MAX_CONCURRENT_ANALYSES`.

### `src/services/scorer/scorer.ts`

Pure function — given a document snapshot, returns scored categories and overall grade. No I/O.

**Key function:**
```typescript
export function scoreDocument(doc: DocumentSnapshot): ScoredDocument
```

Where `DocumentSnapshot` is the merged output of pdfjs + qpdf, and `ScoredDocument` is `{ categories: CategoryResult[], score: number, grade: Grade }`.

**Per-category scoring (private functions):**

| Function | Logic |
|---|---|
| `scoreTextExtractability(doc)` | isTagged + hasText + pageCount coverage |
| `scoreTitleLanguage(doc)` | title present, non-empty, non-generic; language tag present |
| `scoreHeadingStructure(doc)` | H1 present, no skipped levels, heading density reasonable |
| `scoreAltText(doc)` | ratio of figures with alt vs without; quality check (not empty, not generic) |
| `scorePdfUaCompliance(doc)` | isTagged + marked + structTree depth + language |
| `scoreBookmarks(doc)` | if pageCount >= threshold: has outlines, adequate depth |
| `scoreTableMarkup(doc)` | ratio of tables with headers |
| `scoreColorContrast(doc)` | heuristic only in Phase 1 (returns 100 if no contrast data) |
| `scoreLinkQuality(doc)` | ratio of descriptive vs generic/raw-URL links |
| `scoreReadingOrder(doc)` | heuristic: if tagged and structTree depth > 2, assume reasonable |
| `scoreFormAccessibility(doc)` | formFieldCount > 0 → check if labeled |

**Helpers:**
- `getGrade(score: number): Grade`
- `getSeverity(score: number): Severity`
- `applyNaWeight(categories)` — if a category is `applicable: false`, redistribute its weight proportionally

**Important:** This is pure TypeScript. No subprocess calls, no I/O, no async.

### `src/routes/analyze.ts`

```typescript
// POST /v1/analyze
// Accepts: multipart/form-data, field "file" (PDF)
// Returns: AnalysisResult JSON
```

Middleware chain:
1. `multer({ storage: memoryStorage(), limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 } })`
2. Validate `file` field present, mimetype check (`application/pdf`), magic bytes check (`%PDF-`)
3. Call `analyzePdf(buffer, filename)`
4. Return 200 with `AnalysisResult`

Error responses:
- 400: missing file, wrong type, too large
- 422: corrupt PDF (qpdf/pdfjs error)
- 503: analysis concurrency limit reached
- 500: unexpected error

### `src/routes/health.ts`

```typescript
// GET /v1/health
// Returns: { status, version, dependencies, uptime }
```

Check:
- `qpdf --version` subprocess (timeout 5s)
- `python3 --version` subprocess (timeout 5s)
- SQLite accessible
- Return status: `ok` | `degraded` | `down`

### `src/index.ts`

Express app setup:

```typescript
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { analyzeRoute } from './routes/analyze.js'
import { healthRoute } from './routes/health.js'
import { PORT } from './config.js'
import { initDb } from './db/schema.js'

const app = express()
app.use(helmet())
app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.use('/v1', analyzeRoute)
app.use('/v1', healthRoute)

await initDb()
app.listen(PORT, () => console.log(`PDFAF v2 listening on port ${PORT}`))
```

### `src/db/schema.ts`

```typescript
// Minimal schema for Phase 1 — just what's needed
// Phases 2+ add tables incrementally

export const SCHEMA_V1 = `
  CREATE TABLE IF NOT EXISTS queue_items (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'queued',
    original_score REAL,
    final_score REAL,
    original_grade TEXT,
    final_grade TEXT,
    error TEXT,
    result_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`
```

---

## Tests

### `tests/scorer.test.ts`
- Unit test each scoring function with known inputs
- Verify grade thresholds (89.9 → B, 90.0 → A)
- Verify N/A weight redistribution
- Verify finding counts match score

### `tests/analyzer.test.ts`
- Integration test: run `analyzePdf()` on 3–5 fixture PDFs
- Assert `grade` is one of A/B/C/D/F
- Assert `pageCount` is correct
- Assert `isTagged` matches known fixture state
- Assert `analysisMs` < 30_000 (30s)

### `tests/analyze.route.test.ts`
- POST with valid PDF → 200 + AnalysisResult shape
- POST with no file → 400
- POST with non-PDF file → 400
- POST with >100MB → 400 (multer limit)

---

## Environment Variables (Phase 1)

```env
PORT=6200
DB_PATH=./data/pdfaf.db
MAX_FILE_SIZE_MB=100
MAX_CONCURRENT_ANALYSES=5
QPDF_TIMEOUT_MS=60000
```

---

## Package.json Scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc --noEmit && tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  }
}
```

---

## Definition of Done (Phase 1)

- [ ] `pnpm install` succeeds
- [ ] `pnpm dev` starts server on port 6200
- [ ] `GET /v1/health` returns `{ status: "ok" }`
- [ ] `POST /v1/analyze` with a test PDF returns grade, score, all 11 categories
- [ ] `pnpm test` passes all tests
- [ ] `pnpm build` produces `dist/` with no type errors
- [ ] Analysis completes in < 20s for a 20-page PDF
- [ ] All ICJIA fixture PDFs produce a grade between F and A (no crashes)
