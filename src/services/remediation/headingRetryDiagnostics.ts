import type { AppliedRemediationTool, PythonMutationDetailPayload } from '../../types.js';

const HEADING_TOOL = 'create_heading_from_candidate';

const HARD_BLOCKER_NOTES = new Set([
  'role_invalid_after_mutation',
  'heading_not_root_reachable',
  'target_unreachable',
]);

const CONVERGENCE_SENSITIVE_NOTES = new Set([
  'structure_depth_not_improved',
  'multiple_h1_after_mutation',
]);

export interface HeadingRetryBenchmarkRowLike {
  id?: string;
  file?: string;
  afterScore?: number;
  reanalyzedScore?: number | null;
  appliedTools?: AppliedRemediationTool[];
}

export interface HeadingRetryAttemptDiagnostic {
  fileId: string;
  file?: string;
  targetRef: string | null;
  note: string;
  outcome: AppliedRemediationTool['outcome'];
  hardBlockers: string[];
  convergenceSensitive: boolean;
  suppressible: boolean;
  needsDetailFix: boolean;
  signature: string | null;
}

export interface HeadingRetryRepeatedSignature {
  signature: string;
  fileId: string;
  file?: string;
  targetRef: string;
  note: string;
  count: number;
  wouldSkip: number;
  hardBlockers: string[];
}

export interface HeadingRetryProtectedOutcome {
  fileId: string;
  file?: string;
  score: number;
  noEffectCount: number;
  targetRefs: string[];
  notes: string[];
}

export interface HeadingRetryDiagnosticSummary {
  totalHeadingAttempts: number;
  totalHeadingNoEffect: number;
  noEffectWithTargetRef: number;
  targetRefCoveragePct: number;
  missingTargetRefCount: number;
  repeatedExactBlockedSignatures: HeadingRetryRepeatedSignature[];
  suppressibleAttemptCount: number;
  wouldSkipAttempts: number;
  filesWhereSuppressionWouldSkip: string[];
  distinctCandidateProgressionFiles: string[];
  convergenceSensitiveNoEffectCount: number;
  needsPythonDetailFixFiles: string[];
  successfulScoreOutcomesMustNotTouch: HeadingRetryProtectedOutcome[];
}

function parseDetails(details: string | undefined): PythonMutationDetailPayload | null {
  if (!details?.startsWith('{')) return null;
  try {
    return JSON.parse(details) as PythonMutationDetailPayload;
  } catch {
    return null;
  }
}

function targetRefFromDetails(details: PythonMutationDetailPayload | null): string | null {
  const invariantRef = details?.invariants?.targetRef;
  if (typeof invariantRef === 'string' && invariantRef.length > 0) return invariantRef;
  const debugRef = details?.debug?.['targetRef'];
  if (typeof debugRef === 'string' && debugRef.length > 0) return debugRef;
  return null;
}

function headingInvariantImproved(details: PythonMutationDetailPayload | null): boolean {
  const inv = details?.invariants;
  if (!inv) return false;
  const headingBefore = inv.rootReachableHeadingCountBefore ?? 0;
  const headingAfter = inv.rootReachableHeadingCountAfter ?? headingBefore;
  const depthBefore = inv.rootReachableDepthBefore ?? 0;
  const depthAfter = inv.rootReachableDepthAfter ?? depthBefore;
  return headingAfter > headingBefore || (depthBefore > 0 && depthAfter > depthBefore);
}

function hardBlockersFor(details: PythonMutationDetailPayload | null): string[] {
  if (!details || headingInvariantImproved(details)) return [];
  const blockers: string[] = [];
  if (details.note && HARD_BLOCKER_NOTES.has(details.note)) blockers.push(`note:${details.note}`);
  if (details.invariants?.targetReachable === false) blockers.push('targetReachable=false');
  if (details.invariants?.headingCandidateReachable === false) blockers.push('headingCandidateReachable=false');
  return blockers;
}

function signatureFor(fileId: string, targetRef: string | null, note: string, blockers: string[]): string | null {
  if (!targetRef || blockers.length === 0) return null;
  return [fileId, targetRef, note, ...blockers.sort()].join('|');
}

export function classifyHeadingRetryAttempt(
  row: HeadingRetryBenchmarkRowLike,
  tool: AppliedRemediationTool,
): HeadingRetryAttemptDiagnostic | null {
  if (tool.toolName !== HEADING_TOOL) return null;
  const fileId = row.id ?? row.file ?? 'unknown';
  const details = parseDetails(tool.details);
  const targetRef = targetRefFromDetails(details);
  const note = details?.note ?? (tool.details && !tool.details.startsWith('{') ? tool.details : 'no_note');
  const hardBlockers = tool.outcome === 'no_effect' ? hardBlockersFor(details) : [];
  const convergenceSensitive = tool.outcome === 'no_effect' && CONVERGENCE_SENSITIVE_NOTES.has(note);
  const needsDetailFix = tool.outcome === 'no_effect' && targetRef === null;
  const signature = tool.outcome === 'no_effect' ? signatureFor(fileId, targetRef, note, hardBlockers) : null;
  return {
    fileId,
    file: row.file,
    targetRef,
    note,
    outcome: tool.outcome,
    hardBlockers,
    convergenceSensitive,
    suppressible: signature !== null,
    needsDetailFix,
    signature,
  };
}

