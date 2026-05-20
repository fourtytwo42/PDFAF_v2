# Reading/Heading Discriminator Diagnostic

Status: implemented as diagnostic-only. This stage finds a narrower native predicate for reading/heading recovery candidates and does not change scoring, planner routing, remediation, mutation behavior, PAC gates, API behavior, Docker behavior, or benchmark behavior.

## Implementation

- Added `scripts/reading-heading-discriminator-diagnostic.ts`.
- The script consumes the prior native calibration artifact:

```text
/mnt/pdf-review/pdfaf-odl-diagnostics/reading-layout-calibration-2026-05-19-r1/reading-layout-calibration.json
```

- It does not analyze PDFs, call OpenDataLoader, remediate, score, or mutate files.
- It compares native-only discriminator features:
  - reading and heading score debt;
  - layout heading count and density;
  - repeated header/footer page coverage;
  - geometry and multi-column risk;
  - table/noise density;
  - existing target match count and match type.

## Evidence

Diagnostic run:

```text
/mnt/pdf-review/pdfaf-odl-diagnostics/reading-heading-discriminator-2026-05-20-r1
```

Result:

- Rows analyzed: `11`.
- Distribution: `4 report_layout_heading_recovery_candidate`, `1 geometry_order_scoring_only_candidate`, `4 control_like_short_guide_or_table_noise`, `2 no_safe_discriminator`.
- Focus distribution: `4 report_layout_heading_recovery_candidate`, `1 geometry_order_scoring_only_candidate`, `1 no_safe_discriminator`.
- Control distribution: `4 control_like_short_guide_or_table_noise`, `1 no_safe_discriminator`.
- Decision: `clean_report_layout_discriminator_found`.

The clean report-layout predicate requires all of:

- low reading or heading score (`reading_order <= 80` or `heading_structure <= 80`);
- report-scale layout evidence (`layoutHeadingCandidateCount >= 60`, `repeatedHeaderFooterPageCount >= 20`, and heading-candidate density `>= 2.0` per sampled page);
- at least `2` existing repair target matches tied to paragraph structure elements, MCID text spans, native-title geometry, or visible-heading anchors.

Matched focus rows:

- `va-02`
- `va-04`
- `va-05`
- `va-07`

Rejected/non-promotable rows:

- `va-03`: report-scale evidence but no existing target match.
- `va-06`: geometry-order evidence without existing target match, so scoring-only follow-up evidence.
- `ADAM2`: table/noise-heavy control, no report-scale repeated header/footer evidence.
- Teams controls: short-guide/layout-control shape; existing MCID matches exist, but report-scale evidence does not.
- `pdfaf_fixture_accessible`: no reading/heading score debt.

## Decision

This diagnostic supports planning a separate, narrow behavior stage for report-layout heading recovery. It does not itself accept a behavior change.

The next behavior plan should be limited to existing heading/reading repair tools and should require the same structural predicate, targeted positive validation, nearby controls, original-50 deterministic validation, and `false_positive_applied=0`. Do not use row IDs, filenames, source paths, corpus membership, or ODL runtime calls in production behavior.
