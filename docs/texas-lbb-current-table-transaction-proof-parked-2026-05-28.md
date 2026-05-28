# Texas LBB Current Table Transaction Proof Parked - 2026-05-28

## Scope

This is a follow-up to `docs/texas-lbb-public-safety-criminal-justice-holdout-2026-05-26.md` using the current accepted table code after the wrong-ref guard, `/MCR /Pg` evidence correction, ownership preservation guard, and narrow table-empty-row cleanup work.

The goal was to see whether Texas Legislative Budget Board monthly/public-safety reports now expose a promotable strict table transaction lane:

- real, root-reachable `/Table` refs only;
- no filename/source/row/hash gates;
- no scoring changes, PAC exceptions, ODL/PAC/POC runtime calls, semantic calls, or remediated PDF artifacts committed;
- behavior promotion only if at least two outside positives improve materially with controls stable.

## Local Proof Pack

Local scratch path used during the diagnostic:

- `/mnt/pdf-review/pdfaf-table-texas-proof-2026-05-28-r1`

The compact proof pack re-downloaded seven under-10MB public PDFs from the Texas LBB source:

- focus/low rows: `txlbb-06`, `txlbb-11`, `txlbb-17`
- same-source controls: `txlbb-01`, `txlbb-02`, `txlbb-04`, `txlbb-07`

The PDFs and generated JSON/Markdown artifacts are local-only scratch and were not committed.

## Current Deterministic Validation

Command shape:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/pdfaf-table-texas-proof-2026-05-28-r1/input \
  /mnt/pdf-review/pdfaf-table-texas-proof-2026-05-28-r1/run-current-r1 \
  --limit 7 \
  --per-pdf-timeout-ms 300000 \
  --external-timeout-grace-ms 10000 \
  --tmp-root /mnt/pdf-review/pdfaf-tmp \
  --cleanup-row-artifacts
```

Result:

- Processed: `7/7`
- Mean after remediation: `88.7143`
- Mean before remediation: `39.2857`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`

Rows:

| Row | Score | Key residual |
| --- | ---: | --- |
| `txlbb-01` | `94/A` | control, table already clean, residual reading-order score |
| `txlbb-02` | `96/A` | control, clean pass |
| `txlbb-04` | `94/A` | control, table clean, residual PDF/UA/reading |
| `txlbb-06` | `92/A` | near miss; prior non-table table target evidence, current final table score clean |
| `txlbb-07` | `93/A` | control, table clean, residual reading-order score |
| `txlbb-11` | `59/F` | high-impact residual: `heading_structure=0`, `table_markup=16`, `pdf_ua_compliance=57`, long runtime tail |
| `txlbb-17` | `93/A` | near miss; current final table score clean |

## Diagnostics

Table target-resolution diagnostic:

- Decision: `plan_table_target_behavior_proof`
- Stable focus candidates: `txlbb-11`, `txlbb-17`
- Prior non-table target row: `txlbb-06`
- Unsafe same-source controls: none

Strict table-ref parent ownership probe:

- Decision: `diagnostic_only`
- Wrong-ref rows: none
- Ownership-regression candidates: none
- Control-unsafe rows: none
- Clean table progress rows: `txlbb-11` only

Important step-level evidence:

- `txlbb-11` strict `normalize_table_structure` moved table score `0 -> 16` without orphan/ParentTree regression.
- The subsequent strict `set_table_header_cells` step on a different selected table ref regressed table score `16 -> 0`.
- `txlbb-06` and `txlbb-17` showed no table movement in the strict probe.
- Controls showed no table movement.

Strict batch/same-session probe:

- Decision: `diagnostic_only`
- Clean table progress rows: `txlbb-11` only
- `txlbb-11` moved only `33/F -> 36/F`, table `0 -> 16`, with orphan/ParentTree stable.
- `txlbb-17` and controls showed no table movement.

## Decision

No source change is justified from this proof.

Texas LBB remains useful evidence for table-heavy outside-source behavior, but the current strict transaction proof does not meet the behavior promotion gate:

- only one outside focus row (`txlbb-11`) shows clean strict table movement;
- the score movement is small (`33/F -> 36/F`) and leaves major heading/PDF-UA/table debt;
- `txlbb-17` is no longer a material table-positive in current full remediation because the final table score is already clean;
- `txlbb-06` confirms the wrong-ref blocker pattern but does not become a strict `/Table` transaction positive;
- controls are clean, but clean controls alone are insufficient without at least two material positives.

Do not broaden table admission or add strict transaction rescue from this sample. A later Texas behavior stage would need a deeper general multi-table/header-finalization design that can reduce final header association debt on `txlbb-11`, then prove the same predicate on at least one independent source before original-50 validation.

## Next Useful Table Direction

The table-heavy weakness is now less about broad admission and more about finalization quality after object-backed table movement:

- finish missing-header/header-association cleanup on the same real `/Table` refs after normalization;
- preserve table/PAC side-effect ownership while doing so;
- prove the finalization path on at least two independent outside-source positives, not just one Texas row;
- keep Montana residual regularity and U.S. Courts mixed heading/table debt as separate parked subtypes until a clean shared predicate appears.

No original-50 validation was required for this Texas stage because no scoring, planner, remediation, API, Docker, or benchmark behavior changed.
