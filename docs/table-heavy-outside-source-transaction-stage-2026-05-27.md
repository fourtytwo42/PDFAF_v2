# Table-Heavy Outside Source Transaction Stage - 2026-05-27

## Summary

This stage tested whether table-heavy outside-source failures are ready for a strict object-backed table transaction. The result is diagnostic-only: the proof pack reproduced real table debt and found several strict transaction candidates, but it also found non-table target resolution, a table-triggered original-50 control, and a non-table PAC regression on a same-source control.

No remediation behavior, scoring, PAC gate, ODL/PAC/POC runtime dependency, semantic behavior, source gate, filename gate, row gate, or visual-table synthesis was added.

## Diagnostic Added

Source script: `scripts/table-transaction-root-cause-diagnostic.ts`

The diagnostic reads a bounded baseline report and optional local PDF paths. It reports, per table attempt:

- requested `structRef` / `structRefs` where available;
- resolved role and target resolution evidence from mutation invariants;
- table/header invariant movement before and after the tool;
- table PAC regressions versus non-table PAC regressions;
- focus/control classification.

Classifications:

- `strict_transaction_candidate`
- `non_table_target_blocked`
- `pac_table_regression_only`
- `non_target_pac_regression`
- `control_triggered`
- `runtime_or_analyzer_debt`
- `no_safe_transaction`

Focused tests and type check passed:

```bash
npx -y node@22 /usr/bin/pnpm exec vitest run tests/benchmark/tableTransactionRootCauseDiagnostic.test.ts
npx -y node@22 /usr/bin/pnpm run lint
```

## Proof Pack

Local scratch root:

`/mnt/pdf-review/table-heavy-transaction-proof-2026-05-27-r1`

The pack contained `17` PDFs/symlinks:

- clean positives: Montana Courts `mtcourts-05`, `mtcourts-06`, `mtcourts-09`; U.S. Courts `uscourts-01`, `uscourts-04`;
- caution positives: Public Safety Canada `pscan-02`, `pscan-06`, `pscan-08`;
- same-source controls: Montana Courts `mtcourts-01`, `mtcourts-02`; U.S. Courts `uscourts-02`, `uscourts-03`; Public Safety Canada `pscan-10`, `pscan-13`;
- original-50 controls: `orig-4076`, `orig-4438`, `orig-4683`.

RISP and Tennessee DCS remained prior documented evidence for this stage because the source pages/downloads were not reliably fetchable from this VM during the fresh proof-pack build.

Validation command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/table-heavy-transaction-proof-2026-05-27-r1/input \
  /mnt/pdf-review/table-heavy-transaction-proof-2026-05-27-r1/run-r1 \
  --limit 17 \
  --cleanup-row-artifacts
```

Validation result:

- Completed: `17/17`
- Mean: `55.71 -> 78.94`
- Grades after: `6 A / 2 B / 0 C / 6 D / 3 F`
- Hard timeouts/errors: `0`
- `false_positive_applied=0`

Diagnostic command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/table-transaction-root-cause-diagnostic.ts \
  --run /mnt/pdf-review/table-heavy-transaction-proof-2026-05-27-r1/run-r1/baseline_report.json \
  --out /mnt/pdf-review/table-heavy-transaction-proof-2026-05-27-r1/diagnostic-r1 \
  --pdf/control id=path values from the local proof-pack manifest
```

Diagnostic result:

- Decision: `diagnostic_only`
- Reasons:
  - `controls_trigger_table_transaction`
  - `non_table_target_resolution_present`
  - `non_target_pac_regression_present`

Classification distribution:

| Classification | Rows |
| --- | ---: |
| `strict_transaction_candidate` | 5 |
| `non_table_target_blocked` | 3 |
| `pac_table_regression_only` | 0 |
| `non_target_pac_regression` | 1 |
| `control_triggered` | 1 |
| `runtime_or_analyzer_debt` | 0 |
| `no_safe_transaction` | 7 |

Strict transaction candidates:

- `mtcourts-05`
- `mtcourts-06`
- `mtcourts-09`
- `pscan-08`
- `uscourts-01`

Unsafe/blocking evidence:

- `pscan-02`: `set_table_header_cells` target resolved as `Span`.
- `pscan-06`: `set_table_header_cells` target resolved as `L`.
- `uscourts-04`: `set_table_header_cells` target resolved as `TD`.
- `orig-4438`: original-50 control triggered table mutations and moved table evidence.
- `pscan-13`: same-source control had table movement but also non-table PAC regression `pdfua.figure.alt_present`.

## Decision

Do not implement strict table transaction behavior from this stage. The evidence proves a real table-heavy weakness, but the accepted behavior gate is not clean:

- enough positives exist, but unsafe target-resolution evidence remains;
- at least one original-50 control triggers the table transaction shape;
- a same-source control shows non-table PAC side effects;
- broadening table repair would risk repeating the known PAC/header-association and non-target-regression problems.

The next table stage should target side-effect/root-cause cleanup, not broader table admission:

- explain why valid table improvements can create non-target PAC regressions;
- improve batch target reporting for all `structRefs`, not only single refs;
- design a stricter transaction only after controls are clean and all requested refs are proven real reachable `/Table` objects.

No original-50 validation was required for acceptance because no remediation behavior changed. The previous accepted original-50 floor remains mean `94.24`, median `95`, `false_positive_applied=0`, and no hard timeouts.
