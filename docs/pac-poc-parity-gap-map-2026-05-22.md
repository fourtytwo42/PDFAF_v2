# PAC/POC Parity Gap Map Refresh

Date: 2026-05-22

## Decision

Decision: `evidence_map_only`.

This refresh updates the source-tracked PAC/POC planning map after the table target-resolution diagnostic, the narrow Table/ParentTree behavior proof, and direct language-syntax scoring hardening. It changes planning/reporting metadata only. It does not call Research/POC-decompiled, PAC, ODL, Java, network tools, semantic AI, analysis, remediation, scoring, planner routing, or PDF mutation paths.

Local generated artifact:

- `Output/pac-poc-parity-gap-map-2026-05-22-r1/pac-poc-parity-gap-map.md`
- `Output/pac-poc-parity-gap-map-2026-05-22-r1/pac-poc-parity-gap-map.json`

Generated artifacts remain local and are not source-tracked.

## What Changed

`table_header_transaction` is no longer a broad behavior-ready lane, but a narrow object-backed table subtype has been accepted.

- Prior map status: `behavior_ready_next`
- Current map status: `mostly_aligned_monitor`
- Accepted subtype: report-scale object-backed Stage180 table cleanup for stable `/Table` targets with heavy table header-association debt and bounded heading debt.
- Validation: `va-15` improved to `96/A`, controls stayed stable, original-50 all-row mean was `93.3000`, `false_positive_applied=0`, and p95 did not regress.
- Remaining parked scope: dense row-band/layout-only table routing for `va-08`, `va-09`, and `va-10`, where prior planned targets resolved as non-table roles before mutation.
- Reopen condition: prove a new stable `/Table` target subtype immediately before mutation with accepted positive repairs and controls stable.

`language_parts_validation` now reflects direct language-syntax scoring hardening.

- Current map status: `mostly_aligned_monitor`
- Direct score-active rules now include `pdfua.language.document_lang_syntax_valid` and `pdfua.language.structure_lang_valid`.
- Heuristic language-of-parts rules remain diagnostic-only because inherited/object-context evidence is not complete enough for safe caps.

## Current Map Result

- Families covered: `13`
- Lanes: `13`
- Behavior-ready lanes: `0`
- Decision: `evidence_map_only`

The map still identifies high-impact unresolved PAC/POC families, but none is ready for immediate new production behavior under the active goal's evidence standard.

## Next Direction

The next useful work should be one of:

- a fresh validation checkpoint across original-50, all-unique, and an outside holdout; or
- a deliberately designed PAC-stress sample around a specific unresolved family such as a new object-backed ParentTree/table subtype, true rendered contrast positives, or direct language-of-parts syntax evidence.

Do not re-open table behavior from dense row-band evidence alone, and do not add heuristic language-of-parts caps.
