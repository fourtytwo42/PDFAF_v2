# Spike: Phase 3c-c — Insert `StructElem` / true untagged heading promotion

**Status (v2):** **Implemented for CI + read-only analysis + controlled insert on orphan fixture.** Golden and orphan **Producer**-marked PDFs, **`mcidTextSpans`** (with **`resolvedText`** heuristic), **`orphanMcids`**, **`orphan_v1_insert_p_for_mcid`** / **`orphan_v1_promote_p_to_heading`**, opt-in **`PDFAF_SEMANTIC_UNTAGGED_TIER2`** path using **`retag_struct_as_heading`**, and subprocess tests under **`tests/threecc/`**. **Still not done at production scale:** arbitrary native_tagged PDFs with full **ParentTree / StructParents** surgery, validated insert on diverse encoders, and **N real** gov/ICJIA corpus proof (stakeholder-driven).

## Appendix A — Dev CLI (`pdf_analysis_helper.py`)

| Flag | Arguments | Purpose |
|------|-----------|---------|
| `--write-3cc-golden` | `<output.pdf>` | One-page tagged fixture; **Info /Producer** `pdfaf-3cc-golden-v1`; `/P << /MCID 0 >> BDC`…; **`Document` → `/P` StructElem** with `K=0`. |
| `--write-3cc-orphan` | `<output.pdf>` | One-page tagged fixture; **Producer** `pdfaf-3cc-orphan-v1`; same stream MCID block; **`Document` `/K` empty** (MCID orphan until insert mutator). |
| `--dump-structure-page` | `<0-based-page> <pdf>` | JSON: `structTreeRootPresent`, `parentTreeNumsPairCount`, page dict keys, `mcidMatches`, `contentSnippet` (truncated), **`goldenMarker`**, **`orphanMarker`**. |

**Analysis JSON** (`python3 pdf_analysis_helper.py <path>`) includes:

- **`threeCcGoldenV1`**, **`threeCcGoldenOrphanV1`:** Producer markers (evaluated **before** `extract_metadata` so `open_metadata` does not rewrite **`/Producer`** in a way that breaks detection).
- **`orphanMcids`:** `{ page, mcid }` entries present in content streams but not referenced as integer `/K` (or `/MCR` `/MCID`) on structure elements (bounded list).
- **`mcidTextSpans`:** capped list (`MAX_MCID_SPANS` / **`MAX_MCID_TEXT_SPANS`**) of `{ page, mcid, snippet, resolvedText? }`; **`resolvedText`** is best-effort text after `/MCID` (literal `(...) Tj`; see Python for limitations).
- **`paragraphStructElems` / figures:** optional **`bbox`** when derivable from structure attributes.

**Env (Node bridge passes through):** **`PDFAF_SEMANTIC_MCID_MAX_PAGES`** — max pages scanned for MCID collection (default 50); see **`SEMANTIC_MCID_MAX_PAGES`** in `src/config.ts`.

## Appendix B — Milestones delivered vs remaining

| Item | State |
|------|--------|
| Golden PDF generator + CI subprocess tests | Done (`tests/threecc/goldenAnalysis.test.ts`) |
| Orphan PDF generator + insert mutator + post-insert analysis | Done (same test file + `orphan_v1_insert_p_for_mcid`) |
| `golden_v1_promote_p_to_heading` mutator (golden Producer only) | Done |
| `orphan_v1_promote_p_to_heading` mutator (orphan Producer only) | Done |
| `semanticUntaggedHeadings` + `untaggedHeadingSemantic.ts` | Done: producer fixtures + **insert-first** for orphan when needed; **`PDFAF_SEMANTIC_UNTAGGED_TIER2=1`** for Marked `native_tagged` + **`retag_struct_as_heading`**; otherwise **`unsupported_pdf`** |
| MCID→text (`resolvedText` + snippet) without relying on StructElem for stream text | **Done (heuristic)** — hex/`TJ` arrays / odd encoders still gaps |
| Insert `StructElem` + `Document` `/K` for orphan MCID (CI fixture) | Done |
| Minimal **ParentTree `/Nums`** + page **`/StructParents`** after orphan insert (single-page orphan Producer only) | Done |
| Insert + **full ParentTree / StructParents** for arbitrary tagged PDFs | **Not done** |
| Broad corpus / ICJIA validation (N real PDFs) | **Not done** (manual or scripted offline; N with stakeholders) |

## Problem

Phase 3c-a promotes existing tagged `/P` nodes via `structRef`. Many PDFs have:

- Visible text with **no** corresponding `StructElem`, or
- A structure tree that does not map cleanly to content (missing `MCID`, broken `ParentTree`).

Promoting “body” lines in those cases requires **creating or rewiring** structure entries and linking them to marked content in content streams.

## Technical dependencies (incomplete list)

1. **Marked content and MCIDs**  
   Identify `BDC … EMC` sequences, `/MCID` integer assignments, and which content belongs to which structure element.

2. **`StructElem` dictionary**  
   `/Type /StructElem`, `/S` role, `/K` (MCID reference, object refs, or arrays), `/P` parent pointer.

3. **`ParentTree` / `StructTreeRoot`**  
   Updating `Nums` arrays so page content → structure mapping stays valid after edits (**minimal for CI orphan; arbitrary PDFs remain**).

4. **`MarkInfo` / tagged flag**  
   Keeping `Marked: true` and tag tree consistent with `MarkInfo` expectations for PDF/UA tooling.

5. **Reading order**  
   `/K` order and sibling relationships; wrong insertion can regress `reading_order` scoring worse than a missed heading.

6. **qpdf / pikepdf limits**  
   Prefer **pikepdf** (already in repo) for surgery; validate with **pdfjs** re-read and government PDF fixtures.

## Recommended research sequence

1. ~~Instrument `pdf_analysis_helper.py` to dump a **single-page** tagged PDF’s `StructTreeRoot`…~~ **Done** (`--dump-structure-page`).
2. ~~Prototype **read-only** MCID → text map~~ **Done** (`mcidTextSpans`, `resolvedText` v1).
3. ~~Design minimal mutation~~ **Done** for orphan CI (`orphan_v1_insert_p_for_mcid`).
4. ~~Add **golden PDFs** in CI~~ **Done** (golden + orphan + invariants).
5. Extend to **diverse real PDFs** + ParentTree parity before LLM-driven “insert heading here” at scale.

## Exit criteria before coding at scale

- [ ] MCID map proven on ≥ N real ICJIA-style PDFs (N agreed with stakeholders).
- [x] Automated tests cover insert + re-analyze on **CI orphan fixture** (`tests/threecc/goldenAnalysis.test.ts`, `phase3Invariants.test.ts`). **Weighted score regression** on untagged path matches **`SEMANTIC_REGRESSION_TOLERANCE`** pattern in `untaggedHeadingSemantic.ts` (same as promote).
- [x] Rollback path identical to existing semantic passes (`SEMANTIC_REGRESSION_TOLERANCE` re-analyze revert) for **`semanticUntaggedHeadings`**.

## References

- PDF 32000-2 (Tagged PDF), structure types, `ParentTree`.
- PDF/UA-1 (`pdfuaid` XMP) for conformance expectations.
