/* Regresión visual-estructural: mismo control de vistas y autenticación centralizada. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = file => fs.readFileSync(path.resolve(__dirname, '../src', file), 'utf8');

test('M02, M05, M06, M07, M08 y M09 comparten las mismas pestañas', () => {
  for (const file of ['features/projects/Projects.tsx', 'features/datasets/Datasets.tsx',
    'features/training/TrainingHub.tsx', 'features/evaluation/EvaluationHub.tsx',
    'features/model-registry/ModelsHub.tsx', 'features/reports/ReportsHub.tsx']) {
    assert.match(src(file), /<ModeTabs\b/, file);
  }
});

test('el shell muestra usuario real en topbar y no incluye las etiquetas antiguas', () => {
  const shell = src('app/App.tsx');
  const heading = src('components/ui.tsx');
  assert.match(shell, /<ProfileMenu\s*\/>/);
  assert.doesNotMatch(shell, /Sesión local|Laboratorio de redes neuronales/);
  assert.doesNotMatch(heading, /\{eyebrow && <div/);
});

test('M08 y M09 consumen únicamente descargas autenticadas desde FastAPI', () => {
  const client = src('lib/api/client.ts');
  const reports = src('lib/api/reports.ts');
  const training = src('lib/api/training.ts');
  assert.match(client, /Authorization: `Bearer \$\{bearer\}`/);
  assert.match(reports, /downloadPrivate/);
  assert.match(training, /downloadModel =/);
  assert.doesNotMatch(reports, /supabase\.co/);
});
