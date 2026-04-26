# Stage 84 Metadata Evidence Instrumentation

Stage 84 implements metadata-only raw analyzer instrumentation for table and
paragraph-like structure records. It does not add remediation behavior,
aggregation/filter policy, scorer changes, route guards, or gate changes.

## Decision

Keep the table/paragraph metadata fields, but do not implement deterministic
table/paragraph evidence aggregation yet.

## Evidence

- Stage 84 raw same-buffer diagnostic output is local at
  `Output/experiment-corpus-baseline/stage84-metadata-evidence-diagnostic-2026-04-26-r1`.
- The analyzer now emits explicit `reachable`, `directContent`,
  `subtreeMcidCount`, and `parentPath` on raw `tables[]` and
  `paragraphStructElems[]` records.
- The diagnostic confirms the new metadata is present on unstable
  table/paragraph groups for `structure-4076`, `long-4683`, `long-4470`,
  and paragraph groups on `fixture-teams-remediated` / `font-4699`.
- Intermittent table evidence still appears on `structure-4076`, `long-4683`,
  and `long-4470`, so Stage 83's checker-facing policy is still not safe to
  convert into aggregation or filtering behavior.

## Focused Validation

Focused deterministic target run:
`Output/experiment-corpus-baseline/run-stage84-target-metadata-2026-04-26-r1`

- `short-4214`: `64/D -> 98/A`, reanalyzed `98/A`
- `structure-4076`: `53/F -> 70/C`, reanalyzed `70/C`
- `font-4172`: `59/F -> 93/A`, reanalyzed `84/B`
- `long-4470`: `59/F -> 59/F`, reanalyzed `59/F`
- `long-4683`: `59/F -> 94/A`, reanalyzed `94/A`

The run was deterministic-only with `--no-semantic`; an existing
`llama-server` listener was present and no new local LLM was started.

## Next Work

Stage 85 should consume the new explicit metadata to design a narrow
checker-facing table/paragraph evidence classifier. It should first compare
explicitly reachable/content-bearing records against intermittent wrapper/path
artifacts before changing analyzer aggregation, remediation routing, scorer
logic, or Stage 41 gate semantics.
