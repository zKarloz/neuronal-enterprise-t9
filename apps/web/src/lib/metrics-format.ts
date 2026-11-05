/** Formatos de presentación: se preservan las métricas originales en PostgreSQL. */
export function formatMetric(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : value.toLocaleString('es-PE', { maximumFractionDigits: 3 });
}
/** Accuracy siempre llega como proporción en [0,1], no como porcentaje. */
export function formatAccuracy(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : `${(value * 100).toLocaleString('es-PE', { maximumFractionDigits: 2 })} %`;
}
