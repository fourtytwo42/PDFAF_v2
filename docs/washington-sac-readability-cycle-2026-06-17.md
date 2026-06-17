# Washington SAC readability cycle - 2026-06-17

## Source and sample

- Source: Washington State Statistical Analysis Center publications page, `https://sac.ofm.wa.gov/publications`.
- Current source scrape found `39` direct PDF links.
- Sample rule: first `20` direct PDF links that downloaded as PDFs and were under the `15 MB` safety cap.
- Local input directory: `Input/washington_sac_publications_holdout_2026_05_18`.
- Temporary manifest: `Output/washington-sac-readability-cycle-2026-06-17-manifest/manifest.json`.

The manifest keeps the 20 Washington rows plus 30 standard filler rows because `experiment-corpus-benchmark.ts --validate-manifest` requires exactly 50 entries. The run filtered to `washington-sac-01` through `washington-sac-20` only.

## Broad run

Command:

```bash
pnpm exec tsx scripts/experiment-corpus-benchmark.ts \
  --mode remediate \
  --manifest Output/washington-sac-readability-cycle-2026-06-17-manifest/manifest.json \
  --file washington-sac-01 \
  --file washington-sac-02 \
  --file washington-sac-03 \
  --file washington-sac-04 \
  --file washington-sac-05 \
  --file washington-sac-06 \
  --file washington-sac-07 \
  --file washington-sac-08 \
  --file washington-sac-09 \
  --file washington-sac-10 \
  --file washington-sac-11 \
  --file washington-sac-12 \
  --file washington-sac-13 \
  --file washington-sac-14 \
  --file washington-sac-15 \
  --file washington-sac-16 \
  --file washington-sac-17 \
  --file washington-sac-18 \
  --file washington-sac-19 \
  --file washington-sac-20 \
  --semantic \
  --readability-review \
  --readability-auto-repair \
  --readability-auto-repair-timeout 600000 \
  --readability-auto-repair-max-attempts 10 \
  --out Output/washington-sac-readability-cycle-2026-06-17-v1
```

Run artifact:

`Output/washington-sac-readability-cycle-2026-06-17-v1/run-2026-06-17T13-57-48-608Z`

Validation:

```bash
pnpm exec tsx scripts/experiment-corpus-benchmark.ts \
  --validate-run Output/washington-sac-readability-cycle-2026-06-17-v1/run-2026-06-17T13-57-48-608Z
```

Result:

- Analyze success/errors: `20 / 1`.
- Remediate success/errors: `19 / 1`.
- Completed-row remediation mean: `93.3`.
- Completed readability: `18 passed`, `1 warn`.
- Hard blocker: `washington-sac-10` timed out at the global `600s` remediation budget.
- Runtime tail: `washington-sac-07` spent `587.3s` and ended unchanged at `89/B`, readability `warn`.

| Row | File | Before | After | Readability | Runtime | Notes |
| --- | --- | ---: | ---: | --- | ---: | --- |
| `washington-sac-01` | `01-vehicle_theft_court_cases_in_WA.pdf` | 79 | 96 | passed 96 | 13.4s |  |
| `washington-sac-02` | `02-JBRS_Vehicle_Theft.pdf` | 79 | 94 | passed 94 | 7.8s |  |
| `washington-sac-03` | `03-vehicle_theft.pdf` | 59 | 92 | passed 92 | 18.9s |  |
| `washington-sac-04` | `04-Robbery_Court_Cases_in_Washington.pdf` | 86 | 94 | passed 94 | 8.3s |  |
| `washington-sac-05` | `05-robbery_jail_bookings_in_WA.pdf` | 59 | 92 | passed 92 | 16.3s |  |
| `washington-sac-06` | `06-robbery_arrests.pdf` | 59 | 92 | passed 92 | 19.3s |  |
| `washington-sac-07` | `07-Sentencing_to_Confinement_in_WA.pdf` | 89 | 89 | warn 89 | 587.3s | no useful readability auto-repair effect |
| `washington-sac-08` | `08-SSODA_Handout_FINAL.pdf` | 69 | 95 | passed 95 | 14.4s |  |
| `washington-sac-09` | `09-PSPRC_reranking-supplemental-report.pdf` | 59 | 96 | passed 96 | 28.7s |  |
| `washington-sac-10` | `10-sentencing_guidelines_and_offender_score.pdf` | n/a | error | n/a | 600.0s | global timeout |
| `washington-sac-11` | `11-Rape_Court_Cases_in_WA.pdf` | 86 | 94 | passed 94 | 9.3s |  |
| `washington-sac-12` | `12-rape_jail_bookings_in_WA.pdf` | 59 | 94 | passed 94 | 18.2s |  |
| `washington-sac-13` | `13-rape_arrests_in_WA.pdf` | 59 | 90 | passed 90 | 19.3s |  |
| `washington-sac-14` | `14-firearm_court_cases.pdf` | 79 | 94 | passed 94 | 8.7s |  |
| `washington-sac-15` | `15-JBRS_Firearms.pdf` | 59 | 92 | passed 92 | 20.2s |  |
| `washington-sac-16` | `16-WSP_firearm_arrests.pdf` | 59 | 92 | passed 92 | 19.7s |  |
| `washington-sac-17` | `17-DV_court_cases.pdf` | 89 | 96 | passed 96 | 11.3s |  |
| `washington-sac-18` | `18-domestic_violence_jail_booking.pdf` | 59 | 92 | passed 92 | 15.8s |  |
| `washington-sac-19` | `19-domestic_violence_arrests_in_washington_1.pdf` | 59 | 94 | passed 94 | 18.6s |  |
| `washington-sac-20` | `20-WSP_Court_FINAL.pdf` | 87 | 95 | passed 95 | 190.1s |  |

