# NIJ Latest Publications Holdout

Date: 2026-05-22

## Scope

This was a public outside-corpus check against recent National Institute of Justice publications. The source is an official NIJ publication list:

https://nij.ojp.gov/library/publications/list

The sampled set contained 20 public NIJ PDF publications, all under 10 MB. The PDFs and generated benchmark artifacts were kept local under `/mnt/pdf-review` during the diagnostic and are not source assets.

## Run

The diagnostic run used four five-file bounded shards with Node 22, deterministic native remediation only, no semantic work, no remediated PDFs, `300000ms` per-PDF child timeout, and `10000ms` external grace.

## Summary

- PDFs processed: 20/20
- Mean: 30.70 -> 64.50
- Median after: 52
- Final grades: 5 A, 1 B, 0 C, 0 D, 14 F
- Raw points needed for mean 93: 570
- Timeouts/errors: 0
- `false_positive_applied`: 0
- Runtime p50/p95/max: 61.340s / 130.026s / 179.635s

This source is a hard outside-corpus weakness for current PDFAF. Most failures are older NIJ/NCJRS-style reports with usable extracted text but no safe structural ownership for headings or reading-order repair.

## Low-Row Shape

The low-row diagnostic selected `reading_link_order_candidate` as the high-impact lane:

- 14 rows below 93 were heading/reading failures.
- Those rows accounted for 573 raw points against the 570-point gap to a 93 mean.
- The common final shape was `heading_structure=0`, `reading_order=30`, `text_extractability=99`, `alt_text=100`, `pdf_ua_compliance=100`, and `table_markup=100`.

The repeated 52/F plateau is therefore not table, alt, language, or text-extractability debt. It is missing owned structure: the engine can improve metadata/PDF-UA syntax, but it cannot prove a safe heading or reading-order target.

## Heading/Reading Diagnostics

A focused Stage187-style diagnostic analyzed the 20 NIJ source PDFs and checked native anchor evidence. It found:

- 19 rows classified as `no_safe_heading_anchor`.
- 1 row classified as `mixed_alt_table_not_heading_first`.
- 0 implementable heading/reading rows.
- The low-row source shape consistently had 0 MCID text spans, 0 paragraph structure elements, 0 extracted/tree headings, 0 native title BT candidates, and no OCR/tagged visible anchor candidate.

Representative failed rows still had visible title-like text in extraction, but no object-backed owner. Existing repair timelines also showed `synthesize_basic_structure_from_layout`, `tag_native_text_blocks`, and `repair_structure_conformance` returning no safe structural target on the low rows.

## Decision

Decision: `diagnostic_only_no_safe_nij_fix`.

No source behavior change is accepted from this source set. The tempting behavior would be to create headings from raw visible text on untagged legacy reports. That is not acceptable under the current PAC-alignment and generalization goal because it lacks a paragraph, MCID span, native title owner, OCR-owned text, or tagged visible anchor.

Original-50 validation was not rerun for NIJ because no scoring, planner, mutator, API, or Docker behavior changed.

## Parked Lane

Future NIJ work should only resume if a new diagnostic can create object-backed ownership before heading synthesis, such as:

- a safe native text-owner bridge for these legacy marked-content-free reports,
- a bounded OCR/text ownership lane with stable visual validation,
- or a reading-order structure synthesis path that creates ParentTree-backed content rather than headings from raw layout text.

Any future behavior must improve multiple NIJ low rows, keep controls stable, preserve `false_positive_applied=0`, and avoid original-50 quality or speed regression.
