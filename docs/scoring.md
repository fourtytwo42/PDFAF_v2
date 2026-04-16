# PDFAF v2 — Scoring model

The scorer is a **pure function** of `DocumentSnapshot` plus lightweight metadata: it performs no I/O. Implementation: [`src/services/scorer/scorer.ts`](../src/services/scorer/scorer.ts). Constants and weights live only in [`src/config.ts`](../src/config.ts).

## Weighted score (0–100)

Each of 11 **category keys** has a nominal weight in `SCORING_WEIGHTS`. The sum of weights is **1.0** (enforced by tests).

When a category is **not applicable** (`applicable: false` on the scored result), its weight is **redistributed proportionally** across the remaining applicable categories so the effective weights still sum to 1.

### Bookmarks N/A

For documents with fewer than `BOOKMARKS_PAGE_THRESHOLD` pages (default 10), the bookmarks category is typically marked not applicable—outline navigation is less critical for very short documents.

## Letter grades

Thresholds from `GRADE_THRESHOLDS` on the final weighted score:

| Grade | Score range |
|-------|----------------|
| A | 90–100 |
| B | 80–89 |
| C | 70–79 |
| D | 60–69 |
| F | 0–59 |

## Categories (high level)

| Key | Nominal weight | Role |
|-----|----------------|------|
| `text_extractability` | 0.175 | Text vs image-only pages, tagging |
| `title_language` | 0.130 | Title and language metadata |
| `heading_structure` | 0.130 | Heading hierarchy coverage |
| `alt_text` | 0.130 | Figures and alternative text |
| `pdf_ua_compliance` | 0.095 | PDF/UA markers |
| `bookmarks` | 0.085 | Outline / bookmarks |
| `table_markup` | 0.085 | Table headers |
| `color_contrast` | 0.045 | Heuristic contrast (no pixel engine in v2) |
| `link_quality` | 0.045 | Link text quality |
| `reading_order` | 0.040 | Structure / reading order signals |
| `form_accessibility` | 0.040 | Form field labels |

Each `ScoredCategory` includes `findings`: structured items with `wcag` criterion id (for example `1.1.1`), `severity`, `message`, and optional `page` / `count`.

## PDF class

`pdfClass` (`native_tagged`, `native_untagged`, `scanned`, `mixed`) influences which remediation tools apply and appears in learning / playbooks signatures. It is derived from tagging and image-to-text ratio heuristics, not from filenames.

## Remediation planning threshold

Planner treats a category as **failing** when `applicable && score < REMEDIATION_CATEGORY_THRESHOLD` (default 90). This aligns with the failure signature used for playbooks.
