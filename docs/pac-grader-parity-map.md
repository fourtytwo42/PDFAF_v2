# PAC Grader Parity Map

Generated from the five external PAC reports in `Output/review-five-a-pdfs-2026-05-08-r1/PAC Reports` and the internal diagnostic script `scripts/pac-review-gap-diagnostic.ts`.

This is a grader-evidence map only. It does not change scoring, remediation gates, planner routing, mutation behavior, timeout defaults, API responses, or benchmark policy.

## Current Five-PDF PAC Buckets

| PAC bucket | Five-PDF external PAC result | Internal coverage status | Next action |
| --- | ---: | --- | --- |
| Content | 5 files failed, 103094 failures | Mostly covered by content/font rule evidence | Add object-level split for external XObjects and character-level Unicode mapping before remediation. |
| PDF Syntax | 5 files failed, 10 failures | Covered by ParentTree and structure syntax evidence | Use object refs for future scoring/gate candidates only after repeat validation. |
| Fonts | 2 files failed, 8 failures | Covered by font/CMap evidence, partly heuristic | Keep diagnostic; prior font scoring promotion was too noisy. |
| Structure tree | 5 files warned, 39 warnings | Covered by parent-link/RoleMap evidence, partly diagnostic | Keep diagnostic until direct legal-position evidence is complete. |
| Structure elements | 2 files failed, 34 failures | Partial; new leaf mapping identifies missing object-level families | Prioritize annotation/link/widget nesting, heading role-form, Figure BBox, lists, tables, TOC/Note. |
| Alternative Descriptions | 1 file warned, 6 warnings | Partial; new leaf mapping identifies missing object-level families | Prioritize exact figure/formula/form/annotation/text-alt ownership evidence. |

## PAC Leaf Map

| PAC bucket | PAC leaf family | PAC checks | Internal rule IDs | Coverage default |
| --- | --- | --- | --- | --- |
| Content | Tagged text/image/path operators | `CheckContentIsTaggedOrArtifacted` | `pdfua.content.text_tagged_or_artifacted`, `pdfua.content.image_tagged_or_artifacted`, `pdfua.content.path_paint_tagged_or_artifacted` | covered when `contentTaggingAudit` is present |
| Content | Artifact/tag nesting and stack | `CheckNoArtifactInTaggedContent`, `CheckNoTaggedContentInArtifacts` | `pdfua.content.artifact_tag_boundary_valid`, `pdfua.content.no_artifact_in_tagged_content`, `pdfua.content.no_tagged_content_in_artifact`, `pdfua.content.marked_content_stack_valid` | covered when page streams are fully checked |
| Content | Unicode character mapping | `CheckCharactersUnicodeMappable` | `pdfua.content.characters_unicode_mappable`, `pdfua.font.to_unicode_cmap_present`, `pdfua.font.to_unicode_cmap_valid` | partial until character-level unmappable evidence exists |
| Content | Referenced external objects | `CheckDocuementContainsNoReferenceXObjects` | `pdfua.content.external_reference_xobjects_absent` | manual-review until direct XObject reference audit exists |
| PDF Syntax | ParentTree and structure syntax | `CheckStructuralParentTree`, `CheckStructureElementHasParentKey`, `CheckStructureHasCorruptElements` | `pdfua.parent_tree.*`, `pdfua.structure.parent_links_valid`, `pdfua.structure.mcr_objr_valid` | covered when audits are present |
| Structure tree | RoleMap and legal locations | RoleMap checks, `CheckMarkedContentIsInLegalPosition` | `pdfua.structure.rolemap_valid`, `pdfua.structure.child_roles_valid`, `pdfua.content.within_page_bounds` | partial until legal-position evidence is direct |
| Fonts | Font/CMap syntax | CMap, WMode, CIDToGIDMap, TrueType checks | `pdfua.font.*` | covered/heuristic; diagnostic-only for now |
| Structure elements | Figure structure | `CheckFigureHasBBox` | `pdfua.figure.bbox_present` | heuristic until direct object-level BBox audit is complete |
| Structure elements | Annotation/link/widget nesting | `CheckAnnotationsInAnnotTag`, `CheckLinkAnnotationsInLinkTag`, `CheckWidgetAnnotationsInFormTag` | `pdfua.annotations.tagged_annotations_present`, `pdfua.annotations.link_in_link_tag`, `pdfua.annotations.widget_in_form_tag` | partial; widget/Form nesting needs direct subtype-role audit |
| Structure elements | Heading structure | heading level and mixed role checks | `pdfua.heading.first_heading_h1`, `pdfua.heading.levels_not_skipped`, `pdfua.heading.h_and_hn_not_mixed` | partial; mixed `H`/`Hn` needs raw role-form capture |
| Structure elements | List structure | `L`, `LI`, `Lbl`, `LBody`, LI body checks | `pdfua.list.li_parent_valid`, `pdfua.list.lbl_lbody_parent_valid`, `pdfua.list.items_present` | covered when `listStructureAudit` is present |
| Structure elements | Table structure | `CheckTablesAreRegular`, `CheckTableHeaderCellAssignments` | `pdfua.table.*` | covered when table audits identify stable table objects |
| Structure elements | TOC and Note structure | TOCI/Note checks | `pdfua.toc.toci_links_valid`, `pdfua.note.ids_unique` | diagnostic unless direct debt repeats |
| Alternative Descriptions | Figure and Formula alt | `CheckFigureHasAltText`, `CheckFormulaHasAltText` | `pdfua.figure.alt_present`, `pdfua.figure.checker_visible_alt_present`, `pdfua.formula.alt_present` | covered where roles are captured |
| Alternative Descriptions | Form and annotation descriptions | `CheckFormFieldHasTUKey`, `CheckAnnotationHasAltText` | `pdfua.form.tu_present`, `pdfua.annotation.alt_or_contents_present`, `pdfua.annotations.nonlink_contents_present` | covered/partial depending on annotation subtype evidence |
| Alternative Descriptions | Inappropriate or empty alt ownership | `CheckTextTagHasAltText`, `CheckAltTextsAreNotGenerated` | `pdfua.alt.text_element_alt_absent`, `pdfua.alt.descriptions_not_empty`, `pdfua.quality.alt_not_generated` | heuristic quality evidence |
| Natural language | Language of parts | language-of-parts checks | `pdfua.language.*_lang_valid` | diagnostic until inherited language context is direct |

## Promotion Rule

Evidence from this map can move to remediation only after the leaf diagnostic identifies a stable object-level target and existing page/text/tag/PAC guards verify no regression. Evidence can move to scoring only in a later corpus-backed promotion stage.
