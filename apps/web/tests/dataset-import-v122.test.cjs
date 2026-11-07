// Contratos de importación M05: el formato CNN jamás debe imponerse a un CSV tabular.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { detectLocalCsvKind, parseLocalCsv } = require('../.test-build/lib/dataset-import.js');
const digitsPath = join(__dirname, '../public/datasets/digits-8x8.csv');

const classification = 'radio_medio,textura_media,diagnostico\n17.99,10.38,0\n12.4,18.12,1\n';
const regression = 'edad;imc;progresion\n0.038;0.062;151\n-0.002;0.014;87\n';

test('CSV de clasificación tabular se detecta sin requerir pixel_0…label', () => {
  assert.equal(detectLocalCsvKind(classification), 'tabular');
  const data = parseLocalCsv(classification, Buffer.byteLength(classification));
  assert.equal(data.kind, 'tabular');
  assert.deepEqual(data.headers, ['radio_medio', 'textura_media', 'diagnostico']);
  assert.equal(data.rows[0][2], 0);
});

test('CSV de regresión con separador punto y coma usa validador tabular', () => {
  const data = parseLocalCsv(regression, Buffer.byteLength(regression));
  assert.equal(data.kind, 'tabular');
  assert.deepEqual(data.rows[1], [-0.002, 0.014, 87]);
});

test('CSV CNN auténtico sigue importándose con 1.797 imágenes', () => {
  const source = readFileSync(digitsPath, 'utf8');
  const data = parseLocalCsv(source, Buffer.byteLength(source));
  assert.equal(data.kind, 'digits8x8');
  assert.equal(data.headers.length, 65);
  assert.equal(data.rows.length, 1797);
});

test('encabezado CNN dañado recibe error CNN específico en vez de un CSV tabular incomprensible', () => {
  const source = readFileSync(digitsPath, 'utf8');
  const corrupt = source.replace('pixel_30', 'pixel_treinta');
  assert.throws(() => parseLocalCsv(corrupt, Buffer.byteLength(corrupt)), /Encabezados CNN inválidos/);
});

test('se respetan los tamaños máximos diferentes de cada formato', () => {
  assert.throws(() => parseLocalCsv(classification, 900_001), /900 KB/);
  const source = readFileSync(digitsPath, 'utf8');
  assert.throws(() => parseLocalCsv(source, 1_500_001), /1,5 MB/);
});

test('M05 ofrece una sola acción de importación con modal sin pantallas duplicadas', () => {
  const ui = readFileSync(join(__dirname, '../src/features/datasets/Datasets.tsx'), 'utf8');
  assert.match(ui, /<Modal title="Importar dataset"/);
  assert.match(ui, /parseLocalCsv\(/);
  assert.match(ui, /Usar dígitos incluidos/);
  assert.doesNotMatch(ui, /historical=\{<RemoteDatasets/);
  assert.doesNotMatch(ui, /Importar CSV CNN propio/);
});
