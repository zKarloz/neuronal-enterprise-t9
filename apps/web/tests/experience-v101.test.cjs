// Pruebas de regresión para porcentajes y estructura compartida del shell.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { formatMetric, formatAccuracy } = require('../.test-build/lib/metrics-format.js');
const read = rel => fs.readFileSync(path.join(__dirname, '../src/', rel), 'utf8');

test('accuracy se presenta como porcentaje y loss mantiene su unidad', () => {
  assert.match(formatAccuracy(0.68182), /68[,.]18\s*%/);
  assert.equal(formatAccuracy(null), '—');
  assert.match(formatMetric(1.234567), /1[,.]235/);
  assert.equal(formatMetric(Infinity), '—');
});
test('las notificaciones son flotantes, accesibles y se cierran a los cinco segundos', () => {
  const text = read('components/ToastProvider.tsx');
  assert.match(text, /5000/);
  assert.match(text, /Cerrar notificación/);
  assert.match(text, /fixed inset-x-3 top-/);
  assert.match(text, /aria-live/);
});
test('el panel y las arquitecturas priorizan navegador sin perder el archivo remoto', () => {
  assert.match(read('features/dashboard/DashboardHub.tsx'), /ModuleExperience/);
  assert.match(read('features/architectures/ArchitecturesHub.tsx'), /ModuleExperience/);
  assert.match(read('features/architectures/RemoteArchitectures.tsx'), /createArchitecture/);
});
test('el topbar sigue la sección del sidebar y permite modo oscuro', () => {
  const app = read('app/App.tsx');
  assert.match(app, /sectionForPage\(page\)/);
  assert.match(app, /ThemeToggle/);
  assert.doesNotMatch(app, /Laboratorio híbrido/);
});
test('los módulos remotos reutilizan los estados de carga y la tarjeta de Google', () => {
  const modules = ['datasets/RemoteDatasets.tsx', 'training/RemoteTraining.tsx', 'evaluation/RemoteEvaluation.tsx',
    'model-registry/RemoteModels.tsx', 'reports/RemoteReports.tsx', 'projects/RemoteProjects.tsx'];
  for (const module of modules) {
    assert.match(read(`features/${module}`), /LoadingState/, module);
    assert.match(read(`features/${module}`), /RemoteAuthRequired/, module);
  }
});
