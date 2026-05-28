# Repeated Table Template Diagnostic

Date: 2026-05-28

## Decision

Diagnostic-only source change accepted. This does not change scoring, planner routing, remediation, PAC gates, Docker/API behavior, or benchmark behavior.

The new diagnostic identifies high-volume repeated `/Table` templates from native PDFAF analysis. It is intended to support a later behavior proof for WV-style outside PDFs where many real table refs share the same small row/cell template and current one-pass or broad transaction probes reduce some table debt but do not produce final score movement.

## Source Change

- `scripts/repeated-table-template-diagnostic.ts`
  - runs native `analyzePdf` only;
  - clusters real root-reachable `/Table` refs by row/cell template signature;
  - reports repeated table counts, estimated data-cell debt, row/cell patterns, PAC/table debt, and control triggers;
  - never remediates PDFs, writes remediated PDFs, calls ODL/PAC/POC, or uses semantic AI.
- `tests/benchmark/repeatedTableTemplateDiagnostic.test.ts`
  - covers template signatures, real `/Table` clustering, focus/control classification, analysis-error gating, and argument parsing.

## Local Evidence

Scratch proof pack: `/mnt/pdf-review/pdfaf-repeated-template-wv-2026-05-28-r1`

The pack rebuilt the same West Virginia DCR PREA public source used previously:

- Source page: `https://dcr.wv.gov/resources/Pages/prea.aspx`
- Sample: first `20` public PDF links under `10 MB`
- Same-source controls: `wvdcrprea-01`, `03`, `09`, `12`, `13`, and `17`
- Additional controls: original/control rows `4057`, `4438`, `fixture-accessible`, `ADAM2`, and `teams-original`

Diagnostic output before cleanup:

- `/mnt/pdf-review/pdfaf-repeated-template-wv-2026-05-28-r1/diagnostic-with-original-controls-r2/repeated-table-template-diagnostic.json`
- `/mnt/pdf-review/pdfaf-repeated-template-wv-2026-05-28-r1/diagnostic-with-original-controls-r2/repeated-table-template-diagnostic.md`

Summary:

- Rows analyzed: `25`
- Focus candidates: `14`
- Controls: `11`
- Analysis errors: `0`
- Repeated-template focus candidates: `14`
- Unsafe control candidates: `0`
- Decision: `plan_repeated_template_behavior_proof`

The repeated focus signature is strong and source-general at the structure level. Representative WV low rows have:

- `248-256` real root-reachable `/Table` refs;
- largest repeated group count `108-116`;
- largest repeated group debt `324-348`;
- common template `headers=yes:2`, `rows=2`, `dominant=2`, `cells=2-3`;
- table audit debt around `1322-1483` data cells without headers;
- `117-130` strongly irregular tables.

Controls did not match the predicate:

- `orig-4057`: real tables and table debt exist, but largest repeated group was only `3` with debt `48`.
- `orig-4438`: largest repeated group was `10`, but debt was only `20`, below the high-volume repeated-template threshold.
- `fixture-accessible`: only `2` real tables, A-grade overall, and no high-volume repeated pattern.
- ADAM2, Teams, and same-source table-clean controls had no real repeated table cluster.

## Interpretation

This confirms a different blocker than wrong-ref admission or simple strict transactions:

- The WV lows are not layout-only table evidence.
- The candidate refs are real root-reachable `/Table` objects.
- The dominant failure is high-volume repetition of small irregular table templates.
- Existing one-table or small-batch repair lanes are too narrow for this subtype.
- Prior local probes already showed that brute-force multi-pass normalization/header association can reduce raw table debt but still fails to move final score enough, so the next behavior proof needs a template-aware finalization strategy, not a wider fallback.

## Next Behavior Proof

A later behavior stage may be justified if it stays narrow:

- admit only low table score/PAC table-debt rows with many real root-reachable `/Table` refs sharing a repeated structural template;
- keep same-source and original controls below the trigger threshold;
- process a repeated template cluster in one bounded Python transaction instead of many JS/Python reopen cycles;
- preserve MCID/OBJR ownership and reject non-table PAC regressions;
- prove score and PAC/table-header improvement on WV plus at least one independent outside source before original-50 validation.

Do not use source names, filenames, row ids, URLs, hashes, or corpus membership in production behavior. Do not broaden layout-only table admission, add scorer caps, suppress PAC evidence, or call ODL/PAC/POC at runtime.

## Verification

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/benchmark/repeatedTableTemplateDiagnostic.test.ts`
- `npx -y node@22 /usr/bin/pnpm run lint`
- Local native diagnostic over WV plus controls, with no analysis errors and no unsafe controls.

Because this is diagnostic-only, no original-50 validation was required. The public PDFs and generated local artifacts were cleaned after extracting the metrics above.
