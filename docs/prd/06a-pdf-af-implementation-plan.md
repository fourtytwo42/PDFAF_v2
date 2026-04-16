# Phase 6a — PDF AF Web App Implementation Plan
## Architecture, State, Queueing, And Delivery Plan

**Prerequisite:** [06-pdf-af-web-app.md](./06-pdf-af-web-app.md)

**Goal:** Convert the PDF AF product requirements into a concrete implementation plan for a **Next.js + Tailwind CSS v4** frontend that integrates with the PDFAF API, keeps PDFs in browser-local storage only, and ends as a separate Docker container running beside the PDFAF API container.

**Completion criteria:** The team can start implementation without unresolved ambiguity around:

- app architecture
- storage model
- queue model
- API integration
- component boundaries
- initial screen design
- milestone order

---

## 1. Recommended Architecture

## Decision

Build PDF AF as a **Next.js App Router application** with two supported runtime modes:

1. **Development / bare VM mode**
2. **Final Docker deployment mode**

### Development / bare VM mode

- browser uploads directly to PDFAF API
- browser stores original and remediated PDFs in `IndexedDB`
- fastest for local and VM validation

### Final Docker deployment mode

- browser talks to the PDF AF web container
- Next.js route handlers proxy API calls to the PDFAF API container over the internal Docker network
- browser still stores original and remediated PDFs in `IndexedDB`
- the web server remains stateless for PDF bytes

This split is the best fit for the stated delivery path:

- get it working on the bare VM first
- end with a separate Docker container beside the API container

## Consequences

Pros:

- clean VM-first development path
- clean two-container final deployment path
- no PDF persistence on the web server
- browser remains the source of truth for file retention

Tradeoffs:

- development mode requires CORS if API is on another origin
- job continuity ends when browser closes
- large local batches depend on browser storage quota
- final Docker mode means the web server will transiently handle request and response bytes in memory during proxying

Implementation recommendation:

- implement direct browser-to-PDFAF first for speed
- add same-origin proxy routes before final containerization

---

## 2. Application Shape

Recommended location in this repo:

```text
apps/pdf-af-web/
```

Recommended structure:

```text
apps/pdf-af-web/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── api/
│       └── pdfaf/
│           ├── health/route.ts
│           ├── analyze/route.ts
│           └── remediate/route.ts
│   └── globals.css
├── components/
│   ├── branding/
│   ├── upload/
│   ├── queue/
│   ├── detail/
│   ├── settings/
│   └── common/
├── lib/
│   ├── api/
│   ├── storage/
│   ├── queue/
│   ├── zip/
│   ├── format/
│   └── constants/
├── hooks/
├── stores/
├── types/
├── public/
├── package.json
├── tsconfig.json
└── next.config.ts
```

---

## 3. Technology Decisions

## Framework

- **Next.js** with App Router
- **React**
- **TypeScript**

## Styling

- **Tailwind CSS v4**
- CSS variables for theme tokens
- avoid generic admin-dashboard defaults

## Client state

Recommended:

- React state for local component state
- Zustand for app-wide queue/store state

Reason:

- queue and file metadata are app-wide concerns
- Zustand keeps the state model explicit without overengineering

## Browser persistence

Recommended:

- `Dexie` or `idb` for IndexedDB

Use:

- `IndexedDB` for PDFs and job records
- `localStorage` for tiny preferences only

## ZIP generation

Recommended:

- `fflate` or `zip.js`

## Tables and UI primitives

Prefer simple in-house components first.

Do not pull in a large component library unless it clearly reduces risk.

Reason:

- the UI needs to be visually intentional
- table behavior is specialized
- large UI kits often push the design toward generic enterprise patterns

---

## 4. Data Ownership Model

## Browser owns

- original file blobs
- remediated file blobs
- queue metadata
- API results
- selection state
- user preferences

## API owns

- grading
- remediation
- before/after scoring
- applied tool output

## Next.js server owns

- app shell
- optional same-origin proxy routes
- transient request/response streaming only

It must not own PDF persistence.

---

## 5. State Model

There are three main state layers.

## A. Persistent job state

Stored in IndexedDB.

```ts
type JobMode = 'grade' | 'remediate';

type JobStatus =
  | 'idle'
  | 'queued_analyze'
  | 'queued_remediate'
  | 'uploading'
  | 'analyzing'
  | 'remediating'
  | 'done'
  | 'failed'
  | 'canceled';

interface JobRecord {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  updatedAt: string;
  mode: JobMode | null;
  status: JobStatus;
  errorMessage?: string;
  originalBlobKey: string;
  remediatedBlobKey?: string;
  analyzeResult?: AnalyzeResultSummary;
  remediationResult?: RemediationResultSummary;
}
```

