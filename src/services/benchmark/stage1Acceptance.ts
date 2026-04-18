import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  AnalyzeBenchmarkRow,
  ExperimentCorpusCohort,
  FrequencyRow,
  RemediateBenchmarkRow,
} from './experimentCorpus.js';
import type { ScoreCapApplied, ScoredCategory, VerificationLevel } from '../../types.js';

export type Stage1CaseClassification =
  | 'justified-structural'
  | 'justified-ocr'
  | 'justified-alt-ownership'
  | 'justified-pdfua-proxy-high-pass'
  | 'suspicious-overbroad';

export interface Stage1ManualReviewSnapshot {
  manualReviewRequired: boolean;
  verificationLevel: VerificationLevel | null;
  triggeringCategories: string[];
  triggeringReasons: string[];
  scoreCapsApplied: ScoreCapApplied[];
}

export interface Stage1AcceptanceCase {
  id: string;
  file: string;
  cohort: ExperimentCorpusCohort;
  sourceType: AnalyzeBenchmarkRow['sourceType'];
  intent: string;
  notes?: string;
  analyze: Stage1ManualReviewSnapshot;
  postRemediation: Stage1ManualReviewSnapshot & { available: boolean };
  analyzeOnlyManualReviewCase: boolean;
  postRemediationOnlyManualReviewCase: boolean;
  remediationStatus: 'cleared' | 'still_flagged' | 'not_run';
  remainingClassification: Stage1CaseClassification | null;
}

export interface Stage1CohortAudit {
  analyzeManualReviewCount: number;
  postRemediationManualReviewCount: number;
  clearedByRemediationCount: number;
  stillFlaggedCount: number;
  newlyFlaggedAfterRemediationCount: number;
  analyzeCategoryTriggerFrequency: Array<FrequencyRow>;
  postCategoryTriggerFrequency: Array<FrequencyRow>;
  analyzeReasonFrequency: Array<FrequencyRow>;
  postReasonFrequency: Array<FrequencyRow>;
}

export interface Stage1AcceptanceAudit {
  generatedAt: string;
  analyzeRunDir: string;
  fullRunDir: string;
  analyzeSourceCount: number;
  remediateSourceCount: number;
  summary: {
    analyzeManualReviewCount: number;
    postRemediationManualReviewCount: number;
    clearedByRemediationCount: number;
    stillFlaggedCount: number;
    newlyFlaggedAfterRemediationCount: number;
    suspiciousOverbroadCount: number;
    calibrationNeeded: boolean;
    classificationCounts: Record<Stage1CaseClassification, number>;
    clearedFileIds: string[];
    stillFlaggedFileIds: string[];
  };
  cohorts: Record<ExperimentCorpusCohort, Stage1CohortAudit>;
  cases: Stage1AcceptanceCase[];
  suspiciousCases: Stage1AcceptanceCase[];
}

function frequencyRows(values: string[]): Array<FrequencyRow> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function applicableManualReviewCategories(categories?: ScoredCategory[]): ScoredCategory[] {
  return (categories ?? []).filter(category => category.applicable && category.manualReviewRequired);
}

function scoreCapsByApplicableCategory(
  caps: ScoreCapApplied[] | undefined,
  triggeringCategories: string[],
): ScoreCapApplied[] {
  const triggering = new Set(triggeringCategories);
  return (caps ?? []).filter(cap => triggering.has(cap.category));
}

function makeSnapshot(input: {
  manualReviewRequired: boolean | null | undefined;
  verificationLevel: VerificationLevel | null | undefined;
  categories?: ScoredCategory[];
  scoreCapsApplied?: ScoreCapApplied[];
}): Stage1ManualReviewSnapshot {
  const triggers = applicableManualReviewCategories(input.categories);
  return {
    manualReviewRequired: input.manualReviewRequired === true,
    verificationLevel: input.verificationLevel ?? null,
    triggeringCategories: triggers.map(category => category.key),
    triggeringReasons: [...new Set(triggers.flatMap(category => category.manualReviewReasons ?? []))],
    scoreCapsApplied: scoreCapsByApplicableCategory(
      input.scoreCapsApplied,
      triggers.map(category => category.key),
    ),
  };
}

function classifyRemainingCase(snapshot: Stage1ManualReviewSnapshot): Stage1CaseClassification {
  const categories = new Set(snapshot.triggeringCategories);
  const reasons = snapshot.triggeringReasons.join(' | ');

  if (
    categories.has('reading_order') &&
    (/no structure tree/i.test(reasons) ||
      /annotation tab order/i.test(reasons) ||
      /StructParent/i.test(reasons))
  ) {
    return 'justified-structural';
  }
  if (categories.has('text_extractability') && /OCR metadata indicates/i.test(reasons)) {
    return 'justified-ocr';
  }
  if (
    categories.has('alt_text') &&
    /(ownership|nested|orphaned alternate text risks)/i.test(reasons)
  ) {
    return 'justified-alt-ownership';
  }
  if (
    categories.has('pdf_ua_compliance') &&
    /heuristic proxy signals/i.test(reasons)
  ) {
    return 'justified-pdfua-proxy-high-pass';
  }
  return 'suspicious-overbroad';
}

