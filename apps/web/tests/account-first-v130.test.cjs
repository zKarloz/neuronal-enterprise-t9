/* Contratos de regresión: la cuenta es obligatoria y la fuente es PostgreSQL. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const src = rel => readFileSync(join(__dirname, '../src', rel), 'utf8');

test('no se monta App ni WorkspaceProvider sin verificar al usuario', () => {
  const main = src('main.tsx');
  const gate = src('app/AccountGate.tsx');
  assert.match(main, /<AccountGate>/);
  assert.match(main, /WorkspaceProvider key=\{account.id\}/);
  assert.match(gate, /me\/register/);
  assert.match(gate, /status: 'checking'/);
  assert.match(gate, /status: 'guest'/);
});

test('email y contraseña reemplazan Google en el flujo principal', () => {
  const gate = src('app/AccountGate.tsx');
  assert.match(gate, /signInWithPassword/);
  assert.match(gate, /signUpWithPassword/);
  assert.match(gate, /updateRecoveredPassword/);
  assert.doesNotMatch(src('app/App.tsx'), /GoogleOAuthReturn/);
  assert.doesNotMatch(src('app/ProfileMenu.tsx'), /startGoogleOAuth/);
  assert.match(src('lib/api/session.ts'), /neurolab-account-session-v2/);
});

test('cada sesión carga su workspace privado antes de mostrar proyectos', () => {
  const provider = src('app/WorkspaceProvider.tsx');
  assert.match(provider, /workspace-backup\/status/);
  assert.match(provider, /validateWorkspaceBackup/);
  assert.match(provider, /if \(loadState === 'loading'\)/);
  assert.match(provider, /if \(loadState === 'error'\)/);
  assert.doesNotMatch(provider, /readWorkspace\(/);
  assert.doesNotMatch(provider, /saveWorkspace\(/);
});

test('autosave valida identidad y protege contra sobreescritura concurrente', () => {
  const provider = src('app/WorkspaceProvider.tsx');
  assert.match(provider, /expected_revision: revisionRef.current/);
  assert.match(provider, /owner.id !== account.id/);
  assert.match(provider, /saveChainRef.current/);
  assert.match(provider, /beforeunload/);
  assert.match(provider, /Reintentar conexión/);
});

test('el laboratorio no monta vistas ni OAuth históricos', () => {
  for (const rel of ['features/dashboard/DashboardHub.tsx', 'features/projects/Projects.tsx',
      'features/architectures/ArchitecturesHub.tsx', 'features/datasets/Datasets.tsx',
      'features/training/TrainingHub.tsx', 'features/evaluation/EvaluationHub.tsx',
      'features/model-registry/ModelsHub.tsx', 'features/reports/ReportsHub.tsx',
      'features/administration/AdministrationHub.tsx']) {
    assert.doesNotMatch(src(rel), /RemoteDashboard|RemoteProjects|RemoteDatasets|RemoteTraining|RemoteEvaluation|RemoteModels|RemoteReports|RemoteAdministration|ModuleExperience/);
  }
});
