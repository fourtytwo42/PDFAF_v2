import type { StoredFileStatus } from '../../types/files';
import type { AnalyzeSummary } from '../../types/analyze';

export type EditorHandoffSource = 'fixed' | 'source' | 'unavailable';

export function chooseEditorHandoffSource(input: {
  fileStatus: StoredFileStatus;
  hasServerSource: boolean;
  remediationResult?: {
    before: AnalyzeSummary;
    after: AnalyzeSummary;
  };
}): EditorHandoffSource {
  if (input.fileStatus === 'available' && input.remediationResult) return 'fixed';
  return 'unavailable';
}

export function chooseEditorHandoffAnalysis(input: {
  fileStatus: StoredFileStatus;
  hasServerSource: boolean;
  analyzeResult?: AnalyzeSummary;
  remediationResult?: {
    before: AnalyzeSummary;
    after: AnalyzeSummary;
  };
}): AnalyzeSummary | null {
  const source = chooseEditorHandoffSource(input);
  if (source === 'fixed') return input.remediationResult?.after ?? input.analyzeResult ?? null;
  return null;
}
