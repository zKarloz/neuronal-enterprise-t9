/** Dashboard de la cuenta: solo métricas reales obtenidas mediante FastAPI autenticada. */
import { useEffect, useState } from 'react';
import { Activity, ArrowUpRight, BrainCircuit, Database, FolderKanban, Network, RefreshCw } from 'lucide-react';
import { request, type RemoteProject } from '../../lib/api/client';
import { getArchitectures, getJobs, getModels, type RemoteJob } from '../../lib/api/training';
import { type RemoteDataset } from '../../lib/api/datasets';
import { ensureSession, loadSession, SESSION_CHANGED, type RemoteSession } from '../../lib/api/session';
import { configured } from '../../lib/api/config';
import { EmptyState, Heading, Notice, StatusPill, formatDate } from '../../components/ui';
import { LoadingState, RemoteAuthRequired, RemoteUnavailable } from '../../components/RemoteStates';
import type { Page } from '../../lib/page-routes';

type ProjectOverview = { project: RemoteProject; datasets: number; architectures: number; jobs: RemoteJob[]; models: number };

export default function RemoteDashboard({ navigate }: { navigate: (page: Page) => void }) {
  const [session, setSession] = useState<RemoteSession | null>(() => loadSession());
  const [rows, setRows] = useState<ProjectOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const sync = () => setSession(loadSession());
    window.addEventListener(SESSION_CHANGED, sync);
    return () => window.removeEventListener(SESSION_CHANGED, sync);
  }, []);
  useEffect(() => {
    if (!session || !configured) { setRows([]); setLoading(false); return; }
    let active = true;
    setLoading(true); setError('');
    void (async () => {
      const access = (await ensureSession(session)).access_token;
      const projects = await request<RemoteProject[]>('/projects', access);
      const result: ProjectOverview[] = [];
      // Lotes de tres proyectos limitan las solicitudes simultáneas a Render.
      for (let i = 0; i < projects.length; i += 3) {
        const batch = await Promise.all(projects.slice(i, i + 3).map(async project => {
          const p = `/projects/${project.id}`;
          const [datasets, architectures, jobs, models] = await Promise.all([
            request<RemoteDataset[]>(`${p}/datasets`, access),
            getArchitectures(project.id, access), getJobs(project.id, access), getModels(project.id, access),
          ]);
          return { project, datasets: datasets.length, architectures: architectures.length, jobs, models: models.length };
        }));
        result.push(...batch);
      }
      if (active) setRows(result);
    })().catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudo cargar el panel remoto.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session?.access_token, reload]);

  if (!configured) return <RemoteUnavailable/>;
  if (!session) return <RemoteAuthRequired/>;
  if (loading) return <LoadingState label="Consultando proyectos, datasets, ejecuciones y modelos…"/>;
  if (error) return <><Notice tone="error">{error}</Notice><div className="panel p-6"><EmptyState title="No se pudo cargar el panel" description="Revisa tu conexión con FastAPI y vuelve a intentarlo." action={<button className="btn-outline" onClick={() => setReload(n => n + 1)}><RefreshCw size={16}/> Reintentar</button>}/></div></>;
  const jobs = rows.flatMap(item => item.jobs.map(job => ({ ...job, projectName: item.project.name })))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const stats = [
    { label: 'Proyectos', count: rows.length, icon: FolderKanban, detail: `${rows.filter(x => x.project.status === 'active').length} activos` },
    { label: 'Datasets', count: rows.reduce((n, r) => n + r.datasets, 0), icon: Database, detail: 'Almacenados en servidor' },
    { label: 'Entrenamientos', count: jobs.length, icon: Activity, detail: `${jobs.filter(x => x.status === 'COMPLETED').length} completados` },
    { label: 'Modelos', count: rows.reduce((n, r) => n + r.models, 0), icon: BrainCircuit, detail: 'Artefactos Keras guardados' },
  ];
  return <div className="space-y-5">
    <Heading title="Panel de control" description={`Resumen real de tu cuenta ${session.email}. Todos los indicadores proceden de FastAPI y PostgreSQL.`}
      action={<button className="btn-outline" onClick={() => setReload(n => n + 1)}><RefreshCw size={16}/> Actualizar</button>}/>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{stats.map(stat => <section key={stat.label} className="panel p-5">
      <stat.icon size={23} className="text-primary-600"/><div className="mt-3 text-3xl font-bold text-ink">{stat.count}</div>
      <div className="text-sm font-semibold text-slate-700">{stat.label}</div><div className="mt-1 text-xs text-slate-500">{stat.detail}</div>
    </section>)}</div>
    {!rows.length ? <div className="panel"><EmptyState title="Tu cuenta aún no tiene proyectos" description="Crea un proyecto desde Proyectos de IA → Servidor para empezar." action={<button className="btn-primary" onClick={() => navigate('projects')}>Abrir proyectos</button>}/></div> :
      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <section className="panel overflow-hidden"><div className="panel-header"><div><h2 className="font-bold text-ink">Actividad reciente</h2><p className="text-xs text-slate-500">Últimos trabajos de tus proyectos</p></div></div>
          {!jobs.length ? <EmptyState compact title="Sin entrenamientos todavía" description="Los trabajos aparecerán cuando los ejecutes desde M06."/> :
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Proyecto</th><th className="p-3">Estado</th><th className="p-3">Épocas</th><th className="p-3">Fecha</th></tr></thead><tbody>{jobs.slice(0, 6).map(job => <tr key={job.id} className="border-t border-slate-100"><td className="p-3 text-ink">{job.projectName}</td><td className="p-3"><StatusPill status={job.status.toLowerCase()}/></td><td className="p-3 text-slate-600">{job.epoch}/{job.epochs}</td><td className="whitespace-nowrap p-3 text-xs text-slate-500">{formatDate(job.created_at)}</td></tr>)}</tbody></table></div>}
        </section>
        <section className="panel p-5"><h2 className="font-bold text-ink">Proyectos de tu cuenta</h2><p className="mt-1 text-xs text-slate-500">Arquitecturas y datasets persistidos en PostgreSQL.</p>
          <div className="mt-4 space-y-2">{rows.map(({ project, datasets, architectures, models }) => <div key={project.id} className="rounded-xl border border-slate-200 p-3"><div className="flex justify-between gap-2"><span className="truncate text-sm font-bold text-ink">{project.name}</span><ArrowUpRight size={15} className="text-slate-400"/></div><p className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500"><span><Network size={13} className="inline"/> {architectures} arquitecturas</span><span>{datasets} datasets</span><span>{models} modelos</span></p></div>)}</div>
        </section>
      </div>}
  </div>;
}
