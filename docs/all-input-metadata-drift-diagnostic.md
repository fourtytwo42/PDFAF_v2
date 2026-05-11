# All-Input Metadata Drift Diagnostic

This diagnostic investigates a narrow route-volatility shape from the complete r5 all-input run: metadata-only tools such as `set_document_language` and `set_document_title` can be rejected because reanalysis loses unrelated heading evidence.

It changes no scoring, gates, planner routing, timeout policy, semantic behavior, or remediation tools.

## Current Artifact

- Script: `scripts/all-input-metadata-drift-diagnostic.ts`
- Local output: `Output/goal-all-input-mean-2026-05-09-r1/metadata-drift-diagnostic-r5-complete-2026-05-11-r1`
- Input search root: `Output/goal-all-input-mean-2026-05-09-r1`

## Why This Matters

Metadata mutations should not alter the structure tree. If a title/language change causes a reanalysis-only loss of heading evidence, the failure may be analyzer drift rather than a harmful PDF mutation.

The diagnostic separates:

- same-state rows where another run accepted the same metadata mutation from the same replay state;
- metadata-gain plus unrelated-structure-drop rows without alternate proof;
- unsafe or inconclusive metadata rejections.

## Promotion Rule

Do not add behavior from this report alone.

A future acceptance change must first prove, on targeted rows and controls, that:

- the PDF byte diff is metadata-only;
- page count, text count, tagged state, and PAC evidence remain safe;
- final source reanalysis stays stable;
- `false_positive_applied` remains `0`;
- unrelated files/tools cannot use the exception.
