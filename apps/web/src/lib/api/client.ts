/** Cliente REST compartido. Nunca accede a la API o SDK de Supabase. */
import { apiUrl } from './config';

export interface RemoteProject {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export async function request<T>(route: string, token?: string, method = 'GET', body?: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/api/v1${route}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Un TypeError de fetch no diferencia fallo de red, bloqueo CORS o proxy.
    throw new Error('No se pudo conectar con FastAPI. Comprueba la conexión, Render y FRONTEND_ORIGINS.');
  }
  if (!response.ok) {
    let message = `Error HTTP ${response.status}`;
    try {
      const data: unknown = await response.json();
      if (data && typeof data === 'object' && 'detail' in data && typeof data.detail === 'string') {
        message = data.detail;
      }
    } catch { /* Algunos errores no contienen JSON. */ }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
