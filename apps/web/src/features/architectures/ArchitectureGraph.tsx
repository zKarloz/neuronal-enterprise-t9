// Lienzo SVG interactivo: topología derivada de capas reales y selección accesible por teclado.
import type { KeyboardEvent } from 'react';
import type { HiddenLayer } from '../../types/domain';

type Selection = 'input' | 'output' | string;
interface GraphProps {
  inputs: number;
  layers: HiddenLayer[];
  selected: Selection;
  onSelect: (selection: Selection) => void;
}

/** Dibuja un máximo de 5 nodos por capa para evitar diagramas ilegibles con 64 unidades. */
export default function ArchitectureGraph({ inputs, layers, selected, onSelect }: GraphProps) {
  const groups = [
    { id: 'input', title: 'Entrada', count: inputs, activation: '' },
    ...layers.map((layer, i) => ({ id: layer.id, title: `Oculta ${i + 1}`, count: layer.units, activation: layer.activation })),
    { id: 'output', title: 'Salida', count: 1, activation: 'Automática' },
  ];
  const width = 860;
  const height = 350;
  const step = 740 / (groups.length - 1);
  const positions = groups.map((group, index) => {
    const visible = Math.min(Math.max(1, Number.isFinite(group.count) ? Math.floor(group.count) : 1), 5);
    const y = Array.from({ length: visible }, (_, j) => 104 + (visible === 1 ? 72 : j * (144 / (visible - 1))));
    return { x: 60 + index * step, y };
  });
  const onGraphKeyDown = (event: KeyboardEvent<SVGGElement>, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(id);
    }
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[620px]" role="group" aria-label="Diagrama de la arquitectura neuronal. Selecciona una capa con clic o teclado para editarla.">
      <defs>
        <linearGradient id="neurolab-graph" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f7faff"/>
          <stop offset="1" stopColor="#ffffff"/>
        </linearGradient>
      </defs>
      <rect width={width} height={height} rx="18" fill="url(#neurolab-graph)"/>
      {positions.slice(0, -1).flatMap((from, i) => from.y.flatMap((fy, j) => positions[i + 1].y.map((ty, k) => (
        <line key={`${i}-${j}-${k}`} x1={from.x + 13} y1={fy} x2={positions[i + 1].x - 13} y2={ty} stroke="#9fb1d1" strokeWidth="1" opacity="0.48"/>
      ))))}
      {groups.map((group, index) => {
        const { x, y } = positions[index];
        const active = selected === group.id;
        const isInput = index === 0;
        const isOutput = index === groups.length - 1;
        const accent = isOutput ? '#0d9488' : isInput ? '#7c8bc5' : '#526fea';
        return (
          <g key={group.id} role="button" tabIndex={0} aria-pressed={active} aria-label={`${group.title}, ${group.count} neuronas${group.activation ? `, activación ${group.activation}` : ''}`} onClick={() => onSelect(group.id)} onKeyDown={event => onGraphKeyDown(event, group.id)} className="cursor-pointer outline-none">
            <rect x={x - 42} y="40" width="84" height="256" rx="17" fill={active ? '#e8eeff' : '#ffffff'} fillOpacity={active ? 1 : 0.7} stroke={active ? '#526fea' : '#dce5f2'} strokeWidth={active ? 2.4 : 1.3}/>
            {y.map((cy, j) => <circle key={j} cx={x} cy={cy} r="12" fill={active ? '#526fea' : '#ffffff'} stroke={accent} strokeWidth="2.5"/>)}
            <text x={x} y="67" textAnchor="middle" fontSize="13" fontWeight="700" fill="#243450">{group.title}</text>
            {group.count > 5 && <text x={x} y="276" textAnchor="middle" fontSize="12" fill="#64748b">+{group.count - 5} más</text>}
            <text x={x} y="317" textAnchor="middle" fontSize="12" fontWeight="700" fill={active ? '#405bc0' : '#52637c'}>{group.count} {group.count === 1 ? 'unidad' : 'unidades'}</text>
            {active && <path d={`M ${x - 13} 332 L ${x} 338 L ${x + 13} 332 Z`} fill="#526fea"/>}
          </g>
        );
      })}
    </svg>
  );
}
