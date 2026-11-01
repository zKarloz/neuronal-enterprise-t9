// Indicadores derivados del espacio de trabajo; no hay estadísticas simuladas.
import { Activity, ArrowUpRight, Boxes, BrainCircuit, ChartNoAxesCombined, CirclePlay, Database, FolderKanban, Layers3, Plus, Sparkles } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceProvider';
import { CardLink, EmptyState, Heading, SectionTitle, StatusPill, formatDate, formatMetric } from '../../components/ui';
import type { Page } from '../../app/App';

export default function Dashboard({ navigate, onNewProject }: { navigate: (page: Page) => void; onNewProject: () => void }) {
  const { data, activeProject, activeArchitecture } = useWorkspace();
  const p = data.projects;
  const recent = data.runs.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const stats = [
    { label: 'Proyectos', count: p.length, icon: FolderKanban, tint: 'bg-blue-50 text-blue-600', detail: `${p.filter(x => x.status === 'active').length} activos` },
    { label: 'Datasets', count: data.datasets.length, icon: Database, tint: 'bg-violet-50 text-violet-600', detail: 'Importados desde CSV' },
    { label: 'Ejecuciones', count: data.runs.length, icon: Activity, tint: 'bg-amber-50 text-amber-600', detail: `${data.runs.filter(x => x.status === 'completed').length} completadas` },
    { label: 'Modelos', count: data.models.length, icon: BrainCircuit, tint: 'bg-emerald-50 text-emerald-600', detail: 'Entrenados en navegador' },
  ];
  const arch = activeArchitecture;
  const dataset = data.datasets.find(d => d.projectId === activeProject?.id);
  const steps = [
    { label: 'Crear un proyecto de IA', done: !!activeProject, page: 'projects' as Page },
    { label: 'Importar un dataset numérico', done: !!dataset, page: 'datasets' as Page },
    { label: 'Definir arquitectura neuronal', done: arch?.family === 'feedforward' || arch?.family === 'cnn', page: 'architectures' as Page },
    { label: 'Ejecutar un entrenamiento local', done: data.runs.some(r => r.projectId === activeProject?.id && r.status === 'completed'), page: 'training' as Page },
  ];
  return <>
    <Heading eyebrow="Centro de operaciones · Entorno local" title="Panel de control" description="Gestiona proyectos y experimentos reales. Todos los indicadores se calculan a partir de tu actividad en este navegador." action={<button className="btn-primary" onClick={onNewProject}><Plus size={17}/> Nuevo proyecto</button>} />
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
      {stats.map(stat => <div className="panel p-4 sm:p-5" key={stat.label}><div className="mb-4 flex items-center justify-between"><span className={`grid h-11 w-11 place-items-center rounded-xl ${stat.tint}`}><stat.icon size={20}/></span><ArrowUpRight size={16} className="text-slate-300"/></div><div className="text-3xl font-bold tracking-tight text-ink">{stat.count}</div><div className="mt-1 text-sm font-semibold text-slate-700">{stat.label}</div><div className="mt-1 text-xs text-slate-400">{stat.detail}</div></div>)}
    </div>
    {!p.length && <section className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-r from-[#142647] via-[#213968] to-[#284d88] px-6 py-7 text-white sm:px-9">
      <div className="flex flex-wrap items-center justify-between gap-6"><div className="max-w-lg"><span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-blue-100"><Sparkles size={13}/> Comienza aquí</span><h2 className="mt-4 text-2xl font-bold">Tu laboratorio neuronal está listo.</h2><p className="mt-2 text-sm leading-6 text-blue-100">Crea un proyecto, importa datos numéricos y construye tu primer modelo Feedforward. No hay registros ficticios ni servicios externos.</p><button onClick={onNewProject} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#213968] hover:bg-blue-50"><Plus size={17}/> Crear primer proyecto</button></div><div className="hidden h-40 w-40 place-items-center rounded-full border border-white/20 bg-white/5 md:grid"><BrainCircuit size={80} strokeWidth={1.1} className="text-blue-100"/></div></div>
    </section>}
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.4fr_1fr]">
      <section className="panel overflow-hidden"><div className="panel-header"><div><h2 className="font-bold text-ink">Actividad reciente</h2><p className="mt-1 text-xs text-slate-500">Historial de entrenamientos ejecutados</p></div><CardLink onClick={() => navigate('evaluation')}>Ver historial</CardLink></div>
        {recent.length === 0 ? <EmptyState compact icon={<ChartNoAxesCombined size={26}/>} title="Aún no hay ejecuciones" description="Los resultados aparecerán aquí después de entrenar una red neuronal con tus datos." action={!!activeProject && <button onClick={() => navigate('training')} className="btn-soft"><CirclePlay size={16}/> Ir a entrenamiento</button>}/> :
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3">Arquitectura</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Pérdida</th><th className="px-5 py-3">Fecha</th></tr></thead><tbody>{recent.map(run => <tr key={run.id} className="border-t border-slate-100"><td className="px-5 py-3"><strong className="font-semibold text-ink">{run.architectureName}</strong><div className="text-xs text-slate-400">{run.datasetName}</div></td><td className="px-3 py-3"><StatusPill status={run.status}/></td><td className="px-3 py-3 font-mono text-xs text-slate-600">{run.metrics.length ? formatMetric(run.metrics.at(-1)!.valLoss) : '—'}</td><td className="whitespace-nowrap px-5 py-3 text-xs text-slate-500">{formatDate(run.createdAt)}</td></tr>)}</tbody></table></div>}
      </section>
      <section className="panel p-5"><SectionTitle title="Ruta de trabajo" subtitle={activeProject ? `Proyecto: ${activeProject.name}` : 'Completa las etapas del laboratorio'} action={<span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700">{steps.filter(s => s.done).length} / 4</span>}/>
        <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${steps.filter(s => s.done).length * 25}%` }}/></div>
        <div className="space-y-2">{steps.map((step, index) => <button key={step.label} onClick={() => navigate(step.page)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-slate-50"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${step.done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{step.done ? '✓' : index + 1}</span><span className={`flex-1 text-sm font-medium ${step.done ? 'text-slate-500' : 'text-ink'}`}>{step.label}</span><ArrowUpRight size={15} className="text-slate-400"/></button>)}</div>
        <div className="mt-5 flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs leading-5 text-slate-500"><Boxes size={17} className="mt-0.5 shrink-0 text-primary-500"/> Los datos y los modelos permanecen en este navegador. No se sincronizan con otros dispositivos.</div>
      </section>
    </div>
    {activeProject && <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary-100 bg-primary-50/70 px-5 py-4"><div className="flex items-center gap-3"><Layers3 className="text-primary-600" size={21}/><div><div className="text-sm font-bold text-ink">Proyecto en contexto: {activeProject.name}</div><div className="text-xs text-slate-500">{arch ? `${arch.name} · ${arch.family.toUpperCase()}` : 'Todavía no hay arquitectura configurada'}</div></div></div><CardLink onClick={() => navigate('architectures')}>Abrir diseñador</CardLink></div>}
  </>;
}
