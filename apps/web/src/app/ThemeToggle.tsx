/** Tema oscuro de escala de grises; la preferencia persiste entre recargas. */
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
const KEY = 'neurolab-theme-v1';
export default function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    try { const value = localStorage.getItem(KEY); return value === 'dark' || (value === null && window.matchMedia('(prefers-color-scheme: dark)').matches); }
    catch { return false; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle('theme-dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    try { localStorage.setItem(KEY, dark ? 'dark' : 'light'); } catch { /* Modo privado. */ }
  }, [dark]);
  return <button type="button" className="theme-toggle grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-100"
    aria-label={dark ? 'Cambiar al tema claro' : 'Cambiar al tema oscuro'} aria-pressed={dark} title={dark ? 'Tema claro' : 'Tema oscuro'} onClick={() => setDark(old => !old)}>
    {dark ? <Sun size={19}/> : <Moon size={19}/>}
  </button>;
}
