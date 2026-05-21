# Rendered Contrast Opt-In Diagnostic

Date: 2026-05-21

This stage adds an opt-in rendered-contrast diagnostic for PAC/POC parity research. It does not change default analyzer, scorer, remediation, PAC gate, Docker/API, or benchmark behavior.

## Artifacts

- Source script: `scripts/rendered-contrast-opt-in-diagnostic.ts`
- Tests: `tests/scripts/renderedContrastOptInDiagnostic.test.ts`
- Local report: `/mnt/pdf-review/pdfaf-contrast-diagnostics/rendered-contrast-opt-in-2026-05-21-r1/rendered-contrast-opt-in.md`
- Local JSON: `/mnt/pdf-review/pdfaf-contrast-diagnostics/rendered-contrast-opt-in-2026-05-21-r1/rendered-contrast-opt-in.json`

The script is explicitly invoked only. It renders bounded sampled pages with pdf.js/`@napi-rs/canvas`, estimates foreground/background contrast from native text bounding boxes, and writes local JSON/Markdown. It does not call PAC, POC, ODL, Java, remediation, or PDF mutation paths.

## Sample

The smoke sample used `5` PDFs with `--max-pages 2 --max-text-runs 120`:

- `3981` Polish rights PDF;
- `4466` victim needs report;
- Virginia `va-20`;
- Teams original control;
- `pdfaf_fixture_accessible` control.

## Result

Decision: `keep_rendered_contrast_opt_in_diagnostic_only`.

Classification distribution:

| classification | count |
| --- | ---: |
| `low_contrast_candidate` | 5 |
| `uncertain_contrast_evidence` | 0 |
| `no_low_contrast_detected` | 0 |
| `contrast_not_measured` | 0 |
| `analysis_error` | 0 |

The opt-in renderer completed quickly on this small sample:

| row | role | sampled runs | low runs | min ratio | measurement ms |
| --- | --- | ---: | ---: | ---: | ---: |
| Teams original | control | 104 | 66 | 1.28 | 202 |
| `pdfaf_fixture_accessible` | control | 50 | 16 | 3.88 | 94 |
| `3981` | focus | 120 | 4 | 1.80 | 503 |
| `4466` | focus | 17 | 7 | 2.05 | 334 |
| `va-20` | focus | 21 | 7 | 2.74 | 131 |

## Decision Rationale

The plumbing is useful, but the evidence is not safe for scoring:

- both focus rows and controls triggered low-contrast candidates;
- the accessible fixture also triggered, so the current text-bbox pixel heuristic is not selective enough for score-active use;
- `3981` had many uncertain text runs due extraction/font issues, reinforcing that contrast measurement must be separated from text-extraction debt;
- no default category score, PAC cap, remediation route, or Docker/API behavior changed.

Rendered contrast remains opt-in/manual-review. Do not promote `wcag.contrast.text_contrast_measured` or `color_contrast` scoring from this sample.

## Next Step

If contrast work resumes, improve the opt-in measurement before any scoring validation:

- require stronger foreground/background separation;
- filter page furniture and decorative text separately from body text;
- preserve direct visual samples for manual review;
- validate against clean controls and known low-contrast positives.

Until that is proven, move to another PAC/POC lane or use this script only for local research diagnostics.
