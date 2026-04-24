# v1 Edge Mix Corpus

This local corpus was copied from the sibling v1 repository at `/home/hendo420/pdfaf`.

Purpose:

- Park the current Stage 45/48 D/F tail work.
- Broaden v2 testing with v1 original cached PDFs that cover a wider problem mix.
- Provide a compact edge-case set before resuming fixer work.

Selection source:

- Original cached PDFs from `ICJIA-PDFs/backups/server-cache`.
- v1 manifest metadata from `ICJIA-PDFs/manifests`.
- The manifest scores are v1 historical scores, not fresh v2 results.

Corpus shape:

- `figure_alt/`: figure ownership and alt-text failures.
- `structure_heading/`: heading, logical structure, and short fact-sheet cases.
- `table_font_link/`: table, font, and annotation/link-heavy cases.
- `long_report/`: long reports and runtime-stress cases.
- `near_pass_manual/`: near-pass and manual-tail examples.

Run notes:

- Do not paste PDF payloads or generated Base64 into logs or docs.
- Treat PDFs here as local input assets; do not commit them unless explicitly approved.
- Use `manifest.json` for publication IDs, v1 grades, and blocker-family context.
