# Figure-4702 Structure-Annotation Sequence Validation

Generated: 2026-05-08

## Decision

Keep the narrow `figure-4702` structure-then-annotation sequencing probe, but do not run or accept a fixed-50 checkpoint from this validation yet.

The target recovery worked: `figure-4702` moved from `37/F` to `91/A` with `structure_annotation_sequence_recovered` and `false_positive_applied = 0`. The fixed-50 run is deferred because the targeted control set was not clean: `structure-3775` repeated known route volatility at `79/C`, and `long-4516` landed at `84/B`.

## Validation Artifacts

Targeted run:

`Output/experiment-corpus-baseline/run-figure4702-sequence-target-2026-05-08-r1`

Follow-up diagnostic:

`Output/experiment-corpus-baseline/figure4702-sequence-target-diagnostic-2026-05-08-r1`

## Results

- `figure-4702`: `91/A`
- `false_positive_applied`: `0`
- `structure-4438`: parked hard timeout remains
- `long-4700`: `78/C`, table batch behavior preserved
- `font-4699`: `91/A`
- `fixture-accessible`: `96/A`
- `fixture-inaccessible`: `95/A`
- `figure-4753`: `97/A`
- `figure-4754`: `78/C`
- `structure-3775`: `79/C`, route-volatility control miss
- `font-4035`: `94/A`
- `long-4516`: `84/B`, runtime/route repeatability miss
- `long-4683`: `96/A`

The sequence accepted only the combined state after link/annotation cleanup. The intermediate structure state was not accepted by itself.

## Follow-Up

Do not run fixed-50 from this targeted result. The next stage should either:

- repeat the targeted controls to determine whether `structure-3775` and `long-4516` misses are ordinary route volatility, or
- explicitly park those control rows for this probe and run a fixed-50 validation with the parked-debt policy stated up front.
