# All-Input PAC Object Evidence Gap

Current all-input overlay: `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-proposal-buffer-batch-2026-05-10-r1`

Selection artifact: `Output/goal-all-input-mean-2026-05-09-r1/pac-object-evidence-gap-2026-05-10-r1`

The current planning overlay is at mean `91.1453` with `651` points still needed for mean `93`. After the proposal-buffer batch recovery, target selection shifted away from another direct heading sequence and into `needs_more_pac_object_evidence`.

## PAC/POC Reference Families

The diagnostic maps remaining low rows to PAC-style leaf families from `Research/POC-decompiled`:

| Family | PAC behavior reference | Internal rule family |
| --- | --- | --- |
| Font/CMap | `Research/POC-decompiled/PAC/uYA4QGz9SaCwTwr6epj/ookUf4zil6Xd8K6fN9c.cs` | `pdfua.font.*` |
| ParentTree | `Research/POC-decompiled/PAC/m3WxRVHvVB4W9AHLYmTs/pBAK6sHvuDONAUJryKfn.cs` | `pdfua.parent_tree.*`, `pdfua.structure.parent_links_valid` |
| Heading structure | `Research/POC-decompiled/PAC/A4.Matterhorn.Properties/Resources.cs` | `pdfua.heading.*` |
| Table headers | `Research/POC-decompiled/PAC/j9k8YZHvkuLNDyh1q0uG/FCsgaIHvwBTo53Qv0MsN.cs` | `pdfua.table.*` |
| Annotation/link structure | `Research/POC-decompiled/PAC/A4.Matterhorn.Properties/Resources.cs` | `pdfua.annotations.*` |

## Diagnostic Result

The nine rows selected by the strict target diagnostic split as:

| Classification | Count | Deficit |
| --- | ---: | ---: |
| `table_or_parenttree_object_candidate` | 6 | 134 |
| `font_only_no_safe_action` | 1 | 57 |
| `semantic_source_candidate` | 2 | 53 |

Follow-up table/header object analysis on the six table/ParentTree candidates found no current association-repair candidate:

| Classification | Count | Rows |
| --- | ---: | --- |
| `not_table_first` | 3 | `long-4516`, `4690`, `4446` |
| `irregular_or_direct_table_shape` | 2 | `4178`, `4735` |
| `missing_header_creation_first` | 1 | `4567` |

This means the next behavior stage should not widen `set_table_header_cells` or table association batching. PAC-style evidence points to either table structure/header creation first, runtime/checkpoint classification, or semantic/source proof.

## Decision

- Keep `0034/v1-4716` parked as font/CMap-heavy diagnostic debt. PAC detects direct ToUnicode/CMap failures there, but font/CMap remains too noisy for immediate numeric or repair behavior.
- Do not promote another table-header association repair from this evidence; the object diagnostic found no safe association candidates.
- The best next narrow candidates are:
  - `0086/4567`: investigate missing-header creation or source-reanalyzed semantic route, because it has a prior observed `90/A` route and direct PAC table/ParentTree evidence.
  - `0283` and `3924`: semantic/source candidates if deterministic object traces remain weak.
  - `4178`/`4735`: table-structure-first diagnostics, not header association metadata.
- Keep API semantic requests sequential on this VM and count only source-reanalyzed saved PDFs.

No scoring, PAC gate, planner, mutation, timeout, API, or AI-default behavior changed in this checkpoint.
