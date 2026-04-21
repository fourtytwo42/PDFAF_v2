import type {
  EditorIssue,
  EditorIssueFilter,
  EditorIssueFixState,
  EditorIssueSeverity,
  EditorReadinessStatus,
  EditorReadinessSummary,
} from '../../types/editor';

const severityRank: Record<EditorIssueSeverity, number> = {
  blocker: 0,
  warning: 1,
  info: 2,
};

const fixStateRank: Record<EditorIssueFixState, number> = {
  open: 0,
  'needs-input': 1,
  ready: 2,
  fixed: 3,
};

export function isIssueResolved(issue: EditorIssue): boolean {
  return issue.fixState === 'fixed';
}

export function filterEditorIssues(
  issues: EditorIssue[],
  filter: EditorIssueFilter = {},
): EditorIssue[] {
  return issues.filter((issue) => {
    const severity = filter.severity ?? 'all';
    if (severity !== 'all' && issue.severity !== severity) return false;

    const category = filter.category ?? 'all';
    if (category !== 'all' && issue.category !== category) return false;

    const fixState = filter.fixState ?? 'all';
    if (fixState === 'unresolved') return !isIssueResolved(issue);
    if (fixState !== 'all' && issue.fixState !== fixState) return false;

    return true;
  });
}

export function sortEditorIssues(issues: EditorIssue[]): EditorIssue[] {
  return [...issues].sort((left, right) => {
    const severityDelta = severityRank[left.severity] - severityRank[right.severity];
    if (severityDelta !== 0) return severityDelta;

    const leftPage = left.page ?? Number.MAX_SAFE_INTEGER;
    const rightPage = right.page ?? Number.MAX_SAFE_INTEGER;
    if (leftPage !== rightPage) return leftPage - rightPage;

    const fixStateDelta = fixStateRank[left.fixState] - fixStateRank[right.fixState];
    if (fixStateDelta !== 0) return fixStateDelta;

    return left.message.localeCompare(right.message);
  });
}

export function classifyReadiness(issues: EditorIssue[]): EditorReadinessStatus {
  const unresolved = issues.filter((issue) => !isIssueResolved(issue));

  if (unresolved.some((issue) => issue.severity === 'blocker')) {
    return 'blocked';
  }

  if (unresolved.some((issue) => issue.severity === 'warning')) {
    return 'needs_attention';
  }

  return 'ready';
}

export function computeReadinessSummary(issues: EditorIssue[]): EditorReadinessSummary {
  const unresolved = issues.filter((issue) => !isIssueResolved(issue));

  return {
    status: classifyReadiness(issues),
    totalIssues: issues.length,
    unresolvedIssues: unresolved.length,
    blockerCount: unresolved.filter((issue) => issue.severity === 'blocker').length,
    warningCount: unresolved.filter((issue) => issue.severity === 'warning').length,
    infoCount: unresolved.filter((issue) => issue.severity === 'info').length,
    fixedCount: issues.filter(isIssueResolved).length,
  };
}

export function findAdjacentIssueId(
  issues: EditorIssue[],
  selectedIssueId: string | null,
  direction: 'next' | 'previous',
): string | null {
  if (issues.length === 0) return null;
  if (!selectedIssueId) return issues[0]?.id ?? null;

  const selectedIndex = issues.findIndex((issue) => issue.id === selectedIssueId);
  if (selectedIndex === -1) return issues[0]?.id ?? null;

  const delta = direction === 'next' ? 1 : -1;
  const nextIndex = (selectedIndex + delta + issues.length) % issues.length;
  return issues[nextIndex]?.id ?? null;
}
