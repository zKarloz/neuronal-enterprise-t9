// Regresiones v0.10.2: paginación real y estructura común de los módulos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pageItems, pageCount, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } = require('../.test-build/lib/pagination.js');
const read = rel => fs.readFileSync(path.join(__dirname, '../src/', rel), 'utf8');

test('paginación por defecto 5 y opciones 5, 10, 20', () => {
  assert.equal(DEFAULT_PAGE_SIZE, 5);
  assert.deepEqual([...PAGE_SIZE_OPTIONS], [5, 10, 20]);
  const rows = Array.from({ length: 23 }, (_, i) => i + 1);
  assert.deepEqual(pageItems(rows, 1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(pageItems(rows, 2, 5), [6, 7, 8, 9, 10]);
  assert.deepEqual(pageItems(rows, 3, 10), [21, 22, 23]);
  assert.equal(pageCount(rows.length, 10), 3);
  assert.deepEqual(rows.slice(0, 5), [1, 2, 3, 4, 5]); // El origen no se modifica.
});
test('páginas fuera de rango se normalizan y 2x2 muestra cuatro tarjetas', () => {
  assert.deepEqual(pageItems([1, 2, 3, 4, 5], 50, 4), [5]);
  assert.deepEqual(pageItems([1, 2, 3, 4, 5], -1, 4), [1, 2, 3, 4]);
  assert.equal(pageCount(0, 4), 1);
  assert.match(read('features/evaluation/RemoteEvaluation.tsx'), /pageItems\(models, modelsPage, 4\)/);
  assert.match(read('features/evaluation/RemoteEvaluation.tsx'), /tab === 'models'/);
});
test('proyectos remotos y formularios comparten Modal', () => {
  for (const path of ['projects/RemoteProjects.tsx', 'training/RemoteTraining.tsx', 'datasets/RemoteDatasets.tsx', 'evaluation/RemoteEvaluation.tsx']) {
    assert.match(read(`features/${path}`), /<Modal /, path);
  }
  const projects = read('features/projects/RemoteProjects.tsx');
  assert.match(projects, /Buscar proyectos remotos/);
  assert.match(projects, /Editar proyecto remoto/);
});
test('datasets y reportes muestran paginación y vista previa en modal', () => {
  const ds = read('features/datasets/RemoteDatasets.tsx');
  assert.match(ds, /pageItems\(selected.columns_json, schemaPage, schemaSize\)/);
  assert.match(ds, /previewOpen && <Modal/);
  for (const f of ['reports/Reports.tsx', 'reports/RemoteReports.tsx']) {
    assert.match(read(`features/${f}`), /onPageSizeChange=\{setPageSize\}/);
  }
});
test('dashboard local y remoto comparten bloques y aviso una vez por sesión', () => {
  for (const f of ['dashboard/Dashboard.tsx', 'dashboard/RemoteDashboard.tsx']) {
    assert.match(read(`features/${f}`), /DashboardStats/);
    assert.match(read(`features/${f}`), /WelcomeBanner/);
  }
  assert.match(read('features/dashboard/Dashboard.tsx'), /Completar un entrenamiento/);
  assert.match(read('components/SessionNotice.tsx'), /sessionStorage/);
  assert.match(read('features/reports/Reports.tsx'), /SessionNotice/);
  assert.match(read('features/administration/Administration.tsx'), /SessionNotice/);
});
test('tema oscuro atenúa bordes y la tarjeta de modelo guardado', () => {
  const css = read('index.css');
  assert.match(css, /saved-model-card/);
  assert.match(css, /\.theme-dark \.modal-surface/);
  assert.match(css, /border-slate-300/);
});
