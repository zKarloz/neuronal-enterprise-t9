// Pruebas de división y normalización sin dependencia de TensorFlow.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const { splitDenseIndices, prepareDenseData } = require('../.test-build/lib/dense-preprocess.js');
const config = { epochs: 5, batchSize: 8, learningRate: 0.02, validationSplit: 0.2, seed: 42, task: 'regression' };
const makeDataset = rows => ({ id:'d', projectId:'p', name:'test', headers:['x','z','y'], rows, target:'y' });

test('Feedforward TF.js: la semilla reproduce particiones exclusivas sin mutar el CSV', () => {
  const rows = Array.from({ length: 40 }, (_, i) => [i, i * 2, i * 3]);
  const before = JSON.stringify(rows);
  const a = prepareDenseData(makeDataset(rows), config);
  const b = prepareDenseData(makeDataset(rows), config);
  assert.deepEqual(a.trainIndices, b.trainIndices);
  assert.deepEqual(a.validationIndices, b.validationIndices);
  assert.equal(new Set([...a.trainIndices, ...a.validationIndices]).size, rows.length);
  assert.equal(a.trainIndices.length + a.validationIndices.length, rows.length);
  assert.equal(JSON.stringify(rows), before);
  assert.ok(a.xTrain.every(row => row.every(Number.isFinite)));
});

test('Feedforward TF.js: la normalización usa SOLO train y conserva unidades de regresión', () => {
  const rows = Array.from({ length: 40 }, () => [1, 2, 5]);
  const indices = splitDenseIndices(rows.length, config.seed, config.validationSplit);
  rows[indices.validation[0]] = [100_000, 200_000, -10_000];
  const prepared = prepareDenseData(makeDataset(rows), config);
  assert.deepEqual(prepared.means, [1, 2]);
  assert.deepEqual(prepared.stds, [1, 1]);
  assert.equal(prepared.targetMean, 5);
  assert.equal(prepared.targetStd, 1);
  assert.deepEqual(prepared.xTrain[0], [0, 0]);
  assert.ok(prepared.xValidation.some(row => row[0] > 9999));
});

test('Feedforward TF.js: clasificación preserva 0/1 y rechaza registros corruptos', () => {
  const rows = Array.from({ length: 20 }, (_, i) => [i, i*2, i % 2]);
  const prepared = prepareDenseData(makeDataset(rows), { ...config, task: 'classification' });
  assert.equal(prepared.targetMean, 0);
  assert.equal(prepared.targetStd, 1);
  assert.ok(prepared.yTrain.every(row => row[0] === 0 || row[0] === 1));
  assert.throws(() => prepareDenseData(makeDataset([...rows, [NaN, 0, 1]]), config), /finitos/);
  assert.throws(() => prepareDenseData(makeDataset([...rows, [1, 2]]), config), /mismo número/);
});
