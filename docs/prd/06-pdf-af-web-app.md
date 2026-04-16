# Phase 6 — PDF AF Web App
## Next.js Batch Frontend For Grading And Remediation

**Prerequisite:** PDFAF v2 API is already deployed and reachable.

**Goal:** Build a modern, simple, batch-oriented web app for the PDFAF API using **Next.js** and **Tailwind CSS v4**. The app must let users upload multiple PDFs, grade them, remediate them, compare before/after results, and download individual or batch outputs without storing original or remediated PDFs on the web server. The final deployment target is a **separate Docker container** running beside the PDFAF API container.

**Completion criteria:** A user with no CLI knowledge can open the site, drop in PDFs, choose to grade or remediate, review scores and statuses, and download one or many remediated files without confusion.

---

## Product Name

- **Primary name:** PDF Auto Fixer
- **Short name / brand mark:** PDF AF

Suggested UI copy:

- **Title:** PDF AF
- **Subtitle:** Grade PDFs. Fix PDFs. Download results.

---

## Problem Statement

The API works, but it is operationally developer-oriented:

- users must know the endpoints
- users must upload files one by one or script batch flows
- results are JSON-first, not human-first
- there is no queue UX
- there is no visual comparison of before vs after scores
- there is no batch download workflow

We need a browser-based frontend that makes batch PDF grading and remediation usable by non-technical operators while keeping the backend simple.

---

## Core Product Principles

1. **Batch-first:** The app is optimized for many files, not one file at a time.
2. **Simple UI:** Clear actions, obvious statuses, minimal cognitive load.
3. **Eye-catching but restrained:** Strong visual identity, but no gimmicks or clutter.
4. **Browser-local file handling:** Original and remediated PDFs should not persist on the web server.
5. **Actionable results:** Users must immediately understand which files passed, failed, improved, or need manual follow-up.
6. **Safe defaults:** The app should not overload the API or hide expensive operations.

---

## Deployment Target

This work should be delivered in two stages:

1. **Bare VM validation**
2. **Final Dockerized deployment**

### Bare VM validation

During implementation, we can test the web app directly on a VM against a live PDFAF API endpoint.

This is useful for:

- fast iteration
- UI debugging
- API contract validation
- queue and storage behavior testing

### Final Dockerized deployment

The required end state is:

- one container for the PDFAF API
- one separate container for the PDF AF web app
- both containers running on the same VM
- both containers on the same Docker network
- the web container using the PDFAF API container internally

The final packaged app should be able to run beside the API container and use its API over container networking.

---

## Non-Goals

- No user accounts in v1
- No server-side PDF storage
- No shared collaborative workspaces
- No server-side batch queue that continues after the browser closes
- No editing of PDF contents in the browser
- No attempt to reproduce the full raw API JSON in the primary UI
- No replacement for final human accessibility QA

---

## Key Requirement: Browser-Local File Storage

The user requirement is that PDFs must not sit on the server.

That means:

- the web app server must not persist uploads to disk
- the web app server must not write originals or remediated outputs to a database
- the web app server must not upload them to object storage
- the browser is the source of truth for original and remediated files

Transient pass-through in server memory is acceptable if needed for a same-origin proxy in the final Docker deployment. Persistence is not acceptable.

Important implementation clarification:

- **Use IndexedDB for files and result blobs**
- **Use `localStorage` only for tiny preferences**

Reason:

- `localStorage` is too small and string-only for batch PDF workflows
- `IndexedDB` is the correct browser storage for binary data and larger payloads

For this PRD, “browser local storage” means:

- `IndexedDB` for original PDFs, remediated PDFs, and result payloads
- `localStorage` for user preferences like:
  - API base URL
  - auto-remediate on add
  - table density
  - last-used view mode

---

## Target Users

### Primary

- operations staff processing batches of PDFs
- accessibility support staff
- internal users who want a GUI over the PDFAF API

### Secondary

- developers testing API behavior visually
- QA staff validating before/after changes

---

## Supported User Jobs

1. Add one or many PDFs by drag-and-drop or file picker.
2. See a queue/table of all files added in this browser.
3. Grade selected files without remediation.
4. Remediate selected files and view before/after scores.
5. Enable auto-remediation so new files start processing as soon as they are added.
6. Retry failed files.
7. Download a single remediated PDF.
8. Download many remediated PDFs as a ZIP.
9. Remove files from the local queue and clear browser-stored data.
10. See whether a file improved, failed, or still needs manual attention.

---

## Main UX Requirements

## 1. Primary Layout

The app should be a desktop-first dashboard with mobile-safe behavior.

Primary sections:

