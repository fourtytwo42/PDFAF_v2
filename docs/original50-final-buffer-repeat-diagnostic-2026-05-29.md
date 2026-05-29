# Original-50 Final Buffer Repeat Diagnostic

Date: 2026-05-29

## Summary

This diagnostic isolates the newest original-50 blocker shape after strict target-ref table acceptance. It remediates selected original-50 rows once in memory, then repeatedly reanalyzes the same final buffer through temporary files that are deleted. It does not write remediated PDFs, call ODL/PAC/POC/Java, or use semantic/LLM behavior.

The key result is that `long-4516` is now a same-final-buffer analyzer volatility row. The remediated final buffer repeated as `89/B`, `89/B`, and `62/D` without changing the buffer. The repeated low run exposes the same structural signal expansion seen in earlier stable-key diagnostics: headings, figures, paragraph structure, and tables become visible to the analyzer only on some passes.

This is not a table behavior promotion yet. It means the next safe work is analyzer/structure extraction stability for final buffers, especially around Python structure traversal on `4516`.

## Local Report

Local artifact:

`/mnt/pdf-review/pdfaf-validation/original50-final-buffer-repeat-2026-05-29-r1/original50-final-buffer-repeat-diagnostic.md`

Rows:

- `long-4516`
- `long-4683`
- `long-4680`
- `figure-4754`
- `structure-4438`

Decision:

`diagnose_final_buffer_analyzer_variance`

Next lane:

`final_buffer_analyzer_or_serialization_boundary`

## Classification

| Row | After | Final-buffer repeats | Class | Interpretation |
| --- | ---: | --- | --- | --- |
| `long-4516` | `89/B` | `89/B`, `89/B`, `62/D` | `final_buffer_reanalysis_volatile` | Same final buffer produces materially different scores; this is analyzer repeat instability on the remediated buffer. |
| `long-4683` | `59/F` | `59/F`, `59/F`, `59/F` | `stable_low_after_and_final` | Stable low route in this sample; move to failure-shape diagnostic or park if no safe general fix exists. |
| `long-4680` | `59/F` | `59/F`, `59/F`, `59/F` | `stable_low_after_and_final` | Stable low route in this sample; route/failure-shape debt remains. |
| `figure-4754` | `59/F` | `59/F`, `59/F`, `59/F` | `stable_low_after_and_final` | Stable low route in this sample; no final-buffer score volatility. |
| `structure-4438` | `69/D` | `69/D`, `69/D`, `69/D` | `stable_low_after_and_final` | Stable table-control low; no new target-ref table regression. |

## `long-4516` Signal

`long-4516` final-buffer repeats had a score range of `62..89`.

The low repeat exposed structural signals that were hidden in the higher repeat:

- `heading.extractedHeadingCount`: `0 -> 34`
- `heading.headingTreeDepth`: `4 -> 12`
- `figure.extractedFigureCount`: `3 -> 24`
- `table.irregularTableCount`: `0 -> 9`
- `table.stronglyIrregularTableCount`: `0 -> 4`
- snapshot `tableCount`: `0 -> 17`
- snapshot `paragraphStructElemCount`: `1 -> 1695`

This aligns with the earlier extraction-boundary and stable-key evidence: the row has real structure/table debt, but the analyzer does not expose it deterministically.

## Validation

Passed:

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/scripts/original50FinalBufferRepeatDiagnostic.test.ts`
- `npx -y node@22 /usr/bin/pnpm run lint`

## Decision

Do not reopen table-heavy outside-source behavior from this evidence alone.

The next original-50 stabilization step should target quality-preserving Python structure traversal/analyzer repeat stability on `4516` final buffers. A safe future behavior needs to make the analyzer consistently expose the same checker-visible structure without suppressing PAC debt or hiding the stricter table evidence.

`4683`, `4680`, `4754`, and `4438` should remain separate stable-low or route/failure-shape work items unless later repeats show final-buffer score volatility.

## Rejected Stable-Traversal Experiment

After this diagnostic, a local source experiment changed normal `traverse_struct_tree` from transient pikepdf wrapper identity to stable PDF object keys. This was tested only on `long-4516` plus the `structure-4438` control and then reverted.

Local artifact:

`/mnt/pdf-review/original50-stable-traversal-targetref-focus-2026-05-29-r1/run-2026-05-29T20-50-00-964Z`

Result:

| Row | After | Final reanalysis |
| --- | ---: | ---: |
| `structure-4438` | `69/D` | `69/D` |
| `long-4516` | `68/D` | `68/D` |

The experiment made `4516` deterministic but lower quality. Stable traversal alone is therefore still not acceptable, even with strict target-ref table improvement acceptance now in place. The next viable analyzer work needs a quality-preserving traversal/canonicalization design, not a blanket switch to stable object-key traversal.
