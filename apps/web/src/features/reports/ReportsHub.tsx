/** M09: reportes locales como experiencia principal. */
import ModuleExperience from '../../app/ModuleExperience';
import LocalReports from './Reports';
import RemoteReports from './RemoteReports';

export default function ReportsHub() {
  return <ModuleExperience page="reports" browser={<LocalReports/>} historical={<RemoteReports/>}/>;
}
