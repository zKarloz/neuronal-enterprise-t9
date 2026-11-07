// Punto único de validación para importar CSV tabulares y dígitos 8×8 en el navegador.
// No lee archivos remotos ni modifica el almacenamiento: devuelve datos validados al formulario.
import { MAX_CSV_BYTES, parseCsv } from './csv';
import { DIGIT_HEADERS, MAX_DIGITS_CSV_BYTES, parseDigitsCsv } from './digits';

export type LocalCsvImport = {
  kind: 'tabular' | 'digits8x8';
  headers: string[];
  rows: number[][];
};

/** Reconoce exclusivamente el contrato CNN; los CSV comunes nunca se fuerzan al parser de píxeles. */
export function detectLocalCsvKind(text: string): LocalCsvImport['kind'] {
  const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  const columns = firstLine.split(',').map(value => value.trim());
  // Un encabezado CNN parcialmente dañado debe conservar el error específico de píxeles.
  if (columns.length === DIGIT_HEADERS.length &&
      (columns[0].startsWith('pixel_') || columns.at(-1) === 'label')) return 'digits8x8';
  return 'tabular';
}

/** Aplica el límite correspondiente y deja al parser específico validar filas y columnas. */
export function parseLocalCsv(text: string, sizeBytes: number): LocalCsvImport {
  const kind = detectLocalCsvKind(text);
  if (kind === 'digits8x8') {
    if (sizeBytes > MAX_DIGITS_CSV_BYTES) throw new Error('El CSV de dígitos supera el límite de 1,5 MB.');
    return { kind, ...parseDigitsCsv(text) };
  }
  if (sizeBytes > MAX_CSV_BYTES) throw new Error('El CSV tabular supera el límite de 900 KB.');
  return { kind, ...parseCsv(text) };
}
