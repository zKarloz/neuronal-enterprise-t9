/** M01: panel local primero; datos remotos solo mediante herramientas avanzadas. */
import ModuleExperience from '../../app/ModuleExperience';
import LocalDashboard from './Dashboard';
import RemoteDashboard from './RemoteDashboard';
import type { Page } from '../../lib/page-routes';
export default function DashboardHub({ navigate, onNewProject }: { navigate: (page: Page) => void; onNewProject: () => void }) {
  return <ModuleExperience page="dashboard" browser={<LocalDashboard navigate={navigate} onNewProject={onNewProject}/>} historical={<RemoteDashboard navigate={navigate}/>}/>;
}
