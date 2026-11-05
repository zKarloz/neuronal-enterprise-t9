/** M06 remoto: trabajos persistentes de FastAPI con seguimiento REST, sin valores simulados. */
import { useCallback, useEffect, useState } from 'react';
import { Activity, Ban, BrainCircuit, CheckCircle2, Cloud, Database, Loader2, Plus, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import { configured } from '../../lib/api/config';
import { request, type RemoteProject } from '../../lib/api/client';
import { ensureSession, loadSession } from '../../lib/api/session';
import { type RemoteDataset } from '../../lib/api/datasets';
import { createArchitecture, getArchitectures, getJobs, getMetrics, getModels, startJob, cancelJob,
  retryJob, watchJobEvents, type DenseLayer, type ArchitectureDraft, type EpochMetric, type RemoteArchitecture, type RemoteJob, type RemoteModel } from '../../lib/api/training';
import { EmptyState, Heading, Notice } from '../../components/ui';
import { MetricChart } from '../../components/MetricChart';
import { hasAccuracyMetrics, mergeRemoteMetrics, toChartMetrics } from '../../lib/remote-metrics';
import type { Page } from '../../app/App';

const STATES: Record<RemoteJob['status'], string> = {
  QUEUED: 'En cola', PREPARING: 'Preparando', RUNNING: 'Entrenando',
  COMPLETED: 'Completado', FAILED: 'Fallido', CANCELLED: 'Cancelado',
};
const INIT_LAYERS: DenseLayer[] = [{ units: 32, activation: 'relu' }, { units: 16, activation: 'relu' }];
const metric = (v: number | null) => v === null || !Number.isFinite(v) ? '—' : v.toFixed(5);

export default function RemoteTraining({ navigate }: { navigate: (page: Page) => void }) {
  const [projects, setProjects] = useState<RemoteProject[]>([]);
  const [projectId, setProjectId] = useState('');
  const [datasets, setDatasets] = useState<RemoteDataset[]>([]);
  const [datasetId, setDatasetId] = useState('');
  const [architectures, setArchitectures] = useState<RemoteArchitecture[]>([]);
  const [architectureId, setArchitectureId] = useState('');
  const [name, setName] = useState('Feedforward remoto');
  // La familia define qué parámetros se muestran; entrada/salida son automáticas.
  const [family, setFamily] = useState<'feedforward' | 'cnn_8x8'>('feedforward');
  const [convFilters, setConvFilters] = useState(8);
  const [denseUnits, setDenseUnits] = useState(32);
  const [layers, setLayers] = useState<DenseLayer[]>(INIT_LAYERS);
  const [jobs, setJobs] = useState<RemoteJob[]>([]);
  const [jobId, setJobId] = useState('');
  // Historial por trabajo: una respuesta REST antigua nunca borra épocas recibidas por SSE.
  const [metricsByJob, setMetricsByJob] = useState<Record<string, EpochMetric[]>>({});
  const [models, setModels] = useState<RemoteModel[]>([]);
  const [epochs, setEpochs] = useState(10);
  const [batchSize, setBatchSize] = useState(32);
  const [rate, setRate] = useState(0.001);
  const [seed, setSeed] = useState(42);
  const [earlyStop, setEarlyStop] = useState(true);
  const [patience, setPatience] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [transport, setTransport] = useState<'connecting' | 'live' | 'rest' | 'done'>('connecting');
  const selectedJob = jobs.find(job => job.id === jobId);
  const metrics = metricsByJob[jobId] ?? [];
  const chartMetrics = toChartMetrics(metrics);
  const hasAccuracy = hasAccuracyMetrics(metrics);
  const prepared = datasets.filter(item => item.prep_json !== null);
  const selectedArchitecture = architectures.find(item => item.id === architectureId);
  const selectedDataset = datasets.find(item => item.id === datasetId);
  // Validación de UX: el servidor vuelve a validar el snapshot de M05.
  const compatibleCnn = (item: RemoteDataset | undefined) => {
    const prep = item?.prep_json;
    return prep?.task === 'classification' && prep.input_dimensions === 64 &&
      prep.features.length === 64 && prep.features.every((f, i) => f.kind === 'numeric' && f.name === `pixel_${i}`);
  };
  const incompatibleCnn = selectedArchitecture?.family === 'cnn_8x8' && !compatibleCnn(selectedDataset);

  const storeMetrics = useCallback((id: string, rows: EpochMetric[]) => {
    setMetricsByJob(current => ({ ...current, [id]: mergeRemoteMetrics(current[id] ?? [], rows) }));
  }, []);

  const token = useCallback(async () => {
    const session = loadSession();
    if (!session) throw new Error('Inicia sesión con Google desde M02 → Servidor.');
    return (await ensureSession(session)).access_token;
  }, []);

  const refresh = useCallback(async (project: string) => {
    if (!project) return;
    const access = await token();
    const [ds, arch, runs, saved] = await Promise.all([
      request<RemoteDataset[]>(`/projects/${project}/datasets`, access),
      getArchitectures(project, access), getJobs(project, access), getModels(project, access),
    ]);
    setDatasets(ds); setArchitectures(arch); setJobs(runs); setModels(saved);
    setDatasetId(old => ds.some(item => item.id === old) ? old : (ds.find(item => item.prep_json)?.id ?? ''));
    setArchitectureId(old => arch.some(item => item.id === old) ? old : (arch[0]?.id ?? ''));
    setJobId(old => runs.some(job => job.id === old) ? old : (runs[0]?.id ?? ''));
  }, [token]);

  useEffect(() => {
    let alive = true;
    if (!configured || !loadSession()) return;
    void token().then(access => request<RemoteProject[]>('/projects', access)).then(rows => {
      if (alive) { setProjects(rows); setProjectId(rows[0]?.id ?? ''); }
    }).catch(err => { if (alive) setError(err instanceof Error ? err.message : 'Error al consultar proyectos.'); });
    return () => { alive = false; };
  }, [token]);
  useEffect(() => {
    setDatasets([]); setArchitectures([]); setJobs([]); setMetricsByJob({}); setModels([]);
    if (!projectId) return;
    void refresh(projectId).catch(err => setError(err instanceof Error ? err.message : 'Error de conexión.'));
  }, [projectId, refresh]);

  // SSE acelera el monitor. REST sigue disponible si una red/proxy corta el stream.
  useEffect(() => {
    if (!projectId || !jobId) return;
    const controller = new AbortController();
    let active = true;
    let finished = false;
    setTransport('connecting');
    const stream = async () => {
      while (active && !finished) {
        try {
          const access = await token();
          if (!active) break;
          await watchJobEvents(projectId, access, jobId, controller.signal, snapshot => {
            if (!active || snapshot.job.id !== jobId) return;
            setTransport('live');
            setJobs(current => current.map(item => item.id === jobId ? snapshot.job : item));
            storeMetrics(jobId, snapshot.metrics);
            if (snapshot.model) setModels(current => current.some(item => item.id === snapshot.model!.id)
              ? current : [snapshot.model!, ...current]);
            if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(snapshot.job.status)) {
              finished = true;
              setTransport('done');
            }
          });
          if (finished || !active) break;
        } catch {
          if (!active) break;
          setTransport('rest');
        }
        // Reconectar el stream finito; el polling REST continúa como respaldo.
        if (active && !finished) await new Promise(resolve => window.setTimeout(resolve, 12000));
      }
    };
    void stream();
    return () => { active = false; controller.abort(); };
  }, [projectId, jobId, token, storeMetrics]);

  // REST refresca la lista de trabajos y respalda SSE si el stream se interrumpe.
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    const interval = window.setInterval(() => {
      void refresh(projectId).catch(err => { if (active) setError(err instanceof Error ? err.message : 'Error al actualizar.'); });
    }, transport === 'live' ? 30000 : 8000);
    return () => { active = false; window.clearInterval(interval); };
  }, [projectId, refresh, transport]);
  useEffect(() => {
    if (!projectId || !jobId) return;
    let active = true;
    void token().then(access => getMetrics(projectId, access, jobId)).then(rows => {
      if (active) storeMetrics(jobId, rows);
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : 'No se pudieron leer métricas.'); });
    return () => { active = false; };
  }, [projectId, jobId, selectedJob?.epoch, token, storeMetrics]);

  async function action(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo completar la operación.'); }
    finally { setBusy(false); }
  }
  const updateLayer = (index: number, change: Partial<DenseLayer>) =>
    setLayers(current => current.map((layer, i) => i === index ? { ...layer, ...change } : layer));

  if (!configured) return <Notice tone="warning">Configura VITE_API_BASE_URL para habilitar M06 remoto.</Notice>;
  if (!loadSession()) return <><Heading eyebrow="Laboratorio · M06" title="Entrenamientos del servidor"/>
    <div className="panel p-6"><EmptyState icon={<ShieldCheck size={28}/>} title="Se requiere iniciar sesión" description="Entra con Google desde M02 → Servidor." action={<button className="btn-primary" onClick={() => navigate('projects')}>Abrir proyectos</button>}/></div></>;
  return <div className="space-y-5">
    <Heading eyebrow="Experimentación · M06 · Servidor" title="Entrenamiento neuronal remoto"
      description="Redes Feedforward y CNN 8×8 versionadas. TensorFlow/Keras se ejecuta en un worker Python; SSE muestra las métricas reales."/>
    <Notice tone="warning">Para empezar un trabajo debes mantener el worker Python ejecutándose en tu equipo. Los trabajos en cola permanecen guardados aunque cierres el navegador.</Notice>
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
    <section className="panel flex flex-wrap items-end gap-3 p-5">
      <div className="min-w-[220px] flex-1"><label className="field-label" htmlFor="remote-training-project">Proyecto remoto</label><select id="remote-training-project" className="field" value={projectId} onChange={e => setProjectId(e.target.value)}>
        {!projects.length && <option value="">Sin proyectos</option>}{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></div>
      <button className="btn-outline" disabled={busy || !projectId} onClick={() => void action(() => refresh(projectId))}><RefreshCw size={16}/> Actualizar</button>
      <span className="text-xs text-slate-500"><Cloud size={15} className="inline"/> API propia</span>
    </section>
    {!projectId ? <div className="panel p-5"><EmptyState icon={<Database size={24}/>} title="Crea un proyecto remoto" description="Visita M02 → Servidor para continuar." action={<button className="btn-primary" onClick={() => navigate('projects')}>Ir a M02</button>}/></div> : <>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="panel p-5 space-y-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink"><BrainCircuit size={19}/> Arquitecturas neuronales</h2>
          <div><label htmlFor="arch-family" className="field-label">Tipo de red</label>
            <select id="arch-family" className="field" value={family} onChange={e => {
              const next = e.target.value as 'feedforward' | 'cnn_8x8';
              setFamily(next); setName(next === 'cnn_8x8' ? 'CNN - Dígitos 8×8' : 'Feedforward remoto');
            }}>
              <option value="feedforward">Feedforward · tabular</option>
              <option value="cnn_8x8">CNN · imágenes 8×8</option>
            </select>
          </div>
          <div><label htmlFor="arch-name" className="field-label">Nombre</label><input id="arch-name" className="field" maxLength={100} value={name} onChange={e => setName(e.target.value)}/></div>
          {family === 'feedforward' ? <>
            {layers.map((layer, i) => <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <div><label className="field-label" htmlFor={`units-${i}`}>Capa {i + 1} · neuronas</label><input id={`units-${i}`} className="field" type="number" min={2} max={128} value={layer.units} onChange={e => updateLayer(i, { units: Number(e.target.value) })}/></div>
              <div><label className="field-label" htmlFor={`activation-${i}`}>Activación</label><select id={`activation-${i}`} className="field" value={layer.activation} onChange={e => updateLayer(i, { activation: e.target.value as DenseLayer['activation'] })}><option value="relu">ReLU</option><option value="tanh">Tanh</option><option value="sigmoid">Sigmoid</option></select></div>
              <button aria-label={`Eliminar capa ${i + 1}`} className="btn-outline" disabled={layers.length === 1} onClick={() => setLayers(ls => ls.filter((_, ix) => ix !== i))}><Ban size={16}/></button>
            </div>)}
            <button className="btn-outline" disabled={layers.length >= 4} onClick={() => setLayers(old => [...old, { units: 16, activation: 'relu' }])}><Plus size={16}/> Capa densa</button>
          </> : <>
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
              Entrada automática 8×8×1 → Conv2D (ReLU, kernel 3×3) → MaxPooling 2×2 → Flatten → Dense (ReLU) → Salida Softmax automática.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="field-label" htmlFor="conv-filters">Filtros convolucionales</label><input id="conv-filters" className="field" type="number" min={4} max={32} value={convFilters} onChange={e => setConvFilters(Number(e.target.value))}/></div>
              <div><label className="field-label" htmlFor="cnn-dense-units">Neuronas densas</label><input id="cnn-dense-units" className="field" type="number" min={8} max={128} value={denseUnits} onChange={e => setDenseUnits(Number(e.target.value))}/></div>
            </div>
          </>}
          <button className="btn-primary" disabled={busy} onClick={() => void action(async () => {
            const draft: ArchitectureDraft = family === 'cnn_8x8'
              ? { name, family, conv_filters: convFilters, kernel_size: 3, dense_units: denseUnits }
              : { name, family, layers };
            const item = await createArchitecture(projectId, await token(), draft);
            await refresh(projectId); setArchitectureId(item.id);
            setNotice(`Arquitectura ${item.name}, versión ${item.version}, guardada.`);
          })}><CheckCircle2 size={16}/> Guardar versión</button>
          <p className="text-xs text-slate-500">La salida se ajusta al dataset; las arquitecturas se versionan de forma inmutable. CNN exige pixel_0 … pixel_63 y clasificación en M05.</p>
        </section>
        <section className="panel p-5 space-y-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink"><Activity size={19}/> Nuevo entrenamiento</h2>
          <div><label className="field-label" htmlFor="remote-job-dataset">Dataset preparado (M05)</label><select id="remote-job-dataset" className="field" value={datasetId} onChange={e => setDatasetId(e.target.value)}><option value="">Seleccionar dataset</option>{prepared.map(d => <option key={d.id} value={d.id}>{d.name} · v{d.version} · {d.prep_json?.task}</option>)}</select></div>
          <div><label className="field-label" htmlFor="remote-job-architecture">Arquitectura guardada</label><select id="remote-job-architecture" className="field" value={architectureId} onChange={e => setArchitectureId(e.target.value)}><option value="">Seleccionar arquitectura</option>{architectures.map(a => <option key={a.id} value={a.id}>{a.name} · {a.family === 'cnn_8x8' ? 'CNN 8×8' : 'Feedforward'} · v{a.version}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3">{([
            ['Épocas', epochs, setEpochs, 1, 40, 'epochs-server'], ['Batch size', batchSize, setBatchSize, 1, 256, 'batch-server'],
            ['Learning rate', rate, setRate, 0.000001, 0.1, 'lr-server'], ['Semilla', seed, setSeed, 0, 2147483647, 'seed-server'],
          ] as const).map(([label, value, setter, min, max, id]) => <div key={id}><label className="field-label" htmlFor={id}>{label}</label><input id={id} type="number" min={min} max={max} step={id === 'lr-server' ? 0.0001 : 1} className="field" value={value} onChange={e => setter(Number(e.target.value))}/></div>)}</div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-ink">
              <input type="checkbox" checked={earlyStop} onChange={e => setEarlyStop(e.target.checked)}/>
              Early Stopping (validación)
            </label>
            <p className="text-xs text-slate-500">Detener si no mejora val loss; recuperar los mejores pesos. El test permanece independiente.</p>
            {earlyStop && <div><label className="field-label" htmlFor="early-patience">Paciencia · épocas</label>
              <input className="field max-w-28" id="early-patience" type="number" min={1} max={10}
                value={patience} onChange={e => setPatience(Number(e.target.value))}/></div>}
          </div>
          {!prepared.length && <Notice tone="warning">Prepara primero un CSV remoto desde M05 → Servidor.</Notice>}
          {incompatibleCnn && <Notice tone="warning">Para entrenar esta CNN, prepara un CSV de 64 píxeles numéricos (pixel_0 a pixel_63), columna objetivo label y tarea Clasificación.</Notice>}
          <button className="btn-primary w-full" disabled={busy || incompatibleCnn || !datasetId || !architectureId || jobs.some(j => ['QUEUED', 'PREPARING', 'RUNNING'].includes(j.status))} onClick={() => void action(async () => {
            const item = await startJob(projectId, await token(), { architecture_id: architectureId, dataset_id: datasetId, epochs, batch_size: batchSize, learning_rate: rate, seed, early_stopping_patience: earlyStop ? patience : 0 });
            await refresh(projectId); setJobId(item.id); setNotice('Trabajo encolado. El worker lo ejecutará cuando esté disponible.');
          })}>{busy ? <Loader2 size={17} className="animate-spin"/> : <Plus size={17}/>} Encolar entrenamiento</button>
        </section>
      </div>
      <section className="panel p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-ink">Monitor de trabajos persistidos</h2>
          <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600" role="status">
            {transport === 'live' ? 'SSE · en vivo' : transport === 'done' ? 'Resultado persistido' : transport === 'connecting' ? 'Conectando SSE…' : 'REST · respaldo'}
          </span>
        </div>
        <label className="field-label" htmlFor="remote-job-monitor">Selecciona una ejecución</label>
        <select id="remote-job-monitor" className="field" value={jobId} onChange={e => setJobId(e.target.value)}><option value="">Sin ejecuciones</option>{jobs.map(job => <option key={job.id} value={job.id}>{new Date(job.created_at).toLocaleString()} · {STATES[job.status]} · {job.epoch}/{job.epochs}</option>)}</select>
        {selectedJob ? <>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><strong className="text-sm text-ink">{STATES[selectedJob.status]}</strong><p className="text-xs text-slate-500">Época {selectedJob.epoch} de {selectedJob.epochs}{selectedJob.cancel_requested ? ' · Cancelación solicitada' : ''}</p></div>
            {['FAILED', 'CANCELLED'].includes(selectedJob.status) && <button className="btn-outline" disabled={busy || jobs.some(j => ['QUEUED', 'PREPARING', 'RUNNING'].includes(j.status))} onClick={() => void action(async () => {
              const job = await retryJob(projectId, await token(), selectedJob.id);
              await refresh(projectId); setJobId(job.id);
              setNotice('Reintento creado como nueva ejecución. El historial anterior permanece disponible.');
            })}><RotateCcw size={16}/> Reintentar trabajo</button>}
            {['QUEUED', 'PREPARING', 'RUNNING'].includes(selectedJob.status) && <button className="btn-outline" disabled={busy || selectedJob.cancel_requested} onClick={() => void action(async () => { await cancelJob(projectId, await token(), selectedJob.id); await refresh(projectId); })}><Ban size={16}/> Solicitar cancelación</button>}</div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-primary-500 transition-all" style={{ width: `${selectedJob.progress}%` }}/></div>
          <p className="text-xs text-slate-500">Progreso: {selectedJob.progress}% · {selectedJob.status === 'QUEUED' ? 'Esperando worker' : 'Estado guardado en PostgreSQL'}</p>
          {selectedJob.retry_of_job_id && <p className="text-xs text-slate-500">Reintento de la ejecución {selectedJob.retry_of_job_id.slice(0, 8)}…</p>}
          {selectedJob.error_message && <Notice tone="error">{selectedJob.error_message}</Notice>}
          <section className="space-y-3" aria-label="Curvas del entrenamiento remoto">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-bold text-ink"><Activity size={17}/> Curvas de aprendizaje</h3>
              <span className="text-xs text-slate-500" role="status">
                {metrics.length} {metrics.length === 1 ? 'época registrada' : 'épocas registradas'} · Actualización automática
              </span>
            </div>
            {metrics.length ? <div className={`grid gap-4 ${hasAccuracy ? 'xl:grid-cols-2' : ''}`}>
              <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                <h4 className="mb-2 text-sm font-semibold text-ink">Pérdida · Loss / Val loss</h4>
                <MetricChart metrics={chartMetrics} kind="loss" height={230}/>
              </div>
              {hasAccuracy && <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                <h4 className="mb-2 text-sm font-semibold text-ink">Precisión · Accuracy / Val accuracy</h4>
                <MetricChart metrics={chartMetrics} kind="accuracy" height={230}/>
              </div>}
            </div> : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              {['QUEUED', 'PREPARING', 'RUNNING'].includes(selectedJob.status)
                ? 'Esperando la primera época. Los gráficos aparecerán con las métricas de Keras.'
                : 'Esta ejecución no tiene épocas registradas.'}
            </div>}
          </section>
          {metrics.length > 0 && <div className="overflow-x-auto"><table className="w-full text-right text-xs"><thead><tr className="border-b text-slate-500">{['Época', 'Loss', 'Val loss', 'Accuracy', 'Val accuracy'].map(k => <th className="px-3 py-2" key={k}>{k}</th>)}</tr></thead><tbody>{metrics.map(m => <tr key={m.epoch} className="border-b border-slate-100"><td className="px-3 py-2">{m.epoch}</td><td className="px-3 py-2">{metric(m.loss)}</td><td className="px-3 py-2">{metric(m.val_loss)}</td><td className="px-3 py-2">{metric(m.accuracy)}</td><td className="px-3 py-2">{metric(m.val_accuracy)}</td></tr>)}</tbody></table></div>}
          {models.filter(model => model.job_id === selectedJob.id).map(model => <div key={model.id} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900"><strong>Modelo Keras guardado</strong><p className="mt-1">Evaluación sobre test independiente: {Object.entries(model.test_metrics).map(([key, val]) => `${key}: ${metric(val)}`).join(' · ')}</p><p className="mt-1 break-all text-[11px]">SHA-256: {model.sha256}</p></div>)}
        </> : <EmptyState compact icon={<Activity size={25}/>} title="Sin entrenamientos" description="Crea una arquitectura y encola una ejecución real."/>}
      </section>
    </>}
  </div>;
}
