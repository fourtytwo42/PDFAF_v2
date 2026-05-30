# PAC/Table-Strong Handoff - 2026-05-30

## Active Goal

Make PDFAF v2 a PAC-aligned, table-strong, general-purpose PDF accessibility grader/remediator that holds up across original, all-input, Docker/API, and outside public-source PDFs.

Production behavior must stay native and general:

- no runtime dependency on Research/POC, PAC, ODL, Java, source names, row IDs, filenames, corpus paths, hashes, or known benchmark membership;
- no scorer masking, PAC suppression, hidden failures, strictness reduction, or score inflation;
- accepted fixes must preserve `false_positive_applied=0`, bounded runtime, and Docker/local parity.

## Current Stopping Point

The immediate blocker is not a new outside-source table fix. The current gate blocker is original-50 route/analyzer volatility and stable-low residuals, especially:

- `4516`: final-buffer/native analyzer volatility; stable traversal exposes real structure/table debt, but blanket stable traversal alone lowers/stabilizes the row and is not accepted.
- `4680`, `4683`, `4754`: route/analyzer/replay-state volatility evidence exists; prior diagnostics say not to weaken PAC/category guards.
- `4438`: stable low table-control debt; useful as a guard against broad table-header behavior.
- `4076`: currently A-range in the most recent focused repeat, but remains in the blocker watch set.

Do not reopen parked outside table lanes until the original-50 blockers are fixed or parked with source-tracked evidence.

## Accepted Recent Work

Strict target-ref table invariant acceptance is implemented and documented:

- `docs/original50-target-ref-table-acceptance-2026-05-29.md`
- `python/pdf_analysis_helper.py`
- `tests/integration/tableNormalization.integration.test.ts`

This allows table mutations to be accepted only when every requested target ref is a resolved/root-reachable `/Table`, target-level debt does not worsen, ownership is preserved, and target-level table/header invariants improve.

## Rejected/Parked Direction

Stable object-key traversal is diagnostic-only for now.

Evidence:

- `docs/original50-stable-table-target-probe-2026-05-29.md`
- `docs/original50-stable-key-table-debt-diagnostic-2026-05-29.md`
- `docs/original50-python-structure-stable-key-candidate-parked-2026-05-29.md`
- `docs/original50-final-buffer-repeat-diagnostic-2026-05-29.md`

Conclusion: stable traversal exposes real PAC-like structure debt on `4516`, but accepting it alone fails the original-50 gate. Future work needs a quality-preserving traversal/analyzer design plus a general object-backed table/header recovery path that improves `4516` while preserving `4438`.

## Disk Cleanup

The root drive was full on 2026-05-30. To stop safely without deleting evidence, large ignored/generated paths were moved to `/mnt/pdf-review/root-drive-relief-2026-05-30/` and replaced with symlinks:

- `data/pdfaf.db`
- `Output/goal-all-input-mean-2026-05-09-r1`

After cleanup:

- `/`: about `7.4G` free;
- `/mnt/pdf-review`: about `15G` free;
- `/mnt/docker-data`: about `11G` free;
- `/mnt/icjia-work`: still full, about `166M` free.

Avoid writing new artifacts to `/mnt/icjia-work` unless old ICJIA generated PDFs are intentionally archived or deleted.

## Next Best Work

1. Keep working Phase 1: original-50 stabilization.
2. Prioritize a diagnostic/proof for quality-preserving Python structure traversal/analyzer stability on `4516` final buffers.
3. Keep `4438` as the table-control row.
4. Do not promote outside table lanes until original-50 blockers are fixed or parked.
5. When behavior changes are accepted, run focused validation first, then the fresh original-50 deterministic gate before claiming broad progress.

## Handoff Files To Copy To A New VM

Minimum source-tracked handoff files:

- `memory.md`
- `AGENTS.md`
- `docs/pac-table-strong-handoff-2026-05-30.md`
- all `docs/original50-*2026-05-29.md`
- all `docs/table-*2026-05-27.md`

Minimum corpus baseline:

- `Input/experiment-corpus/manifest.json`
- `Input/experiment-corpus/00-fixtures/`
- `Input/experiment-corpus/10-short-near-pass/`
- `Input/experiment-corpus/20-figure-ownership/`
- `Input/experiment-corpus/30-structure-reading-order/`
- `Input/experiment-corpus/40-font-extractability/`
- `Input/experiment-corpus/50-long-report-mixed/`

Generated benchmark artifacts remain local scratch unless explicitly needed for evidence review.

## New VM Setup Status

Initial migration target:

- Host: `192.168.50.118`
- Hostname: `pdfaf-work`
- Repo path: `~/PDFAF_v2`
- Repo commit: `c48cbaa` after the first handoff commit, then updated by the follow-up tracking commit.
- Root filesystem was expanded from the initial `97G` filesystem to about `195G`; after expansion it showed about `179G` free.
- Original-50 corpus was copied to `Input/experiment-corpus` with `52` files and about `62M` of payload.
- `memory.md`, `AGENTS.md`, and `docs/pac-table-strong-handoff-2026-05-30.md` are present.

Expected remote git status after setup:

- `main...origin/main`;
- untracked `Input/experiment-corpus/*` PDF directories, because the base corpus payloads are intentionally local and not committed.

No passwords or generated benchmark artifacts are stored in source-tracked files.
