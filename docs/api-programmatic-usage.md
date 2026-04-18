# PDFAF v2 API Programmatic Usage

This guide is for developers integrating with the PDFAF v2 API from another program.

It focuses on:

- what endpoints to call
- how to upload PDFs
- how to pass remediation options
- how to handle responses and errors
- how to decode the remediated PDF

For deployment details, see `docs/single-container-deployment.md` and `docs/api-web-docker-deployment.md`.

For the lower-level reference, see `docs/api.md` and `openapi.yaml`.

## Base URL

Typical base URLs:

- local API only: `http://localhost:6200`
- Docker host loopback bind: `http://127.0.0.1:6200`
- internal network host: `http://your-host:6200`

Main endpoints:

- `GET /v1/health`
- `POST /v1/analyze`
- `POST /v1/remediate`

## General Rules

- send PDFs as `multipart/form-data`
- use form field name `file`
- `POST /v1/remediate` also accepts an optional `options` field
- `options` must be a JSON string, not nested form fields
- successful remediation responses can be large because they may include `remediatedPdfBase64`

## Request and Error Model

Successful responses are JSON.

Error responses use this shape:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_CODE",
  "requestId": "uuid",
  "details": {}
}
```

Common error codes:

- `BAD_REQUEST`
- `INVALID_OPTIONS`
- `FILE_TOO_LARGE`
- `TOO_MANY_REQUESTS`
- `SERVER_AT_CAPACITY`
- `REQUEST_TIMEOUT`
- `INTERNAL_ERROR`

Useful client rule:

- always check HTTP status before assuming the body is a successful result

## Health Check

Use this before sending work, and for readiness checks:

```bash
curl -s http://127.0.0.1:6200/v1/health | jq .
```

What to look for:

- `status: "ok"`
- `dependencies.llm.reachable: true` if you expect semantic passes to work

## Analyze a PDF

Use `POST /v1/analyze` when you want a score and findings without modifying the PDF.

Example:

```bash
curl -sS -X POST http://127.0.0.1:6200/v1/analyze \
  -F "file=@./example.pdf"
```

Typical fields in the response:

- `score`
- `grade`
- `pageCount`
- `pdfClass`
- `categories`
- `findings`
- `analysisDurationMs`

Good use cases:

- preflight checks
- accessibility grading
- deciding whether remediation is worth running

## Remediate a PDF

Use `POST /v1/remediate` when you want PDFAF to repair the PDF and then re-grade it.

Example:

```bash
curl -sS -X POST http://127.0.0.1:6200/v1/remediate \
  -F "file=@./example.pdf"
```

Typical fields in the response:

- `before`
- `after`
- `improved`
- `appliedTools`
- `rounds`
- `planningSummary`
- `structuralConfidenceGuard`
- `remediationOutcomeSummary`
- `semantic`
- `semanticHeadings`
- `semanticPromoteHeadings`
- `semanticUntaggedHeadings`
- `remediationDurationMs`
- `remediatedPdfBase64`
- `remediatedPdfTooLarge`

If `remediatedPdfTooLarge` is `true`, the repair still ran, but the PDF was too large to return inline as Base64.

Stage 5 adds `remediationOutcomeSummary` as an additive summary of the structural repair result. It reports:

- document-level outcome: `fixed`, `partially_fixed`, `needs_manual_review`, or `unsafe_to_autofix`
- targeted structural families
- per-family before/after signal counts and residual signals

Stage 6 extends the optional semantic summaries additively. When a semantic lane is requested, the response can include:

- `semantic` for figure wording and decorative/informative decisions
- `semanticHeadings` for tagged heading-level refinement
- `semanticPromoteHeadings` for paragraph-to-heading promotion
- `semanticUntaggedHeadings` for the restricted untagged-heading lane

Each semantic summary reports:

- `lane`
- `gate` with pass/fail reason, candidate counts, and target-category before/after scores
- `changeStatus`: `skipped`, `no_change`, `applied`, or `reverted`
- proposal counts accepted/rejected
- `skippedReason`
- `trustDowngraded` when semantic output was kept but final trust stayed capped pending deterministic corroboration

## Remediation Options

`POST /v1/remediate` accepts an optional form field named `options`.

Important:

- `options` must be a JSON string

Example:

```bash
curl -sS -X POST http://127.0.0.1:6200/v1/remediate \
  -F "file=@./example.pdf" \
  -F 'options={"targetScore":90,"maxRounds":3}'
```

Common options:

- `targetScore`
- `maxRounds`
- `semantic`
- `semanticHeadings`
- `semanticPromoteHeadings`
- `semanticUntaggedHeadings`
- `semanticTimeoutMs`
- `htmlReport`

Example with semantic passes enabled explicitly:

```bash
curl -sS -X POST http://127.0.0.1:6200/v1/remediate \
  -F "file=@./example.pdf" \
  -F 'options={
    "targetScore": 92,
    "maxRounds": 4,
    "semantic": true,
    "semanticHeadings": true
  }'
