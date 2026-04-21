import { EditEditorWorkspace } from '../../components/editor/edit/EditEditorWorkspace';
import { getFrontendConfig } from '../../lib/constants/config';

export default function EditPage() {
  const config = getFrontendConfig();

  return <EditEditorWorkspace defaultApiBaseUrl={config.defaultApiBaseUrl} />;
}
