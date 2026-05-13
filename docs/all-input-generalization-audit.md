# All-Input Generalization Audit

Date: 2026-05-13

This audit records production row/file gates that must be generalized or
explicitly removed before the active all-input mean goal can be claimed under
the current acceptance rule: accepted behavior must not depend on filenames,
row IDs, shard membership, corpus paths, benchmark membership, or PDF-specific
hashes.

## Current Blockers

The current source still contains production behavior gated by all-input row or
document IDs. These gates may remain useful as diagnostic history, but a fresh
all-unique-PDF score produced with them is not sufficient by itself to close the
goal under the updated generalization constraint.

| Area | File | Current gate shape | Why it blocks acceptance |
| --- | --- | --- | --- |
| Tagged-heading admission | `src/services/remediation/planner.ts` | `ALL_INPUT_TAGGED_HEADING_ADMISSION_IDS = {'0317'}` | Planner behavior is admitted by row ID rather than by the structural candidate shape alone. |
| Long-document native synthesis bounds | `src/services/remediation/planner.ts` | filename checks for `0034` / `v1-4716` and `0283` | Production route bounds depend on known row/document IDs. |
| Heading/annotation sequence | `src/services/remediation/orchestrator.ts` | `0033`, `4593`, `4646`, plus `0032` | Recovery path is admitted by row/document ID. |
| Degenerate native sequence | `src/services/remediation/orchestrator.ts` | `0275` | Recovery path is admitted by row ID. |
| Proposal-buffer sequence | `src/services/remediation/orchestrator.ts` | `0057`, `0119`, `0121`, `0184`, `0194`, `0200`, `0201`, `0297`, `0306`, `0318`, `0347` | Sequence attempt is limited by known row IDs rather than the proposal/PAC state alone. |
| Table structure/header sequence | `src/services/remediation/orchestrator.ts` | `4765` | Table sequence recovery is admitted by document ID. |
| Heading annotation seed | `src/services/remediation/orchestrator.ts` | `0108`, `0182`, `0190`, `0345`, `0346` | Seed acceptance is row-scoped even though the safety checks are structural/PAC based. |
| Title/reading sequence | `src/services/remediation/orchestrator.ts` | `0319` | Title bridge and reading-order cleanup sequence is row-scoped. |
| Route guards | `src/services/remediation/orchestrator.ts` | `0346`, `0184`, `0316`, `0097` | Some guards are regression-prevention, but they still depend on document IDs plus replay signatures. |
| Timeout checkpoint floors | `src/services/remediation/orchestrator.ts` | `structure-4076`, `long-4516`, `long-4683`, `structure-4438` | These are runtime policy exceptions tied to known documents; they need explicit waiver or general runtime-class predicates. |

## Required Follow-Up

Before claiming the fresh full-run goal:

- Convert accepted row-scoped recovery paths into predicates based on
  document-structure evidence, PAC-like failure signatures, analyzer
  invariants, and repeatable repair states.
- Validate each generalized predicate on target rows and nearby controls.
- If a row-scoped guard is purely diagnostic or regression-prevention, document
  why it does not contribute accepted score movement; otherwise it must be
  generalized or excluded from completion evidence.
- Do not use a fresh full-run mean produced with unresolved score-moving
  row gates as the final acceptance claim.

## Current Direction

The 2026-05-13 r19 follow-up diagnostics found no quick accepted behavior path
in the obvious alt, table/header, or PAC/object lanes. The best planning overlay
remains `92.7037` with `104` points still needed, and it includes volatile
timeout recoveries. The next implementation work should prioritize one
generalizable high-impact predicate over more row-scoped recovery.
