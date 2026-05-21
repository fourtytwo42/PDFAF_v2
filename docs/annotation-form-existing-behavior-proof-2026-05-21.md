# Annotation/Form Existing Behavior Proof - 2026-05-21

## Decision

Decision: `existing_behavior_aligned_no_source_change`.

The annotation/form parity diagnostic found clean object-backed candidates. Targeted deterministic validation shows the current production engine already handles most of this lane with existing tools, so no new scorer, planner, or mutator behavior is justified from this proof.

No source behavior changed. No remediated PDFs were written.

## Runs

Form-focused proof:

- `/mnt/pdf-review/pdfaf-validation/annotation-form-tooltip-proof-2026-05-21-r1/run-r1/baseline_report.json`
- Command shape: targeted symlink corpus, `--no-semantic --no-pdfs`
- Rows: `6/6`
- Mean: `59.17 -> 96.67`
- `false_positive_applied=0`

Link/tab proof:

- `/mnt/pdf-review/pdfaf-validation/annotation-link-tab-proof-2026-05-21-r1/run-r1/baseline_report.json`
- Command shape: targeted symlink corpus, `--no-semantic --no-pdfs`
- Rows: `11/11`
- Mean: `50.82 -> 91.45`
- `false_positive_applied=0`

## Form Sublane

| Row | Before | After | Result |
| --- | ---: | ---: | --- |
| `form-4660` | `41/F` | `97/A` | Existing deterministic sequence succeeds |
| `form-4661` | `59/F` | `99/A` | Existing deterministic sequence succeeds |

Controls:

| Row | Before | After |
| --- | ---: | ---: |
| `control-accessible` | `96/A` | `96/A` |
| `control-adam2` | `34/F` | `94/A` |
| `control-teams-original` | `54/F` | `98/A` |
| `control-teams-remediated` | `71/C` | `96/A` |

Important interpretation:

- `fill_form_field_tooltips` applied on both form rows, but it did not produce the main score movement by itself.
- The successful behavior is a broader existing annotation/link/structure/figure sequence.
- Do not add a new form-tooltip-only behavior from this evidence.

## Link/Tab Sublane

| Row | Before | After | Result |
| --- | ---: | ---: | --- |
| `link-4716` | `35/F` | `93/A` | Existing sequence succeeds, still below target `95` |
| `link-4740` | `35/F` | `98/A` | Existing sequence succeeds |
| `tab-4637` | `46/F` | `94/A` | Existing sequence succeeds, still below target `95` |
| `tab-4655` | `46/F` | `94/A` | Existing sequence succeeds, still below target `95` |
| `tab-4673` | `42/F` | `94/A` | Existing sequence succeeds, still below target `95` |
| `tab-4674` | `54/F` | `54/F` | Annotation/link attempts correctly rejected for regression |
| `tab-4761` | `44/F` | `96/A` | Existing sequence succeeds |

Controls:

| Row | Before | After |
| --- | ---: | ---: |
| `control-accessible` | `96/A` | `96/A` |
| `control-adam2` | `34/F` | `94/A` |
| `control-teams-original` | `54/F` | `98/A` |
| `control-teams-remediated` | `73/C` | `95/A` |

## Accepted Interpretation

The current engine is already materially PAC-aligned for the annotation/form lane:

- Existing annotation/link/form tools handle the form rows.
- Existing annotation/link/tab-order tools handle most outside link/tab candidates.
- Controls do not show unsafe behavior.
- `false_positive_applied=0` in both targeted proofs.

Do not broaden annotation/form production behavior from this checkpoint. The only remaining annotation-form-specific row worth investigating is `tab-4674`, and even there the current engine appears to reject unsafe mutations rather than applying false positives.

## Next Step

Either:

- run a narrow `tab-4674` regression/no-safe-state diagnostic if annotation/form remains the priority; or
- move to another PAC/POC parity family with a larger unclosed gap, such as figure/caption/BBox, list structure, PDF/UA catalog/syntax, or artifacts/page-furniture safety.
