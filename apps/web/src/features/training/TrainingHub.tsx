/** M06 híbrido: conserva intacto el motor local y habilita la ejecución remota. */
import { useUrlMode } from '../../app/useUrlMode';
import { Cloud, HardDrive } from 'lucide-react';
import LocalTraining from './Training';
import RemoteTraining from './RemoteTraining';
import type { Page } from '../../app/App';

export default function TrainingHub({ navigate }: { navigate: (page: Page) => void }) {
  const [mode, setMode] = useUrlMode();
  return <>
    <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Modo de entrenamiento">
      <button type="button" className={mode === 'local' ? 'btn-primary' : 'btn-outline'} aria-pressed={mode === 'local'} onClick={() => setMode('local')}><HardDrive size={16}/> Navegador</button>
      <button type="button" className={mode === 'server' ? 'btn-primary' : 'btn-outline'} aria-pressed={mode === 'server'} onClick={() => setMode('server')}><Cloud size={16}/> Servidor</button>
    </div>
    {mode === 'local' ? <LocalTraining navigate={navigate}/> : <RemoteTraining navigate={navigate}/>}
  </>;
}