## B. UI state

Stored in memory.

Examples:

- open detail drawer id
- visible filters
- current sort
- batch selection map
- upload drag state

## C. User preferences

Stored in `localStorage`.

Examples:

- API base URL
- auto-remediate enabled
- preferred queue concurrency
- compact table mode

---

## 6. IndexedDB Schema

Recommended stores:

1. `jobRecords`
2. `fileBlobs`
3. `settingsCache` (optional; settings can stay in localStorage instead)

### `jobRecords`

Primary key:

- `id`

Indexes:

- `status`
- `createdAt`
- `updatedAt`
- `fileName`

### `fileBlobs`

Primary key:

- `blobKey`

Payload:

- `blob`
- `kind`: `original` | `remediated`
- `jobId`
- `fileName`
- `mimeType`

This split avoids duplicating large metadata with large binary payloads.

---

## 7. Queue Model

## Default behavior

- queue is client-side
- FIFO
- max active jobs default: **2**

Separate logical queues:

- analyze queue
- remediate queue

But they can be implemented as one scheduler with per-job `mode`.

## Scheduler requirements

The scheduler must:

- pick queued items in order
- respect concurrency limit
- update status transitions consistently
- survive page reload through persisted queue state
- detect stale in-flight states on rehydrate

### Stale rehydrate rule

On app start:

- if any job is `uploading`, `analyzing`, or `remediating`
- mark it as `failed` or `idle` with a recoverable message such as:
  - `Previous browser session ended before completion`

Recommended V1 behavior:

- set back to `idle`
- preserve any previous stored result
- let user retry explicitly

## Queue actions

Required:

- enqueue for grade
- enqueue for remediate
- cancel queued
- retry failed
- pause queue
- resume queue

---

## 8. API Client Plan

Create a small dedicated PDFAF client layer:

```text
lib/api/pdfafClient.ts
```

Suggested API:

```ts
interface PdfAfClientConfig {
  baseUrl: string;
}

async function health(): Promise<HealthResponse>;
async function analyze(file: File | Blob, fileName: string): Promise<AnalyzeResponse>;
async function remediate(
  file: File | Blob,
  fileName: string,
  options?: RemediateOptions,
): Promise<RemediateResponse>;
```

Recommended client target selection:

- in development mode, point to the PDFAF API base URL directly
- in final Docker mode, point the browser to same-origin routes such as:
  - `/api/pdfaf/health`
  - `/api/pdfaf/analyze`
  - `/api/pdfaf/remediate`

Requirements:

- use `FormData`
- preserve original filename
- normalize API errors into one app error shape
- return parsed JSON only

Recommended normalized error shape:

```ts
interface AppApiError {
  httpStatus?: number;
  code?: string;
  message: string;
  requestId?: string;
}
```

---

## 9. File Handling Plan

## Add files

When user adds files:

1. validate type is PDF
2. create local `jobRecord`
3. store original file blob in IndexedDB
4. update queue state depending on auto-remediate setting

## Grade flow

1. load original blob from IndexedDB
2. submit to `POST /v1/analyze`
3. store result summary in `jobRecord`
4. mark done

## Remediate flow

1. load original blob from IndexedDB
2. submit to `POST /v1/remediate`
3. store summary in `jobRecord`
4. decode `remediatedPdfBase64` to Blob
5. store remediated blob in IndexedDB
6. mark done

## Final Docker proxy flow

In the final packaged deployment:

1. browser sends request to PDF AF web container
2. Next.js route handler forwards request to internal PDFAF API URL
3. PDFAF API returns JSON
4. browser persists results locally

Constraint:

- the route handler may stream or temporarily buffer request bytes in memory
- it must not write PDFs to disk or durable storage

## Download flow

1. load requested blob from IndexedDB
2. create `Blob`
3. create object URL
4. trigger browser download
5. revoke object URL

---

## 10. Base64 Handling Plan

Remediated PDFs come back as Base64.

Do not keep large Base64 strings in app state longer than necessary.

Required behavior:

1. parse response
2. extract `remediatedPdfBase64`
3. convert to binary `Blob`
4. persist blob in IndexedDB
5. remove the Base64 string from transient state

Reason:

- large strings create memory pressure
- the browser should store blobs, not long-lived Base64 strings

---

## 11. Component Map

## Top-level page

`app/page.tsx`

Responsibilities:

- compose the dashboard
- connect high-level store state
- render upload, actions, table, details

## Upload components

### `UploadDropzone`

Responsibilities:

- drag-and-drop area
- file picker
- client-side validation
- add files action

### `AutoRemediateToggle`

Responsibilities:

- checkbox / switch
- persist preference

## Queue components

