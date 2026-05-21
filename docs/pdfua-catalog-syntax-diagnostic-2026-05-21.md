# PDF/UA Catalog/Syntax Diagnostic - 2026-05-21

## Decision

Decision: `keep_pdfua_catalog_syntax_diagnostic_only`.

No scoring, PAC gate, remediation, planner, Docker/API, or benchmark behavior changed. This is a native diagnostic checkpoint only.

The diagnostic checks whether native PDFAF PDF/UA catalog and syntax evidence can safely promote:

- existing `normalize_pdfua_catalog_settings` behavior for `/MarkInfo /Suspects` or `/ViewerPreferences /DisplayDocTitle`;
- stricter native RoleMap scoring;
- optional-content, embedded file-spec, or dynamic XFA evidence hardening.

## Source Change

- `scripts/pdfua-catalog-syntax-diagnostic.ts`
- `tests/scripts/pdfuaCatalogSyntaxDiagnostic.test.ts`

The script runs native `analyzePdf`, builds native PAC rule evidence, and writes local JSON/Markdown under `/mnt/pdf-review`. It does not call PAC, POC, ODL, Java, remediation, PDF mutation, or production scoring/planner paths.

## Local Diagnostic

Local artifact:

- `/mnt/pdf-review/pdfaf-catalog-syntax-diagnostics/pdfua-catalog-syntax-2026-05-21-r2`

Sample:

- `11` focus PDFs selected from available ICJIA/catalog, font, figure, form, and long-report risk rows.
- `5` controls: ADAM, three Teams variants, and `pdfaf_fixture_accessible`.

Result:

- Decision: `keep_pdfua_catalog_syntax_diagnostic_only`
- `catalog_focus=5`
- `catalog_controls=1`
- `rolemap_focus=0`
- `rolemap_controls=2`
- `optional_focus=1`
- `optional_controls=0`
- `analysis_errors=0`

Classification distribution:

- `catalog_baseline_score_active`: `6`
- `catalog_settings_behavior_candidate`: `6`
- `optional_catalog_diagnostic_gap`: `1`
- `structure_rolemap_scoring_gap`: `2`
- `catalog_syntax_noise_or_control`: `1`

## Key Evidence

Baseline catalog/PDF-UA debt is already score-active:

- missing PDF/UA identifier;
- missing document title;
- missing language;
- missing or false `/MarkInfo /Marked`;
- missing structure tree.

Fixable catalog settings are not safe to promote from this sample:

- `5` focus rows had fixable `/DisplayDocTitle` evidence.
- `ADAM2` also triggered the same candidate as a control.
- That makes the current predicate too broad for a behavior claim, even though the existing tool remains available under its normal gates.

RoleMap scoring is not safe to promote:

- `Microsoft_Teams_Quickstart (1)-remediated` and `Microsoft_Teams_Quickstart (1)-targeted-figures-wave1-b2` both triggered `pdfua.structure.rolemap_valid`.
- Because the RoleMap signal appears on protected controls, do not add a score cap or remediation behavior from this sample.

Optional-content evidence is not strong enough yet:

- Only `4754` triggered `pdfua.optional_content.config_valid`.
- One focus row is useful visibility, but not enough for scoring or repair promotion.

## Next Step

Park PDF/UA catalog/syntax promotion for now.

If revisited, use a narrower sample where focus rows have repeated catalog settings debt and controls do not trigger, or where RoleMap/optional-content debt is tied to a clear PAC/POC failure that is not present in protected controls.

The next stronger PAC/POC lane is artifacts/page-furniture safety, especially using native header/footer and artifact boundary evidence as admission safety rather than score masking.
