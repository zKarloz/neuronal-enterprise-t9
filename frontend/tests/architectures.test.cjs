// Pruebas de reglas del diseñador, lectura heredada y organización modular (sin datos demo en UI).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateArchitectureDraft } = require('../.test-build/features/architectures/validation.js');
const { readWorkspace, emptyWorkspace } = require('../.test-build/lib/storage.js');
const base = path.join(__dirname, '..', 'src', 'features');
const layer = units => ({ id: crypto.randomUUID(), units, activation: 'relu' });

test('El diseñador valida límites, nombres y activaciones sin acceso a backend', () => {
  assert.equal(validateArchitectureDraft('feedforward', 'Red A', [layer(8)]), null);
  assert.match(validateArchitectureDraft('feedforward', 'X', [layer(8)]), /nombre/);
  assert.match(validateArchitectureDraft('feedforward', 'Red A', []), /entre 1 y 4/);
  assert.match(validateArchitectureDraft('feedforward', 'Red A', [layer(65)]), /64/);
  assert.match(validateArchitectureDraft('feedforward', 'Red A', [layer(2.5)]), /enteras/);
  assert.match(validateArchitectureDraft('feedforward', 'Red A', [{ id: '1', units: 3, activation: 'inexistente' }]), /activación/);
  assert.match(validateArchitectureDraft('feedforward', 'Red A', Array.from({ length: 5 }, () => layer(2))), /1 y 4/);
  assert.equal(validateArchitectureDraft('rnn', 'RNN A', []), null);
});

test('El almacenamiento v0.1.1 migra sin borrar proyectos ni arquitecturas previas', () => {
  const legacy = { projects: [{ id: 'p', name: 'Proyecto original' }], architectures: [{ id: 'a', projectId: 'p', name: 'Red original', family: 'feedforward', hiddenLayers: [layer(8)] }], datasets: [], runs: [], models: [], activeProjectId: 'p' };
  global.localStorage = { getItem: () => JSON.stringify(legacy) };
  const migrated = readWorkspace();
  assert.equal(migrated.projects[0].name, legacy.projects[0].name);
  assert.equal(migrated.architectures[0].id, legacy.architectures[0].id);
  assert.deepEqual(migrated.activeArchitectureIds, {});
  assert.deepEqual(emptyWorkspace().activeArchitectureIds, {});
  delete global.localStorage;
});

test('Cada uno de los diez módulos tiene directorio y punto de entrada', () => {
  for (const folder of ['dashboard', 'projects', 'fundamentals', 'architectures', 'datasets', 'training', 'evaluation', 'model-registry', 'reports', 'administration']) {
    assert.ok(fs.statSync(path.join(base, folder)).isDirectory(), folder);
    assert.ok(fs.existsSync(path.join(base, folder, 'index.ts')), `${folder}/index.ts`);
  }
  assert.ok(fs.existsSync(path.join(base, 'architectures', 'ArchitectureGraph.tsx')));
  assert.ok(fs.existsSync(path.join(base, 'architectures', 'validation.ts')));
  assert.equal(fs.readdirSync(base).filter(f => f.endsWith('.tsx')).length, 0);
});

// Una CNN no puede guardarse con filtros o unidades fuera de las opciones entrenables.
test('CNN: valida filtros y neuronas densas para una arquitectura ejecutable', () => {
  assert.equal(validateArchitectureDraft('cnn', 'CNN dígitos', [], {filters: 8, denseUnits: 32}), null);
  assert.match(validateArchitectureDraft('cnn', 'CNN dígitos', [], {filters: 7, denseUnits: 32}), /filtros/);
  assert.match(validateArchitectureDraft('cnn', 'CNN dígitos', []), /CNN requiere/);
});
