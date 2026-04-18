import { DashboardShell } from '../components/common/DashboardShell';
import { getFrontendConfig } from '../lib/constants/config';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const config = getFrontendConfig();

  return <DashboardShell defaultApiBaseUrl={config.defaultApiBaseUrl} />;
}

