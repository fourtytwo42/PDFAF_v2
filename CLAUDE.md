# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PDFAF v2 is a REST API (port **6200**) that grades and remediates PDFs for WCAG 2.1 AA / ADA Title II compliance. It is a ground-up rewrite of PDFAF v1, designed to be 10x leaner (~20 tools vs. 81, ~500-line orchestrator vs. 8100 lines).

**Phase 1 is implemented** (`POST /v1/analyze`, `GET /v1/health`, scorer, pdfjs + Python analysis). Later phases follow `docs/prd/`. **PDFAF v1** lives outside this repo (e.g. sibling `pdfaf/`); mine it for behavior and regressions when specs are unclear.

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

Corpus baseline (20 PDFs under `Input/corpus_from_pdfaf_v1/`): deterministic + optional `--semantic` (requires `OPENAI_COMPAT_*`). All scores ≥80 with `--semantic` when an LLM is reachable.
```bash
pnpm exec tsx scripts/baseline-corpus-batch.ts [inputDir] [outputDir] --no-pdfs
pnpm exec tsx scripts/baseline-corpus-batch.ts [inputDir] [outputDir] --semantic --no-pdfs
```

## Architecture

### Request Flow

```
POST /v1/analyze → routes/analyze.ts
  → pdfAnalyzer.ts (orchestrator)
      → pdfjsService.ts    ─┐ parallel
      → structureService.ts ─┘ → python/bridge.ts → pdf_analysis_helper.py (pikepdf)
  → scorer.ts (pure function, no I/O)
  → AnalysisResult JSON

POST /v1/remediate → routes/remediate.ts (Phase 2 + optional Phase 3)
  → analyzePdf → remediation/orchestrator.ts (deterministic rounds)
      → planner.ts → tools/*.ts + python bridge mutations
  → optional `semantic: true` / `semanticHeadings: true` / `semanticPromoteHeadings: true` / `semanticUntaggedHeadings: true` (3c-c golden-only experimental) in multipart field `options` (JSON)
      → semantic/semanticService.ts (figures), headingSemantic.ts (existing heading levels), promoteHeadingSemantic.ts (promote /P → Hn)
      → layout/layoutAnalyzer.ts (pdfjs: captions, repeated header/footer bands, median font height) feeds figure prompts and promote filtering
      → LLM batches: on timeout/abort any batch, pass returns original buffer with `skippedReason: llm_timeout` (fail-closed). `req` close aborts in-flight LLM via `AbortSignal`.
  → JSON + base64 PDF (semantic summaries when requested)
```

**OCR / scoring transparency:** When `ocr_scanned_pdf` runs, `RemediationResult` includes **`ocrPipeline`** (`applied`, `humanReviewRecommended`, `guidance`). If PDF **Producer/Creator** indicates OCRmyPDF/Tesseract, **`text_extractability`** adds a **moderate finding**; optionally **cap** the numeric score via `PDFAF_OCR_METADATA_TEXT_EXTRACTABILITY_CAP` (default **100** = finding only, no penalty; set e.g. **88** for stricter internal grading). HTML reports with `htmlReport: true` show an **OCR notice** section when applicable.

### Key Architectural Constraints

- **`src/config.ts`** is the single source of truth for all constants — no inline magic numbers anywhere else. Scoring weights are here and must sum to 1.0.
- **`src/services/scorer/scorer.ts`** is a pure function with zero I/O and no async. Given a `DocumentSnapshot`, it returns scored categories and a grade.
- **`src/python/bridge.ts`** wraps Python subprocess calls. The script **`python/pdf_analysis_helper.py`** uses pikepdf for structural **analysis** (Phase 1) and will gain **mutations** (Phase 2+). **`qpdf`** is probed in `/v1/health` only; it is not the primary structural parser in the analyzer.
- **pdfjs + Python (pikepdf) run in parallel** via `Promise.all` in `pdfAnalyzer.ts`. pdfjs handles text/metadata/links/widgets; Python returns structure tree, headings, figures, tables, bookmarks, tags/marked/lang, etc.
- Remediation runs in **3 deterministic stages** + 1 optional LLM pass. Each stage commits atomically (commit-or-rollback). The loop stops when grade A is reached or no improvement is seen — max 3 rounds.
- **Concurrency** is capped via an in-module semaphore in `pdfAnalyzer.ts` (`MAX_CONCURRENT_ANALYSES = 5`).

