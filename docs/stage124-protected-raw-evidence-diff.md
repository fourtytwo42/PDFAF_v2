# Stage 124 Protected Raw Evidence Diff

Stage 124 adds a diagnostic-only raw evidence diff for protected checkpoint PDFs. It does not change remediation routing, font behavior, scorer semantics, Stage 41 gate logic, or auto-evolve behavior.

## What Changed

- Added `scripts/stage124-protected-raw-evidence-diff.ts`.
- The diagnostic reads Stage 123-style `protected-states/<row-id>/` checkpoint PDFs.
- For each checkpoint it repeats external `analyzePdf(..., { bypassCache: true })` and raw `python/pdf_analysis_helper.py`.
- It writes JSON and Markdown with evidence family signatures, count ranges, high-score-only evidence, low-score-only evidence, category swings, and checkpoint classification.

## Evidence

Target run:

- `Output/experiment-corpus-baseline/run-stage124-target-protected-2026-04-26-r1`
- Diagnostic: `Output/experiment-corpus-baseline/stage124-protected-raw-evidence-diff-2026-04-26-r1`

The diagnostic classified all captured checkpoints as raw Python variance:

- `raw_python_category_specific_variance`: 29 checkpoints
- `raw_python_structural_variance`: 24 checkpoints

Primary protected rows:

- `long-4516`: five checkpoints with external scores such as `69, 69, 69, 69, 89` and `69, 89, 69, 89, 89`. High/low repeats lose or recover whole heading/table/figure families: headings `0-34`, tables `0-17`, figures `0-21`, paragraph structure elements `0-1629`.
- `long-4683`: six checkpoints. Several repeats swing between `69` and `98`; the high/low difference again includes whole evidence families, such as tables `0-11`, figures `0-16`, and paragraph elements `0-1612`.
- `short-4176`: one below-floor checkpoint with stable external score `79`, but heading-related raw evidence still varies.

Controls:

- `font-4156` and `font-4172` also show raw variance that can affect category scores.
- `font-4699` shows repeated raw structural variance that is score-stable.

## Decision

Stage 124 remains diagnostic-only. The evidence points to broad raw Python structural extraction variance, not a proven small deterministic merge or capped-collection ordering bug.

Do not implement a new analyzer fix from this stage alone:

- Some failures lose entire evidence families rather than just duplicate wrappers or ordering.
- Controls show similar raw variance, sometimes harmless and sometimes category-affecting.
- A broad canonicalization or first/best wrapper merge would risk repeating earlier rejected analyzer changes that stabilized to lower-quality evidence.

The next safe direction is a narrower analyzer root-cause stage focused on why the Python helper intermittently returns empty or near-empty structure-family evidence for the same checkpoint bytes.
