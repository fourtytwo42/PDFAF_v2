import { REMEDIATION_CATEGORY_THRESHOLD } from '../../config.js';
import type {
  AnalysisResult,
  AppliedRemediationTool,
  Finding,
  OcrPipelineSummary,
  PlanningSummary,
  RemediationOutcomeSummary,
  SemanticRemediationSummary,
  StructuralConfidenceGuardSummary,
} from '../../types.js';

export interface HtmlReportOptions {
  includeBeforeAfter?: boolean;
  includeFindingsDetail?: boolean;
  includeAppliedTools?: boolean;
  /** When set, shows a prominent human-review notice (OCR scores are not PAC-equivalent). */
  ocrPipeline?: OcrPipelineSummary | null;
  planningSummary?: PlanningSummary | null;
  structuralConfidenceGuard?: StructuralConfidenceGuardSummary | null;
  remediationOutcomeSummary?: RemediationOutcomeSummary | null;
  semanticSummaries?: SemanticRemediationSummary[];
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function findingsBlocking(findings: Finding[]): Finding[] {
  return findings.filter(f => f.severity === 'critical' || f.severity === 'moderate');
}

function overallScoreValue(analysis: AnalysisResult): number {
  return analysis.scoreProfile?.overallScore ?? analysis.score;
}

function gradeValue(analysis: AnalysisResult): string {
  return analysis.scoreProfile?.grade ?? analysis.grade;
}

function verificationBullets(after: AnalysisResult): string {
  const lines: string[] = [];
  lines.push(`<li><strong>Verification level:</strong> ${esc(after.verificationLevel ?? 'verified')}</li>`);
  lines.push(`<li><strong>Manual review required:</strong> ${(after.manualReviewRequired ?? false) ? 'yes' : 'no'}</li>`);
  if ((after.manualReviewReasons ?? []).length > 0) {
    lines.push(
      `<li><strong>Manual review reasons:</strong> ${esc((after.manualReviewReasons ?? []).join(' | '))}</li>`,
    );
  }
  const caps = after.scoreCapsApplied ?? [];
  if (caps.length > 0) {
    lines.push(
      `<li><strong>Score caps applied:</strong> ${esc(
        caps.map(cap => `${cap.category} ${cap.rawScore}→${cap.finalScore} (cap ${cap.cap})`).join(' | '),
      )}</li>`,
    );
  } else {
    lines.push('<li><strong>Score caps applied:</strong> none</li>');
  }
  return lines.join('');
}

function classificationBullets(after: AnalysisResult): string {
  const lines: string[] = [];
  if (after.structuralClassification) {
    lines.push(
      `<li><strong>Structure class:</strong> ${esc(after.structuralClassification.structureClass)}</li>`,
    );
    lines.push(
      `<li><strong>Classification confidence:</strong> ${esc(after.structuralClassification.confidence)}</li>`,
    );
  }
  if (after.failureProfile) {
    lines.push(
      `<li><strong>Primary failure family:</strong> ${esc(after.failureProfile.primaryFailureFamily)}</li>`,
    );
    lines.push(
      `<li><strong>Deterministic issues:</strong> ${esc(
        after.failureProfile.deterministicIssues.join(' | ') || 'none',
      )}</li>`,
    );
    lines.push(
      `<li><strong>Manual-only issues:</strong> ${esc(
        after.failureProfile.manualOnlyIssues.join(' | ') || 'none',
      )}</li>`,
    );
  }
  return lines.join('');
}

function detectionBullets(after: AnalysisResult): string {
  if (!after.detectionProfile) return '';
  const lines: string[] = [];
  const ro = after.detectionProfile.readingOrderSignals;
  const pdfUa = after.detectionProfile.pdfUaSignals;
  const list = after.detectionProfile.listSignals;
  const table = after.detectionProfile.tableSignals;
  if (ro.missingStructureTree) lines.push('<li><strong>Reading order:</strong> missing structure tree</li>');
  if (ro.annotationOrderRiskCount > 0) {
    lines.push(`<li><strong>Reading order:</strong> annotation order risk on ${ro.annotationOrderRiskCount} page(s)</li>`);
  }
  if (ro.annotationStructParentRiskCount > 0) {
    lines.push(`<li><strong>Annotations:</strong> ${ro.annotationStructParentRiskCount} visible annotation(s) missing /StructParent</li>`);
  }
  if (ro.headerFooterPollutionRisk) {
    lines.push('<li><strong>Reading order:</strong> repeated header/footer boundary text detected</li>');
  }
  if (ro.sampledStructurePageOrderDriftCount > 0) {
    lines.push(`<li><strong>Reading order:</strong> sampled structure/page-order drift count ${ro.sampledStructurePageOrderDriftCount}</li>`);
  }
  if (pdfUa.orphanMcidCount > 0) {
    lines.push(`<li><strong>PDF/UA:</strong> orphan MCIDs ${pdfUa.orphanMcidCount}</li>`);
  }
  if (pdfUa.suspectedPathPaintOutsideMc > 0) {
    lines.push(`<li><strong>PDF/UA:</strong> suspected path paint outside marked content ${pdfUa.suspectedPathPaintOutsideMc}</li>`);
  }
  if (list.listItemMisplacedCount + list.lblBodyMisplacedCount + list.listsWithoutItems > 0) {
    lines.push(
      `<li><strong>Lists:</strong> misplaced LI ${list.listItemMisplacedCount}, misplaced Lbl/LBody ${list.lblBodyMisplacedCount}, lists without items ${list.listsWithoutItems}</li>`,
    );
  }
  if (table.misplacedCellCount + table.stronglyIrregularTableCount > 0) {
    lines.push(
      `<li><strong>Tables:</strong> misplaced cells ${table.misplacedCellCount}, strongly irregular tables ${table.stronglyIrregularTableCount}</li>`,
    );
  }
  return lines.join('');
}

function planningBullets(summary?: PlanningSummary | null): string {
  if (!summary) return '';
  const lines: string[] = [];
  lines.push(`<li><strong>Primary route:</strong> ${esc(summary.primaryRoute ?? 'none')}</li>`);
  lines.push(`<li><strong>Secondary routes:</strong> ${esc(summary.secondaryRoutes.join(' | ') || 'none')}</li>`);
  lines.push(`<li><strong>Triggers:</strong> ${esc(summary.triggeringSignals.join(' | ') || 'none')}</li>`);
  lines.push(`<li><strong>Scheduled tools:</strong> ${esc(summary.scheduledTools.join(' | ') || 'none')}</li>`);
  lines.push(`<li><strong>Semantic deferred:</strong> ${summary.semanticDeferred ? 'yes' : 'no'}</li>`);
  if (summary.skippedTools.length > 0) {
    lines.push(
      `<li><strong>Skipped tools:</strong> ${esc(
        summary.skippedTools.map(row => `${row.toolName}:${row.reason}`).join(' | '),
      )}</li>`,
    );
  }
  return lines.join('');
}

function structuralConfidenceBullets(summary?: StructuralConfidenceGuardSummary | null): string {
  if (!summary) return '';
  const lines: string[] = [];
  lines.push(`<li><strong>Structural-confidence rollbacks:</strong> ${summary.rollbackCount}</li>`);
  if (summary.lastRollbackReason) {
    lines.push(`<li><strong>Last rollback reason:</strong> ${esc(summary.lastRollbackReason)}</li>`);
  }
  return lines.join('');
}

function remediationOutcomeBullets(summary?: RemediationOutcomeSummary | null): string {
  if (!summary) return '';
  const lines: string[] = [];
  lines.push(`<li><strong>Document outcome:</strong> ${esc(summary.documentStatus)}</li>`);
  lines.push(`<li><strong>Targeted families:</strong> ${esc(summary.targetedFamilies.join(' | ') || 'none')}</li>`);
  for (const family of summary.familySummaries) {
    lines.push(
      `<li><strong>${esc(family.family)}:</strong> ${esc(
        `${family.status} (${family.beforeSignalCount}->${family.afterSignalCount})`,
      )}</li>`,
    );
    if (family.residualSignals.length > 0) {
      lines.push(
        `<li><strong>${esc(family.family)} residuals:</strong> ${esc(family.residualSignals.join(' | '))}</li>`,
      );
    }
  }
  return lines.join('');
}

function semanticBullets(summaries?: SemanticRemediationSummary[]): string {
  if (!summaries || summaries.length === 0) return '';
  const lines: string[] = [];
  for (const summary of summaries) {
    lines.push(
      `<li><strong>${esc(summary.lane)}:</strong> ${esc(
        `${summary.skippedReason} / ${summary.changeStatus} / accepted ${summary.proposalsAccepted} / rejected ${summary.proposalsRejected}${summary.trustDowngraded ? ' / trust_capped' : ''}`,
      )}</li>`,
    );
    lines.push(
      `<li><strong>${esc(summary.lane)} gate:</strong> ${esc(
        `${summary.gate.reason} (${summary.gate.candidateCountBefore}->${summary.gate.candidateCountAfter})`,
      )}</li>`,
    );
  }
  return lines.join('');
}

/**
 * Self-contained HTML accessibility summary (inline CSS, no CDN).
 * Safe for embedding: filenames and messages are escaped.
 */
export function generateHtmlReport(
  before: AnalysisResult,
  after: AnalysisResult | null,
  appliedTools: AppliedRemediationTool[],
  options?: HtmlReportOptions,
): string {
  const showBeforeAfter = options?.includeBeforeAfter !== false;
  const showFindings = options?.includeFindingsDetail !== false;
  const showTools = options?.includeAppliedTools !== false;

  const title = esc(before.filename.replace(/\.pdf$/i, '') || 'Document');
  const date = esc(new Date().toISOString());
  const afterRef = after ?? before;

  const ocrNotice =
    options?.ocrPipeline?.humanReviewRecommended === true
      ? `
<section class="warn">
  <h2>OCR notice</h2>
  <p><strong>${options.ocrPipeline!.applied ? 'OCR was applied' : 'OCR was attempted'}</strong> — ${esc(options.ocrPipeline!.guidance)}</p>
</section>`
      : '';

  const keyFindings = findingsBlocking(afterRef.findings).slice(0, 50);
  const remainingCats = afterRef.categories.filter(
    c => c.applicable && c.countsTowardGrade && (c.score ?? 100) < REMEDIATION_CATEGORY_THRESHOLD,
  );

  const applied = appliedTools.filter(t => t.outcome === 'applied');

  const scoreBar = (score: number) =>
    `<div class="bar"><div class="barfill" style="width:${Math.min(100, Math.max(0, score))}%"></div></div>`;

  let compareSection = '';
  if (showBeforeAfter && after) {
    compareSection = `
<section>
  <h2>Score comparison</h2>
  <p><strong>Before:</strong> ${overallScoreValue(before)} (${esc(gradeValue(before))}) ${scoreBar(overallScoreValue(before))}</p>
  <p><strong>After:</strong> ${overallScoreValue(after)} (${esc(gradeValue(after))}) ${scoreBar(overallScoreValue(after))}</p>
</section>`;
  }

  let findingsSection = '';
  if (showFindings) {
    const bullets =
      keyFindings.length === 0
        ? '<li>No blocking or moderate findings in the final analysis snapshot.</li>'
        : keyFindings
            .map(
              f =>
                `<li><strong>${esc(f.wcag)}</strong> — ${esc(f.message)}${
                  f.page != null ? ` <span class="muted">(page ${f.page})</span>` : ''
                }</li>`,
            )
            .join('');
    findingsSection = `
<section>
  <h2>Key findings</h2>
  <ul>${bullets}</ul>
</section>`;
  }

  let toolsSection = '';
  if (showTools && applied.length > 0) {
    toolsSection = `
<section>
  <h2>Applied repairs</h2>
  <ul>
    ${applied.map(t => `<li><code>${esc(t.toolName)}</code> — ${esc(t.outcome)}</li>`).join('')}
  </ul>
</section>`;
  }

  const catRows = afterRef.categories
    .map(
      c =>
        `<tr><td>${esc(c.key)}</td><td>${c.score ?? 'n/a'}</td><td>${esc(c.severity)}</td><td>${c.countsTowardGrade ? 'graded' : c.diagnosticOnly ? 'optional' : 'unmeasured'}</td><td>${c.findings.length}</td></tr>`,
    )
    .join('');

  const remainingList =
    remainingCats.length === 0
      ? '<p>No categories remain below the remediation planning threshold.</p>'
      : `<ul>${remainingCats.map(c => `<li><strong>${esc(c.key)}</strong> at score ${c.score ?? 'n/a'}</li>`).join('')}</ul>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Accessibility report — ${title}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;margin:1.5rem;line-height:1.45;color:#111;max-width:52rem}
  h1{font-size:1.5rem;margin-bottom:0.25rem}
  h2{font-size:1.15rem;margin-top:1.5rem;border-bottom:1px solid #ccc;padding-bottom:0.25rem}
  .muted{color:#555;font-size:0.9rem}
  .grade{font-size:3rem;font-weight:700;margin:0.5rem 0}
  table{border-collapse:collapse;width:100%;font-size:0.9rem}
  th,td{border:1px solid #ddd;padding:0.35rem 0.5rem;text-align:left}
  th{background:#f4f4f4}
  .bar{height:10px;background:#eee;border-radius:4px;overflow:hidden;max-width:20rem}
  .barfill{height:100%;background:#2563eb}
  .warn{border:1px solid #b45309;background:#fffbeb;padding:0.75rem 1rem;border-radius:6px;margin-top:1rem}
  .warn h2{margin-top:0;border-bottom:none}
  footer{margin-top:2rem;font-size:0.85rem;color:#555;border-top:1px solid #ddd;padding-top:0.75rem}
  @media print{body{margin:0.5rem}a{color:inherit}}
</style>
</head>
<body>
  <header>
    <h1>Accessibility report</h1>
    <p class="muted">${title} · Generated ${date}</p>
    <p class="grade" aria-label="Final grade">${esc(gradeValue(afterRef))}</p>
    <p>Legal score: <strong>${overallScoreValue(afterRef)}</strong> / 100</p>
    <p>Optional diagnostics: <strong>${esc(afterRef.scoreProfile?.nonGradedCategories.join(', ') ?? 'bookmarks, pdf_ua_compliance, color_contrast')}</strong></p>
  </header>
  ${compareSection}
  ${ocrNotice}
  <section>
    <h2>Verification summary</h2>
    <ul>${verificationBullets(afterRef)}</ul>
  </section>
  <section>
    <h2>Structural classification</h2>
    <ul>${classificationBullets(afterRef) || '<li>No Stage 2 classification metadata present.</li>'}</ul>
  </section>
  <section>
    <h2>Detection signals</h2>
    <ul>${detectionBullets(afterRef) || '<li>No Stage 3 detection metadata present.</li>'}</ul>
  </section>
  <section>
    <h2>Planner routing</h2>
    <ul>${planningBullets(options?.planningSummary) || '<li>No Stage 4 planner metadata present.</li>'}</ul>
    ${options?.structuralConfidenceGuard
      ? `<ul>${structuralConfidenceBullets(options.structuralConfidenceGuard)}</ul>`
      : ''}
  </section>
  <section>
    <h2>Remediation outcomes</h2>
    <ul>${remediationOutcomeBullets(options?.remediationOutcomeSummary) || '<li>No Stage 5 remediation outcome metadata present.</li>'}</ul>
  </section>
  <section>
    <h2>Semantic passes</h2>
    <ul>${semanticBullets(options?.semanticSummaries) || '<li>No Stage 6 semantic metadata present.</li>'}</ul>
  </section>
  <section>
    <h2>Category scores</h2>
    <table>
      <thead><tr><th>Category</th><th>Score</th><th>Severity</th><th>Mode</th><th>Findings</th></tr></thead>
      <tbody>${catRows}</tbody>
    </table>
  </section>
  ${findingsSection}
  ${toolsSection}
  <section>
    <h2>Remaining issues</h2>
    ${remainingList}
  </section>
  <footer>Generated by PDFAF v2 · WCAG-oriented automated assessment (not a legal determination)</footer>
</body>
</html>`;
}
