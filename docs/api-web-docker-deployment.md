# PDFAF v2 API + Web Docker Deployment

This guide covers the two-container deployment:

- the **PDFAF API** container, with the embedded multimodal LLM inside the API image
- the **PDF AF web app** container, connected to that API over a private Docker network

This is the right deployment shape when you want the browser-facing web UI and the remediation API to run as separate containers, while still keeping the LLM bundled into the API container itself.

## What You Get

- Two containers
- One browser-facing web app on port `3100`
- One API on port `6200`
- Embedded `llama-server` inside the API container
- The web app wired to the API over Docker networking
- Same-origin browser calls to the web app, with the web app proxying to the API

## Docker Images

Published images:

- `hendo420/pdfaf-v2:latest`
- `hendo420/pdf-af-web:latest`

Optional pinned tags:

- `hendo420/pdfaf-v2:single-container-20260417`
- `hendo420/pdf-af-web:20260417`

## Architecture

At runtime:

1. The browser talks to the web app on port `3100`.
2. The web app handles UI state, file persistence, and same-origin API routes under `/api/...`.
3. The web app proxies remediation and analysis requests to the PDFAF API.
4. The PDFAF API runs deterministic remediation plus semantic LLM passes.
5. The LLM stays internal to the API container and is not exposed separately.

Important detail:

- the web app must be configured with `PDFAF_API_BASE_URL=http://pdfaf:6200` when both containers are on the same Docker network

## Recommended Ports

Expose:

- `3100/tcp` for the web app

Usually expose one of these for the API:

- `127.0.0.1:6200:6200` if you want the API reachable only from the host
- no host publication at all if only the web app should talk to it

Do not expose the API container's embedded LLM port. It listens only inside the API container and is meant to be used by the API process itself.

## Persistent Storage

Recommended persistent volumes:

- one volume for the API at `/data`
- one volume for the web app at `/data`

What they store:

- API `/data`
  API SQLite database, learned playbooks, tool outcomes, temp remediation state
- web `/data`
  saved uploaded files, remediated downloads, web-side SQLite metadata, retention state

## Quick Start With Docker Compose

Use a compose file like this:

```yaml
services:
  pdfaf:
    image: hendo420/pdfaf-v2:latest
    container_name: pdfaf-v2
    ports:
      - "127.0.0.1:6200:6200"
    environment:
      PORT: "6200"
      DB_PATH: /data/pdfaf.db
      TMPDIR: /data/tmp
      PDFAF_REMEDIATE_DEFAULT_SEMANTIC: "1"
      PDFAF_REMEDIATE_DEFAULT_SEMANTIC_HEADINGS: "1"
    volumes:
      - pdfaf-data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://127.0.0.1:6200/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 120s

  pdf-af-web:
    image: hendo420/pdf-af-web:latest
    container_name: pdf-af-web
    ports:
      - "3100:3100"
    environment:
      PDFAF_API_BASE_URL: http://pdfaf:6200
      PDF_AF_STORAGE_DIR: /data
      PDF_AF_RETENTION_HOURS: "24"
      PDF_AF_PER_USER_QUOTA_BYTES: "1073741824"
    volumes:
      - pdf-af-web-data:/data
    depends_on:
      pdfaf:
        condition: service_healthy
    restart: unless-stopped

volumes:
  pdfaf-data:
  pdf-af-web-data:
```

Start it:

```bash
docker compose up -d
```

## Health Checks

Check the API directly:

```bash
curl -s http://127.0.0.1:6200/v1/health | jq .
```

Check the web app:

```bash
curl -I http://127.0.0.1:3100/
```

Check the web-to-API path through the web container:

```bash
curl -s http://127.0.0.1:3100/api/pdfaf/health | jq .
```

Expected API health signals:

- `"status":"ok"`
- `"llm":{"configured":true,"reachable":true}`

## Environment Variables

### API Container

Useful API environment variables:

- `PORT`
- `DB_PATH`
- `TMPDIR`
- `PDFAF_REMEDIATE_DEFAULT_SEMANTIC`
- `PDFAF_REMEDIATE_DEFAULT_SEMANTIC_HEADINGS`
- `RATE_LIMIT_ANALYZE_MAX`
- `RATE_LIMIT_ANALYZE_WINDOW_MS`
- `RATE_LIMIT_REMEDIATE_MAX`
- `RATE_LIMIT_REMEDIATE_WINDOW_MS`
- `PDFAF_DISABLE_RATE_LIMIT`
- `REQUEST_TIMEOUT_ANALYZE_MS`
- `REQUEST_TIMEOUT_REMEDIATE_MS`
- `MAX_FILE_SIZE_MB`
- `MAX_CONCURRENT_ANALYSES`

Important defaults:

- `PORT` defaults to `6200`
- `DB_PATH` defaults to `/data/pdfaf.db` in the container examples here
- `TMPDIR` should point at writable persistent or high-capacity storage
- the single API image already has the embedded LLM wired in

