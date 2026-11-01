/** Contratos públicos de integración remota, no incluir secretos. */
export const apiUrl=(import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/,'');
export const supabaseUrl=(import.meta.env.VITE_SUPABASE_URL ?? '').trim();
export const supabaseKey=(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
export const configured=Boolean(apiUrl && supabaseUrl && supabaseKey);
