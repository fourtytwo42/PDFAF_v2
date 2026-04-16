# PDFAF v2 Single-Container Deployment

This is the fastest way to run **PDFAF v2** as a single Docker container with the API and embedded multimodal LLM in one image.

This document assumes the preferred deployment is internal server-to-server. If the API later becomes public-facing, the same image can be run with stricter runtime limits and rate-limiting settings via environment variables.

## What You Get

- One container
- One exposed API port: `6200`
- Embedded `llama-server` inside the same container
- PDF grading via `POST /v1/analyze`
- PDF remediation via `POST /v1/remediate`
- Health and dependency checks via `GET /v1/health`

The image already contains:

- The Node/TypeScript API
- Python PDF tooling
- `qpdf`
- OCR dependencies
- Gemma 4 GGUF weights
- Multimodal projector (`mmproj`) for image-aware semantic fixes

## Docker Image

Published image:

- `hendo420/pdfaf-v2:latest`

Optional pinned tag:

- `hendo420/pdfaf-v2:single-container-20260416`

## Quick Start

Pull the image:

```bash
docker pull hendo420/pdfaf-v2:latest
```

Run it:

```bash
docker run -d \
  --name pdfaf-v2 \
  -p 6200:6200 \
  -v pdfaf-data:/data \
  hendo420/pdfaf-v2:latest
```

Check health:

```bash
curl -s http://127.0.0.1:6200/v1/health
```

If healthy, you should see:

- `"status":"ok"`
- `"llm":{"configured":true,"reachable":true}`

## Ports

Expose this port:

- `6200/tcp` for the public API

Do not expose the embedded LLM port unless you have a specific reason. The internal LLM listens on `127.0.0.1:1234` inside the container and is meant to be used by the API itself.

For the intended deployment model, expose `6200` only on an internal network, loopback interface, or private service mesh. Do not publish it to the public internet unless you add an explicit auth and proxy layer in front.

## Storage

Recommended persistent volume:

- `/data`

This stores:

- SQLite database
- playbooks
- tool outcome history
- temporary remediation state that should survive container restarts

Example with a host directory instead of a Docker volume:

```bash
docker run -d \
  --name pdfaf-v2 \
  -p 6200:6200 \
  -v /srv/pdfaf/data:/data \
  hendo420/pdfaf-v2:latest
```

## Environment Variables

Most users can run the image with defaults. Useful overrides:

```bash
docker run -d \
  --name pdfaf-v2 \
  -p 6200:6200 \
  -v pdfaf-data:/data \
  -e PORT=6200 \
  -e DB_PATH=/data/pdfaf.db \
  -e TMPDIR=/data/tmp \
  -e PDFAF_REMEDIATE_DEFAULT_SEMANTIC=1 \
  -e PDFAF_REMEDIATE_DEFAULT_SEMANTIC_HEADINGS=1 \
  hendo420/pdfaf-v2:latest
```

Important notes:

- `PORT` defaults to `6200`
- `DB_PATH` defaults to `/data/pdfaf.db`
- `TMPDIR` defaults to `/data/tmp`
- Semantic LLM remediation is already enabled in the single-container image

Rate limiting and request protection are configurable at runtime:

- `RATE_LIMIT_ANALYZE_MAX`
- `RATE_LIMIT_ANALYZE_WINDOW_MS`
- `RATE_LIMIT_REMEDIATE_MAX`
- `RATE_LIMIT_REMEDIATE_WINDOW_MS`
- `PDFAF_DISABLE_RATE_LIMIT`
- `REQUEST_TIMEOUT_ANALYZE_MS`
- `REQUEST_TIMEOUT_REMEDIATE_MS`
- `MAX_FILE_SIZE_MB`
- `MAX_CONCURRENT_ANALYSES`

This means the same image can be:

- permissive for trusted internal callers
- stricter for public-facing or semi-public deployments

## API Overview

Base URL:

```text
http://localhost:6200
```

Endpoints:

- `GET /v1/health`
- `POST /v1/analyze`
- `POST /v1/remediate`

### 1. Health

Use this to verify the service, dependencies, database, and embedded LLM:

```bash
curl -s http://localhost:6200/v1/health | jq .
```

### 2. Analyze

Grades a PDF without changing it.

Request:

```bash
curl -sS -X POST http://localhost:6200/v1/analyze \
  -F "file=@./example.pdf"
```

Expected input:

- multipart form upload
- field name: `file`
- value: one PDF file

Typical output fields:

- `score`
- `grade`
- `pageCount`
- `pdfClass`
- `categories`
- `findings`

What it does:

- inspects metadata
- checks document language and title
- checks heading structure
- checks alt text coverage
- checks PDF/UA-oriented structural signals
- checks links, reading order, forms, tables, and related heuristics

What it does not do:

- it does not modify the PDF
- it does not certify legal compliance
- it does not guarantee Acrobat and every assistive technology will agree on every edge case

### 3. Remediate

Repairs a PDF, re-grades it, and returns both before/after results.

Request:

```bash
curl -sS -X POST http://localhost:6200/v1/remediate \
  -F "file=@./example.pdf"
```

You can also pass JSON options:

```bash
curl -sS -X POST http://localhost:6200/v1/remediate \
  -F "file=@./example.pdf" \
  -F 'options={"targetScore":90,"maxRounds":3}'
```

Expected input:

- multipart form upload
- field name: `file`
- optional field name: `options`
- `options` must be a JSON string

Typical output fields:

- `before`
- `after`
- `improved`
- `appliedTools`
- `semantic`
- `semanticHeadings`
- `semanticPromoteHeadings`
- `semanticUntaggedHeadings`
- `remediatedPdfBase64`

`remediatedPdfBase64` contains the repaired PDF bytes encoded as Base64.

