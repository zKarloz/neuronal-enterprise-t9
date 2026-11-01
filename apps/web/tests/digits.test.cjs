// Test de dataset científico real y partición reproducible; no requiere TensorFlow.js instalado.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseDigitsCsv, splitDigits, isDigitsDataset } = require('../.test-build/lib/digits.js');

const file = path.join(__dirname, '..', 'public', 'datasets', 'digits-8x8.csv');
test('Dataset UCI incluido: 1797 imágenes con 64 píxeles y etiquetas 0..9', () => {
 const parsed = parseDigitsCsv(fs.readFileSync(file,'utf8'));
 assert.equal(parsed.rows.length,1797);
 assert.equal(parsed.headers.length,65);
 assert.equal(new Set(parsed.rows.map(row => row[64])).size, 10);
 assert.equal(isDigitsDataset({kind:'digits8x8',headers:parsed.headers,target:'label'}),true);
});
test('Partición reproducible y exclusiva de train/validación/test', () => {
 const rows = parseDigitsCsv(fs.readFileSync(file,'utf8')).rows;
 const a = splitDigits(rows,42,0.2), b=splitDigits(rows,42,0.2);
 assert.deepEqual(a,b);
 const all = [...a.train,...a.validation,...a.test];
 assert.equal(all.length,rows.length);
 assert.equal(new Set(all).size,rows.length);
 assert.ok(a.train.length > a.validation.length && a.test.length > 0);
});
test('No acepta dimensiones ni etiquetas malformadas', () => {
 const header = [...Array.from({length:64},(_,i)=>`pixel_${i}`),'label'].join(',');
 const rows = Array.from({length:30},()=>Array(65).fill('0').join(','));
 rows[0]=[...Array(64).fill('0'),'15'].join(',');
 assert.throws(()=>parseDigitsCsv([header,...rows].join('\n')),/etiqueta/);
});
