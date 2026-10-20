'use strict';
// Guards against drift: the logic inside index.html must be byte-identical to
// src/engine.js and src/samples.js, and index.html must have no external deps.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { build, OUT } = require('../build.js');

const html = fs.readFileSync(OUT, 'utf8');

function between(name) {
  const start = '// BEGIN src/' + name + '\n';
  const end = '// END src/' + name;
  const i = html.indexOf(start);
  const j = html.indexOf(end, i);
  assert.ok(i >= 0 && j > i, 'markers for ' + name + ' present');
  return html.slice(i + start.length, j);
}

test('index.html is the current build output', () => {
  assert.equal(html, build(), 'Run `node build.js` and commit index.html');
});

test('embedded engine and samples are byte-identical to src/', () => {
  for (const name of ['engine.js', 'samples.js']) {
    assert.equal(between(name), fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8'));
  }
  assert.equal(html.split('// BEGIN src/engine.js').length, 2, 'engine embedded exactly once');
});

test('index.html is fully self-contained', () => {
  assert.doesNotMatch(html, /<script[^>]+src=/i, 'no external scripts');
  assert.doesNotMatch(html, /<link[^>]+href=/i, 'no external stylesheets or fonts');
  assert.doesNotMatch(html, /@import|@font-face|url\(\s*['"]?https?:/i, 'no remote CSS resources');
  assert.doesNotMatch(html, /\b(fetch|XMLHttpRequest|WebSocket)\s*\(/, 'no network calls');
  assert.doesNotMatch(html, /src=["']https?:/i, 'no remote images or media');
});

test('palette avoids blue and navy', () => {
  const hexes = html.match(/#[0-9a-fA-F]{6}\b/g) || [];
  assert.ok(hexes.length > 10);
  for (const hx of hexes) {
    const r = parseInt(hx.slice(1, 3), 16), g = parseInt(hx.slice(3, 5), 16), b = parseInt(hx.slice(5, 7), 16);
    assert.ok(!(b > r + 8 && b > g + 8), hx + ' reads as blue');
  }
  assert.doesNotMatch(html, /\b(navy|blue|steelblue|royalblue|dodgerblue)\b/i);
});

test('placeholder and calibration notices are visible in the tool', () => {
  assert.match(html, /id="status-line"/);
  assert.match(html, /id="placeholder-notice"/);
});
