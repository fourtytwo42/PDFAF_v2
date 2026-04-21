import type { NormalizedFinding } from '../../types/analyze';
import type { EditorIssue, EditorIssueSeverity, EditorIssueSource } from '../../types/editor';

function mapFindingSeverity(severity: NormalizedFinding['severity']): EditorIssueSeverity {
  if (severity === 'critical' || severity === 'moderate') return 'blocker';
  if (severity === 'minor') return 'warning';
  return 'info';
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
  return findings.map((finding, index) => ({
    id: `${options.idPrefix}:${finding.id || index}`,
    source: options.source,
    category: finding.category,
    severity: mapFindingSeverity(finding.severity),
    page: finding.page,
    target: finding.objectRef ? { objectRef: finding.objectRef } : undefined,
    bounds: finding.bounds,
    message: finding.title || finding.summary,
    whyItMatters: finding.summary,
    fixType: `${options.fixTypePrefix}_${finding.category}`,
    fixState: 'needs-input',
    standardsLinks: finding.references,
  }));
}
