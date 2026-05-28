# Table Strict-Ref Transaction Infrastructure - 2026-05-28

## Summary

This stage keeps strict table-target infrastructure, but parks the attempted Stage 180 empty-row/table-regularity behavior.

The useful accepted source change is diagnostic/infrastructure only:

- `normalize_table_structure` can now run a strict `structRefs` batch when `strictTableTargetRef` is set.
- Strict mode resolves every requested ref before mutation.
- If any requested ref is unresolved or not a real `/Table`, the whole strict batch refuses to mutate.
- Generic table behavior is unchanged unless a caller explicitly passes the strict flag.
- Python table analysis now reports `removableEmptyRowCount` for table diagnostics.

No scorer, PAC gate, planner admission, API, Docker, ODL/PAC/POC runtime, semantic, source-specific, filename-specific, row-specific, or hash-specific behavior changed.

## Proof Attempt

A compact public proof pack was rebuilt under `/mnt/pdf-review` from public Montana Courts, U.S. Courts, and Public Safety Canada PDFs. The behavior experiment focused first on Montana Courts because prior artifacts showed repeat-supported table movement there.

The attempted routed behavior was a bounded Stage 180 cleanup that tried to finish residual object-backed table regularity debt after non-table PAC families were already clean. That behavior was removed before commit because target proof was not stable:

| Run | Key result |
| --- | --- |
| Initial Montana repeat | controls stayed `95/A`; focus rows stayed around `88-89` |
| Lower table-score gate | one focus row fell to `69/D` |
| Strict `structRefs` batch | one repeat lifted a focus row only to `92/A`; another repeat left focus rows at `69/69/89` |

All observed repeats kept `false_positive_applied=0`, but the behavior did not satisfy the acceptance standard: at least two outside positives did not improve from the same stable predicate, and one repeat produced low final table states.

## Decision

Decision: `keep_strict_ref_infrastructure_park_behavior`.

The strict ref primitive is worth keeping because it directly supports the active table-heavy goal's wrong-ref and mixed-ref requirements. The score-moving post-pass is not accepted. The remaining blocker appears to be upstream table/PAC side-effect and route-state variance, not simply lack of a strict batch primitive.

No original-50 full validation was required for the parked behavior because no production route uses the new strict flag.

## Verification

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/remediation/stage180MixedTablePdfua.test.ts tests/integration/tableNormalization.integration.test.ts tests/benchmark/tableOriginalControlImpactDiagnostic.test.ts`
- `npx -y node@22 /usr/bin/pnpm run lint`

Both passed.

## Next Step

Do not retry the removed empty-row/regularity post-pass as a broad Stage 180 route.

The next table-heavy stage should use the strict-ref primitive diagnostically to find a stable set of all-table refs where:

- final table/header evidence improves,
- no orphan MCID, figure/alt, link/annotation, or reading/order PAC family regresses,
- controls do not trigger,
- the object-backed target set is stable across repeats.

