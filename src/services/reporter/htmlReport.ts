import { REMEDIATION_CATEGORY_THRESHOLD } from '../../config.js';
import type {
  AnalysisResult,
  AppliedRemediationTool,
  Finding,
  OcrPipelineSummary,
} from '../../types.js';

export interface HtmlReportOptions {
  includeBeforeAfter?: boolean;
  includeFindingsDetail?: boolean;
  includeAppliedTools?: boolean;
  /** When set, shows a prominent human-review notice (OCR scores are not PAC-equivalent). */
  ocrPipeline?: OcrPipelineSummary | null;
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
    c => c.applicable && c.score < REMEDIATION_CATEGORY_THRESHOLD,
  );

  const applied = appliedTools.filter(t => t.outcome === 'applied');

  const scoreBar = (score: number) =>
    `<div class="bar"><div class="barfill" style="width:${Math.min(100, Math.max(0, score))}%"></div></div>`;

  let compareSection = '';
  if (showBeforeAfter && after) {
    compareSection = `
<section>
  <h2>Score comparison</h2>
  <p><strong>Before:</strong> ${before.score} (${esc(before.grade)}) ${scoreBar(before.score)}</p>
  <p><strong>After:</strong> ${after.score} (${esc(after.grade)}) ${scoreBar(after.score)}</p>
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
        `<tr><td>${esc(c.key)}</td><td>${c.score}</td><td>${esc(c.severity)}</td><td>${c.findings.length}</td></tr>`,
    )
    .join('');

  const remainingList =
    remainingCats.length === 0
      ? '<p>No categories remain below the remediation planning threshold.</p>'
      : `<ul>${remainingCats.map(c => `<li><strong>${esc(c.key)}</strong> at score ${c.score}</li>`).join('')}</ul>`;

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
    <p class="grade" aria-label="Final grade">${esc(afterRef.grade)}</p>
    <p>Overall score: <strong>${afterRef.score}</strong> / 100</p>
  </header>
  ${compareSection}
  ${ocrNotice}
  <section>
    <h2>Verification summary</h2>
    <ul>${verificationBullets(afterRef)}</ul>
  </section>
  <section>
    <h2>Category scores</h2>
    <table>
      <thead><tr><th>Category</th><th>Score</th><th>Severity</th><th>Findings</th></tr></thead>
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
