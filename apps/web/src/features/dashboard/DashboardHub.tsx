/** Selector de métricas locales o persistidas; cuenta autenticada inicia en Servidor. */
import { useUrlMode } from '../../app/useUrlMode';
import { ModeTabs } from '../../components/ui';
import LocalDashboard from './Dashboard';
import RemoteDashboard from './RemoteDashboard';
import type { Page } from '../../lib/page-routes';
export default function DashboardHub({ navigate, onNewProject }: { navigate: (page: Page) => void; onNewProject: () => void }) {
  const [mode, setMode] = useUrlMode(false, true);
  return <><ModeTabs mode={mode} setMode={setMode} label="Origen de indicadores del panel"/>
    {mode === 'server' ? <RemoteDashboard navigate={navigate}/> : <LocalDashboard navigate={navigate} onNewProject={onNewProject}/>}
  </>;
}
