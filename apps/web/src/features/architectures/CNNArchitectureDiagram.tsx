// Diagrama semántico de arquitectura CNN ejecutable: dimensiones calculadas, no nodos ficticios.
import { ArrowRight, Grid3X3, Layers3, ScanLine } from 'lucide-react';
import type { CnnConfig } from '../../types/domain';

export default function CNNArchitectureDiagram({ cnn }: { cnn: CnnConfig }) {
  const nodes = [
    { title: 'Entrada', shape: '8 × 8 × 1', detail: 'Escala de grises · 0–16', icon: Grid3X3 },
    { title: 'Conv2D', shape: `6 × 6 × ${cnn.filters}`, detail: `${cnn.filters} filtros 3×3 · ReLU`, icon: Layers3 },
    { title: 'MaxPool2D', shape: `3 × 3 × ${cnn.filters}`, detail: 'Ventana 2×2', icon: ScanLine },
    { title: 'Flatten + Dense', shape: `${cnn.denseUnits} neuronas`, detail: `Flatten ${9 * cnn.filters} · ReLU`, icon: Layers3 },
    { title: 'Softmax', shape: '10 clases', detail: 'Dígitos del 0 al 9', icon: Grid3X3 },
  ];
  const parameters = (3 * 3 + 1) * cnn.filters + (9 * cnn.filters + 1) * cnn.denseUnits + (cnn.denseUnits + 1) * 10;
  return <div className="space-y-4"><div className="flex flex-wrap items-stretch gap-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
    {nodes.map((node, i) => <div key={node.title} className="flex min-w-0 grow items-center gap-2"><div className="min-w-[125px] grow rounded-xl border border-primary-100 bg-white px-3 py-4 shadow-sm"><node.icon size={20} className="mb-3 text-primary-600"/><div className="text-xs font-bold text-ink">{node.title}</div><div className="mt-1 font-mono text-sm font-semibold text-primary-700">{node.shape}</div><div className="mt-2 text-[11px] leading-4 text-slate-500">{node.detail}</div></div>{i < nodes.length - 1 && <ArrowRight aria-hidden="true" className="shrink-0 text-slate-400" size={15}/>}</div>)}
  </div><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-primary-50 p-3"><div className="text-xs text-slate-600">Parámetros entrenables</div><div className="text-xl font-bold text-ink">{parameters.toLocaleString('es-PE')}</div></div><div className="rounded-xl bg-primary-50 p-3"><div className="text-xs text-slate-600">Convolución</div><div className="text-xl font-bold text-ink">3 × 3</div></div><div className="rounded-xl bg-primary-50 p-3"><div className="text-xs text-slate-600">Salida</div><div className="text-xl font-bold text-ink">10 clases</div></div></div></div>;
}
