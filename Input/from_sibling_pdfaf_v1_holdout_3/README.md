# Stage 126 v1 Holdout 3

Third v1-derived holdout batch for PDFAF v2 generalization validation.

The PDFs are original cached v1 source PDFs copied locally from the sibling `/home/hendo420/pdfaf` repo. They are ignored by git. `manifest.json` and `selection.json` are safe metadata and do not contain PDF payloads.

Run:

```bash
pnpm run benchmark:edge-mix -- --manifest Input/from_sibling_pdfaf_v1_holdout_3/manifest.json --out Output/from_sibling_pdfaf_v1_holdout_3/run-stage126-holdout3-baseline-2026-04-26-r1
```

Selected rows:

| Bucket | ID | v1 | Pages | File |
| --- | ---: | ---: | ---: | --- |
| manual_scanned | 3423 | 8/F | 12 | manual_scanned/3423-new-federal-justice-aid-coming-to-illinois.pdf |
| manual_scanned | 3429 | 8/F | 12 | manual_scanned/3429-authority-awards-12-million-to-aid-state-crime-victims.pdf |
| manual_scanned | 3433 | 8/F | 12 | manual_scanned/3433-half-of-former-inmates-arrested-within-1-12-years.pdf |
| control | 3763 | 99/B | 4 | control/3763-trends-in-violent-crime-and-the-justice-systems-response.pdf |
| control | 3864 | 99/B | 4 | control/3864-examining-restorative-justice.pdf |
| long_mixed | 4531 | 18/F | 63 | long_mixed/4531-s-t-o-p-violence-against-women-in-illinois-a-multi-year-plan-ffy14-16.pdf |
| long_mixed | 3566 | 19/F | 52 | long_mixed/3566-a-study-of-the-drug-use-forecasting-gun-addendum-for-chicago-adult-male-.pdf |
| long_mixed | 3579 | 19/F | 166 | long_mixed/3579-an-interim-report-on-the-illinois-department-of-corrections-juvenile-sex.pdf |
| long_mixed | 3615 | 19/F | 166 | long_mixed/3615-the-illinois-department-of-corrections-juvenile-sex-offender-treatment-p.pdf |
| long_mixed | 3857 | 19/F | 166 | long_mixed/3857-an-evaluation-of-the-illinois-department-of-corrections-juvenile-sex-off.pdf |
| figure_alt | 3635 | 16/F | 2 | figure_alt/3635-victims-rights.pdf |
| figure_alt | 3567 | 18/F | 2 | figure_alt/3567-mcgruff-rural-residents-protect-yourself-from-crime.pdf |
| figure_alt | 3643 | 18/F | 2 | figure_alt/3643-law-enforcement.pdf |
| figure_alt | 3654 | 18/F | 4 | figure_alt/3654-trends-in-illinois-drug-arrests.pdf |
| figure_alt | 3657 | 18/F | 4 | figure_alt/3657-sentencing-felony-offenders-in-illinois.pdf |
| table_link_annotation | 4068 | 18/F | 4 | table_link_annotation/4068-examining-incarceration-trends-among-minority-youth-in-illinois.pdf |
| table_link_annotation | 4002 | 19/F | 16 | table_link_annotation/4002-driving-under-the-influence-dui-laws-andenforcement-in-illinois-and-the-.pdf |
| table_link_annotation | 4066 | 20/F | 8 | table_link_annotation/4066-technological-innovation-fuels-identity-theft-fraud-epidemic.pdf |
| table_link_annotation | 4071 | 20/F | 8 | table_link_annotation/4071-examining-trends-and-data-on-incarcerated-youth-in-illinois.pdf |
| table_link_annotation | 4097 | 20/F | 8 | table_link_annotation/4097-communities-take-on-youth-violence.pdf |
| font_text | 3662 | 18/F | 4 | font_text/3662-measuring-hate-crime-in-illinois.pdf |
| font_text | 3772 | 18/F | 4 | font_text/3772-trends-in-illinois-crime-19951999.pdf |
| font_text | 3876 | 18/F | 4 | font_text/3876-college-campus-crime-data-in-illinois.pdf |
| font_text | 3917 | 18/F | 4 | font_text/3917-measuring-a-felons-likelihood-of-receiving-a-prison-sentence.pdf |
| font_text | 4046 | 19/F | 2 | font_text/4046-chicago-homicide-dataset-series-childrens-risk-of-homicide-victimization.pdf |
| structure_heading_reading_order | 3601 | 19/F | 20 | structure_heading_reading_order/3601-the-juvenile-justice-reform-act-of-1998.pdf |
| structure_heading_reading_order | 4737 | 20/F | 18 | structure_heading_reading_order/4737-evaluation-of-youth-mental-health-first-aid-trainings-for-illinois-schoo.pdf |
| structure_heading_reading_order | 3597 | 21/F | 4 | structure_heading_reading_order/3597-evaluation-of-the-cook-county-juvenile-sheriffs-work-alternative-program.pdf |
| structure_heading_reading_order | 3608 | 21/F | 4 | structure_heading_reading_order/3608-champaign-county-enhanced-domestic-violence-probation-program-evaluated.pdf |
| structure_heading_reading_order | 3660 | 21/F | 4 | structure_heading_reading_order/3660-kankakee-meg-unit-employs-problem-solving-approach-to-combat-drug-crime.pdf |
