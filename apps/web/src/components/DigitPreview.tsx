// Visualización real de los 64 píxeles de una imagen del dataset, sin imágenes precargadas ficticias.
export default function DigitPreview({ pixels, label, size = 96 }: { pixels: number[]; label?: number; size?: number }) {
  return <div className="inline-flex shrink-0 flex-col items-center gap-1"><div role="img" aria-label={`Dígito manuscrito${label !== undefined ? `, etiqueta ${label}` : ''}`} className="grid overflow-hidden rounded-lg border border-slate-200 bg-black" style={{ gridTemplateColumns: 'repeat(8, 1fr)', width: size, height: size }}>
    {pixels.slice(0, 64).map((value, index) => <span key={index} style={{ backgroundColor: `rgb(${Math.round(value * 255 / 16)} ${Math.round(value * 255 / 16)} ${Math.round(value * 255 / 16)})` }}/>) }
  </div>{label !== undefined && <span className="text-xs font-semibold text-slate-600">Etiqueta: {label}</span>}</div>;
}