### `BatchActionBar`

Responsibilities:

- show selected count
- grade selected
- remediate selected
- retry failed
- download selected zip
- remove selected

### `QueueTable`

Responsibilities:

- render rows
- sorting
- status visuals
- row selection

### `QueueRow`

Responsibilities:

- per-file summary
- per-row actions

## Detail components

### `JobDetailDrawer`

Responsibilities:

- show before/after summary
- show key findings
- show semantic summary
- show download buttons

## Settings components

### `ApiSettingsDialog`

Responsibilities:

- configure API base URL
- test connection with `/v1/health`

---

## 12. Initial Screen Spec

## Header

Contains:

- `PDF AF` brand
- short subtitle
- API status indicator
- settings button

## Hero / upload band

Contains:

- dropzone
- add files button
- auto-remediate checkbox
- small helper text:
  - `Files stay in this browser unless you explicitly process them`

## Batch action bar

Contains:

- selection count
- grade selected
- remediate selected
- retry failed
- download ZIP
- clear completed

## Main work area

Primary content:

- large queue/results table

Secondary content:

- detail drawer from right side

This should feel like one coherent workspace, not multiple disconnected pages.

---

## 13. Visual Design Direction

The app should be:

- bold
- readable
- calm
- not toy-like

Recommended design decisions:

- large typographic logo lockup for `PDF AF`
- one strong accent color
- warm neutral surfaces
- subtle background texture or gradient
- large score chips with clear pass/fail semantics
- simple empty states

Avoid:

- dark-only design
- purple-on-white default aesthetic
- over-animated panels
- tiny text
- dense data-grid styling

---

## 14. Accessibility Implementation Notes

Required:

- keyboard-accessible dropzone
- visible focus outlines
- ARIA labeling for buttons and row actions
- accessible checkbox/select interactions
- clear text labels for statuses
- reduced motion support

Table handling:

- either use semantic table markup correctly
- or use grid/list semantics consistently

Do not build an inaccessible custom grid just to look fancy.

---

## 15. Error Model

Each job row should carry its own error state.

Failure categories:

- invalid file type
- API unreachable
- API timeout
- API rate limited
- API returned 4xx/5xx
- browser storage quota exceeded
- remediated output missing
- ZIP creation failed

UI rules:

- errors must be visible at row level
- detail drawer should show expanded error info
- retry action should be one click

---

## 16. Security And Privacy Rules

Rules for V1:

- do not log file contents
- do not log Base64 PDF payloads
- do not send analytics containing filenames unless explicitly approved later
- do not persist PDFs on the Next.js server
- do not require auth in the browser if the API itself is already internal-only

If public-facing later:

- never embed privileged secrets in client code
- use only a public-safe API URL
- if a proxy is introduced, keep it stateless for file bytes

---

## 17. Milestone Plan

## Milestone 1 — App Skeleton

Deliverables:

- Next.js app scaffold
- Tailwind v4 setup
- base theme
- single dashboard route
- API settings storage

Completion check:

- app loads
- API base URL can be set and health checked

## Milestone 2 — Local File Queue

Deliverables:

- drag-and-drop upload and file picker
- IndexedDB-backed job and blob persistence
- queue table with local-only file rows
- selection model with batch selection controls
- persistence across refresh
- validation, removal, and duplicate-handling rules locked for later milestones

Implementation requirements:

- Add a browser storage layer under `lib/storage/` using `idb` or `Dexie`.
- Store metadata and blobs separately:
  - `jobRecords` for queue metadata/state
  - `fileBlobs` for original file blobs
- A Milestone 2 `JobRecord` must include:
  - `id`
  - `fileName`
  - `fileSize`
  - `mimeType`
  - `createdAt`
  - `updatedAt`
  - `status`
  - `mode`
  - `errorMessage`
  - `originalBlobKey`
  - placeholders for future `analyzeResult`, `remediationResult`, and `findingSummaries`
- Supported statuses in Milestone 2:
  - `idle`
  - `failed`
- Supported modes in Milestone 2:
  - `null`
  - `grade`
  - `remediate`
- Upload acceptance rules:
  - accept PDF files only
  - reject zero-byte files
  - reject files above a configurable client-side size cap aligned to the API default
  - show validation feedback per file
- Duplicate handling:
  - allow duplicates by default
  - each added file gets its own job id even if name and size match another row
- Removal behavior:
  - removing a row deletes its `jobRecord`
  - removing a row deletes its associated blob immediately
- Refresh restore behavior:
  - all stored rows restore from IndexedDB on page load
  - original files remain downloadable after refresh
  - selection state does not persist across refresh
- Table columns in Milestone 2:
  - selection checkbox
  - file name
  - size
  - local status
  - added time
  - row actions
