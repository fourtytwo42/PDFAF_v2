# Idaho SAC readability cycle - 2026-06-17

## Scope

This checkpoint extends the public-PDF validation beyond the experiment corpus using the documented Idaho ISP/SAC 20-PDF holdout from `docs/idaho-isp-sac-holdout-2026-05-18.md`.

The PDFs were re-downloaded on the VM into ignored local input directory `Input/idaho_sac_holdout_2026_05_18`. Each download was checked for a `%PDF-` header and capped at 15 MB. The PDFs remain local validation artifacts and must not be committed.

Because `scripts/experiment-corpus-benchmark.ts` requires a 50-entry experiment-style manifest, this run used an untracked compatibility manifest at `Output/idaho-sac-readability-cycle-2026-06-17-manifest/manifest.json`: 20 Idaho rows plus 30 filler rows. The benchmark selected only the 20 `idaho-sac-*` row ids.

## Command

```bash
pnpm exec tsx scripts/experiment-corpus-benchmark.ts \
  --mode remediate \
  --manifest Output/idaho-sac-readability-cycle-2026-06-17-manifest/manifest.json \
  --file idaho-sac-01 --file idaho-sac-02 --file idaho-sac-03 --file idaho-sac-04 --file idaho-sac-05 \
  --file idaho-sac-06 --file idaho-sac-07 --file idaho-sac-08 --file idaho-sac-09 --file idaho-sac-10 \
  --file idaho-sac-11 --file idaho-sac-12 --file idaho-sac-13 --file idaho-sac-14 --file idaho-sac-15 \
  --file idaho-sac-16 --file idaho-sac-17 --file idaho-sac-18 --file idaho-sac-19 --file idaho-sac-20 \
  --semantic \
  --readability-review \
  --readability-auto-repair \
  --readability-auto-repair-timeout 600000 \
  --readability-auto-repair-max-attempts 10 \
  --out Output/idaho-sac-readability-cycle-2026-06-17-v1
```

Semantic lanes were planned but skipped as `no_llm_config`, matching the current VM configuration.

## Result

Run artifact:

`Output/idaho-sac-readability-cycle-2026-06-17-v1/run-2026-06-17T13-24-27-598Z`

Validated with:

```bash
pnpm exec tsx scripts/experiment-corpus-benchmark.ts \
  --validate-run Output/idaho-sac-readability-cycle-2026-06-17-v1/run-2026-06-17T13-24-27-598Z
```

Summary:

- Analyze success/errors: `20 / 0`.
- Remediate success/errors: `20 / 0`.
- Mean score: `46.5 -> 96.8`.
- Median after remediation: `97`.
- Minimum final score: `89`.
- Readability: `18 passed`, `2 warn`, `0 failed`.
- Semantic lanes: `figures`, `headings`, `promote_headings`, and `untagged_headings` all skipped with `no_llm_config`.

## Low rows

| Row | File | Before | After | Readability | Residual areas |
| --- | --- | ---: | ---: | --- | --- |
| `idaho-sac-14` | `14-American-Indian-Crime-in-Idaho-Victims-Offenders-and-Arrestees.pdf` | 59/F | 89/B | warn, score 89 | table markup 72, heading structure 79, reading order 86 |
| `idaho-sac-16` | `16-Domestic-Violence-in-Idaho-2007-2012.pdf` | 55/F | 89/B | warn, score 89 | table markup 72, heading structure 79, reading order 86 |

Both warn rows are real accessibility/readability residuals rather than color-contrast-only noise. They share:

- `table_markup` score `72` with irregular/strongly irregular table signals.
- `heading_structure` score `79`, capped by `pdfua.heading.levels_not_skipped`.
- `reading_order` score `86` with sampled/geometric order risk.

## Diagnostic notes

`idaho-sac-14` improved through table continuation from `69` to `89`, but still has one strongly irregular table plus PDF/UA/orphan-MCID manual-review debt.

`idaho-sac-16` has seven strongly irregular tables. Later table-normalization attempts were rejected because they would regress `pdfua.content.orphan_mcids_absent`; this is the intended safety behavior and is not a safe broad auto-fix yet.

The current evidence does not justify weakening the table/orphan-MCID guard or forcing heading hierarchy changes. The next safe improvement lane is a targeted diagnostic for table normalization that preserves orphan MCIDs on documents shaped like `idaho-sac-16`, plus protected controls proving no false-positive table/orphan regressions.


## Targeted residual repeat

After the broad 20-row run, the two warn rows were repeated together with the same semantics/readability flags:

```bash
pnpm exec tsx scripts/experiment-corpus-benchmark.ts \
  --mode remediate \
  --manifest Output/idaho-sac-readability-cycle-2026-06-17-manifest/manifest.json \
  --file idaho-sac-14 \
  --file idaho-sac-16 \
  --semantic \
  --readability-review \
  --readability-auto-repair \
  --readability-auto-repair-timeout 600000 \
  --readability-auto-repair-max-attempts 10 \
  --out Output/idaho-sac-warnrows-readability-repeat-2026-06-17-v1
```

Run artifact:

`Output/idaho-sac-warnrows-readability-repeat-2026-06-17-v1/run-2026-06-17T13-47-33-347Z`

Validated with `--validate-run`.

Targeted repeat results:

| Row | Broad-run result | Targeted repeat result | Targeted readability | Remaining residual |
| --- | ---: | ---: | --- | --- |
| `idaho-sac-14` | 89/B, warn | 92/A | passed, score 92 | heading 79, reading order 86, PDF/UA 71; table markup improved to 92 |
| `idaho-sac-16` | 89/B, warn | 95/A | passed, score 95 | heading 79, PDF/UA 79; table markup and reading order passed |

This targeted evidence shows the two broad-run warn rows are recoverable by the current deterministic engine without a new table/orphan-MCID rule. It also shows route variance: the broad run stalled after repeated table/orphan-MCID preservation rejections, while the targeted repeat found a non-regressing table sequence.

The correct next engineering move is not to relax `table_orphan_mcids_not_preserved`. A future improvement should make the table route more deterministic, or add a guarded table-plus-orphan cleanup transaction only when it proves final table/readability gain and no final PAC regression on protected controls.

## Comparison to older deterministic holdout note

The previous deterministic Idaho note reported mean `50.85 -> 92.75`, minimum `69`, and two weak rows. The current semantics/readability-enabled engine path improved this holdout to mean `96.8`, minimum `89`, with no remediation errors and no readability failures.
