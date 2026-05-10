# All-Input API Semantic Validation

Generated on 2026-05-10 for the active all-input mean goal.

## Scope

This is planning/validation evidence only. It uses the running local Docker API on
`http://127.0.0.1:6200`, which already has an embedded LLM configured and reachable.
The host `127.0.0.1:1234` llama endpoint is not exposed, so direct source semantic
batching was not used.

Resource policy:

- API semantic requests were run sequentially to avoid concurrent multimodal LLM load.
- Response JSON was saved with `remediatedPdfBase64` removed.
- Generated PDFs and matrices remain under `Output/` and are not committed.

## Heading Semantic Overlay

Generated artifacts:

- API source-side overlay input: `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-heading-remaining-source-overlay-2026-05-10-r1/`
- Progress overlay: `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-0297-plus-api-semantic-heading-2026-05-10-r1/`

The saved API semantic heading PDFs were reanalyzed by the current source scorer before
overlaying. Useful rows:

- `0114`: source reanalysis `91/A`, useful because source deterministic validation had not recovered it.
- `0108`: source reanalysis `91/A`, improving over the accepted deterministic `79/C` path.
- `0297` and `0317` matched existing accepted overlay scores rather than adding new movement.
- `0034`, `0085`, `0283`, and `0319` did not add accepted overlay movement; `0085` and `0319`
  were skipped by overlay because they were below the current accepted score for those rows.

Overlay result after accepted deterministic rows plus this heading semantic evidence:

- Mean: `88.5214 -> 90.0741`
- Rows below target: `136 -> 125`
- Points still needed for mean `93`: `1027`

## Alt Semantic Overlay

Generated artifacts:

- API semantic alt run: `Output/goal-all-input-mean-2026-05-09-r1/api-semantic-alt-focused-2026-05-10-r1/`
- Progress overlay with heading plus alt evidence: `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-0297-plus-api-semantic-heading-alt-2026-05-10-r1/`

The API semantic alt run processed the eight deterministic alt-lane rows one at a time.
The remediated PDFs were then reanalyzed by the current source scorer:

| Row | API result | Source reanalysis | Decision |
| --- | ---: | ---: | --- |
| `0119` | `97/A` | `91/A` | useful semantic-alt lift |
| `0200` | `97/A` | `91/A` | useful semantic-alt lift |
| `0184` | `98/A` | `86/B` | useful but below target |
| `0084` | `76/C` | `59/F` | no accepted source-score movement beyond baseline |
| `0207` / `4213` | `59/F` | `59/F` | expensive no-movement semantic debt; request took about `204s` |
| `0306` | `59/F` | `59/F` | no movement |
| `0318` | `57/F` | `55/F` | skipped by overlay due source-score drop |
| `0347` | `58/F` | `58/F` | small movement only |

Overlay result after accepted deterministic rows plus heading and alt semantic evidence:

- Mean: `88.5214 -> 90.3533`
- Rows below target: `136 -> 125`
- Points still needed for mean `93`: `929`

## Decision

Semantic validation is worth pursuing, but it is not enough by itself to reach the
`93` mean target from the current accepted overlay. The strongest source-scored semantic
gains are `0114`, `0108`, `0119`, `0200`, and `0184`.

Do not treat the API semantic scores as acceptance scores without source reanalysis.
The API and source scorer differ materially on some rows, especially `0084` and `0184`.

Next checkpoints should be:

1. Keep semantic rows as opt-in planning candidates until they are validated through the
   source path or production API path with current images.
2. Avoid broad semantic batches with parallel LLM calls; keep multimodal concurrency at
   one unless VM capacity is explicitly proven.
3. Look for the next high-yield deterministic/semantic lane among remaining
   `heading_reading_order` and `table_debt` rows. The current overlay still needs
   `929` points, so the next stage must recover multiple rows or a high-deficit family.
