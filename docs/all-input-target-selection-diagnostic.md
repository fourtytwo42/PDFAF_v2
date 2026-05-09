# All-Input Target Selection Diagnostic

This diagnostic selects the next remediation direction for the all-input mean `>=93` goal. It combines:

- broad deterministic all-input scores from `Output/goal-all-input-mean-2026-05-09-r1/all-input-mean-diagnostic.json`;
- POC/PAC strong-area evidence from `Output/goal-all-input-mean-2026-05-09-r1/poc-strong-lowest-40/poc-strong-rule-matrix.json`.

Source helper: `scripts/all-input-target-selection-diagnostic.ts`.

## Result

The selected next direction is `heading_reading_recovery_target`.

| Classification | Count | Deficit to 93 | Decision |
| --- | ---: | ---: | --- |
| `heading_reading_recovery_target` | 18 | 650 | First target-selection lane. Largest recoverable score deficit; several rows also have PAC/POC content, structure, ParentTree, or table evidence that can guide object-level diagnostics. |
| `table_header_recovery_target` | 9 | 266 | Second lane. Strong PAC/POC table-header evidence, but should follow or run as a separate focused table/header object diagnostic. |
| `alt_recovery_target` | 8 | 280 | Candidate lane after checking stable figure object identity and PAC alt leaves. |
| `needs_more_pac_object_evidence` | 3 | 86 | Needs remediated trace/object evidence before behavior. |
| `parked_runtime_debt` | 2 | 81 | Not a first fixer lane; includes `structure-4438` and another extreme slow row. |

## Primary Heading/Reading Targets

The highest-priority target subset for the next diagnostic is:

- `0034-0fca5a3c849e-v1-4716.pdf`
- `0275-0af92eca8742-4002-driving-under-the-influence-dui-laws-andenforcement-in-illinois-and-the-.pdf`
- `0033-919b3d6f80f2-v1-4655.pdf`
- `0086-216764ae85f4-4567-safe-passage-report.pdf`
- `0096-27b779ba44ec-4646-youth-development-an-overview-of-related-factors-and-interventions.pdf`
- `0108-d08027579d0b-4614-an-evaluation-of-transitional-housing-programs-in-illinois-for-victims-o.pdf`
- `0181-7f17a4724723-4519-national-survey-of-residential-programs-for-victims-of-sex-trafficking.pdf`
- `0182-72c4a1d0c53f-4583-an-overview-of-medication-assisted-treatment-for-opioid-use-disorders-fo.pdf`
- `0183-06af35d281c0-4593-focused-deterrence-a-policing-strategy-to-combat-gun-violence.pdf`
- `0190-621b9b1cc3b8-3468-chicago-homicide-codebook-coding-instructions-coders-guide-to-the-chicag.pdf`

These should be handled by a diagnostic-first run that writes remediated PDFs and traces for the focused subset only. Do not run all `Input/` again before a narrower behavior hypothesis exists.

## PAC/POC Implications

The lowest-40 POC/PAC strong-area matrix shows that many heading/reading rows also have:

- direct content tagging failures (`pdfua.content.text_tagged_or_artifacted`, `pdfua.content.image_tagged_or_artifacted`);
- structure syntax failures (`pdfua.structure.child_roles_valid`);
- ParentTree/link object failures on some rows;
- table header failures on mixed rows.

The next diagnostic should therefore inspect both score movement and checker-visible object evidence: accepted/rejected heading tools, content marking state, ParentTree ownership, and whether PAC-style content/tag leaves are blocking useful structure recovery.

## Boundaries

- No PAC scoring changes.
- No PAC gate weakening.
- No font/CMap score caps restored.
- No broad planner expansion.
- No timeout increase.
- No all-input benchmark until a targeted behavior change passes focused validation.
- Generated PDFs and diagnostic matrices remain under `Output/` and are not committed.
