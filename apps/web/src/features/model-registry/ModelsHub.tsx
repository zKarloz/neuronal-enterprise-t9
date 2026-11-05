/** M08 híbrido: conserva inferencia local y agrega el registro remoto autorizado. */
import { useUrlMode } from '../../app/useUrlMode';
import { ModeTabs } from '../../components/ui';
import LocalModels from './Models';
import RemoteModels from './RemoteModels';

export default function ModelsHub() {
  const [mode, setMode] = useUrlMode(true);
  return <>
    <ModeTabs mode={mode} setMode={setMode} label="Origen del registro de modelos"/>
    {mode === 'local' ? <LocalModels/> : <RemoteModels/>}
  </>;
}
