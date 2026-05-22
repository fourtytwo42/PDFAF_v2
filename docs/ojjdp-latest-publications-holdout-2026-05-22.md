# OJJDP Latest Publications Holdout

Date: 2026-05-22

## Scope

This was a public outside-corpus check against recent Office of Juvenile Justice and Delinquency Prevention publications. The source is an official OJJDP publication list:

https://ojjdp.ojp.gov/library/publications/list

The sampled set contained 20 public OJJDP PDF publications, all under 10 MB. The PDFs and generated benchmark artifacts were kept local under `/mnt/pdf-review` during the diagnostic and are not source assets.

## Run

The diagnostic run used four five-file bounded shards with Node 22, deterministic native remediation only, no semantic work, no remediated PDFs, `300000ms` per-PDF child timeout, and `10000ms` external grace.

## Summary

- PDFs processed: 20/20
- Mean: 62.00 -> 89.05
- Median after: 93.5
- Final grades: 15 A, 2 B, 0 C, 2 D, 1 F
- Raw points needed for mean 93: 79
- Timeouts/errors: 0
- `false_positive_applied`: 0
- Runtime p50/p95/max: 25.311s / 168.370s / 253.665s

This source is much healthier than the BJS latest-publications holdout. The median already clears 93, and the remaining gap is concentrated in a small set of mixed table/reading/heading rows plus one native-untagged zero-heading F.

## Low-Row Shape

The low-row diagnostic selected `table_target_resolution_needed` as the largest grouped lane:

- 3 table-target rows account for 53 of the 79 raw points needed for a 93 mean.
- The largest single miss is `17-credible-messenger-and-lived-experience-mentoring-programs-implications-for-practice.pdf`, ending at 59/F with `heading_structure=0`.
- Four rows are near misses at 90-92 and should stay low priority unless a broader accepted lane reaches them naturally.

## Table Diagnostics

The table target-resolution diagnostic found stable object-backed table targets for:

- `02-juvenile-court-statistics-2023`
- `08-untangling-the-web-of-violence-the-network-effects-of-civil-gang-injunctions`
- `19-partnering-with-youth-and-families-a-best-practices-guide-for-youth-justice-stakeholders`

Original controls stayed off, but one same-source high-grade control (`04-2024-victims-of-child-abuse-act-annual-report-to-congress`) also exposed stable header-association debt. A focused sequence probe over the three table lows plus that control found 0 safe sequence candidates. The best-scoring sequences still classified as harmful because non-target or PAC table debt increased.

Decision for table behavior: `diagnostic_only_table_lane_parked`.

## Zero-Heading Diagnostic

The zero-heading F (`17-credible-messenger...implications-for-practice`) has obvious visible title text, but native analysis classifies it as `native_untagged` with:

- 0 extracted/tree headings,
- 0 paragraph structure elements,
- 0 MCID text spans,
- no OCR shell candidate,
- no tagged visible anchor candidate.

The Stage153-style classification is `structure_bootstrap_required` with `content_owner_count=0`. This is not a safe heading-recovery target under the current generalization rule because it would require creating headings from raw layout text without an existing paragraph, MCID span, native title owner, or visible structured anchor.

Decision for heading behavior: `diagnostic_only_no_safe_heading_anchor`.

## Decision

Decision: `diagnostic_only_no_safe_ojjdp_fix`.

No source behavior change is accepted from this source set. OJJDP is useful as a holdout because it shows the current engine generalizes reasonably well to many new federal reports, but the remaining paths do not yet meet the evidence standard for general remediation changes.

## Parked Lanes

Future OJJDP work should only resume if a new diagnostic can:

- reduce table/PAC debt without increasing PAC table-header association failures,
- or create headings from an owned native/MCID/paragraph-backed target rather than raw layout text,
- improve at least two OJJDP lows or remove the single F,
- keep original controls stable,
- preserve `false_positive_applied=0`,
- avoid p95/runtime regression on original 50.
