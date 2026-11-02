/** Tipos y transporte de M05, siempre mediante nuestra API FastAPI. */
import { apiUrl } from './config';
import { request } from './client';

export interface RemoteColumn {
  name: string;
  type: 'number' | 'text';
  null_count: number;
  distinct_count: number;
}

export interface Preparation {
  pipeline_version: number;
  task: 'classification' | 'regression';
  target_column: string;
  classes: string[] | null;
  split: { train: number; validation: number; test: number; seed: number; validation_fraction: number; test_fraction: number; dropped_missing_target: number };
  features: { name: string; kind: 'numeric' | 'categorical' }[];
  input_dimensions: number;
  indices: { train: number[]; validation: number[]; test: number[] };
}

export interface RemoteDataset {
  id: string;
  project_id: string;
  name: string;
  version: number;
  size_bytes: number;
  sha256: string;
  row_count: number;
  column_count: number;
  columns_json: RemoteColumn[];
  preview_json: string[][];
  prep_json: Preparation | null;
}

/** Obtener mensajes de error de FastAPI, incluyendo validaciones HTTP 422. */
async function checked(response: Response): Promise<Response> {
  if (response.ok) return response;
  let message = `Error HTTP ${response.status}`;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'detail' in body) {
      const detail = body.detail;
      if (typeof detail === 'string') message = detail;
    }
  } catch { /* Respuestas sin JSON. */ }
  throw new Error(message);
}

export async function uploadRemoteCsv(projectId: string, token: string, file: File): Promise<RemoteDataset> {
  const form = new FormData();
  form.append('file', file);
  const response = await checked(await fetch(`${apiUrl}/api/v1/projects/${projectId}/datasets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form, // No fijar Content-Type: fetch incorpora boundary automáticamente.
  }));
  return response.json() as Promise<RemoteDataset>;
}

export async function prepareRemoteCsv(projectId: string, datasetId: string, token: string,
  target: string, task: 'classification' | 'regression', validation: number, test: number, seed: number): Promise<RemoteDataset> {
  return request<RemoteDataset>(`/projects/${projectId}/datasets/${datasetId}/prepare`, token, 'POST', {
    target_column: target,
    task,
    validation_fraction: validation,
    test_fraction: test,
    seed,
  });
}

export async function downloadRemoteCsv(projectId: string, dataset: RemoteDataset, token: string): Promise<void> {
  const response = await checked(await fetch(`${apiUrl}/api/v1/projects/${projectId}/datasets/${dataset.id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  }));
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = dataset.name;
    anchor.click();
  } finally {
    // Liberar objeto después del inicio del evento de descarga.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