export function analyzeHeadingRetryRows(rows: HeadingRetryBenchmarkRowLike[]): HeadingRetryDiagnosticSummary {
  const attempts: HeadingRetryAttemptDiagnostic[] = [];
  for (const row of rows) {
    for (const tool of row.appliedTools ?? []) {
      const attempt = classifyHeadingRetryAttempt(row, tool);
      if (attempt) attempts.push(attempt);
    }
  }

  const noEffects = attempts.filter(attempt => attempt.outcome === 'no_effect');
  const suppressible = noEffects.filter(attempt => attempt.suppressible && attempt.signature);
  const bySignature = new Map<string, HeadingRetryAttemptDiagnostic[]>();
  for (const attempt of suppressible) {
    bySignature.set(attempt.signature!, [...(bySignature.get(attempt.signature!) ?? []), attempt]);
  }

  const repeatedExactBlockedSignatures: HeadingRetryRepeatedSignature[] = [];
  for (const [signature, grouped] of bySignature) {
    if (grouped.length < 2) continue;
    const first = grouped[0]!;
    repeatedExactBlockedSignatures.push({
      signature,
      fileId: first.fileId,
      file: first.file,
      targetRef: first.targetRef!,
      note: first.note,
      count: grouped.length,
      wouldSkip: grouped.length - 1,
      hardBlockers: first.hardBlockers,
    });
  }
  repeatedExactBlockedSignatures.sort((a, b) =>
    b.wouldSkip - a.wouldSkip || a.fileId.localeCompare(b.fileId) || a.targetRef.localeCompare(b.targetRef)
  );

  const repeatedFiles = [...new Set(repeatedExactBlockedSignatures.map(row => row.fileId))].sort();
  const needsDetailFixFiles = [...new Set(noEffects.filter(row => row.needsDetailFix).map(row => row.fileId))].sort();
  const convergenceSensitiveNoEffectCount = noEffects.filter(row => row.convergenceSensitive).length;
  const noEffectWithTargetRef = noEffects.filter(row => row.targetRef !== null).length;
  const targetRefCoveragePct = noEffects.length === 0 ? 100 : Math.round((noEffectWithTargetRef / noEffects.length) * 10000) / 100;

  const byFile = new Map<string, HeadingRetryAttemptDiagnostic[]>();
  for (const attempt of noEffects) {
    byFile.set(attempt.fileId, [...(byFile.get(attempt.fileId) ?? []), attempt]);
  }

  const distinctCandidateProgressionFiles: string[] = [];
  const successfulScoreOutcomesMustNotTouch: HeadingRetryProtectedOutcome[] = [];
  for (const [fileId, grouped] of byFile) {
    const refs = [...new Set(grouped.map(row => row.targetRef).filter((ref): ref is string => ref !== null))];
    if (refs.length > 1) {
      distinctCandidateProgressionFiles.push(fileId);
    }
    const sourceRow = rows.find(row => (row.id ?? row.file ?? 'unknown') === fileId);
    const score = sourceRow?.reanalyzedScore ?? sourceRow?.afterScore;
    if (typeof score === 'number' && score >= 90) {
      successfulScoreOutcomesMustNotTouch.push({
        fileId,
        file: sourceRow?.file,
        score,
        noEffectCount: grouped.length,
        targetRefs: refs.sort(),
        notes: [...new Set(grouped.map(row => row.note))].sort(),
      });
    }
  }

  return {
    totalHeadingAttempts: attempts.length,
    totalHeadingNoEffect: noEffects.length,
    noEffectWithTargetRef,
    targetRefCoveragePct,
    missingTargetRefCount: noEffects.length - noEffectWithTargetRef,
    repeatedExactBlockedSignatures,
    suppressibleAttemptCount: suppressible.length,
    wouldSkipAttempts: repeatedExactBlockedSignatures.reduce((sum, row) => sum + row.wouldSkip, 0),
    filesWhereSuppressionWouldSkip: repeatedFiles,
    distinctCandidateProgressionFiles: distinctCandidateProgressionFiles.sort(),
    convergenceSensitiveNoEffectCount,
    needsPythonDetailFixFiles: needsDetailFixFiles,
    successfulScoreOutcomesMustNotTouch: successfulScoreOutcomesMustNotTouch.sort((a, b) =>
      a.fileId.localeCompare(b.fileId)
    ),
  };
}