1. **Header / brand bar**
2. **Upload panel**
3. **Batch action bar**
4. **Queue/results table**
5. **Detail drawer or side panel**

### Visual direction

- clean, bold typography
- bright but controlled accent color
- subtle gradients or shapes for identity
- simple surfaces and strong spacing
- large readable score chips
- no dense enterprise clutter

The UI should feel modern and polished, but not “design for design’s sake.”

---

## 2. Upload Experience

Users can add files via:

- drag-and-drop
- file picker
- multi-select file picker

Upload panel requirements:

- prominent dropzone
- accepted file type: PDF only
- immediate local validation
- obvious count of added files
- option: **Auto-start remediation for newly added files**

When auto-remediate is enabled:

- each new file enters the queue in `queued_remediate`

When auto-remediate is disabled:

- each new file enters the queue in `idle`

---

## 3. Queue / Table Experience

The main table is the core of the app.

Each row should show:

- selection checkbox
- file name
- size
- status
- mode
- before score / grade
- after score / grade
- delta
- last updated time
- per-row actions

Suggested statuses:

- `idle`
- `queued_analyze`
- `queued_remediate`
- `uploading`
- `analyzing`
- `remediating`
- `done`
- `failed`
- `canceled`

Suggested modes:

- `grade`
- `remediate`

Per-row actions:

- Grade
- Remediate
- Retry
- Download original
- Download remediated
- View details
- Remove from queue

Rows should visually emphasize:

- failures
- improvements
- files with no change
- files still processing

---

## 4. Batch Action Experience

The user can select:

- one file
- several files
- all files
- filtered subsets

Batch actions required:

- Grade selected
- Remediate selected
- Retry failed
- Download selected remediated PDFs as ZIP
- Download selected originals as ZIP
- Remove selected
- Clear completed
- Clear all

The batch action bar should:

- appear when one or more rows are selected
- show selected count
- disable actions that do not apply

Examples:

- “Download remediated ZIP” disabled if no selected row has a remediated PDF
- “Retry failed” disabled if no selected row is failed

---

## 5. Details View

Each file needs a details surface that is more readable than raw JSON.

Use a right-side drawer or expandable detail panel showing:

- file metadata
- current status
- before score/grade
- after score/grade
- category breakdown
- top findings
- tools applied
- semantic summary
- error message if failed
- download buttons

If remediation ran, the user should clearly see:

- before vs after
- what changed
- whether semantic passes were used or skipped

---

## Core Feature Set

## Feature A — Grade Only

The user can submit one or many PDFs to `POST /v1/analyze`.

Expected UI output:

- score
- grade
- page count
- PDF class
- category summary
- findings summary

This is the lightweight path for users who only want grading.

---

## Feature B — Grade + Remediate + Re-grade

The user can submit one or many PDFs to `POST /v1/remediate`.

Expected UI output:

- before score/grade
- after score/grade
- improvement badge
- remediated PDF available for download
- summary of applied tools / semantic passes

This is the heavyweight path.

---

## Feature C — Auto-Remediate On Add

Global checkbox:

- **Auto-start remediation for newly added files**

Behavior:

- off: newly added files are stored locally and wait for user action
- on: newly added files immediately enter the remediation queue

This preference must persist across reloads in `localStorage`.

---

## Feature D — Browser-Persistent Queue

If the user refreshes the page:

- queued items should still exist
- completed results should still exist
- downloaded-ready remediated PDFs should still exist

Persistence requirements:

- original PDFs stored in IndexedDB
- remediated PDFs stored in IndexedDB
- job metadata stored in IndexedDB
- lightweight app preferences stored in `localStorage`

If the browser closes during an in-flight request:

- the active network request may terminate
- the app should mark the item as incomplete or failed on next load
- the original file remains locally available for retry

---

## Feature E — Batch ZIP Download

The user must be able to:

- download one remediated PDF
- download selected remediated PDFs as a ZIP
- download all remediated PDFs as a ZIP

Client-side ZIP creation is required.

Use client-side ZIP assembly so files do not get re-uploaded or stored server-side.

Suggested implementation:

- `fflate`, `zip.js`, or similar browser-side ZIP library

ZIP rules:

- include only files with remediated output for remediated ZIPs
- preserve original file names where possible
- suffix remediated files clearly, for example `report-remediated.pdf`

Optional stretch goal:

- include a CSV summary in the ZIP

Not required for v1.

---

## Feature F — Queue Controls And Safety

The app must avoid overwhelming the API.

Client-side queue requirements:

- configurable max concurrent active jobs
- sane default concurrency: **2**
- queued items processed in FIFO order
- separate queue states for analyze and remediate

