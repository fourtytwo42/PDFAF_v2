# Annotation/Form PAC Parity Diagnostic - 2026-05-21

## Decision

Decision: `plan_annotation_form_behavior_stage`.

No scoring, PAC gate, remediation, planner, Docker/API, or benchmark behavior changed. This is a native diagnostic checkpoint only.

The diagnostic separates PAC/POC-style annotation and form failures into object-backed repair candidates, score-active residue, widget/Form evidence gaps, and controls.

## Source Change

- `scripts/annotation-form-parity-diagnostic.ts`
- `tests/scripts/annotationFormParityDiagnostic.test.ts`

The script runs native `analyzePdf`, builds PDFAF PAC rule evidence, and writes JSON/Markdown under `/mnt/pdf-review`. It does not call PAC, POC, ODL, Java, remediation, or PDF mutation paths.

## Local Diagnostic

Local artifact:

- `/mnt/pdf-review/pdfaf-annotation-form-diagnostics/annotation-form-parity-2026-05-21-r1`

Sample:

- `16` PDFs: form-focused PDFs, table/link/annotation-heavy outside and edge-mix rows, plus ADAM/Teams/accessible controls.

Result:

- Decision: `plan_annotation_form_behavior_stage`
- `behavior_focus=9`
- `behavior_controls=0`
- `widget_focus=0`
- `widget_controls=0`
- `analysis_errors=0`

Classification distribution:

- `form_tooltip_repair_candidate`: `2`
- `annotation_tab_order_candidate`: `5`
- `link_annotation_repair_candidate`: `2`
- `annotation_form_score_active_only`: `1`
- `no_annotation_form_debt`: `6`

## Supported Sublanes

### Form tooltip repair

Rows:

- `4660-Civil Rights Discrimination Complaint Form`
- `4661-limited-release-of-information-form`

Evidence:

- Missing form alternate names/tooltips are native-visible.
- `form_accessibility` is below A-grade range.
- Existing tool family: `fill_form_field_tooltips`.

Caution:

- Both rows also have substantial annotation/PAC debt outside form tooltips, so a behavior proof must verify final PAC/category improvement rather than only confirming a tooltip write.

### Annotation tab-order repair

Rows:

- `4761`
- `4637`
- `4655`
- `4673`
- `4674`

Evidence:

- Native `/Tabs /S` or annotation-order debt is visible.
- `reading_order` is low enough for the debt to matter.
- Existing tool family: `normalize_annotation_tab_order`.

### Link annotation ownership repair

Rows:

- `4716`
- `4740`

Evidence:

- Native link annotation structure or `/StructParent` debt is visible.
- `link_quality` is below A-grade range.
- Existing tool families may include `tag_unowned_annotations`, `repair_native_link_structure`, `set_link_annotation_contents`, and `normalize_annotation_tab_order`.

Caution:

- Some low-link rows are structure-poor and need targeted proof that the existing tools resolve stable object targets rather than creating route volatility.

## Controls

No control row was classified as a behavior candidate.

- `ADAM2`: `no_annotation_form_debt`
- `Microsoft_Teams_Quickstart (1)`: `no_annotation_form_debt`
- `Microsoft_Teams_Quickstart (1)-remediated`: `annotation_form_score_active_only`
- `pdfaf_fixture_accessible`: `no_annotation_form_debt`

The Teams remediated control still has a parent-tree object-reference PAC failure, but it is not a new behavior candidate from this diagnostic.

## Next Step

Run a targeted behavior proof before changing source behavior:

- Start with the form-tooltip sublane if the goal is the narrowest object-backed proof.
- Run `4660` and `4661` as positives plus ADAM, Teams, and `pdfaf_fixture_accessible` controls.
- Verify `false_positive_applied=0`.
- Accept only if final `form_accessibility` or PAC `pdfua.form.tu_present` debt improves without regressions.

If form tooltip repair is already scheduled and accepted by current production behavior, document it as existing aligned behavior and move next to annotation tab-order or link annotation ownership.