## Accepted engine change

The broad run exposed a readability auto-repair loop problem on `washington-sac-07`:

- The row had readability `warn`, score `89`.
- Auto-repair attempted `8` times, applied no useful repair, and ended as `no_budget` after about `409s` inside the readability repair loop.
- The repeated evidence was diagnostic, not useful remediation: semantic lanes were skipped as `readability_semantic_unavailable`, deterministic candidates were repeatedly unavailable or no-effect, and the review did not improve.

Accepted fix:

- Add `readability_prior_no_effect_reused` to `ReadabilityAutoRepairReason`.
- In both the API route and benchmark harness, stop the readability auto-repair loop after an attempted repair when all of these are true:
  - engine score did not improve,
  - readability status did not improve,
  - readability score did not improve,
  - no failing readability finding area was resolved.
- Fix stale `contentTaggingAudit` / `taggedContentAudit` path-paint evidence in `readabilityRepairPlan.ts` so TypeScript validation passes and decorative evidence uses the correct snapshot fields.

## Targeted guard validation

Command:

```bash
pnpm exec tsx scripts/experiment-corpus-benchmark.ts \
  --mode remediate \
  --manifest Output/washington-sac-readability-cycle-2026-06-17-manifest/manifest.json \
  --file washington-sac-07 \
  --semantic \
  --readability-review \
  --readability-auto-repair \
  --readability-auto-repair-timeout 600000 \
  --readability-auto-repair-max-attempts 10 \
  --out Output/washington-sac-row07-readability-guard-2026-06-17-v1
```

Run artifact:

`Output/washington-sac-row07-readability-guard-2026-06-17-v1/run-2026-06-17T14-31-29-434Z`

Validation:

```bash
pnpm exec tsx scripts/experiment-corpus-benchmark.ts \
  --validate-run Output/washington-sac-row07-readability-guard-2026-06-17-v1/run-2026-06-17T14-31-29-434Z
```

Result:

- Score stayed `89 -> 89`; no score regression.
- Readability stayed `warn`, score `89`; no hidden pass.
- Auto-repair now stops after `1` attempt with `reason=readability_prior_no_effect_reused`.
- Auto-repair duration dropped to about `58.1s`; total remediation wall dropped to about `230.6s` from the broad-run `587.3s`.
- The row remains a true table/header/heading residual; this change only prevents wasted no-effect retries.

## Regression validation

Focused tests:

```bash
pnpm exec vitest run \
  tests/semantic/readabilityReview.test.ts \
  tests/semantic/readabilityRepairPlan.test.ts \
  tests/remediation/planner.test.ts \
  tests/remediation/orchestratorStage35.test.ts \
  tests/remediation/pacRuleAcceptanceGate.test.ts \
  tests/remediation/tableTargetGuards.test.ts \
  tests/remediation/stage180MixedTablePdfua.test.ts \
  tests/benchmark/protectedReanalysisSelection.test.ts
```

Result: `8` files passed, `210` tests passed.

TypeScript validation:

```bash
pnpm exec tsc --noEmit
```

Result: passed.

Original corpus validation:

```bash
pnpm exec tsx scripts/experiment-corpus-benchmark.ts \
  --mode remediate \
  --source-type original \
  --semantic \
  --readability-review \
  --readability-auto-repair \
  --readability-auto-repair-timeout 600000 \
  --readability-auto-repair-max-attempts 10 \
  --out Output/base50-semantic-readability-2026-06-17-noeffect-guard-v1
```

Run artifact:

`Output/base50-semantic-readability-2026-06-17-noeffect-guard-v1/run-2026-06-17T14-36-12-232Z`

Validated with `--validate-run`.

Result:

- Selected original rows: `44 / 50`.
- Analyze success/errors: `44 / 0`.
- Remediate success/errors: `44 / 0`.
- Remediation mean: `96.64`.
- Readability: `44 passed`.
- Rows below `93`: `short-3981` at `91`, `short-4176` at `90`, `long-4516` at `92`; all passed readability and did not expose a new no-effect retry regression.

## Remaining blocker

This cycle still fails the public-source target because `washington-sac-10` times out at the global `600s` budget and remains table/header/PDF-UA transaction debt. The timeout artifact shows repeated verified checkpoints at `69/D`, with the last phase `verified_checkpoint`, last stage `6`, and last tool `canonicalize_figure_alt_ownership` failing as `no_structural_change`.

The next safe engine lane is not to relax table/orphan or header PAC guards. It is a bounded table/header transaction that can prove one of these outcomes before broad acceptance:

- reduce `pdfua.table.header_association_present`,
- reduce `pdfua.table.header_cells_associated`,
- improve final table/readability score without PAC regression,
- or exit early with a precise non-generic diagnostic before the global timeout.
