/* La unificación preserva funciones antiguas sin convertir el navegador en una simulación. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const src = rel => readFileSync(join(__dirname, '../src', rel), 'utf8');

test('los nueve módulos híbridos priorizan una experiencia local y conservan histórico', () => {
  for (const hub of ['dashboard/DashboardHub.tsx','projects/Projects.tsx',
      'architectures/ArchitecturesHub.tsx','datasets/Datasets.tsx',
      'training/TrainingHub.tsx','evaluation/EvaluationHub.tsx',
      'model-registry/ModelsHub.tsx','reports/ReportsHub.tsx',
      'administration/AdministrationHub.tsx']) {
    const text = src(`features/${hub}`);
    assert.match(text, /ModuleExperience/, hub);
    assert.doesNotMatch(text, /<ModeTabs/, hub);
  }
});

test('el retorno OAuth se consume de forma global y no depende de Proyectos remotos', () => {
  assert.match(src('app/App.tsx'), /<GoogleOAuthReturn\/>/);
  const oauth = src('app/GoogleOAuthReturn.tsx');
  assert.match(oauth, /consumeGoogleReturn/);
  assert.match(oauth, /completeGoogleOAuth/);
  assert.match(oauth, /pendingExchange/);
  assert.doesNotMatch(src('features/projects/RemoteProjects.tsx'), /consumeGoogleReturn/);
});

test('el acceso histórico está bajo Administración y se advierte que no sincroniza datos', () => {
  const admin = src('features/administration/Administration.tsx');
  assert.match(admin, /advancedOpen/);
  assert.match(admin, /legacyPagePath/);
  assert.match(src('app/ModuleExperience.tsx'), /No se han trasladado/);
});

test('los motores existentes entrenan de verdad y no se han sustituido por métricas simuladas', () => {
  const provider = src('app/WorkspaceProvider.tsx');
  assert.match(provider, /trainDenseNetwork/);
  assert.match(provider, /trainCnnNetwork/);
  assert.match(src('lib/cnn.ts'), /\.fit\(/);
});
