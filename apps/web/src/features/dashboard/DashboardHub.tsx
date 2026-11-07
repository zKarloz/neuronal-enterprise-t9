/** M01: una sola vista por cuenta; TensorFlow.js permanece en el navegador. */
import LocalDashboard from './Dashboard';
import type { Page } from '../../lib/page-routes';
export default function DashboardHub({ navigate, onNewProject }: { navigate: (page: Page) => void; onNewProject: () => void }) {
  return <LocalDashboard navigate={navigate} onNewProject={onNewProject}/>;
}
