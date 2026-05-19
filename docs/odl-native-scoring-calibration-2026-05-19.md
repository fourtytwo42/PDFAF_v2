# ODL-Inspired Native Scoring Calibration

Status: implemented as native scoring evidence; OpenDataLoader remains diagnostic-only.

## Implementation

- `text_extractability` now uses native `fontSyntaxAudit.replacementCharacterRatio` evidence computed from existing pdf.js text.
- The category is capped only when extracted text has enough volume and replacement-character ratio crosses calibrated thresholds:
  - no effect below `0.01` or below `100` extracted characters
  - cap `90` at ratio `>= 0.01`
  - cap `70` at ratio `>= 0.05`
  - cap `40` at ratio `>= 0.20`, or when high-replacement pages are at least `25%` of pages
- PAC-style `pdfua.content.characters_unicode_mappable` evidence now reports replacement-character debt as a heuristic failure.
- The OpenDataLoader sidecar report now includes scoring-calibration summaries and suggested actions:
  - `text_extractability_penalty`
  - `reading_order_diagnostic_only`
  - `table_diagnostic_only`
  - `no_action`

Normal API, Docker, analyzer, remediation, scorer, and benchmark paths do not call OpenDataLoader.

## Validation

Focused tests:

```bash
npx -y node@22 /usr/bin/pnpm exec vitest run \
  tests/scorer.test.ts \
  tests/services/pacRuleEvidence.test.ts \
  tests/scripts/opendataloaderSidecarDiagnostic.test.ts \
  tests/services/pdfAnalyzerReplacementAudit.test.ts
```

Result: passed, `126` tests.

Type check:

```bash
npx -y node@22 /usr/bin/pnpm run lint
```

Result: passed.

ODL sidecar sample:

```text
/mnt/pdf-review/pdfaf-odl-diagnostics/odl-scoring-calibration-15pdf-2026-05-19-r1
```

Result:

- `15/15` OpenDataLoader rows completed with status `ok`.
- Outside Virginia sample: `10` PDFs, current PDFAF mean `45.30`.
- Original controls: `5` PDFs, current PDFAF mean `66.00`.
- Suggested scoring actions: `9` reading-order diagnostic-only, `5` table diagnostic-only, `1` no action.
- `0` rows triggered `text_extractability_penalty`; replacement-character ratios were `0.0000` across the sample.

Original 50 deterministic validation:

```text
/mnt/pdf-review/pdfaf-validation/original50-odl-text-risk-2026-05-19-r1
```

Result:

- `50` rows processed by the batch.
- `48/50` completed without row error.
- Successful-row mean from `summary.meanAfter`: `94.6667`.
- All-row mean counting timeout rows as `0`: `90.88`.
- All-row median: `95`.
- `false_positive_applied`: `0`.
- Hard timeouts: `34-4438...` and `49-4683...`.
- No `U+FFFD`/replacement-character scoring findings appeared in the original-50 report, so this scoring cap did not change the original-50 result.

## Decision

The native text-extractability scoring calibration is source-accepted as a passive accuracy improvement. The sidecar evidence did not support a reading-order or table scoring change in this pass, so those lanes remain diagnostic-only.
