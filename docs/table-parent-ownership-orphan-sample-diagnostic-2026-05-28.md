# Table Parent Ownership Orphan-Sample Diagnostic

Date: 2026-05-28

## Decision

Diagnostic-only source change accepted.

`scripts/table-parent-ownership-probe.ts` now records bounded orphan-MCID sample deltas for each probed table mutation step:

- `orphanMcidSampleAdded`
- `orphanMcidSampleRemoved`

This does not change scoring, production remediation, planner routing, PAC gates, Docker/API behavior, semantic/LLM behavior, or benchmark behavior. It is instrumentation for the remaining Montana-style table side-effect blocker.

## Why

The repeated-template route solved the high-volume PREA subtype, but Montana-style case-processing tables remain parked because table normalization can improve `table_markup` while causing or exposing orphan-MCID/PDF-UA side effects. Prior diagnostics only showed orphan-count movement. The new sampled page/MCID delta helps decide whether future preservation work should target a specific MCID ownership transition or whether the current bounded snapshot is not enough.

## Montana Probe

Public source:

- `https://courts.mt.gov/courts/statistics/dcstats`

Local proof pack before cleanup:

- `/mnt/pdf-review/pdfaf-montana-ownership-probe-2026-05-28-r1`

Rows:

- Focus: `mtcourts-05-2025-1st`, `mtcourts-09-2024-2nd`
- Controls: `mtcourts-01-2025-2025`, `mtcourts-02-2025-4th`

Command shape:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/table-parent-ownership-probe.ts \
  --missing-header-batch \
  --out /mnt/pdf-review/pdfaf-montana-ownership-probe-2026-05-28-r1/probe-missing-header-r1 \
  --pdf .../mtcourts-05-2025-1st.pdf \
  --pdf .../mtcourts-09-2024-2nd.pdf \
  --pdf .../mtcourts-01-2025-2025.pdf --control mtcourts-01-2025-2025 \
  --pdf .../mtcourts-02-2025-4th.pdf --control mtcourts-02-2025-4th
```

Result:

- Decision: `diagnostic_only`
- Rows: `4` (`2` focus / `2` control)
- Wrong-ref rows: `0`
- Control unsafe rows: `0`
- Clean table progress rows: `mtcourts-05-2025-1st`
- Ownership regression candidates: `mtcourts-09-2024-2nd`

Movement:

| Row | Class | Score | Table | Orphan MCIDs | Sample Delta |
| --- | --- | ---: | ---: | ---: | --- |
| `mtcourts-05-2025-1st` | clean table progress | `55 -> 59` | `0 -> 26` | `32 -> 31` | none |
| `mtcourts-09-2024-2nd` | orphan side effect | `55 -> 59` | `0 -> 26` | `30 -> 31` | removed sample keys `0:15`, `0:3`, `0:7`; no added key in bounded sample |
| `mtcourts-01-2025-2025` | control no movement | `60 -> 60` | `100 -> 100` | `0 -> 0` | none |
| `mtcourts-02-2025-4th` | control no movement | `60 -> 60` | `100 -> 100` | `0 -> 0` | none |

## Interpretation

The Montana blocker is still not ready for production behavior:

- table progress remains too small (`0 -> 26`) and below A-range;
- one focus row still has orphan-MCID side-effect evidence;
- the bounded orphan sample does not directly reveal the newly orphaned MCID even though the count increases, so count-only and bounded-sample evidence is not enough to design a safe preservation fix.

The next safe Montana-side work should add deeper Python-side attribution around changed table refs and referenced MCID ownership before any behavior route is promoted. Do not broaden the repeated-template route or suppress `pdfua.content.orphan_mcids_absent`.

## Cleanup

The Montana PDFs and generated probe artifacts were removed after extracting the metrics above. No generated PDFs or public PDF payloads are source assets.

## Verification

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/benchmark/tableParentOwnershipProbe.test.ts`
- `npx -y node@22 /usr/bin/pnpm exec tsc --noEmit --pretty false`
