# Table Template Finalization Transaction Diagnostic

Date: 2026-05-28

## Decision

Diagnostic-only source change accepted. This does not route new remediation behavior yet.

The new diagnostic proves that the explicit repeated-table finalization primitives can be evaluated from the realistic deterministic-remediation plateau state. On the corrected WV DCR PREA internal sample, the transaction fully clears the table/header family on five independent focus rows and leaves sampled same-source controls stable.

## Source Change

- `scripts/table-template-finalization-transaction-diagnostic.ts`
  - runs native analysis;
  - optionally runs normal deterministic in-memory remediation first with `--start-from-deterministic`;
  - applies only the explicit table-template finalization transaction to an in-memory/temporary PDF;
  - reanalyzes the temporary result and deletes it;
  - classifies table-family clearance, non-table PAC side effects, control movement, and no-effect rows;
  - writes JSON/Markdown metrics only.
- `tests/benchmark/tableTemplateFinalizationTransactionDiagnostic.test.ts`
  - verifies the transaction sequence;
  - verifies classification for table-family-cleared rows, mixed non-table debt, unsafe orphan-MCID side effects, changed controls, and argument parsing.

No planner route, scorer rule, PAC gate, Docker/API behavior, ODL/PAC/POC runtime call, source gate, filename gate, row gate, hash gate, semantic behavior, or production remediation behavior was added.

## Local WV Proof

Scratch proof pack: `/mnt/pdf-review/pdfaf-table-template-transaction-wv20-2026-05-28-r1`

Source page: `https://dcr.wv.gov/resources/Pages/prea.aspx`

The corrected sample used the first 20 internal WV DCR PDF links under 10 MB, excluding the external GPO link. The diagnostic run used deterministic-start mode:

```bash
pnpm exec tsx scripts/table-template-finalization-transaction-diagnostic.ts \
  --start-from-deterministic \
  --pdf wvdcrprea-02=.../wvdcrprea-02.pdf \
  --pdf wvdcrprea-04=.../wvdcrprea-04.pdf \
  --pdf wvdcrprea-06=.../wvdcrprea-06.pdf \
  --pdf wvdcrprea-07=.../wvdcrprea-07.pdf \
  --pdf wvdcrprea-08=.../wvdcrprea-08.pdf \
  --control wvdcrprea-01=.../wvdcrprea-01.pdf \
  --control wvdcrprea-03=.../wvdcrprea-03.pdf
```

Local output before cleanup:

- `/mnt/pdf-review/pdfaf-table-template-transaction-wv20-2026-05-28-r1/diagnostic-after-deterministic/table-template-finalization-transaction.json`
- `/mnt/pdf-review/pdfaf-table-template-transaction-wv20-2026-05-28-r1/diagnostic-after-deterministic/table-template-finalization-transaction.md`

Summary:

- Rows: `7`
- Focus rows: `5`
- Controls: `2`
- Supported focus rows: `5`
- Changed controls: `0`
- Unsafe/error rows: `0`
- Decision: `plan_routed_behavior_proof`

| Row | Class | Score | Table | Header Missing | Orphan TH | Data Without Headers | Irregular | Strong Irregular |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `wvdcrprea-02` | focus | `69 -> 99` | `5 -> 100` | `148 -> 0` | `326 -> 0` | `608 -> 0` | `141 -> 0` | `31 -> 0` |
| `wvdcrprea-04` | focus | `69 -> 100` | `5 -> 100` | `150 -> 0` | `330 -> 0` | `620 -> 0` | `143 -> 0` | `33 -> 0` |
| `wvdcrprea-06` | focus | `69 -> 99` | `5 -> 100` | `148 -> 0` | `326 -> 0` | `608 -> 0` | `141 -> 0` | `31 -> 0` |
| `wvdcrprea-07` | focus | `69 -> 99` | `5 -> 100` | `158 -> 0` | `346 -> 0` | `647 -> 0` | `151 -> 0` | `34 -> 0` |
| `wvdcrprea-08` | focus | `69 -> 99` | `5 -> 100` | `148 -> 0` | `326 -> 0` | `608 -> 0` | `141 -> 0` | `31 -> 0` |
| `wvdcrprea-01` | control | `93 -> 93` | `100 -> 100` | `0 -> 0` | `0 -> 0` | `0 -> 0` | `0 -> 0` | `0 -> 0` |
| `wvdcrprea-03` | control | `96 -> 96` | `100 -> 100` | `0 -> 0` | `0 -> 0` | `0 -> 0` | `0 -> 0` | `0 -> 0` |

## Interpretation

This is the first current proof that the repeated-template table lane can honestly clear the table/header family and lift multiple outside-source rows above target when run at the right point in the deterministic path.

It is still not accepted production behavior because the active goal requires more than one same-source proof. Before routing:

- validate another independent public-source table-heavy subtype, or document why WV repeated-template is the only supported subtype for this route;
- validate same-source and original-50 controls after routing;
- preserve `false_positive_applied=0`;
- verify no non-table PAC side effects and bounded runtime;
- keep the route structural, not filename/source/corpus based.

The likely next behavior stage is a narrow planner admission that runs the explicit table-template finalization transaction only when native evidence shows the repeated real-`/Table` plateau after deterministic remediation.

## Verification

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/benchmark/tableTemplateFinalizationTransactionDiagnostic.test.ts`
- `npx -y node@22 /usr/bin/pnpm exec tsc --noEmit --pretty false`

No original-50 validation was required because no production route was added in this stage. Public PDFs and generated local artifacts were cleaned after metrics extraction.
