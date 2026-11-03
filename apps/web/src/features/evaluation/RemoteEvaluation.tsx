/** M07 remoto: muestra únicamente métricas almacenadas por Keras en PostgreSQL. */
import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, Cloud, RefreshCw, ShieldCheck } from 'lucide-react';
import { MetricChart } from '../../components/MetricChart';
import { EmptyState, Heading, Notice } from '../../components/ui';
import { configured } from '../../lib/api/config';
import { request, type RemoteProject } from '../../lib/api/client';
import { ensureSession, loadSession } from '../../lib/api/session';
import { getJobs, getMetrics, getModels, type EpochMetric, type RemoteJob, type RemoteModel } from '../../lib/api/training';

const number = (v: number | undefined | null) => v == null || !Number.isFinite(v) ? '—' : v.toFixed(5);

export default function RemoteEvaluation() {
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

  useEffect(() => {
    if (!configured || !loadSession()) return;
    let mounted = true;
    const load = async () => {
      try {
        const session = loadSession();
        if (!session) return;
        const access = (await ensureSession(session)).access_token;
        const rows = await request<RemoteProject[]>('/projects', access);
        if (mounted) { setProjects(rows); setProjectId(rows[0]?.id ?? ''); }
      } catch (err) { if (mounted) setError(err instanceof Error ? err.message : 'Error al consultar proyectos.'); }
    };
    void load();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    setJobs([]); setModels([]); setMetrics([]); setComparison([]);
    if (!projectId) return;
    const load = async () => {
      setLoading(true); setError('');
      try {
        const session = loadSession();
        if (!session) throw new Error('Inicia sesión desde M02 → Servidor.');
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
    if (!projectId) return;
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

  if (!configured) return <Notice tone="warning">Configura VITE_API_BASE_URL para utilizar M07 remoto.</Notice>;
  if (!loadSession()) return <div className="panel p-5"><EmptyState icon={<ShieldCheck size={26}/>} title="Inicia sesión" description="Abre M02 → Servidor para consultar evaluaciones remotas."/></div>;
  return <div className="space-y-5">
    <Heading eyebrow="Análisis · M07 · Servidor" title="Evaluación de modelos Keras" description="Curvas de entrenamiento, validación y resultados de prueba guardados en PostgreSQL. Ninguna cifra es simulada."/>
    {error && <Notice tone="error">{error}</Notice>}
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
      {model && <section className="panel space-y-2 p-5"><h2 className="flex items-center gap-2 font-bold text-ink"><CheckCircle2 size={18} className="text-emerald-600"/> Evaluación sobre test independiente</h2><div className="flex flex-wrap gap-4">{Object.entries(model.test_metrics).map(([k,v]) => <div key={k}><p className="text-xs text-slate-500">{k}</p><p className="font-mono font-bold text-ink">{number(v)}</p></div>)}</div><p className="break-all text-xs text-slate-500">SHA-256 del modelo: {model.sha256}</p></section>}
      {compared && <section className="panel space-y-3 p-5"><h2 className="font-bold text-ink">Comparación de ejecuciones</h2>{!comparable && <Notice tone="warning">Los trabajos utilizan datasets diferentes. Las métricas no son directamente comparables.</Notice>}
        <table className="w-full text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="py-2">Métrica</th><th>Principal</th><th>Comparación</th></tr></thead><tbody>
          {([['Épocas', metrics.length, comparison.length], ['Loss validación', number(metrics.at(-1)?.val_loss), number(comparison.at(-1)?.val_loss)], ['Test loss', number(model?.test_metrics.loss), number(compareModel?.test_metrics.loss)], ['Test accuracy', number(model?.test_metrics.accuracy), number(compareModel?.test_metrics.accuracy)]] as const).map(([label, a, b]) => <tr key={label} className="border-b border-slate-100"><td className="py-2 font-medium">{label}</td><td className="font-mono">{a}</td><td className="font-mono">{b}</td></tr>)}
        </tbody></table>
      </section>}
    </>}
  </div>;
}
