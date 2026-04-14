# PDFAF v2 — Product Requirements Document
## Overview & Vision

---

## What Is This

PDFAF v2 is a lean, fast, and reliable PDF accessibility grading and remediation API. It accepts a PDF, grades it against WCAG 2.1 AA / ADA Title II requirements, and optionally applies automated repairs to improve the grade.

This is a ground-up rewrite distilling lessons from PDFAF v1. It is API-only (no frontend), runs as a single Node.js process (no separate services), and is designed to be deployed on a bare VM or in a container with minimal dependencies.

**Production target:** Port **6200** (separate from PDFAF v1 at 6103).

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
| PDF parsing | pdfjs-dist + qpdf binary | Best combo for text + structure |
| PDF mutation | pdf-lib + @pdf-lib/fontkit | Pure JS, reliable |
| Structure mutation | Python 3 + pikepdf + fonttools (subprocess) | Only reliable option for tag tree surgery |
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

## Repository Structure (Final State)

```
PDFAF_v2/
├── src/
│   ├── index.ts                    # Express entry point, port 6200
│   ├── config.ts                   # All constants (weights, thresholds, ports)
│   ├── types.ts                    # Shared TypeScript types
│   ├── routes/
│   │   ├── analyze.ts
│   │   ├── remediate.ts
│   │   └── health.ts
│   ├── services/
│   │   ├── analyzer/
│   │   │   ├── pdfjsService.ts
│   │   │   ├── qpdfService.ts
│   │   │   └── pdfAnalyzer.ts
│   │   ├── scorer/
│   │   │   └── scorer.ts
│   │   ├── remediation/
│   │   │   ├── orchestrator.ts
│   │   │   ├── planner.ts
│   │   │   └── tools/
│   │   │       ├── metadata.ts
│   │   │       ├── structure.ts
│   │   │       ├── fonts.ts
│   │   │       ├── figures.ts
│   │   │       ├── headings.ts
│   │   │       ├── tables.ts
│   │   │       ├── links.ts
│   │   │       ├── bookmarks.ts
│   │   │       └── ocr.ts
│   │   ├── semantic/
│   │   │   ├── semanticService.ts
│   │   │   └── domainDetector.ts
│   │   ├── layout/
│   │   │   └── layoutAnalyzer.ts
│   │   └── learning/
│   │       ├── playbookStore.ts
│   │       └── toolOutcomes.ts
│   ├── db/
│   │   └── schema.ts
│   └── python/
│       └── bridge.ts               # Subprocess wrapper
├── python/
│   └── pdf_structure_helper.py     # pikepdf mutations
├── docs/
│   ├── prd/                        # This folder
│   ├── api.md
│   ├── scoring.md
│   └── architecture.md
├── tests/
│   ├── fixtures/
│   └── *.test.ts
├── openapi.yaml
├── README.md
├── package.json
├── tsconfig.json
├── .env.example
└── .gitignore
```

---

## External Dependencies Summary

### Required Binaries
- `qpdf` — PDF structure analysis
- `python3` + `pip install pikepdf fonttools` — PDF tag tree mutations

### Optional Binaries
- `tesseract` — OCR for scanned PDFs

### Required npm Packages
- `express`, `multer`, `helmet`, `cors`
- `pdfjs-dist`, `pdf-lib`, `@pdf-lib/fontkit`
- `better-sqlite3`
- `dotenv`

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
