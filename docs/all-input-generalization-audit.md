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
| Proposal-buffer sequence | `src/services/remediation/orchestrator.ts` | `0057`, `0119`, `0121`, `0184`, `0194`, `0200`, `0201`, `0297`, `0306`, `0318`, `0347` | Sequence attempt is limited by known row IDs rather than the proposal/PAC state alone. A 2026-05-13 broad generalization attempt was rejected because it dropped `0057` and did not recover `0297`. |
| Heading annotation seed | `src/services/remediation/orchestrator.ts` | `0108`, `0182`, `0190`, `0345`, `0346` | Seed acceptance is row-scoped even though the safety checks are structural/PAC based. A 2026-05-13 stricter filename-independent attempt was rejected because it dropped `0190`, `0345`, and `0346` to `59/F`. |

## Generalized This Pass

| Area | File | Replacement predicate | Evidence |
| --- | --- | --- | --- |
| Tagged-heading admission | `src/services/remediation/planner.ts` | Native tagged PDF, structure tree present, heading score `0`, reading-order score `<=30`, text extractability `>=90`, annotation tab debt present, and a high-confidence first-page `tagged_visible_line_mcid_first_page` marked-content candidate. | Unit coverage in `tests/remediation/planner.test.ts`; deterministic target/control run `Output/goal-all-input-mean-2026-05-09-r1/run-heading-top-generalized-tagged-anchor-2026-05-13-r2` preserved `0317 93/A`, `0033 94/A`, `0297 59/F`, and `false_positive_applied=0`. |
| Native layout synthesis bounds | `src/services/remediation/planner.ts` | Long native untagged PDFs with no structure tree/headings, `textCharCount > 10000`, and `pageCount > 100` get bounded synthesis (`maxPages: 12`); short native untagged PDFs with no structure tree/headings and marked-content text outside MC/artifact get marked-content-preserving synthesis. | Unit coverage in `tests/remediation/planner.test.ts`; deterministic validation `Output/goal-all-input-mean-2026-05-09-r1/run-native-synth-generalized-2026-05-13-r1` reached `0034 93/A` and `0283 95/A`. |
| Table structure/header sequence | `src/services/remediation/orchestrator.ts` | Any row can attempt the sequence only after an applied `normalize_table_structure` improves table score, the only stage rejection is `pdfua.table.header_association_present`, page/text/tag evidence is preserved, and final sequence acceptance still requires `>=93`, lower header debt, lower regularity debt, and no final PAC regressions. | Unit coverage in `tests/remediation/orchestrator.test.ts`; deterministic validation `Output/goal-all-input-mean-2026-05-09-r1/run-table-sequence-generalized-2026-05-13-r1` preserved `4765 93/A`, `4057 90/A`, `4722 69/D`, and `false_positive_applied=0`. |
| Degenerate native sequence | `src/services/remediation/orchestrator.ts` | Any row can attempt the sequence after an applied `create_structure_from_degenerate_native_anchor`; the seed PAC allowance requires orphan-MCID-only regression, score/heading/reading improvement, and page/text/tag preservation. Final sequence acceptance still requires `>=93`, preserved/improved heading and reading, alt `>=90`, page/text/tag preservation, and no final PAC regressions. | Unit coverage in `tests/remediation/orchestrator.test.ts`; deterministic validation `Output/goal-all-input-mean-2026-05-09-r1/run-degenerate-native-generalized-2026-05-13-r1` preserved `0275 94/A`, `0033 94/A`, `4593 94/A`, `4646 97/A`, and `false_positive_applied=0`. |
| No-benefit route guards | `src/services/remediation/orchestrator.ts` | `0346`, `0184`, and `0316` rejection guards now key on replay-state signature, exact score shape, matching tool, and lack of heading/reading/link movement rather than filename. | Unit coverage in `tests/remediation/orchestrator.test.ts`; these guards reject no-benefit routes only and do not add accepted score movement. |
| Runtime/metadata tail guards | `src/services/remediation/orchestrator.ts` | The former `long-4516` orphan-drain post-pass skip now keys on any A/B state reached through a score-moving post-pass PDF/UA top-up; metadata confirmations now key on metadata-only structural/analyzer shapes: title/language improves while first reanalysis either reports an unrelated severe alt/table drop or remains below useful score with headings still absent. | Unit coverage in `tests/remediation/orchestrator.test.ts`; these guards bound runtime or confirm analyzer volatility and do not lower checkpoint floors, weaken PAC checks, or add score-moving repair behavior. |
| Timeout checkpoint floors | `src/services/remediation/orchestrator.ts` | Normal verified checkpoint returns use the default `85` floor, except a filename-independent severe initial structural failure shape uses a stricter `90` floor. Sub-85 timeout returns must pass the general low-score checkpoint predicate: near-wall pressure, material gain, applied tools, preserved page/text/tag evidence, no mutation-truth contradiction, and no PAC regression. | Unit coverage in `tests/remediation/orchestrator.test.ts`; validation artifacts `Output/goal-all-input-mean-2026-05-09-r1/run-general-timeout-checkpoint-2026-05-13-r1` and `Output/goal-all-input-mean-2026-05-09-r1/run-general-timeout-checkpoint-state-floor-2026-05-13-r1` returned safe low-score checkpoints for timeout-heavy rows with `false_positive_applied=0` while leaving `structure-4438` unresolved. The state-floor run did not reproduce `long-4516`'s stronger B-grade route, so this is generalization evidence, not mean progress. |
| Figure-alt reading-drift allowance | `src/services/remediation/orchestrator.ts` | Any figure-alt recovery stage may tolerate `reading_order` drift only when reading remains excellent (`100 -> >=96`), final score is at least `90`, alt improves from weak evidence to at least `80`, table markup recovers from below `80` to at least `80`, PDF/UA does not regress, page/text/tag/structure evidence is preserved, no stricter cap appears, and no new PAC failure appears. | Unit coverage in `tests/remediation/orchestrator.test.ts`; deterministic validation `Output/goal-all-input-mean-2026-05-09-r1/run-0097-reading-generalized-2026-05-13-r1` preserved target `4694 95/A`, controls `4057 59/F`, `4722 69/D`, `figure-4702 93/A`, and `false_positive_applied=0`. |
| Title/reading sequence | `src/services/remediation/orchestrator.ts` | Any rejected `bridge_native_title_text_owner` intermediate can attempt the bounded reading cleanup sequence only when the intermediate improves score and heading while exposing only orphan-MCID PAC debt; acceptance still requires final score `>=88`, heading preserved, reading improved to at least `79`, page/text/tag preservation, and zero final PAC regressions. | Unit coverage in `tests/remediation/orchestrator.test.ts`; deterministic validation `Output/goal-all-input-mean-2026-05-09-r1/run-title-reading-generalized-2026-05-13-r1` preserved target `4760 94/A`, controls `4655 94/A`, `0297 94/A`, `4574 93/A`, `4722 69/D`, and `false_positive_applied=0`. |
| Heading/annotation sequence | `src/services/remediation/orchestrator.ts` | Any applied `create_heading_from_candidate` can attempt the bounded annotation cleanup sequence; orphan/parent cleanup is selected from intermediate PAC regressions, and final recovery still requires score `>=90`, heading improvement preserved, page/text/tag preservation, lower final annotation debt, and no harmful final PAC regressions. | Unit coverage in `tests/remediation/orchestrator.test.ts`; deterministic validation `Output/goal-all-input-mean-2026-05-09-r1/run-heading-sequence-generalized-2026-05-13-r1` preserved `0032 93/A`, `0033 94/A`, `4593 94/A`, `4646 97/A`, unseen positive `4583 95/A`, `4614 94/A`, and `false_positive_applied=0`. |

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
