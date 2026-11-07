/**
 * El callback de Google se procesa a nivel de aplicación, no dentro de Proyectos.
 * Así iniciar sesión sigue funcionando aunque ocultemos las pantallas del servidor.
 * La promesa compartida evita intercambiar dos veces el código en React StrictMode.
 */
import { useEffect, useState } from 'react';
import { consumeGoogleReturn, completeGoogleOAuth } from '../lib/api/google-oauth';
import type { RemoteSession } from '../lib/api/session';
import { Notice } from '../components/ui';

let pendingExchange: Promise<RemoteSession> | null = null;
function exchangePendingCallback(): Promise<RemoteSession> | null {
  if (pendingExchange) return pendingExchange;
  const callback = consumeGoogleReturn();
  if (!callback) return null;
  pendingExchange = completeGoogleOAuth(callback).finally(() => { pendingExchange = null; });
  return pendingExchange;
}

export default function GoogleOAuthReturn() {
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    const exchange = exchangePendingCallback();
    if (exchange) void exchange.catch(cause => {
      if (mounted) setError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión con Google.');
    });
    return () => { mounted = false; };
  }, []);
  return error ? <Notice tone="error">{error}</Notice> : null;
}