User controls:

- pause queue
- resume queue
- cancel queued items
- retry failed items

This is especially important because remediation is expensive.

---

## Information Architecture

## Primary screen

Single-page application flow is sufficient for v1:

- `/` — main dashboard

Optional future routes:

- `/settings`
- `/about`

For v1, settings can live in a modal or side sheet.

---

## Data Model (Client-Side)

Proposed local job model:

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

interface PdfJobRecord {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: 'application/pdf';
  createdAt: string;
  updatedAt: string;
  selected: boolean;
  mode: JobMode | null;
  status: JobStatus;
  errorMessage?: string;

  originalFileBlobId: string;
  remediatedFileBlobId?: string;

  analyzeResult?: {
    score: number;
    grade: string;
    pageCount: number;
    pdfClass: string;
    categories: unknown[];
    findings: unknown[];
  };

  remediationResult?: {
    before: { score: number; grade: string; pdfClass: string };
    after: { score: number; grade: string; pdfClass: string };
    improved: boolean;
    appliedTools?: unknown[];
    semantic?: unknown;
    semanticHeadings?: unknown;
    semanticPromoteHeadings?: unknown;
    semanticUntaggedHeadings?: unknown;
  };
}
```

---

## API Integration Requirements

The web app must work against the existing PDFAF API:

- `GET /v1/health`
- `POST /v1/analyze`
- `POST /v1/remediate`

### API base URL

The app needs a configurable API base URL.

Examples:

- `http://localhost:6200`
- `http://192.168.50.169:6200`
- internal hostname or reverse-proxy URL

This value should be configurable:

- by environment variable at build/deploy time
- optionally by a settings UI stored locally in the browser

---

## Direct Browser Calls vs Proxy

Preferred development architecture:

- browser calls PDFAF API directly

Reason:

- fastest path for local and VM testing
- simplest way to validate API integration early

Implication:

- PDFAF API must allow the frontend origin via CORS if on another host/origin

Preferred final deployment architecture:

- browser calls the PDF AF web app origin
- the web app forwards API requests to PDFAF over the internal Docker network

Reason:

- cleaner packaged deployment
- avoids cross-origin browser issues in the final runtime
- lets the web container talk to the API container by service name or internal hostname
- results in a simple “frontend container beside API container” deployment model

Constraint if proxying is used:

- no persistence to disk
- no persistence to DB
- no object storage
- request and response bytes may transit server memory only

Final recommendation:

- use direct browser-to-PDFAF for development and bare-VM testing
- use a stateless same-origin proxy path in the final Docker deployment

---

## UX Flows

## Flow 1 — Grade a batch

1. User opens site.
2. User drops in 10 PDFs.
3. Files appear in `idle`.
4. User selects all.
5. User clicks `Grade Selected`.
6. Queue runs with concurrency limit.
7. Rows update with score, grade, and findings summary.

---

## Flow 2 — Remediate a subset

1. User has 20 PDFs loaded.
2. User selects 4 poor-scoring files.
3. User clicks `Remediate Selected`.
4. Queue runs remediation.
5. UI displays before vs after scores.
6. User downloads only those 4 remediated outputs.

---

## Flow 3 — Auto-remediate on add

1. User enables `Auto-start remediation for newly added files`.
2. User drags in 15 PDFs.
3. Each file is stored locally and queued immediately.
4. Results fill in as jobs complete.
5. User downloads all remediated PDFs as ZIP.

---

## Flow 4 — Resume after refresh

1. User previously added files and processed some.
2. User reloads the page.
3. Queue and stored files rehydrate from IndexedDB.
4. Completed items still show scores and downloads.
5. Failed or interrupted items can be retried.

---

## Functional Requirements

## Must Have

- Next.js frontend
- Tailwind CSS v4 styling
- drag-and-drop and file picker upload
- multi-file queue
- grade selected
- remediate selected
- auto-remediate-on-add checkbox
- before/after score display
- batch selection
- batch ZIP download
- individual file download
- browser-local persistence
- no server-side file persistence
- API base URL configuration
- queue concurrency control
- failed-state handling and retry

## Should Have

- filter rows by status
- search by filename
- sort by score, delta, status, date added
- show semantic-use summary in details panel
- pause/resume queue
- clear completed

## Nice To Have

- CSV export of results summary
- keyboard shortcuts for selection/actions
- toast notifications
- dark mode
- PWA/offline shell

---

## Design Requirements

The design should be:

- eye-catching
- highly readable
- simple
- trustworthy
- calm

Specific requirements:

