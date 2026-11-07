// Comprobación real de seguridad de estructura antes de restaurar una copia privada.
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateWorkspaceBackup, parseWorkspaceBackupFile, workspaceSummary } = require('../.test-build/lib/workspace-backup.js');
const empty = () => ({ projects: [], architectures: [], datasets: [], runs: [], models: [], activeProjectId: null, activeArchitectureIds: {} });

test('una copia vacía bien formada se puede recuperar sin fabricar proyectos', () => {
  assert.deepEqual(workspaceSummary(validateWorkspaceBackup(empty())), { projects: 0, datasets: 0, runs: 0, models: 0 });
});

test('la copia completa incluye datos numéricos y pesos reales', () => {
  const copy = empty();
  copy.projects.push({ id: 'p1', name: 'Datos', status: 'active' });
  copy.datasets.push({ id: 'd1', projectId: 'p1', headers: ['x', 'y'], rows: [[1, 2]], target: 'y' });
  copy.models.push({ id: 'm1', projectId: 'p1', network: { layers: [{ weights: [[1.5]], biases: [0.5] }] } });
  copy.activeProjectId = 'p1';
  assert.deepEqual(validateWorkspaceBackup(copy), copy);
  assert.equal(workspaceSummary(copy).models, 1);
});

test('copia inválida no puede sobrescribir un espacio local', () => {
  const bad = empty();
  bad.datasets.push({ id: 'd1', projectId: 'ajeno', headers: ['x'], rows: [[1]], target: 'x' });
  assert.throws(() => validateWorkspaceBackup(bad), /proyecto válido/);
  bad.datasets[0].projectId = 'p1';
  bad.projects.push({ id: 'p1' });
  bad.datasets[0].rows = [[Infinity]];
  assert.throws(() => validateWorkspaceBackup(bad), /dataset incompatible/);
});

test('no admite IDs duplicados ni preferencias inconsistentes', () => {
  const bad = empty();
  bad.projects = [{ id: 'p1' }, { id: 'p1' }];
  assert.throws(() => validateWorkspaceBackup(bad), /duplicados/);
  bad.projects.pop();
  bad.activeArchitectureIds = { missing: 'arch' };
  assert.throws(() => validateWorkspaceBackup(bad), /selección de arquitectura/);
});


test('las copias JSON exportadas por M10 se pueden reimportar y restaurar', () => {
  const wrapped = { formatVersion: 1, createdAt: new Date().toISOString(), workspace: empty() };
  assert.deepEqual(parseWorkspaceBackupFile(JSON.stringify(wrapped)), empty());
  assert.throws(() => parseWorkspaceBackupFile('{invalid'), /JSON válido/);
  wrapped.formatVersion = 99;
  assert.throws(() => parseWorkspaceBackupFile(JSON.stringify(wrapped)), /no es compatible/);
});
