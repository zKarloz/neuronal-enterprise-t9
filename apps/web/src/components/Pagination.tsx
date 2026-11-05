/** Paginación accesible y uniforme para listas locales y remotas. */
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, pageCount } from '../lib/pagination';
export { pageItems } from '../lib/pagination';

/** El modo fixedSize permite cuadrículas exactas de 2×2 (cuatro modelos). */
export function Pagination({ total, page, onPageChange, pageSize = DEFAULT_PAGE_SIZE,
  onPageSizeChange, fixedSize = false, label = 'resultados' }: {
    total: number; page: number; onPageChange: (page: number) => void;
    pageSize?: number; onPageSizeChange?: (size: number) => void; fixedSize?: boolean; label?: string;
  }) {
  const pages = pageCount(total, pageSize);
  const current = Math.min(Math.max(1, page), pages);
  if (total <= pageSize && (fixedSize || !onPageSizeChange)) return null;
  const first = total ? (current - 1) * pageSize + 1 : 0;
  const last = Math.min(current * pageSize, total);
  return <nav aria-label={`Paginación de ${label}`} className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 text-xs text-slate-500">
    <span>{first}–{last} de {total} {label}</span>
    <div className="flex items-center gap-2">
      {!fixedSize && onPageSizeChange && <label className="flex items-center gap-2">Mostrar
        <select className="field w-auto py-1.5" value={pageSize} aria-label={`Registros por página de ${label}`}
          onChange={event => { onPageSizeChange(Number(event.target.value)); onPageChange(1); }}>
          {PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>}
      <button type="button" className="btn-outline px-2 py-1.5" aria-label="Página anterior" disabled={current <= 1} onClick={() => onPageChange(current - 1)}><ChevronLeft size={16}/></button>
      <span aria-live="polite">{current} / {pages}</span>
      <button type="button" className="btn-outline px-2 py-1.5" aria-label="Página siguiente" disabled={current >= pages} onClick={() => onPageChange(current + 1)}><ChevronRight size={16}/></button>
    </div>
  </nav>;
}
