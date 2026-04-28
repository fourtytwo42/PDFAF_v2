# Stage 148 Native Reading-Order Tail

Stage 148 is diagnostic-only. It investigated the active low-grade tail rows with
`reading_order` around `35-45` and found no safe native reading-order mutator path to
keep.

## Evidence

- Diagnostic script: `scripts/stage148-native-reading-order-diagnostic.ts`
- Reference run: `Output/stage145-low-grade-tail/run-stage147-active-tail-2026-04-28-r1`
- Focused written-PDF target: `Output/stage145-low-grade-tail/run-stage148-target-reading-order-native-2026-04-28-r1`
- Final diagnostic: `Output/stage145-low-grade-tail/stage148-native-reading-order-diagnostic-target-2026-04-28-r2`

## Classification

- `analyzer_volatility`: `orig-structure-4076`, `v1-v1-4139`, `v1-v1-4171`
- `table_or_form_blocked_reading_order`: `v1-v1-4519`, `v1-v1-4164`
- `no_safe_candidate`: `v1-v1-4078`, `v1-v1-4184`, `v1-v1-4641`, `v1-v1-4635`

The apparent reading-order deficits on `4078` and `4184` are heading-reachability
caps: extracted headings are not reachable from the exported structure tree, so
`reading_order` is capped at `45`. Treat these as a heading-reachability project,
not a native reading-order rewrite. `4641` has a shallow/degenerate tree but lacks
enough content-backed paragraph/MCID evidence for a safe structure rewrite.

## Decision

Do not add `repair_native_reading_order` behavior from this evidence. The next
largest safe direction is a heading-reachability stage for partial-heading native
PDFs, with strict candidate filtering to avoid promoting arbitrary paragraph text.
