/** M02 remoto: proyectos reales vía FastAPI, sin conexión directa a Supabase. */
import { useEffect, useState } from 'react';
import { Archive, CheckCircle2, CirclePlus, FolderKanban, Pencil, RefreshCw, Search, Trash2, Undo2 } from 'lucide-react';
import { configured } from '../../lib/api/config';
import { request, type RemoteProject } from '../../lib/api/client';
import { clearSession, ensureSession, loadSession, SESSION_CHANGED, type RemoteSession } from '../../lib/api/session';
import { EmptyState, Heading, Modal, Notice, StatusPill, formatDate } from '../../components/ui';
import { LoadingState, RemoteAuthRequired, RemoteUnavailable } from '../../components/RemoteStates';
import { consumeGoogleReturn, completeGoogleOAuth } from '../../lib/api/google-oauth';

// Compartir el intercambio entre los dos montajes de React.StrictMode.
let oauthTask: Promise<RemoteSession> | null = null;
function pendingOAuth(): Promise<RemoteSession> | null {
  if (!oauthTask) {
    const callback = consumeGoogleReturn();
    if (callback) oauthTask = completeGoogleOAuth(callback);
  }
  return oauthTask;
}

export function RemoteProjects() {
  const [session, setSession] = useState<RemoteSession | null>(() => loadSession());
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RemoteProject | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'archived'>('all');
  const [projects, setProjects] = useState<RemoteProject[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const task = pendingOAuth();
    if (task) {
      setBusy(true);
      void task.then(result => {
        if (alive) { setSession(result); }
      }).catch((cause: unknown) => {
        if (alive) setError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión.');
      }).finally(() => {
        if (alive) setBusy(false);
        // El código es de un solo uso: no se reutiliza para nuevos intentos.
        oauthTask = null;
      });
    }
    return () => { alive = false; };
  }, []);

  // El topbar es el punto único de acceso y cierre de sesión.
  useEffect(() => {
    const update = () => setSession(loadSession());
    window.addEventListener(SESSION_CHANGED, update);
    return () => window.removeEventListener(SESSION_CHANGED, update);
  }, []);

  async function activeSession(): Promise<RemoteSession> {
    if (!session) throw new Error('Inicia sesión para continuar.');
    try {
      const updated = await ensureSession(session);
      if (updated !== session) setSession(updated);
      return updated;
    } catch {
      clearSession();
      setSession(null);
      throw new Error('La sesión expiró. Vuelve a iniciar sesión con Google.');
    }
  }

  async function load(token: string): Promise<void> {
    setProjects(await request<RemoteProject[]>('/projects', token));
  }

  useEffect(() => {
    let alive = true;
    if (!session) { setProjects([]); setLoading(false); return; }
    setLoading(true);
    // La sesión cargada al recargar la página puede necesitar renovación.
    void ensureSession(session).then(async current => {
      if (!alive) return;
      if (current !== session) setSession(current);
      const rows = await request<RemoteProject[]>('/projects', current.access_token);
      if (alive) setProjects(rows);
    }).catch((cause: unknown) => {
      if (!alive) return;
      // Un fallo temporal de red no equivale a perder la identidad del usuario.
      setError(cause instanceof Error ? cause.message : 'No se pudo recuperar la sesión.');
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // Solo recargar proyectos cuando cambie el token efectivo.
  }, [session?.access_token]);

  async function action(work: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError('');
    try { await work(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Error inesperado.'); }
    finally { setBusy(false); }
  }

  const filtered = projects.filter(project => (filter === 'all' || project.status === filter) &&
    `${project.name} ${project.description}`.toLowerCase().includes(query.toLowerCase()));
  const openEditor = (project?: RemoteProject) => {
    setEditing(project ?? null);
    setName(project?.name ?? ''); setDescription(project?.description ?? ''); setFormOpen(true);
  };

  if (!configured) return <RemoteUnavailable/>;
  if (!session) return <RemoteAuthRequired/>;
  if (loading) return <LoadingState label="Consultando proyectos de tu cuenta…"/>;

  return <div className="space-y-5">
    <Heading title="Proyectos de IA" description="Gestiona proyectos guardados en tu cuenta. Los datos del navegador permanecen separados."
      action={<button className="btn-primary" onClick={() => openEditor()}><CirclePlus size={17}/> Crear proyecto</button>}/>
    {error && <Notice tone="error">{error}</Notice>}
    <div className="panel flex flex-wrap items-center gap-3 p-4">
      <div className="relative min-w-[220px] flex-1"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
        <input className="field pl-10" aria-label="Buscar proyectos remotos" placeholder="Buscar proyectos..." value={query} onChange={event => setQuery(event.target.value)}/></div>
      <div className="flex rounded-xl bg-slate-100 p-1">{(['all', 'active', 'archived'] as const).map(key =>
        <button type="button" key={key} onClick={() => setFilter(key)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${filter === key ? 'bg-white text-ink shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          {key === 'all' ? 'Todos' : key === 'active' ? 'Activos' : 'Archivados'}
        </button>)}</div>
      <button type="button" disabled={busy} className="btn-outline" onClick={() => void action(async () => { const current = await activeSession(); await load(current.access_token); })}><RefreshCw size={16}/> Actualizar</button>
    </div>
    {!projects.length ? <div className="panel"><EmptyState icon={<FolderKanban size={27}/>} title="Todavía no hay proyectos remotos" description="Crea tu primer proyecto para guardar datasets, arquitecturas y entrenamientos en tu cuenta."
      action={<button className="btn-primary" onClick={() => openEditor()}><CirclePlus size={16}/> Crear proyecto</button>}/></div>
      : !filtered.length ? <div className="panel"><EmptyState compact title="Sin coincidencias" description="Prueba con otro nombre o modifica los filtros."/></div>
      : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map(project => <article key={project.id} className="panel flex min-h-[255px] flex-col p-5">
        <div className="mb-4 flex items-start justify-between"><div className="grid h-11 w-11 place-items-center rounded-xl bg-primary-50 text-primary-600"><FolderKanban size={22}/></div><StatusPill status={project.status}/></div>
        <h2 className="line-clamp-2 font-bold text-ink">{project.name}</h2>
        <p className="mt-1 line-clamp-2 min-h-10 text-sm text-slate-500">{project.description || 'Sin descripción.'}</p>
        <p className="mt-4 text-xs text-slate-400">Creado: {formatDate(project.created_at)}</p>
        <div className="mt-auto flex justify-end gap-1 border-t border-slate-100 pt-4">
          <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={`Editar ${project.name}`} onClick={() => openEditor(project)}><Pencil size={16}/></button>
          <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" disabled={busy} title={project.status === 'active' ? 'Archivar' : 'Restaurar'} aria-label={`${project.status === 'active' ? 'Archivar' : 'Restaurar'} ${project.name}`}
            onClick={() => void action(async () => { const current = await activeSession(); await request(`/projects/${project.id}`, current.access_token, 'PATCH', {status: project.status === 'active' ? 'archived' : 'active'}); await load(current.access_token); })}>{project.status === 'active' ? <Archive size={16}/> : <Undo2 size={16}/>}</button>
          <button type="button" className="rounded-lg p-2 text-red-600 hover:bg-red-50" disabled={busy} aria-label={`Eliminar ${project.name}`} onClick={() => {
            if (window.confirm(`¿Eliminar ${project.name} y sus recursos asociados?`)) void action(async () => {
              const current = await activeSession(); await request(`/projects/${project.id}`, current.access_token, 'DELETE'); await load(current.access_token);
            });
          }}><Trash2 size={16}/></button>
        </div>
      </article>)}</div>}
    {formOpen && <Modal title={editing ? 'Editar proyecto remoto' : 'Nuevo proyecto de IA'} onClose={() => setFormOpen(false)}
      footer={<><button type="button" className="btn-outline" onClick={() => setFormOpen(false)}>Cancelar</button>
        <button type="submit" form="remote-project-form" className="btn-primary" disabled={busy || name.trim().length < 3}><CheckCircle2 size={16}/> Guardar proyecto</button></>}>
      <form id="remote-project-form" className="space-y-4" onSubmit={event => { event.preventDefault(); void action(async () => {
        const current = await activeSession();
        if (editing) await request(`/projects/${editing.id}`, current.access_token, 'PATCH', {name: name.trim(), description: description.trim()});
        else await request<RemoteProject>('/projects', current.access_token, 'POST', {name: name.trim(), description: description.trim()});
        await load(current.access_token); setFormOpen(false);
      }); }}>
        <div><label htmlFor="remote-name" className="field-label">Nombre</label><input id="remote-name" className="field" minLength={3} maxLength={80} required value={name} onChange={e => setName(e.target.value)}/></div>
        <div><label htmlFor="remote-description" className="field-label">Descripción</label><textarea id="remote-description" className="field min-h-28" maxLength={600} value={description} onChange={e => setDescription(e.target.value)}/></div>
      </form>
    </Modal>}
  </div>;
}
