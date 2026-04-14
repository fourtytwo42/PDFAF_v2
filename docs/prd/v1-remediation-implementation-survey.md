# How PDFAF v1 fixes PDFs (implementation survey)

This document summarizes **how remediation is actually wired** in the **`pdfaf`** repository (`apps/api`), based on reading the source (not the web UI). Use it when designing **PDFAF v2 Phase 2+**.

**v1 API root:** `pdfaf/apps/api/src/`

---

## Two remediation paths (important)

### 1. `remediationService.ts` — `remediatePdf()` (legacy / narrow)

- Loads the PDF with **`pdf-lib`** (`PDFDocument.load`).
- Re-runs **`analyzeWithPdfjs`** + **`analyzeWithQpdf`** on the **original buffer**.
- Applies only **lightweight metadata** fixes (title display, language if already known), then **mostly skips** real structure work and pushes **manual review flags** (alt text, headings, tables, links, OCR for scanned).
- **Not** the path that clears ICJIA debt; it is a **safe minimal** export path.

### 2. `agentRemediationService.ts` — `remediatePdfWithAgent()` (main engine)

This is the **large** orchestrator (~8k+ lines) that batch jobs, queue processing, and MCP flows use. Rough flow:

1. **State:** `workingBuffer` (mutable PDF bytes), `currentResult` (`AnalysisResult`), action log, manual flags, metrics, inspection cache.
2. **Classify:** `classifyPdf` / `classifyPdfFull` + `buildPipelineConfig` — drives which tools and limits apply (`pdfClassificationService`, `toolReliabilityService`).
3. **Playbooks (optional fast path):** `findUsablePlaybookBySignatureHash` → replay learned tool sequences (`playbookService`).
4. **Inspect:** `inspectPdfForRemediation` in **`pdfRemediationTools.ts`** — builds **`PdfRemediationContext`** (pdfjs + qpdf + heading/figure/table candidates + **`runPdfStructureBackend`** `inspect` / deep modes). Caches light vs deep structure to save cost.
5. **Plan:** **`remediationPlanService.ts`** — `planRemediationActions`:
   - Uses **failure profiles** (`failureProfileService`) and **pipeline config**.
   - Emits ordered **`RemediationToolCall`**s with a global **`TOOL_STAGE_ORDER`** (metadata → structure bootstrap → links/annotations → fonts → native structure → headings/tables/figures…).
   - Can involve **LLM** (`plan_pdf_remediation` via OpenAI-compat) for planning; deterministic derivation also exists (`remediationCallDerivationService`).
6. **Execute:** For each planned call, **`executeRemediationTool`** (`pdfRemediationTools.ts`, giant `switch` on `tool_name`):
   - **Structure / tags / figures / tables / reading order / fonts (many ops):** delegates to **`pdfStructureBackend.ts`**, which spawns **Python** on  
     **`apps/api/scripts/pdf_structure_helper.py`** with **`--input`**, **`--request`** (JSON file), **`--output`** (result path).  
     Operations include `inspect`, `batch_mutate`, `bootstrap_struct_tree`, `repair_structure_conformance`, `set_figure_alt_text`, `repair_native_table_headers`, etc. (see `StructureBackendMutationRequest` in `pdfStructureBackend.ts`).
   - **pdf-lib:** metadata, some link text updates, and other JS-side edits.
   - **Adobe (optional):** `adobe_auto_tag` when `REMEDIATION.ENABLE_ADOBE_API` — `adobePdfServices.ts`.
7. **Re-analyze:** `analyzeIntermediatePdf` → **`analyzePDF`** with **`analysisProfile: 'remediation_fast'`** (faster, can diverge from strict `full_final` — see `MEMORY.md` / learnings doc).
8. **Loop:** Multiple **rounds / stages**, residual-family convergence, **tail** modes (figure tail, font tail…), **targeted figure finalization** (`targetedFigureFinalizationService`), bounded retries, `no_effect` handling, promotion gates (`promotionGate.ts`), and late **`full_final`** on final bytes (per `MEMORY.md` fixes).
9. **Output:** `ReconstructionOutput` + `finalResult` + metrics for ledger / queue.

**Takeaway for v2:** The “real” fixer is **agent + Python pikepdf helper + staged planner**, not `remediatePdf()`.

---

## Key files (by role)

