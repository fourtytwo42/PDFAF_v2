# Handoff prompt: PDFAF v2 — Docker stack + staged PDFs

Copy everything below the line into a new AI session (or attach this file plus repo access).

---

## Role

You are working on the **PDFAF_v2** repository on a Linux host (e.g. `pdfaf`). Your job is to **run only the current Docker stack** (no stray/old containers from this project), use **fresh images built from this repo**, bring **`POST /v1/remediate`** up, and **process every PDF** under **`Input/from_sibling_pdfaf/`** via the Docker-hosted API. Report HTTP status, before/after scores, and any errors.

## What this project is

- **PDFAF v2** is a REST API (default **port 6200**) that **analyzes** and **remediates** PDFs for accessibility (`POST /v1/analyze`, `POST /v1/remediate`, `GET /v1/health`).
- **Phase 2+** remediation is deterministic + optional **LLM** passes when semantic options are on.
- **Architecture (Docker):** `docker-compose.yml` defines two services:
  - **`llm`**: image **`pdfaf-llm:local`**, built from **`docker/llm/Dockerfile`** on top of **`ghcr.io/ggml-org/llama.cpp:server`**. The default **Gemma 4 E2B Q4_K_M** GGUF is **baked at image build** (HF download during **`docker compose build llm`**, not at container start). Inside the container, **`llama-server`** listens on **8080**; the host maps **`127.0.0.1:${LLM_HOST_PORT:-1234}:8080`**.
  - **`pdfaf`**: the API container, **`depends_on`** `llm` **healthy**. It sets **`OPENAI_COMPAT_BASE_URL=http://llm:8080/v1`**, **`OPENAI_COMPAT_MODEL_AUTO=1`**, and enables default semantic remediation env vars per compose file.
- **Non-Docker dev:** `pnpm dev` can spawn **embedded** `llama-server` on **127.0.0.1:1234** if **`PDFAF_RUN_LOCAL_LLM=1`**. That **conflicts** with the compose **`llm`** port. Use **either** embedded LLM **or** Docker `llm`, not both.

## What was already set up on the host (do not undo unless broken)

**Third drive / space:** On this host, **`/`** (OS root, often a small LVM) can be **~30 GiB and nearly full**. Docker’s heavy paths were moved to a **separate volume** — typically **`/dev/sdc1` (or similar) mounted at `/mnt/docker-data`** — so image layers, containerd exports, and build temp do **not** fill the OS disk. Treat **`/mnt/docker-data`** as the **intended data disk** for Docker; avoid relocating Docker back onto **`/`** unless you have verified free space and inode headroom.

1. **Docker Engine `data-root`** may point at **`/mnt/docker-data/docker`** (`/etc/docker/daemon.json`) so images/layers live on that **data disk**, not the small OS volume.
2. **`/var/lib/containerd`** may be **bind-mounted** from **`/mnt/docker-data/containerd-root`** (script **`scripts/move-containerd-root-to-datadisk.sh`**) because large layer **exports** use containerd under **`/var/lib/containerd`** and can fill **`/`** otherwise.
3. **Build temp / compose project files:** **`scripts/setup-docker-datadisk-workdir.sh`** creates **`/mnt/docker-data/pdfaf-docker-work/{buildkit-tmp,compose}`** owned by the user; **`DOCKER_TMPDIR`** is set by **`scripts/docker-compose-pdfaf.sh`** and **`scripts/docker-smoke.sh`**.
4. **Docker Compose v2** may exist only under the **user’s** **`~/.docker/cli-plugins/docker-compose`**. **`sudo docker compose`** often **fails** (“unknown command: docker compose”) because **root** has no plugin. Prefer **`docker compose`** **without sudo** (user in **`docker`** group), or copy the plugin to **`/root/.docker/cli-plugins/`** (see comments at top of **`docker-compose.yml`**).
5. **Host port:** **`LLM_HOST_PORT`** in **`.env`** overrides the default **1234** if something else binds it.
6. **Staged PDFs** (copied from sibling repo **`../pdfaf`**) live here:
   - **`Input/from_sibling_pdfaf/Microsoft_Teams_Quickstart_1.pdf`**
   - **`Input/from_sibling_pdfaf/ADAM2.pdf`**
   - **`Input/from_sibling_pdfaf/pdfaf_fixture_accessible.pdf`**
   - **`Input/from_sibling_pdfaf/pdfaf_fixture_inaccessible.pdf`**

