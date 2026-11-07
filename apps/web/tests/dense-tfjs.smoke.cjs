// Smoke REAL: ejecuta model.fit() de TensorFlow.js y usa los pesos para inferencia.
// Sólo se ejecuta mediante `npm run test:tfjs` (requiere npm install).
const test = require('node:test');
const assert = require('node:assert/strict');
const { trainDenseTfjsNetwork } = require('../.test-build/lib/dense-tfjs.js');
const { predict } = require('../.test-build/lib/neural.js');

const architecture = { id:'a', projectId:'p', family:'feedforward', name:'TF.js smoke',
  hiddenLayers:[{ id:'h1', units:8, activation:'tanh' }], updatedAt:'' };
function dataset(task) {
  const rows = Array.from({ length: 140 }, (_, i) => {
    const x1 = (i % 20) / 10 - 1;
    const x2 = (Math.floor(i / 20) - 3) / 3;
    const y = task === 'classification' ? Number(x1 + x2 > 0) : 3 * x1 - 2 * x2 + 5;
    return [x1, x2, y];
  });
  return { id:'d', projectId:'p', headers:['x1','x2','y'], rows, target:'y' };
}
const config = { epochs:80, batchSize:20, learningRate:0.05, validationSplit:0.2, seed:42, task:'classification' };

test('Feedforward TensorFlow.js aprende clasificación y exporta pesos inferibles sin servidor', async () => {
  const observed = [];
  const trained = await trainDenseTfjsNetwork(dataset('classification'), architecture, config, () => false, metric => observed.push(metric));
  assert.ok(trained);
  assert.equal(trained.engine, 'tfjs');
  assert.equal(observed.length, config.epochs);
  assert.ok(observed.every(m => Number.isFinite(m.loss) && Number.isFinite(m.valLoss)));
  assert.ok(observed.at(-1).valAccuracy >= 0.65, `Exactitud real: ${observed.at(-1).valAccuracy}`);
  const pos = predict(trained, [0.7, 0.5]);
  const neg = predict(trained, [-0.7, -0.5]);
  assert.ok(pos > neg && pos >= 0 && pos <= 1 && neg >= 0 && neg <= 1, `Predicción real ${pos} vs ${neg}`);
  assert.equal(predict(JSON.parse(JSON.stringify(trained)), [0.7, 0.5]), pos);
});

test('Feedforward TensorFlow.js normaliza regresión y desnormaliza predicciones', async () => {
  const observed = [];
  const trained = await trainDenseTfjsNetwork(dataset('regression'), architecture,
    { ...config, task:'regression', epochs:100, learningRate:0.025 }, () => false, metric => observed.push(metric));
  assert.ok(trained);
  assert.equal(observed.length, 100);
  assert.ok(observed.at(-1).valLoss < observed[0].valLoss);
  assert.ok(observed.every(m => m.accuracy === undefined && m.valAccuracy === undefined));
  const output = predict(trained, [0.2, -0.4]);
  const expected = 3 * 0.2 - 2 * (-0.4) + 5;
  assert.ok(Math.abs(output - expected) < 1.5, `Regresión: ${output} frente a ${expected}`);
});

test('Feedforward TensorFlow.js cancela antes de iniciar sin crear modelo', async () => {
  const result = await trainDenseTfjsNetwork(dataset('classification'), architecture, config, () => true, () => {});
  assert.equal(result, null);
});
