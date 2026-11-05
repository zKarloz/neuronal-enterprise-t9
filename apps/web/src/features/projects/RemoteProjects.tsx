/** M02 remoto: proyectos reales vía FastAPI, sin conexión directa a Supabase. */
import { useEffect, useState } from 'react';
import { Cloud, RefreshCw, Plus, Trash2 } from 'lucide-react';
import { configured } from '../../lib/api/config';
import { request, type RemoteProject } from '../../lib/api/client';
import { clearSession, ensureSession, loadSession, SESSION_CHANGED, type RemoteSession } from '../../lib/api/session';
import { Notice, StatusPill, formatDate } from '../../components/ui';
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

  if (!configured) return <RemoteUnavailable/>;
  if (!session) return <RemoteAuthRequired/>;
  if (loading) return <LoadingState label="Consultando proyectos de tu cuenta…"/>;

  return <div className="space-y-5">
    <div className="panel flex items-center gap-3 p-5">
      <Cloud className="text-primary-600" size={24}/>
      <div><h2 className="font-bold text-ink">Proyectos en el servidor</h2><p className="text-xs text-slate-500">React se comunica solo con FastAPI. Los proyectos locales no se transfieren automáticamente.</p></div>
    </div>
    {error && <Notice tone="error">{error}</Notice>}
    {<>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">Sesión: {session.email}</p>
        <div className="flex gap-2">
          <button type="button" disabled={busy} className="btn-outline" onClick={() => void action(async () => { const current = await activeSession(); await load(current.access_token); })}><RefreshCw size={16}/> Actualizar</button>

        </div>
      </div>
      <form className="panel space-y-3 p-5" onSubmit={event => { event.preventDefault(); void action(async () => {
        const current = await activeSession();
        await request<RemoteProject>('/projects', current.access_token, 'POST', { name: name.trim(), description: description.trim() });
        setName(''); setDescription('');
        await load(current.access_token);
      }); }}>
        <h3 className="font-bold text-ink">Crear proyecto remoto</h3>
        <label className="field-label" htmlFor="remote-name">Nombre</label><input className="field" id="remote-name" minLength={3} maxLength={80} required value={name} onChange={event => setName(event.target.value)}/>
        <label className="field-label" htmlFor="remote-description">Descripción</label><textarea id="remote-description" className="field" maxLength={600} value={description} onChange={event => setDescription(event.target.value)}/>
        <button className="btn-primary" disabled={busy} type="submit"><Plus size={16}/> Guardar en PostgreSQL</button>
      </form>
      {!projects.length ? <div className="panel p-6 text-sm text-slate-500">No hay proyectos remotos registrados en esta cuenta.</div> : <div className="grid gap-4 md:grid-cols-2">
        {projects.map(project => <article key={project.id} className="panel p-5">
          <div className="mb-3 flex items-center justify-between"><h3 className="font-bold text-ink">{project.name}</h3><StatusPill status={project.status}/></div>
          <p className="mb-3 text-sm text-slate-500">{project.description || 'Sin descripción'}</p>
          <p className="text-xs text-slate-400">Creado: {formatDate(project.created_at)}</p>
          <div className="mt-4 flex gap-4 border-t pt-3">
            <button type="button" className="text-xs font-semibold text-primary-600" disabled={busy} onClick={() => void action(async () => { const current = await activeSession(); await request(`/projects/${project.id}`, current.access_token, 'PATCH', { status: project.status === 'active' ? 'archived' : 'active' }); await load(current.access_token); })}>{project.status === 'active' ? 'Archivar' : 'Restaurar'}</button>
            <button type="button" className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-red-600" disabled={busy} onClick={() => { if (window.confirm(`¿Eliminar ${project.name}?`)) void action(async () => { const current = await activeSession(); await request(`/projects/${project.id}`, current.access_token, 'DELETE'); await load(current.access_token); }); }}><Trash2 size={14}/> Eliminar</button>
          </div>
        </article>)}
      </div>}
    </>}
  </div>;
}
