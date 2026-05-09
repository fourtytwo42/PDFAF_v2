# All-Input Mean Goal Baseline

Generated from the first `/goal` checkpoint for the full local `Input/` tree.

## Corpus Scope

- Raw PDF paths under `Input/`: `482`
- Regular PDF files: `432`
- Unique PDFs by SHA-256: `351`
- Duplicate regular paths: `81`
- Broad validation root: `Output/goal-all-input-mean-2026-05-09-r1/`
- Shard validation path: `Output/goal-all-input-mean-2026-05-09-r1/shard-runs/`
- Command shape: `baseline-corpus-batch.ts --no-semantic --no-pdfs`, run across eight deduped symlink shards with four concurrent workers.
- Runtime policy: deterministic only; no semantic AI. Existing API/LLM listeners were checked first. A local `llama-server` process was already resident and could not be stopped by this user, but the batch ran with `--no-semantic`.

This is a broad all-input baseline, not a Stage 41 protected-corpus gate. It is the working denominator for the current mean `>=93` goal.

## Current Result

- Unique PDFs processed: `351/351`
- Mean after remediation: `88.52`
- Median after remediation: `93`
- Grade distribution: `259 A / 41 B / 9 C / 9 D / 33 F`
- Rows below `93`: `136`
- Total points needed for mean `93`: `1572`
- Runtime mean / median / p95 / max: `68487.6ms / 21842ms / 351416ms / 877593ms`

The run is quality-close but not goal-ready. The mean needs roughly `4.48` points per PDF across the full deduped corpus, or `1572` total score points.

## Deficit Families

The reusable diagnostic in `scripts/all-input-mean-diagnostic.ts` groups below-target rows by the category family most likely to explain the score gap:

| Family | Count | Deficit to 93 | Notes |
| --- | ---: | ---: | --- |
| `heading_reading_order` | 29 | 854 | Largest score lever; includes hard `heading_structure=0` rows and long runtime tails. |
| `table_debt` | 13 | 358 | Direct table markup failures; several long reports and v1 table residuals. |
| `alt_debt` | 8 | 280 | Figure/alt residuals, sometimes mixed with heading debt. |
| `link_reading_debt` | 78 | 262 | Many near-target A/B rows with small deficits and runtime cost. |
| `table_alt_mixed` | 3 | 76 | Multi-family rows; likely need diagnostic selection before mutation. |
| `pdfua_strict_debt` | 4 | 7 | Mostly near-pass strict PAC caps. |
| `aggregate_near_pass_or_unknown` | 1 | 2 | Small residual. |

The immediate score path should prioritize heading/reading and table/header rows, not broad scoring changes.

## PAC/POC Lowest-40 Findings

The POC/PAC strong-area diagnostic was run on the lowest 40 broad-baseline rows:

- Output: `Output/goal-all-input-mean-2026-05-09-r1/poc-strong-lowest-40/`
- Files analyzed: `40`
- Status distribution: `147 fail / 122 warn / 950 pass / 221 not_applicable`

Top direct fail rules:

| Rule | Failed files | Category |
| --- | ---: | --- |
| `pdfua.font.to_unicode_cmap_valid` | 31 | `text_extractability` |
| `pdfua.font.to_unicode_cmap_present` | 28 | `text_extractability` |
| `pdfua.structure.child_roles_valid` | 21 | `pdf_ua_compliance` |
| `pdfua.content.image_tagged_or_artifacted` | 20 | `pdf_ua_compliance` |
| `pdfua.table.header_association_present` | 16 | `table_markup` |
| `pdfua.content.text_tagged_or_artifacted` | 9 | `reading_order` |
| `pdfua.table.header_cells_associated` | 9 | `table_markup` |

Interpretation:

- PAC/POC parity evidence is exposing real machine-checkable debt on the lowest rows.
- Font/CMap failures are frequent, but prior strict-grader work intentionally kept font/CMap diagnostic-only because it was noisy as a numeric cap. Do not restore broad font/CMap scoring caps without a separate stability stage.
- Table/header association and content tagging evidence are strong candidates for object-level remediation diagnostics.
- Many low rows still score poorly because heading/reading structure remains unrecovered, so PAC evidence should be used to choose safer repairs rather than merely making scores harsher.

## Decision

Current state is not ready for behavior changes from the broad run alone. The next checkpoint should be a target-selection diagnostic over the score-moving low rows, using the new broad baseline plus POC/PAC evidence:

1. Select a focused subset from the largest deficits: heading/reading rows, table/header rows, and mixed table/alt rows.
2. Produce remediated PDFs and traces only for that subset, not all `Input/`.
3. Compare our internal categories, PAC leaf evidence, tool timelines, and POC/PAC-derived object evidence.
4. Add behavior only when the target has stable object identity and a no-regression acceptance check.

Generated benchmark/PDF artifacts stay under `Output/` and are not source-controlled.
