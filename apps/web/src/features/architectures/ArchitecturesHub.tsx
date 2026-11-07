/** M04: el diseñador del navegador es la interfaz principal. */
import ModuleExperience from '../../app/ModuleExperience';
import LocalArchitectures from './Architectures';
import RemoteArchitectures from './RemoteArchitectures';
import type { Page } from '../../lib/page-routes';
export default function ArchitecturesHub({ navigate }: { navigate: (page: Page) => void }) {
  return <ModuleExperience page="architectures" browser={<LocalArchitectures navigate={navigate}/>} historical={<RemoteArchitectures/>}/>;
}
