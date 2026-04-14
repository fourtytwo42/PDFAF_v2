# Learnings from PDFAF v1 (`MEMORY.md`)

The v1 project keeps a long-running operational log at **`../pdfaf/MEMORY.md`** (sibling repo: `pdfaf/`, same parent directory as `PDFAF_v2/`). It does not replace the v2 PRD, but it explains **why an early v2 PRD looked simpler than v1 reality** and what **“better and faster”** should steal from production pain.

---

## Why the v2 PRD “drifted”

- **`MEMORY.md` encodes evolved v1 behavior**: batch lanes, tail modes, promotion gates, structure-vs-figure ordering, visual holds, resumable manifests, analysis profiles (`full_final` vs fast paths). That depth grew **after** any high-level v2 outline was written.
- **v2 Phase 1 intentionally chose pikepdf + pdfjs** over “qpdf JSON as primary structure” so analysis and future remediation share **one** serious structure stack. That is a **deliberate improvement**, not accidental neglect of the old PRD line.
- **Drift feeling** = two documents at different resolutions: PRD = intent; `MEMORY.md` = forensic detail. Keep v2 PRDs **linked** to this file so they stay honest.

---

## Principles to carry into v2 (from `MEMORY.md` themes)

### 1. One authoritative analysis on the bytes you ship

v1 caught cases where **`remediation_fast`** looked clean but **`full_final`** did not (e.g. misleading 100/A vs 89/B). **Lesson:** any gate that says “good enough to publish” must run the **same strict analysis profile** on the **final PDF bytes** after all mutations—not an optimistic shortcut.

**v2:** Remediation loop should always **re-`analyzePdf` the output file** with the production scorer (already the plan); avoid introducing a second “fast score” for promotion without labeling it as non-authoritative.

---

### 2. Structure before heavy figure work (especially on large PDFs)

v1 fixed a real bug: structure repairs only ran when **`pageCount ≤ 8`**, so large reports **never** got a proper tree and figure tools stayed deferred. Later policy runs **`bootstrap_struct_tree`**, **`repair_native_marked_content_refs`**, **`repair_structure_conformance`** up to much higher page limits (e.g. **240**) before native figure passes.

**v2:** Phase 2 planner must **not** gate baseline structure bootstrap on tiny page counts. Order: **structure / marked-content / conformance → then figures / alt**.

---

### 3. Do not waste cycles on already-passing inputs

v1 documented a concrete mistake: sending a PDF that **already passed** `full_final` into a manual MCP batch. **Fix:** preflight manifests with the **same** analysis used for promotion.

**v2:** Batch APIs, playbooks, and queue runners should **skip** or short-circuit when current analysis already meets the target threshold.

---

### 4. Visual parity is a first-class risk, not an afterthought

v1 added **`visual-approval-holds.json`**, `held_visual_review`, and tooling (`pnpm agency:visual-review-holds`) so visually risky replacements do not auto-promote.

**v2:** Remediation responses should eventually expose **visual-risk / human-review-required** flags (even if Phase 2 starts with a simple heuristic). Aligns with the product goal: **fix accessibility while keeping appearance the same**.

---

### 5. Bounded retries and “no effect” detection

v1 bounds figure repair iterations, skips candidates that repeatedly return **`no_effect`**, and uses plateau / tail modes to avoid infinite agent loops.

**v2:** Keep **max rounds**, **per-tool attempt caps**, and **stop when score plateaus** (already in PRD direction). Log **`no_effect`** outcomes per tool for learning/playbooks later.

---

### 6. Deterministic mixed-path ordering (empirically stabilized in v1)

Example convergence order from v1 mixed structure/figure work:

`normalize_heading_hierarchy` → `repair_native_marked_content_refs` → `repair_structure_conformance` → `normalize_nested_figure_containers` → `repair_native_figure_semantics` → `repair_other_elements_alt_text` → bounded figure repair.

**v2:** Phase 2’s staged tool order should **start from** this family ordering; adjust only with tests and corpus evidence.

---

### 7. Ops at scale: resumability and honesty

`MEMORY.md` is full of **manifests, progress JSON, ETA, single-owner locks, outcome bands** (`pass_ge_90`, `drop_fail_lt_80`, etc.). That is how you run **thousands** of PDFs without losing place.

**v2:** Phase 4 playbooks / queue UX can adopt the same **durable progress + explicit outcome bands** without importing v1’s entire agency surface area on day one.

---

### 8. What v2 should *not* copy blindly

- **Lane explosion** (dozens of named waves) was **necessary in v1** for a mature corpus campaign; v2 should earn complexity **only when** simple planner + tests stop moving the needle.
- **Playwright / heavy pixel paths** as default contrast or verification — v2 non-goals for Phase 1; use **only** where justified and bounded.

---

## How to use `MEMORY.md` while building v2

1. When designing a Phase 2 tool or gate, **grep v1 `MEMORY.md`** for the blocker id or tool name (`bootstrap_struct_tree`, `full_final`, `figure_alt`, etc.).
2. Prefer **one v2 ADR or PRD subsection** per major decision (“why we run full analysis on final bytes”) over copying paragraphs wholesale.
3. When v2 behavior diverges from a v1 lesson, **write one sentence why** (different corpus, smaller tool set, stricter visual default).

---

## Code-level map (how v1 actually repairs)

See **`docs/prd/v1-remediation-implementation-survey.md`** — `remediatePdfWithAgent` vs legacy `remediatePdf`, planner stages, Python `pdf_structure_helper.py`, and `executeRemediationTool` dispatch.

**v2 design:** keep the engine **criterion-driven** and independent of corpus — **`docs/prd/02-phase2-deterministic-remediation.md`** (*Generalization* section).

---

*Last distilled from `pdfaf/MEMORY.md` structure and grep cross-check (2026-04-14). The v1 file changes daily; treat this doc as guidance, not a mirror.*
