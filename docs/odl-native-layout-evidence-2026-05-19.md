# ODL-Inspired Native Layout Evidence

Status: implemented as diagnostic-only native evidence. OpenDataLoader remains an optional sidecar oracle and is not called by normal API, Docker, analyzer, scorer, remediation, or benchmark paths.

## Implementation

- `pdfjsWorker` now builds a bounded native `layoutAudit` from the same sampled pdf.js text items already used for text extraction.
- The audit records sampled text-run geometry, repeated header/footer bands, caption-like lines, multi-column/interleaved order risk, heading-like layout lines, and dense row-band table candidates.
- `DocumentSnapshot` carries the audit as diagnostic evidence. `DetectionProfile` exposes optional derived counts for reading order, headings, figures/captions, and layout-table candidates.
- `scripts/opendataloader-sidecar-diagnostic.ts` now compares ODL JSON against both current PDFAF structure and native layout evidence, with suggested actions:
  - `reading_order_calibration_candidate`
  - `table_undersegmentation_candidate`
  - `figure_caption_candidate`
  - `header_footer_noise_candidate`
  - `no_action`

No score caps, planner routes, mutation behavior, PAC gates, or remediation acceptance rules changed.

## Evidence

ODL sidecar sample:

```text
/mnt/pdf-review/pdfaf-odl-diagnostics/odl-native-layout-evidence-15pdf-2026-05-19-r5
```

Result:

- `15/15` OpenDataLoader rows completed with status `ok`.
- Outside Virginia sample: `10` PDFs, current PDFAF mean about `45.00`.
- Original controls: `5` PDFs, current PDFAF mean about `65.60`.
- Supported lanes: `10` reading-order calibration candidates, `4` table-undersegmentation candidates, `1` no-action control.
- The A-grade accessible fixture remains `no_action` even though both ODL and native layout see table-like evidence. This is the required control warning: table layout evidence alone is not safe for scoring or repair admission.
- Figure/caption evidence appeared only as isolated caption candidates in this sample; no figure-caption pairing lane is supported yet.

Original-50 deterministic validation:

```text
/mnt/pdf-review/pdfaf-validation/original50-native-layout-audit-2026-05-19-r1
```

Result:

- `50` rows processed by the batch.
- `48/50` completed without row error.
- Successful-row mean from `summary.meanAfter`: `94.9792`.
- All-row mean counting timeout rows as `0`: `91.18`.
- All-row median: `96`.
- `false_positive_applied`: `0`.
- Hard timeouts: `4438` and `4516`.
- p95/max row duration: about `231.6s / 300.0s`.

The original-50 run remains runtime-sensitive, but the diagnostic fields did not introduce scorer/remediation behavior changes.

## Decision

Keep this stage diagnostic-only. The next safe behavior stage should be reading/order calibration first, but only after a tighter native predicate proves that low reading/heading scores align with ODL evidence and at least one similar original-control shape stays stable.

Table undersegmentation remains second priority because the accessible fixture proves table-like layout evidence can occur on a high-quality control. Any table behavior must require below-A score, native row-band evidence, ODL/PAC alignment, and control stability.
