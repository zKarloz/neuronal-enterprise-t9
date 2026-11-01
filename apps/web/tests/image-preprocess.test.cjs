// Validaciones independientes del navegador del preprocesamiento para imágenes propias.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { preprocessHandwrittenDigit, validateImageUpload, MAX_IMAGE_COUNT } = require('../.test-build/lib/image-preprocess.js');

function photo(background = 255, ink = 0, offset = 0) {
  const w = 96;
  const pixels = new Uint8ClampedArray(w * w).fill(background);
  // Dígito «1» artificial de trazos gruesos para verificar geometría (no es dataset ni métrica inventada).
  for (let y = 12; y < 82; y++) for (let x = 42 + offset; x <= 53 + offset; x++) pixels[y * w + x] = ink;
  return { width: w, height: w, pixels };
}

test('Foto en papel blanco: detecta tinta oscura y produce 64 intensidades válidas', () => {
  const result = preprocessHandwrittenDigit(photo(), { inkMode: 'auto', threshold: 0.15 });
  assert.equal(result.inkMode, 'dark-on-light');
  assert.equal(result.pixels.length, 64);
  assert.ok(result.pixels.some(v => v > 0));
  assert.ok(result.pixels.every(v => Number.isFinite(v) && v >= 0 && v <= 16));
  assert.ok(result.pixels[3] <= 1, 'El fondo no debe convertirse en trazo');
});

test('Trazo blanco sobre fondo negro: inversión automática equivalente', () => {
  const normal = preprocessHandwrittenDigit(photo(255, 0), { inkMode: 'auto', threshold: 0.15 });
  const inverse = preprocessHandwrittenDigit(photo(0, 255), { inkMode: 'auto', threshold: 0.15 });
  assert.equal(inverse.inkMode, 'light-on-dark');
  assert.deepEqual(normal.pixels, inverse.pixels);
});

test('Centra el dígito independientemente de su posición en la foto', () => {
  const original = preprocessHandwrittenDigit(photo(255, 0, 0), { inkMode: 'auto', threshold: 0.15 });
  const moved = preprocessHandwrittenDigit(photo(255, 0, 19), { inkMode: 'auto', threshold: 0.15 });
  assert.deepEqual(original.pixels, moved.pixels);
});

test('No inventa una imagen numérica cuando el archivo está en blanco', () => {
  const plain = { width: 64, height: 64, pixels: new Uint8ClampedArray(4096).fill(255) };
  assert.throws(() => preprocessHandwrittenDigit(plain, { inkMode: 'auto', threshold: 0.15 }), /No se detectó/);
});

test('Valida límites de archivos y rechaza SVG', () => {
  assert.equal(validateImageUpload({ type: 'image/png', size: 25000, name: 'numero.png' }), null);
  assert.match(validateImageUpload({ type: 'image/svg+xml', size: 25000, name: 'numero.svg' }), /no es una imagen/);
  assert.match(validateImageUpload({ type: 'image/jpeg', size: 6 * 1024 * 1024, name: 'numero.jpg' }), /5 MB/);
  assert.equal(MAX_IMAGE_COUNT, 8);
});
