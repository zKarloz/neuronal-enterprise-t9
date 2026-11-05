/** Identidad global en el topbar; nunca se muestra un usuario local ficticio. */
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LoaderCircle, LogIn, LogOut, UserRound } from 'lucide-react';
import { startGoogleOAuth } from '../lib/api/google-oauth';
import { Notice } from '../components/ui';
import { loadSession, logout, SESSION_CHANGED, type RemoteSession } from '../lib/api/session';

export default function ProfileMenu() {
  const [session, setSession] = useState<RemoteSession | null>(() => loadSession());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => setSession(loadSession());
    const outside = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const visible = () => { if (document.visibilityState === 'visible') update(); };
    window.addEventListener(SESSION_CHANGED, update);
    window.addEventListener('focus', update);
    window.addEventListener('storage', update);
    window.addEventListener('click', outside);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener(SESSION_CHANGED, update);
      window.removeEventListener('focus', update);
      window.removeEventListener('storage', update);
      window.removeEventListener('click', outside);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);

  const signIn = async () => {
    setBusy(true); setError('');
    try { await startGoogleOAuth(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión.'); setBusy(false); }
  };
  const signOut = async () => {
    if (!session) return;
    setBusy(true); setError('');
    try { await logout(session); setSession(null); setOpen(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cerrar sesión.'); }
    finally { setBusy(false); }
  };

  return <div ref={root} className="relative ml-auto shrink-0">
    {!session ? <button type="button" onClick={() => void signIn()} disabled={busy}
      className="btn-primary !px-3 !py-2.5 text-xs sm:!px-4" aria-label="Iniciar sesión con Google">
      {busy ? <LoaderCircle size={16} className="animate-spin"/> : <LogIn size={16}/>}
      <span className="hidden sm:inline">Iniciar sesión</span><span className="sm:hidden">Acceder</span>
    </button> : <button type="button" aria-expanded={open} aria-haspopup="menu" aria-label={`Sesión: ${session.email}`}
      className="flex max-w-[220px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-left transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary-500"
      onClick={() => setOpen(value => !value)}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-100 text-primary-700"><UserRound size={17}/></span>
      <span className="hidden min-w-0 sm:block"><span className="block truncate text-xs font-semibold text-ink">{session.email.split('@')[0]}</span><span className="block text-[10px] text-emerald-700">Sesión iniciada</span></span>
      <ChevronDown size={15} className="hidden shrink-0 text-slate-400 sm:block"/>
    </button>}
    {session && open && <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-[min(300px,85vw)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Cuenta de Google</p>
      <p className="mt-1 break-all text-sm font-semibold text-ink">{session.email}</p>
      <div className="my-3 border-t border-slate-100"/>
      <button role="menuitem" type="button" disabled={busy} onClick={() => void signOut()}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50">
        {busy ? <LoaderCircle size={16} className="animate-spin"/> : <LogOut size={16}/>} Cerrar sesión
      </button>
    </div>}
    {error && <Notice tone="error">{error}</Notice>}
  </div>;
}