### PDF Classification

PDFs are classified as `native_tagged`, `native_untagged`, `scanned`, or `mixed` based on **pikepdf `isTagged`** (and related structure signals) plus **pdfjs** text vs. image-heavy page heuristics. The `pdfClass` field affects which remediation tools are applicable.

### Scoring

11 categories with fixed weights (see `config.ts`). If a category is `applicable: false` (e.g., bookmarks on a 1-page doc), its weight is redistributed proportionally to other categories. The `BOOKMARKS_PAGE_THRESHOLD` is 10 pages.

### Database (SQLite via better-sqlite3)

Phase 1 has a single `queue_items` table. Phases 2+ add `playbooks` and `tool_outcomes` tables. Schema lives in `src/db/schema.ts`.

### LLM Integration (Phase 3+)

Uses OpenAI-compatible `/v1/chat/completions` (`getOpenAiCompatBaseUrl()` etc. read `process.env` at call time). **Embedded mode:** set `PDFAF_RUN_LOCAL_LLM=1` and leave `OPENAI_COMPAT_BASE_URL` unset — `src/server.ts` starts `llama-server` (see `src/llm/embedLocalLlama.ts`, defaults: `unsloth/gemma-4-E2B-it-GGUF` + `gemma-4-E2B-it-Q4_K_M.gguf`, same weights family as `google/gemma-4-E2B-it`). **Sidecar / Docker:** `docker-compose.yml` runs `ghcr.io/ggml-org/llama.cpp:server` plus `pdfaf`; set `OPENAI_COMPAT_BASE_URL` + `OPENAI_COMPAT_MODEL_AUTO=1` so `src/llm/syncRemoteOpenAiModel.ts` picks the model id from `GET /v1/models`. Default model id when env is empty is `google/gemma-4-E2B-it` (external servers); embedded startup always sets `OPENAI_COMPAT_MODEL` from `GET /v1/models` to match the GGUF id llama-server exposes.

## System Dependencies

- **`qpdf`** binary — required (`apt install qpdf`)
- **Python 3** + `pip install pikepdf fonttools` — required for structural analysis (Phase 1) and tag mutations (Phase 2+)
- **`ocrmypdf`** + **`tesseract-ocr`** + **`ghostscript`** — optional, for `ocr_scanned_pdf` remediation on scanned / mixed PDFs (`apt install ocrmypdf tesseract-ocr-eng ghostscript`; add `tesseract-ocr-<lang>` as needed)

## Environment Variables

```env
PORT=6200
DB_PATH=./data/pdfaf.db
MAX_FILE_SIZE_MB=100
MAX_CONCURRENT_ANALYSES=5
QPDF_TIMEOUT_MS=60000

# Phase 3+ LLM (optional) — default model google/gemma-4-E2B-it; see .env.example for Gemma 4 E2B GGUF / llama-server notes
OPENAI_COMPAT_BASE_URL=
OPENAI_COMPAT_API_KEY=
OPENAI_COMPAT_MODEL=google/gemma-4-E2B-it
OPENAI_COMPAT_FALLBACK_BASE_URL=
OPENAI_COMPAT_FALLBACK_API_KEY=
OPENAI_COMPAT_FALLBACK_MODEL=google/gemma-4-E2B-it

# Phase 3 layout / prompts (optional tuning; see .env.example for full list)
# SEMANTIC_LAYOUT_* , SEMANTIC_PROMOTE_LAYOUT_TEXT_MIN_LEN , SEMANTIC_FIGURE_PROMPT_MAX_* 
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
