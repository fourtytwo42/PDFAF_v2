# Readability regression checkpoint - 2026-06-17

## Scope

This checkpoint documents the current deterministic remediation evidence for the experiment corpus after the readability auto-repair continuation changes on branch `codex/pdfaf-public-protected-remediation`.

The run configuration kept semantics and readability enabled:

```bash
pnpm exec tsx scripts/experiment-corpus-benchmark.ts \
  --mode remediate \
  --semantic \
  --readability-review \
  --readability-auto-repair \
  --readability-auto-repair-timeout 600000 \
  --readability-auto-repair-max-attempts 10
```

The VM had no LLM endpoint configured, so semantic lanes were planned but skipped as `no_llm_config`; the passing evidence below is deterministic repair behavior.

## Corpus selection

`Input/experiment-corpus/manifest.json` contains 50 entries total:

- 44 entries with `sourceType: original`.
- 6 entries in `00-fixtures`, split across `fixture` and `remediated_checkpoint` source types.

Therefore `--source-type original` selecting `44 / 50` is expected and does not indicate six missing original/public PDFs.

## Verified runs

| Run | Selected files | Result | Mean | Minimum | Readability |
| --- | ---: | --- | ---: | ---: | --- |
| `Output/base50-semantic-readability-2026-06-17-stage180-continuation-v1/run-2026-06-17T12-14-40-392Z` | 44 / 50 | 44 / 44 remediated | 96.84 | 92 | passed on selected original rows |
| `Output/public-cycle-20-current-readability-2026-06-17-stage180-continuation-v1/run-2026-06-17T11-53-51-654Z` | 20 / 50 | 20 / 20 remediated | 96.75 | 91 | passed |
| `Output/public-cycle-remaining-current-readability-2026-06-17-v1/run-2026-06-17T12-58-14-570Z` | 24 / 50 | 24 / 24 remediated | 96.21 | 91 | passed |
| `Output/fixtures-semantic-readability-2026-06-17-v1/run-2026-06-17T13-16-08-535Z` | 6 / 50 | 6 / 6 remediated | 96.50 | 93 | no readability failures after remediation |

Each run above was validated with:

```bash
pnpm exec tsx scripts/experiment-corpus-benchmark.ts --validate-run <run-dir>
```

## Fixture/control notes

The six fixture/checkpoint rows were run separately to avoid mixing fixture controls into the original-public mean:

- `fixture-adam2`: 34/F -> 99/A.
- `fixture-teams-original`: 54/F -> 98/A.
- `fixture-teams-remediated`: 59/F -> 93/A.
- `fixture-teams-targeted-wave1`: 59/F -> 96/A.
- `fixture-accessible`: 96/A -> 96/A.
- `fixture-inaccessible`: 40/F -> 97/A.

The accessible fixture staying at `96 -> 96` is the current false-positive control signal for this checkpoint.

## Protected and false-positive focused gate

The focused protected/false-positive suite passed after the benchmark runs:

```bash
pnpm vitest run \
  tests/benchmark/protectedFixed50RouteDiagnostic.test.ts \
  tests/benchmark/stage159AcceptedToolHarmDiagnostic.test.ts \
  tests/remediation/pacRuleAcceptanceGate.test.ts \
  tests/remediation/stage180MixedTablePdfua.test.ts \
  tests/remediation/stage186Hard2TableAlt.test.ts \
  tests/remediation/stage188MixedTail.test.ts \
  tests/remediation/orchestratorStage35.test.ts
```

Result: 7 test files passed, 79 tests passed.

## Remaining caveats

- Semantic lanes are still skipped on the VM because no LLM endpoint is configured. Do not treat `no_llm_config` as a readability regression.
- Color contrast remains manual-review-only in this build because rendered pixel contrast analysis is not implemented.
- Post-remediation PDF/UA manual-review categories can remain even when engine scores and readability status pass; these are not hidden failures and should be inspected by category before widening any repair rule.
