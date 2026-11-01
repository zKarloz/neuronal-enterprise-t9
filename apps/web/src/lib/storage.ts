// Almacenamiento local y descargas iniciadas desde el navegador.
import type { WorkspaceState } from '../types/domain';

// Persistencia limitada al navegador: NO existe una base de datos ni datos de ejemplo.
const KEY = 'neurolab-enterprise-workspace-v1';
export const emptyWorkspace = (): WorkspaceState => ({
  projects: [], architectures: [], datasets: [], runs: [], models: [], activeProjectId: null, activeArchitectureIds: {},
});

export function readWorkspace(): WorkspaceState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyWorkspace();
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !('projects' in data)) return emptyWorkspace();
    const candidate = data as Partial<WorkspaceState>;
    if (!Array.isArray(candidate.projects)) return emptyWorkspace();
    return {
      projects: candidate.projects,
      architectures: Array.isArray(candidate.architectures) ? candidate.architectures : [],
      datasets: Array.isArray(candidate.datasets) ? candidate.datasets : [],
      runs: Array.isArray(candidate.runs) ? candidate.runs.map(r => r.status === 'running' || r.status === 'queued' ? ({ ...r, status: 'cancelled' as const, error: 'Sesión interrumpida: el entrenamiento local no puede continuar tras cerrar la página.' }) : r) : [],
      models: Array.isArray(candidate.models) ? candidate.models : [],
      activeProjectId: candidate.activeProjectId ?? null,
      // La versión v0.1.1 no tenía preferencias por arquitectura: se conserva el array original.
      activeArchitectureIds: candidate.activeArchitectureIds && typeof candidate.activeArchitectureIds === 'object' && !Array.isArray(candidate.activeArchitectureIds) ? candidate.activeArchitectureIds : {},
    };
  } catch {
    return emptyWorkspace();
  }
}
export function saveWorkspace(value: WorkspaceState): void {
  localStorage.setItem(KEY, JSON.stringify(value));
}
export function getWorkspaceBytes(): number {
  try { return new Blob([localStorage.getItem(KEY) || '']).size; }
  catch { return 0; }
}
export function exportJSON(filename: string, data: unknown): void {
  download(filename, JSON.stringify(data, null, 2), 'application/json');
}
export function download(filename: string, value: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([value], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
