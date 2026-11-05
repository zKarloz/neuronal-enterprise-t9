// Shell de navegación responsive y composición de los módulos funcionales.
import { useEffect, useState } from 'react';
import { Activity, BookOpen, BrainCircuit, ChartNoAxesCombined, ChevronDown, CircleHelp, Database, FileText, FolderKanban, LayoutDashboard, Menu, Network, PanelLeftClose, PanelLeftOpen, Plus, Settings2, X, type LucideIcon } from 'lucide-react';
import { useWorkspace } from './WorkspaceProvider';
import { hasGoogleReturn } from '../lib/api/google-oauth';
import { modeFromSearch } from '../lib/page-routes';
import { Notice } from '../components/ui';
import { pageFromPath, pagePath } from '../lib/page-routes';
import type { Page } from '../lib/page-routes';
export type { Page } from '../lib/page-routes';
import { ProjectModal } from '../features/projects';
import ProfileMenu from './ProfileMenu';
import ThemeToggle from './ThemeToggle';
import Dashboard from '../features/dashboard';
import Projects from '../features/projects';
import Fundamentals from '../features/fundamentals';
import Architectures from '../features/architectures';
import Datasets from '../features/datasets';
import Training from '../features/training';
import Evaluation from '../features/evaluation';
import Models from '../features/model-registry';
import Reports from '../features/reports';
import Administration from '../features/administration';

/** Tipo oficial de Lucide; respeta forwardRef y el tamaño string | number. */
type IconComponent = LucideIcon;
const navigation: { section: string; entries: { id: Page; label: string; icon: IconComponent }[] }[] = [
  { section: 'GENERAL', entries: [{ id: 'dashboard', label: 'Panel de control', icon: LayoutDashboard }, { id: 'projects', label: 'Proyectos de IA', icon: FolderKanban }] },
  { section: 'LABORATORIO', entries: [{ id: 'fundamentals', label: 'Fundamentos', icon: BookOpen }, { id: 'architectures', label: 'Arquitecturas', icon: Network }, { id: 'datasets', label: 'Datasets', icon: Database }, { id: 'training', label: 'Entrenamientos', icon: Activity }, { id: 'evaluation', label: 'Evaluación y métricas', icon: ChartNoAxesCombined }, { id: 'models', label: 'Registro de modelos', icon: BrainCircuit }] },
  { section: 'GESTIÓN', entries: [{ id: 'reports', label: 'Reportes', icon: FileText }, { id: 'administration', label: 'Administración', icon: Settings2 }] },
];
const pageTitles: Record<Page, string> = Object.fromEntries(navigation.flatMap(group => group.entries.map(entry => [entry.id, entry.label]))) as Record<Page, string>;
/** La sección superior debe seguir el grupo real seleccionado en el sidebar. */
export const sectionForPage = (page: Page) => navigation.find(group => group.entries.some(item => item.id === page))?.section.toLowerCase().replace(/^./, c => c.toUpperCase()) ?? 'General';