function effectivePostRemediationSnapshot(row: RemediateBenchmarkRow | undefined): Stage1ManualReviewSnapshot & {
  available: boolean;
} {
  if (!row) {
    return {
      available: false,
      manualReviewRequired: false,
      verificationLevel: null,
      triggeringCategories: [],
      triggeringReasons: [],
      scoreCapsApplied: [],
    };
  }

  const useReanalyzed =
    row.reanalyzedVerificationLevel !== null ||
    row.reanalyzedManualReviewRequired !== null ||
    (row.reanalyzedCategories?.length ?? 0) > 0;

  const snapshot = makeSnapshot({
    manualReviewRequired: useReanalyzed ? row.reanalyzedManualReviewRequired : row.afterManualReviewRequired,
    verificationLevel: useReanalyzed ? row.reanalyzedVerificationLevel : row.afterVerificationLevel,
    categories: useReanalyzed ? row.reanalyzedCategories : row.afterCategories,
    scoreCapsApplied: useReanalyzed ? row.reanalyzedScoreCapsApplied : row.afterScoreCapsApplied,
  });
  return {
    available: true,
    ...snapshot,
  };
}

export function buildStage1AcceptanceAudit(input: {
  analyzeRunDir: string;
  fullRunDir: string;
  analyzeResults: AnalyzeBenchmarkRow[];
  remediateResults: RemediateBenchmarkRow[];
  generatedAt?: string;
}): Stage1AcceptanceAudit {
  const analyzeById = new Map(
    input.analyzeResults.filter(row => !row.error).map(row => [row.id, row]),
  );
  const remediationById = new Map(input.remediateResults.map(row => [row.id, row]));
  const flaggedAnalyzeIds = new Set(
    input.analyzeResults
      .filter(row => !row.error && row.manualReviewRequired === true)
      .map(row => row.id),
  );
  const flaggedPostIds = new Set(
    input.remediateResults
      .filter(
        row =>
          !row.error &&
          (row.reanalyzedManualReviewRequired === true || row.afterManualReviewRequired === true),
      )
      .map(row => row.id),
  );
  const allIds = [...new Set([...flaggedAnalyzeIds, ...flaggedPostIds])]
    .sort((a, b) => {
      const aRow = analyzeById.get(a) ?? remediationById.get(a);
      const bRow = analyzeById.get(b) ?? remediationById.get(b);
      const cohortCompare = (aRow?.cohort ?? '').localeCompare(bRow?.cohort ?? '');
      return cohortCompare || a.localeCompare(b);
    });

  const cases: Stage1AcceptanceCase[] = allIds.map(id => {
    const row = analyzeById.get(id) ?? remediationById.get(id);
    if (!row) {
      throw new Error(`Missing benchmark row for Stage 1 acceptance case "${id}".`);
    }
    const analyzeRow = analyzeById.get(id);
    const remediationRow = remediationById.get(id);
    const analyze = makeSnapshot({
      manualReviewRequired: analyzeRow?.manualReviewRequired,
      verificationLevel: analyzeRow?.verificationLevel,
      categories: analyzeRow?.categories,
      scoreCapsApplied: analyzeRow?.scoreCapsApplied,
    });
    const postRemediation = effectivePostRemediationSnapshot(remediationRow);
    const remediationStatus =
      !postRemediation.available
        ? 'not_run'
        : postRemediation.manualReviewRequired
          ? 'still_flagged'
          : 'cleared';
    return {
      id: row.id,
      file: row.file,
      cohort: row.cohort,
      sourceType: row.sourceType,
      intent: row.intent,
      ...(row.notes ? { notes: row.notes } : {}),
      analyze,
      postRemediation,
      analyzeOnlyManualReviewCase: flaggedAnalyzeIds.has(id),
      postRemediationOnlyManualReviewCase: !flaggedAnalyzeIds.has(id) && flaggedPostIds.has(id),
      remediationStatus,
      remainingClassification:
        remediationStatus === 'still_flagged'
          ? classifyRemainingCase(postRemediation)
          : null,
    };
  });

  const suspiciousCases = cases.filter(
    auditCase => auditCase.remainingClassification === 'suspicious-overbroad',
  );
  const cohorts = Object.fromEntries(
    [...new Set(cases.map(auditCase => auditCase.cohort))]
      .sort((a, b) => a.localeCompare(b))
      .map(cohort => {
        const cohortCases = cases.filter(auditCase => auditCase.cohort === cohort);
        const analyzeCases = cohortCases.filter(auditCase => auditCase.analyzeOnlyManualReviewCase);
        const postCases = cohortCases.filter(
          auditCase => auditCase.postRemediation.available && auditCase.postRemediation.manualReviewRequired,
        );
        return [cohort, {
          analyzeManualReviewCount: analyzeCases.length,
          postRemediationManualReviewCount: postCases.length,
          clearedByRemediationCount: cohortCases.filter(
            auditCase => auditCase.remediationStatus === 'cleared',
          ).length,
          stillFlaggedCount: postCases.length,
          newlyFlaggedAfterRemediationCount: cohortCases.filter(
            auditCase => auditCase.postRemediationOnlyManualReviewCase,
          ).length,
          analyzeCategoryTriggerFrequency: frequencyRows(
            analyzeCases.flatMap(auditCase => auditCase.analyze.triggeringCategories),
          ),
          postCategoryTriggerFrequency: frequencyRows(
            postCases.flatMap(auditCase => auditCase.postRemediation.triggeringCategories),
          ),
          analyzeReasonFrequency: frequencyRows(
            analyzeCases.flatMap(auditCase => auditCase.analyze.triggeringReasons),
          ),
          postReasonFrequency: frequencyRows(
            postCases.flatMap(auditCase => auditCase.postRemediation.triggeringReasons),
          ),
        } satisfies Stage1CohortAudit];
      }),
  ) as Record<ExperimentCorpusCohort, Stage1CohortAudit>;

  const classificationCounts: Record<Stage1CaseClassification, number> = {
    'justified-structural': 0,
    'justified-ocr': 0,
    'justified-alt-ownership': 0,
    'justified-pdfua-proxy-high-pass': 0,
    'suspicious-overbroad': 0,
  };
  for (const auditCase of cases) {
    if (auditCase.remainingClassification) {
      classificationCounts[auditCase.remainingClassification] += 1;
    }
  }

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    analyzeRunDir: resolve(input.analyzeRunDir),
    fullRunDir: resolve(input.fullRunDir),
    analyzeSourceCount: input.analyzeResults.length,
    remediateSourceCount: input.remediateResults.length,
    summary: {
      analyzeManualReviewCount: cases.filter(
        auditCase => auditCase.analyzeOnlyManualReviewCase,
      ).length,
      postRemediationManualReviewCount: cases.filter(
        auditCase => auditCase.postRemediation.available && auditCase.postRemediation.manualReviewRequired,
      ).length,
      clearedByRemediationCount: cases.filter(auditCase => auditCase.remediationStatus === 'cleared').length,
      stillFlaggedCount: cases.filter(auditCase => auditCase.remediationStatus === 'still_flagged').length,
      newlyFlaggedAfterRemediationCount: cases.filter(
        auditCase => auditCase.postRemediationOnlyManualReviewCase,
      ).length,
      suspiciousOverbroadCount: suspiciousCases.length,
      calibrationNeeded: suspiciousCases.length > 0,
      classificationCounts,
      clearedFileIds: cases
        .filter(auditCase => auditCase.remediationStatus === 'cleared')
        .map(auditCase => auditCase.id),
      stillFlaggedFileIds: cases
        .filter(auditCase => auditCase.remediationStatus === 'still_flagged')
        .map(auditCase => auditCase.id),
    },
    cohorts,
    cases,
    suspiciousCases,
  };
}

