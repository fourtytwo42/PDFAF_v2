# PDFAF v2 — Product Requirements Document
## Overview & Vision

---

## What Is This

PDFAF v2 is a lean, fast, and reliable PDF accessibility grading and remediation API. It accepts a PDF, grades it against WCAG 2.1 AA / ADA Title II requirements, and optionally applies automated repairs to improve the grade.

This is a ground-up rewrite distilling lessons from PDFAF v1. It is API-only (no frontend), runs as a single Node.js process (no separate services), and is designed to be deployed on a bare VM or in a container with minimal dependencies.

**Production target:** Port **6200** (separate from PDFAF v1 at 6103).

### PDFAF v1 (reference codebase — not this repo)

The original implementation is maintained **outside `PDFAF_v2`** (for example a sibling directory `pdfaf/` on the same machine, or your internal monorepo path). Use it as the **living textbook** for what worked and what hurt:

- **Scoring and findings:** Match user expectations from v1 (explainable categories, stable weights).
- **Performance:** Avoid v1’s heaviest paths as defaults (e.g. full pixel contrast stacks where unnecessary).
- **Remediation breadth vs depth:** v1’s very large tool count taught us to prefer **fewer, composable tools** with **measurable** grade deltas.
- **Visual fidelity:** Prefer **tag/metadata/annotation** fixes that preserve appearance; reserve layout-changing or re-rasterizing tools for explicit cases and document them in tool outcomes.

Whenever v2 behavior is ambiguous, **reproduce on v1**, compare outcomes, and update this PRD or `CLAUDE.md` so both codebases don’t drift silently.

**Distilled lessons** from v1’s long operational log (`pdfaf/MEMORY.md`): **`docs/prd/learnings-from-v1-memory.md`**. **How v1’s code actually fixes PDFs** (agent loop, Python helper, planner stages): **`docs/prd/v1-remediation-implementation-survey.md`**. **Prioritized backlog** (faster / more effective / efficient): **`docs/prd/v2-opportunities-from-v1.md`**.

---

## Why v2

PDFAF v1 works but carries significant complexity:

| Problem in v1 | v2 Solution |
|---|---|
| 81 remediation tools, 8100-line orchestrator | ~20 core tools, ~500-line orchestrator |
| 8-round agent loop with LLM planner | 3-round deterministic stages + 1 optional LLM pass |
| 40-column SQLite queue schema | 10-column schema |
| Separate Python server, Adobe SDK, veraPDF | Subprocess-only Python, no external services |
| Playwright color contrast (120s) | Optional, fast-sampled only |
| No domain awareness in alt-text | Domain detection informs LLM prompts |
| Open-loop planning | Criterion-anchored tool selection |
| No transactional batch commits | Stage batches commit-or-rollback atomically |

**Goal:** 10x leaner codebase, same or better accessibility outcomes.

---

## Core Capabilities

### Grading
- 11 WCAG-aligned scoring categories
- Weighted score (0–100), letter grade (A–F)
- Per-category findings with WCAG criterion references
- Fast path: ~10–15 seconds per PDF

### Remediation
- Deterministic repairs first (metadata, structure, fonts, links, tables)
- **General-purpose:** planner driven only by **analysis + config** — no publication IDs, corpus names, or v1-style “family” labels in core code (see Phase 2 PRD *Generalization*)
- Optional semantic pass (LLM-assisted alt text and heading proposals)
- Re-grades after each stage; stops when grade A reached or no improvement
- Returns: remediated PDF, before/after scores, applied tool log, HTML report

### Learning
- Caches successful remediation sequences as playbooks (keyed by failure signature)
- Tracks per-tool success rates by PDF class
- Replays playbooks for matching documents (fast path)

---

## Non-Goals (v2 Scope)

- No frontend web UI
- No user authentication (API key optional, off by default)
- No batch queue management UI
- No Adobe Accessibility Checker integration
- No veraPDF integration
- No Playwright color contrast (color contrast is scored via heuristics only)
- No multi-tenant isolation

---

## Technical Stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | Node.js 22, TypeScript | Same as v1, proven |
| Package manager | pnpm | Same as v1 |
| HTTP server | Express 4 | Minimal, well-known |
| Text / links / page heuristics | pdfjs-dist (legacy build + worker in Node) | Fast extraction without a browser |
| Structure / tags / figures / tables | Python 3 + **pikepdf** (subprocess, JSON) | Same stack as Phase 2 mutations; reliable struct tree access |
| Ops / sanity | **qpdf** binary | Health check and optional future use; not the primary struct parser in Phase 1 |
| PDF mutation (Phase 2+) | pdf-lib where appropriate; pikepdf for tag tree | Pure JS for simple edits; Python for structure |
| Structure mutation (Phase 2+) | Extend `python/pdf_analysis_helper.py` | One script path for analyze + repair |
| Database | better-sqlite3 | Lightweight, no server |
| LLM | OpenAI-compatible endpoint (env-configured) | Works with Claude, GPT-4, local Gemma, etc. |
| Testing | Vitest | Same as v1 |
| Port | 6200 | Different from v1 (6103) |

