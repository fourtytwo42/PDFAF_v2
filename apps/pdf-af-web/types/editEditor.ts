import type { AnalyzeSummary } from './analyze';
import type { EditorIssue, EditorIssueFilter } from './editor';

export type EditAnalyzeStatus = 'idle' | 'hydrating' | 'analyzing' | 'complete' | 'failed';

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

export interface EditEditorStateSnapshot {
  sourceFile: EditSourceFileMetadata | null;
  analyzeStatus: EditAnalyzeStatus;
  analyzeError: string | null;
  selectedIssueId: string | null;
  issueFilter: EditorIssueFilter;
  lastAnalyzeResult: AnalyzeSummary | null;
  issues: EditorIssue[];
}
