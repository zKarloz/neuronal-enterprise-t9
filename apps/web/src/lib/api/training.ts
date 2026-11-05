/** Tipos de M04/M06; transportados exclusivamente por nuestra API FastAPI. */
import { request } from './client';
import { apiUrl } from './config';

export interface DenseLayer { units: number; activation: 'relu' | 'tanh' | 'sigmoid' }
export interface RemoteArchitecture {
  id: string; project_id: string; name: string; family: 'feedforward' | 'cnn_8x8'; version: number;
  config_json: { layers?: DenseLayer[]; family?: 'cnn_8x8'; conv_filters?: number; kernel_size?: number; dense_units?: number }; created_at: string;
}
/** Contrato discriminado: no mezclar parámetros CNN con capas Feedforward. */
export type ArchitectureDraft =
  | { name: string; family: 'feedforward'; layers: DenseLayer[] }
  | { name: string; family: 'cnn_8x8'; conv_filters: number; kernel_size: 3; dense_units: number };
export type JobStatus = 'QUEUED' | 'PREPARING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export interface RemoteJob {
  id: string; project_id: string; architecture_id: string; dataset_id: string;
  status: JobStatus; progress: number; epoch: number; epochs: number;
  batch_size: number; learning_rate: number; seed: number; early_stopping_patience: number; cancel_requested: boolean;
  error_message: string | null; created_at: string; started_at: string | null; ended_at: string | null;
  heartbeat_at: string | null; retry_of_job_id: string | null;
}
export interface EpochMetric { epoch: number; loss: number; val_loss: number; accuracy: number | null; val_accuracy: number | null }
export type ModelStage = 'candidate' | 'production' | 'archived';
export interface RemoteModel {
  id: string; job_id: string; project_id: string; sha256: string;
  test_metrics: Record<string, number>; created_at: string;
  name: string; notes: string; stage: ModelStage;
  best_epoch: number | null; epochs_trained: number | null; early_stopped: boolean | null;
}
const base = (project: string) => `/projects/${project}`;
export const getArchitectures = (p: string, t: string) => request<RemoteArchitecture[]>(`${base(p)}/architectures`, t);
export const createArchitecture = (p: string, t: string, draft: ArchitectureDraft) =>
  request<RemoteArchitecture>(`${base(p)}/architectures`, t, 'POST', draft);
export const getJobs = (p: string, t: string) => request<RemoteJob[]>(`${base(p)}/training-jobs`, t);
export const startJob = (p: string, t: string, data: { architecture_id: string; dataset_id: string; epochs: number; batch_size: number; learning_rate: number; seed: number; early_stopping_patience: number }) =>
  request<RemoteJob>(`${base(p)}/training-jobs`, t, 'POST', data);
export const cancelJob = (p: string, t: string, id: string) => request<RemoteJob>(`${base(p)}/training-jobs/${id}/cancel`, t, 'POST');
export const getMetrics = (p: string, t: string, id: string) => request<EpochMetric[]>(`${base(p)}/training-jobs/${id}/metrics`, t);
export const getModels = (p: string, t: string) => request<RemoteModel[]>(`${base(p)}/models`, t);
export const updateModel = (p: string, t: string, id: string, data: { name?: string; notes?: string; stage?: ModelStage }) =>
  request<RemoteModel>(`${base(p)}/models/${id}`, t, 'PATCH', data);


/** El stream usa fetch porque EventSource no permite cabeceras Authorization. */
export interface JobSnapshot { job: RemoteJob; metrics: EpochMetric[]; model: RemoteModel | null }
export const retryJob = (p: string, t: string, id: string) =>
  request<RemoteJob>(`${base(p)}/training-jobs/${id}/retry`, t, 'POST');

export async function watchJobEvents(
  project: string, bearer: string, id: string, signal: AbortSignal,
  onSnapshot: (snapshot: JobSnapshot) => void,
): Promise<void> {
  const response = await fetch(`${apiUrl}/api/v1${base(project)}/training-jobs/${id}/events`, {
    headers: { Authorization: `Bearer ${bearer}`, Accept: 'text/event-stream' },
    cache: 'no-store', signal,
  });
  if (!response.ok) throw new Error(`No se pudo abrir SSE: HTTP ${response.status}`);
  if (!response.body) throw new Error('El navegador no admite streaming HTTP.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');
      // Una instantánea de M06 es pequeña; un bloque excesivo se rechaza.
      if (buffer.length > 1_000_000) throw new Error('Evento SSE demasiado grande.');
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (block.split('\n').some(line => line.trim() === 'event: snapshot')) {
          const json = block.split('\n').filter(line => line.startsWith('data: '))
            .map(line => line.slice(6)).join('\n');
          if (json) onSnapshot(JSON.parse(json) as JobSnapshot);
        }
        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}
