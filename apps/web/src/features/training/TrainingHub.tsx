/** M06: entrenamiento del cliente; la cola Python queda en compatibilidad. */
import ModuleExperience from '../../app/ModuleExperience';
import LocalTraining from './Training';
import RemoteTraining from './RemoteTraining';
import type { Page } from '../../app/App';

export default function TrainingHub({ navigate }: { navigate: (page: Page) => void }) {
  return <ModuleExperience page="training" browser={<LocalTraining navigate={navigate}/>} historical={<RemoteTraining navigate={navigate}/>}/>;
}