function markdownFrequency(rows: Array<FrequencyRow>): string {
  return rows.length === 0
    ? 'none'
    : rows.map(row => `${row.key} (${row.count})`).join(', ');
}

function markdownScoreCaps(caps: ScoreCapApplied[]): string {
  return caps.length === 0
    ? 'none'
    : caps.map(cap => `${cap.category} ${cap.rawScore}->${cap.finalScore}`).join(', ');
}

export function renderStage1AcceptanceMarkdown(audit: Stage1AcceptanceAudit): string {
  const lines: string[] = [];
  lines.push('# Stage 1 Acceptance Audit');
  lines.push('');
  lines.push(`- **Generated:** ${audit.generatedAt}`);
  lines.push(`- **Analyze run:** \`${audit.analyzeRunDir}\``);
  lines.push(`- **Full run:** \`${audit.fullRunDir}\``);
  lines.push(`- **Analyze manual-review cases:** ${audit.summary.analyzeManualReviewCount}`);
  lines.push(`- **Post-remediation manual-review cases:** ${audit.summary.postRemediationManualReviewCount}`);
  lines.push(`- **Cleared by remediation:** ${audit.summary.clearedByRemediationCount}`);
  lines.push(`- **Still flagged after remediation:** ${audit.summary.stillFlaggedCount}`);
  lines.push(`- **Newly flagged after remediation:** ${audit.summary.newlyFlaggedAfterRemediationCount}`);
  lines.push(`- **Suspicious over-broad cases:** ${audit.summary.suspiciousOverbroadCount}`);
  lines.push(`- **Calibration needed:** ${audit.summary.calibrationNeeded ? 'yes' : 'no'}`);
  lines.push('');
  lines.push('## Remaining Classifications');
  lines.push('');
  lines.push(`- **Structural:** ${audit.summary.classificationCounts['justified-structural']}`);
  lines.push(`- **OCR:** ${audit.summary.classificationCounts['justified-ocr']}`);
  lines.push(`- **Alt ownership:** ${audit.summary.classificationCounts['justified-alt-ownership']}`);
  lines.push(`- **PDF/UA proxy high-pass:** ${audit.summary.classificationCounts['justified-pdfua-proxy-high-pass']}`);
  lines.push(`- **Suspicious over-broad:** ${audit.summary.classificationCounts['suspicious-overbroad']}`);
  lines.push('');
  lines.push('## Per Cohort');
  lines.push('');
  lines.push('| Cohort | Analyze MR | Post MR | Cleared | Still flagged | Post-only | Analyze triggers | Post triggers |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |');
  for (const [cohort, row] of Object.entries(audit.cohorts)) {
    lines.push(
      `| ${cohort} | ${row.analyzeManualReviewCount} | ${row.postRemediationManualReviewCount} | ${row.clearedByRemediationCount} | ${row.stillFlaggedCount} | ${row.newlyFlaggedAfterRemediationCount} | ${markdownFrequency(row.analyzeCategoryTriggerFrequency)} | ${markdownFrequency(row.postCategoryTriggerFrequency)} |`,
    );
  }
  lines.push('');
  lines.push('## Remaining Suspicious Cases');
  lines.push('');
  if (audit.suspiciousCases.length === 0) {
    lines.push('None.');
  } else {
    lines.push('| File | Cohort | Analyze triggers | Post-remediation triggers | Reasons |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const auditCase of audit.suspiciousCases) {
      lines.push(
        `| ${auditCase.id} | ${auditCase.cohort} | ${auditCase.analyze.triggeringCategories.join(', ') || 'none'} | ${auditCase.postRemediation.triggeringCategories.join(', ') || 'none'} | ${auditCase.postRemediation.triggeringReasons.join(' / ') || 'none'} |`,
      );
    }
  }
  lines.push('');
  lines.push('## File-Level Cases');
  lines.push('');
  lines.push('| File | Cohort | Analyze triggers | Post-remediation status | Post-remediation triggers | Classification | Score caps |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const auditCase of audit.cases) {
    lines.push(
      `| ${auditCase.id} | ${auditCase.cohort} | ${auditCase.analyze.triggeringCategories.join(', ') || 'none'} | ${auditCase.remediationStatus}${auditCase.postRemediationOnlyManualReviewCase ? ' (post-only)' : ''} | ${auditCase.postRemediation.triggeringCategories.join(', ') || 'none'} | ${auditCase.remainingClassification ?? 'cleared'} | ${markdownScoreCaps(auditCase.postRemediation.scoreCapsApplied.length > 0 ? auditCase.postRemediation.scoreCapsApplied : auditCase.analyze.scoreCapsApplied)} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

export async function loadBenchmarkRowsFromRunDir(runDir: string): Promise<{
  analyzeResults: AnalyzeBenchmarkRow[];
  remediateResults: RemediateBenchmarkRow[];
}> {
  const base = resolve(runDir);
  const analyzeResults = JSON.parse(
    await readFile(join(base, 'analyze.results.json'), 'utf8'),
  ) as AnalyzeBenchmarkRow[];
  let remediateResults: RemediateBenchmarkRow[] = [];
  try {
    remediateResults = JSON.parse(
      await readFile(join(base, 'remediate.results.json'), 'utf8'),
    ) as RemediateBenchmarkRow[];
  } catch {
    remediateResults = [];
  }
  return { analyzeResults, remediateResults };
}

export async function writeStage1AcceptanceArtifacts(
  outDir: string,
  audit: Stage1AcceptanceAudit,
): Promise<void> {
  const base = resolve(outDir);
  await mkdir(base, { recursive: true });
  await writeFile(join(base, 'stage1-acceptance.json'), JSON.stringify(audit, null, 2), 'utf8');
  await writeFile(join(base, 'stage1-acceptance.md'), renderStage1AcceptanceMarkdown(audit), 'utf8');
}
