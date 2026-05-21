# PAC/POC Parity Gap Map Decision - 2026-05-21

## Scope

This is a diagnostic/planning checkpoint for the active goal to align PDFAF v2 more closely with `Research/POC-decompiled` and PAC/PDF-UA style detection. It adds a native PDFAF parity map generator, but it does not change scoring, remediation routing, mutation behavior, PAC gates, Docker/API behavior, or benchmark execution.

Local generated artifact:

- `Output/pac-poc-parity-gap-map-2026-05-21-r1/pac-poc-parity-gap-map.md`
- `Output/pac-poc-parity-gap-map-2026-05-21-r1/pac-poc-parity-gap-map.json`

Those generated artifacts stay local and are not source-tracked.

## What Was Mapped

The map groups POC/PAC-style checks into native PDFAF lanes and classifies each lane by current score-active rules, remediation acceptance gates, diagnostic-only evidence, and next action.

Covered families:

- ParentTree and structure syntax.
- Content tagging and content-stream artifact boundaries.
- Table headers, table regularity, and header association.
- Heading structure and reading order.
- Figures, formula alt, BBox, generated-alt quality, and caption evidence.
- Lists, TOC, and Note structure.
- Annotations, links, widgets, forms, and tab order.
- Fonts, CMap, Unicode mappability, and replacement-character evidence.
- Artifacts, repeated headers/footers, and page-furniture safety.
- Language metadata and language of parts.
- Optional catalog, filespec, XFA, and viewer setting checks.
- Rendered text contrast and optional link/AI diagnostics.

## Decision

Decision: `continue_with_prioritized_lane`.

Top behavior-ready lane: `table_header_transaction`.

Reasoning:

- The table lane already has native PAC-like table/header rules that are score-active and gate-active.
- The 2026-05-21 table-undersegmentation transaction diagnostic found `4` outside focus rows classified as `transaction_ready_dense_table`.
- The same diagnostic rejected `ADAM2`, three Teams controls, and `pdfaf_fixture_accessible` as `layout_table_control_noise`.
- Unsafe control candidates were `0`, so a narrow behavior proof is justified.

The next behavior proof should be limited to existing table tools:

- `normalize_table_structure`
- `set_table_header_cells`
- existing bounded table/header sequencing

No new scorer caps, PAC exceptions, ODL/PAC/POC runtime calls, or PDF-specific production gates are justified by this checkpoint.

## High-Impact Gaps

### Behavior-ready

`table_header_transaction`

- Gap type: remediation gap.
- POC/PAC reference behavior: table regularity, complete tables, and header-cell assignment.
- Native state: table/header failures are already visible in PDFAF scoring and gates.
- Next action: implement a narrow dense-table transaction behavior proof with controls and final PAC/table debt checks.

### Evidence/scoring hardening needed

`font_cmap_scoring_hardening`

- Gap type: detection/scoring gap.
- POC/PAC reference behavior: Unicode mappability, CMap validity, CID/GID mapping, WMode consistency.
- Native state: replacement-character scoring exists; most direct CMap/font syntax rules remain diagnostic because broad caps were previously noisy.
- Next action: build a focused diagnostic separating true text extraction debt from harmless syntax debt before any score-active cap.

`content_event_tagging_fidelity`

- Gap type: detection/gate gap.
- POC/PAC reference behavior: content operators must be tagged or artifacted, and artifact/tag nesting must be valid.
- Native state: core content-stream rules are partly score-active, while XObject and bounds evidence still need confidence separation.
- Next action: harden verified full-stream evidence separately from sampled/heuristic evidence.

`rendered_contrast_opt_in`

- Gap type: detection/scoring gap.
- POC/PAC reference behavior: rendered text contrast measurement.
- Native state: PDFAF currently treats contrast as manual-review/not measured in default scoring.
- Next action: add only an opt-in rendered-contrast diagnostic until speed and confidence are proven.

`artifacts_page_furniture_safety`

- Gap type: detection/remediation safety gap.
- POC/PAC reference behavior: content must not be incorrectly nested between artifacts and tagged content.
- Native state: verified artifact boundary evidence is score-active; layout header/footer evidence is diagnostic-only.
- Next action: use page-furniture evidence to reject unsafe heading/caption/table promotion, not to suppress checker-visible failures.

### Parked or monitor-only

`heading_reading_order_geometry`

- Status: parked for broad remediation.
- Reason: discriminator evidence became selective, but the heading mutator primarily proved strict-target safety/no-effect rather than repeatable score-moving repair.

`parent_tree_structure_syntax_monitor`

- Status: mostly aligned, monitor for target selection.
- Reason: many ParentTree and structure syntax leaves are score-active; remaining work is object-backed remediation, not basic detection parity.

`lists_toc_notes_structure`, `optional_catalog_filespec_xfa`, and `link_reachability_ai_visual_tagging`

- Status: monitor or optional diagnostic.
- Reason: not currently the best score/repair lane, and some checks require opt-in network/semantic/manual-review behavior.

## Guardrails

- Production behavior must remain native PDFAF logic.
- Do not call `Research/POC-decompiled`, PAC, ODL, Java, network link checks, or AI diagnostics from default analyze/remediate/benchmark paths.
- Do not gate behavior on filenames, row IDs, sources, corpus paths, hashes, or known benchmark membership.
- Do not hide PAC-visible failures or use header/footer filtering to raise scores.
- Any promoted behavior still requires targeted positives, nearby controls, `false_positive_applied=0`, original-50 deterministic validation, and bounded runtime.

## Immediate Next Step

Implement the `table_header_transaction` behavior proof as a separate stage. If that proof fails controls or does not reduce final table/PAC debt, park the table lane and move to the next scoring/evidence lane, starting with `font_cmap_scoring_hardening`.
