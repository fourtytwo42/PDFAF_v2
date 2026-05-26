# Connecticut Judicial Branch Publications Holdout - 2026-05-26

## Source

- Source family: Connecticut Judicial Branch public brochures, guides, schedules, and administrative publications.
- Publications index: `https://www.jud.ct.gov/pub.htm`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/connecticut-judicial-branch-publications-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The sample walked English-language PDF links from the official Connecticut Judicial Branch publications page and skipped candidates that failed the capped download guard.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/connecticut-judicial-branch-publications-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/connecticut-judicial-branch-publications-2026-05-26/run-r1 \
  --limit 20 \
  --cleanup-row-artifacts
```

Run mode:

- deterministic
- `--no-semantic`
- `--no-pdfs`
- single bounded holdout worker

Results:

| Metric | Value |
| --- | ---: |
| Processed | 20/20 |
| Mean before | 75.60 |
| Mean after | 96.90 |
| Median after | 99 |
| Grades after | 19 A / 0 B / 0 C / 1 D / 0 F |
| Rows below 93 | 1 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 7,491 ms |
| Runtime p95 | 46,608 ms |
| Runtime max | 48,137 ms |

Rows below 93:

| Row | Baseline after | Runtime | Primary residual |
| --- | ---: | ---: | --- |
| `ctjudpub-20.pdf` | 69/D | 46,608 ms | Table/link/reading debt in the infractions schedule |

## Sample

The 20 valid under-10MiB PDFs downloaded from Connecticut Judicial Branch URLs were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `ctjudpub-01` | Admission of New Attorneys by the Connecticut Supreme Court | 192,782 |
| `ctjudpub-02` | Directory of the Connecticut Judicial Branch | 3,583,122 |
| `ctjudpub-03` | Notice Under the Americans with Disabilities Act | 47,495 |
| `ctjudpub-04` | Procedures for Ordering A Court Transcript | 3,505,068 |
| `ctjudpub-05` | Centralized Infractions Bureau | 389,250 |
| `ctjudpub-06` | How Small Claims Court Works | 785,475 |
| `ctjudpub-07` | Online Dispute Resolution Poster | 53,801 |
| `ctjudpub-08` | Answer in a Connecticut Civil Action | 215,053 |
| `ctjudpub-09` | Basic Information on Connecticut Pretrial Civil Procedure | 154,646 |
| `ctjudpub-10` | Choosing a Return Day | 143,559 |
| `ctjudpub-11` | Qualifying for a Civil Annulment in Connecticut | 151,844 |
| `ctjudpub-12` | Tips for the Self-Represented In Court, In-Person | 113,084 |
| `ctjudpub-13` | Electronic Devices Policy | 50,138 |
| `ctjudpub-14` | Limitations on Electronic Devices in Judicial Branch Facility | 25,358 |
| `ctjudpub-15` | Supreme and Appellate Court Electronic Devices Guidelines | 43,695 |
| `ctjudpub-16` | Adult Probationer Handbook | 1,092,298 |
| `ctjudpub-17` | Certificates of Employability | 1,411,725 |
| `ctjudpub-18` | Risk Protection Orders and Risk Protection Order Investigations for Adults | 125,900 |
| `ctjudpub-19` | Risk Warrants and Risk Warrant Investigations for Children Under 18 | 125,564 |
| `ctjudpub-20` | Violations and Infractions Schedule | 2,039,843 |

Skipped during the capped download pass:

| Candidate | Reason |
| --- | --- |
| Biennial Report of the Judicial Branch 2022-2024 | HTTP/download failure during capped fetch |
| Equal Employment Opportunity Plan 2015-2016 | HTTP/download failure during capped fetch |
| Equal Employment Opportunity Plan 2025-2026 | HTTP/download failure during capped fetch |
| Handbook of Connecticut Appellate Procedure | HTTP/download failure during capped fetch |
| Foreclosure Mediation Program | HTTP/download failure during capped fetch |
| What Happens When You Go To Small Claims Court | HTTP/download failure during capped fetch |
| Centralized Infractions Bureau Brochure | HTTP/download failure during capped fetch |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/connecticut-judicial-branch-publications-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/connecticut-judicial-branch-publications-2026-05-26/low-row-diagnostic-r1
```

Decision: `holdout_target_met`

Recommended lane: `table_target_resolution_needed`

Raw points needed for mean 93: `0`

Lane split:

| Lane | Rows | Raw points |
| --- | ---: | ---: |
| `table_target_resolution_needed` | 1 | 24 |

Table target-resolution diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/table-target-resolution-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/connecticut-judicial-branch-publications-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/connecticut-judicial-branch-publications-2026-05-26/table-target-resolution-r1 \
  --pdf ctjudpub-20=/mnt/pdf-review/public-holdouts/connecticut-judicial-branch-publications-2026-05-26/input/ctjudpub-20.pdf \
  --control ctjudpub-02=/mnt/pdf-review/public-holdouts/connecticut-judicial-branch-publications-2026-05-26/input/ctjudpub-02.pdf \
  --control ctjudpub-04=/mnt/pdf-review/public-holdouts/connecticut-judicial-branch-publications-2026-05-26/input/ctjudpub-04.pdf \
  --control ctjudpub-16=/mnt/pdf-review/public-holdouts/connecticut-judicial-branch-publications-2026-05-26/input/ctjudpub-16.pdf \
  --control ctjudpub-17=/mnt/pdf-review/public-holdouts/connecticut-judicial-branch-publications-2026-05-26/input/ctjudpub-17.pdf \
  --control ctjudpub-19=/mnt/pdf-review/public-holdouts/connecticut-judicial-branch-publications-2026-05-26/input/ctjudpub-19.pdf
```

Decision: `keep_table_target_resolution_diagnostic_only`

Stable focus candidates: `ctjudpub-20`

Unsafe control candidates: `ctjudpub-02`

Reason: the infractions schedule has many stable table targets, but the directory control also has stable header-association targets and already recovered to A-grade in the source run.

Low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/connecticut-judicial-branch-publications-2026-05-26/low-repeat-input \
  /mnt/pdf-review/public-holdouts/connecticut-judicial-branch-publications-2026-05-26/run-low-repeat-r1 \
  --limit 1 \
  --cleanup-row-artifacts
```

Repeat result:

| Row | Baseline after | Repeat after | Repeat runtime |
| --- | ---: | ---: | ---: |
| `ctjudpub-20.pdf` | 69/D | 69/D | 49,778 ms |

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The source already exceeds the 93 mean target with `19/20` rows A-grade, no timeout/error rows, and `false_positive_applied=0`.
- The only low row is stable, but it is isolated and not needed for source-level mean/median.
- The table target diagnostic found an unsafe same-source control shape, so table behavior remains diagnostic-only.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
