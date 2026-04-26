# Stage 102 Visual Stability All-Pages Check

Stage 102 improves the reusable visual stability validation path without
changing remediation behavior.

## Decision

Keep the Stage 101 comparison helper and extend the diagnostic script with an
`--all-pages` mode so before/after PDF comparisons can automatically cover the
full page range of either document.

## Evidence

- `src/services/semantic/pdfPageRender.ts` now exposes `getPdfPageCount` for
  reuse by visual validation tooling.
- `scripts/stage101-visual-stability-diagnostic.ts` now accepts `--all-pages`
  and resolves the shared page range before running pixel comparisons.
- `tests/benchmark/visualStability.test.ts` now checks page-count extraction
  against a real fixture PDF.

## Next Work

Use `--all-pages` for any remediation candidate whose visual impact might not
be confined to the first page. Keep treating any pixel drift as a blocker until
it is intentionally accepted.
