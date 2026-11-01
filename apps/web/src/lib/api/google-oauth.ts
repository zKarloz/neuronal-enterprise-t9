/** Inicio de Google OAuth PKCE sin SDK de Supabase en el frontend. */
import { apiUrl } from './config';
import { request } from './client';
import { saveTokenResponse, type RemoteSession } from './session';

const FLOW_KEY = 'neurolab-google-pkce-v1';
const MAX_AGE_MS = 10 * 60 * 1000;

interface PendingFlow { state: string; verifier: string; createdAt: number }

type OAuthReturn = { code?: string; state?: string; error?: string };

/** Convertir bytes seguros en base64url sin relleno. */
function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomBase64Url(bytes = 32): string {
  const random = crypto.getRandomValues(new Uint8Array(bytes));
  return base64Url(random);
}

/** Generar challenge SHA-256; no usamos métodos PKCE débiles. */
async function sha256Challenge(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(hash));
}

export async function startGoogleOAuth(): Promise<void> {
  if (!apiUrl) throw new Error('La API de NeuroLab no está configurada.');
  if (!crypto?.subtle) throw new Error('Google OAuth necesita una conexión HTTPS segura.');
  const verifier = randomBase64Url(48);
  const state = randomBase64Url(32);
  const codeChallenge = await sha256Challenge(verifier);
  sessionStorage.setItem(FLOW_KEY, JSON.stringify({ verifier, state, createdAt: Date.now() } satisfies PendingFlow));
  const query = new URLSearchParams({ code_challenge: codeChallenge, state });
  // Redirección de página completa: el navegador visita Google, no consulta su API.
  window.location.assign(`${apiUrl}/api/v1/auth/google/start?${query.toString()}`);
}

/** Eliminar inmediatamente el código OAuth de la barra de direcciones. */
export function consumeGoogleReturn(): OAuthReturn | null {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('nl_oauth_code') ?? undefined;
  const state = url.searchParams.get('nl_oauth_state') ?? undefined;
  const error = url.searchParams.get('nl_oauth_error') ?? undefined;
  if (!code && !error) return null;
  ['nl_oauth_code', 'nl_oauth_state', 'nl_oauth_error'].forEach(key => url.searchParams.delete(key));
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  return { code, state, error };
}

export async function completeGoogleOAuth(result: OAuthReturn): Promise<RemoteSession> {
  const raw = sessionStorage.getItem(FLOW_KEY);
  // Un solo intercambio; un callback repetido no debe reutilizar el verifier.
  sessionStorage.removeItem(FLOW_KEY);
  if (!raw) throw new Error('No se encontró una solicitud Google pendiente. Vuelve a iniciar sesión.');
  let flow: PendingFlow;
  try { flow = JSON.parse(raw) as PendingFlow; }
  catch { throw new Error('La sesión de autenticación no es válida.'); }
  if (!flow.state || !flow.verifier || Date.now() - flow.createdAt > MAX_AGE_MS ||
      Date.now() < flow.createdAt || result.state !== flow.state) {
    throw new Error('La autenticación no coincide con la solicitud original o ha caducado.');
  }
  if (result.error) throw new Error('Google no completó la autenticación. Inténtalo de nuevo.');
  if (!result.code) throw new Error('No llegó el código de autorización.');
  const session = await request<{
    access_token: string; refresh_token: string; expires_in: number; email: string;
  }>('/auth/google/exchange', undefined, 'POST', {
    auth_code: result.code,
    code_verifier: flow.verifier,
  });
  return saveTokenResponse(session);
}

/** Evitar inicio de sesión desde una pestaña distinta: PKCE es específico de ella. */
export function hasGoogleReturn(): boolean {
  const search = new URLSearchParams(window.location.search);
  return search.has('nl_oauth_code') || search.has('nl_oauth_error');
}
