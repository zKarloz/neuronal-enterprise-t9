/** Notificaciones accesibles y no bloqueantes. Desaparecen en cinco segundos o con X. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';

export type ToastTone = 'info' | 'warning' | 'error' | 'success';
type Toast = { id: number; tone: ToastTone; content: ReactNode; leaving: boolean };
interface ToastApi { show: (content: ReactNode, tone: ToastTone) => number; dismiss: (id: number) => void }
const ToastContext = createContext<ToastApi | null>(null);
const colors: Record<ToastTone, string> = {
  info: 'border-zinc-300 text-zinc-900 dark:border-zinc-700 dark:text-zinc-100',
  warning: 'border-amber-400 text-amber-800 dark:text-amber-300',
  error: 'border-red-400 text-red-800 dark:text-red-300',
  success: 'border-emerald-400 text-emerald-800 dark:text-emerald-300',
};
const icons = { info: Info, warning: TriangleAlert, error: AlertCircle, success: CheckCircle2 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const sequence = useRef(0);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const schedule = useCallback((fn: () => void, delay: number) => {
    const timer = setTimeout(() => { timers.current.delete(timer); fn(); }, delay);
    timers.current.add(timer);
  }, []);
  const dismiss = useCallback((id: number) => {
    setItems(old => old.map(item => item.id === id ? { ...item, leaving: true } : item));
    schedule(() => setItems(old => old.filter(item => item.id !== id)), 250);
  }, [schedule]);
  const show = useCallback((content: ReactNode, tone: ToastTone) => {
    const id = ++sequence.current;
    setItems(old => [...old.slice(-3), { id, tone, content, leaving: false }]);
    schedule(() => dismiss(id), 5000);
    return id;
  }, [dismiss, schedule]);
  useEffect(() => () => { for (const timer of timers.current) clearTimeout(timer); timers.current.clear(); }, []);
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  return <ToastContext.Provider value={api}>
    {children}
    <div className="pointer-events-none fixed inset-x-3 top-[14%] z-[100] mx-auto flex max-w-[480px] flex-col gap-2" aria-live="polite" aria-atomic="false">
      {items.map(item => {
        const Icon = icons[item.tone];
        return <div key={item.id} role={item.tone === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex items-start gap-3 rounded-xl border-l-4 bg-white px-4 py-3 shadow-2xl transition-all duration-200 dark:bg-zinc-900 ${colors[item.tone]} ${item.leaving ? '-translate-y-2 opacity-0' : 'translate-y-0 opacity-100'}`}>
          <Icon size={19} className="mt-0.5 shrink-0"/>
          <div className="min-w-0 flex-1 text-sm leading-5">{item.content}</div>
          <button type="button" aria-label="Cerrar notificación" className="rounded-md p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => dismiss(item.id)}><X size={17}/></button>
        </div>;
      })}
    </div>
  </ToastContext.Provider>;
}

/** Adaptador: los avisos existentes se convierten en toasts sin reescribir cada módulo. */
export function FloatingNotice({ children, tone = 'info' }: { children: ReactNode; tone?: ToastTone }) {
  const api = useContext(ToastContext);
  const content = useRef(children);
  content.current = children;
  const messageKey = Array.isArray(children) ? children.filter(item => typeof item === 'string').join(':') :
    typeof children === 'string' ? children : '';
  useEffect(() => {
    if (!api) return;
    const id = api.show(content.current, tone);
    // React StrictMode puede montar/desmontar dos veces en desarrollo.
    return () => api.dismiss(id);
  }, [api, tone, messageKey]);
  return null;
}
