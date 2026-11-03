/** M07 híbrido: conserva evaluación local e incorpora métricas de trabajos remotos. */
import { useState } from 'react';
import { Cloud, HardDrive } from 'lucide-react';
import LocalEvaluation from './Evaluation';
import RemoteEvaluation from './RemoteEvaluation';

export default function EvaluationHub() {
  const [mode, setMode] = useState<'local' | 'server'>('local');
  return <>
    <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Origen de las evaluaciones">
      <button type="button" className={mode === 'local' ? 'btn-primary' : 'btn-outline'} aria-pressed={mode === 'local'} onClick={() => setMode('local')}><HardDrive size={16}/> Navegador</button>
      <button type="button" className={mode === 'server' ? 'btn-primary' : 'btn-outline'} aria-pressed={mode === 'server'} onClick={() => setMode('server')}><Cloud size={16}/> Servidor</button>
    </div>
    {mode === 'local' ? <LocalEvaluation/> : <RemoteEvaluation/>}
  </>;
}
