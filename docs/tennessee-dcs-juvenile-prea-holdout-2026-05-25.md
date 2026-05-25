# Tennessee DCS Juvenile PREA Holdout - 2026-05-25

## Source

- Public source: Tennessee Department of Children's Services juvenile justice PREA page.
- Source page: `https://www.tn.gov/dcs/program-areas/juvenile-justice/prea.html`
- Sample: 20 unique public PREA facility audit and annual-report PDFs in page order that downloaded successfully, verified as PDFs, and were under 10 MiB.
- Download note: the first linked Bartlett PAC audit reset the connection from this environment and was skipped; the retained sample starts with the next successfully downloaded public PDF and includes Tennessee-hosted PDFs plus the linked Bedford County audit PDF.
- Size gate: every retained PDF was under 10 MiB; largest retained file was about `1.3 MB`.
- Local PDFs and generated validation artifacts were temporary under `/mnt/pdf-review/public-holdouts/tennessee-dcs-juvenile-prea-2026-05-25/` and are not source assets.

## Validation

- Command family: deterministic bounded holdout validation with `--no-semantic --no-pdfs`.
- Run artifact: `/mnt/pdf-review/public-holdouts/tennessee-dcs-juvenile-prea-2026-05-25/run-r1/baseline_report.json`
- Completed: `20/20`
- Mean: `83.6500`
- Median: `93`
- Grades: `11 A / 0 B / 0 C / 9 D / 0 F`
- Rows below `93`: `9`
- Runtime p50/p95/max: `20098ms / 37134ms / 53385ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

Low rows:

| Row | Score | Notes |
| --- | ---: | --- |
| `tndcsprea-01-2023-PREA-Audit.pdf` | `69/D` | Stable table/header-association debt. |
| `tndcsprea-04-2024BradleyPREAAudit.pdf` | `69/D` | Stable table/header-association debt. |
| `tndcsprea-05-2023HollisResidentialTreatmentCenterPREAAudit.pdf` | `69/D` | Stable table/header-association debt. |
| `tndcsprea-07-MTJDCPREAAudit2023.pdf` | `69/D` | Stable table/header-association debt. |
| `tndcsprea-09-2023HollisAcademyPREAAudit.pdf` | `69/D` | Stable table/header-association debt. |
| `tndcsprea-10-MadisonCoPREAAudit2023.pdf` | `69/D` | Stable table/header-association debt. |
| `tndcsprea-16-2024_MountainViewAcademcy_PREA_Audit.pdf` | `69/D` | Stable table/header-association debt. |
| `tndcsprea-17-2023PutnamPREAAudit.pdf` | `69/D` | Stable table/header-association debt. |
| `tndcsprea-18-RichardLBeanPREAAudit2023.pdf` | `69/D` | Stable table/header-association debt. |

## Low-Row Diagnostics

Low-row diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/tennessee-dcs-juvenile-prea-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `187`
- Table lane raw points: `216`

Repeat/control run:

- Artifact: `/mnt/pdf-review/public-holdouts/tennessee-dcs-juvenile-prea-2026-05-25/repeat-r1/baseline_report.json`
- Rows: nine lows plus same-source controls `tndcsprea-02`, `tndcsprea-03`, `tndcsprea-12`, `tndcsprea-14`, `tndcsprea-15`, and `tndcsprea-20`.
- Stable lows: all nine low rows repeated at `69/D`.
- Stable controls: `tndcsprea-02 94/A`, `tndcsprea-03 97/A`, `tndcsprea-12 93/A`, `tndcsprea-14 93/A`, `tndcsprea-15 93/A`, and `tndcsprea-20 93/A`.
- `false_positive_applied`: `0`
- Hard timeouts/errors: `0`

Repeat low-row diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/tennessee-dcs-juvenile-prea-2026-05-25/repeat-low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `211`

Table target-resolution diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/tennessee-dcs-juvenile-prea-2026-05-25/table-target-resolution-r1/table-target-resolution-diagnostic.md`
- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidates: all nine `69/D` low rows.
- Unsafe same-source control candidates: `tndcsprea-02`, `tndcsprea-15`.
- Prior non-table target rows: none
- Rejection reason: stable table targets are not sufficient; same-source controls trigger table target classes, and prior table tools still show `pac_rule_regressed(pdfua.table.header_association_present)`.

Table sequence probe:

- Artifact: `/mnt/pdf-review/public-holdouts/tennessee-dcs-juvenile-prea-2026-05-25/table-sequence-probe-r1/table-structure-sequence-probe.md`
- Rows probed: `tndcsprea-01`, `tndcsprea-05`, `tndcsprea-17`, `tndcsprea-12`, `tndcsprea-15`, and `tndcsprea-20`.
- Sequence candidates: `0`
- Harmful PAC regressions: `9`
- No-useful-movement outcomes: `33`
- Best low-row outcomes stayed `69/D`; unsafe/control sequences included harmful non-target PAC regressions, including `tndcsprea-15 93/A -> 59/F`.

## Decision

This holdout is diagnostic-only and did not receive a behavior change. It is a real outside-corpus weakness: the source mean remained `83.6500`, and nine audit reports repeated at `69/D` with consistent table/header-association debt.

No general remediation change is accepted from this evidence:

- the same table target classes trigger same-source A controls;
- representative sequence probing found no safe table sequence candidate;
- existing table tools either do not move the low rows or introduce harmful PAC regressions;
- accepting this lane would require solving final PAC table/header preservation, not suppressing or weakening `pdfua.table.header_association_present`.

No source behavior changed, so no original-50 regression validation was required. Downloaded PDFs and generated artifacts should be deleted after metrics extraction. Future work can use this source as additional evidence for a stricter table/header transaction project, but it does not justify broadening current table admission.
