/** Única dirección externa consumida por React: nuestra API de FastAPI. */
export const apiUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
export const configured = Boolean(apiUrl);
