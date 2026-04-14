# Phase 1 — Foundation
## Analysis-only API (implemented)

**Goal:** `POST /v1/analyze` accepts a PDF and returns a WCAG-aligned grade, weighted score, 11 categories with per-category findings, and metadata needed for later remediation. No remediation in this phase.

**Design note:** An earlier draft of this document specified **`qpdf --json`** as the primary structural extractor. **Shipped Phase 1 uses `pdfjs-dist` + Python (`pikepdf`)** instead: one stack for accurate structure reads today and tag-tree mutations in Phase 2, without maintaining two parsers. The **`qpdf` binary** is still required and probed in **`GET /v1/health`** (operational sanity check).

---

## Learnings from PDFAF v1 (reference codebase)

The original product lives **outside this repository** (sibling checkout `pdfaf/` next to `PDFAF_v2/`, or wherever you clone `https://github.com/.../file-accessibility-audit` / internal PDFAF v1). v2 PRDs should **explicitly mine v1** when choosing tools and limits:

| v1 pain | v2 Phase 1 response |
|--------|---------------------|
| Very large tool surface and orchestration | Small, testable pipeline: pdfjs ∥ Python read, then pure scorer |
| Slow or fragile paths (e.g. pixel contrast, heavy browser stacks) | Phase 1 contrast is **heuristic only**; no Playwright in v2 |
| Hard-to-repeat scoring | **`src/config.ts`** owns weights/thresholds; scorer is **pure** (no I/O) |
| Decorative vs informative figures hard to infer | Score **non-artifact** figures only; defer semantics to Phase 3 |
| Repeat uploads | **SHA-256 cache** (TTL) for identical bytes |

**Product direction (v2):** fast and effective remediation later, with **visual fidelity** as the default (structure/metadata fixes first; avoid full reflow / re-rasterize unless a tool explicitly requires it). Phase 1 establishes measurement (same scorer after each repair in Phase 2).

---

## What was built (repository layout)

```
src/
├── server.ts                 # process entry; listens on PORT
├── app.ts                    # Express app factory
├── config.ts                 # Single source of truth for constants
├── types.ts                  # DocumentSnapshot, AnalysisResult, etc.
├── routes/
│   ├── analyze.ts            # POST /v1/analyze
│   └── health.ts             # GET /v1/health
├── services/
│   ├── pdfAnalyzer.ts        # Orchestrator: hash, cache, semaphore, merge, classify, score, persist
│   ├── pdfjsService.ts       # Worker thread coordinator
│   ├── pdfjsWorker.ts        # pdfjs extraction (runs in worker)
│   ├── pdfjsWorkerBootstrap.mjs  # Registers tsx in worker (dev only)
│   ├── structureService.ts   # Delegates to Python read-only analysis
│   └── scorer/
│       ├── scorer.ts
│       └── categories/*.ts   # 11 category scorers
├── python/
│   └── bridge.ts             # Subprocess wrapper → python/pdf_analysis_helper.py
└── db/
    ├── schema.ts
    └── client.ts

python/
└── pdf_analysis_helper.py    # pikepdf: structure tree, headings, figures, tables, …

tests/
├── scorer.test.ts
└── integration/
    └── analyze.test.ts       # Supertest; optional PDF paths for real-file test
```

---

## Analysis pipeline

1. **Upload:** `multer` disk storage to temp file; max size `MAX_FILE_SIZE_MB`; validate PDF.
2. **Concurrency:** In-module semaphore (`MAX_CONCURRENT_ANALYSES`); over limit → **429**.
3. **Cache:** SHA-256 of file bytes → in-memory result cache (`ANALYSIS_CACHE_TTL_MS`).
4. **Parallel extract:**
   - **pdfjs** (legacy build, internal `pdf.worker`): text per page (sampled), metadata, links, form widgets, image-heavy page heuristic.
   - **Python:** `pdf_analysis_helper.py` JSON to stdout — tagged/marked/lang, headings, figures, tables, bookmarks, structure tree snapshot, etc.
5. **Merge** into `DocumentSnapshot`, **classify** `pdfClass` (`native_tagged` | `native_untagged` | `scanned` | `mixed`).
6. **Score:** `score()` pure function → `AnalysisResult` + persist row in `queue_items`.

Failures in pdfjs or Python are **non-fatal** where designed: partial snapshot + scorer still return a result (degraded but not a blind 500).

---

## Database (Phase 1)

```sql
CREATE TABLE IF NOT EXISTS queue_items (
  id                TEXT PRIMARY KEY,
  filename          TEXT NOT NULL,
  pdf_class         TEXT NOT NULL,
  score             REAL NOT NULL,
  grade             TEXT NOT NULL,
  page_count        INTEGER NOT NULL,
  analysis_result   TEXT NOT NULL,   -- full AnalysisResult JSON
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  duration_ms       INTEGER
);
```

Phase 2+ schema remains **additive** (playbooks, tool_outcomes, etc.).

---

## HTTP API

### `POST /v1/analyze`

- **Body:** `multipart/form-data`, field `file`.
- **200:** `AnalysisResult` JSON (id, timestamp, filename, pageCount, pdfClass, score, grade, categories[], findings[], analysisDurationMs, …).
- **400:** missing/invalid file.
- **429:** concurrency limit.

### `GET /v1/health`

- Probes: `qpdf --version`, `python3`, `import pikepdf`, SQLite `SELECT 1`.
- Returns `status`, `dependencies`, `uptime`.

---

## Tests (Phase 1)

| File | Role |
|------|------|
| `tests/scorer.test.ts` | Weights sum to 1.0; N/A redistribution; grade edges; representative snapshots |
| `tests/integration/analyze.test.ts` | Route 400s; real PDF when available under known search paths (ICJIA dir, v1 `__tests__/fixtures`, etc.); health shape |

**Fixture policy:** The ICJIA corpus may live only on some machines (`pdfaf/ICJIA-PDFs/`). Integration tests **prefer** those paths but **skip** the heavy assertion if no PDF is found; CI should still pass.

---

## Environment variables

See repository **`.env.example`**. Notable: `PORT`, `DB_PATH`, `MAX_FILE_SIZE_MB`, `MAX_CONCURRENT_ANALYSES`, `QPDF_TIMEOUT_MS`.

---

## Scripts

```json
"dev": "tsx watch src/server.ts",
"start": "node dist/server.js",
"build": "tsc --noEmit && tsc",
"test": "vitest run",
"lint": "tsc --noEmit"
```

---

## Definition of done (Phase 1)

- [x] `pnpm install` succeeds (including native `better-sqlite3` where applicable).
- [x] `pnpm dev` serves on port **6200** (or `PORT`).
- [x] `GET /v1/health` returns dependency map; all **ok** when system deps installed.
- [x] `POST /v1/analyze` returns grade, score, **11** categories, findings.
- [x] `pnpm test` passes.
- [x] `pnpm build` emits `dist/` without type errors.
- [x] Typical small/native PDF analyzes in **well under 20s**; cache replay near-instant.
- [ ] **Optional hard gate:** run full ICJIA corpus locally (no crash, grade in A–F) — not committed in-repo; perform before major releases.

When the optional corpus gate is part of your release process, tick the last box in release notes rather than in CI if PDFs are not available.

---

## Deferred / not Phase 1

- `POST /v1/remediate` (Phase 2).
- `qpdf --json` structural parser as a **first-class** analyzer (may still be useful later for spot checks or redundancy).
- Committed ICJIA PDF binaries inside `PDFAF_v2` (optional submodule or download script if desired later).
