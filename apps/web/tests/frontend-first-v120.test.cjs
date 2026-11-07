/* La unificación preserva funciones antiguas sin convertir el navegador en una simulación. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const src = rel => readFileSync(join(__dirname, '../src', rel), 'utf8');

test('los nueve módulos utilizan una sola interfaz sin importar pantallas antiguas', () => {
  for (const hub of ['dashboard/DashboardHub.tsx','projects/Projects.tsx',
      'architectures/ArchitecturesHub.tsx','datasets/Datasets.tsx',
      'training/TrainingHub.tsx','evaluation/EvaluationHub.tsx',
      'model-registry/ModelsHub.tsx','reports/ReportsHub.tsx',
      'administration/AdministrationHub.tsx']) {
    const text = src(`features/${hub}`);
    assert.doesNotMatch(text, /ModuleExperience|RemoteDashboard|RemoteTraining|RemoteDatasets|RemoteEvaluation|RemoteModels|RemoteReports|RemoteProjects|RemoteAdministration|RemoteArchitectures/, hub);
    assert.doesNotMatch(text, /<ModeTabs/, hub);
  }
});

test('el inicio de sesión por correo gobierna todos los módulos', () => {
  const gate = src('app/AccountGate.tsx');
  assert.match(src('main.tsx'), /<AccountGate>/);
  assert.match(gate, /signInWithPassword/);
  assert.match(gate, /signUpWithPassword/);
  assert.match(gate, /me\/register/);
  assert.doesNotMatch(src('app/App.tsx'), /<GoogleOAuthReturn\/>/);
  assert.doesNotMatch(src('app/ProfileMenu.tsx'), /startGoogleOAuth/);
});

test('el laboratorio utiliza exclusivamente su espacio de la cuenta', () => {
  const provider = src('app/WorkspaceProvider.tsx');
  assert.match(provider, /workspace-backup\/status/);
  assert.match(provider, /expected_revision/);
  assert.match(provider, /owner\.id !== account\.id/);
  assert.doesNotMatch(provider, /readWorkspace\(/);
  assert.doesNotMatch(provider, /saveWorkspace\(/);
  assert.match(src('app/ModuleExperience.tsx'), /return <>{browser}<\/>/);
});

test('los motores existentes entrenan de verdad y no se han sustituido por métricas simuladas', () => {
  const provider = src('app/WorkspaceProvider.tsx');
  assert.match(provider, /trainDenseTfjsNetwork/);
  assert.match(provider, /trainCnnNetwork/);
  assert.match(src('lib/cnn.ts'), /\.fit\(/);
});
