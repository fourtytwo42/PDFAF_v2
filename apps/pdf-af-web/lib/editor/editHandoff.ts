import type { StoredFileStatus } from '../../types/files';

export type EditorHandoffSource = 'fixed' | 'source' | 'unavailable';

export function chooseEditorHandoffSource(input: {
  fileStatus: StoredFileStatus;
  hasServerSource: boolean;
}): EditorHandoffSource {
  if (input.fileStatus === 'available') return 'fixed';
  if (input.hasServerSource) return 'source';
  return 'unavailable';
}
