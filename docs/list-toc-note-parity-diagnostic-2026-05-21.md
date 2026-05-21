# List/TOC/Note PAC Parity Diagnostic - 2026-05-21

## Decision

Decision: `keep_list_toc_note_diagnostic_only`.

No scoring, PAC gate, remediation, planner, Docker/API, or benchmark behavior changed. This is a native diagnostic checkpoint only.

The diagnostic checks whether native PDFAF list, TOC, and Note evidence exposes a safe PAC/POC-style lane for either:

- existing list parentage repair behavior;
- a new Lbl/LBody repair design; or
- TOC/Note evidence hardening.

## Source Change

- `scripts/list-toc-note-parity-diagnostic.ts`
- `tests/scripts/listTocNoteParityDiagnostic.test.ts`

The script runs native `analyzePdf`, builds native PAC rule evidence, and writes local JSON/Markdown under `/mnt/pdf-review`. It does not call PAC, POC, ODL, Java, remediation, PDF mutation, or production scoring/planner paths.

## Local Diagnostic

Local artifact:

- `/mnt/pdf-review/pdfaf-list-diagnostics/list-toc-note-parity-2026-05-21-r1`

Sample:

- `10` guide/report/holdout focus PDFs with possible list, TOC, or Note structure.
- `5` controls: ADAM, three Teams variants, and `pdfaf_fixture_accessible`.

Result:

- Decision: `keep_list_toc_note_diagnostic_only`
- `repair_focus=0`
- `repair_controls=0`
- `design_focus=0`
- `design_controls=0`
- `toc_focus=1`
- `toc_controls=0`
- `analysis_errors=0`

Classification distribution:

- `no_list_toc_note_debt`: `10`
- `list_toc_note_noise_or_control`: `4`
- `toc_note_diagnostic_gap`: `1`

## Key Evidence

No row showed native repairable list parentage debt:

- `listItemMisplacedCount=0`
- `lblBodyMisplacedCount=0`
- `listsWithoutItems=0`

Several low-score reports had no list/TOC/Note evidence at all, so this lane would not address their current failures.

List structure was present but clean on multiple rows:

- `4606`: `9` lists, `59` list items, no native list debt.
- `4608`: `3` lists, `3` list items, no native list debt.
- `4680`: `7` lists, `52` list items, no native list debt.
- `pdfaf_fixture_accessible`: `1` list, `3` list items, no native list debt.

One Virginia holdout row had TOC debt:

- `va-17-report-on-analysis-of-traffic-stop-data-fiscal-year-2024`: `4` TOC link/destination debt items and `pdfua.toc.toci_links_valid`.

That is useful evidence to keep visible, but one focus row is not enough to justify score-active hardening or remediation behavior.

## Next Step

Park list repair and Lbl/LBody design until a sample shows real object-backed native list debt.

If this lane is revisited, start from PDFs with actual PAC/POC list parentage failures and verify the native audit sees one of:

- misplaced `LI` parentage;
- misplaced `Lbl` / `LBody` parentage;
- list containers with no list items.

The stronger next PAC/POC lanes are PDF/UA catalog/syntax and artifacts/page-furniture safety, unless a targeted TOC/Note evidence-hardening sample produces repeated focus-only debt with clean controls.
