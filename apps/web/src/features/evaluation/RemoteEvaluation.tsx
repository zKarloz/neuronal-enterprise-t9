/** M07 remoto: muestra únicamente métricas almacenadas por Keras en PostgreSQL. */
import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, Cloud, RefreshCw, Tags, Save, Pencil, Star } from 'lucide-react';
import { MetricChart } from '../../components/MetricChart';
import { EmptyState, Heading, Notice, formatAccuracy } from '../../components/ui';
import { LoadingState, RemoteAuthRequired, RemoteUnavailable } from '../../components/RemoteStates';
import { configured } from '../../lib/api/config';
import { request, type RemoteProject } from '../../lib/api/client';
import { ensureSession, loadSession, SESSION_CHANGED } from '../../lib/api/session';
import { getJobs, getMetrics, getModels, updateModel, type EpochMetric, type RemoteJob, type RemoteModel, type ModelStage } from '../../lib/api/training';

const number = (v: number | undefined | null) => v == null || !Number.isFinite(v) ? '—' : v.toFixed(3);

export default function RemoteEvaluation() {
  const [session, setSession] = useState(() => loadSession());
  useEffect(() => {
    const sync = () => setSession(loadSession());
    window.addEventListener(SESSION_CHANGED, sync);
    return () => window.removeEventListener(SESSION_CHANGED, sync);
  }, []);
  const [projects, setProjects] = useState<RemoteProject[]>([]);
  const [projectId, setProjectId] = useState('');
  const [jobs, setJobs] = useState<RemoteJob[]>([]);
  const [models, setModels] = useState<RemoteModel[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [compareId, setCompareId] = useState('');
  const [metrics, setMetrics] = useState<EpochMetric[]>([]);
  const [comparison, setComparison] = useState<EpochMetric[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [editing, setEditing] = useState('');
  const [modelName, setModelName] = useState('');
  const [modelNotes, setModelNotes] = useState('');
  const [modelStage, setModelStage] = useState<ModelStage>('candidate');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  function beginEdit(model: RemoteModel) {
    // Los metadatos son editables; el modelo .keras y sus métricas no se sobrescriben.
    setEditing(model.id); setModelName(model.name);
    setModelNotes(model.notes); setModelStage(model.stage);
    setNotice('');
  }

  async function saveMetadata(modelId: string) {
    if (!projectId || saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const session = loadSession();
      if (!session) throw new Error('Inicia sesión con Google desde el topbar.');
      const token = (await ensureSession(session)).access_token;
      await updateModel(projectId, token, modelId, {name: modelName, notes: modelNotes, stage: modelStage});
      setModels(await getModels(projectId, token));
      setEditing(''); setNotice('Metadatos del modelo actualizados.');
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo actualizar el modelo.'); }
    finally { setSaving(false); }
  }

  useEffect(() => {
    if (!configured || !session) { setProjects([]); setProjectId(''); setLoadingProjects(false); return; }
    setLoadingProjects(true);
    let mounted = true;
    const load = async () => {
      try {
        const session = loadSession();
        if (!session) return;
        const access = (await ensureSession(session)).access_token;
        const rows = await request<RemoteProject[]>('/projects', access);
        if (mounted) { setProjects(rows); setProjectId(rows[0]?.id ?? ''); }
      } catch (err) { if (mounted) setError(err instanceof Error ? err.message : 'Error al consultar proyectos.'); }
      finally { if (mounted) setLoadingProjects(false); }
    };
    void load();
    return () => { mounted = false; };
  }, [session?.access_token]);

  useEffect(() => {
    let mounted = true;
    setJobs([]); setModels([]); setMetrics([]); setComparison([]); setEditing(''); setNotice('');
    if (!projectId) return;
    const load = async () => {
      setLoading(true); setError('');
      try {
        const session = loadSession();
        if (!session) throw new Error('Inicia sesión con Google desde el topbar.');
        const access = (await ensureSession(session)).access_token;
        const [runs, saved] = await Promise.all([getJobs(projectId, access), getModels(projectId, access)]);
        if (mounted) {
          setJobs(runs); setModels(saved);
          setSelectedId(previous => runs.some(j => j.id === previous) ? previous : (runs[0]?.id ?? ''));
          setCompareId('');
        }
      } catch (err) { if (mounted) setError(err instanceof Error ? err.message : 'Error al consultar evaluaciones.'); }
      finally { if (mounted) setLoading(false); }
    };
    void load();
    return () => { mounted = false; };
  }, [projectId]);

  useEffect(() => {
    let mounted = true;
    setMetrics([]); setComparison([]);
    if (!projectId) { setLoadingMetrics(false); return; }
    setLoadingMetrics(true);
    const read = async () => {
      try {
        const session = loadSession();
        if (!session) return;
        const access = (await ensureSession(session)).access_token;
        const [a, b] = await Promise.all([
          selectedId ? getMetrics(projectId, access, selectedId) : Promise.resolve([]),
          compareId ? getMetrics(projectId, access, compareId) : Promise.resolve([]),
        ]);
        if (mounted) { setMetrics(a); setComparison(b); }
      } catch (err) { if (mounted) setError(err instanceof Error ? err.message : 'Error al cargar métricas.'); }
      finally { if (mounted) setLoadingMetrics(false); }
    };
    void read();
    return () => { mounted = false; };
  }, [projectId, selectedId, compareId]);

  const selected = jobs.find(j => j.id === selectedId);
  const compared = jobs.find(j => j.id === compareId && compareId !== selectedId);
  const model = models.find(m => m.job_id === selectedId);
  const compareModel = models.find(m => m.job_id === compareId);
  const comparable = selected && compared && selected.dataset_id === compared.dataset_id;
  // Reutilizar el gráfico nativo sin cambiar las mediciones originales.
  const chartMetrics = metrics.map(m => ({epoch: m.epoch, loss: m.loss, valLoss: m.val_loss,
    accuracy: m.accuracy ?? undefined, valAccuracy: m.val_accuracy ?? undefined}));

  if (!configured) return <RemoteUnavailable/>;
  if (!session) return <RemoteAuthRequired/>;
  if (loadingProjects || loading || loadingMetrics) return <LoadingState label="Cargando evaluaciones y métricas remotas…"/>;
  return <div className="space-y-5">
    <Heading eyebrow="Análisis · M07 · Servidor" title="Evaluación de modelos Keras" description="Curvas de entrenamiento, validación y resultados de prueba guardados en PostgreSQL. Ninguna cifra es simulada."/>
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
    <section className="panel grid gap-3 p-5 sm:grid-cols-2">
      <div><label className="field-label" htmlFor="evaluation-project">Proyecto</label><select id="evaluation-project" className="field" value={projectId} onChange={e => setProjectId(e.target.value)}>{!projects.length && <option value="">Sin proyectos</option>}{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div className="flex items-end gap-2"><span className="text-xs text-slate-500"><Cloud size={15} className="inline"/> Datos remotos persistidos</span>{loading && <RefreshCw size={16} className="animate-spin text-slate-400"/>}</div>
      <div><label className="field-label" htmlFor="evaluation-run">Ejecución principal</label><select id="evaluation-run" className="field" value={selectedId} onChange={e => { setSelectedId(e.target.value); if (e.target.value === compareId) setCompareId(''); }}><option value="">Seleccionar ejecución</option>{jobs.map(j => <option key={j.id} value={j.id}>{new Date(j.created_at).toLocaleString()} · {j.status}</option>)}</select></div>
      <div><label className="field-label" htmlFor="evaluation-compare">Comparar con (opcional)</label><select id="evaluation-compare" className="field" value={compareId} onChange={e => setCompareId(e.target.value)}><option value="">Sin comparación</option>{jobs.filter(j => j.id !== selectedId).map(j => <option key={j.id} value={j.id}>{new Date(j.created_at).toLocaleString()} · {j.status}</option>)}</select></div>
    </section>
    {!selected ? <div className="panel p-5"><EmptyState compact icon={<Activity size={28}/>} title="Sin ejecuciones remotas" description="Crea y entrena primero una arquitectura desde M06 → Servidor."/></div> : <>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="panel p-5"><p className="text-xs text-slate-500">Estado</p><p className="mt-2 font-bold text-ink">{selected.status}</p></div>
        <div className="panel p-5"><p className="text-xs text-slate-500">Épocas registradas</p><p className="mt-2 text-2xl font-bold text-ink">{metrics.length}/{selected.epochs}</p></div>
        <div className="panel p-5"><p className="text-xs text-slate-500">Pérdida final de validación</p><p className="mt-2 text-xl font-mono font-bold text-ink">{number(metrics.at(-1)?.val_loss)}</p></div>
      </div>
      <section className="panel p-5"><h2 className="mb-3 text-base font-bold text-ink">Curvas de aprendizaje</h2><MetricChart metrics={chartMetrics} height={270}/></section>
      {model && <section className="panel space-y-2 p-5"><h2 className="flex items-center gap-2 font-bold text-ink"><CheckCircle2 size={18} className="text-emerald-600"/> Evaluación sobre test independiente</h2><div className="flex flex-wrap gap-4">{Object.entries(model.test_metrics).map(([k,v]) => <div key={k}><p className="text-xs text-slate-500">{k}</p><p className="font-mono font-bold text-ink">{k.includes('accuracy') ? formatAccuracy(v) : number(v)}</p></div>)}</div><p className="break-all text-xs text-slate-500">SHA-256 del modelo: {model.sha256}</p></section>}
      {compared && <section className="panel space-y-3 p-5"><h2 className="font-bold text-ink">Comparación de ejecuciones</h2>{!comparable && <Notice tone="warning">Los trabajos utilizan datasets diferentes. Las métricas no son directamente comparables.</Notice>}
        <table className="w-full text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="py-2">Métrica</th><th>Principal</th><th>Comparación</th></tr></thead><tbody>
          {([['Épocas', metrics.length, comparison.length], ['Loss validación', number(metrics.at(-1)?.val_loss), number(comparison.at(-1)?.val_loss)], ['Test loss', number(model?.test_metrics.loss), number(compareModel?.test_metrics.loss)], ['Test accuracy', formatAccuracy(model?.test_metrics.accuracy), formatAccuracy(compareModel?.test_metrics.accuracy)]] as const).map(([label, a, b]) => <tr key={label} className="border-b border-slate-100"><td className="py-2 font-medium">{label}</td><td className="font-mono">{a}</td><td className="font-mono">{b}</td></tr>)}
        </tbody></table>
      </section>}
    </>}
    <section className="panel space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-ink"><Tags size={19}/> Registro de modelos</h2>
        <span className="text-xs text-slate-500">Artefactos privados · trazabilidad por ejecución</span>
      </div>
      {!models.length && <p className="text-sm text-slate-500">Todavía no hay modelos guardados en este proyecto.</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {models.map(m => {
          const run = jobs.find(j => j.id === m.job_id);
          return <article key={m.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div><h3 className="font-semibold text-ink">{m.name}</h3>
                <p className="text-xs text-slate-500">{new Date(m.created_at).toLocaleString()} · {m.stage === 'production' ? 'Producción' : m.stage === 'archived' ? 'Archivado' : 'Candidato'}</p></div>
              {m.stage === 'production' && <Star size={18} className="text-amber-500" aria-label="Modelo en producción"/>}
            </div>
            <p className="text-xs text-slate-600">{m.notes || 'Sin notas.'}</p>
            <div className="grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
              <span>Test accuracy: <strong>{formatAccuracy(m.test_metrics.accuracy)}</strong></span>
              <span>Épocas entrenadas: <strong>{m.epochs_trained ?? '—'}{run ? `/${run.epochs}` : ''}</strong></span>
              <span>Mejor época: <strong>{m.best_epoch ?? '—'}</strong></span>
              <span>Early Stopping: <strong>{m.early_stopped === null ? 'Sin datos' : m.early_stopped ? 'Activado y detenido' : 'No detuvo'}</strong></span>
            </div>
            <p className="break-all font-mono text-[11px] text-slate-500">SHA-256: {m.sha256}</p>
            {editing === m.id ? <div className="space-y-2 border-t border-slate-200 pt-3">
              <div><label className="field-label" htmlFor={`model-name-${m.id}`}>Nombre</label><input id={`model-name-${m.id}`} className="field" maxLength={100} value={modelName} onChange={e => setModelName(e.target.value)}/></div>
              <div><label className="field-label" htmlFor={`model-notes-${m.id}`}>Notas</label><textarea id={`model-notes-${m.id}`} className="field" maxLength={500} rows={2} value={modelNotes} onChange={e => setModelNotes(e.target.value)}/></div>
              <div><label className="field-label" htmlFor={`model-stage-${m.id}`}>Estado</label><select id={`model-stage-${m.id}`} className="field" value={modelStage} onChange={e => setModelStage(e.target.value as ModelStage)}>
                <option value="candidate">Candidato</option><option value="production">Producción</option><option value="archived">Archivado</option>
              </select></div>
              <p className="text-xs text-slate-500">Solo un modelo puede estar en producción por proyecto. Promover otro despromueve al anterior.</p>
              <div className="flex gap-2"><button className="btn-primary" disabled={saving || modelName.trim().length < 3} onClick={() => void saveMetadata(m.id)}><Save size={15}/> Guardar</button>
              <button className="btn-outline" onClick={() => setEditing('')} disabled={saving}>Cancelar</button></div>
            </div> : <button className="btn-outline" onClick={() => beginEdit(m)}><Pencil size={15}/> Administrar modelo</button>}
          </article>;
        })}
      </div>
    </section>
  </div>;
}
