// Contrato y validación del dataset real de dígitos de 8×8 para clasificación CNN.
import type { Dataset } from '../types/domain';

export const DIGIT_SIZE = 8;
export const PIXEL_COUNT = DIGIT_SIZE * DIGIT_SIZE;
export const DIGIT_HEADERS = [...Array.from({ length: PIXEL_COUNT }, (_, i) => `pixel_${i}`), 'label'];
export const MAX_DIGITS_CSV_BYTES = 1_500_000;

/** No confundir con CSV tabular: cada registro contiene 64 intensidades y una etiqueta. */
export function parseDigitsCsv(text: string): { headers: string[]; rows: number[][] } {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (lines.length < 31 || lines.length > 5001) throw new Error('El CSV de CNN requiere entre 30 y 5.000 imágenes.');
  const headers = lines[0].split(',').map(item => item.trim());
  if (headers.join('|') !== DIGIT_HEADERS.join('|')) throw new Error('Encabezados CNN inválidos: se esperan pixel_0 hasta pixel_63 y label.');
  const rows = lines.slice(1).map((line, index) => {
    const values = line.split(',').map(value => Number(value.trim()));
    if (values.length !== 65 || values.some(value => !Number.isFinite(value))) throw new Error(`Fila ${index + 2}: deben existir exactamente 65 valores numéricos.`);
    if (values.slice(0, 64).some(v => !Number.isInteger(v) || v < 0 || v > 16)) throw new Error(`Fila ${index + 2}: los píxeles deben ser enteros entre 0 y 16.`);
    if (!Number.isInteger(values[64]) || values[64] < 0 || values[64] > 9) throw new Error(`Fila ${index + 2}: la etiqueta debe ser un dígito de 0 a 9.`);
    return values;
  });
  const labels = new Set(rows.map(row => row[64]));
  if (labels.size < 2) throw new Error('Se necesitan por lo menos dos clases distintas para entrenar.');
  return { headers: DIGIT_HEADERS, rows };
}

/** Discriminante refinado: permite diferenciar dígitos de CSV tabulares. */
export function isDigitsDataset(dataset: Dataset | null | undefined): dataset is Dataset & { kind: 'digits8x8' } {
  return !!dataset && dataset.kind === 'digits8x8' && dataset.headers.join('|') === DIGIT_HEADERS.join('|') && dataset.target === 'label';
}

/** Fisher-Yates determinista, usado para separar muestras antes del entrenamiento. */
export function splitDigits(rows: number[][], seed: number, validationFraction: number) {
  const indices = rows.map((_, i) => i);
  let state = (seed >>> 0) || 1;
  const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 4294967296; };
  for (let i = indices.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [indices[i], indices[j]] = [indices[j], indices[i]]; }
  const testSize = Math.max(1, Math.floor(rows.length * 0.15));
  const validationSize = Math.max(1, Math.floor(rows.length * validationFraction));
  return { test: indices.slice(0, testSize), validation: indices.slice(testSize, testSize + validationSize), train: indices.slice(testSize + validationSize) };
}
