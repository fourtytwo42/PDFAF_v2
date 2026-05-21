# Content Form XObject Coverage Metric - 2026-05-21

## Decision

Decision: `passive_metric_accepted`.

This stage accepts passive native evidence only. It does not change scoring confidence, score caps, PAC gates, planner routing, remediation, Docker/API dependencies, benchmark behavior, or production strictness.

## Source Change

Native `contentTaggingAudit` now records Form XObject coverage details:

- `totalFormXObjects`
- `formXObjectParseErrorCount`
- `formXObjectSampleLimitHitCount`

Existing `formXObjectsChecked` remains intact.

Changed files:

- `python/pdf_analysis_helper.py`
- `src/types.ts`
- `src/python/bridge.ts`
- `scripts/content-event-tagging-fidelity-diagnostic.ts`
- `scripts/content-stream-coverage-diagnostic.ts`

The PAC scoring confidence rule intentionally remains unchanged: rows with Form XObjects are still treated as heuristic until a separate scoring-validation stage proves the promotion is safe.

## Validation

Focused tests:

- `tests/scripts/contentEventTaggingFidelityDiagnostic.test.ts`
- `tests/scripts/contentStreamCoverageDiagnostic.test.ts`

Commands:

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/scripts/contentStreamCoverageDiagnostic.test.ts tests/scripts/contentEventTaggingFidelityDiagnostic.test.ts`
- `npx -y node@22 /usr/bin/pnpm run lint`
- `python3 -m py_compile python/pdf_analysis_helper.py`

All passed.

## Local Diagnostic

Local artifact:

- `/mnt/pdf-review/pdfaf-content-tagging-diagnostics/content-stream-coverage-form-metric-2026-05-21-r1`

Sample:

- Same `14` PDFs used by the prior content-event and content-stream coverage diagnostics.

Result:

- Decision: `plan_form_xobject_scoring_validation`
- `measured_form_focus=2`
- `measured_form_controls=0`
- `partial_forms=0`
- `sample_focus=1`
- `sample_controls=0`
- `parse_failures=0`
- `analysis_errors=0`

Measured Form XObject rows:

| Row | Score | Pages Checked | Forms Checked | Debt | Class |
| --- | ---: | ---: | ---: | ---: | --- |
| `4699` | `74/C` | `8/8` | `1/1` | `4` | `form_xobject_coverage_measured` |
| `4122` | `29/F` | `2/2` | `5/5` | `29` | `form_xobject_coverage_measured` |

Controls:

| Row | Score | Pages Checked | Forms Checked | Debt | Class |
| --- | ---: | ---: | ---: | ---: | --- |
| `ADAM2` | `34/F` | `4/4` | `0/0` | `400` | `missing_structure_manual_review` |
| `pdfaf_fixture_accessible` | `96/A` | `1/1` | `0/0` | `13` | `verified_full_stream_coverage` |

## Next Lane

Plan a separate scoring-validation stage before any behavior change. The candidate rule is narrow:

- page streams fully checked;
- Form XObject coverage fully measured;
- no Form XObject parse errors;
- no Form XObject sample-limit hit;
- direct content-event debt present;
- controls remain stable.

Acceptance would require targeted positives, nearby controls, original-50 deterministic validation, no new hard timeout, and honest reporting of any score decreases from stricter PAC-aligned grading.
