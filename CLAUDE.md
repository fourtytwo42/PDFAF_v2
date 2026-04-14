# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PDFAF v2 is a REST API (port **6200**) that grades and remediates PDFs for WCAG 2.1 AA / ADA Title II compliance. It is a ground-up rewrite of PDFAF v1, designed to be 10x leaner (~20 tools vs. 81, ~500-line orchestrator vs. 8100 lines).

The codebase is **not yet built** — only the PRD documentation exists. Implementation follows a 5-phase plan in `docs/prd/`.

## Commands

```bash
pnpm install         # Install dependencies
pnpm dev             # Start dev server with hot reload (tsx watch)
pnpm build           # Type check + compile to dist/
pnpm start           # Run compiled output
pnpm test            # Run all tests (vitest run)
pnpm test:watch      # Vitest in watch mode
pnpm lint            # Type check only (tsc --noEmit)
```

Run a single test file:
```bash
pnpm vitest run tests/scorer.test.ts
```

## Architecture

### Request Flow

```
POST /v1/analyze → routes/analyze.ts
  → pdfAnalyzer.ts (orchestrator)
      → pdfjsService.ts  ─┐ parallel
      → qpdfService.ts   ─┘
  → scorer.ts (pure function, no I/O)
  → AnalysisResult JSON

POST /v1/remediate → routes/remediate.ts (Phase 2+)
  → remediation/orchestrator.ts
      → planner.ts (selects tools based on failing categories)
      → tools/*.ts (deterministic repairs via pdf-lib + Python subprocess)
      → semantic/semanticService.ts (optional LLM pass, Phase 3+)
  → re-analyze → return remediated PDF
```

### Key Architectural Constraints

- **`src/config.ts`** is the single source of truth for all constants — no inline magic numbers anywhere else. Scoring weights are here and must sum to 1.0.
- **`src/services/scorer/scorer.ts`** is a pure function with zero I/O and no async. Given a `DocumentSnapshot`, it returns scored categories and a grade.
- **`src/python/bridge.ts`** wraps Python subprocess calls. The Python script (`python/pdf_structure_helper.py`) uses pikepdf for tag tree surgery — this is the only reliable option for PDF structure mutations.
- **pdfjs + qpdf run in parallel** via `Promise.all` in `pdfAnalyzer.ts`. pdfjs handles text/metadata extraction; qpdf handles structural analysis (structure tree, headings, fonts, figures).
- Remediation runs in **3 deterministic stages** + 1 optional LLM pass. Each stage commits atomically (commit-or-rollback). The loop stops when grade A is reached or no improvement is seen — max 3 rounds.
- **Concurrency** is capped via an in-module semaphore in `pdfAnalyzer.ts` (`MAX_CONCURRENT_ANALYSES = 5`).

### PDF Classification

PDFs are classified as `native_tagged`, `native_untagged`, `scanned`, or `mixed` based on the combination of `qpdf.isTagged` and pdfjs image vs. text ratio per page. The `pdfClass` field affects which remediation tools are applicable.

### Scoring

11 categories with fixed weights (see `config.ts`). If a category is `applicable: false` (e.g., bookmarks on a 1-page doc), its weight is redistributed proportionally to other categories. The `BOOKMARKS_PAGE_THRESHOLD` is 10 pages.

### Database (SQLite via better-sqlite3)

Phase 1 has a single `queue_items` table. Phases 2+ add `playbooks` and `tool_outcomes` tables. Schema lives in `src/db/schema.ts`.

### LLM Integration (Phase 3+)

Uses an OpenAI-compatible endpoint, configured entirely via environment variables (`OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_API_KEY`, `OPENAI_COMPAT_MODEL`). Works with Claude, GPT-4, or local models.

## System Dependencies

- **`qpdf`** binary — required (`apt install qpdf`)
- **Python 3** + `pip install pikepdf fonttools` — required for structure mutations
- **`tesseract`** — optional, for scanned PDFs (`apt install tesseract-ocr`)

## Environment Variables

```env
PORT=6200
DB_PATH=./data/pdfaf.db
MAX_FILE_SIZE_MB=100
MAX_CONCURRENT_ANALYSES=5
QPDF_TIMEOUT_MS=60000

# Phase 3+ LLM (optional)
OPENAI_COMPAT_BASE_URL=
OPENAI_COMPAT_API_KEY=
OPENAI_COMPAT_MODEL=gpt-4o
OPENAI_COMPAT_FALLBACK_BASE_URL=
OPENAI_COMPAT_FALLBACK_API_KEY=
OPENAI_COMPAT_FALLBACK_MODEL=
```

## Build Phases

Each phase delivers a working, testable system. Phase N+1 must not break Phase N tests.

| Phase | Deliverable |
|---|---|
| 1 | `POST /v1/analyze` returns grade — see `docs/prd/01-phase1-foundation.md` |
| 2 | `POST /v1/remediate` returns fixed PDF |
| 3 | LLM-assisted alt text and headings |
| 4 | Learning/playbooks (fast path for repeat doc patterns) |
| 5 | OpenAPI spec, Docker, production polish |
