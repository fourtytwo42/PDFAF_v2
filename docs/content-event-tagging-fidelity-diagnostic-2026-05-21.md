# Content-Event Tagging Fidelity Diagnostic - 2026-05-21

## Decision

Decision: `harden_content_audit_coverage_first`.

No new score cap, PAC gate, planner route, mutator behavior, Docker/API behavior, benchmark behavior, or production dependency is accepted from this stage.

This stage adds a native diagnostic classifier for PAC/POC-style content-stream tagging evidence. It separates:

- verified direct content-event debt that is already score-active or already held below the strict PAC cap;
- verified direct content-event debt that would need a future score-cap validation;
- heuristic or partial-coverage content-event debt that must remain diagnostic;
- orphan-MCID-only debt, which is a related but separate content/ParentTree lane;
- no-structure/manual-review states where direct content-event promotion would be unsafe.

## Source Change

- `scripts/content-event-tagging-fidelity-diagnostic.ts`

The script runs native PDFAF analysis only. It does not call `Research/POC-decompiled`, PAC, ODL, Java, network tools, semantic AI, remediation, or PDF mutation paths.

## Local Diagnostic

Local artifact:

- `/mnt/pdf-review/pdfaf-content-tagging-diagnostics/content-event-tagging-fidelity-2026-05-21-r1`

Sample:

- `14` PDFs from historical content/PDF-UA/font/structure risk rows and nearby controls.
- Includes original-50 risk rows, prior PAC-promotion cap-regression rows, `ADAM2`, and `pdfaf_fixture_accessible`.

Result:

- Decision: `harden_content_audit_coverage_first`
- `verified_score_active=5`
- `missing_score_cap=0`
- `missing_score_cap_focus=0`
- `missing_score_cap_controls=0`
- `heuristic_debt=3`
- `heuristic_debt_focus=3`
- `heuristic_debt_controls=0`
- `verified_score_active_controls=1`
- `analysis_errors=0`

Classification distribution:

- `verified_content_debt_score_active`: `5`
- `heuristic_content_debt_keep_diagnostic`: `3`
- `manual_review_or_no_audit`: `6`

Suggested action distribution:

- `already_score_active`: `5`
- `harden_native_audit_coverage`: `3`
- `keep_diagnostic`: `6`

## Key Evidence

The sample did not find a clean verified direct content-event failure that lacks a score-active path. Verified content-event debt was either already capped by strict PAC scoring or the affected category was already at or below the strict cap.

Examples:

| Row | Score | Confidence | Direct Debt | Orphans | Class | Action |
| --- | ---: | --- | ---: | ---: | --- | --- |
| `4074` | `25/F` | `verified` | `42` | `55` | `verified_content_debt_score_active` | `already_score_active` |
| `4172` | `59/F` | `verified` | `4` | `18` | `verified_content_debt_score_active` | `already_score_active` |
| `4078` | `24/F` | `verified` | `47` | `53` | `verified_content_debt_score_active` | `already_score_active` |
| `4188` | `24/F` | `verified` | `47` | `39` | `verified_content_debt_score_active` | `already_score_active` |

The diagnostic also found rows where content-event evidence exists but stream coverage is still heuristic or incomplete:

| Row | Score | Confidence | Direct Debt | Orphans | Class |
| --- | ---: | --- | ---: | ---: | --- |
| `4057` | `30/F` | `heuristic` | `94` | `64` | `heuristic_content_debt_keep_diagnostic` |
| `4699` | `74/C` | `heuristic` | `4` | `64` | `heuristic_content_debt_keep_diagnostic` |
| `4122` | `29/F` | `heuristic` | `29` | `61` | `heuristic_content_debt_keep_diagnostic` |

Important control:

- `pdfaf_fixture_accessible`: `96/A`, verified direct path-paint debt `13`, orphan-MCID debt `9`, and existing strict PAC score caps for `pdfua.content.orphan_mcids_absent` and `pdfua.content.path_paint_tagged_or_artifacted`.

That control is useful safety evidence: direct content-event scoring is already strict enough to expose the debt, but a broader content-event behavior route would not be safely separated from controls.

## Current Accepted State

Keep the current score-active strict PAC rules:

- `pdfua.content.orphan_mcids_absent`
- `pdfua.content.path_paint_tagged_or_artifacted`
- `pdfua.content.text_tagged_or_artifacted`
- `pdfua.content.image_tagged_or_artifacted`
- `pdfua.content.artifact_tag_boundary_valid`
- `pdfua.content.no_artifact_in_tagged_content`
- `pdfua.content.no_tagged_content_in_artifact`
- `pdfua.content.marked_content_stack_valid`

Do not promote new content-event scoring or remediation from heuristic stream coverage, missing structure, or control-triggering path-paint evidence.

## Next Lane

The next safe PAC/POC parity work should harden native content-stream coverage before scoring/remediation promotion. The likely useful sub-lane is a diagnostic-only audit of why rows fall into `heuristic_content_debt_keep_diagnostic`, especially partial page-stream coverage and Form XObject coverage.

If that sub-lane does not produce a clean native predicate, move to another PAC/POC gap family rather than broadening content-event behavior.
