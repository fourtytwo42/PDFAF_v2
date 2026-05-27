# Table Ownership Preservation Guard - 2026-05-27

## Summary

This is an accepted safety/ownership guard for native table mutations. It does not broaden table admission, change scoring, call ODL/PAC/POC/Java, or add source/PDF-specific gates.

The change makes table mutation validation track native content-ownership evidence:

- orphan MCID count before/after;
- compact ParentTree debt before/after;
- table target details before/after.

If a table mutation increases orphan MCID or ParentTree debt, the Python mutation reports `no_effect` with `table_orphan_mcids_not_preserved` or `table_parent_tree_not_preserved`. The mutation runner also restores a pre-op rollback copy for no-effect table mutations so later batched operations cannot silently carry a rejected table edit forward.

## Why

Prior table-heavy outside-source diagnostics showed real table progress was often blocked by non-table PAC side effects, especially `pdfua.content.orphan_mcids_absent`. A rejected broad orphan cleanup candidate proved that appending orphan cleanup after table movement is unsafe. The correct first step is preserving content ownership inside table tools.

## Validation

Focused tests passed:

```bash
python3 -m py_compile python/pdf_analysis_helper.py
npx -y node@22 /usr/bin/pnpm exec vitest run tests/remediation/orchestratorStage35.test.ts tests/integration/tableNormalization.integration.test.ts
npx -y node@22 /usr/bin/pnpm run lint
```

Targeted public/control proof pack:

- Rows: 12
- Sources: Montana Courts, U.S. Courts Judicial Business, Public Safety Canada, original controls
- Mean after: `80.5833`
- Median after: `79.5`
- Hard timeouts/errors: `0`
- `false_positive_applied=0`

This target pack confirms the guard is safety-moving, not yet score-moving. Table-heavy lows remain low, so the broader table-heavy goal is still open.

Original-50 validation:

- First full run: mean `93.90`, `false_positive_applied=0`, no hard timeouts. It missed the `94.24` floor because known volatile rows `4680` and `4683` landed low.
- Focus repeat on `4680`/`4683`: `97/A` and `98/A`, confirming volatility.
- Fresh full repeat: `50/50` completed, mean `94.56`, median `95.5`, `false_positive_applied=0`, no hard timeouts.
- Fresh full repeat runtime: p50 `14804ms`, p95 `109607ms`, max `272912ms`. The documented prior original-50 p95 floor was `156270ms`, so p95 did not regress.

## Decision

Accepted as a general PAC-honest table safety guard.

This does not complete the table-heavy outside-source goal. The next behavior stage should use this guard as a prerequisite for strict object-backed table transactions on rows where all requested refs are reachable `/Table` objects and no non-table PAC family regresses.

## Cleanup

Downloaded public PDFs and generated validation artifacts were local scratch under `/mnt/pdf-review` and were deleted after metrics extraction.
