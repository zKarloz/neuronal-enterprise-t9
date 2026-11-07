// Control de entrenamiento real en navegador, validaciones y monitor de épocas.
import { useEffect, useState } from 'react';
import { Activity, Ban, CheckCircle2, CirclePlay, Clock3, Database, Network, Play, SlidersHorizontal } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceProvider';
import { validateTraining } from '../../lib/neural';
import { validateCnnTraining } from '../../lib/cnn';
import { isDigitsDataset } from '../../lib/digits';
import { MetricChart } from '../../components/MetricChart';
import { EmptyState, Heading, Notice, SectionTitle, StatusPill, formatDate, formatMetric } from '../../components/ui';
import type { TrainingConfig } from '../../types/domain';
import type { Page } from '../../app/App';

export default function Training({ navigate }: { navigate: (page: Page) => void }) {
  const { data, activeProject, activeArchitecture, selectArchitecture, isTraining, startTraining, cancelTraining } = useWorkspace();
  const [config, setConfig] = useState<TrainingConfig>({ epochs: 30, batchSize: 16, learningRate: 0.05, validationSplit: 0.2, seed: 42, task: 'classification' });
  const [error, setError] = useState('');
  // Cada familia tiene sus propios hiperparámetros: nunca se reutiliza el LR alto de Feedforward en Adam.
  useEffect(() => {
    if (activeArchitecture?.family === 'cnn') setConfig({ epochs: 12, batchSize: 32, learningRate: 0.003, validationSplit: 0.2, seed: 42, task: 'multiclass' });
    else setConfig({ epochs: 30, batchSize: 16, learningRate: 0.05, validationSplit: 0.2, seed: 42, task: 'classification' });
  }, [activeArchitecture?.family]);
  if (!activeProject) return <><Heading eyebrow="Entrenamiento · M06" title="Entrenamientos"/><div className="panel"><EmptyState icon={<Activity size={26}/>} title="Selecciona un proyecto" description="El entrenamiento necesita un proyecto, dataset y arquitectura." action={<button className="btn-primary" onClick={() => navigate('projects')}>Abrir proyectos</button>}/></div></>;
  const architecture = activeArchitecture;
  const projectArchitectures = data.architectures.filter(a => a.projectId === activeProject.id);
  const dataset = data.datasets.find(d => d.projectId === activeProject.id);
  const lastRun = data.runs.find(r => r.projectId === activeProject.id);
  const runningRun = data.runs.find(r => r.status === 'running' || r.status === 'queued');
  const cnnMode = architecture?.family === 'cnn';
  const problem = dataset && architecture ? (cnnMode ? validateCnnTraining(dataset, architecture, config) : validateTraining(dataset, architecture, config)) : null;
  const canRun = !!(dataset && architecture && !problem && !isTraining);
  const begin = async () => {
    if (!dataset || !architecture) return;
    setError('');
    try { await startTraining(dataset, architecture, config); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo iniciar el entrenamiento.'); }
  };
  const change = (patch: Partial<TrainingConfig>) => setConfig(old => ({ ...old, ...patch }));
  const visible = runningRun ?? lastRun;
  const progress = visible ? Math.round(100 * visible.metrics.length / visible.config.epochs) : 0;
  return <>
    <Heading eyebrow={`Experimentación · M06 · ${activeProject.name}`} title="Entrenamiento neuronal" description="Entrenamiento real en el navegador: Feedforward y CNN con TensorFlow.js. El cálculo se realiza en este dispositivo, sin worker Python."/>
    <div className="mb-5"><Notice tone="warning">{cnnMode ? 'CNN real con TensorFlow.js (Conv2D + MaxPool2D + Dense + Softmax): clasificación multiclase de dígitos 0–9, optimizador Adam y conjunto de prueba independiente.' : 'Feedforward real con TensorFlow.js: clasificación binaria o regresión, SGD y validación separada. Los datos y modelos se guardan automáticamente en tu cuenta.'}</Notice></div>
    {error && <div className="mb-5"><Notice tone="error">{error}</Notice></div>}
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]"><div className="space-y-5"><section className="panel p-5"><SectionTitle title="Requisitos del modelo" subtitle="Recursos reales asociados al proyecto"/>
      <div className="space-y-3"><div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"><Database size={20} className="shrink-0 text-primary-600"/><div className="min-w-0 flex-1"><div className="text-xs font-semibold text-slate-500">Dataset</div><p className="truncate text-sm font-semibold text-ink">{dataset?.name ?? 'No importado'}</p>{cnnMode && dataset && !isDigitsDataset(dataset) && <p className="mt-1 text-[11px] text-amber-700">CNN necesita un CSV de dígitos 8×8.</p>}</div>{dataset ? <CheckCircle2 size={18} className="text-emerald-600"/> : <button className="text-xs font-bold text-primary-600" onClick={() => navigate('datasets')}>Importar</button>}</div>
        <div className="rounded-xl border border-slate-200 p-3"><div className="flex items-center gap-2"><Network size={20} className="shrink-0 text-primary-600"/><label htmlFor="training-architecture" className="text-xs font-semibold text-slate-500">Arquitectura seleccionada</label>{architecture && <CheckCircle2 size={16} className="ml-auto text-emerald-600"/>}</div>{projectArchitectures.length > 0 ? <select id="training-architecture" className="field mt-2" disabled={isTraining} value={architecture?.id ?? ''} onChange={e => selectArchitecture(activeProject.id, e.target.value)}>{projectArchitectures.map(arch => <option key={arch.id} value={arch.id}>{arch.name} · {arch.family.toUpperCase()}</option>)}</select> : <button className="btn-soft mt-2 w-full" onClick={() => navigate('architectures')}>Diseñar arquitectura</button>}<p className="mt-2 text-xs text-slate-500">Se utiliza la configuración guardada; los cambios sin guardar en el diseñador no afectan esta ejecución.</p></div></div>
    </section><section className="panel p-5"><SectionTitle title="Hiperparámetros" subtitle="Valores configurables antes de iniciar"/><div className="space-y-4"><div><label htmlFor="task" className="field-label">Tarea</label>{cnnMode ? <div className="field bg-slate-50 text-sm">Clasificación multiclase (0–9)</div> : <select id="task" disabled={isTraining} className="field" value={config.task} onChange={e => change({ task: e.target.value as TrainingConfig['task'] })}><option value="classification">Clasificación binaria (0 / 1)</option><option value="regression">Regresión numérica</option></select>}</div>
      <div className="grid grid-cols-2 gap-3"><div><label htmlFor="epochs" className="field-label">Épocas</label><input id="epochs" disabled={isTraining} className="field" type="number" min="1" max={cnnMode ? 40 : 120} value={config.epochs} onChange={e => change({ epochs: Number(e.target.value) })}/></div><div><label htmlFor="batch" className="field-label">Batch size</label><input id="batch" disabled={isTraining} className="field" type="number" min="1" max="256" value={config.batchSize} onChange={e => change({ batchSize: Number(e.target.value) })}/></div><div><label htmlFor="lr" className="field-label">Learning rate</label><input id="lr" disabled={isTraining} className="field" type="number" min={cnnMode ? 0.0001 : 0.00001} max={cnnMode ? 0.02 : 0.5} step={cnnMode ? 0.0005 : 0.005} value={config.learningRate} onChange={e => change({ learningRate: Number(e.target.value) })}/></div><div><label htmlFor="seed" className="field-label">Semilla</label><input id="seed" disabled={isTraining} className="field" type="number" min="0" max="1000000000" step="1" value={config.seed} onChange={e => change({ seed: Number(e.target.value) })}/></div></div>
      <div><label className="mb-2 flex justify-between text-xs font-semibold text-slate-500" htmlFor="split"><span>Validación</span><span>{Math.round(config.validationSplit * 100)} %</span></label><input id="split" disabled={isTraining} className="w-full accent-[#526fea]" type="range" min="0.1" max={cnnMode ? 0.3 : 0.4} step="0.05" value={config.validationSplit} onChange={e => change({ validationSplit: Number(e.target.value) })}/></div>
      {problem && <Notice tone="error">{problem}</Notice>}
      <button disabled={!canRun} className="btn-primary w-full" onClick={() => void begin()}><Play size={17}/> Iniciar entrenamiento real</button>
      <div className="flex items-center justify-center gap-2 text-xs text-slate-400"><SlidersHorizontal size={13}/> {cnnMode ? "Optimizador Adam · TensorFlow.js · test 15 %" : "Optimizador SGD · TensorFlow.js"}</div></div></section></div>
      <div className="space-y-5"><section className="panel p-5"><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><SectionTitle title="Monitor de ejecución" subtitle="Estados y métricas calculadas por época"/>{visible && <StatusPill status={visible.status}/>}</div>
      {!visible ? <EmptyState compact icon={<CirclePlay size={28}/>} title="No hay ejecuciones todavía" description="Configura tus datos y arquitectura, luego inicia un entrenamiento para observar el progreso real."/> :
      <><div className="mb-5 flex flex-wrap justify-between gap-3"><div><div className="text-xs font-semibold text-slate-500">Épocas realizadas</div><div className="mt-1 text-xl font-bold text-ink">{visible.metrics.length} <span className="text-base font-normal text-slate-400">/ {visible.config.epochs}</span></div></div><div className="text-right"><div className="text-xs font-semibold text-slate-500">Progreso registrado</div><div className="mt-1 text-xl font-bold text-primary-600">{progress}%</div></div></div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-teal-500 transition-all duration-300" style={{ width: `${progress}%` }}/></div><div className="mt-2 text-xs text-slate-400">Inicio: {formatDate(visible.createdAt)} · Dataset: {visible.datasetName}</div>
        {visible.error && <div className="mt-4"><Notice tone="error">{visible.error}</Notice></div>}
        <div className="mt-6"><MetricChart metrics={visible.metrics}/></div>
        {visible.metrics.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-4"><div className="text-xs text-slate-500">Pérdida entrenamiento</div><div className="mt-2 font-mono text-lg font-bold text-ink">{formatMetric(visible.metrics.at(-1)!.loss)}</div></div><div className="rounded-xl bg-slate-50 p-4"><div className="text-xs text-slate-500">Pérdida validación</div><div className="mt-2 font-mono text-lg font-bold text-ink">{formatMetric(visible.metrics.at(-1)!.valLoss)}</div></div></div>}
        {visible.test && <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Conjunto de prueba independiente · {visible.test.samples} imágenes</div><div className="mt-1 text-2xl font-bold text-emerald-900">{(visible.test.accuracy * 100).toFixed(1)} % de exactitud</div><p className="mt-1 text-xs text-emerald-800">Pérdida de prueba: {formatMetric(visible.test.loss)}. No se usan estos datos para ajustar pesos.</p></div>}
        {isTraining && <button className="btn-danger mt-5" onClick={cancelTraining}><Ban size={16}/> Solicitar cancelación</button>}
        {visible.status === 'completed' && <div className="mt-4"><Notice tone="success">Modelo entrenado y registrado con pesos reales. Ya puedes realizar inferencias desde el registro de modelos.</Notice></div>}
      </>}
      </section><section className="panel p-5"><div className="flex items-center gap-3"><Clock3 size={20} className="text-primary-600"/><div><div className="text-sm font-bold text-ink">Ejecución en la pestaña activa</div><div className="mt-1 text-xs leading-5 text-slate-500">Si cierras o recargas la pestaña mientras entrena, el trabajo se interrumpe. El historial ya calculado se conserva localmente.</div></div></div></section></div></div>
  </>;
}
