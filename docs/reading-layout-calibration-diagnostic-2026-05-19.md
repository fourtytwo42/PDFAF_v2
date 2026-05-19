# Reading Layout Calibration Diagnostic

Status: implemented as diagnostic-only. This stage adds a native PDFAF reading/heading calibration diagnostic and does not change scoring, planner routing, remediation, mutation behavior, PAC gates, API behavior, Docker behavior, or benchmark behavior.

## Implementation

- Added `scripts/reading-layout-calibration-diagnostic.ts`.
- The script consumes an existing ODL sidecar `comparison-report.json`; when `--sidecar` is omitted it selects the latest local report under `/mnt/pdf-review/pdfaf-odl-diagnostics`.
- It re-runs native PDFAF analysis with `bypassCache: true` and never calls OpenDataLoader.
- It selects rows with `reading_order_calibration_candidate` plus original-corpus controls, then classifies each row as:
  - `behavior_ready_existing_target`
  - `scoring_only_order_risk`
  - `heading_candidate_too_broad`
  - `header_footer_or_table_noise`
  - `control_not_safe`
  - `no_native_support`
- Candidate evidence includes native layout heading samples, excluded caption/header-footer/table noise samples, geometry/order counts, and whether any layout heading candidate matches an existing safe target family: paragraph structure element, MCID text span, native title BT geometry, or existing visible-heading anchor.

## Evidence

Diagnostic run:

```text
/mnt/pdf-review/pdfaf-odl-diagnostics/reading-layout-calibration-2026-05-19-r1
```

Input sidecar:

```text
/mnt/pdf-review/pdfaf-odl-diagnostics/odl-native-layout-evidence-15pdf-2026-05-19-r5/comparison-report.json
```

Result:

- Rows analyzed: `11`.
- Distribution: `4 behavior_ready_existing_target`, `1 scoring_only_order_risk`, `1 heading_candidate_too_broad`, `4 control_not_safe`, `1 no_native_support`.
- Decision: `reject_reading_heading_lane_controls_trigger`.
- Positive outside rows with existing targets: `va-02`, `va-04`, `va-05`, `va-07`.
- Unsafe original-control triggers: `ADAM2`, `Microsoft_Teams_Quickstart (1)-remediated`, `Microsoft_Teams_Quickstart (1)-targeted-figures-wave1-b2`, and `Microsoft_Teams_Quickstart (1)`.
- Clean high-grade control: `pdfaf_fixture_accessible` stayed `no_native_support` because reading and heading scores had no current debt.

## Decision

Do not promote the current native reading/heading predicate into scoring or remediation. The signal is real on several outside rows, but it is too broad because multiple original controls would also trigger it.

The next safe branch is either:

- refine the predicate around a narrower target shape that excludes the Teams/ADAM control triggers before any behavior change; or
- move to the table-undersegmentation diagnostic lane with stricter table/PAC/control gates.

Generated JSON and Markdown reports remain local under `/mnt/pdf-review` and are not source artifacts.
