import type { AnalyzeSummary } from './analyze';
import type { EditorIssue, EditorIssueFilter } from './editor';

export type EditAnalyzeStatus = 'idle' | 'hydrating' | 'analyzing' | 'complete' | 'failed';
export type EditRenderStatus = 'idle' | 'loading' | 'rendering' | 'ready' | 'failed';

export interface EditSourceFileMetadata {
  fileName: string;
  fileSize: number;
  mimeType: string;
  updatedAt: string;
}

export interface EditStoredSourceFile {
  metadata: EditSourceFileMetadata;
  blob: Blob;
}

export type EditFixInstruction =
  | {
      type: 'set_document_title';
      title: string;
    }
  | {
      type: 'set_document_language';
      language: string;
    }
  | {
      type: 'set_figure_alt_text';
      objectRef: string;
      altText: string;
    }
  | {
      type: 'mark_figure_decorative';
      objectRef: string;
    };

export type EditApplyStatus = 'idle' | 'applying' | 'complete' | 'failed';

export interface EditAppliedFix {
  type: EditFixInstruction['type'];
  outcome: 'applied' | 'no_effect';
}

export interface EditRejectedFix {
  type: EditFixInstruction['type'];
  reason: string;
}

export interface EditApplyFixesResult {
  before: AnalyzeSummary;
  after: AnalyzeSummary;
  fixedPdfBlob: Blob;
  appliedFixes: EditAppliedFix[];
  rejectedFixes: EditRejectedFix[];
}

export interface EditEditorStateSnapshot {
  sourceFile: EditSourceFileMetadata | null;
  analyzeStatus: EditAnalyzeStatus;
  analyzeError: string | null;
  selectedIssueId: string | null;
  issueFilter: EditorIssueFilter;
  lastAnalyzeResult: AnalyzeSummary | null;
  issues: EditorIssue[];
  selectedPage: number;
  zoom: number;
  renderStatus: EditRenderStatus;
  renderError: string | null;
  pendingFixes: EditFixInstruction[];
  applyStatus: EditApplyStatus;
  applyError: string | null;
  fixedSourceBlob: Blob | null;
  scoreDelta: number | null;
}