```

Semantic remains explicit opt-in by default. If the server has no OpenAI-compatible semantic endpoint configured, requested semantic lanes are reported as skipped with `skippedReason: "no_llm_config"` instead of failing the whole remediation request.

## Saving the Remediated PDF

The remediated PDF comes back as Base64 in `remediatedPdfBase64`.

Shell example:

```bash
curl -sS -X POST http://127.0.0.1:6200/v1/remediate \
  -F "file=@./example.pdf" \
  > remediate-result.json

jq -r '.remediatedPdfBase64' remediate-result.json | base64 -d > example-remediated.pdf
```

Guard for large responses:

```bash
jq '.remediatedPdfTooLarge' remediate-result.json
```

Client rule:

- do not assume `remediatedPdfBase64` is always present
- check both `remediatedPdfBase64` and `remediatedPdfTooLarge`

## Request Correlation

You can attach your own request id:

```bash
curl -sS -X POST http://127.0.0.1:6200/v1/analyze \
  -H "X-Request-Id: my-job-123" \
  -F "file=@./example.pdf"
```

The server echoes `X-Request-Id` back on the response, which is useful for logs and tracing.

## JavaScript Example

Node.js example using built-in `fetch` and `FormData`:

```js
import { readFile } from 'node:fs/promises';

const baseUrl = 'http://127.0.0.1:6200';
const pdfBytes = await readFile('./example.pdf');

const form = new FormData();
form.set('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'example.pdf');
form.set(
  'options',
  JSON.stringify({
    targetScore: 90,
    maxRounds: 3,
    semantic: true,
    semanticHeadings: true,
  }),
);

const response = await fetch(`${baseUrl}/v1/remediate`, {
  method: 'POST',
  headers: {
    'X-Request-Id': 'demo-remediate-001',
  },
  body: form,
});

const payload = await response.json();

if (!response.ok) {
  throw new Error(`${payload.code}: ${payload.error}`);
}

console.log({
  before: payload.before.score,
  after: payload.after.score,
  improved: payload.improved,
  remediatedPdfTooLarge: payload.remediatedPdfTooLarge,
});
```

If you need to write the remediated PDF in Node:

```js
import { writeFile } from 'node:fs/promises';

if (payload.remediatedPdfBase64) {
  const buffer = Buffer.from(payload.remediatedPdfBase64, 'base64');
  await writeFile('./example-remediated.pdf', buffer);
}
```

## Python Example

Python example using `requests`:

```python
import base64
import json
import requests

base_url = "http://127.0.0.1:6200"

with open("./example.pdf", "rb") as fh:
    files = {
        "file": ("example.pdf", fh, "application/pdf"),
    }
    data = {
        "options": json.dumps({
            "targetScore": 90,
            "maxRounds": 3,
            "semantic": True,
            "semanticHeadings": True,
        })
    }
    response = requests.post(
        f"{base_url}/v1/remediate",
        files=files,
        data=data,
        headers={"X-Request-Id": "demo-remediate-001"},
        timeout=300,
    )

payload = response.json()

if response.status_code >= 400:
    raise RuntimeError(f"{payload.get('code')}: {payload.get('error')}")

if payload.get("remediatedPdfBase64"):
    pdf_bytes = base64.b64decode(payload["remediatedPdfBase64"])
    with open("./example-remediated.pdf", "wb") as out:
        out.write(pdf_bytes)

print({
    "before": payload["before"]["score"],
    "after": payload["after"]["score"],
    "improved": payload["improved"],
    "too_large": payload["remediatedPdfTooLarge"],
})
```

## Response Handling Recommendations

For `analyze`:

- read `score`, `grade`, and `pdfClass` first
- inspect `findings` and `categories` for detailed logic

For `remediate`:

- compare `before.score` and `after.score`
- inspect `improved`
- inspect `appliedTools`
- treat `remediatedPdfBase64` as optional

Good defensive logic:

1. check HTTP status
2. parse JSON
3. if non-2xx, read `code` and `error`
4. if remediation succeeded, check whether `remediatedPdfBase64` is present
5. log `X-Request-Id` for traceability

## Rate Limits and Timeouts

Default API behavior:

- `POST /v1/analyze` is rate-limited per IP
- `POST /v1/remediate` is rate-limited per IP
- analyze and remediate also have server-side wall-clock timeouts

Practical client guidance:

- retry `429` with backoff
- treat `504` as retryable if your workflow allows it
- use longer client timeouts for remediation than for analyze

## When to Call the API Directly vs the Web App

Call the API directly when:

- you are integrating a backend service
- you want deterministic machine-to-machine access
- you do not need the PDF AF browser UI

Use the web app when:

- a user is uploading files manually
- you want queue UI, stored files, and download handling
- you want same-origin browser access instead of browser-to-API integration

## Summary

For programmatic use:

- call `GET /v1/health` to verify readiness
- call `POST /v1/analyze` to grade a PDF
- call `POST /v1/remediate` to repair and re-grade a PDF
- send files as multipart form uploads
- send remediation `options` as a JSON string
- treat `remediatedPdfBase64` as optional and check `remediatedPdfTooLarge`

For exact field-level reference, use `docs/api.md` and `openapi.yaml`.
