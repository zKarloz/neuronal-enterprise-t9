// Pruebas de lógica pura: no se inyectan datos ficticios en la aplicación.
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv } = require('../.test-build/lib/csv.js');
const { trainDenseNetwork, predict, validateTraining } = require('../.test-build/lib/neural.js');

global.window = global;

const config = { epochs: 80, batchSize: 20, learningRate: 0.1, validationSplit: 0.2, seed: 17, task: 'classification' };
const architecture = { id: 'arch-test', projectId: 'project-test', name: 'Prueba', family: 'feedforward', hiddenLayers: [{ id: 'h', units: 8, activation: 'tanh' }], updatedAt: '' };
function makeDataset(task = 'classification') {
  const rows = Array.from({ length: 160 }, (_, i) => {
    const x1 = (i % 20) / 10 - 1;
    const x2 = (Math.floor(i / 20) - 4) / 4;
    return [x1, x2, task === 'classification' ? Number(x1 + x2 > 0) : x1 * 3 - x2 * 2 + 5];
  });
  return { id: 'dataset-test', projectId: 'project-test', name: 'Prueba', headers: ['x1', 'x2', 'y'], rows, target: 'y', createdAt: '' };
}

test('CSV: encabezado, comillas y filas numéricas', () => {
  const result = parseCsv('"valor_1","valor_2","target"\n1,2,0\n3,4,1\n');
  assert.deepEqual(result.headers, ['valor_1', 'valor_2', 'target']);
  assert.deepEqual(result.rows, [[1, 2, 0], [3, 4, 1]]);
  assert.throws(() => parseCsv('x,y\n1,a\n2,3\n'), /no numérico/);
});

test('Valida clasificación binaria, límites y familia', () => {
  assert.equal(validateTraining(makeDataset(), architecture, config), null);
  assert.match(validateTraining(makeDataset('regression'), architecture, config), /0 o 1/);
  assert.match(validateTraining(makeDataset(), { ...architecture, family: 'cnn' }, config), /Feedforward/);
});

test('Clasificación binaria: aprende de datos generados en el test y predice', async () => {
  const metrics = [];
  const network = await trainDenseNetwork(makeDataset(), architecture, config, () => false, m => metrics.push(m));
  assert.ok(network);
  assert.equal(metrics.length, config.epochs);
  assert.ok(metrics.at(-1).valAccuracy >= 0.75, `Exactitud: ${metrics.at(-1).valAccuracy}`);
  const positive = predict(network, [0.9, 0.5]);
  const negative = predict(network, [-0.9, -0.5]);
  assert.ok(positive > negative, `Salidas: ${positive} > ${negative}`);
});

test('Regresión: disminuye la pérdida y desnormaliza correctamente', async () => {
  const metrics = [];
  const network = await trainDenseNetwork(makeDataset('regression'), architecture, { ...config, task: 'regression', epochs: 90 }, () => false, m => metrics.push(m));
  assert.ok(network);
  assert.ok(metrics.at(-1).valLoss < metrics[0].valLoss);
  const actual = predict(network, [0.2, -0.4]);
  const expected = 0.2 * 3 - (-0.4) * 2 + 5;
  assert.ok(Math.abs(actual - expected) < 1.2, `Predicción ${actual} vs ${expected}`);
});

test('Cancelación: ningún modelo si se solicita antes de entrenar', async () => {
  const network = await trainDenseNetwork(makeDataset(), architecture, config, () => true, () => {});
  assert.equal(network, null);
});
