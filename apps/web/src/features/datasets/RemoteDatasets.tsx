/** M05 remoto: carga, exploración y preparación de datos reales via FastAPI. */
import { useEffect, useRef, useState } from 'react';
import { Cloud, Database, Download, FileSpreadsheet, Loader2, RefreshCw, Trash2, UploadCloud } from 'lucide-react';
import { configured } from '../../lib/api/config';
import { request, type RemoteProject } from '../../lib/api/client';
import { ensureSession, loadSession, SESSION_CHANGED, type RemoteSession } from '../../lib/api/session';
import { downloadRemoteCsv, prepareRemoteCsv, uploadRemoteCsv, type RemoteDataset } from '../../lib/api/datasets';
import { EmptyState, Heading, Notice } from '../../components/ui';
import { LoadingState, RemoteAuthRequired, RemoteUnavailable } from '../../components/RemoteStates';
import type { Page } from '../../app/App';

export default function RemoteDatasets({ navigate }: { navigate: (page: Page) => void }) {
  const [session, setSession] = useState<RemoteSession | null>(() => loadSession());
  const [projects, setProjects] = useState<RemoteProject[]>([]);
  const [projectId, setProjectId] = useState('');
  const [datasets, setDatasets] = useState<RemoteDataset[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState('');
  const [task, setTask] = useState<'classification' | 'regression'>('classification');
  const [validation, setValidation] = useState(15);
  const [test, setTest] = useState(15);
  const [seed, setSeed] = useState(42);
  const [busy, setBusy] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = datasets.find(dataset => dataset.id === selectedId);

  // La sesión del topbar gobierna todas las vistas, incluso al cerrar Google aquí.
  useEffect(() => {
    const sync = () => setSession(loadSession());
    window.addEventListener(SESSION_CHANGED, sync);
    return () => window.removeEventListener(SESSION_CHANGED, sync);
  }, []);

  // Renovar el JWT cuando sea necesario; nunca acceder directamente a Supabase.
  async function token(): Promise<string> {
    const current = session ?? loadSession();
    if (!current) throw new Error('Inicia sesión con Google desde el topbar.');
    const refreshed = await ensureSession(current);
    if (refreshed !== current) setSession(refreshed);
    return refreshed.access_token;
  }

  async function loadProjects(): Promise<void> {
    const access = await token();
    const rows = await request<RemoteProject[]>('/projects', access);
    setProjects(rows);
    setProjectId(previous => rows.some(project => project.id === previous) ? previous : (rows[0]?.id ?? ''));
  }

  async function loadDatasets(id: string): Promise<void> {
    if (!id) { setDatasets([]); setSelectedId(''); return; }
    const rows = await request<RemoteDataset[]>(`/projects/${id}/datasets`, await token());
    setDatasets(rows);
    setSelectedId(previous => rows.some(dataset => dataset.id === previous) ? previous : (rows[0]?.id ?? ''));
  }

  useEffect(() => {
    let alive = true;
    if (!configured || !session) { setLoadingProjects(false); return; }
    setLoadingProjects(true);
    void ensureSession(session).then(async current => {
      const rows = await request<RemoteProject[]>('/projects', current.access_token);
      if (alive) {
        if (current !== session) setSession(current);
        setProjects(rows);
        setProjectId(previous => rows.some(project => project.id === previous) ? previous : (rows[0]?.id ?? ''));
      }
    }).catch((cause: unknown) => { if (alive) setError(cause instanceof Error ? cause.message : 'No se pudieron consultar los proyectos.'); })
      .finally(() => { if (alive) setLoadingProjects(false); });
    return () => { alive = false; };
    // La sesión de Google solo se valida en el montaje o al actualizar su token.
  }, [session?.access_token]);

  useEffect(() => {
    let alive = true;
    if (!projectId || !session) { setDatasets([]); setLoadingDatasets(false); return; }
    setLoadingDatasets(true);
    void (async () => {
      const access = await token();
      const rows = await request<RemoteDataset[]>(`/projects/${projectId}/datasets`, access);
      if (alive) {
        setDatasets(rows);
        setSelectedId(previous => rows.some(item => item.id === previous) ? previous : (rows[0]?.id ?? ''));
      }
    })().catch((cause: unknown) => { if (alive) setError(cause instanceof Error ? cause.message : 'Error al recuperar datasets.'); })
      .finally(() => { if (alive) setLoadingDatasets(false); });
    return () => { alive = false; };
  }, [projectId, session?.access_token]);

  useEffect(() => {
    setTarget(selected?.prep_json?.target_column ?? selected?.columns_json.at(-1)?.name ?? '');
    setTask(selected?.prep_json?.task ?? 'classification');
  }, [selectedId]);

  async function action(fn: () => Promise<void>): Promise<void> {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); }
    catch (cause: unknown) { setError(cause instanceof Error ? cause.message : 'Error al procesar la solicitud.'); }
    finally { setBusy(false); }
  }

  if (!configured) return <RemoteUnavailable/>;
  if (!session) return <RemoteAuthRequired/>;
  if (loadingProjects) return <LoadingState label="Cargando proyectos del servidor…"/>;

  return <div className="space-y-5">
    <Heading eyebrow="Datos · M05 · Servidor" title="Datasets remotos" description="Sube CSV reales a un bucket privado de Supabase Storage a través de FastAPI. Los datos locales permanecen separados."/>
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
    <div className="panel flex flex-wrap items-end gap-3 p-5">
      <div className="min-w-[230px] flex-1"><label htmlFor="remote-dataset-project" className="field-label">Proyecto del servidor</label>
        <select id="remote-dataset-project" className="field" value={projectId} onChange={event => setProjectId(event.target.value)}>
          {!projects.length && <option value="">Sin proyectos remotos</option>}
          {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select></div>
      <button className="btn-outline" disabled={busy} onClick={() => void action(async () => { await loadProjects(); if (projectId) await loadDatasets(projectId); })}><RefreshCw size={16}/> Actualizar</button>
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><Cloud size={14}/> {session.email}</span>
    </div>
    {!projectId ? <div className="panel p-6"><EmptyState icon={<Database size={27}/>} title="Crea un proyecto remoto primero" description="Los datasets remotos siempre pertenecen a un proyecto autorizado." action={<button className="btn-primary" onClick={() => navigate('projects')}>Abrir proyectos</button>}/></div> : <>
      <section className="panel p-5">
        <h2 className="mb-1 text-base font-bold text-ink">Importar CSV al servidor</h2>
        <p className="mb-4 text-xs leading-5 text-slate-500">UTF-8 · Hasta 5 MB · 20.000 registros · 65 columnas (64 píxeles + etiqueta para CNN). Encabezados únicos. Archivos almacenados en privado, no en el disco temporal de Render.</p>
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={event => setFile(event.target.files?.[0] ?? null)}/>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-outline" type="button" disabled={busy} onClick={() => inputRef.current?.click()}><FileSpreadsheet size={17}/> Elegir CSV</button>
          <span className="max-w-full truncate text-xs text-slate-500">{file ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB` : 'Ningún archivo seleccionado'}</span>
          <button className="btn-primary" type="button" disabled={busy || !file || file.size > 5 * 1024 * 1024} onClick={() => void action(async () => {
            if (!file) return;
            const item = await uploadRemoteCsv(projectId, await token(), file);
            await loadDatasets(projectId);
            setSelectedId(item.id); setFile(null); if (inputRef.current) inputRef.current.value = '';
            setNotice(`Archivo importado: ${item.row_count} registros reales y ${item.column_count} columnas.`);
          })}>{busy ? <Loader2 size={16} className="animate-spin"/> : <UploadCloud size={16}/>} Importar</button>
        </div>
      </section>
      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <section className="panel p-4"><h2 className="mb-3 text-sm font-bold text-ink">Versiones almacenadas ({datasets.length})</h2>
          {loadingDatasets ? <LoadingState label="Cargando datasets del proyecto…"/> : !datasets.length ? <p className="text-xs leading-5 text-slate-500">No hay datasets remotos en este proyecto.</p> : <div className="space-y-2">
            {datasets.map(item => <button type="button" key={item.id} onClick={() => setSelectedId(item.id)} className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedId === item.id ? 'border-primary-300 bg-primary-50' : 'border-slate-200 hover:bg-slate-50'}`}>
              <strong className="block truncate text-xs text-ink">{item.name} · v{item.version}</strong>
              <span className="mt-1 block text-[11px] text-slate-500">{item.row_count} filas · {item.column_count} columnas</span>
              <span className="block text-[11px] text-slate-500">{item.prep_json ? 'Preparado' : 'Pendiente de preparación'}</span>
            </button>)}
          </div>}
        </section>
        <section className="panel min-w-0 p-5">
          {!selected ? <EmptyState compact icon={<Database size={26}/>} title="Selecciona un dataset" description="Verás sus columnas, valores faltantes y registros reales."/> : <>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-base font-bold text-ink">{selected.name} <span className="text-xs text-primary-600">v{selected.version}</span></h2><p className="mt-1 text-xs text-slate-500">{selected.row_count} registros · {selected.column_count} columnas · {(selected.size_bytes / 1024).toFixed(1)} KB</p></div>
              <div className="flex gap-2">
                <button type="button" disabled={busy} className="btn-outline" onClick={() => void action(async () => downloadRemoteCsv(projectId, selected, await token()))}><Download size={15}/> CSV</button>
                <button type="button" disabled={busy} className="btn-outline text-red-600" onClick={() => {
                  if (!window.confirm(`¿Eliminar ${selected.name} v${selected.version} del servidor?`)) return;
                  void action(async () => {
                    await request(`/projects/${projectId}/datasets/${selected.id}`, await token(), 'DELETE');
                    await loadDatasets(projectId);
                    setNotice('Dataset eliminado del servidor.');
                  });
                }}><Trash2 size={15}/> Eliminar</button>
              </div>
            </div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Esquema detectado</h3>
            <div className="mb-5 flex flex-wrap gap-2">{selected.columns_json.map(column => <div key={column.name} className="rounded-lg border border-slate-200 px-3 py-2 text-xs"><strong className="text-ink">{column.name}</strong><span className="ml-2 text-slate-500">{column.type === 'number' ? 'Numérica' : 'Texto'}</span><span className="ml-2 text-amber-600">{column.null_count} nulos</span></div>)}</div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Vista previa de registros reales</h3>
            <div className="mb-5 max-w-full overflow-x-auto rounded-xl border border-slate-200"><table className="w-full text-left text-xs"><thead className="bg-slate-50"><tr>{selected.columns_json.map(col => <th className="whitespace-nowrap px-3 py-2 font-semibold" key={col.name}>{col.name}</th>)}</tr></thead><tbody>{selected.preview_json.map((row, i) => <tr key={i} className="border-t border-slate-100">{row.map((cell, j) => <td key={j} className="max-w-48 truncate whitespace-nowrap px-3 py-2 text-slate-600" title={cell}>{cell || '—'}</td>)}</tr>)}</tbody></table></div>
            <h3 className="mb-3 text-sm font-bold text-ink">Preparar para entrenamiento futuro</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label htmlFor="remote-target" className="field-label">Variable objetivo</label><select id="remote-target" value={target} onChange={e => setTarget(e.target.value)} className="field">{selected.columns_json.map(column => <option key={column.name} value={column.name}>{column.name}</option>)}</select></div>
              <div><label htmlFor="remote-task" className="field-label">Tipo de tarea</label><select id="remote-task" className="field" value={task} onChange={e => setTask(e.target.value as 'classification' | 'regression')}><option value="classification">Clasificación</option><option value="regression">Regresión</option></select></div>
              <div><label htmlFor="remote-validation" className="field-label">Validación (%)</label><input id="remote-validation" type="number" className="field" min={5} max={40} value={validation} onChange={e => setValidation(Number(e.target.value))}/></div>
              <div><label htmlFor="remote-test" className="field-label">Prueba (%)</label><input id="remote-test" type="number" className="field" min={5} max={40} value={test} onChange={e => setTest(Number(e.target.value))}/></div>
              <div><label htmlFor="remote-seed" className="field-label">Semilla reproducible</label><input id="remote-seed" className="field" type="number" min={0} max={2147483647} value={seed} onChange={e => setSeed(Number(e.target.value))}/></div>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">Separamos entrenamiento, validación y prueba. Los valores faltantes, las categorías y el escalado se ajustan únicamente con entrenamiento, para prevenir fuga de datos.</p>
            <button type="button" className="btn-primary mt-4" disabled={busy || !target || validation + test > 60 || validation < 5 || test < 5} onClick={() => void action(async () => {
              const item = await prepareRemoteCsv(projectId, selected.id, await token(), target, task, validation / 100, test / 100, seed);
              setDatasets(previous => previous.map(dataset => dataset.id === item.id ? item : dataset));
              setNotice('Preparación completada y registrada en PostgreSQL.');
            })}><Database size={16}/> Preparar dataset</button>
            {selected.prep_json && <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
              <p className="mb-2 text-xs font-bold text-emerald-800">Preparación persistida · {selected.prep_json.task === 'classification' ? 'Clasificación' : 'Regresión'}</p>
              <div className="flex flex-wrap gap-4 text-xs text-slate-700"><span>Train: <strong>{selected.prep_json.split.train}</strong></span><span>Validación: <strong>{selected.prep_json.split.validation}</strong></span><span>Prueba: <strong>{selected.prep_json.split.test}</strong></span><span>Dimensiones: <strong>{selected.prep_json.input_dimensions}</strong></span></div>
              <p className="mt-2 text-xs text-slate-600">Objetivo: {selected.prep_json.target_column}. Semilla: {selected.prep_json.split.seed}. Registros sin objetivo excluidos: {selected.prep_json.split.dropped_missing_target}.</p>
            </div>}
          </>}
        </section>
      </div>
    </>}
  </div>;
}