- Row actions in Milestone 2:
  - remove
  - download original
- Upload UI behavior:
  - the dropzone becomes functional
  - adding files appends rows immediately
  - no API calls are made in this milestone
  - auto-remediate remains visible but disabled or clearly labeled as future behavior
- Empty and error states:
  - empty state explains files stay in this browser only
  - storage failure state explains quota/storage availability issues clearly
- Introduce a dedicated queue store separate from the settings store.
- Do not add scheduler logic in Milestone 2; this milestone ends at local queueing and persistence.

Completion check:

- user can add PDFs, reload, and see the same rows restored with originals still downloadable
- invalid files are rejected with clear per-file feedback
- removing a row clears both its metadata and blob

## Milestone 3 — Analyze Flow

Deliverables:

- queue scheduler
- analyze selected
- result rendering
- detail drawer
- finding normalization with standards/help references

Implementation requirements:

- Normalize API findings into UI-facing finding records rather than rendering raw payloads directly.
- Each surfaced finding should support:
  - plain-language title
  - summary
  - category
  - severity or impact
  - `references[]` for standards/help links
- `references[]` should support at least:
  - WCAG 2.1 AA section URLs
  - Adobe Acrobat help URLs
- If the API does not provide stable finding identifiers, add a frontend mapping layer with stable internal ids so the standards links are deterministic.

Completion check:

- user can batch grade files, inspect results, and open finding details with WCAG/Adobe links where mappings exist

## Milestone 4 — Remediation Flow

Deliverables:

- remediate selected
- before/after display
- remediated blob persistence
- single-file downloads

Completion check:

- user can remediate and download a file

## Milestone 5 — Batch Operations

Deliverables:

- auto-remediate toggle
- retry failed
- download selected ZIP
- clear completed
- pause/resume queue

Completion check:

- user can process and download batches cleanly

## Milestone 6 — Polish

Deliverables:

- visual refinement
- accessibility pass
- empty states
- error copy improvements
- performance tuning

Completion check:

- app is usable by non-technical operators

## Milestone 7 — Dockerization And Deployment

Deliverables:

- production build configuration for the web app
- dedicated Dockerfile for PDF AF
- environment contract for internal PDFAF API URL
- Docker networking model with web container beside API container
- final VM validation of the two-container deployment

Completion check:

- web app runs as its own container
- PDFAF API runs as its own container
- web container can successfully call the API container
- end-to-end grading and remediation works in Docker on the VM

---

## 18. Testing Plan

## Unit tests

Test:

- queue transitions
- IndexedDB adapters
- API client error normalization
- Base64-to-Blob conversion
- ZIP assembly

## Integration tests

Test:

- add files
- analyze selected
- remediate selected
- page reload rehydration
- retry failed

## Deployment validation

Test in two stages:

1. bare VM mode
2. final Docker side-by-side mode

Final Docker validation must prove:

- web container reaches PDFAF API container
- grade and remediate both work through the web app
- no PDFs are durably stored on the web server filesystem

## Manual QA checklist

Verify:

- multiple file add
- mixed success/failure batches
- same-file analyze vs remediate.before consistency
- accessible fixture does not falsely improve
- inaccessible fixture improves
- zip download names are correct
- clearing data removes browser-local files

---

## 19. Open Technical Decisions

These are the only meaningful remaining implementation decisions:

1. `Dexie` vs `idb`
2. Zustand vs plain React context
3. `fflate` vs `zip.js`
4. direct browser-to-API vs streaming proxy fallback

Recommended choices:

1. `Dexie`
2. Zustand
3. `fflate`
4. direct browser-to-API for development, same-origin proxy for final Docker deployment

---

## 20. Recommended First Build Order

If implementation starts immediately, do this order:

1. scaffold app
2. build local file store
3. build queue table
4. wire health check and settings
5. implement analyze
6. implement remediate
7. implement downloads
8. implement batch zip
9. add same-origin proxy routes for final deployment
10. polish visuals and accessibility
11. containerize and validate side-by-side Docker deployment

This order minimizes risk because:

- storage and queue are the foundation
- analyze is lighter than remediate
- downloads only matter once result persistence works

---

## Summary

The implementation should be:

- **client-heavy**
- **batch-first**
- **browser-persistent**
- **simple to use**
- **careful with memory and storage**

The main engineering constraints are:

- PDFs stay in the browser
- PDFAF API does the heavy lifting
- queue pressure must be controlled client-side
- results must remain understandable at a glance
- the final deliverable is a separate web container that runs beside the API container on Docker

This plan is intentionally scoped so V1 can ship without auth, collaboration, or server-side queueing, while still being operationally useful.
