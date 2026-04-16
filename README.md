# PDFAF v2 — PDF Accessibility Fixer API

> Grade and automatically remediate PDFs for WCAG 2.1 AA / ADA Title II–oriented accessibility checks.

**Port:** 6200 (distinct from PDFAF v1 at 6103)

---

## What it does

1. **Analyze** — Score a PDF across 11 categories (A–F) without modifying bytes.
2. **Remediate** — Deterministic repairs (metadata, structure, figures where implemented), re-grade, optional LLM passes.
3. **Learn** — Store successful tool sequences as **playbooks** and track per-tool outcomes for planner filtering.

OpenAPI: [`openapi.yaml`](openapi.yaml) · `pnpm openapi:validate`

Deeper docs: [`docs/api.md`](docs/api.md), [`docs/scoring.md`](docs/scoring.md), [`docs/architecture.md`](docs/architecture.md)

---

## Quick start (native, ~5 minutes)

**Prerequisites:** Node 22+, pnpm 10+, `qpdf`, Python 3 with `pikepdf` and `fonttools`, optional `tesseract-ocr`.

**Optional — run the LLM inside this app:** install [llama.cpp](https://github.com/ggerganov/llama.cpp) `llama-server` on your `PATH` (or set `LLAMA_SERVER_BIN`), then in `.env` set `PDFAF_RUN_LOCAL_LLM=1` and leave `OPENAI_COMPAT_BASE_URL` empty. On startup the API spawns **llama-server** with Gemma 4 E2B instruct GGUF defaults (`unsloth/gemma-4-E2B-it-GGUF` / `gemma-4-E2B-it-Q4_K_M.gguf`, same weights family as [google/gemma-4-E2B-it](https://huggingface.co/google/gemma-4-E2B-it), which is Safetensors-only); the first launch may take a long time while weights download. Stop the API with Ctrl+C to terminate the child server.

```bash
pnpm install
cp .env.example .env
pnpm dev
```

### Curl — every endpoint

```bash
# Grade a PDF
curl -sS -X POST http://localhost:6200/v1/analyze \
  -F "file=@./your.pdf" | jq '{ grade, score, pdfClass }'

# Remediate (optional JSON string field `options`)
curl -sS -X POST http://localhost:6200/v1/remediate \
  -F "file=@./your.pdf" \
  -F 'options={"targetScore":90,"maxRounds":3}' \
  | jq '{ improved, after: { score: .after.score, grade: .after.grade } }'

# Optional HTML accessibility report in JSON
curl -sS -X POST http://localhost:6200/v1/remediate \
  -F "file=@./your.pdf" \
  -F 'options={"htmlReport":true,"maxRounds":1}' \
  | jq 'has("htmlReport")'

# Health (dependencies, version, DB stats)
curl -sS http://localhost:6200/v1/health | jq .

# Playbooks catalog (internal / debug)
curl -sS http://localhost:6200/v1/playbooks | jq '{ n: (.playbooks|length) }'
```

---

## Quick start (Docker — API + Gemma Q4 sidecar)

Compose runs **two** services: `llm` is built from `docker/llm/Dockerfile` on top of [`ghcr.io/ggml-org/llama.cpp:server`](https://github.com/ggml-org/llama.cpp/blob/master/docs/docker.md) and **embeds** the default **Unsloth** `gemma-4-E2B-it-Q4_K_M.gguf` at **image build** time (~4 GiB layer; **no `HF_TOKEN`** for that public file). First `docker compose up` only starts the server—no weight download. Rebuild with `docker compose build llm` (optionally `--no-cache`) after changing `GEMMA4_HF_REPO` / `GEMMA4_GGUF_FILE` build-args in `.env`. The `pdfaf` service talks to `llm` over the internal network (`OPENAI_COMPAT_MODEL_AUTO=1` picks the model id from `/v1/models`).

```bash
docker compose up --build
curl -sS http://localhost:6200/v1/health
```

- API: `http://localhost:6200` · LLM (host): `http://127.0.0.1:1234` (maps container `8080`).
- SQLite and playbooks: volume `pdfaf-data` (`DB_PATH=/data/pdfaf.db`).
- Optional: set `HF_TOKEN` only if you point `GEMMA4_HF_REPO` / `GEMMA4_GGUF_FILE` at a **gated** Hugging Face model; the default Gemma GGUF does not need it.

### Run the LLM in Docker, API natively (good for local dev)

```bash
pnpm docker:llm
# wait until: curl -sS http://127.0.0.1:1234/v1/models | head
PDFAF_RUN_LOCAL_LLM= OPENAI_COMPAT_BASE_URL=http://127.0.0.1:1234/v1 OPENAI_COMPAT_MODEL_AUTO=1 pnpm dev
```

Unset `PDFAF_RUN_LOCAL_LLM` so the app does not spawn a second `llama-server`.

---

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Dev server (tsx watch) |
| `pnpm build` | Typecheck + compile to `dist/` |
| `pnpm start` | Run compiled `dist/server.js` |
| `pnpm test` | Vitest |
| `pnpm lint` | `tsc --noEmit` |
| `pnpm docker:up` | `docker compose up --build` (API + `llm`) |
| `pnpm docker:llm` | `docker compose up llm -d --build` (sidecar only) |
| `pnpm openapi:validate` | Validate `openapi.yaml` |

---

## Environment variables

See [`.env.example`](.env.example) for the full list. Important groups:

| Area | Examples |
|------|-----------|
| Server | `PORT`, `NODE_ENV`, `DB_PATH` |
| Limits | `MAX_FILE_SIZE_MB`, `MAX_CONCURRENT_ANALYSES`, `QPDF_TIMEOUT_MS` |
| Remediation | `REMEDIATION_TARGET_SCORE`, `REMEDIATION_MAX_ROUNDS`, `PLAYBOOK_LEARN_MIN_SCORE_DELTA` |
| Phase 5 | `RATE_LIMIT_*`, `REQUEST_TIMEOUT_*`, `PDFAF_DISABLE_RATE_LIMIT`, `HEALTH_LLM_PROBE_TIMEOUT_MS`, `PDFAF_PYTHON_SCRIPT` |
| LLM (optional) | `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_API_KEY`, `OPENAI_COMPAT_MODEL`, fallbacks |
| Semantic tuning | `SEMANTIC_*` (timeouts, batch sizes, confidence thresholds) |

---

## Grading scale

| Grade | Score | Meaning |
|-------|-------|---------|
| A | 90–100 | Strong pass against heuristics |
| B | 80–89 | Minor issues |
| C | 70–79 | Moderate issues |
| D | 60–69 | Significant barriers |
| F | 0–59 | Major failures |

Automated grading is **not** a legal determination of WCAG conformance.

---

## Performance (order of magnitude)

| Operation | Typical range |
|-----------|----------------|
| Analyze | ~10–20s (varies by pages and structure) |
| Remediate | ~30–90s deterministic; +LLM can add minutes |
| Playbook replay | Often a few seconds on small PDFs |

Manual benchmark notes: [`tests/benchmarks/manual-benchmarks.md`](tests/benchmarks/manual-benchmarks.md)

---

## Build phases

| Phase | PRD | Focus |
|-------|-----|--------|
| 1 | [01-phase1-foundation.md](docs/prd/01-phase1-foundation.md) | Analyze API |
| 2 | [02-phase2-deterministic-remediation.md](docs/prd/02-phase2-deterministic-remediation.md) | Deterministic remediation |
| 3 | [03-phase3-semantic-remediation.md](docs/prd/03-phase3-semantic-remediation.md) | LLM-assisted passes |
| 4 | [04-phase4-learning-playbooks.md](docs/prd/04-phase4-learning-playbooks.md) | Playbooks + tool outcomes |
| 5 | [05-phase5-polish-release.md](docs/prd/05-phase5-polish-release.md) | OpenAPI, Docker, docs, hardening |

---

## License

MIT