## Scripts you should use

| Script | Purpose |
|--------|---------|
| **`scripts/setup-docker-datadisk-workdir.sh`** | One-time (sudo): writable dirs on data disk for **`DOCKER_TMPDIR`**. |
| **`scripts/move-containerd-root-to-datadisk.sh`** | One-time (sudo): move containerd root to data disk if builds fail with no space under **`/var/lib/containerd`**. |
| **`scripts/docker-compose-pdfaf.sh`** | Runs **`docker compose -f docker-compose.yml`** with **`DOCKER_TMPDIR`** / project name set. |
| **`scripts/docker-remediate-input-dir.sh`** | Waits for **`http://127.0.0.1:6200/v1/health`**, runs **`docker compose up -d`** if needed, **`POST /v1/remediate`** for each **`*.pdf`** in **`Input/from_sibling_pdfaf`**, writes JSON under **`Output/docker-remediate-runs/run-<timestamp>/`**. |
| **`scripts/docker-smoke.sh`** | Full build + up + analyze + remediate smoke (needs PDFs; can point **`PDFAF_DIR`**). |

## What you must do (checklist for the new AI)

1. **No conflicting LLM on the host:** Ensure **`llama-server`** is **not** listening on **`127.0.0.1:1234`** if compose uses that port (`ss -tlnp 'sport = :1234'` or **`pgrep -a llama-server`**). Stop host **`llama-server`** if it blocks the **`llm`** container.
2. **Stop this project’s stack cleanly:** From repo root: **`docker compose down`** (no sudo if your user has Docker access).
3. **Remove stale PDFAF v2 containers** (optional): **`docker ps -a`** — remove **`pdfafv2-*`** in **Created**/**Exited** if **`down`** did not clear them. **`docker container prune -f`** removes stopped one-offs (does not remove named volumes by default).
4. **“Only newest” images for this stack:** Rebuild from current Dockerfiles so tags match this checkout:
   - **`docker compose build llm pdfaf`**  
   Optionally **`--no-cache`** if you must force a completely fresh build (slow, re-downloads ~3 GiB GGUF for **`llm`**).  
   Remove **old unused** images only if safe: e.g. dangling **`docker image prune`**, or **`docker rmi <id>`** for superseded **`pdfafv2-pdfaf`** / **`pdfaf-llm`** tags **after** the new build succeeds — do **not** delete images still referenced by a running container.
5. **Start stack:** **`docker compose up -d`** (or **`./scripts/docker-compose-pdfaf.sh up -d`**). Confirm **`docker compose ps`** shows **`llm`** healthy and **`pdfaf`** up; **`curl -sf http://127.0.0.1:6200/v1/health`**.
6. **Process staged PDFs:** Run **`./scripts/docker-remediate-input-dir.sh`** (default input dir is **`Input/from_sibling_pdfaf`**). Alternatively **`curl -F "file=@…" http://127.0.0.1:6200/v1/remediate`** per file.
7. **Deliverables for the user:** List each PDF, HTTP code, **`before.score` / `after.score` / `after.grade`**, path to saved JSON (and note if **`remediatedPdfBase64`** is present). Mention any **`docker compose`** / disk / port issues fixed.

## Constraints

- Prefer **minimal, focused** changes; do not refactor unrelated code.
- **Do not commit secrets** (passwords, HF tokens) into the repo.
- If **`docker`** requires **`sudo`**, fix Compose for root (plugin copy) or use **`docker`** group — document which you used.

---

_End of handoff block._
