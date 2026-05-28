# Table Empty-Row Regularity Follow-up Parked

Date: 2026-05-28

## Summary

This follow-up tested a broader table empty-row regularity path for table-heavy outside PDFs. It was not accepted as source behavior.

The candidate was general and object-backed: it attempted to let the existing table normalizer select additional `/Table` objects whose remaining irregularity came from removable empty `/TR` rows, and it tested a guarded Stage 180 post-pass after table/header cleanup. It did not use source names, row IDs, filenames, hashes, ODL, PAC, POC, Java, or semantic/LLM behavior.

## Evidence

Local artifacts:

- `/mnt/pdf-review/table-heavy-next-2026-05-27-r2/montana-empty-row-repeat-r1/baseline_report.json`
- `/mnt/pdf-review/table-heavy-next-2026-05-27-r2/empty-row-regularity-postpass-r3-tablecount/baseline_report.json`
- `/mnt/pdf-review/table-heavy-next-2026-05-27-r2/original50-empty-row-regularity-tablecount-r1/baseline_report.json`
- `/mnt/pdf-review/table-heavy-next-2026-05-27-r2/original50-low-repeat-tablecount-r1/baseline_report.json`
- `/mnt/pdf-review/table-heavy-next-2026-05-27-r2/original50-empty-row-regularity-tablecount-r2/baseline_report.json`

Target positives were promising but not sufficient for acceptance:

- Montana repeat: `mtcourts-05` and `mtcourts-09` both reached `95/A`.
- Compact proof r3: `mtcourts-05 95/A`, `mtcourts-09 95/A`, `pscan-13 99/A`, U.S. Courts rows unchanged at `59/F`.
- `false_positive_applied=0`.

Original-50 acceptance did not pass:

- r1: `50/50` completed, mean `93.58`, median `95`, no hard timeouts, `false_positive_applied=0`; below accepted floor `94.24`.
- focused repeat: `4076 90/A`, `4438 69/D`, `4516 92/A`, `4683 98/A`, `false_positive_applied=0`.
- r2: `49/50` completed, all-row mean `92.62`, completed-row mean `94.51`, hard timeout on `4076`, median `96`, `false_positive_applied=0`.

The candidate did not fire on original-50 rows in r1 or r2, so the gate failure appears dominated by existing original-control route/runtime volatility (`4076`, `4438`, `4516`, `4680`, `4683`) rather than by the table follow-up itself. Even so, the current goal requires a fresh original-50 gate with no hard timeout and no accepted-regression, so this behavior cannot be promoted.

## Decision

Decision: `park_behavior_not_accepted`.

The source behavior from this follow-up was reverted before commit. Keep the already accepted narrow empty-row cleanup from the prior checkpoint, but do not reintroduce the broader selector/post-pass unless an original-50 acceptance path is available.

Next useful work:

- Stabilize or explicitly park original-control runtime/route debt before accepting another table behavior lane.
- Treat U.S. Courts lows as mixed zero-heading/table debt, not table-only regularity cleanup.
- If table work resumes, prefer a bounded object-backed transaction that proves no non-table PAC family regression and can clear original-50 without hard timeouts.
