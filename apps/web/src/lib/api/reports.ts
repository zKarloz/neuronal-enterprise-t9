/** M09: contratos de reportes remotos; nunca incluye datos originales ni claves. */
import { downloadPrivate, request } from './client';

export interface ProjectReport {
  generated_at: string;
  project: { id: string; name: string; description: string; status: string };
  architectures: { id: string; name: string; version: number; family: string; configuration: object }[];
  datasets: { id: string; name: string; version: number; rows: number; columns: number; prepared: boolean; sha256: string }[];
  jobs: { id: string; architecture_id: string; dataset_id: string; status: string; epochs: number; epochs_executed: number; created_at: string | null }[];
  models: { id: string; job_id: string; name: string; stage: string; sha256: string; test_metrics: Record<string, number> }[];
  limited_to: number;
}
const reportPath = (id: string) => `/projects/${id}/reports`;
export const getProjectReport = (id: string, token: string) =>
  request<ProjectReport>(`${reportPath(id)}/summary`, token);
export const downloadEpochsCsv = (id: string, token: string) =>
  downloadPrivate(`${reportPath(id)}/epochs.csv`, token, `neurolab-metricas-${id}.csv`);
export const downloadProjectPdf = (id: string, token: string) =>
  downloadPrivate(`${reportPath(id)}/project.pdf`, token, `neurolab-proyecto-${id}.pdf`);