| Role | File(s) |
|------|-----------|
| Main loop | `services/agentRemediationService.ts` (`remediatePdfWithAgent`) |
| Tool dispatch | `services/pdfRemediationTools.ts` (`executeRemediationTool`, `inspectPdfForRemediation`) |
| Python bridge | `services/pdfStructureBackend.ts` → `scripts/pdf_structure_helper.py` |
| Staged ordering | `services/remediationPlanService.ts` (`TOOL_STAGE_ORDER`, `planRemediationActions`) |
| Failure → planner inputs | `services/failureProfileService.ts`, `documentModel.ts` types |
| Semantic / LLM alt | `semanticEnrichmentService.ts`, `altTextDraftingService.ts`, `openAiCompatService.ts` |
| OCR branch | `ocrService.ts` |
| Legacy simple path | `services/remediationService.ts` |
| Queue / visual compare | `services/remediationOrchestrator.ts` (canvas page-1 compare, bookmark validation, stages for upload pipeline) |

---

## Python helper contract (v1)

- **Binary:** `python` (or `PYTHON_PATH`) + **`apps/api/scripts/pdf_structure_helper.py`**.
- **IPC:** JSON **request file** + paths; stdout/stderr bounded; timeouts per operation (inspect vs `repair_other_elements_alt_text` etc.).
- **`batch_mutate`:** Multiple mutations in **one** subprocess “open → apply → save” for performance (`MEMORY.md` mentions reducing spawn overhead).

v2 already uses a similar idea with **`python/pdf_analysis_helper.py`** for **analysis**; Phase 2 should **extend** that script (or share types) rather than invent a third pipeline.

---

## Staging order (simplified from `remediationPlanService.ts`)

Stages are explicit sets; numeric order is in **`TOOL_STAGE_ORDER`**:

1. **Metadata / PDF/UA id:** `set_pdfua_identification`, `set_document_title`, `set_document_language`, …  
2. **Structure bootstrap:** `bootstrap_struct_tree`, `repair_malformed_bdc_operators`, `repair_native_marked_content_refs`, chart ref repair, `repair_structure_conformance`.  
3. **Links & annotations:** `repair_native_link_structure`, `tag_unowned_annotations`, tab order, `repair_annotation_alt_text`, `set_link_annotation_contents`, …  
4. **Fonts:** embed / Unicode / CID / substitution passes.  
5. **Native structure & content semantics:** `normalize_nested_figure_containers`, `repair_other_elements_alt_text`, `repair_native_figure_semantics`, `repair_native_table_headers`, `repair_native_reading_order`, `artifact_nonsemantic_page_elements`, optional **`adobe_auto_tag`**.  
6. **Safe candidates:** bookmarks from headings, heading create/normalize, table headers, figure alt / decorative / retag, `reorder_structure_children`.

v1 **learned** (via `MEMORY.md`) that **running (2) before heavy (5)** on **large** PDFs is non-negotiable.

---

## v2 general planner (not corpus-specific)

v1’s **residual families** and batch **lanes** were productivity tools for one large deployment. In v2, the **remediation core** should stay **criterion-only**: inputs = `AnalysisResult` / `DocumentSnapshot` + config; ordering = category weights and tool applicability; playbooks = abstract signature hashes (Phase 4). See **`docs/prd/02-phase2-deterministic-remediation.md`** section *Generalization — not tied to specific PDFs or “families”*.

---

## What v2 should copy vs simplify

**Copy**

- **Single Python entrypoint** for structurally dangerous work + **batch_mutate** style batching where possible.
- **Explicit stage order** + planner that maps **failure categories → tools**.
- **Re-score after each meaningful batch**; final pass with **authoritative** analysis profile on **final bytes**.
- **Inspection cache** (light vs deep) to stay fast.
- **Manual / visual flags** instead of silent layout risk.

**Simplify (v2 intent)**

- One **orchestrator** file size target (~500 lines in PRD vision) vs multi-thousand-line god service — extract **planner**, **executor**, **metrics** modules early.
- **Fewer named “lanes”** until corpus scale demands it.
- **Adobe / veraPDF** optional or absent in v2 until proven necessary.

---

## Related reading

- **`docs/prd/learnings-from-v1-memory.md`** — distilled operational lessons from `pdfaf/MEMORY.md`.
- **`pdfaf/MEMORY.md`** — exhaustive runbook (grep by tool name or blocker id).

---

*Survey date: 2026-04-14. Line counts and file paths refer to the `pdfaf` repo layout at that time.*
