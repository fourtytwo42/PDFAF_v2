# National Reentry Resource Center Resources Holdout - 2026-05-25

## Summary

This was a public outside-source holdout against National Reentry Resource Center resource PDFs. The final sample used 20 unique current PDFs under 10 MB from `nationalreentryresourcecenter.org/sites/default/files/inline-files/`. Archived `/documents/...pdf` links were excluded after resolving to 404s.

The source passed the current outside-source target without any behavior change.

- Local run before cleanup: `/mnt/pdf-review/public-holdouts/national-reentry-resource-center-resources-2026-05-25/run-r1`
- PDFs processed: `20/20`
- Mean: `67.45 -> 94.10`
- Median: `96`
- Grades after: `17 A / 2 B / 0 C / 1 D / 0 F`
- Rows below `93`: `4`
- Runtime p50/p95/max: `6058ms / 11216ms / 26562ms`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`

## Sample

| Row | Source URL | Bytes |
| --- | --- | ---: |
| `nrrc-01` | `https://nationalreentryresourcecenter.org/sites/default/files/inline-files/scaSuccessStory_CJCC_0.pdf` | `277016` |
| `nrrc-02` | `https://nationalreentryresourcecenter.org/sites/default/files/inline-files/bjaFactsheet_crisisStabilization.pdf` | `395962` |
| `nrrc-03` | `https://nationalreentryresourcecenter.org/sites/default/files/inline-files/csgjcCultureChangeCorrections.pdf` | `63457` |
| `nrrc-04` | `https://nationalreentryresourcecenter.org/sites/default/files/inline-files/historyImportanceSecondChanceMonth_transcript.pdf` | `99253` |
| `nrrc-05` | `https://nationalreentryresourcecenter.org/sites/default/files/inline-files/coachesCornerTanaHowtopat.pdf` | `187256` |
| `nrrc-06` | `https://nationalreentryresourcecenter.org/sites/default/files/inline-files/coachesCornerStephanieGatewood.pdf` | `190867` |
| `nrrc-07` | `https://nationalreentryresourcecenter.org/sites/default/files/inline-files/sbSeriesFunding_508.pdf` | `124716` |
| `nrrc-08` | `https://nationalreentryresourcecenter.org/sites/default/files/inline-files/dealingWithCovid19_508.pdf` | `179928` |
| `nrrc-09` | `https://nationalreentryresourcecenter.org/sites/default/files/inline-files/sbSeriesCommunication_508.pdf` | `138115` |
| `nrrc-10` | `https://nationalreentryresourcecenter.org/sites/default/files/inline-files/sbSeriesBranding_508.pdf` | `147737` |
| `nrrc-11` | `https://nationalreentryresourcecenter.org/sites/default/files/inline-files/EvalPlanning_Team1_GA.pdf` | `161936` |
| `nrrc-12` | `https://nationalreentryresourcecenter.org/sites/default/files/inline-files/EvalPlanning_Team2_NC_0.pdf` | `202954` |
| `nrrc-13` | `https://nationalreentryresourcecenter.org/sites/default/files/inline-files/SCA%20Improving%20Reentry%20Education%20and%20Employment%20Outcomes%20Orientation%20Webinar.pdf` | `3227123` |
| `nrrc-14` | `https://nationalreentryresourcecenter.org/sites/default/files/inline-files/howEducationWorksForYou_transcript.pdf` | `32524` |
| `nrrc-15` | `https://nationalreentryresourcecenter.org/sites/default/files/inline-files/accessingPrivateFunding_508.pdf` | `144679` |
| `nrrc-16` | `https://nationalreentryresourcecenter.org/sites/default/files/inline-files/alternativesToRandomAssignment_508.pdf` | `205519` |
| `nrrc-17` | `https://nationalreentryresourcecenter.org/sites/default/files/inline-files/54.%20AnalyzingInterviewandFocusGroupData_508.pdf` | `147472` |
| `nrrc-18` | `https://nationalreentryresourcecenter.org/sites/default/files/inline-files/choosingASocialMediaPlatform_508.pdf` | `149274` |
| `nrrc-19` | `https://nationalreentryresourcecenter.org/sites/default/files/inline-files/55.%20FocusGroupGuide_508.pdf` | `178418` |
| `nrrc-20` | `https://nationalreentryresourcecenter.org/sites/default/files/inline-files/buildingSocialMediaPresence_Infographic_508.pdf` | `130055` |

## Diagnostics

The standard low-row diagnostic returned:

- Decision: `holdout_target_met`
- Recommended lane: `reading_link_order_candidate`
- Raw points needed for mean `93`: `0`
- Low rows: `nrrc-03` at `69/D`, `nrrc-08` at `89/B`, `nrrc-13` at `91/A`, and `nrrc-20` at `89/B`

Focused diagnostics did not justify a behavior change:

- Reading-order shell diagnostic found one safe route control (`nrrc-02`, `69 -> 94`, reading `35 -> 79`), but the primary low row `nrrc-03` had only `no_effect` proposals (`69 -> 69`, reading `35 -> 35`), with `0` sequence candidates and no selected rows.
- Figure/alt no-gain diagnostic returned `keep_figure_alt_diagnostic_only`, with `0` scoring candidates, `0` behavior candidates, and `false_positive_applied=0`.

## Decision

No source behavior was changed or accepted.

This source already clears the outside-holdout mean and median targets with bounded runtime and no false positives. The residual `nrrc-03` reading-order failure is real, but current native reading-order shell tooling has no score-moving route for it, and the safe route observed on `nrrc-02` does not generalize into a promotable predicate from this evidence alone.

No original-50 validation was required because no behavior changed.

Generated PDFs and benchmark artifacts were local-only and deleted after metrics extraction.
