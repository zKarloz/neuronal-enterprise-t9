/** Rutas visibles de los diez módulos. No dependen del estado del navegador. */
export const PAGE_PATHS = {
  dashboard: '/panel',
  projects: '/proyectos',
  fundamentals: '/fundamentos',
  architectures: '/arquitecturas',
  datasets: '/datasets',
  training: '/entrenamientos',
  evaluation: '/evaluacion',
  models: '/modelos',
  reports: '/reportes',
  administration: '/administracion',
} as const;

export type Page = keyof typeof PAGE_PATHS;
export type WorkspaceMode = 'local' | 'server';

/** Permite deep-links y mantiene compatible la URL inicial `/`. */
export function pageFromPath(pathname: string): Page {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  const match = (Object.entries(PAGE_PATHS) as [Page, string][])
    .find(([, path]) => path === normalized);
  return match?.[0] ?? 'dashboard';
}

export function pagePath(page: Page): string {
  return PAGE_PATHS[page];
}

/** El modo remoto se refleja en la URL para preservarlo al recargar. */
export function modeFromSearch(search: string): WorkspaceMode {
  return new URLSearchParams(search).get('vista') === 'servidor' ? 'server' : 'local';
}

/** Conservar otros parámetros, especialmente los del retorno de Google OAuth. */
export function withMode(url: URL, mode: WorkspaceMode): string {
  const result = new URL(url.href);
  if (mode === 'server') result.searchParams.set('vista', 'servidor');
  else result.searchParams.delete('vista');
  return `${result.pathname}${result.search}${result.hash}`;
}

/** Compatibilidad: solo un enlace explícito desde Administración abre servicios remotos antiguos. */
export function isLegacyServerSearch(search: string): boolean {
  return new URLSearchParams(search).get('vista') === 'servidor';
}

/** No se incluyen JWT ni identificadores privados en los enlaces compartibles. */
export function legacyPagePath(page: Page): string {
  return `${pagePath(page)}?vista=servidor`;
}
