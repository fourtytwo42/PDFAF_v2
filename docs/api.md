# PDFAF v2 — API reference

Base URL defaults to `http://localhost:6200`. All JSON responses use UTF-8. Successful remediation responses can be large because they may include a base64-encoded PDF.

## Authentication

There is no API key or session model in v2. Run behind a reverse proxy or private network for production access control.

## Error format

Non-2xx responses use a consistent JSON body:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_CODE",
  "requestId": "uuid",
  "details": {}
}
```

The `details` field is included only outside `NODE_ENV=production` (for example validation errors during development).

Common `code` values: `BAD_REQUEST`, `INVALID_OPTIONS`, `FILE_TOO_LARGE`, `TOO_MANY_REQUESTS`, `SERVER_AT_CAPACITY`, `REQUEST_TIMEOUT`, `INTERNAL_ERROR`, `NOT_FOUND`.

## Rate limits

Per IP, configurable via environment variables (defaults in parentheses):

- `POST /v1/analyze` — `RATE_LIMIT_ANALYZE_MAX` per `RATE_LIMIT_ANALYZE_WINDOW_MS` (30 / minute).
- `POST /v1/remediate` — `RATE_LIMIT_REMEDIATE_MAX` per `RATE_LIMIT_REMEDIATE_WINDOW_MS` (10 / minute).

Responses use HTTP 429 with `code: TOO_MANY_REQUESTS` (or `SERVER_AT_CAPACITY` when the analysis semaphore is saturated).

Set `PDFAF_DISABLE_RATE_LIMIT=1` for local stress testing (also set automatically in Vitest).

## Request timeouts

Wall-clock limits (return 504 with `code: REQUEST_TIMEOUT`):

- Analyze: `REQUEST_TIMEOUT_ANALYZE_MS` (default 120000).
- Remediate: `REQUEST_TIMEOUT_REMEDIATE_MS` (default 300000).

## Correlation

Send header `X-Request-Id` to propagate your own id; otherwise the server generates one and echoes it on the response as `X-Request-Id` and inside error bodies when present.

## LLM (semantic / vision)

Semantic passes use OpenAI-compatible **`/v1/chat/completions`** (same stack as PDFAF v1).

**Embedded inference:** set `PDFAF_RUN_LOCAL_LLM=1` and leave `OPENAI_COMPAT_BASE_URL` empty. The Node process spawns **llama.cpp `llama-server`** before listening (defaults: `unsloth/gemma-4-E2B-it-GGUF` + `gemma-4-E2B-it-Q4_K_M.gguf`, same Gemma 4 E2B instruct weights as [google/gemma-4-E2B-it](https://huggingface.co/google/gemma-4-E2B-it) in GGUF form; port `PDFAF_LLAMA_PORT` default 1234). You must have `llama-server` on `PATH` or set `LLAMA_SERVER_BIN`. First boot may take a long time while Hugging Face weights download. The API sets `OPENAI_COMPAT_MODEL` from `GET /v1/models` to the GGUF model id llama-server reports (overrides any placeholder HF id in `.env`).

**External inference:** set `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_API_KEY`, and `OPENAI_COMPAT_MODEL` (default id **`google/gemma-4-E2B-it`** if unset). With **`OPENAI_COMPAT_MODEL_AUTO=1`**, startup polls `GET …/v1/models` and sets `OPENAI_COMPAT_MODEL` to the first id (used by Docker Compose with the `llm` sidecar). Figure alt text uses **vision** (`image_url` parts); heading / promote passes are text-only.

---

## `POST /v1/analyze`

Multipart form:

| Field | Required | Description |
|-------|----------|-------------|
| `file` | Yes | PDF binary |

**200** — `AnalysisResult` JSON (grade, score, categories, findings, `pdfClass`, etc.).

**400** — Missing file or non-PDF.

**413** — File exceeds `MAX_FILE_SIZE_MB`.

**429** — Rate limit or concurrency cap (`MAX_CONCURRENT_ANALYSES`).

**500** — Analysis failure.

---

## `POST /v1/remediate`

Multipart form:

| Field | Required | Description |
|-------|----------|-------------|
| `file` | Yes | PDF binary |
| `options` | No | JSON **string** (strict schema). |

### Remediate `options` (JSON string)

| Field | Type | Description |
|-------|------|-------------|
| `targetScore` | number | Stop when weighted score reaches this (0–100). |
| `maxRounds` | number | Max planner rounds (1–10). |
| `semantic` | boolean | LLM figure alt text pass (requires `OPENAI_COMPAT_*`). |
| `semanticHeadings` | boolean | LLM heading pass. |
| `semanticPromoteHeadings` | boolean | LLM promote `/P` to headings. |
| `semanticUntaggedHeadings` | boolean | Experimental untagged heading path. |
| `semanticTimeoutMs` | number | Timeouts for semantic passes (ms). |
| `htmlReport` | boolean | When true, response may include `htmlReport` (self-contained HTML string). |
| `htmlReportIncludeBeforeAfter` | boolean | Include before/after score section (default true). |
| `htmlReportIncludeFindingsDetail` | boolean | Include key findings list (default true). |
| `htmlReportIncludeAppliedTools` | boolean | Include applied tools list (default true). |

**200** — `RemediationResult`: `before`, `after`, `remediatedPdfBase64` (or null if too large), `remediatedPdfTooLarge`, `appliedTools`, `rounds`, `remediationDurationMs`, `improved`, optional semantic summaries, optional `htmlReport`.

**400** — Invalid multipart or invalid `options` JSON / schema.

**413** — Upload too large.

**429** — Rate limit or analysis capacity.

**500** — Remediation failure.

---

## `GET /v1/health`

No auth. Returns extended dependency and performance snapshot:

- `status`: `ok` | `degraded` | `down`
- `version`: app version from `package.json`
- `uptime`, `port`
- `dependencies`: `qpdf`, `python` (with `pikepdf`, `fonttools`), optional `tesseract`, `llm` (`configured`, `reachable`), `database` (`ok`, `path`, `playbooks` counts by status, `toolOutcomes` count)
- `performance`: `analysesLast24h`, `avgAnalysisMs` (from `queue_items`), `remediationsLast24h`, `avgRemediationMs` (in-process, rolling 24h), `playbooks` summary counts

HTTP **503** when the database cannot be opened (body still JSON when possible).

---

## `GET /v1/playbooks`

Returns `{ playbooks: [...], toolReliability: [...] }` for debugging / ops. Same SQLite database as the running server.

---

## OpenAPI

Machine-readable spec: [openapi.yaml](../openapi.yaml). Validate with `pnpm openapi:validate`.

---

## Limits recap

| Limit | Env / default |
|-------|----------------|
| Max upload size | `MAX_FILE_SIZE_MB` (100) |
| Max concurrent analyses | `MAX_CONCURRENT_ANALYSES` (5) |
| Max base64 PDF in JSON | `REMEDIATION_MAX_BASE64_MB` (100) |
