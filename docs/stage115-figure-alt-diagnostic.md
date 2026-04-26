# Stage 115 Figure/Alt Diagnostic

Date: 2026-04-26

Stage 115 stayed diagnostic-first. It does not keep a remediation behavior
change, scorer change, route guard, or gate semantic change.

## Decision

Rejected for implementation in this pass. The fresh figure/alt evidence found
one stable v1-edge residual, `v1-4145`, but a cap-only retag progression test
did not materially improve the row.

Do not spend another stage retrying the same third-retag/cap-only pattern unless
new evidence shows a different mechanism that can lift checker-visible figure
alt coverage into score movement without broadening figure routes.

## Evidence

Existing Stage 115 artifacts:

- `Output/experiment-corpus-baseline/run-stage115-legacy-figure-r1`
- `Output/from_sibling_pdfaf_v1_edge_mix/run-stage115-v1edge-figure-r1`
- `Output/from_sibling_pdfaf_v1_edge_mix/stage115-figure-alt-diagnostic-2026-04-26-r1`

Legacy figure control:

- `figure-4184` remediated from `24/F` to `98/A`
- `alt_text` reached verified coverage
- false-positive applied stayed `0`
- no figure/alt residual remained

V1-edge residual:

- `v1-4145` remediated from `28/F` to `79/C`
- residual family remained `figure_alt_tail`
- `alt_text` stayed `20`
- false-positive applied stayed `0`
- the diagnostic classified the row as a stable role-map retag progression
  candidate with remaining safe role-map targets

Temporary cap-only test:

- source tested locally: allow a third successful `retag_as_figure` by raising
  only the successful-apply cap from two to three
- target artifact:
  `Output/from_sibling_pdfaf_v1_edge_mix/run-stage115-v1edge-third-retag-r1`
- result stayed `28/F -> 79/C`
- total tool attempts stayed `24`
- false-positive applied stayed `0`
- the tool timeline still ended with the same two `retag_as_figure` applications
  and did not produce material score or grade movement

The temporary source edit was reverted.

## Validation

- Checked for an existing local LLM/listener before benchmarks; an existing
  `llama-server` process was present.
- Ran the focused planner test selection for retag/figure-alt behavior.
- Ran a deterministic v1-edge target benchmark for `4145` with no PDF output.

## Next Work

Figure/alt remains a valid target family, but Stage 115 does not justify a
general behavior change. The next figure/alt pass needs fresh evidence for a
mechanism beyond cap-only retag progression, preferably on a stable
checker-visible residual that shows score movement, or it should pivot to a
different residual family.