### Web Container

Required web environment variables:

- `PDFAF_API_BASE_URL`
- `PDF_AF_STORAGE_DIR`

Useful web environment variables:

- `PDF_AF_RETENTION_HOURS`
- `PDF_AF_PER_USER_QUOTA_BYTES`

Important defaults:

- `PDF_AF_STORAGE_DIR` should normally be `/data`
- `PDFAF_API_BASE_URL` must point to the API service name on the Docker network, not `localhost`

Why this matters:

- inside the web container, `localhost:6200` would mean the web container itself, not the API container
- `http://pdfaf:6200` works because Docker Compose provides service-name DNS on the shared network

## Separate `docker run` Commands

If you do not want Compose, run the API first:

```bash
docker network create pdfaf-net

docker run -d \
  --name pdfaf-v2 \
  --network pdfaf-net \
  -p 127.0.0.1:6200:6200 \
  -v pdfaf-data:/data \
  -e PORT=6200 \
  -e DB_PATH=/data/pdfaf.db \
  -e TMPDIR=/data/tmp \
  -e PDFAF_REMEDIATE_DEFAULT_SEMANTIC=1 \
  -e PDFAF_REMEDIATE_DEFAULT_SEMANTIC_HEADINGS=1 \
  hendo420/pdfaf-v2:latest
```

Then run the web app:

```bash
docker run -d \
  --name pdf-af-web \
  --network pdfaf-net \
  -p 3100:3100 \
  -v pdf-af-web-data:/data \
  -e PDFAF_API_BASE_URL=http://pdfaf-v2:6200 \
  -e PDF_AF_STORAGE_DIR=/data \
  -e PDF_AF_RETENTION_HOURS=24 \
  -e PDF_AF_PER_USER_QUOTA_BYTES=1073741824 \
  hendo420/pdf-af-web:latest
```

Note:

- with raw `docker run`, the container name `pdfaf-v2` becomes the hostname used by the web container
- with Compose, the service name `pdfaf` is the hostname

## Browser Flow

In this deployment, the browser should use:

- `http://your-host:3100`

The browser does not need to call the API container directly.

The web app handles:

- `GET /api/files`
- `POST /api/files`
- `GET /api/pdfaf/health`
- `POST /api/pdfaf/analyze`
- `POST /api/pdfaf/remediate`

That keeps browser traffic same-origin while the web app talks to the API server-side.

## Recommended Production Basics

- expose `3100` for users
- keep the API on an internal-only bind or no host bind if the web app is the only caller
- keep both `/data` mounts persistent
- set Docker memory and CPU limits on the API container because the embedded LLM is the heavy process
- keep request size and timeout limits finite on the API
- monitor disk usage for both API and web storage

Example tighter production compose shape:

```yaml
services:
  pdfaf:
    image: hendo420/pdfaf-v2:latest
    ports:
      - "127.0.0.1:6200:6200"
    mem_limit: 12g
    cpus: 6
    environment:
      PORT: "6200"
      DB_PATH: /data/pdfaf.db
      TMPDIR: /data/tmp
      MAX_FILE_SIZE_MB: "50"
      MAX_CONCURRENT_ANALYSES: "3"
      REQUEST_TIMEOUT_ANALYZE_MS: "120000"
      REQUEST_TIMEOUT_REMEDIATE_MS: "300000"
    volumes:
      - pdfaf-data:/data

  pdf-af-web:
    image: hendo420/pdf-af-web:latest
    ports:
      - "3100:3100"
    environment:
      PDFAF_API_BASE_URL: http://pdfaf:6200
      PDF_AF_STORAGE_DIR: /data
    volumes:
      - pdf-af-web-data:/data
```

## Troubleshooting

If the web app cannot reach the API:

- verify `PDFAF_API_BASE_URL` is `http://pdfaf:6200` in Compose
- verify the API container is healthy
- verify both containers are on the same Docker network

If `/api/files` returns `500` from the web app:

- verify the web image is current
- verify the web container has a writable `/data` volume
- verify the published web image includes the `better-sqlite3` native binding

If the API health says the LLM is unreachable:

- inspect API container logs
- confirm the API image was built from the current embedded-LLM Dockerfile
- confirm the container has enough memory and startup time

If Docker builds fail with no space left on device:

- check `/var/lib/containerd` and the Docker data disk
- prune stopped containers and dangling images only after confirming they are unused
- keep large Docker state on the data disk, not the small OS root volume

## Summary

Use:

- `hendo420/pdfaf-v2:latest` for the API
- `hendo420/pdf-af-web:latest` for the web app

Wire them together with:

- `PDFAF_API_BASE_URL=http://pdfaf:6200` in Compose

Expose:

- `3100` for users
- optionally `6200` for operators or internal callers

This deployment keeps the browser-facing web UI and the remediation API separate, while still using the embedded LLM inside the API container.
