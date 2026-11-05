// Verifica la consistencia de las curvas al combinar SSE, REST y métricas de regresión.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mergeRemoteMetrics, toChartMetrics, hasAccuracyMetrics,
} = require('../.test-build/lib/remote-metrics.js');

const row = (epoch, loss, val_loss, accuracy = null, val_accuracy = null) =>
  ({ epoch, loss, val_loss, accuracy, val_accuracy });

test('SSE agrega épocas sin duplicarlas y las ordena', () => {
  const initial = [row(1, 1.4, 1.5, 0.3, 0.2)];
  const result = mergeRemoteMetrics(initial, [row(3, 1.0, 1.1), row(2, 1.2, 1.3), initial[0]]);
  assert.deepEqual(result.map(m => m.epoch), [1, 2, 3]);
});

test('una respuesta REST tardía no borra métricas SSE más recientes', () => {
  const newer = [row(1, 1.0, 1.1), row(2, 0.9, 1.0), row(3, 0.8, 0.9)];
  const result = mergeRemoteMetrics(newer, [row(1, 9.9, 9.9)]);
  assert.deepEqual(result, newer);
});

test('las métricas regresivas no inventan accuracy', () => {
  const regression = [row(1, 0.5, 0.6)];
  const converted = toChartMetrics(regression);
  assert.equal(converted[0].accuracy, undefined);
  assert.equal(converted[0].valAccuracy, undefined);
  assert.equal(hasAccuracyMetrics(regression), false);
});

test('la precisión de clasificación conserva las proporciones originales', () => {
  const data = [row(1, 0.8, 0.9, 0.32, 0.28)];
  assert.equal(hasAccuracyMetrics(data), true);
  assert.deepEqual(toChartMetrics(data), [{
    epoch: 1, loss: 0.8, valLoss: 0.9, accuracy: 0.32, valAccuracy: 0.28,
  }]);
});
