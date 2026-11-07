/** Contrato del respaldo del navegador: no confundir con proyectos Keras del servidor. */
import type { WorkspaceState } from '../types/domain';

export const MAX_CLOUD_BACKUP_BYTES = 3 * 1024 * 1024;

/** Verificación defensiva antes de reemplazar un espacio local con datos remotos. */
export function validateWorkspaceBackup(input: unknown): WorkspaceState {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('La copia no contiene un espacio de trabajo válido.');
  const data = input as Record<string, unknown>;
  const fields = ['projects', 'architectures', 'datasets', 'runs', 'models'] as const;
  const limits = [100, 500, 100, 1000, 500];
  for (const [index, field] of fields.entries()) {
    const records = data[field];
    if (!Array.isArray(records) || records.length > limits[index]) throw new Error(`La lista ${field} de la copia no es válida.`);
    const ids = new Set<string>();
    for (const item of records) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`Registro inválido en ${field}.`);
      const record = item as Record<string, unknown>;
      if (typeof record.id !== 'string' || !record.id || record.id.length > 80 || ids.has(record.id)) {
        throw new Error(`Hay identificadores inválidos o duplicados en ${field}.`);
      }
      ids.add(record.id);
    }
  }
  const projectIds = new Set((data.projects as { id: string }[]).map(p => p.id));
  if (data.activeProjectId !== null && (typeof data.activeProjectId !== 'string' || !projectIds.has(data.activeProjectId))) {
    throw new Error('El proyecto activo de la copia es inválido.');
  }
  if (!data.activeArchitectureIds || typeof data.activeArchitectureIds !== 'object' || Array.isArray(data.activeArchitectureIds)) {
    throw new Error('Las preferencias de arquitecturas son inválidas.');
  }
  for (const [projectId, architectureId] of Object.entries(data.activeArchitectureIds)) {
    if (!projectIds.has(projectId) || typeof architectureId !== 'string') throw new Error('La selección de arquitectura es inválida.');
  }
  for (const field of fields.slice(1)) {
    for (const record of data[field] as { projectId: string }[]) {
      if (typeof record.projectId !== 'string' || !projectIds.has(record.projectId)) {
        throw new Error(`La copia contiene elementos de ${field} sin proyecto válido.`);
      }
    }
  }
  for (const dataset of data.datasets as { headers: unknown; rows: unknown; target: unknown }[]) {
    if (!Array.isArray(dataset.headers) || dataset.headers.length === 0 || dataset.headers.length > 65 ||
        !dataset.headers.every(header => typeof header === 'string') ||
        new Set(dataset.headers).size !== dataset.headers.length ||
        (typeof dataset.target !== 'string' || !dataset.headers.includes(dataset.target)) || !Array.isArray(dataset.rows) || dataset.rows.length > 2000 ||
        !dataset.rows.every(row => Array.isArray(row) && row.length === (dataset.headers as string[]).length &&
          row.every(value => typeof value === 'number' && Number.isFinite(value)))) {
      throw new Error('La copia incluye un dataset incompatible.');
    }
  }
  // La comprobación superficial de modelos no ejecuta ni evalúa el JSON recibido.
  for (const model of data.models as { network?: unknown }[]) {
    if (!model.network || typeof model.network !== 'object') throw new Error('La copia incluye un modelo sin pesos.');
  }
  return input as WorkspaceState;
}

/** Las cifras se calculan a partir del respaldo, no de estimaciones simuladas. */
export function workspaceSummary(data: WorkspaceState) {
  return { projects: data.projects.length, datasets: data.datasets.length, runs: data.runs.length, models: data.models.length };
}

/** Importar también los archivos descargados antes de reemplazar otro navegador. */
export function parseWorkspaceBackupFile(raw: string): WorkspaceState {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error('El archivo seleccionado no contiene JSON válido.'); }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'workspace' in parsed) {
    const wrapped = parsed as { formatVersion?: unknown; workspace: unknown };
    if (wrapped.formatVersion !== 1) throw new Error('La versión de este respaldo no es compatible.');
    return validateWorkspaceBackup(wrapped.workspace);
  }
  return validateWorkspaceBackup(parsed);
}
