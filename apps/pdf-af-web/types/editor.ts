import type { ReactNode } from 'react';

export type EditorMode = 'create' | 'edit';

export type EditorIssueSource = 'authoring-validator' | 'analyzer' | 'remediation' | 'export-check';

export type EditorIssueSeverity = 'blocker' | 'warning' | 'info';

export type EditorIssueFixState = 'open' | 'needs-input' | 'ready' | 'fixed';

export type EditorReadinessStatus = 'ready' | 'needs_attention' | 'blocked';

export interface EditorIssueBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EditorIssueTarget {
  pageId?: string;
  objectId?: string;
  objectRef?: string;
  label?: string;
}

export interface EditorReferenceLink {
  label: string;
  href: string;
  source?: 'wcag' | 'adobe' | 'internal' | 'other';
}

export interface EditorIssue {
  id: string;
  source: EditorIssueSource;
  category: string;
  severity: EditorIssueSeverity;
  page?: number;
  target?: EditorIssueTarget;
  bounds?: EditorIssueBounds;
  message: string;
  whyItMatters?: string;
  fixType: string;
  fixState: EditorIssueFixState;
  standardsLinks?: EditorReferenceLink[];
}

export interface EditorIssueFilter {
  severity?: EditorIssueSeverity | 'all';
  category?: string | 'all';
  fixState?: EditorIssueFixState | 'unresolved' | 'all';
}

export interface EditorReadinessSummary {
  status: EditorReadinessStatus;
  totalIssues: number;
  unresolvedIssues: number;
  blockerCount: number;
  warningCount: number;
  infoCount: number;
  fixedCount: number;
}

export interface EditorShellModeConfig {
  mode: EditorMode;
  title: string;
  subtitle?: string;
  emptyTitle: string;
  emptyDescription?: string;
  primaryActionLabel?: string;
}

export interface EditorShellSlots {
  leftRail?: ReactNode;
  toolbar?: ReactNode;
  workspace?: ReactNode;
  inspector?: ReactNode;
  statusStrip?: ReactNode;
}
