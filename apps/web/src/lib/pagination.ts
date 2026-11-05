/** Operaciones puras para paginar sin modificar los datos originales. */
export const DEFAULT_PAGE_SIZE = 5;
export const PAGE_SIZE_OPTIONS = [5, 10, 20] as const;

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, size)));
}
export function pageItems<T>(items: readonly T[], page: number, size: number): T[] {
  const safeSize = Number.isFinite(size) ? Math.max(1, Math.floor(size)) : DEFAULT_PAGE_SIZE;
  const safePage = Number.isFinite(page) ? Math.min(Math.max(1, Math.floor(page)), pageCount(items.length, safeSize)) : 1;
  return items.slice((safePage - 1) * safeSize, safePage * safeSize);
}
