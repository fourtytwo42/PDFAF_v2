import { CreateEditorWorkspace } from '../../components/editor/create/CreateEditorWorkspace';
import { getFrontendConfig } from '../../lib/constants/config';

export default function CreatePage() {
  const config = getFrontendConfig();

  return <CreateEditorWorkspace defaultApiBaseUrl={config.defaultApiBaseUrl} />;
}
