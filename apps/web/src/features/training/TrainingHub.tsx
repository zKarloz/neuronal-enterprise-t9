/** M06 híbrido: conserva intacto el motor local y habilita la ejecución remota. */
import { useUrlMode } from '../../app/useUrlMode';
import { ModeTabs } from '../../components/ui';
import LocalTraining from './Training';
import RemoteTraining from './RemoteTraining';
import type { Page } from '../../app/App';

export default function TrainingHub({ navigate }: { navigate: (page: Page) => void }) {
  const [mode, setMode] = useUrlMode();
  return <>
    <ModeTabs mode={mode} setMode={setMode} label="Modo de entrenamiento"/>
    {mode === 'local' ? <LocalTraining navigate={navigate}/> : <RemoteTraining navigate={navigate}/>}
  </>;
}
