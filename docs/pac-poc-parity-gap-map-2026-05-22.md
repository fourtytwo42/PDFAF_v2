# PAC/POC Parity Gap Map Refresh

Date: 2026-05-22

## Decision

Decision: `evidence_map_only`.

This refresh updates the source-tracked PAC/POC planning map after the table behavior proof, table target-resolution diagnostic, and direct language-syntax scoring hardening. It changes planning/reporting metadata only. It does not change scoring, remediation routing, mutation behavior, PAC gates, Docker/API behavior, benchmark execution, or any non-native runtime dependency.

Local generated artifact:

- `Output/pac-poc-parity-gap-map-2026-05-22-r1/pac-poc-parity-gap-map.md`
- `Output/pac-poc-parity-gap-map-2026-05-22-r1/pac-poc-parity-gap-map.json`

Generated artifacts remain local and are not source-tracked.

## What Changed

`table_header_transaction` is no longer behavior-ready.

- Prior map status: `behavior_ready_next`
- Current map status: `parked_no_safe_predicate`
- Reason: the dense-table behavior proof produced only one accepted positive repair (`va-11`). Other planned positives resolved as non-table roles before mutation.
- Reopen condition: prove stable `/Table` target refs immediately before mutation and at least two accepted positive repairs with controls stable.

`language_parts_validation` now reflects direct language-syntax scoring hardening.

- Current map status: `mostly_aligned_monitor`
- Direct score-active rules now include `pdfua.language.document_lang_syntax_valid` and `pdfua.language.structure_lang_valid`.
- Heuristic language-of-parts rules remain diagnostic-only because inherited/object-context evidence is not complete enough for safe caps.

## Current Map Result

- Families covered: `13`
- Lanes: `13`
- Behavior-ready lanes: `0`
- Decision: `evidence_map_only`

The map still identifies high-impact unresolved PAC/POC families, but none is ready for immediate production behavior under the active goal's evidence standard.

## Next Direction

The next useful work should be one of:

- a fresh validation checkpoint across original-50, all-unique, and an outside holdout; or
- a deliberately designed PAC-stress sample around a specific unresolved family such as object-backed ParentTree/table targets, true rendered contrast positives, or direct language-of-parts syntax evidence.

Do not re-open table behavior from dense row-band evidence alone, and do not add heuristic language-of-parts caps.
