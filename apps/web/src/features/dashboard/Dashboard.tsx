// Panel local con el mismo lenguaje visual del servidor, sin estadísticas simuladas.
import { Activity, ArrowUpRight, BrainCircuit, ChartNoAxesCombined, CirclePlay, Database, FolderKanban } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceProvider';
import { CardLink, EmptyState, Heading, StatusPill, formatDate, formatMetric } from '../../components/ui';
import { DashboardColumns, DashboardStats, WelcomeBanner } from './DashboardBlocks';
import type { Page } from '../../app/App';

export default function Dashboard({ navigate, onNewProject }: { navigate: (page: Page) => void; onNewProject: () => void }) {
  const { data, activeProject, activeArchitecture } = useWorkspace();
  const project = activeProject ?? data.projects[0];
  const recent = data.runs.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  const stats = [
    { label: 'Proyectos', count: data.projects.length, icon: FolderKanban, detail: `${data.projects.filter(x => x.status === 'active').length} activos` },
    { label: 'Datasets', count: data.datasets.length, icon: Database, detail: 'Disponibles en tu cuenta' },
    { label: 'Entrenamientos', count: data.runs.length, icon: Activity, detail: `${data.runs.filter(x => x.status === 'completed').length} completados` },
    { label: 'Modelos', count: data.models.length, icon: BrainCircuit, detail: 'Guardados en la nube' },
  ];
  const steps = [
    { label: 'Crear un proyecto de IA', done: !!project, page: 'projects' as Page },
    { label: 'Importar un dataset', done: !!project && data.datasets.some(d => d.projectId === project.id), page: 'datasets' as Page },
    { label: 'Diseñar una arquitectura', done: !!project && data.architectures.some(a => a.projectId === project.id), page: 'architectures' as Page },
    { label: 'Completar un entrenamiento', done: !!project && data.runs.some(r => r.projectId === project.id && r.status === 'completed'), page: 'training' as Page },
  ];
  return <div className="space-y-5">
    <Heading title="Panel de control" description="Actividad y proyectos reales, guardados automáticamente en tu cuenta."
      action={<button className="btn-primary" onClick={onNewProject}>Nuevo proyecto</button>}/>
    <DashboardStats items={stats}/>
    {!data.projects.length && <WelcomeBanner scope="local" onStart={onNewProject}/>}
    <DashboardColumns activity={<section className="panel overflow-hidden">
      <div className="panel-header"><div><h2 className="font-bold text-ink">Actividad reciente</h2><p className="text-xs text-slate-500">Últimos entrenamientos</p></div><CardLink onClick={() => navigate('evaluation')}>Ver historial</CardLink></div>
      {!recent.length ? <EmptyState compact icon={<ChartNoAxesCombined size={26}/>} title="Sin entrenamientos todavía" description="Tus resultados aparecerán después de entrenar un modelo."
        action={!!project && <button onClick={() => navigate('training')} className="btn-soft"><CirclePlay size={16}/> Ir a entrenamiento</button>}/> :
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Arquitectura</th><th className="p-3">Estado</th><th className="p-3">Pérdida</th><th className="p-3">Fecha</th></tr></thead><tbody>
        {recent.map(run => <tr key={run.id} className="border-t border-slate-100"><td className="p-3 font-semibold text-ink">{run.architectureName}</td><td className="p-3"><StatusPill status={run.status}/></td><td className="p-3 text-xs text-slate-600">{run.metrics.length ? formatMetric(run.metrics.at(-1)!.valLoss) : '—'}</td><td className="whitespace-nowrap p-3 text-xs text-slate-500">{formatDate(run.createdAt)}</td></tr>)}
      </tbody></table></div>}
    </section>} projects={<section className="panel p-5">
      <h2 className="font-bold text-ink">Proyectos de tu cuenta</h2>
      <p className="mt-1 text-xs text-slate-500">{project ? `Proyecto activo: ${project.name}` : 'Sigue los cuatro pasos para crear tu primer proyecto.'}</p>
      <div className="mt-4 space-y-2">{steps.map((step, i) => <button key={step.label} type="button" onClick={() => navigate(step.page)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${step.done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{step.done ? '✓' : i + 1}</span>
        <span className="flex-1 text-sm font-semibold text-ink">{step.label}</span><ArrowUpRight size={15} className="text-slate-400"/>
      </button>)}</div>
      {project && <p className="mt-4 text-xs text-slate-500">{activeArchitecture?.name ?? 'Sin arquitectura seleccionada'} · Datos disponibles desde tu cuenta.</p>}
    </section>}/>
  </div>;
}
