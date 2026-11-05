// Biblioteca de componentes compartidos de interfaz enterprise.
import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowRight, Cloud, HardDrive, Inbox, X } from 'lucide-react';
import { FloatingNotice, type ToastTone } from './ToastProvider';

/** Componentes presentacionales comunes para mantener uniformidad visual. */
export function Heading({ title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div className="max-w-2xl">
      {/* Se conserva la prop por compatibilidad; el shell ya muestra el contexto.
          No duplicar etiquetas como "Documentación · M09" en cada página. */}
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px]">{title}</h1>
      {description && <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>}
    </div>
    {action}
  </div>;
}

/** Pestañas de modo comunes a M02/M05/M06/M07/M08/M09. */
export function ModeTabs({ mode, setMode, label = 'Origen de datos' }: {
  mode: 'local' | 'server'; setMode: (mode: 'local' | 'server') => void; label?: string;
}) {
  return <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label={label}>
    <button type="button" className={mode === 'local' ? 'btn-primary' : 'btn-outline'}
      aria-pressed={mode === 'local'} onClick={() => setMode('local')}><HardDrive size={16}/> Navegador</button>
    <button type="button" className={mode === 'server' ? 'btn-primary' : 'btn-outline'}
      aria-pressed={mode === 'server'} onClick={() => setMode('server')}><Cloud size={16}/> Servidor</button>
  </div>;
}
export function EmptyState({ icon, title, description, action, compact = false }: { icon?: ReactNode; title: string; description: string; action?: ReactNode; compact?: boolean }) {
  return <div className={`flex flex-col items-center justify-center px-6 text-center ${compact ? 'py-10' : 'py-16'}`}>
    <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary-50 text-primary-600">{icon ?? <Inbox size={26} />}</div>
    <h3 className="text-base font-bold text-ink">{title}</h3>
    <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">{description}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>;
}
export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: ToastTone }) {
  return <FloatingNotice tone={tone}>{children}</FloatingNotice>;
}
/** Diálogo compartido: adaptable, desplazable y cerrado con Escape o clic exterior. */
export function Modal({ title, onClose, children, footer, wide = false }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    // Conservar el foco y bloquear el scroll mientras el diálogo esté abierto.
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter(element => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    const onKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyboard);
    return () => { document.removeEventListener('keydown', onKeyboard); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} className={`modal-surface flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-float ${wide ? 'max-w-3xl' : 'max-w-lg'}`}>
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4"><h2 className="text-lg font-bold text-ink">{title}</h2><button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar" onClick={onClose}><X size={20}/></button></div>
      <div className="min-h-0 overflow-y-auto px-5 py-5">{children}</div>
      {footer && <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">{footer}</div>}
    </section>
  </div>;
}
export function StatusPill({ status }: { status: string }) {
  const colors: Record<string,string> = { active: 'bg-emerald-50 text-emerald-700', archived: 'bg-slate-100 text-slate-600', running: 'bg-blue-50 text-blue-700', queued: 'bg-amber-50 text-amber-700', completed: 'bg-emerald-50 text-emerald-700', failed: 'bg-red-50 text-red-700', cancelled: 'bg-slate-100 text-slate-600' };
  const labels: Record<string,string> = { active: 'Activo', archived: 'Archivado', running: 'Ejecutando', queued: 'En cola', completed: 'Completado', failed: 'Fallido', cancelled: 'Cancelado' };
  return <span className={`pill ${colors[status] ?? 'bg-slate-100 text-slate-700'}`}><span className="h-1.5 w-1.5 rounded-full bg-current"/>{labels[status] ?? status}</span>;
}
export function CardLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700">{children}<ArrowRight size={15}/></button>;
}
export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="mb-4 flex items-start justify-between gap-4"><div><h2 className="text-base font-bold text-ink">{title}</h2>{subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}</div>{action}</div>;
}
export const formatDate = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export { formatMetric, formatAccuracy } from '../lib/metrics-format';