---

## API Surface (Final)

```
POST /v1/analyze          — Grade a PDF (no remediation)
POST /v1/remediate        — Grade + remediate + re-grade
GET  /v1/health           — Service status + dependency check
GET  /v1/playbooks        — View learned playbook entries
```

---

## Scoring Categories

| Category | Weight | What It Checks |
|---|---|---|
| text_extractability | 17.5% | PDF is text-based and tagged |
| title_language | 13.0% | Document has title and language metadata |
| heading_structure | 13.0% | Proper H1–H6 hierarchy |
| alt_text | 13.0% | Images/figures have descriptions |
| pdf_ua_compliance | 9.5% | PDF/UA conformance markers |
| bookmarks | 8.5% | Outline present on 10+ page docs |
| table_markup | 8.5% | Tables have header cells |
| color_contrast | 4.5% | Text meets 4.5:1 / 3:1 WCAG ratios |
| link_quality | 4.5% | Links have descriptive text |
| reading_order | 4.0% | Content reads in logical sequence |
| form_accessibility | 4.0% | Form fields have labels |

**Grade Scale:**
- A: 90–100
- B: 80–89
- C: 70–79
- D: 60–69
- F: 0–59

---

## Build Phases

| Phase | Name | Deliverable | Key Milestone |
|---|---|---|---|
| 1 | Foundation | Analysis-only API | `POST /v1/analyze` returns grade |
| 2 | Deterministic Remediation | Repair pipeline | `POST /v1/remediate` returns fixed PDF |
| 3 | Semantic Remediation | LLM alt-text + headings | Alt text quality improves grade |
| 4 | Learning & Playbooks | Adaptive fast path | Repeat docs remediate in < 5s |
| 5 | Polish & Release | Docs, OpenAPI, Docker | Production-ready |

Each phase produces a working, testable system. Phase N+1 builds on Phase N without breaking existing tests.

---

## Repository structure (Phase 1 shipped; later phases additive)

```
PDFAF_v2/
├── src/
│   ├── server.ts                   # Entry: listen, DB init
│   ├── app.ts                      # Express factory
│   ├── config.ts                   # Constants (weights, thresholds, paths)
│   ├── types.ts
│   ├── routes/
│   │   ├── analyze.ts              # POST /v1/analyze
│   │   └── health.ts               # GET /v1/health
│   ├── services/
│   │   ├── pdfAnalyzer.ts          # Orchestrator
│   │   ├── pdfjsService.ts
│   │   ├── pdfjsWorker.ts
│   │   ├── pdfjsWorkerBootstrap.mjs
│   │   ├── structureService.ts     # → Python read-only JSON
│   │   └── scorer/ …
│   ├── python/
│   │   └── bridge.ts               # Subprocess wrapper
│   └── db/
│       ├── schema.ts
│       └── client.ts
├── python/
│   └── pdf_analysis_helper.py      # pikepdf: Phase 1 analysis; Phase 2 + mutations
├── docs/prd/                       # This folder
├── tests/
│   ├── scorer.test.ts
│   └── integration/analyze.test.ts
├── package.json
├── tsconfig.json
├── .env.example
└── …
```

**Phase 2+** adds `routes/remediate.ts`, `services/remediation/**`, semantic/learning modules, etc., without breaking Phase 1 tests. See `02-phase2-deterministic-remediation.md`.

---

## External Dependencies Summary

### Required binaries
- `qpdf` — probed in `/v1/health`; all dependencies **ok** is required for HTTP 200 (install on any serious deployment)
- `python3` + `pip install pikepdf fonttools` — structural analysis (Phase 1) and tag mutations (Phase 2+)

### Optional binaries
- `tesseract` — OCR for scanned PDFs (remediation / later phases)

### Required npm packages (Phase 1)
- `express`, `multer`, `pdfjs-dist`, `better-sqlite3`, `zod` (see `package.json` for authoritative list)

### Phase 2+ npm (planned / as needed)
- `pdf-lib`, `@pdf-lib/fontkit` — deterministic repairs where pure-JS is enough

### Optional npm Packages
- `openai` or any OpenAI-compat client — for semantic LLM pass

### Not Required (v2 cuts)
- `@adobe/pdfservices-node-sdk`
- `playwright`
- `nodemailer`, `jsonwebtoken`, `bcryptjs`
- `archiver`
- veraPDF (Java binary)

---

*See individual phase PRDs for detailed implementation specs.*