- strong visual hierarchy
- avoid tiny text
- avoid over-dense tables
- use color for state, but not as the only signal
- obvious primary actions
- obvious distinction between grading and remediation
- no confusing hidden controls

Suggested content emphasis:

- upload area first
- batch actions second
- table as main work surface
- details as secondary surface

---

## Accessibility Requirements For The Web App

The app itself should be accessible.

Requirements:

- keyboard-navigable upload and table actions
- visible focus states
- accessible table semantics or equivalent list/grid semantics
- sufficient color contrast
- status text not color-only
- screen-reader labels for buttons and row actions
- reduced-motion friendly

---

## Technical Stack

Recommended stack:

- **Next.js** with App Router
- **React**
- **Tailwind CSS v4**
- **TypeScript**
- **IndexedDB** wrapper such as `idb` or `Dexie`
- **Client-side state** via React state plus a lightweight store such as Zustand if needed
- **Client-side ZIP** via `fflate`, `zip.js`, or equivalent

Architectural guidance:

- keep the app client-heavy
- use server components only where they provide clear benefit
- core queue, storage, and upload/remediation logic should live client-side

---

## Proposed Repository Shape

If built in this repo, add:

```text
PDFAF_v2/
├── apps/
│   └── pdf-af-web/
│       ├── app/
│       ├── components/
│       ├── lib/
│       ├── hooks/
│       ├── stores/
│       ├── styles/
│       ├── public/
│       ├── package.json
│       └── tailwind.config.ts
└── docs/prd/
    └── 06-pdf-af-web-app.md
```

Alternative acceptable structure:

- separate repo

But for initial development, keeping it in the same repo is operationally simpler.

---

## Operational Constraints

Because the browser holds the files:

- browser storage quota may be hit on very large batches
- app must surface storage failures clearly
- app must give users a one-click way to clear stored files/results

Because remediation is expensive:

- the client must not default to high concurrency
- the UI should surface “processing may take time”

Because there is no server-side queue in v1:

- long jobs do not continue after the browser is closed
- interrupted jobs must be restartable from locally stored originals

Because the final deployment is Dockerized:

- the web app must ship as its own container image
- the web app must be configurable with the internal PDFAF API URL
- the final deployment docs should include a two-container Compose example

---

## Error Handling Requirements

The app must clearly distinguish:

- upload/input validation errors
- API unreachable
- API timeout
- API rate-limited
- API returned invalid response
- remediation failed
- browser storage quota exceeded

Every failed row needs:

- a human-readable message
- raw code if available
- a retry action

---

## Performance Targets

These are UX targets, not hard backend SLAs:

- add files to queue: immediate
- initial row rendering after drop: under 500ms for small batches
- status updates should feel live
- queue should remain responsive with at least 100 rows
- table operations should not freeze the UI

---

## Security And Privacy

V1 privacy posture:

- no server-side PDF persistence in the web app
- all sensitive document retention is browser-local only
- no analytics that transmit file names or PDF contents
- no hidden uploads other than the explicit API calls the user initiates

If the app becomes public-facing later:

- expose only the minimum frontend config
- do not embed secrets in the browser
- prefer public-safe PDFAF API access patterns or an authenticated proxy

---

## Open Questions

These are the main decisions to settle before implementation:

1. Will the browser call PDFAF directly, or must we ship a thin Next.js proxy for network policy reasons?
2. Do we want only one global queue, or separate tabs/views for `All`, `Queued`, `Completed`, and `Failed`?
3. Do we want CSV export in v1 or defer it?
4. Should the app support folder uploads where the browser allows it, or files only?
5. What is the desired default for the auto-remediate checkbox: off or on?

Recommended answers for v1:

1. direct browser-to-PDFAF if possible
2. one main table with simple filters
3. defer CSV export
4. files only
5. default off

---

## Recommended V1 Scope

Build this first:

- single-page dashboard
- upload/dropzone
- IndexedDB local persistence
- queue table
- grade selected
- remediate selected
- auto-remediate checkbox
- detail drawer
- per-file download
- selected/all ZIP download
- retry and remove actions
- API base URL setting

Do not build yet:

- auth
- server queue
- collaboration
- advanced analytics
- rich reporting exports

---

## Summary

PDF AF should be a **simple, visually strong, batch-first frontend** for the PDFAF API.

It must let users:

- add many PDFs
- grade them
- remediate them
- compare before/after results
- download one or many outputs

The critical architectural rule is:

- **PDF files stay in the browser, not on the web server**

That drives the main implementation decisions:

- client-heavy Next.js app
- browser-side queue
- IndexedDB for file and result storage
- direct API calls to PDFAF when possible
- client-side ZIP generation for batch downloads