## What The Service Can Do

PDFAF v2 can:

- grade a PDF across accessibility categories
- assign an overall numeric score and letter grade
- detect structural and metadata issues
- perform deterministic repairs
- re-grade after repair
- use the embedded LLM for semantic remediation when needed
- generate improved alt text for image figures
- attempt semantic heading-related fixes in supported cases
- track tool outcomes and playbook data in its database

Examples of deterministic fixes:

- add missing document title
- add missing document language
- add PDF/UA metadata markers
- bootstrap or normalize structure trees
- repair link structure and annotation tab order
- apply non-LLM structural cleanup

Examples of semantic LLM-assisted fixes:

- figure alt-text proposal generation
- some heading-related semantic decisions when the document and pipeline support them

## What The Service Cannot Promise

PDFAF v2 cannot:

- guarantee full WCAG or ADA legal compliance
- replace manual accessibility QA for high-stakes documents
- perfectly repair every malformed or hostile PDF
- guarantee identical behavior across Acrobat, screen readers, and all validators
- fix every reading-order problem in every document class
- always apply semantic heading fixes; some PDFs are handled deterministically first, and some heading paths only apply to certain document structures

In practice, it is best used as:

- an accessibility grader
- an automated first-pass remediator
- a batch-processing API for PDFs
- a tool that reduces manual remediation workload, not eliminates review entirely

## How It Works

At a high level:

1. The API receives a PDF.
2. It analyzes the file and produces a score and category findings.
3. Deterministic repair tools run first.
4. The repaired PDF is analyzed again.
5. If enabled and useful, the embedded LLM runs semantic passes.
6. The final PDF is graded again and returned in Base64 form.

Why the embedded LLM matters:

- It allows text and image-aware semantic remediation without a second container.
- The multimodal projector allows the model to reason over figure/image content when proposing alt text.

## Example Workflow

Analyze only:

```bash
curl -sS -X POST http://localhost:6200/v1/analyze \
  -F "file=@./report.pdf" | jq '{ score, grade, pdfClass }'
```

Remediate and save JSON:

```bash
curl -sS -X POST http://localhost:6200/v1/remediate \
  -F "file=@./report.pdf" \
  > remediate-result.json
```

Extract the repaired PDF from the response:

```bash
jq -r '.remediatedPdfBase64' remediate-result.json | base64 -d > report-remediated.pdf
```

## Operational Notes

- Startup is heavier than a normal API because the embedded LLM loads on boot.
- The image is large because it includes model weights.
- CPU-only inference works, but semantic remediation can take noticeable time on larger PDFs.
- The API is suitable for local deployment, lab deployment, or internal service hosting.

For internal server-to-server use:

- built-in rate limiting is still present, but it is mainly a guardrail, not a security boundary
- the primary controls should be container CPU and memory limits, request timeouts, file-size limits, and caller-side concurrency limits
- if one trusted internal service is the only caller, tune limits based on expected job volume rather than public abuse patterns

If the API becomes public-facing:

- keep the in-app rate limits enabled
- set lower request ceilings for `/v1/remediate` than `/v1/analyze`
- keep file-size limits conservative
- keep request timeouts finite
- still add a reverse proxy or API gateway in front if possible

## Recommended Production Basics

- expose only port `6200`
- keep `/data` persistent
- prefer internal-only routing rather than public ingress
- if another internal service is the only caller, caller-side queuing and concurrency control are usually more important than aggressive per-IP throttling
- set request-size and timeout limits either at the caller or proxy layer if needed
- monitor disk usage because PDFs and remediation runs can be large
- set Docker memory and CPU limits so the embedded LLM cannot consume the whole host

Example internal-only run:

```bash
docker run -d \
  --name pdfaf-v2 \
  -p 127.0.0.1:6200:6200 \
  -v pdfaf-data:/data \
  --memory=12g \
  --memory-swap=12g \
  --cpus=6 \
  hendo420/pdfaf-v2:latest
```

If your caller is another service on the same Docker network, prefer no host publication at all and use container-to-container networking instead.

Example with explicit public-facing rate-limit arguments:

```bash
docker run -d \
  --name pdfaf-v2 \
  -p 6200:6200 \
  -v pdfaf-data:/data \
  --memory=12g \
  --memory-swap=12g \
  --cpus=6 \
  -e MAX_FILE_SIZE_MB=50 \
  -e MAX_CONCURRENT_ANALYSES=3 \
  -e RATE_LIMIT_ANALYZE_MAX=20 \
  -e RATE_LIMIT_ANALYZE_WINDOW_MS=60000 \
  -e RATE_LIMIT_REMEDIATE_MAX=5 \
  -e RATE_LIMIT_REMEDIATE_WINDOW_MS=60000 \
  -e REQUEST_TIMEOUT_ANALYZE_MS=120000 \
  -e REQUEST_TIMEOUT_REMEDIATE_MS=300000 \
  hendo420/pdfaf-v2:latest
```

To disable in-app rate limiting entirely for trusted internal use:

```bash
-e PDFAF_DISABLE_RATE_LIMIT=1
```

That should only be used when another trusted system is already controlling access and request volume.

## Minimal Compose Example

```yaml
services:
  pdfaf:
    image: hendo420/pdfaf-v2:latest
    container_name: pdfaf-v2
    ports:
      - "6200:6200"
    volumes:
      - pdfaf-data:/data
    restart: unless-stopped

volumes:
  pdfaf-data:
```

## Summary

Use `hendo420/pdfaf-v2:latest`, expose port `6200`, mount `/data`, and interact with:

- `GET /v1/health`
- `POST /v1/analyze`
- `POST /v1/remediate`

This image is intended to be a usable single-container deployment of PDFAF v2 with the LLM already embedded and wired into the remediation pipeline.
