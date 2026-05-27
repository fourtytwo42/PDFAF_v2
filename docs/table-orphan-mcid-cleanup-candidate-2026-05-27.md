# Table Orphan-MCID Cleanup Candidate

Date: 2026-05-27

Status: rejected candidate. No behavior code was kept.

## Purpose

The prior table PAC side-effect diagnostic found a clean non-table side-effect family: table repairs sometimes improved table evidence but introduced `pdfua.content.orphan_mcids_absent` debt on focus rows, with no same-family control blockers in that run.

This candidate tested a narrow behavior idea:

1. let an existing table repair produce its intermediate state;
2. only if the rejection was `pac_rule_regressed(pdfua.content.orphan_mcids_absent)`, try existing `remap_orphan_mcids_as_artifacts` on the intermediate state;
3. accept only if the final state improved score and table evidence, did not increase orphan MCID debt relative to the pre-table state, and had no PAC-family regressions.

The candidate used only native tools and no scoring/PAC relaxation, but it was not accepted.

## Local Proof Pack

Scratch root:

```text
/mnt/pdf-review/table-orphan-mcid-cleanup-2026-05-27-r1
```

The local pack included:

- Montana Courts controls and orphan/table lows;
- U.S. Courts controls and table lows;
- Public Safety Canada table lows/controls;
- original-50 table-heavy controls `orig-4076`, `orig-4438`, and `orig-4683`.

The run was stopped after 8 completed rows because the acceptance gate had already failed on positives and original controls.

Partial deterministic validation command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/table-orphan-mcid-cleanup-2026-05-27-r1/input \
  /mnt/pdf-review/table-orphan-mcid-cleanup-2026-05-27-r1/run-r1 \
  --limit 15 \
  --cleanup-row-artifacts
```

Partial run result:

- Completed before stop: `8/15`.
- Mean before: `56.625`.
- Mean after: `76.0000`.
- Rows below target: `6`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.
- No `table_orphan_mcid_cleanup_sequence_recovered` rows were produced.

Completed rows:

| Row | Result |
| --- | ---: |
| `mtcourts-01` | `95/A` |
| `mtcourts-02` | `95/A` |
| `mtcourts-05` | `69/D` |
| `mtcourts-06` | `69/D` |
| `mtcourts-09` | `69/D` |
| `orig-4076` | `69/D` |
| `orig-4438` | `83/B` |
| `orig-4683` | `59/F` |

## Decision

Reject and revert this candidate.

Reasons:

- It did not improve the Montana orphan/table positives.
- It did not produce any accepted sequence-recovery row.
- It regressed original-control behavior in the partial proof run, especially `orig-4076` and `orig-4683` relative to the accepted original-50 floor.
- Continuing into Public Safety rows would not rescue the behavior gate after the original-control failures.

This means the next table-heavy work should not simply append orphan draining after rejected table mutations. The more useful next blocker is earlier and more structural:

- prevent wrong table refs before table tools run;
- identify why valid table moves create new orphan MCIDs;
- preserve parent-tree/content ownership during table normalization instead of trying to clean up debt afterward;
- keep strict transaction rescue parked until the above can pass controls.

Downloaded PDFs and generated artifacts from this failed candidate were local scratch only and were deleted after metrics extraction.
