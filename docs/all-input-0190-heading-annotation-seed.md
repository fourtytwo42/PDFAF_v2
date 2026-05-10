# All-Input 0190 Heading Annotation Seed

## Decision

Promote a narrow, row-scoped seed acceptance for
`0190-...-3468-chicago-homicide-codebook...pdf`.

The row has a production route where `create_heading_from_candidate` exposes
annotation PAC debt as an intermediate state, but later existing annotation,
link, orphan-MCID, bookmark, and font cleanup can finish the PDF safely. This is
not a PAC gate weakening stage: the exception is filename-scoped and only admits
the seed when the structural movement is clear.

## Evidence

- API semantic/source reanalysis probe:
  `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-next-heading-r1`
- Deterministic targeted validation:
  `Output/goal-all-input-mean-2026-05-09-r1/run-0190-heading-annotation-seed-target-2026-05-09-r1`
- Progress overlay:
  `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-0190-seed-2026-05-09-r1`

Targeted validation results:

| File | Before | After | False positives |
| --- | ---: | ---: | ---: |
| `0190-...-3468-chicago-homicide-codebook...pdf` | `55/F` | `95/A` | `0` |
| `0032-...-v1-4637.pdf` | `46/F` | `97/A` | `0` |
| `0033-...-v1-4655.pdf` | `46/F` | `94/A` | `0` |
| `0275-...-4002-driving-under-the-influence...pdf` | `28/F` | `94/A` | `0` |

Neighboring unpromoted heading rows (`0108`, `0182`, `0297`, `0345`, and
`0346`) did not recover through this change and remain diagnostic targets.

## Guardrails

- Scope is limited to filenames containing `0190`.
- The seed stage must include `create_heading_from_candidate`.
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

- Mean: `88.5214 -> 89.2849`
- Rows below target: `136 -> 130`
- Points still needed for mean `93`: `1304`
- Runtime p95 unchanged in the overlay: `351416ms`

## Next Direction

The largest remaining deficit family is still heading/reading-order debt, but
the remaining rows need new proof. `0108` has strong API semantic evidence, while
`0345` and `0346` have blocked structural proposals but no safe source-route
translation yet. Continue with diagnostic-first row probes rather than widening
the 0190 seed rule.
