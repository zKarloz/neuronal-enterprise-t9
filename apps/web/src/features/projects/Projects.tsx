// Operaciones locales de creación, edición, filtrado y archivo de proyectos.
import { useMemo, useState } from 'react';
import {RemoteProjects} from './RemoteProjects';
import { useUrlMode } from '../../app/useUrlMode';
import { Archive, CheckCircle2, CirclePlus, FolderKanban, Pencil, Search, Trash2, Undo2 } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceProvider';
import { EmptyState, Heading, Modal, Notice, StatusPill, ModeTabs, formatDate } from '../../components/ui';
import type { Project } from '../../types/domain';

export function ProjectModal({ onClose, editing }: { onClose: () => void; editing?: Project }) {
  const { createProject, editProject } = useWorkspace();
  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [error, setError] = useState('');
  const submit = () => {
    try {
      if (editing) editProject(editing.id, { name: name.trim(), description: description.trim() });
      else createProject(name, description);
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'Error al guardar.'); }
  };
  return <Modal title={editing ? 'Editar proyecto' : 'Nuevo proyecto de IA'} onClose={onClose} footer={<><button className="btn-outline" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={submit}>{editing ? 'Guardar cambios' : 'Crear proyecto'}</button></>}>
    <form onSubmit={e => { e.preventDefault(); submit(); }} className="space-y-4">
      <div><label className="field-label" htmlFor="project-name">Nombre del proyecto</label><input id="project-name" className="field" required minLength={3} maxLength={80} value={name} autoFocus onChange={e => setName(e.target.value)} placeholder="Ej. Predicción de consumo energético"/></div>
      <div><label className="field-label" htmlFor="project-description">Descripción del problema</label><textarea id="project-description" className="field min-h-28 resize-y" maxLength={600} value={description} onChange={e => setDescription(e.target.value)} placeholder="Qué deseas investigar o predecir..."/></div>
      {error && <Notice tone="error">{error}</Notice>}
    </form>
  </Modal>;
}

export default function Projects({ onNewProject }: { onNewProject: () => void }) {
  const { data, activeProject, selectProject, editProject, deleteProject } = useWorkspace();
  const [mode,setMode]=useUrlMode(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'archived'>('all');
  const [edit, setEdit] = useState<Project | null>(null);
  const [error, setError] = useState('');
  const filtered = useMemo(() => data.projects.filter(p => (filter === 'all' || p.status === filter) && `${p.name} ${p.description}`.toLowerCase().includes(query.toLowerCase())), [data.projects, filter, query]);
  const remove = (p: Project) => {
    if (!window.confirm(`¿Eliminar definitivamente "${p.name}" y todos sus datasets, entrenamientos y modelos?`)) return;
    try { deleteProject(p.id); } catch (err) { setError((err as Error).message); }
  };
  return <>
    <ModeTabs mode={mode} setMode={setMode} label="Almacenamiento de proyectos"/>
    {mode==='server'?<RemoteProjects/>:<>
    <Heading eyebrow="Gestión · M02" title="Proyectos de IA" description="Organiza las investigaciones y conserva su historial en el almacenamiento local del navegador." action={<button onClick={onNewProject} className="btn-primary"><CirclePlus size={17}/> Crear proyecto</button>}/>
    {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
    <div className="panel mb-5 flex flex-wrap items-center gap-3 p-4"><div className="relative min-w-[220px] flex-1"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input className="field pl-10" placeholder="Buscar proyectos..." value={query} onChange={e => setQuery(e.target.value)}/></div><div className="flex rounded-xl bg-slate-100 p-1">{(['all','active','archived'] as const).map(key => <button key={key} className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${filter === key ? 'bg-white text-ink shadow-sm' : 'text-slate-500 hover:text-slate-700'}`} onClick={() => setFilter(key)}>{key === 'all' ? 'Todos' : key === 'active' ? 'Activos' : 'Archivados'}</button>)}</div></div>
    {!data.projects.length ? <div className="panel"><EmptyState icon={<FolderKanban size={27}/>} title="Todavía no hay proyectos" description="Crea un proyecto propio para comenzar a importar datasets, diseñar arquitecturas y entrenar modelos." action={<button className="btn-primary" onClick={onNewProject}><CirclePlus size={16}/> Crear proyecto</button>}/></div> :
      !filtered.length ? <div className="panel"><EmptyState compact title="Sin coincidencias" description="Prueba con otro nombre o modifica los filtros de estado."/></div> :
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map(project => {
        const selected = project.id === activeProject?.id;
        const runCount = data.runs.filter(r => r.projectId === project.id).length;
        const modelCount = data.models.filter(m => m.projectId === project.id).length;
        return <article key={project.id} className={`panel flex min-h-[255px] flex-col p-5 ${selected ? 'ring-2 ring-primary-100' : ''}`}>
          <div className="mb-4 flex items-start justify-between"><div className="grid h-11 w-11 place-items-center rounded-xl bg-primary-50 text-primary-600"><FolderKanban size={22}/></div><StatusPill status={project.status}/></div>
          <h2 className="line-clamp-2 text-base font-bold text-ink">{project.name}</h2><p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-slate-500">{project.description || 'Sin descripción.'}</p>
          <div className="mt-4 flex items-center gap-4 text-xs text-slate-500"><span>{runCount} ejecuciones</span><span>{modelCount} modelos</span></div>
          <div className="mt-4 text-xs text-slate-400">Creado: {formatDate(project.createdAt)}</div>
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-4"><button disabled={selected} onClick={() => selectProject(project.id)} className={selected ? 'inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600' : 'text-xs font-bold text-primary-600 hover:underline'}>{selected ? <><CheckCircle2 size={15}/> En contexto</> : 'Seleccionar proyecto'}</button><div className="flex items-center gap-1"><button aria-label={`Editar ${project.name}`} title="Editar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-ink" onClick={() => setEdit(project)}><Pencil size={16}/></button><button aria-label={project.status === 'active' ? 'Archivar proyecto' : 'Restaurar proyecto'} title={project.status === 'active' ? 'Archivar' : 'Restaurar'} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-ink" onClick={() => editProject(project.id, { status: project.status === 'active' ? 'archived' : 'active' })}>{project.status === 'active' ? <Archive size={16}/> : <Undo2 size={16}/>}</button><button aria-label={`Eliminar ${project.name}`} title="Eliminar" className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => remove(project)}><Trash2 size={16}/></button></div></div>
        </article>;
      })}</div>}
    {edit && <ProjectModal editing={edit} onClose={() => setEdit(null)}/>}
    </>}
  </>;
}
