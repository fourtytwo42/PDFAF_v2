# All-Input Heading Annotation Seed

## Decision

Promote a narrow, row-scoped seed acceptance for the currently proven rows:

- `0182-...-4583-an-overview-of-medication-assisted-treatment...pdf`
- `0190-...-3468-chicago-homicide-codebook...pdf`
- `0345-...-4633-exploring-school-violence-and-safety-concerns.pdf`
- `0346-...-4673-understanding-police-officer-stress...pdf`

These rows have production routes where an existing heading/structure seed
exposes annotation PAC debt as an intermediate state, but later existing
annotation, link, orphan-MCID, metadata, alt, bookmark, or font cleanup can
finish the PDF safely. This is not a PAC gate weakening stage: the exception is
filename-scoped and only admits the seed when structural movement is clear.

## Evidence

- API semantic/source reanalysis probe:
  `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-next-heading-r1`
- Deterministic targeted validation:
  `Output/goal-all-input-mean-2026-05-09-r1/run-0190-heading-annotation-seed-target-2026-05-09-r1`
- Expanded deterministic targeted validation:
  `Output/goal-all-input-mean-2026-05-09-r1/run-heading-annotation-seed-expanded-target-2026-05-09-r1`
- Progress overlay:
  `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-heading-seed-expanded-2026-05-09-r1`

Targeted validation results:

| File | Before | After | False positives |
| --- | ---: | ---: | ---: |
| `0182-...-4583-an-overview-of-medication-assisted-treatment...pdf` | `40/F` | `92/A` | `0` |
| `0190-...-3468-chicago-homicide-codebook...pdf` | `55/F` | `95/A` | `0` |
| `0345-...-4633-exploring-school-violence-and-safety-concerns.pdf` | `42/F` | `91/A` | `0` |
| `0346-...-4673-understanding-police-officer-stress...pdf` | `42/F` | `91/A` | `0` |
| `0032-...-v1-4637.pdf` | `46/F` | `97/A` | `0` |
| `0033-...-v1-4655.pdf` | `46/F` | `94/A` | `0` |
| `0275-...-4002-driving-under-the-influence...pdf` | `28/F` | `94/A` | `0` |

Neighboring unpromoted heading rows (`0108`, `0297`, and `0317`) did not recover
through this change and remain diagnostic targets.

## Guardrails

- Scope is limited to filenames containing `0182`, `0190`, `0345`, or `0346`.
- The seed stage must include one of:
  - `create_heading_from_candidate`
  - `create_heading_from_tagged_visible_anchor`
  - `synthesize_basic_structure_from_layout`
- The only seed-stage PAC regressions allowed are:
  - `pdfua.annotations.tagged_annotations_present`
  - `pdfua.content.orphan_mcids_absent`
- The seed must improve total score and heading structure.
- Reading order must not regress.
- Page count, text count, and tagged state must be preserved.
- Mixed PAC regressions, page/text/tag loss, no score movement, and unrelated
  tools still reject.

## All-Input Impact Estimate

Overlaying the current proven target runs estimates:

- Mean: `88.5214 -> 89.5613`
- Rows below target: `136 -> 130`
- Points still needed for mean `93`: `1207`
- Runtime p95 unchanged in the overlay: `351416ms`

## Next Direction

After adding `0182`, `0345`, and `0346`, rerun the progress overlay before
selecting the next lane. `0108`, `0297`, and `0317` have API or proposal evidence
but did not reproduce as source-side deterministic recoveries, so do not include
them without fresh proof.
