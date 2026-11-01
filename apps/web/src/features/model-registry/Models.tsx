// Registro de modelos entrenados y formulario de inferencia local con pesos reales.
import { useEffect, useState } from 'react';
import { ArrowDownToLine, BrainCircuit, Cpu, Fingerprint, FlaskConical, ShieldCheck } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceProvider';
import { predict } from '../../lib/neural';
import CnnModelDetail from './CnnModelDetail';
import type { TrainedNetwork, CNNNetwork } from '../../types/domain';
import { exportJSON } from '../../lib/storage';
import { EmptyState, Heading, Notice, SectionTitle, formatDate, formatMetric } from '../../components/ui';

export default function Models() {
  const { data, activeProject } = useWorkspace();
  const models = data.models.filter(m => !activeProject || m.projectId === activeProject.id);
  const [selectedId, setSelectedId] = useState('');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState('');
  const selected = models.find(m => m.id === selectedId) ?? models[0];
  const cnn = selected?.network && 'kind' in selected.network && selected.network.kind === 'cnn' ? selected.network as CNNNetwork : null;
  const dense = selected && !cnn ? selected.network as TrainedNetwork : null;
  const run = data.runs.find(r => r.id === selected?.runId);
  const dataset = data.datasets.find(d => d.id === run?.datasetId);
  useEffect(() => { setInputs({}); setResult(null); setError(''); }, [selected?.id]);
  const runInference = () => {
    if (!selected) return;
    try {
      if (!dense) throw new Error('Este modelo requiere entrada de imagen 8×8, no atributos tabulares.');
      const values = dense.features.map(feature => {
        const str = inputs[feature];
        if (str === undefined || str.trim() === '') throw new Error(`Ingresa un valor para ${feature}.`);
        return Number(str);
      });
      setResult(predict(dense, values)); setError('');
    } catch (err) { setError((err as Error).message); setResult(null); }
  };
  return <>
    <Heading eyebrow="Modelos · M08" title="Registro de modelos" description="Versiones locales reales con pesos resultantes del entrenamiento. Prueba inferencias y exporta los parámetros de cada versión."/>
    {!models.length ? <div className="panel"><EmptyState icon={<BrainCircuit size={26}/>} title="Aún no hay versiones" description="Cada entrenamiento completado genera automáticamente una nueva versión inmutable del modelo con los pesos aprendidos."/></div> :
    <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]"><section className="panel p-5"><SectionTitle title="Versiones disponibles" subtitle="Ordenadas por fecha de creación"/><div className="space-y-3">{models.map(model => <button key={model.id} onClick={() => setSelectedId(model.id)} className={`w-full rounded-xl border p-4 text-left transition-all ${selected?.id === model.id ? 'border-primary-400 bg-primary-50' : 'border-slate-200 hover:border-primary-200'}`}><div className="flex items-start justify-between gap-2"><span className="flex items-center gap-2 font-bold text-ink"><BrainCircuit size={19} className="text-primary-600"/> v{model.version}.0</span><span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">Entrenado</span></div><div className="mt-2 text-sm font-semibold text-ink">{model.name}</div><div className="mt-1 text-xs text-slate-500">{formatDate(model.createdAt)}</div><div className="mt-3 text-xs text-slate-500">Pérdida validación: <strong className="text-ink">{formatMetric(model.finalMetric.valLoss)}</strong></div></button>)}</div></section>
    {selected && cnn ? <CnnModelDetail key={selected.id} model={selected} network={cnn} dataset={dataset} run={run}/> : selected && dense && <div className="space-y-5"><section className="panel p-5"><div className="flex flex-wrap items-start justify-between gap-3"><SectionTitle title={`Modelo v${selected.version}.0 · ${selected.name}`} subtitle="Archivo de pesos entrenados en el navegador"/><button className="btn-outline" onClick={() => exportJSON(`modelo-v${selected.version}-${selected.id.slice(0, 8)}.json`, selected)}><ArrowDownToLine size={16}/> Exportar JSON</button></div><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-4"><Cpu className="mb-2 text-primary-600" size={18}/><div className="text-lg font-bold text-ink">{dense.layers.length}</div><div className="text-xs text-slate-500">Capas entrenables</div></div><div className="rounded-xl bg-slate-50 p-4"><Fingerprint className="mb-2 text-primary-600" size={18}/><div className="text-lg font-bold text-ink">{dense.layers.reduce((sum, layer) => sum + layer.biases.length + layer.weights.reduce((s, w) => s + w.length, 0), 0)}</div><div className="text-xs text-slate-500">Parámetros</div></div><div className="rounded-xl bg-slate-50 p-4"><ShieldCheck className="mb-2 text-emerald-600" size={18}/><div className="text-lg font-bold text-ink">{dense.task === 'classification' ? 'Binaria' : 'Regresión'}</div><div className="text-xs text-slate-500">Tipo de tarea</div></div></div></section>
      <section className="panel p-5"><SectionTitle title="Probar predicción" subtitle="El modelo calcula resultados usando sus pesos reales, sin conexión al servidor"/><div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs leading-5 text-blue-900">Introduce los mismos atributos numéricos y unidades que contenía el dataset de entrenamiento. El normalizador de entradas se aplica automáticamente.</div><div className="grid gap-3 sm:grid-cols-2">{dense.features.map(feature => <div key={feature}><label className="field-label" htmlFor={`predict-${feature}`}>{feature}</label><input id={`predict-${feature}`} type="number" step="any" className="field" value={inputs[feature] ?? ''} placeholder="Introduce un valor" onChange={e => { setInputs(old => ({ ...old, [feature]: e.target.value })); setResult(null); }}/></div>)}</div>
      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      <button className="btn-primary mt-5" onClick={runInference}><FlaskConical size={17}/> Ejecutar inferencia</button>
      {result !== null && <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 p-5"><div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Resultado calculado</div>{dense.task === 'classification' ? <><div className="mt-2 text-3xl font-bold text-emerald-900">{(result * 100).toFixed(2)} %</div><p className="mt-1 text-sm text-emerald-800">Probabilidad estimada de clase 1 · Clase predicha: <strong>{result >= 0.5 ? 1 : 0}</strong></p></> : <><div className="mt-2 font-mono text-3xl font-bold text-emerald-900">{formatMetric(result)}</div><p className="mt-1 text-sm text-emerald-800">Predicción numérica de {dense.target}</p></>}</div>}
      </section></div>}
    </div>}
  </>;
}
