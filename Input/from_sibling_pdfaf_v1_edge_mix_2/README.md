# v1 Edge Mix 2

Second local v1-derived corpus for PDFAF_v2 validation and next-fixer selection.

- Source repo: `/home/hendo420/pdfaf`
- Source inputs: original cached PDFs under `ICJIA-PDFs/backups/server-cache` where available
- v1 metadata is selection context only; v2 Stage 57 baseline is the source of truth
- PDF payloads are ignored by git via `.gitignore`

Run with:

```bash
pnpm run benchmark:edge-mix -- --manifest Input/from_sibling_pdfaf_v1_edge_mix_2/manifest.json --out Output/from_sibling_pdfaf_v1_edge_mix_2/run-stage57-baseline-2026-04-24-r1
```

Stage 57 baseline result:

- Run: `Output/from_sibling_pdfaf_v1_edge_mix_2/run-stage57-baseline-2026-04-24-r1`
- Completed: `16 / 16`
- Mean: `39.88 -> 84.56`
- Median: `37.5 -> 90.5`
- Grades after: `8 A / 4 B / 0 C / 2 D / 2 F`
- Attempts: `227`
- False-positive applied: `0`
- Dominant residuals: `figure_alt_tail: 3`, `mixed_tail: 2`, `table_tail: 1`, `zero_heading_tail: 2`

Worst-row analysis-repeat:

- Run: `Output/from_sibling_pdfaf_v1_edge_mix_2/stage57-analysis-repeat-2026-04-24-r1`
- Decision: `analysis_determinism_candidate`
- Harmful variance: Python structural variance on `v1-4722` and `v1-4171`
- Stable manual/scanned Fs: `v1-3479`, `v1-3507`
