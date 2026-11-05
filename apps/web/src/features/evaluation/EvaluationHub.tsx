/** M07 híbrido: conserva evaluación local e incorpora métricas de trabajos remotos. */
import { useUrlMode } from '../../app/useUrlMode';
import { ModeTabs } from '../../components/ui';
import LocalEvaluation from './Evaluation';
import RemoteEvaluation from './RemoteEvaluation';

export default function EvaluationHub() {
  const [mode, setMode] = useUrlMode();
  return <>
    <ModeTabs mode={mode} setMode={setMode} label="Origen de las evaluaciones"/>
    {mode === 'local' ? <LocalEvaluation/> : <RemoteEvaluation/>}
  </>;
}
