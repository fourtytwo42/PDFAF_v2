# Table MCID Ownership Attribution Diagnostic

Date: 2026-05-28

## Decision

Diagnostic-only source change accepted.

Python table invariants now support an explicit diagnostic flag, `diagnosticTableMcidOwnership`, that records bounded MCID ownership samples for requested table refs:

- `targetRefDetails[*].referencedMcidCount`
- `targetRefDetails[*].referencedMcidSample`
- `targetRefDetails[*].referencedMcidSampleKeys`
- `targetRefMcidDeltas`

`scripts/table-parent-ownership-probe.ts` enables this flag only for its missing-header batch probe and reports when newly orphaned sample keys are still referenced by the changed target table subtree.

This does not change scoring, production remediation, planner routing, PAC gates, Docker/API behavior, semantic/LLM behavior, or normal benchmark behavior.

## Why

The prior Montana orphan-sample probe showed table progress with volatile orphan-MCID movement, but it could not tell whether the changed table refs actually lost MCID ownership. The new attribution checks the requested `/Table` subtrees directly before and after mutation.

## Montana Probe

Public source:

- `https://courts.mt.gov/courts/statistics/dcstats`

Local proof pack before cleanup:

- `/mnt/pdf-review/pdfaf-montana-mcid-ownership-2026-05-28-r1`

Rows:

- Focus: `mtcourts-05-2025-1st`, `mtcourts-09-2024-2nd`
- Controls: `mtcourts-01-2025-2025`, `mtcourts-02-2025-4th`

Command shape:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/table-parent-ownership-probe.ts \
  --missing-header-batch \
  --out /mnt/pdf-review/pdfaf-montana-mcid-ownership-2026-05-28-r1/probe-missing-header-r3 \
  --pdf .../mtcourts-05-2025-1st.pdf \
  --pdf .../mtcourts-09-2024-2nd.pdf \
  --pdf .../mtcourts-01-2025-2025.pdf --control mtcourts-01-2025-2025 \
  --pdf .../mtcourts-02-2025-4th.pdf --control mtcourts-02-2025-4th
```

Representative repeats:

| Repeat | Row | Class | Score | Table | Orphan MCIDs | Target table MCID delta | Added orphan sample still target-referenced |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| `r2` | `mtcourts-05-2025-1st` | clean table progress | `55 -> 59` | `0 -> 26` | `30 -> 30` | none | `0:90`, `0:93`, `0:96` |
| `r2` | `mtcourts-09-2024-2nd` | clean table progress | `55 -> 59` | `0 -> 26` | `63 -> 24` | none | `0:90`, `0:93`, `0:96` |
| `r3` | `mtcourts-05-2025-1st` | clean table progress | `55 -> 59` | `0 -> 26` | `30 -> 30` | none | `0:191`, `0:194`, `0:197`, `0:200` |
| `r3` | `mtcourts-09-2024-2nd` | clean table progress | `55 -> 59` | `0 -> 26` | `30 -> 30` | none | none |

Controls stayed stable in the final repeat:

- `mtcourts-01-2025-2025`: `60 -> 60`, `table_markup 100 -> 100`, orphan MCIDs `0 -> 0`
- `mtcourts-02-2025-4th`: `60 -> 60`, `table_markup 100 -> 100`, orphan MCIDs `0 -> 0`

## Interpretation

This rules out the simplest preservation theory for the Montana missing-header batch: the changed target table refs did not lose sampled MCID references. In the rows where the global orphan sample gained keys, those same keys were still present in the changed target `/Table` subtree sample after mutation.

The blocker is therefore not ready for a table-transaction behavior promotion. The next safe work should diagnose the global orphan-MCID collector / referenced-MCID attribution contradiction, especially page/ref identity and traversal stability, without suppressing `pdfua.content.orphan_mcids_absent` or broadening table admission.

## Cleanup

The Montana PDFs and generated probe artifacts were removed after extracting the metrics above. No generated PDFs or public PDF payloads are source assets.

## Verification

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/benchmark/tableParentOwnershipProbe.test.ts`
- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/integration/tableNormalization.integration.test.ts`
- `npx -y node@22 /usr/bin/pnpm exec tsc --noEmit --pretty false`
