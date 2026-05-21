# Figure/Caption/BBox Diagnostic - 2026-05-21

## Decision

Decision: `keep_figure_caption_bbox_diagnostic_only`.

No scoring, PAC gate, remediation, planner, Docker/API, or benchmark behavior changed.

This diagnostic checks whether native PDFAF evidence can safely promote either:

- caption-assisted figure alt remediation; or
- stricter PAC-style Figure `/BBox` scoring.

## Source Change

- `scripts/figure-caption-bbox-diagnostic.ts`
- `tests/scripts/figureCaptionBboxDiagnostic.test.ts`

The script runs native `analyzePdf`, uses native PAC rule evidence, and writes local JSON/Markdown under `/mnt/pdf-review`. It does not call PAC, POC, ODL, Java, remediation, or PDF mutation paths.

## Local Diagnostic

Local artifact:

- `/mnt/pdf-review/pdfaf-figure-caption-diagnostics/figure-caption-bbox-2026-05-21-r2`

Sample:

- `14` figure-heavy original/edge rows plus ADAM/Teams/accessible controls.

Result:

- Decision: `keep_figure_caption_bbox_diagnostic_only`
- `caption_focus=1`
- `caption_controls=0`
- `bbox_focus=0`
- `bbox_controls=0`
- `analysis_errors=0`

Classification distribution:

- `figure_alt_existing_score_active`: `9`
- `figure_caption_noise_or_control`: `3`
- `no_figure_gap`: `2`
- `caption_alt_behavior_candidate`: `1`

## Key Evidence

Most figure rows already have score-active figure-alt debt:

- `4188`
- `4466`
- `4754`
- `4755`
- `4751`
- `4145`
- `4758`
- Teams original/remediated controls

Caption-assisted behavior does not have enough support:

- Only `4748` had both low alt score and native figure-caption pair evidence.
- No control row was a caption-alt behavior candidate, but `1` focus row is not enough to justify a production behavior stage.

Figure `/BBox` scoring is not clean:

- Several low-score rows have missing BBox evidence, but they are already dominated by score-active alt/PDF-UA debt.
- `pdfaf_fixture_accessible` has `1` missing BBox while remaining `96/A`.
- Teams controls have many missing BBox rows alongside known figure-alt debt.

Do not add a BBox score cap from this sample. It would be stricter grading, but this evidence is not clean enough to separate real high-impact PAC debt from benign or already-covered residue.

## Next Step

Park broad figure/caption/BBox promotion.

Good next PAC/POC lanes:

- list structure, because native list audit rows are already score-cap capable;
- PDF/UA catalog/syntax, if a clean detection gap exists beyond already active metadata/catalog caps;
- artifacts/page-furniture safety, as safety evidence only.

If figure/caption work resumes, use a narrower sample centered on rows with repeated one-to-one caption pairs and low alt score, not broad BBox debt.
