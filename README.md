# PDFAF v2 — PDF Accessibility Fixer API

> Grade and automatically remediate PDFs for WCAG 2.1 AA / ADA Title II compliance.

**Status:** In development — see [`docs/prd/`](docs/prd/) for the build plan.

---

## What It Does

PDFAF v2 is a lean, fast REST API that:

1. **Grades** any PDF against 11 WCAG-aligned accessibility categories (A–F)
2. **Remediates** — automatically repairs metadata, structure, fonts, alt text, headings, tables, and links
3. **Learns** — caches successful repair sequences to remediate similar documents faster over time

Built from the ground up as a distillation of [PDFAF v1](../pdfaf), optimized for speed and reliability.

**Port:** 6200 (different from PDFAF v1 at 6103)

---

## Quick Start

```bash
# Prerequisites: Node 22, pnpm, qpdf, python3 + pikepdf + fonttools
pnpm install
cp .env.example .env
pnpm dev

# Grade a PDF
curl -X POST http://localhost:6200/v1/analyze \
  -F "file=@document.pdf" \
  | jq '{ grade: .grade, score: .score }'

# Remediate a PDF
curl -X POST http://localhost:6200/v1/remediate \
  -F "file=@document.pdf" \
  -F 'options={"targetGrade":"A","semantic":false}' \
  -o remediated.pdf
```

---

## API

| Endpoint | Description |
|---|---|
| `POST /v1/analyze` | Grade a PDF (no modification) |
| `POST /v1/remediate` | Grade + repair + re-grade, returns remediated PDF |
| `GET /v1/health` | Service status + dependency check |
| `GET /v1/playbooks` | View learned remediation playbooks |

Full API reference: [`docs/api.md`](docs/api.md) (available after Phase 5)

---

## Grading Scale

| Grade | Score | Meaning |
|---|---|---|
| A | 90–100 | Meets WCAG 2.1 AA |
| B | 80–89 | Minor issues, generally accessible |
| C | 70–79 | Moderate issues |
| D | 60–69 | Significant barriers |
| F | 0–59 | Major accessibility failures |

---

## Scoring Categories

| Category | Weight | What It Checks |
|---|---|---|
| Text Extractability | 17.5% | PDF is text-based and tagged |
| Title & Language | 13.0% | Document metadata |
| Heading Structure | 13.0% | H1–H6 hierarchy |
| Alt Text | 13.0% | Images have descriptions |
| PDF/UA Compliance | 9.5% | PDF/UA conformance markers |
| Bookmarks | 8.5% | Navigation outline (10+ page docs) |
| Table Markup | 8.5% | Table header cells |
| Color Contrast | 4.5% | 4.5:1 / 3:1 ratios |
| Link Quality | 4.5% | Descriptive link text |
| Reading Order | 4.0% | Logical content sequence |
| Form Accessibility | 4.0% | Form field labels |

---

## Build Plan

This repository is being built in 5 phases. Each phase produces a working, testable system.

| Phase | Name | Status |
|---|---|---|
| [1](docs/prd/01-phase1-foundation.md) | Foundation — Analysis API | Planned |
| [2](docs/prd/02-phase2-deterministic-remediation.md) | Deterministic Remediation | Planned |
| [3](docs/prd/03-phase3-semantic-remediation.md) | Semantic Remediation (LLM) | Planned |
| [4](docs/prd/04-phase4-learning-playbooks.md) | Learning & Playbooks | Planned |
| [5](docs/prd/05-phase5-polish-release.md) | Polish & Release | Planned |

See [`docs/prd/00-overview.md`](docs/prd/00-overview.md) for the full vision.

---

## Environment Variables

```env
PORT=6200
DB_PATH=./data/pdfaf.db
MAX_FILE_SIZE_MB=100
MAX_CONCURRENT_ANALYSES=5

# Optional: LLM for semantic alt text (Phase 3+)
OPENAI_COMPAT_BASE_URL=
OPENAI_COMPAT_API_KEY=
OPENAI_COMPAT_MODEL=gpt-4o
OPENAI_COMPAT_FALLBACK_BASE_URL=
OPENAI_COMPAT_FALLBACK_API_KEY=
OPENAI_COMPAT_FALLBACK_MODEL=
```

---

## Requirements

- **Node.js** 22+
- **pnpm** 9+
- **qpdf** binary (`apt install qpdf`)
- **Python 3** + `pip install pikepdf fonttools`
- **tesseract** (optional, for scanned PDFs) (`apt install tesseract-ocr`)

---

## Development

```bash
pnpm dev          # Start dev server with hot reload
pnpm test         # Run all tests
pnpm test:watch   # Watch mode
pnpm build        # Type check + compile
pnpm lint         # Type check only
```

---

## License

MIT
