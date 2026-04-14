# v2 opportunities from PDFAF v1

Concrete ideas to make **PDFAF v2** faster, more effective, and more efficient — distilled from v1 code (`pdfaf/apps/api`) and `pdfaf/MEMORY.md`. Not all need to land in Phase 2; treat this as a **prioritized backlog** aligned with `docs/prd/00-overview.md`.

---

## Analysis (Phase 1 — extend)

| Idea | v1 lesson | v2 today / action |
|------|-----------|-------------------|
| **Single authoritative profile for “ship” decisions** | `remediation_fast` vs `full_final` mismatch misled gates | Keep one default **`analyze`** profile for scoring; if you add `fast`, never use it alone for promotion — label non-authoritative scores in JSON |
| **Structure inspect depth flag** | v1 toggles `preferDeepStructureInspect` / light vs deep to save time | Optional query param or header later: `?depth=light|full` for repeat jobs; default **full** for first touch |
| **Batch Python inspect** | v1 `batch_mutate` reduces subprocess churn | When adding multi-op flows, batch reads in one Python invocation where safe |
| **Structured timing in response** | v1 `remediationMetrics` helps find slow phases | Extend `AnalysisResult` with optional **`timingsMs: { pdfjs, python, score }`** (behind flag or always-on low overhead) |
| **Skip redundant analyze on cache hit** | Already ~2ms on repeat hash | Document + test; consider **conditional HEAD** or client hint for unchanged uploads |

---

## Remediation (Phase 2+)

| Idea | v1 lesson | Action |
|------|-----------|--------|
| **Stage batch one Python round-trip** | v1 batches many structure ops per subprocess | Planner emits **batches** of compatible mutations → one `pdf_analysis_helper.py` call per stage where ordering allows |
| **Tool outcome ledger from day one** | v1 `toolOutcomes` / reliability maps inform planner | SQLite `tool_outcomes` early: `tool_name`, `pdf_class`, `outcome` (applied / no_effect / failed), `score_delta` — feeds Phase 4 and avoids blind retries |
| **`no_effect` cap per tool per document** | v1 skips repeated useless work | Orchestrator: after N `no_effect`, exclude tool for remainder of run |
| **Dependency order in planner** | Large PDFs failed when structure capped at 8 pages | Encode **structure-before-figures** (and page-limit policy) in `planner.ts` + tests — already in PRD generalization |
| **Promotion gate object** | v1 `evaluatePromotionGate` (min score, scanned, manual flags) | One small module: **remediate succeeds** only when re-analysis meets policy; return **`gate: { passed, reasons[] }`** in JSON |
| **Visual risk without Playwright default** | v1 visual holds + optional canvas compare | Start with **heuristic risk flags** per tool; optional **page-1 pixel diff** (sharp/png) as env-gated later, not default hot path |
| **Sidecar pattern for heavy semantic** | v1 alt text sidecar | If LLM alt grows large, optional **sidecar file** keyed by `analysis.id` to avoid bloating main PDF pass |

---

## API and operations

| Idea | v1 lesson | Action |
|------|-----------|--------|
| **`503` + `Retry-After` on overload** | v1 queue semantics | Already 429 on analyze semaphore — document same for remediate; consider **`Retry-After`** header |
| **Idempotency key** | Batch retries duplicate work | Optional header **`Idempotency-Key`** for analyze/remediate: same key + same bytes → same result reference |
| **Request correlation id** | Huge logs need tracing | Middleware: `X-Request-Id` → structured log line (minimal logger later) |
| **Dry-run analyze** | v1 `--dry-run` on batches | Optional **`?dry_run=1`** returning plan / category summary without full Python path (later) |

---

## Data and config

| Idea | v1 lesson | Action |
|------|-----------|--------|
| **Version the analysis JSON blob** | Schema drift in `queue_items` | Add **`schemaVersion: 1`** inside persisted `analysis_result` for migrations |
| **Config for timeouts per subsystem** | v1 per-op timeouts in `pdfStructureBackend` | Already partial in v2 `config.ts` — extend **`PYTHON_*`**, **`PDFJS_*`** explicitly; no magic numbers in services |
| **Feature flags in env** | v1 `REMEDIATION.ENABLE_*` | `.env.example` entries for **OCR**, **LLM**, **experimental tools** — default off |

---

## Quality and CI

| Idea | v1 lesson | Action |
|------|-----------|--------|
| **Golden PDF regression set** | v1 ICJIA campaigns | Small **committed** fixtures (synthetic or rights-cleared) + **optional** path to full corpus in CI secret / self-hosted runner |
| **Property tests on planner** | v1 huge `agentRemediationService.test` | Pure **`planner(snapshot) → tool[]`** tests: order, dedupe, applicability, no id-specific branches |
| **Regression: score monotonicity** | Bad tools should not ship silently | Test: remediate loop **never increases** critical finding count without explicit “destructive” tool flag (where applicable) |

---

## What not to copy early

- **Lane / campaign explosion** until v2 has volume and metrics.
- **Adobe / veraPDF** in the hot path until deterministic + pikepdf plateau.
- **Multi-thousand-line single orchestrator** — split **planner / executor / metrics** as Phase 2 lands.

---

## Where this lives in the PRD

- **Generalization & criterion planning:** `docs/prd/02-phase2-deterministic-remediation.md`
- **v1 code map:** `docs/prd/v1-remediation-implementation-survey.md`
- **Operational war stories:** `pdfaf/MEMORY.md` + `docs/prd/learnings-from-v1-memory.md`

---

*Prioritize by: (1) correctness / single source of truth for scores, (2) batching and fewer subprocesses, (3) observability, (4) playbook data. Revisit this list after Phase 2 MVP.*
