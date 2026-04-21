import type { StoredFileStatus } from '../../types/files';
import type { AnalyzeSummary } from '../../types/analyze';

export type EditorHandoffSource = 'fixed' | 'source' | 'unavailable';

export function chooseEditorHandoffSource(input: {
  fileStatus: StoredFileStatus;
  hasServerSource: boolean;
}): EditorHandoffSource {
  if (input.fileStatus === 'available') return 'fixed';
  if (input.hasServerSource) return 'source';
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
  if (source === 'source') return input.analyzeResult ?? input.remediationResult?.before ?? null;
  return null;
}
