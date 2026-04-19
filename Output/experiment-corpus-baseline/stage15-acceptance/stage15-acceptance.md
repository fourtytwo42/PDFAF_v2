# Stage 15 acceptance audit

- Generated: 2026-04-19T05:48:07.785Z
- Baseline (Stage 14.1) run: `Output/experiment-corpus-baseline/run-stage14.1-full`
- Stage 15 run: `Output/experiment-corpus-baseline/run-stage15-full`
- Comparison: `Output/experiment-corpus-baseline/comparison-stage15-full-vs-stage14.1`
- Acceptance: PASS
- Target non-A files (Stage 14.1 residual): 17
- Reached A from target set: 15
- Non-A before/after: 17 -> 2
- Structure survivors with +5 or better: 4
- Font survivors with +10 or better: 5
- Remediate wall median/p95 delta: -592.19 / 1033.43 ms (p95 budget: 5000 ms)

## Gates

- **target_non_a_reach_a:** pass — targetReachedACount=15 threshold=5
- **structure_survivors_material_delta:** pass — structureSurvivorImprovedCount=4 threshold=4
- **font_survivors_material_delta:** pass — fontSurvivorImprovedCount=5 threshold=2
- **accepted_confidence_regressions:** pass — acceptedConfidenceRegressionCount=0
- **semantic_only_trusted_passes:** pass — semanticOnlyTrustedPassCount=0
- **runtime_not_regressed:** pass — wallMedianDeltaMs=-592.19, wallP95DeltaMs=1033.43 medianThreshold<=0 p95Threshold<=5000

## Category Deltas

| Category | Mean Δ | Improved | Still <90 |
| --- | ---: | ---: | ---: |
| pdf_ua_compliance | 92.94 | 17 | 0 |
| heading_structure | 88.24 | 15 | 2 |
| reading_order | 64.82 | 17 | 1 |
| text_extractability | 26.12 | 15 | 5 |
| alt_text | 0.00 | 0 | 0 |

## Route Efficiency

| Route | Files | Score Δ | Added Wall Ms | Score Δ / Added Sec |
| --- | ---: | ---: | ---: | ---: |
| structure_bootstrap_and_conformance | 10 | 479.00 | 1374.30 | 348.542 |
| font_unicode_tail_recovery | 4 | 244.00 | 1588.21 | 153.632 |
| structure_bootstrap | 3 | 123.00 | 3271.66 | 37.596 |

## Target Files

- `00-fixtures/ADAM2.pdf` — 33 -> 99 (F -> A)
- `10-short-near-pass/3981-Illinois Bill of Rights for Victims and Witnesses of Violent Crime _Polish_.pdf` — 33 -> 99 (F -> A)
- `40-font-extractability/4035-Comparison of official and unofficial sources of criminal history record information.pdf` — 33 -> 99 (F -> A)
- `10-short-near-pass/4101-Implementing restorative justice A guide for schools.pdf` — 42 -> 98 (F -> A)
- `20-figure-ownership/4194-Childrens risk of homicide Victimization from birth to age 14 1965 to 1995.pdf` — 42 -> 98 (F -> A)
- `30-structure-reading-order/3661-A Generation of Change 30 Years of Criminal Justice in Illinois.pdf` — 42 -> 98 (F -> A)
- `30-structure-reading-order/3994-Community Policing in Chicago The Chicago Alternative Policing Strategy _CAPS_ Year Ten.pdf` — 42 -> 98 (F -> A)
- `30-structure-reading-order/4131-Redeploy Illinois 2nd Judicial Circuit Pilot Site Impact and Implementation Evaluation Report.pdf` — 42 -> 98 (F -> A)
- `30-structure-reading-order/3775-Criminal Justice Plan for the State of Illinois.pdf` — 45 -> 98 (F -> A)
- `40-font-extractability/4156-2009 Annual Report Motor Vehicle Theft Prevention Council.pdf` — 42 -> 95 (F -> A)
- `00-fixtures/pdfaf_fixture_inaccessible.pdf` — 57 -> 98 (F -> A)
- `40-font-extractability/3437-Information Networks Expanding.pdf` — 55 -> 96 (F -> A)
- `40-font-extractability/3448-Flow of Funds in Illinois Criminal Justice System.pdf` — 55 -> 96 (F -> A)
- `40-font-extractability/3529-Information Technology for Criminal Justice.pdf` — 55 -> 96 (F -> A)
- `20-figure-ownership/4609-Domestic Violence Trends in Illinois_ Victimization Characteristics_ Help-Seeking_ and Service Utilization.pdf` — 60 -> 98 (D -> A)
- `10-short-near-pass/4176-Illinois Offense and Arrest Trends Property Index Arrests 19992008.pdf` — 53 -> 83 (F -> B)
- `10-short-near-pass/4214-Illinois Crime Victim Trends Reported Elder Abuse 20002009.pdf` — 55 -> 85 (F -> B)