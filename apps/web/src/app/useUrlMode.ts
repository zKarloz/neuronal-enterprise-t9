/** Sincroniza las pestañas Navegador/Servidor con URL y botones Atrás/Adelante. */
import { useCallback, useEffect, useState } from 'react';
import { modeFromSearch, withMode, type WorkspaceMode } from '../lib/page-routes';
import { hasGoogleReturn } from '../lib/api/google-oauth';

export function useUrlMode(oauthCallback = false): readonly [WorkspaceMode, (next: WorkspaceMode) => void] {
  const [mode, setMode] = useState<WorkspaceMode>(() =>
    oauthCallback && hasGoogleReturn() ? 'server' : modeFromSearch(window.location.search));

  useEffect(() => {
    // Google siempre vuelve a `/`; conservar el modo remoto y el código temporal.
    if (oauthCallback && mode === 'server' && modeFromSearch(window.location.search) !== 'server') {
      window.history.replaceState(window.history.state, '', withMode(new URL(window.location.href), 'server'));
    }
    const onPopstate = () => setMode(modeFromSearch(window.location.search));
    window.addEventListener('popstate', onPopstate);
    return () => window.removeEventListener('popstate', onPopstate);
  }, [oauthCallback]);

  const navigateMode = useCallback((next: WorkspaceMode) => {
    const current = modeFromSearch(window.location.search);
    if (current !== next) {
      window.history.pushState(window.history.state, '', withMode(new URL(window.location.href), next));
    }
    setMode(next);
  }, []);

  return [mode, navigateMode] as const;
}
