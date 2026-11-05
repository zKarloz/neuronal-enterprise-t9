/** Utilidades puras para las métricas de M06, compatibles con SSE y REST. */
import type { EpochMetric as ChartEpochMetric } from '../types/domain';

/** Contrato mínimo de las épocas devueltas por FastAPI. */
export interface RemoteEpochPoint {
  epoch: number;
  loss: number;
  val_loss: number;
  accuracy: number | null;
  val_accuracy: number | null;
}

/**
 * Une instantáneas sin perder épocas ante respuestas REST tardías o reconexiones SSE.
 * Una época ya registrada es inmutable: el backend la guarda al finalizarla.
 */
export function mergeRemoteMetrics<T extends RemoteEpochPoint>(previous: T[], incoming: T[]): T[] {
  const byEpoch = new Map<number, T>();
  for (const item of previous) {
    if (Number.isInteger(item.epoch) && item.epoch > 0) byEpoch.set(item.epoch, item);
  }
  for (const item of incoming) {
    if (Number.isInteger(item.epoch) && item.epoch > 0 && !byEpoch.has(item.epoch)) {
      byEpoch.set(item.epoch, item);
    }
  }
  return [...byEpoch.values()].sort((a, b) => a.epoch - b.epoch);
}

/** Adaptación explícita del formato snake_case del servidor al gráfico compartido. */
export function toChartMetrics(rows: RemoteEpochPoint[]): ChartEpochMetric[] {
  return rows.map(row => ({
    epoch: row.epoch,
    loss: row.loss,
    valLoss: row.val_loss,
    accuracy: row.accuracy === null ? undefined : row.accuracy,
    valAccuracy: row.val_accuracy === null ? undefined : row.val_accuracy,
  }));
}

/** La regresión no expone accuracy, así que no mostramos curvas vacías. */
export function hasAccuracyMetrics(rows: RemoteEpochPoint[]): boolean {
  return rows.some(row => (row.accuracy !== null && Number.isFinite(row.accuracy)) ||
    (row.val_accuracy !== null && Number.isFinite(row.val_accuracy)));
}
