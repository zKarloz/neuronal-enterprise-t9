/** M10: administración local con acceso optativo a auditoría remota. */
import ModuleExperience from '../../app/ModuleExperience';
import LocalAdministration from './Administration';
import RemoteAdministration from './RemoteAdministration';

export default function AdministrationHub() {
  return <ModuleExperience page="administration" browser={<LocalAdministration/>} historical={<RemoteAdministration/>}/>;
}
