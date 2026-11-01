// Parser CSV estricto para los datasets importados por el usuario.
/** Lector CSV con soporte para comillas escapadas, separadores y saltos de línea. */
export const MAX_CSV_BYTES = 900_000;
export const MAX_DATA_ROWS = 2000;
export const MAX_COLS = 16;

function chooseDelimiter(text: string): string {
  const header = text.split(/\r?\n/, 1)[0] || '';
  const count = (delimiter: string) => (header.match(new RegExp(delimiter === '\t' ? '\\t' : `\\${delimiter}`, 'g')) || []).length;
  return [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0];
}

export function parseCsv(text: string): { headers: string[]; rows: number[][] } {
  const delimiter = chooseDelimiter(text);
  const lines: string[][] = [];
  let cell = '', record: string[] = [], quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      record.push(cell.trim()); cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[i + 1] === '\n') i++;
      record.push(cell.trim()); cell = '';
      if (record.some(v => v !== '')) lines.push(record);
      record = [];
      if (lines.length > MAX_DATA_ROWS + 1) throw new Error(`Máximo ${MAX_DATA_ROWS} filas de datos por archivo.`);
    } else { cell += char; }
  }
  if (quoted) throw new Error('El archivo CSV contiene comillas sin cerrar.');
  if (record.length || cell) { record.push(cell.trim()); if (record.some(v => v !== '')) lines.push(record); }
  if (lines.length < 3) throw new Error('El CSV necesita encabezado y al menos dos filas de datos.');
  const headers = lines[0].map(h => h.trim());
  if (headers.length < 2 || headers.length > MAX_COLS) throw new Error(`El archivo debe tener entre 2 y ${MAX_COLS} columnas.`);
  if (headers.some(h => !h) || new Set(headers).size !== headers.length) throw new Error('Los encabezados deben tener nombres únicos y no vacíos.');
  const rows = lines.slice(1).map((line, index) => {
    if (line.length !== headers.length) throw new Error(`La fila ${index + 2} tiene ${line.length} columnas; se esperan ${headers.length}.`);
    return line.map((value, column) => {
      // El MVP exige atributos numéricos y evita imputar datos sin autorización.
      if (value === '' || value.trim() === '') throw new Error(`Dato vacío en fila ${index + 2}, columna ${headers[column]}.`);
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) throw new Error(`Dato no numérico en fila ${index + 2}, columna ${headers[column]}.`);
      return parsed;
    });
  });
  return { headers, rows };
}

export function datasetSummary(headers: string[], rows: number[][], target: string): string {
  return `${rows.length.toLocaleString('es-PE')} registros · ${headers.length - 1} variables · Objetivo: ${target}`;
}
