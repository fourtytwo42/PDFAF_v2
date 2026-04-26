# Stage 80 / Stage 78 Acceptance Note

Stage 78 is the current best Engine v2 checkpoint pending a dedicated analyzer determinism fix.

## Decision

Use Stage 78 as the documented acceptance checkpoint with residual protected analyzer debt. Do not keep or reintroduce the Stage 78B behavioral guard.

## Evidence

- Stage 78 passes the runtime p95 gate, keeps false-positive applied at `0`, improves the F count, and preserves the Stage 75 local font gains.
- Stage 78 fails only `protected_file_regressions` in `Output/experiment-corpus-baseline/stage78-benchmark-gate-2026-04-25-r1`.
- Stage 78B worsened the gate: protected regressions increased and `runtime_p95_wall` failed in `Output/experiment-corpus-baseline/stage78b-benchmark-gate-2026-04-25-r1`.
- Stage 79 same-buffer diagnostics classify the remaining focus rows as Python structural analyzer variance:
  - `structure-4076`
  - `fixture-teams-remediated`
  - `long-4683`
  - `long-4470`

## Next Stage

Stage 80 should target Python structural extraction determinism directly. It should compare repeated raw `python/pdf_analysis_helper.py` output for identical final PDF bytes before TypeScript scoring and only fix deterministic analyzer bugs proven by that raw evidence.

## Stage 80 Diagnostic Outcome

The raw Python diagnostic confirms that Stage 79's same-buffer instability starts inside `python/pdf_analysis_helper.py`, before TypeScript scoring. A narrow stable-identity traversal experiment was tested locally and rejected: it stabilized the raw output, but target validation lost Stage 78 wins on `long-4683` and reduced the `font-4172` control from A to B. That behavior is not kept.

## Guardrails

- No new remediation route guards.
- No font gate changes.
- No scorer or Stage 41 gate semantic changes.
- No filename-specific skips.
- No benchmark-only score inflation.
- Do not stabilize analysis by dropping valid structural evidence.
