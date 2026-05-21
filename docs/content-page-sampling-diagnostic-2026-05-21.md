# Content Page Sampling Diagnostic - 2026-05-21

## Decision

Decision: `keep_page_sampling_diagnostic_only`.

No scoring, PAC gate, remediation, planner, Docker/API, or benchmark behavior changed. Normal analyzer content-event sampling remains the current first-page bounded sample.

This stage adds diagnostic-only comparison tooling for content-stream page sampling. It compares:

- current same-budget `first` sampling;
- same-budget `stratified` sampling across the document.

The diagnostic exists to decide whether the remaining content-event coverage lane, especially long-document row `4057`, supports a runtime-bounded sampling promotion.

## Source Change

- `python/pdf_analysis_helper.py`
  - adds `--dump-content-tagging-audit <pdf> <strategy> <maxPages>`;
  - adds passive `contentSampleStrategy` and `sampledPageIndices` fields to the audit output;
  - does not change the default production sampling strategy.
- `scripts/content-page-sampling-diagnostic.ts`
- `tests/scripts/contentPageSamplingDiagnostic.test.ts`

## Local Diagnostic

Local artifact:

- `/mnt/pdf-review/pdfaf-content-tagging-diagnostics/content-page-sampling-2026-05-21-r1`

Sample:

- Same `14` content/PDF-UA/font/structure risk and control PDFs used by the prior content-event diagnostics.

Result:

- Decision: `keep_page_sampling_diagnostic_only`
- `focus_candidates=0`
- `control_candidates=0`
- `sample_errors=0`

Classification distribution:

- `full_document_within_sample`: `9`
- `stratified_same_content_debt`: `3`
- `stratified_reduces_content_debt`: `2`

## Key Evidence

The main unresolved page-sample row did not benefit from same-budget stratification:

| Row | First Pages | Stratified Pages | First Debt | Stratified Debt | Class |
| --- | ---: | ---: | ---: | ---: | --- |
| `4057` | `12/80` | `12/80` | `94` | `46` | `stratified_reduces_content_debt` |

Another long focus row also did not improve:

| Row | First Pages | Stratified Pages | First Debt | Stratified Debt | Class |
| --- | ---: | ---: | ---: | ---: | --- |
| `4156` | `12/24` | `12/24` | `406` | `405` | `stratified_reduces_content_debt` |

Controls stayed clean for this specific sampling lane:

| Row | First Pages | Stratified Pages | First Debt | Stratified Debt | Class |
| --- | ---: | ---: | ---: | ---: | --- |
| `ADAM2` | `4/4` | `4/4` | `400` | `400` | `full_document_within_sample` |
| `pdfaf_fixture_accessible` | `1/1` | `1/1` | `0` | `0` | `full_document_within_sample` |

## Interpretation

Same-budget stratified sampling would make the known `4057` content-event signal weaker, not stronger. That is the wrong direction for PAC-aligned strictness.

Do not promote stratified page sampling from this evidence. Keep the first-page bounded sample for now, because it preserves stronger visible debt on the sampled long-document rows without increasing runtime.

## Next Lane

Park content page sampling unless a future diagnostic finds a stronger native predicate. Move to another PAC/POC parity family, likely:

- annotations/forms;
- figure/caption/BBox;
- list structure;
- PDF/UA catalog/syntax;
- artifacts/page furniture.
