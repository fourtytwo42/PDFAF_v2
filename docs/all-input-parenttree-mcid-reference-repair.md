# All-Input ParentTree MCID Reference Repair

Date: 2026-05-10

## Decision

Promote a narrow deterministic repair for direct PAC ParentTree MCID object-reference mismatches.

The trigger is intentionally small:

- native tagged PDF;
- score `>=80` and below remediation target;
- active strict PAC cap `pdfua.parent_tree.annotation_object_refs_consistent`;
- direct `parentTreeAudit.objectReferenceMismatchCount > 0`.

No PAC scoring caps, PAC gates, timeout defaults, AI defaults, or broad planner routes changed.

## Evidence

The current PAC-style audit found near-pass rows where `/StructTreeRoot/ParentTree` pointed a page MCID to one structure element while another structure element also referenced the same page MCID. PAC reports this as annotation/object-reference inconsistency. Existing link annotation repair did not change these rows because visible annotation ownership was already clean.

The Python mutation now repairs two direct cases only:

- a unique page MCID reference whose ParentTree entry points to the wrong structure element;
- duplicate page MCID ownership where the current ParentTree owner is already one of the duplicate owners, by removing the duplicate MCID reference from the non-owner element.

Ambiguous duplicate ownership remains untouched.

## Validation

Focused target run:

`Output/goal-all-input-mean-2026-05-09-r1/run-parenttree-mcid-ref-target-2026-05-10-r1`

Results:

- `0091` moved `37/F -> 85/B`; `repair_parent_tree_mcid_references` applied at `82 -> 84` and cleared `objectReferenceMismatchCount`.
- `0234` moved `42/F -> 97/A`; the new repair cleared duplicate MCID ownership before existing parent-link cleanup.
- `0194` and `0236` remained high-score outcomes through existing parent-link cleanup.
- `false_positive_applied = 0`.
- Route-volatile/runtime rows (`0086`, `0108`, `0114`) did not block this repair decision and are not counted as evidence for it.

Progress overlay:

`Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-parenttree-mcid-ref-2026-05-10-r1`

Current planning estimate:

- mean `92.2564`;
- rows below target `81`;
- points still needed for mean `93`: `261`.

## Verification

- `python3 -m py_compile python/pdf_analysis_helper.py`
- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/remediation/planner.test.ts tests/integration/parentTreeRepair.integration.test.ts`
- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/remediation/planner.test.ts tests/integration/parentTreeRepair.integration.test.ts tests/remediation/orchestrator.test.ts tests/remediation/pacRuleAcceptanceGate.test.ts tests/services/pacRuleEvidence.test.ts tests/scorer.test.ts`
- `npx -y node@22 /usr/bin/pnpm lint`

## Next

The remaining deficit is no longer concentrated in this ParentTree MCID mismatch shape. Continue with diagnostic-first target selection from the latest overlay, likely focusing on remaining heading/reading route volatility or high-deficit table/object evidence rows. Do not count volatile `0086` recovery until repeat/source reanalysis is stable.
