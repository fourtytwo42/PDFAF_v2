# Experiment Corpus

This folder is the working 50-file benchmark corpus for the staged PDFAF v2 upgrade.

## Purpose

The corpus exists to force every engine improvement to prove three things at the same time:

- it improves general accessibility detection
- it improves or preserves remediation quality
- it does not slow the engine down by a large margin

This corpus is the benchmark surface referenced in [docs/staged-fast-general-upgrade-roadmap.md](/home/hendo420/PDFAF_v2/docs/staged-fast-general-upgrade-roadmap.md).

## Cohorts

- `00-fixtures`: stable fixtures and Microsoft Teams checkpoints
- `10-short-near-pass`: short files that should become clean quickly if the engine is healthy
- `20-figure-ownership`: figure, nested alt, ownership, and artifact pressure
- `30-structure-reading-order`: logical structure, heading, and reading-order pressure
- `40-font-extractability`: encoding, Unicode, embedding, and extractability pressure
- `50-long-report-mixed`: long reports with mixed structural and runtime pressure

## Source Notes

The files were assembled from:

- the current repo `Input/` set
- the sibling v1 repo at `/home/hendo420/pdfaf`
- the v1 review workspace at `/mnt/pdf-review/workspace/Original`

The selection follows the cohort model described in the v1 roadmap and uses named originals/checkpoints instead of opaque queue-storage UUID artifacts.

## Current Corpus

### `00-fixtures`

- `ADAM2.pdf`
- `Microsoft_Teams_Quickstart (1).pdf`
- `Microsoft_Teams_Quickstart (1)-remediated.pdf`
- `Microsoft_Teams_Quickstart (1)-targeted-figures-wave1-b2.pdf`
- `pdfaf_fixture_accessible.pdf`
- `pdfaf_fixture_inaccessible.pdf`

### `10-short-near-pass`

- `3981-Illinois Bill of Rights for Victims and Witnesses of Violent Crime _Polish_.pdf`
- `4074-Audit shows improvement in record accuracy timeliness completeness.pdf`
- `4101-Implementing restorative justice A guide for schools.pdf`
- `4176-Illinois Offense and Arrest Trends Property Index Arrests 19992008.pdf`
- `4189-Study measures impact of government services on juvenile community reentry.pdf`
- `4192-InfoNet database reveals Illinois domestic violence victim demographics trends.pdf`
- `4214-Illinois Crime Victim Trends Reported Elder Abuse 20002009.pdf`
- `4660-Civil Rights Discrimination Complaint Form.pdf`

### `20-figure-ownership`

- `4082-State survey results quantify crime victimization patterns.pdf`
- `4184-Child sex exploitation study probes extent of victimization in Illinois.pdf`
- `4188-Corrections data illustrate juvenile incarceration trends in Illinois.pdf`
- `4194-Childrens risk of homicide Victimization from birth to age 14 1965 to 1995.pdf`
- `4466-Victim Need Report_ Service Providers_ Perspectives on the Needs of Crime Victims and Service Gaps.pdf`
- `4609-Domestic Violence Trends in Illinois_ Victimization Characteristics_ Help-Seeking_ and Service Utilization.pdf`
- `4702-2022 Victim Needs Assessment.pdf`
- `4753-2022 Domestic Violence Fatality Review Committee Annual Report.pdf`
- `4754-2023 Domestic Violence Fatality Review Committee Annual Report.pdf`
- `4755-2024 Domestic Violence Fatality Review Committee Biennial Report.pdf`

### `30-structure-reading-order`

- `3661-A Generation of Change 30 Years of Criminal Justice in Illinois.pdf`
- `3775-Criminal Justice Plan for the State of Illinois.pdf`
- `3994-Community Policing in Chicago The Chicago Alternative Policing Strategy _CAPS_ Year Ten.pdf`
- `4076-Juvenile Justice Data 2004 Annual Report APPENDIX H Data Tables.pdf`
- `4078-Community reentry challenges daunt exoffenders quest for a fresh start.pdf`
- `4108-Juvenile pretrial process.pdf`
- `4122-Criminal justice system The pretrial process.pdf`
- `4131-Redeploy Illinois 2nd Judicial Circuit Pilot Site Impact and Implementation Evaluation Report.pdf`
- `4207-Families and Reentry Unpacking How Social Support Matters.pdf`
- `4438-Inventorying Employment Restrictions Task Force Final Report.pdf`

### `40-font-extractability`

- `3437-Information Networks Expanding.pdf`
- `3448-Flow of Funds in Illinois Criminal Justice System.pdf`
- `3529-Information Technology for Criminal Justice.pdf`
- `4035-Comparison of official and unofficial sources of criminal history record information.pdf`
- `4057-2006 Criminal History Records _CHRI_ Audit Report.pdf`
- `4156-2009 Annual Report Motor Vehicle Theft Prevention Council.pdf`
- `4172-Illinois Drug Trends Drug Crime Lab Submissions 19972007.pdf`
- `4699-Criminal History Record Checks for Federally Assisted Housing Applications_ Annual Report.pdf`

### `50-long-report-mixed`

- `4146-ICJIA 2008 Annual Report.pdf`
- `4470-Co-occurring Mental Health and Substance Use Disorders of Women in Prison_ An Evaluation of the WestCare Foundation_s Dual Diagnosis Program in Illinois.pdf`
- `4516-An Exploratory Study of the Discretionary Use of Electronic Monitoring for Individuals Upon Release to Mandatory Supervised Release _MSR_ in Illinois.pdf`
- `4606-Illinois Criminal Justice Information Authority 2018 Annual Report.pdf`
- `4608-Law Enforcement Response to Mental Health Crisis Incidents_ A Survey of Illinois Police and Sheriff_s Departments.pdf`
- `4680-Alternative Sentencing for Drug Offenses_ An Evaluation of the First Offender Call Unified for Success _FOCUS_ Program.pdf`
- `4683-Illinois Higher Education in Prison Task Force 2022 Report.pdf`
- `4700-R3 2022 Annual Report.pdf`

## Working Rule

Do not change this corpus casually.

If a file is added, removed, or replaced, update this manifest and treat it as a benchmark-surface change. The point of this set is to let us measure engine progress honestly across stages.
