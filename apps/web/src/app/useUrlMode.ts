/** Sincroniza las pestañas Navegador/Servidor con URL y botones Atrás/Adelante. */
import { useCallback, useEffect, useState } from 'react';
import { modeFromSearch, withMode, type WorkspaceMode } from '../lib/page-routes';
import { loadSession } from '../lib/api/session';
import { hasGoogleReturn } from '../lib/api/google-oauth';

export function useUrlMode(oauthCallback = false, preferServerWhenSignedIn = true): readonly [WorkspaceMode, (next: WorkspaceMode) => void] {
  const [mode, setMode] = useState<WorkspaceMode>(() =>
    oauthCallback && hasGoogleReturn() ? 'server' :
    (preferServerWhenSignedIn && !new URLSearchParams(window.location.search).has('vista') && loadSession())
      ? 'server' : modeFromSearch(window.location.search));

  useEffect(() => {
    // Google siempre vuelve a `/`; conservar el modo remoto y el código temporal.
    if ((oauthCallback || preferServerWhenSignedIn) && mode === 'server' && modeFromSearch(window.location.search) !== 'server') {
      window.history.replaceState(window.history.state, '', withMode(new URL(window.location.href), 'server'));
      window.dispatchEvent(new Event('neurolab:mode-changed'));
    }
    const onPopstate = () => setMode(modeFromSearch(window.location.search));
    window.addEventListener('popstate', onPopstate);
    return () => window.removeEventListener('popstate', onPopstate);
  }, [oauthCallback, preferServerWhenSignedIn]);

  const navigateMode = useCallback((next: WorkspaceMode) => {
    const current = modeFromSearch(window.location.search);
    if (current !== next) {
      const nextUrl = new URL(window.location.href);
      const path = withMode(nextUrl, next);
      // Dashboard: cuando hay sesión, vista=navegador debe quedar explícito
      // para que al refrescar no se fuerce nuevamente la vista Servidor.
      window.history.pushState(window.history.state, '',
        preferServerWhenSignedIn && next === 'local' ? `${nextUrl.pathname}?vista=navegador${nextUrl.hash}` : path);
      window.dispatchEvent(new Event('neurolab:mode-changed'));
    }
    setMode(next);
  }, [preferServerWhenSignedIn]);

  return [mode, navigateMode] as const;
}
