# Artifacts/Page-Furniture Diagnostic - 2026-05-21

## Decision

Decision: `keep_artifact_page_furniture_diagnostic_only`.

No scoring, PAC gate, remediation, planner, Docker/API, or benchmark behavior changed. This is a native diagnostic checkpoint only.

The diagnostic separates two PAC/POC-aligned concepts:

- verified content/artifact boundary failures, which should stay visible and score-active;
- repeated header/footer page-furniture evidence, which may be useful only as safety evidence for future heading/caption/table admission.

## Source Change

- `scripts/artifacts-page-furniture-diagnostic.ts`
- `tests/scripts/artifactsPageFurnitureDiagnostic.test.ts`

The script runs native `analyzePdf`, builds native PAC rule evidence, and writes local JSON/Markdown under `/mnt/pdf-review`. It does not call PAC, POC, ODL, Java, remediation, PDF mutation, or production scoring/planner paths.

## Local Diagnostic

Local artifact:

- `/mnt/pdf-review/pdfaf-artifact-page-furniture-diagnostics/artifacts-page-furniture-2026-05-21-r3`

Sample:

- `15` focus PDFs from the Virginia report-layout rows plus original long/report and figure/content rows.
- `5` controls: ADAM, three Teams variants, and `pdfaf_fixture_accessible`.

Result:

- Decision: `keep_artifact_page_furniture_diagnostic_only`
- `safety_focus=10`
- `safety_controls=3`
- `boundary_score_active=0`
- `content_score_active=14`
- `analysis_errors=0`

Classification distribution:

- `content_tagging_score_active`: `14`
- `page_furniture_safety_candidate`: `4`
- `page_furniture_noise_or_control`: `2`

## Key Evidence

Direct content-tagging debt is already visible and score-active:

- most Virginia report-layout rows have `pdfua.content.*` failures;
- original report rows such as `4606`, `4608`, and `4754` also show content-tagging debt;
- protected controls also have visible content-tagging residue, including Teams rows and `pdfaf_fixture_accessible`.

Repeated header/footer evidence is not safe to promote as a new behavior predicate:

- `10` focus rows have the page-furniture safety shape;
- `3` Teams controls also have the same safety shape once controls are counted by features, even when the row is classified as score-active content debt;
- therefore a generic header/footer predicate would be too broad as an admission or suppression rule.

This does not invalidate the evidence. It means the evidence should be used only as local safety context when a separate, object-backed heading/caption/table predicate is already justified.

## Next Step

Park artifacts/page-furniture promotion.

Do not use repeated header/footer evidence to hide checker-visible failures or raise scores. If this lane is revisited, use it only to reject unsafe promotion of layout headings, captions, or table candidates, and require the primary behavior predicate to come from object-backed structure/PAC evidence.

With content, annotations/forms, figures/BBox, lists/TOC/Note, PDF/UA catalog/syntax, and page-furniture diagnostics complete, the next high-impact work should return to a behavior lane with known broad payoff, especially real table/header transaction design or deep native-tagged marked-content shell recovery.
