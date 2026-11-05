// Gráficos SVG accesibles, reutilizados en M06 (en vivo) y M07 (histórico).
import { useId } from 'react';
import type { EpochMetric } from '../types/domain';
import { formatMetric } from './ui';

type ChartKind = 'loss' | 'accuracy';

/**
 * Solo se dibujan épocas registradas. Los valores opcionales de accuracy
 * no se sustituyen por ceros: pueden faltar en tareas de regresión.
 */
export function MetricChart({ metrics, height = 230, kind = 'loss' }: {
  metrics: EpochMetric[]; height?: number; kind?: ChartKind;
}) {
  const id = useId().replaceAll(':', '');
  const accuracy = kind === 'accuracy';
  const keys = accuracy ? (['accuracy', 'valAccuracy'] as const) : (['loss', 'valLoss'] as const);
  const series = keys.map(key => metrics.map(m => m[key]));
  const values = series.flat().filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!values.length) return <div className="grid h-48 place-items-center text-sm text-slate-400">No hay métricas registradas.</div>;

  const w = 720, h = height, padding = { left: 52, right: 18, top: 18, bottom: 33 };
  const plotW = w - padding.left - padding.right, plotH = h - padding.top - padding.bottom;
  // Accuracy es una proporción (0–1). Loss adapta su rango a los valores reales.
  const min = accuracy ? 0 : Math.max(0, Math.min(...values) * 0.8);
  const max = accuracy ? 1 : Math.max(...values, 0.001) * 1.12;
  const range = max - min || 1;
  const x = (i: number) => padding.left + (metrics.length === 1 ? plotW / 2 : i / (metrics.length - 1) * plotW);
  const y = (value: number) => padding.top + (1 - (value - min) / range) * plotH;
  const points = (key: (typeof keys)[number]) => metrics.map((m, i) => ({ i, value: m[key] }))
    .filter((p): p is { i: number; value: number } => typeof p.value === 'number' && Number.isFinite(p.value));
  const path = (key: (typeof keys)[number]) => {
    // Si falta una métrica intermedia, no unir puntos que nunca existieron.
    let previous = -2;
    return points(key).map(p => {
      const command = p.i === previous + 1 ? 'L' : 'M';
      previous = p.i;
      return `${command}${x(p.i).toFixed(2)},${y(p.value).toFixed(2)}`;
    }).join(' ');
  };
  const last = (key: (typeof keys)[number]) => points(key).at(-1);
  const format = (value: number) => accuracy ? `${(value * 100).toFixed(1)} %` : formatMetric(value);
  const lastTraining = last(keys[0]), lastValidation = last(keys[1]);

  return <div className="chart-animate">
    <div className="mb-1 flex flex-wrap items-center justify-end gap-4 text-xs font-medium text-slate-500">
      <span className="flex items-center gap-1.5"><span className="h-2 w-5 rounded bg-primary-500"/> Entrenamiento</span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-5 rounded bg-teal-500"/> Validación</span>
    </div>
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} role="img"
      aria-label={accuracy ? 'Gráfico de precisión de entrenamiento y validación por época' : 'Gráfico de pérdida de entrenamiento y validación por época'}>
      <defs><linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-training, #526fea)" stopOpacity=".14"/><stop offset="100%" stopColor="var(--chart-training, #526fea)" stopOpacity="0"/></linearGradient></defs>
      {Array.from({ length: 5 }, (_, i) => {
        const value = min + range * (4 - i) / 4;
        const cy = padding.top + plotH * i / 4;
        return <g key={i}><line x1={padding.left} x2={w - padding.right} y1={cy} y2={cy} stroke="var(--chart-grid, #e8eef6)" strokeDasharray={i === 4 ? undefined : '5 6'}/>
          <text x={padding.left - 9} y={cy + 4} textAnchor="end" fontSize="11" fill="var(--chart-label, #94a3b8)">{accuracy ? `${Math.round(value * 100)}%` : value.toFixed(value >= 1 ? 2 : 3)}</text></g>;
      })}
      {!accuracy && metrics.length > 1 && <path d={`${path(keys[0])} L${x(metrics.length - 1)},${padding.top + plotH} L${x(0)},${padding.top + plotH} Z`} fill={`url(#area-${id})`}/>}
      <path d={path(keys[0])} fill="none" stroke="var(--chart-training, #526fea)" strokeWidth="2.7" strokeLinejoin="round" strokeLinecap="round"/>
      <path d={path(keys[1])} fill="none" stroke="var(--chart-validation, #10a991)" strokeWidth="2.7" strokeLinejoin="round" strokeLinecap="round"/>
      {/* Puntos visibles incluso si solamente terminó la primera época. */}
      {lastTraining && <circle cx={x(lastTraining.i)} cy={y(lastTraining.value)} r="4" fill="var(--chart-training, #526fea)" stroke="var(--chart-point-border, white)" strokeWidth="1.5"/>}
      {lastValidation && <circle cx={x(lastValidation.i)} cy={y(lastValidation.value)} r="4" fill="var(--chart-validation, #10a991)" stroke="var(--chart-point-border, white)" strokeWidth="1.5"/>}
      {Array.from({ length: Math.min(metrics.length, 6) }, (_, i) => {
        const index = Math.round(i * (metrics.length - 1) / Math.max(Math.min(metrics.length, 6) - 1, 1));
        return <text key={i} x={x(index)} y={h - 10} textAnchor="middle" fontSize="11" fill="var(--chart-label, #94a3b8)">{metrics[index].epoch}</text>;
      })}
      <text x={w / 2} y={h - 1} fontSize="10" fill="var(--chart-label, #94a3b8)" textAnchor="middle">Época</text>
    </svg>
    <div className="mt-2 flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
      <span>{accuracy ? 'Precisión' : 'Última pérdida'}: <b className="text-ink">{lastTraining ? format(lastTraining.value) : '—'}</b></span>
      <span>Validación: <b className="text-ink">{lastValidation ? format(lastValidation.value) : '—'}</b></span>
    </div>
  </div>;
}
