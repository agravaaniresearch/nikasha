#!/usr/bin/env node
/*
 * Builds nikasha/index.html from src/template.html by embedding src/engine.js
 * and src/samples.js verbatim between BEGIN/END markers.
 *
 *   node build.js          write index.html
 *   node build.js --check  exit 1 if index.html is out of date (used in CI)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const here = __dirname;
const OUT = path.join(here, 'index.html');

function embed(name) {
  const src = fs.readFileSync(path.join(here, 'src', name), 'utf8');
  if (/<\/script/i.test(src)) throw new Error(name + ' contains "</script", which would break the inline script.');
  return '// BEGIN src/' + name + '\n' + src + '// END src/' + name;
}

function build() {
  const tpl = fs.readFileSync(path.join(here, 'src', 'template.html'), 'utf8');
  if (!tpl.includes('/*@@ENGINE@@*/') || !tpl.includes('/*@@SAMPLES@@*/')) {
    throw new Error('template.html is missing an embed placeholder.');
  }
  return tpl
    .replace('/*@@ENGINE@@*/', () => embed('engine.js'))
    .replace('/*@@SAMPLES@@*/', () => embed('samples.js'));
}

function main() {
const html = build();
if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (current !== html) {
    console.error('index.html is out of date. Run: node build.js');
    process.exit(1);
  }
  console.log('index.html is up to date.');
} else {
  fs.writeFileSync(OUT, html);
  console.log('Wrote ' + path.relative(process.cwd(), OUT) + ' (' + html.length + ' bytes).');
}

}

if (require.main === module) main();

module.exports = { build, OUT };
