# Content-Stream Coverage Diagnostic - 2026-05-21

## Decision

Decision: `plan_form_xobject_coverage_metric`.

No score cap, PAC gate, planner route, mutator behavior, Docker/API behavior, benchmark behavior, or production dependency is accepted from this stage.

This stage explains why native `contentTaggingAudit` evidence remains heuristic on some PAC/POC-style content-event rows. It separates:

- verified full page-stream coverage;
- first-12-page sample coverage gaps;
- Form XObject coverage unknowns;
- parse failures or unchecked pages;
- missing-structure manual-review rows.

## Source Change

- `scripts/content-stream-coverage-diagnostic.ts`

The script runs native PDFAF analysis only. It does not call `Research/POC-decompiled`, PAC, ODL, Java, network tools, semantic AI, remediation, or PDF mutation paths.

## Local Diagnostic

Local artifact:

- `/mnt/pdf-review/pdfaf-content-tagging-diagnostics/content-stream-coverage-2026-05-21-r1`

Sample:

- The same `14` PDFs used for the content-event tagging fidelity diagnostic.

Result:

- Decision: `plan_form_xobject_coverage_metric`
- `form_focus=2`
- `form_controls=0`
- `sample_focus=1`
- `sample_controls=0`
- `parse_failures=0`
- `verified_full_coverage=5`
- `analysis_errors=0`

Classification distribution:

- `verified_full_stream_coverage`: `5`
- `missing_structure_manual_review`: `6`
- `form_xobject_coverage_unknown`: `2`
- `page_sample_limit_coverage_gap`: `1`

Suggested action distribution:

- `already_verified`: `5`
- `keep_diagnostic`: `6`
- `form_xobject_metric_candidate`: `2`
- `page_coverage_hardening_candidate`: `1`

## Key Evidence

The cleanest evidence-hardening lane is Form XObject coverage metrics:

| Row | Score | Pages Checked | Forms Checked | Debt | Class |
| --- | ---: | ---: | ---: | ---: | --- |
| `4699` | `74/C` | `8/8` | `1` | `4` | `form_xobject_coverage_unknown` |
| `4122` | `29/F` | `2/2` | `5` | `29` | `form_xobject_coverage_unknown` |

Controls did not trigger this lane:

| Row | Score | Pages Checked | Forms Checked | Debt | Class |
| --- | ---: | ---: | ---: | ---: | --- |
| `ADAM2` | `34/F` | `4/4` | `0` | `400` | `missing_structure_manual_review` |
| `pdfaf_fixture_accessible` | `96/A` | `1/1` | `0` | `13` | `verified_full_stream_coverage` |

The current audit records `formXObjectsChecked`, but it does not record total Form XObject count or whether the Form XObject loop hit its per-page bound. Without those fields, PDFAF cannot distinguish fully checked Form XObject content from partial Form XObject coverage.

A secondary lane exists for page sampling:

| Row | Score | Pages Checked | Forms Checked | Debt | Class |
| --- | ---: | ---: | ---: | ---: | --- |
| `4057` | `30/F` | `12/80` | `0` | `94` | `page_sample_limit_coverage_gap` |

This is less attractive as a first source change because raising broad page coverage can affect runtime. Prefer Form XObject coverage metrics first.

## Current Accepted State

Keep content-event scoring and remediation behavior unchanged.

The next source change should be passive evidence only:

- add native total/checked Form XObject coverage fields to `contentTaggingAudit`;
- preserve current scoring confidence until a separate validation proves a safe promotion;
- do not call PAC/POC/ODL/Java;
- do not broaden content-event remediation from this diagnostic alone.

## Next Lane

Implement passive Form XObject coverage metrics, then rerun this diagnostic to decide whether any verified Form XObject content-event debt is clean enough for a later scoring validation.
