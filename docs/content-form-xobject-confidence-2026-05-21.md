# Content Form XObject Confidence - 2026-05-21

## Decision

Decision: `accept_native_evidence_confidence_change`.

This stage promotes only native PAC evidence confidence for content-event checks when Form XObject coverage is fully measured. It does not call `Research/POC-decompiled`, PAC, ODL, Java, network tools, semantic AI, or any non-native runtime dependency.

No remediation behavior, planner routing, mutation behavior, PAC suppression, score-cap relaxation, or scorer masking changed.

## Source Change

`pdfua.content.*` direct content-event rules now use `verified` confidence when all of the following are true:

- page streams are fully checked;
- Form XObject coverage is fully measured;
- `formXObjectsChecked >= totalFormXObjects`;
- `formXObjectParseErrorCount = 0`;
- `formXObjectSampleLimitHitCount = 0`.

Rows with partial Form XObject coverage, parse errors, sample-limit hits, or legacy snapshots where total Form XObject count is unknown remain `heuristic`.

Changed files:

- `src/services/compliance/pacRuleEvidence.ts`
- `scripts/content-event-tagging-fidelity-diagnostic.ts`
- tests in `tests/services/pacRuleEvidence.test.ts`, `tests/scorer.test.ts`, and diagnostic script tests

## Targeted Evidence

Local diagnostic:

- `/mnt/pdf-review/pdfaf-content-tagging-diagnostics/content-event-form-xobject-verified-2026-05-21-r1`

Result:

- `verified_score_active=7`
- `missing_score_cap=0`
- `heuristic_debt=1`
- `analysis_errors=0`

The two previously heuristic measured-Form rows now classify as verified content debt:

| Row | Score | Direct Debt | Confidence | Class | Score Impact |
| --- | ---: | ---: | --- | --- | --- |
| `4699` | `74/C` | `4` | `verified` | `verified_content_debt_score_active` | no score movement; affected category already below strict cap |
| `4122` | `29/F` | `29` | `verified` | `verified_content_debt_score_active` | no score movement; affected category already below strict cap |

Important control:

- `pdfaf_fixture_accessible`: remained `96/A`; existing verified content/path debt and strict caps remain visible.

The remaining heuristic row in this sample is `4057`, due to the bounded page sample (`12/80`), not Form XObject coverage.

## Original-50 Validation

Deterministic original-50 validation:

- `/mnt/pdf-review/pdfaf-validation/original50-form-xobject-content-confidence-2026-05-21-r1/baseline_report.json`

Command shape:

- `scripts/baseline-corpus-batch.ts /tmp/pdfaf-original50-form-xobject-flat ... --no-semantic --no-pdfs`

Result:

- `50` rows selected
- `49/50` completed
- completed-row mean `94.0204`
- all-row mean `92.14`
- grades `45 A / 2 B / 1 D / 1 F / 1 timeout`
- `false_positive_applied=0`
- only hard timeout: `4438-Inventorying Employment Restrictions Task Force Final Report.pdf`

Below-93 completed rows:

- `4076`: `89/B`
- `4470`: `59/F`
- `4516`: `85/B`
- `4683`: `61/D`

These are known residual/runtime/analyzer-debt families, not Form XObject confidence regressions.

## Tests

Passed:

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/services/pacRuleEvidence.test.ts tests/scorer.test.ts tests/scripts/contentEventTaggingFidelityDiagnostic.test.ts tests/scripts/contentStreamCoverageDiagnostic.test.ts`
- `npx -y node@22 /usr/bin/pnpm run lint`

The Python helper had already been syntax-checked for the passive metric stage with:

- `python3 -m py_compile python/pdf_analysis_helper.py`

## Current State

This is a grading/evidence improvement, not a remediation improvement. It makes PDFAF more PAC-aligned by treating complete native Form XObject content-stream coverage as verified evidence.

Next safe PAC/POC lane:

- keep `4057` page-sample content coverage as diagnostic until a runtime-bounded page-sampling strategy is proven; or
- move to another high-impact parity family such as annotations/forms, figure/caption/BBox, lists, or PDF/UA catalog syntax.
