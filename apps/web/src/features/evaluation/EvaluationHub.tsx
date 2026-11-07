/** M07: métricas y comparaciones locales; histórico remoto bajo configuración. */
import ModuleExperience from '../../app/ModuleExperience';
import LocalEvaluation from './Evaluation';
import RemoteEvaluation from './RemoteEvaluation';

export default function EvaluationHub() {
  return <ModuleExperience page="evaluation" browser={<LocalEvaluation/>} historical={<RemoteEvaluation/>}/>;
}
