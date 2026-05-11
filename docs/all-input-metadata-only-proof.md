# All-Input Metadata-Only Proof

This diagnostic probes the metadata-drift lane selected from complete r5 artifacts.

It applies only existing `set_document_title` and `set_document_language` mutations to selected source PDFs, then verifies:

- page count is unchanged;
- text count is unchanged;
- tagged state is unchanged;
- structure-tree root, parent tree, page `/StructParents`, annotation `/StructParent` values, and structure digest are stable;
- no new non-metadata PAC rule failures appear.

It does not change remediation behavior, scoring, PAC gates, planner routing, timeouts, or semantic defaults.

## Current Artifact

- Script: `scripts/all-input-metadata-only-proof.ts`
- Local output: `Output/goal-all-input-mean-2026-05-09-r1/metadata-only-proof-r5-complete-2026-05-11-r4`
- Default target IDs: `4139`, `0097`, `0181`, `0108`, `0325`

Current result: `4139`, `0097`, `0181`, and `0108` classify as `metadata_only_safe_candidate`; `0325` remains unsafe because a new non-metadata PAC failure appears.

## Promotion Rule

Rows classified as `metadata_only_safe_candidate` are still diagnostic candidates only.

A future behavior stage may use them only after targeted validation proves the guarded acceptance path preserves final source reanalysis, keeps `false_positive_applied = 0`, and cannot apply to structural tools.
