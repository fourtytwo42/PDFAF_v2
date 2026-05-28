# Repeated-Template Table Finalization Route

Date: 2026-05-28

## Decision

Accept a narrow Stage 180 repeated-template table finalization route for high-volume public PREA-style table templates.

This is a native PDFAF remediation change. It does not change scoring, PAC acceptance gates, checker visibility, semantic/LLM behavior, Docker/API wiring, ODL/PAC/POC runtime calls, or any filename/source/corpus-specific gate.

The route is intentionally narrow. It only runs when native analysis shows:

- low `table_markup` and substantial PAC-style table/header debt;
- stable non-table scores (`alt_text`, `reading_order`, `link_quality`, bounded heading debt);
- no annotation debt and no direct/misplaced table-cell shape debt;
- many real root-reachable `/Table` objects;
- one large repeated structural table-template cluster;
- high irregular/strongly-irregular table counts and high data-cell-without-header debt.

The routed transaction reuses existing Python table primitives in one bounded same-session batch:

1. short-header-row template normalization;
2. strongly-irregular row normalization;
3. single-column variance cleanup;
4. empty table-shell cleanup;
5. all-table header association, including header-only tables;
6. empty-corner header-cell cleanup;
7. final all-table header association.

The existing guarded post-pass still decides acceptance. A route that causes PAC regressions, no useful score movement, or false-positive-applied evidence is rejected.

## WV DCR PREA Proof

Public source: `https://dcr.wv.gov/resources/Pages/prea.aspx`

Local proof pack before cleanup:

- `/mnt/pdf-review/pdfaf-wv-repeated-template-route-proof-2026-05-28-r1`

Validation mode:

- Node 22
- `scripts/bounded-holdout-validation.ts`
- deterministic `--no-semantic --no-pdfs`
- child timeout `300000ms`
- external grace `10000ms`

Result:

- Completed: `20/20`
- Mean: `56.10 -> 98.25`
- Grades after: `20 A`
- Repeated-template route rows: `14`
- `false_positive_applied`: `0`
- Timeout/error rows: `0`
- Runtime p50/p95/max: `37503ms / 43970ms / 45875ms`

Same-source high/control rows stayed A-range. The route did not fire on the clean high rows.

## Oklahoma DOC PREA Proof

Public source: `https://oklahoma.gov/doc/prison-rape-elimination-act.html`

Local proof pack before cleanup:

- `/mnt/pdf-review/pdfaf-okdoc-prea-repeated-template-route-proof-2026-05-28-r1`

The downloaded set contained one small definitions PDF plus nineteen public audit PDFs under 10 MB.

Validation mode:

- Node 22
- `scripts/bounded-holdout-validation.ts`
- deterministic `--no-semantic --no-pdfs`
- child timeout `300000ms`
- external grace `10000ms`

Result:

- Completed: `20/20`
- Mean: `65.95 -> 99.50`
- Grades after: `20 A`
- Repeated-template route rows: `18`
- `false_positive_applied`: `0`
- Timeout/error rows: `0`
- Runtime p50/p95/max: `36112ms / 41713ms / 42041ms`

This gives an independent public-source proof that the predicate is structural and not West Virginia specific.

## Original-50 Regression Gate

Input was the current `Input/experiment-corpus` 50-PDF corpus, flattened through a temporary symlink view.

Local validation:

- `/mnt/pdf-review/pdfaf-validation/original50-repeated-template-route-2026-05-28-r1`

Result:

- Completed: `50/50`
- Mean: `94.32`
- Median: `95`
- Grades after: `46 A / 2 B / 1 C / 1 D`
- `false_positive_applied`: `0`
- Timeout/error rows: `0`
- Runtime p50/p95/max: `13833ms / 142165ms / 280625ms`
- Repeated-template route rows: `0`

The stated original-50 floor was mean `94.24`, median `95`, `false_positive_applied=0`, and no hard timeouts. This route passes that floor. The residual low rows were known non-route/route-volatility rows: `3775`, `4076`, `4438`, `4516`, and `4683`.

## Scope

This accepts the high-volume repeated `/Table` template subtype as a real table-heavy outside-source improvement. It does not close the broader table-heavy goal by itself.

Still-open table-heavy families include:

- Montana Courts case-processing tables;
- U.S. Courts Judicial Business low rows;
- Public Safety Canada corrections statistical publications;
- table side-effect families where final PAC table/header debt or non-table PAC side effects still block acceptance.

Those lanes need separate diagnostics and controls. Do not broaden this route to layout-only evidence, low-volume table debt, filename/source gates, or rows where non-table PAC side effects dominate.

## Cleanup

Public PDFs and generated WV/Oklahoma proof-pack artifacts were removed after extracting the metrics above. Original-50 validation artifacts remain local only and are not source assets.

## Verification

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/remediation/stage180MixedTablePdfua.test.ts`
- `npx -y node@22 /usr/bin/pnpm exec tsc --noEmit --pretty false`
- `npx -y node@22 /usr/bin/pnpm run lint`
- WV DCR PREA 20-row deterministic validation
- Oklahoma DOC PREA 20-row deterministic validation
- Original-50 deterministic validation
