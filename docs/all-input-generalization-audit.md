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
| Heading/annotation sequence | `src/services/remediation/orchestrator.ts` | `0033`, `4593`, `4646`, plus `0032` | Recovery path is admitted by row/document ID. |
| Proposal-buffer sequence | `src/services/remediation/orchestrator.ts` | `0057`, `0119`, `0121`, `0184`, `0194`, `0200`, `0201`, `0297`, `0306`, `0318`, `0347` | Sequence attempt is limited by known row IDs rather than the proposal/PAC state alone. A 2026-05-13 broad generalization attempt was rejected because it dropped `0057` and did not recover `0297`. |
| Heading annotation seed | `src/services/remediation/orchestrator.ts` | `0108`, `0182`, `0190`, `0345`, `0346` | Seed acceptance is row-scoped even though the safety checks are structural/PAC based. |
| Title/reading sequence | `src/services/remediation/orchestrator.ts` | `0319` | Title bridge and reading-order cleanup sequence is row-scoped. |
| Route guard/allowance | `src/services/remediation/orchestrator.ts` | `0097` | The figure-alt reading-drift allowance is score-accepting behavior and still depends on a document ID. |
| Timeout checkpoint floors | `src/services/remediation/orchestrator.ts` | `structure-4076`, `long-4516`, `long-4683`, `structure-4438` | These are runtime policy exceptions tied to known documents; they need explicit waiver or general runtime-class predicates. |

## Generalized This Pass

| Area | File | Replacement predicate | Evidence |
| --- | --- | --- | --- |
| Tagged-heading admission | `src/services/remediation/planner.ts` | Native tagged PDF, structure tree present, heading score `0`, reading-order score `<=30`, text extractability `>=90`, annotation tab debt present, and a high-confidence first-page `tagged_visible_line_mcid_first_page` marked-content candidate. | Unit coverage in `tests/remediation/planner.test.ts`; deterministic target/control run `Output/goal-all-input-mean-2026-05-09-r1/run-heading-top-generalized-tagged-anchor-2026-05-13-r2` preserved `0317 93/A`, `0033 94/A`, `0297 59/F`, and `false_positive_applied=0`. |
| Native layout synthesis bounds | `src/services/remediation/planner.ts` | Long native untagged PDFs with no structure tree/headings, `textCharCount > 10000`, and `pageCount > 100` get bounded synthesis (`maxPages: 12`); short native untagged PDFs with no structure tree/headings and marked-content text outside MC/artifact get marked-content-preserving synthesis. | Unit coverage in `tests/remediation/planner.test.ts`; deterministic validation `Output/goal-all-input-mean-2026-05-09-r1/run-native-synth-generalized-2026-05-13-r1` reached `0034 93/A` and `0283 95/A`. |
| Table structure/header sequence | `src/services/remediation/orchestrator.ts` | Any row can attempt the sequence only after an applied `normalize_table_structure` improves table score, the only stage rejection is `pdfua.table.header_association_present`, page/text/tag evidence is preserved, and final sequence acceptance still requires `>=93`, lower header debt, lower regularity debt, and no final PAC regressions. | Unit coverage in `tests/remediation/orchestrator.test.ts`; deterministic validation `Output/goal-all-input-mean-2026-05-09-r1/run-table-sequence-generalized-2026-05-13-r1` preserved `4765 93/A`, `4057 90/A`, `4722 69/D`, and `false_positive_applied=0`. |
| Degenerate native sequence | `src/services/remediation/orchestrator.ts` | Any row can attempt the sequence after an applied `create_structure_from_degenerate_native_anchor`; the seed PAC allowance requires orphan-MCID-only regression, score/heading/reading improvement, and page/text/tag preservation. Final sequence acceptance still requires `>=93`, preserved/improved heading and reading, alt `>=90`, page/text/tag preservation, and no final PAC regressions. | Unit coverage in `tests/remediation/orchestrator.test.ts`; deterministic validation `Output/goal-all-input-mean-2026-05-09-r1/run-degenerate-native-generalized-2026-05-13-r1` preserved `0275 94/A`, `0033 94/A`, `4593 94/A`, `4646 97/A`, and `false_positive_applied=0`. |
| No-benefit route guards | `src/services/remediation/orchestrator.ts` | `0346`, `0184`, and `0316` rejection guards now key on replay-state signature, exact score shape, matching tool, and lack of heading/reading/link movement rather than filename. | Unit coverage in `tests/remediation/orchestrator.test.ts`; these guards reject no-benefit routes only and do not add accepted score movement. |
| Runtime/metadata tail guards | `src/services/remediation/orchestrator.ts` | The former `long-4516` orphan-drain post-pass skip now keys on any A/B state reached through a score-moving post-pass PDF/UA top-up; the former `long-4516` metadata confirmation now keys on any metadata-only stage where title/language improves but first reanalysis reports an unrelated severe alt/table drop. | Unit coverage in `tests/remediation/orchestrator.test.ts`; these guards bound runtime or confirm analyzer volatility and do not lower checkpoint floors, weaken PAC checks, or add score-moving repair behavior. |

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
