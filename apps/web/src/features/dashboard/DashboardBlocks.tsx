/** Bloques visuales compartidos por los indicadores locales y de servidor. */
import { BrainCircuit, Plus, Sparkles, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface DashboardStatistic {
  label: string;
  count: number;
  detail: string;
  icon: LucideIcon;
}

export function DashboardStats({ items }: { items: DashboardStatistic[] }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{items.map(item =>
    <section key={item.label} className="panel p-4 sm:p-5">
      <item.icon size={23} className="text-primary-600"/>
      <div className="mt-3 text-3xl font-bold text-ink">{item.count}</div>
      <div className="text-sm font-semibold text-slate-700">{item.label}</div>
      <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
    </section>)}</div>;
}

/** Mismo estado de bienvenida en cuentas y navegadores sin proyectos. */
export function WelcomeBanner({ onStart, scope }: { onStart: () => void; scope: 'local' | 'server' }) {
  return <section className="overflow-hidden rounded-2xl bg-gradient-to-r from-[#142647] via-[#213968] to-[#284d88] px-6 py-7 text-white sm:px-9">
    <div className="flex flex-wrap items-center justify-between gap-6"><div className="max-w-lg">
      <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-blue-100"><Sparkles size={13}/> Comienza aquí</span>
      <h2 className="mt-4 text-2xl font-bold">Tu laboratorio neuronal está listo.</h2>
      <p className="mt-2 text-sm leading-6 text-blue-100">Crea un proyecto, importa un dataset y entrena tu primer modelo {scope === 'server' ? 'con tu cuenta de Google y el worker Keras.' : 'directamente en tu navegador.'}</p>
      <button type="button" onClick={onStart} className="welcome-primary-cta mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#213968] hover:bg-blue-50"><Plus size={17}/> Crear primer proyecto</button>
    </div><div className="hidden h-40 w-40 place-items-center rounded-full border border-white/20 bg-white/5 md:grid"><BrainCircuit size={80} strokeWidth={1.1} className="text-blue-100"/></div></div>
  </section>;
}

export function DashboardColumns({ activity, projects }: { activity: ReactNode; projects: ReactNode }) {
  return <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">{activity}{projects}</div>;
}