/** Shell responsive enterprise; todas las rutas trabajan con estado local real. */
export default function App() {
  const { data, activeProject, selectProject, isTraining, storageError, dismissStorageError } = useWorkspace();
  const [topbarMode, setTopbarMode] = useState(() => modeFromSearch(window.location.search));
  const [page, setPage] = useState<Page>(() =>
    hasGoogleReturn() ? 'projects' : pageFromPath(window.location.pathname));

  useEffect(() => {
    // OAuth vuelve con parámetros en la URL raíz; enviarlos a M02 sin consumirlos.
    if (page === 'projects' && window.location.pathname === '/') {
      window.history.replaceState(window.history.state, '',
        `${pagePath('projects')}${window.location.search}${window.location.hash}`);
    }
    const syncMode = () => setTopbarMode(modeFromSearch(window.location.search));
    const onPopstate = () => { setPage(pageFromPath(window.location.pathname)); syncMode(); };
    window.addEventListener('neurolab:mode-changed', syncMode);
    window.addEventListener('popstate', onPopstate);
    return () => { window.removeEventListener('popstate', onPopstate); window.removeEventListener('neurolab:mode-changed', syncMode); };
  }, []);

  useEffect(() => { document.title = `${pageTitles[page]} · NeuroLab Enterprise`; }, [page]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const navigate = (next: Page) => {
    const path = pagePath(next);
    if (window.location.pathname !== path || window.location.search) {
      window.history.pushState(window.history.state, '', path);
    }
    setPage(next); setTopbarMode('local'); setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const sidebar = <div className="scrollbar-sidebar flex h-full flex-col overflow-y-auto bg-[#101d36] text-white">
    <div className={`flex h-[83px] shrink-0 items-center border-b border-white/10 ${sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-5'}`}>
      <div className="sidebar-logo relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#526fea] to-[#14b8a6]"><BrainCircuit size={24} strokeWidth={1.8} className="text-white"/></div>
      {!sidebarCollapsed && <div className="min-w-0"><div className="text-[17px] font-extrabold tracking-tight">NeuroLab<span className="text-[#77c7ca]">.</span></div><div className="text-[10px] font-bold uppercase tracking-[.17em] text-slate-400">Enterprise</div></div>}
      <button className="ml-auto rounded-lg p-1 text-slate-400 hover:bg-white/10 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menú"><X size={20}/></button>
    </div>
    {!sidebarCollapsed && <div className="mx-4 mt-6 rounded-xl border border-white/10 bg-white/5 p-3"><div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">{topbarMode === 'server' ? 'Espacio remoto' : 'Proyecto local'}</div><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-500/20 text-blue-300"><FolderKanban size={16}/></span><span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-100">{topbarMode === 'server' ? 'Cuenta Google' : activeProject?.name ?? 'Sin proyecto'}</span><span className={`h-2 w-2 shrink-0 rounded-full ${topbarMode === 'server' || activeProject ? 'bg-emerald-400' : 'bg-slate-500'}`}/></div></div>}
    <nav aria-label="Menú principal" className={`flex-1 space-y-6 py-6 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>{navigation.map(section => <div key={section.section}>{!sidebarCollapsed && <div className="mb-3 px-3 text-[10px] font-bold tracking-[.14em] text-slate-500">{section.section}</div>}<div className="space-y-1">{section.entries.map(item => <button key={item.id} title={sidebarCollapsed ? item.label : undefined} aria-current={page === item.id ? 'page' : undefined} onClick={() => navigate(item.id)} className={`flex w-full items-center gap-3 rounded-xl py-2.5 text-left text-[13px] font-medium transition-colors ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} ${page === item.id ? 'bg-primary-500/20 text-blue-100 shadow-[inset_3px_0_0_#91a5ff]' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}><item.icon size={18}/>{!sidebarCollapsed && <span className="flex-1">{item.label}</span>}{item.id === 'training' && isTraining && !sidebarCollapsed && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400"/>}</button>)}</div></div>)}</nav>
    <div className="border-t border-white/10 p-3"><button title="Contraer menú" className="hidden w-full items-center justify-center gap-2 rounded-xl py-2 text-xs text-slate-400 hover:bg-white/5 hover:text-white lg:flex" onClick={() => setSidebarCollapsed(old => !old)}>{sidebarCollapsed ? <PanelLeftOpen size={18}/> : <><PanelLeftClose size={17}/> Contraer menú</>}</button>{!sidebarCollapsed && <div className="pt-2 text-center text-[10px] text-slate-500">NeuroLab Enterprise · interfaz v0.10.1</div>}</div>
  </div>;
  return <div className="min-h-screen bg-canvas">
    {sidebarOpen && <button className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden" aria-label="Cerrar navegación" onClick={() => setSidebarOpen(false)}/>}
    <aside className={`fixed inset-y-0 left-0 z-40 w-[260px] transform transition-all duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${sidebarCollapsed ? 'lg:w-[76px]' : 'lg:w-[260px]'}`}>{sidebar}</aside>
    <div className={`min-h-screen transition-[margin] duration-200 ${sidebarCollapsed ? 'lg:ml-[76px]' : 'lg:ml-[260px]'}`}>
      <header className="site-topbar no-print sticky top-0 z-20 flex h-[83px] items-center justify-between gap-4 border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur-sm sm:px-7 xl:px-9">
        <div className="flex min-w-0 items-center gap-3"><button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Abrir menú" onClick={() => setSidebarOpen(true)}><Menu size={21}/></button><div className="min-w-0 text-xs text-slate-500">{sectionForPage(page)} <span className="mx-1 text-slate-300">/</span> <span className="font-semibold text-primary-700">{pageTitles[page]}</span></div></div>
        <div className="flex min-w-0 items-center gap-3">{topbarMode === 'local' && <div className="relative hidden min-w-[185px] sm:block"><label htmlFor="project-context" className="sr-only">Proyecto activo</label><select id="project-context" value={data.activeProjectId ?? ''} onChange={e => selectProject(e.target.value || null)} className="field max-w-[230px] appearance-none pr-9 text-xs font-semibold"><option value="">Sin proyecto local seleccionado</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={15}/></div>}<div className="hidden h-8 w-px bg-slate-200 sm:block"/><ThemeToggle/><ProfileMenu/></div>
      </header>
      <main className="print-content mx-auto max-w-[1600px] px-4 py-7 sm:px-7 sm:py-8 xl:px-9">
        {storageError && <Notice tone="error">{storageError} <button className="ml-2 underline" onClick={dismissStorageError}>Ocultar</button></Notice>}
        <div className="mb-5 flex items-center justify-between sm:hidden"><div className="min-w-0 text-xs text-slate-500">Proyecto: <strong className="text-ink">{activeProject?.name ?? 'ninguno'}</strong></div><button className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600" onClick={() => navigate('projects')}><Plus size={14}/> Proyectos</button></div>
        {page === 'dashboard' && <Dashboard navigate={navigate} onNewProject={() => setNewProjectOpen(true)}/>}
        {page === 'projects' && <Projects onNewProject={() => setNewProjectOpen(true)}/>}
        {page === 'fundamentals' && <Fundamentals/>}
        {page === 'architectures' && <Architectures key={activeProject?.id ?? 'none'} navigate={navigate}/>}
        {page === 'datasets' && <Datasets key={activeProject?.id ?? 'none'} navigate={navigate}/>}
        {page === 'training' && <Training key={activeProject?.id ?? 'none'} navigate={navigate}/>}
        {page === 'evaluation' && <Evaluation key={activeProject?.id ?? 'none'}/>}
        {page === 'models' && <Models key={activeProject?.id ?? 'none'}/>}
        {page === 'reports' && <Reports/>}
        {page === 'administration' && <Administration/>}
        <footer className="no-print mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 text-xs text-slate-400"><span>© NeuroLab Enterprise · Proyecto académico Semana 11</span><span className="flex items-center gap-1.5"><CircleHelp size={13}/> Plataforma híbrida · No utilizar datos sensibles sin controles adicionales</span></footer>
      </main>
    </div>
    {newProjectOpen && <ProjectModal onClose={() => setNewProjectOpen(false)}/>}
  </div>;
}
