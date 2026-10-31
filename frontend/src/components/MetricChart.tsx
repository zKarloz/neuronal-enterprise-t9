// Gráfico SVG sin dependencias externas, alimentado por métricas registradas
import { useId } from 'react';
import type { EpochMetric } from '../types/domain';
import { formatMetric } from './ui';

// SVG nativo: las series provienen exclusivamente de épocas realmente ejecutadas
export function MetricChart({ metrics, height = 230 }: { metrics: EpochMetric[]; height?: number }) {
  const id = useId().replaceAll(':', '');
  if (!metrics.length) return <div className="grid h-48 place-items-center text-sm text-slate-400">No hay métricas registradas.</div>;
  const w = 720, h = height, padding = { left: 52, right: 18, top: 18, bottom: 33 };
  const plotW = w - padding.left - padding.right, plotH = h - padding.top - padding.bottom;
  const max = Math.max(...metrics.flatMap(m => [m.loss, m.valLoss]), 0.001) * 1.12;
  const min = Math.max(0, Math.min(...metrics.flatMap(m => [m.loss, m.valLoss])) * 0.8);
  const range = max - min || 1;
  const x = (i: number) => padding.left + i / Math.max(metrics.length - 1, 1) * plotW;
  const y = (value: number) => padding.top + (1 - (value - min) / range) * plotH;
  const path = (key: 'loss' | 'valLoss') => metrics.map((point, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(point[key]).toFixed(2)}`).join(' ');
  return <div className="chart-animate">
    <div className="mb-1 flex flex-wrap items-center justify-end gap-4 text-xs font-medium text-slate-500"><span className="flex items-center gap-1.5"><span className="h-2 w-5 rounded bg-primary-500" /> Entrenamiento</span><span className="flex items-center gap-1.5"><span className="h-2 w-5 rounded bg-teal-500" /> Validación</span></div>
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Gráfico de pérdida de entrenamiento y validación por época">
      <defs><linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#526fea" stopOpacity=".14" /><stop offset="100%" stopColor="#526fea" stopOpacity="0" /></linearGradient></defs>
      {Array.from({ length: 5 }, (_, i) => {
        const value = min + (range * (4 - i) / 4);
        const cy = padding.top + plotH * i / 4;
        return <g key={i}><line x1={padding.left} x2={w - padding.right} y1={cy} y2={cy} stroke="#e8eef6" strokeDasharray={i === 4 ? undefined : '5 6'} /><text x={padding.left - 9} y={cy + 4} textAnchor="end" fontSize="11" fill="#94a3b8">{value.toFixed(value >= 1 ? 2 : 3)}</text></g>;
      })}
      <path d={`${path('loss')} L${x(metrics.length - 1)},${padding.top + plotH} L${x(0)},${padding.top + plotH} Z`} fill={`url(#area-${id})`} />
      <path d={path('loss')} fill="none" stroke="#526fea" strokeWidth="2.7" strokeLinejoin="round" strokeLinecap="round" />
      <path d={path('valLoss')} fill="none" stroke="#10a991" strokeWidth="2.7" strokeLinejoin="round" strokeLinecap="round" />
      {Array.from({ length: Math.min(metrics.length, 6) }, (_, i) => {
        const index = Math.round(i * (metrics.length - 1) / Math.max(Math.min(metrics.length, 6) - 1, 1));
        return <text key={i} x={x(index)} y={h - 10} textAnchor="middle" fontSize="11" fill="#94a3b8">{metrics[index].epoch}</text>;
      })}
      <text x={w / 2} y={h - 1} fontSize="10" fill="#94a3b8" textAnchor="middle">Época</text>
    </svg>
    <div className="mt-2 flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500"><span>Última pérdida: <b className="text-ink">{formatMetric(metrics.at(-1)!.loss)}</b></span><span>Validación: <b className="text-ink">{formatMetric(metrics.at(-1)!.valLoss)}</b></span></div>
  </div>;
}
