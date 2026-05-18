# Minnesota BCA UCR Focused Diagnostic

Date: 2026-05-18

## Scope

This is a focused follow-up to `docs/minnesota-bca-ucr-holdout-2026-05-18.md`.

The diagnostic rehydrated six public Minnesota Bureau of Criminal Apprehension Uniform Crime Report PDFs under 10 MB:

- `01-mn-bca-ucr-2024.pdf`
- `03-mn-bca-ucr-2022.pdf`
- `05-mn-bca-ucr-2020.pdf`
- `07-mn-bca-ucr-2018.pdf`
- `08-mn-bca-ucr-2017.pdf`
- `10-mn-bca-ucr-2015.pdf`

The subset included two low zero-heading-like rows, two high-scoring controls, one near-target row, and one historical timeout row.

## Run

Command shape:

```sh
PDFAF_RUN_LOCAL_LLM=0 OPENAI_COMPAT_BASE_URL= \
  timeout 1800s npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  Input/minnesota_bca_ucr_focus_2026_05_18 \
  /mnt/pdf-review/pdfaf-validation/minnesota-bca-ucr-focus-2026-05-18-r1 \
  --no-semantic --no-pdfs
```

## Results

| File | Before | After | Duration ms | Error |
|---|---:|---:|---:|---|
| `01-mn-bca-ucr-2024.pdf` | 79/C | 91/A | 65,458 |  |
| `03-mn-bca-ucr-2022.pdf` | 48/F | 97/A | 57,533 |  |
| `05-mn-bca-ucr-2020.pdf` | 37/F | 59/F | 26,805 |  |
| `07-mn-bca-ucr-2018.pdf` | 28/F | 97/A | 29,044 |  |
| `08-mn-bca-ucr-2017.pdf` | 36/F | 59/F | 45,009 |  |
| `10-mn-bca-ucr-2015.pdf` | 30/F | 0/? | 300,032 | `per_pdf_timeout_300000ms` |

Focused subset mean was `45.60 -> 80.60` on the runner's completed-row accounting. Timeout-inclusive accounting is lower because `10-mn-bca-ucr-2015.pdf` returned zero.

`false_positive_applied` stayed `0`.

## Findings

Rows `05` and `08` reproduce the low-row shape from the full Minnesota holdout:

- Both finish at `59/F`.
- Both have final `heading_structure=0`, `reading_order=79`, and strong title/link/PDF-UA improvements.
- The residual is not a simple missing title/language/link repair.

Raw analyzer classification:

- `05-mn-bca-ucr-2020.pdf` is a native-tagged degenerate shell: structure tree present, no headings, no paragraph structure elements, no MCID text spans, structure depth `1`, and `239` annotation struct-parent risks.
- `08-mn-bca-ucr-2017.pdf` has native tagged structure and MCID spans, but the heading route is rejected as a no-gain orphan-artifact mutation; it carries heavy annotation/link ownership debt before later annotation repairs.
- `10-mn-bca-ucr-2015.pdf` reproduces the historical runtime wall.

## Probe

The existing `synthesize_basic_structure_from_layout` mutator was manually tested with `allowExistingMarkedContentText=true` as a diagnostic only.

For `05-mn-bca-ucr-2020.pdf`:

- 12-page bounded synthesis created reachable headings and paragraphs, moving the raw mutated analysis to `62/D`.
- Full-document synthesis moved raw mutated analysis to `65/D`.
- A manual sequence with title/language, full-document synthesis, annotation/link repairs, PDF/UA identification, and orphan-MCID cleanup reached `80/B`.

For `08-mn-bca-ucr-2017.pdf`:

- A similar manual sequence reached `84/B`.

This proves there is a real general structural-recovery lane for degenerate native-tagged marked-content shells, but the current proof is not acceptance-ready:

- It does not lift the Minnesota source set near the requested `93+` mean/median.
- It still leaves heading/reading/alt/PDF-UA residuals.
- Full-document synthesis has potential runtime risk.
- The predicate would need original-50 speed and quality validation before production use.

## Decision

No behavior change was made.

The Minnesota set remains failed against the requested public-source target. The useful follow-up is a general marked-content-shell synthesis design that can prove:

- bounded runtime,
- repeatable score movement above the B range,
- no false-positive mutation,
- no original-50 quality or speed regression,
- and no source/PDF/year-specific predicate.

Generated public PDFs and public-source benchmark artifacts are temporary and should be removed after this diagnostic is committed.
