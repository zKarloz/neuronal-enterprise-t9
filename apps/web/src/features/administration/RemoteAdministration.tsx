/** M10 remoto: miembros, roles, límites y auditoría reales, vía FastAPI.
 * Los permisos siempre se verifican también en el servidor (RBAC).
 */
import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Plus, RefreshCw, ShieldCheck, Trash2, UsersRound } from 'lucide-react';
import { Pagination } from '../../components/Pagination';
import { LoadingState, RemoteAuthRequired } from '../../components/RemoteStates';
import { EmptyState, Heading, Modal, Notice, SectionTitle, formatDate } from '../../components/ui';
import { request, type RemoteProject } from '../../lib/api/client';
import { ensureSession, loadSession, SESSION_CHANGED, type RemoteSession } from '../../lib/api/session';
import { availableRoles, canManageMember, ROLE_LABELS, type ProjectRole, type AssignableRole } from '../../lib/project-permissions';

// El propietario siempre es implícito en projects.owner_id.
interface Member { user_id: string; email: string | null; role: ProjectRole }
interface Access { current_role: ProjectRole; members: Member[] }
interface Usage { used: number; limit: number }
interface Resources { role: ProjectRole; projects: Usage; members: Usage; datasets: Usage; architectures: Usage; active_training: Usage }
interface AuditEvent {
  id: string; actor_email: string | null; actor_id: string;
  action: string; target_id: string | null; details: Record<string, unknown> | null; created_at: string;
}
interface AuditPage { total: number; items: AuditEvent[] }

const actionLabels: Record<string, string> = {
  'project.created': 'Proyecto creado', 'project.updated': 'Proyecto actualizado', 'project.deleted': 'Proyecto eliminado',
  'member.added': 'Miembro añadido', 'member.removed': 'Miembro retirado', 'member.role_changed': 'Rol modificado',
  'dataset.uploaded': 'Dataset cargado', 'dataset.prepared': 'Dataset preparado', 'dataset.deleted': 'Dataset eliminado',
  'architecture.created': 'Arquitectura registrada', 'training.queued': 'Entrenamiento encolado',
  'training.cancelled': 'Entrenamiento cancelado', 'training.retried': 'Entrenamiento reintentado',
  'model.updated': 'Modelo actualizado', 'model.downloaded': 'Modelo descargado',
  'report.csv_exported': 'CSV exportado', 'report.pdf_exported': 'PDF exportado',
};
const limitLabels: { key: keyof Omit<Resources, 'role'>; label: string }[] = [
  { key: 'projects', label: 'Proyectos propios' },
  { key: 'members', label: 'Colaboradores' }, { key: 'datasets', label: 'Datasets' },
  { key: 'architectures', label: 'Versiones de arquitectura' }, { key: 'active_training', label: 'Entrenamientos activos' },
];

