// M10: la interfaz no debe ofrecer acciones que el backend deniega.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { canManageMember, availableRoles } = require('../.test-build/lib/project-permissions.js');
const src = relative => readFileSync(join(__dirname, '..', 'src', relative), 'utf8');

test('solo propietario puede modificar gestores y nunca a sí mismo', () => {
  assert.equal(canManageMember('owner', 'manager'), true);
  assert.equal(canManageMember('owner', 'owner'), false);
  assert.equal(canManageMember('manager', 'manager'), false);
  assert.equal(canManageMember('manager', 'engineer'), true);
});
test('ingenieros, revisores y lectores no administran integrantes', () => {
  for (const role of ['engineer', 'reviewer', 'reader']) {
    assert.equal(canManageMember(role, 'reader'), false);
    assert.equal(availableRoles(role).length, 0);
  }
  assert.equal(availableRoles('owner').length, 4);
  assert.equal(availableRoles('manager').some(r => r.value === 'manager'), false);
});
test('M10 utiliza tabs, modal, cuotas y paginación compartidos', () => {
  const hub = src('features/administration/AdministrationHub.tsx');
  const remote = src('features/administration/RemoteAdministration.tsx');
  assert.match(hub, /ModeTabs/);
  assert.match(hub, /useUrlMode/);
  for (const part of ['Modal', 'Pagination', 'administration/members', '}/audit?limit=', '}/resources']) {
    assert.ok(remote.includes(part), part);
  }
});
test('la identidad de los miembros se registra con JWT y no por formulario', () => {
  const profile = src('app/ProfileMenu.tsx');
  assert.match(profile, /ensureSession/);
  assert.match(profile, /me\/register/);
  assert.doesNotMatch(profile, /role:\s*'owner'/);
});
