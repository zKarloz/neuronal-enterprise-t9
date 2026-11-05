/** M08 remoto: el modelo binario nunca es leído con claves en el navegador. */
import { useCallback, useEffect, useState } from 'react';
import { Archive, CheckCircle2, Download, LoaderCircle, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { EmptyState, Heading, Notice, SectionTitle, formatDate } from '../../components/ui';
import { request, type RemoteProject } from '../../lib/api/client';
import { ensureSession, loadSession, SESSION_CHANGED, type RemoteSession } from '../../lib/api/session';
import { downloadModel, getModels, updateModel, type ModelStage, type RemoteModel } from '../../lib/api/training';

const stageLabel: Record<ModelStage, string> = { candidate: 'Candidato', production: 'Producción', archived: 'Archivado' };
export default function RemoteModels() {
  const [session, setSession] = useState<RemoteSession | null>(() => loadSession());
  const [projects, setProjects] = useState<RemoteProject[]>([]);
  const [projectId, setProjectId] = useState('');
  const [models, setModels] = useState<RemoteModel[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [stage, setStage] = useState<ModelStage>('candidate');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const withSession = useCallback(async () => {
    const current = loadSession();
    if (!current) throw new Error('Inicia sesión desde la esquina superior derecha.');
    const refreshed = await ensureSession(current);
    setSession(refreshed);
    return refreshed.access_token;
  }, []);
  useEffect(() => {
    const sync = () => setSession(loadSession());
    window.addEventListener(SESSION_CHANGED, sync);
    return () => window.removeEventListener(SESSION_CHANGED, sync);
  }, []);
  useEffect(() => {
    let active = true;
    if (!session) { setProjects([]); setModels([]); return; }
    void withSession().then(token => request<RemoteProject[]>('/projects', token)).then(rows => {
      if (active) { setProjects(rows); setProjectId(old => rows.some(p => p.id === old) ? old : (rows[0]?.id ?? '')); }
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los proyectos.'); });
    return () => { active = false; };
  }, [session?.access_token, withSession]);
  const refresh = useCallback(async () => {
    if (!projectId) return;
    const token = await withSession();
    setModels(await getModels(projectId, token));
  }, [projectId, withSession]);
  useEffect(() => {
    let active = true;
    setModels([]); setSelectedId('');
    if (projectId) void withSession().then(token => getModels(projectId, token)).then(items => {
      if (active) setModels(items);
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los modelos.'); });
    return () => { active = false; };
  }, [projectId, withSession]);
  const selected = models.find(model => model.id === selectedId) ?? models[0];
  useEffect(() => {
    if (!selected) return;
    setName(selected.name); setNotes(selected.notes); setStage(selected.stage);
  }, [selected?.id, selected?.name, selected?.notes, selected?.stage]);
  async function perform(work: () => Promise<void>) {
    setBusy(true); setError(''); setSuccess('');
    try { await work(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo completar la operación.'); }
    finally { setBusy(false); }
  }

  return <>
    <Heading title="Registro de modelos del servidor" description="Organiza versiones Keras inmutables, consulta sus métricas y descarga únicamente los artefactos de tus proyectos autorizados."/>
    {!session ? <Notice tone="info">Inicia sesión con Google desde el topbar para consultar tus modelos remotos.</Notice> : <>
      <div className="panel mb-5 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[220px] flex-1"><label className="field-label" htmlFor="registry-project">Proyecto remoto</label>
          <select id="registry-project" className="field" value={projectId} onChange={e => setProjectId(e.target.value)}>
            {projects.length === 0 && <option value="">Sin proyectos remotos</option>}
            {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select></div>
        <button className="btn-outline" onClick={() => void perform(refresh)} disabled={busy || !projectId}><RefreshCw size={16}/> Actualizar</button>
      </div>
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      {success && <div className="mb-4"><Notice tone="success">{success}</Notice></div>}
      {!models.length ? <div className="panel"><EmptyState title="Sin modelos remotos" description="Completa un entrenamiento del servidor en M06 para registrar un modelo .keras."/></div> :
        <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <section className="panel space-y-3 p-4"><SectionTitle title="Versiones disponibles" subtitle={`${models.length} modelos registrados`}/>
            {models.map(model => <button key={model.id} type="button" onClick={() => setSelectedId(model.id)}
              aria-pressed={model.id === selected?.id} className={`w-full rounded-xl border p-3 text-left transition-colors ${model.id === selected?.id ? 'border-primary-400 bg-primary-50' : 'border-slate-200 hover:border-primary-200'}`}>
              <div className="flex items-center justify-between gap-2 text-sm font-bold text-ink"><span className="truncate">{model.name}</span>{model.stage === 'production' ? <ShieldCheck size={17} className="shrink-0 text-emerald-600"/> : <Archive size={15} className="shrink-0 text-slate-400"/>}</div>
              <p className="mt-1 text-xs text-slate-500">{stageLabel[model.stage]} · {formatDate(model.created_at)}</p>
              <p className="mt-1 font-mono text-[11px] text-slate-500">{model.id.slice(0, 8)}…</p>
            </button>)}
          </section>
          {selected && <section className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><SectionTitle title="Ficha del modelo" subtitle="El artefacto permanece privado en Supabase Storage"/>
              <button className="btn-primary" disabled={busy} onClick={() => void perform(async () => {
                const token = await withSession(); await downloadModel(projectId, token, selected.id);
                setSuccess('Modelo descargado tras validar su integridad SHA-256.');
              })}>{busy ? <LoaderCircle size={16} className="animate-spin"/> : <Download size={16}/>} Descargar .keras</button></div>
            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-500">Test accuracy</span><p className="mt-1 text-lg font-bold text-ink">{selected.test_metrics.accuracy == null ? '—' : `${(selected.test_metrics.accuracy * 100).toFixed(2)} %`}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-500">Test loss</span><p className="mt-1 text-lg font-bold text-ink">{selected.test_metrics.loss?.toFixed(5) ?? '—'}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-500">Épocas entrenadas</span><p className="mt-1 text-lg font-bold text-ink">{selected.epochs_trained ?? '—'}</p></div>
            </div>
            <div className="space-y-3">
              <div><label className="field-label" htmlFor="registry-name">Nombre</label><input className="field" id="registry-name" value={name} maxLength={100} onChange={e => setName(e.target.value)}/></div>
              <div><label className="field-label" htmlFor="registry-notes">Notas de revisión</label><textarea className="field min-h-24" id="registry-notes" value={notes} maxLength={500} onChange={e => setNotes(e.target.value)}/></div>
              <div><label className="field-label" htmlFor="registry-stage">Estado de registro</label><select className="field" id="registry-stage" value={stage} onChange={e => setStage(e.target.value as ModelStage)}>
                {Object.entries(stageLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></div>
              <button className="btn-outline" disabled={busy || name.trim().length < 3} onClick={() => void perform(async () => {
                const token = await withSession();
                await updateModel(projectId, token, selected.id, {name: name.trim(), notes, stage});
                await refresh(); setSuccess('Metadatos guardados. La versión y el archivo .keras no se modificaron.');
              })}><Save size={16}/> Guardar metadatos</button>
            </div>
            <div className="mt-5 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500"><CheckCircle2 size={16} className="shrink-0 text-emerald-600"/>
              <span>SHA-256: <code className="break-all">{selected.sha256}</code>. Promover a producción registra un estado; no despliega un endpoint de inferencia.</span></div>
          </section>}
        </div>}
    </>}
  </>;
}