export default function RemoteAdministration() {
  const [session, setSession] = useState<RemoteSession | null>(() => loadSession());
  const [projects, setProjects] = useState<RemoteProject[]>([]);
  const [projectId, setProjectId] = useState('');
  const [access, setAccess] = useState<Access | null>(null);
  const [resources, setResources] = useState<Resources | null>(null);
  const [audit, setAudit] = useState<AuditPage | null>(null);
  const [page, setPage] = useState(1);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<AssignableRole>('reader');
  const [removeMember, setRemoveMember] = useState<Member | null>(null);
  const pageSize = 5;

  useEffect(() => {
    const sync = () => setSession(loadSession());
    window.addEventListener(SESSION_CHANGED, sync);
    return () => window.removeEventListener(SESSION_CHANGED, sync);
  }, []);

  const bearer = useCallback(async () => {
    const previous = loadSession();
    if (!previous) throw new Error('La sesión expiró. Inicia sesión con Google.');
    const current = await ensureSession(previous);
    return current.access_token;
  }, []);

  useEffect(() => {
    let alive = true;
    if (!session) { setProjects([]); setProjectId(''); setAccess(null); return; }
    setLoadingProjects(true);
    void bearer().then(token => request<RemoteProject[]>('/projects', token)).then(rows => {
      if (!alive) return;
      setProjects(rows);
      setProjectId(previous => rows.some(row => row.id === previous) ? previous : (rows[0]?.id ?? ''));
    }).catch(cause => { if (alive) setError(cause instanceof Error ? cause.message : 'Error de conexión.'); })
      .finally(() => { if (alive) setLoadingProjects(false); });
    return () => { alive = false; };
  }, [session?.access_token, bearer]);

  const loadDetails = useCallback(async (pid: string, pageNumber: number) => {
    const token = await bearer();
    const route = `/projects/${pid}/administration`;
    const [accessData, usageData] = await Promise.all([
      request<Access>(`${route}/access`, token),
      request<Resources>(`${route}/resources`, token),
    ]);
    // Los lectores e ingenieros no acceden a auditoría (también restringida en API).
    const auditData = (['owner', 'manager', 'reviewer'] as ProjectRole[]).includes(accessData.current_role)
      ? await request<AuditPage>(`${route}/audit?limit=${pageSize}&offset=${(pageNumber - 1) * pageSize}`, token)
      : null;
    return { accessData, usageData, auditData };
  }, [bearer]);

  useEffect(() => {
    let alive = true;
    setAccess(null); setResources(null); setAudit(null);
    if (!projectId || !session) { setLoadingDetails(false); return; }
    setLoadingDetails(true);
    void loadDetails(projectId, page).then(({ accessData, usageData, auditData }) => {
      if (!alive) return;
      setAccess(accessData); setResources(usageData); setAudit(auditData);
    }).catch(cause => { if (alive) setError(cause instanceof Error ? cause.message : 'Error de consulta.'); })
      .finally(() => { if (alive) setLoadingDetails(false); });
    return () => { alive = false; };
  }, [projectId, page, session?.access_token, loadDetails]);

  async function action(work: (token: string) => Promise<void>) {
    if (!projectId) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      const token = await bearer();
      await work(token);
      const details = await loadDetails(projectId, page);
      setAccess(details.accessData); setResources(details.usageData); setAudit(details.auditData);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'La operación no pudo completarse.'); }
    finally { setBusy(false); }
  }

  const canManage = access?.current_role === 'owner' || access?.current_role === 'manager';
  const canEditMember = (member: Member) => Boolean(access && canManageMember(access.current_role, member.role));
  const roleOptions = access ? availableRoles(access.current_role) : [];

  return <>
    <Heading title="Administración del servidor" description="Gestiona colaboradores y permisos de tus proyectos, consulta la auditoría y revisa el consumo de recursos."/>
    {!session ? <RemoteAuthRequired/> : <>
      {loadingProjects ? <LoadingState label="Cargando proyectos de tu cuenta…"/> : <>
        <div className="panel mb-5 flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1"><label htmlFor="admin-project" className="field-label">Proyecto remoto</label>
            <select id="admin-project" className="field" value={projectId} onChange={event => { setError(''); setSuccess(''); setPage(1); setProjectId(event.target.value); }}>
              {!projects.length && <option value="">Sin proyectos disponibles</option>}
              {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select></div>
          <button type="button" className="btn-outline" disabled={!projectId || loadingDetails} onClick={() => { setPage(1); void action(async () => {}); }}>
            <RefreshCw size={16}/> Actualizar
          </button>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        {success && <Notice tone="success">{success}</Notice>}
        {!projects.length ? <div className="panel"><EmptyState title="Aún no tienes proyectos" description="Crea un proyecto remoto en Proyectos de IA para gestionar colaboradores."/></div> :
          loadingDetails ? <LoadingState label="Comprobando permisos y auditoría…"/> : <>
            {access && <section className="panel mb-5 p-5">
              <SectionTitle title="Miembros y roles" subtitle={`Tu nivel de acceso: ${ROLE_LABELS[access.current_role]}`} action={
                canManage ? <button type="button" className="btn-primary" onClick={() => { setEmail(''); setNewRole('reader'); setInviteOpen(true); }}><Plus size={16}/> Añadir integrante</button> : undefined}/>
              <div className="space-y-3">
                {access.members.map(member => <div key={member.user_id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><UsersRound size={18}/></span>
                  <div className="min-w-[150px] flex-1"><p className="break-all text-sm font-semibold text-ink">{member.email ?? member.user_id}</p>
                    <p className="text-xs text-slate-500">{ROLE_LABELS[member.role]}</p></div>
                  {canEditMember(member) && <>
                    <label className="sr-only" htmlFor={`role-${member.user_id}`}>Rol de {member.email}</label>
                    <select id={`role-${member.user_id}`} className="field w-auto text-xs" value={member.role} disabled={busy}
                      onChange={event => void action(async token => {
                        await request(`/projects/${projectId}/administration/members/${member.user_id}`, token, 'PATCH', { role: event.target.value });
                        setSuccess('Rol actualizado.');
                      })}>
                      {roleOptions.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
                    </select>
                    <button type="button" className="btn-outline !px-2" disabled={busy} title="Retirar miembro" aria-label={`Retirar a ${member.email}`}
                      onClick={() => setRemoveMember(member)}><Trash2 size={16}/></button>
                  </>}
                </div>)}
              </div>
              <div className="mt-4 flex items-start gap-2 text-xs text-slate-500"><ShieldCheck size={16} className="shrink-0"/>
                Los roles se validan en cada petición a FastAPI. Un lector solo consulta; un ingeniero opera recursos; un revisor puede aprobar versiones.
              </div>
            </section>}
            {resources && <section className="panel mb-5 p-5">
              <SectionTitle title="Uso y cuotas" subtitle="Conteos reales en PostgreSQL y límites configurados en la API"/>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{limitLabels.map(entry => {
                const usage = resources[entry.key];
                const percent = usage.limit > 0 ? Math.min(100, Math.round(usage.used / usage.limit * 100)) : 100;
                return <div key={entry.key} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <p className="text-xs text-slate-500">{entry.label}</p>
                  <p className="mt-2 text-xl font-bold text-ink">{usage.used} <span className="text-xs font-normal text-slate-500">de {usage.limit}</span></p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-label={`${percent} % de cuota utilizada`}>
                    <div className={`h-full rounded-full ${percent >= 90 ? 'bg-amber-500' : 'bg-slate-500'}`} style={{ width: `${percent}%` }}/>
                  </div>
                </div>;
              })}</div>
            </section>}
            {access && ['owner', 'manager', 'reviewer'].includes(access.current_role) && <section className="panel p-5">
              <SectionTitle title="Auditoría del proyecto" subtitle="Actividad registrada, ordenada de la más reciente a la más antigua" action={<ClipboardList size={20} className="text-slate-500"/>}/>
              {!audit || !audit.items.length ? <EmptyState compact title="Sin eventos registrados" description="Las acciones del proyecto quedarán documentadas aquí."/> : <div className="space-y-2">
                {audit.items.map(event => <div key={event.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
                  <div><p className="font-semibold text-ink">{actionLabels[event.action] ?? event.action}</p>
                    <p className="mt-1 text-xs text-slate-500">{event.actor_email ?? event.actor_id}</p>
                    {event.target_id && <p className="mt-1 text-xs text-slate-500">Recurso: {event.target_id.slice(0, 8)}…
                      {typeof event.details?.new_role === 'string' ? ` · Rol nuevo: ${event.details.new_role}` : ''}</p>}</div>
                  <time className="text-xs text-slate-500" dateTime={event.created_at}>{formatDate(event.created_at)}</time>
                </div>)}
              </div>}
              <Pagination total={audit?.total ?? 0} page={page} onPageChange={setPage} pageSize={pageSize} fixedSize label="eventos"/>
            </section>}
          </>}
      </>}
    </>}
    {inviteOpen && <Modal title="Añadir integrante al proyecto" onClose={() => setInviteOpen(false)} footer={<>
      <button type="button" className="btn-outline" onClick={() => setInviteOpen(false)}>Cancelar</button>
      <button type="submit" form="invite-member-form" className="btn-primary" disabled={busy || !email.trim()}>Añadir integrante</button>
    </>}>
      <form id="invite-member-form" className="space-y-4" onSubmit={event => { event.preventDefault(); void action(async token => {
        await request(`/projects/${projectId}/administration/members`, token, 'POST', { email: email.trim(), role: newRole });
        setInviteOpen(false); setSuccess('Integrante añadido.');
      }); }}>
        <p className="text-sm text-slate-500">La persona debe haber iniciado sesión en NeuroLab al menos una vez. No se enviará un correo de invitación.</p>
        <div><label htmlFor="member-email" className="field-label">Correo de su cuenta Google</label>
          <input id="member-email" type="email" required maxLength={320} className="field" value={email} onChange={event => setEmail(event.target.value)} placeholder="persona@organizacion.com"/></div>
        <div><label htmlFor="member-role" className="field-label">Rol del proyecto</label>
          <select id="member-role" className="field" value={newRole} onChange={event => setNewRole(event.target.value as AssignableRole)}>
            {roleOptions.map(role => <option value={role.value} key={role.value}>{role.label}</option>)}
          </select></div>
      </form>
    </Modal>}
    {removeMember && <Modal title="Retirar acceso al proyecto" onClose={() => setRemoveMember(null)} footer={<>
      <button type="button" className="btn-outline" onClick={() => setRemoveMember(null)}>Cancelar</button>
      <button type="button" className="btn-danger" disabled={busy} onClick={() => { const target = removeMember; if (!target) return; void action(async token => {
        await request(`/projects/${projectId}/administration/members/${target.user_id}`, token, 'DELETE');
        setRemoveMember(null); setSuccess('Acceso revocado.');
      }); }}>Retirar acceso</button>
    </>}>
      <p className="text-sm leading-6 text-slate-600">La cuenta <strong>{removeMember.email}</strong> perderá acceso a datasets, ejecuciones, modelos y reportes de este proyecto.</p>
    </Modal>}
  </>;
}
