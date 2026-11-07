/** M08: modelos del navegador; acceso opcional a artefactos Keras históricos. */
import ModuleExperience from '../../app/ModuleExperience';
import LocalModels from './Models';
import RemoteModels from './RemoteModels';

export default function ModelsHub() {
  return <ModuleExperience page="models" browser={<LocalModels/>} historical={<RemoteModels/>}/>;
}
