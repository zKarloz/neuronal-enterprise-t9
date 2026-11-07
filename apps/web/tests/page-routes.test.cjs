/* Pruebas de enlaces: recarga, URLs compartibles y modo de M02/M05/M06/M07. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { pageFromPath, pagePath, modeFromSearch, withMode, isLegacyServerSearch, legacyPagePath, PAGE_PATHS } = require('../.test-build/lib/page-routes.js');

test('las diez rutas permiten refrescar el módulo sin volver al panel', () => {
  assert.equal(Object.keys(PAGE_PATHS).length, 10);
  for (const [page, path] of Object.entries(PAGE_PATHS)) {
    assert.equal(pagePath(page), path);
    assert.equal(pageFromPath(path), page);
    assert.equal(pageFromPath(`${path}/`), page);
  }
  assert.equal(pageFromPath('/'), 'dashboard');
  assert.equal(pageFromPath('/desconocido'), 'dashboard');
});

test('el modo servidor persiste en la URL sin exponer credenciales', () => {
  assert.equal(modeFromSearch('?vista=servidor'), 'server');
  assert.equal(modeFromSearch(''), 'local');
  const pathname = withMode(new URL('https://app.example/entrenamientos'), 'server');
  assert.equal(pathname, '/entrenamientos?vista=servidor');
  assert.equal(withMode(new URL(`https://app.example${pathname}`), 'local'), '/entrenamientos');
});

test('Google OAuth conserva sus parámetros hasta que se consuman', () => {
  const callback = new URL('https://app.example/proyectos?nl_oauth_code=ejemplo&nl_oauth_state=abc');
  const next = withMode(callback, 'server');
  assert.match(next, /nl_oauth_code=ejemplo/);
  assert.match(next, /nl_oauth_state=abc/);
  assert.match(next, /vista=servidor/);
});

test('el archivo remoto exige un enlace explícito, sin alterar las rutas principales', () => {
  assert.equal(isLegacyServerSearch(''), false);
  assert.equal(isLegacyServerSearch('?vista=navegador'), false);
  assert.equal(isLegacyServerSearch('?vista=servidor'), true);
  assert.equal(legacyPagePath('models'), '/modelos?vista=servidor');
  assert.equal(pagePath('models'), '/modelos');
});
