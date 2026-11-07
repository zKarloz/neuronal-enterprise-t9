/**
 * Sesiones de correo/contraseña usando exclusivamente nuestra API.
 * La sesión se conserva solo en esta pestaña mediante sessionStorage.
 * Para producción de mayor escala: BFF con cookies HttpOnly, CSRF y mismo dominio.
 */
import { request } from './client';

const STORAGE_KEY = 'neurolab-account-session-v2';
export const SESSION_CHANGED = 'neurolab:session-changed';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  email: string;
}

export interface RemoteSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  email: string;
}

function toSession(data: TokenResponse, fallbackEmail = ''): RemoteSession {
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    email: data.email || fallbackEmail,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

/** Guardar una sesión entregada por Supabase a través de FastAPI. */
export function saveTokenResponse(data: TokenResponse): RemoteSession {
  const result = toSession(data);
  saveSession(result);
  return result;
}

export function loadSession(): RemoteSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !('access_token' in data) || !('refresh_token' in data)) return null;
    const session = data as RemoteSession;
    return typeof session.access_token === 'string' && typeof session.refresh_token === 'string' && typeof session.expires_at === 'number' && typeof session.email === 'string' ? session : null;
  } catch { return null; }
}

export function saveSession(session: RemoteSession, notify = true): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  // La renovación del mismo usuario no debe desmontar entrenamientos activos.
  if (notify) window.dispatchEvent(new Event(SESSION_CHANGED));
}

export function clearSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(SESSION_CHANGED));
}

export async function signInWithPassword(email: string, password: string): Promise<RemoteSession> {
  const data = await request<TokenResponse>('/auth/password/login', undefined, 'POST', { email, password });
  return saveTokenResponse(data);
}

export async function signUpWithPassword(email: string, password: string): Promise<{ confirmation_required: boolean }> {
  const result = await request<{ confirmation_required: boolean; session: TokenResponse | null }>(
    '/auth/password/signup', undefined, 'POST', { email, password },
  );
  if (result.session) saveTokenResponse(result.session);
  return { confirmation_required: result.confirmation_required };
}

export async function sendRecoveryEmail(email: string): Promise<void> {
  await request('/auth/password/recover', undefined, 'POST', { email });
}

export async function updateRecoveredPassword(accessToken: string, password: string): Promise<void> {
  await request('/auth/password/update', accessToken, 'POST', { password });
}

/** Endpoints OTP antiguos solo se conservan para compatibilidad de archivo. */
export async function sendOtp(email: string): Promise<void> {
  await request('/auth/otp', undefined, 'POST', { email });
}

export async function verifyOtp(email: string, code: string): Promise<RemoteSession> {
  const response = await request<TokenResponse>('/auth/verify', undefined, 'POST', { email, token: code });
  const session = toSession(response, email);
  saveSession(session);
  return session;
}

export async function ensureSession(session: RemoteSession): Promise<RemoteSession> {
  // Renovación preventiva para no perder operaciones al expirar el JWT.
  if (session.expires_at > Date.now() + 60_000) return session;
  const response = await request<TokenResponse>('/auth/refresh', undefined, 'POST', {
    refresh_token: session.refresh_token,
  });
  const refreshed = toSession(response, session.email);
  saveSession(refreshed, false);
  return refreshed;
}

export async function logout(session: RemoteSession): Promise<void> {
  try {
    await request('/auth/logout', session.access_token, 'POST');
  } finally {
    clearSession();
  }
}
