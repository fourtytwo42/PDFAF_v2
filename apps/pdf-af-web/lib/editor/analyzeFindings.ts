import type { NormalizedFinding } from '../../types/analyze';
import type { EditorIssue, EditorIssueSeverity, EditorIssueSource } from '../../types/editor';

function mapFindingSeverity(severity: NormalizedFinding['severity']): EditorIssueSeverity {
  if (severity === 'critical' || severity === 'moderate') return 'blocker';
  if (severity === 'minor') return 'warning';
  return 'info';
}

function isUnevaluatedColorContrastFinding(finding: NormalizedFinding): boolean {
  const detailText = `${finding.category} ${finding.title} ${finding.summary}`.toLowerCase();
  return (
    finding.category === 'color_contrast' &&
    (/not evaluated|not measured|no pixel sampling|does not perform rendered pixel/.test(detailText))
  );
}

interface AnalyzeFindingIssueOptions {
  source: Extract<EditorIssueSource, 'analyzer' | 'export-check'>;
  idPrefix: string;
  fixTypePrefix: string;
}

export function mapAnalyzeFindingsToEditorIssues(
  findings: NormalizedFinding[],
  options: AnalyzeFindingIssueOptions = {
    source: 'export-check',
    idPrefix: 'export',
    fixTypePrefix: 'export',
  },
): EditorIssue[] {
  return findings.map((finding, index) => {
    const unevaluatedContrast = isUnevaluatedColorContrastFinding(finding);
    return {
      id: `${options.idPrefix}:${finding.id || index}`,
      source: options.source,
      category: finding.category,
      severity: unevaluatedContrast ? 'info' : mapFindingSeverity(finding.severity),
      page: finding.page,
      target: finding.objectRef ? { objectRef: finding.objectRef } : undefined,
      bounds: finding.bounds,
      message: finding.title || finding.summary,
      whyItMatters: finding.summary,
      fixType: `${options.fixTypePrefix}_${finding.category}`,
      fixState: unevaluatedContrast ? 'fixed' : 'needs-input',
      standardsLinks: finding.references,
    };
  });
}
