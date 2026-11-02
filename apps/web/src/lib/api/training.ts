/** Tipos de M04/M06; transportados exclusivamente por nuestra API FastAPI. */
import { request } from './client';

export interface DenseLayer { units: number; activation: 'relu' | 'tanh' | 'sigmoid' }
export interface RemoteArchitecture {
  id: string; project_id: string; name: string; family: 'feedforward'; version: number;
  config_json: { layers: DenseLayer[] }; created_at: string;
}
export type JobStatus = 'QUEUED' | 'PREPARING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export interface RemoteJob {
  id: string; project_id: string; architecture_id: string; dataset_id: string;
  status: JobStatus; progress: number; epoch: number; epochs: number;
  batch_size: number; learning_rate: number; seed: number; cancel_requested: boolean;
  error_message: string | null; created_at: string; started_at: string | null; ended_at: string | null;
}
export interface EpochMetric { epoch: number; loss: number; val_loss: number; accuracy: number | null; val_accuracy: number | null }
export interface RemoteModel {
  id: string; job_id: string; project_id: string; sha256: string;
  test_metrics: Record<string, number>; created_at: string;
}
const base = (project: string) => `/projects/${project}`;
export const getArchitectures = (p: string, t: string) => request<RemoteArchitecture[]>(`${base(p)}/architectures`, t);
export const createArchitecture = (p: string, t: string, name: string, layers: DenseLayer[]) =>
  request<RemoteArchitecture>(`${base(p)}/architectures`, t, 'POST', { name, layers });
export const getJobs = (p: string, t: string) => request<RemoteJob[]>(`${base(p)}/training-jobs`, t);
export const startJob = (p: string, t: string, data: { architecture_id: string; dataset_id: string; epochs: number; batch_size: number; learning_rate: number; seed: number }) =>
  request<RemoteJob>(`${base(p)}/training-jobs`, t, 'POST', data);
export const cancelJob = (p: string, t: string, id: string) => request<RemoteJob>(`${base(p)}/training-jobs/${id}/cancel`, t, 'POST');
export const getMetrics = (p: string, t: string, id: string) => request<EpochMetric[]>(`${base(p)}/training-jobs/${id}/metrics`, t);
export const getModels = (p: string, t: string) => request<RemoteModel[]>(`${base(p)}/models`, t);
