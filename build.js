#!/usr/bin/env node
/*
 * Builds index.html from src/template.html. Everything is embedded verbatim,
 * so the page needs no server, no network and no install:
 *
 *   DATA   window.NikashaData: framework, cost defaults, grid carbon, samples,
 *          and the pinned Vyaya tariffs and assumptions (JSON, unchanged)
 *   VYAYA  vendor/vyaya/engine.js  (pinned Vyaya engine)
 *   COST   src/cost.js             (the Vyaya-to-Nikasha bridge)
 *   ENGINE src/engine.js           (the readiness engine)
 *
 *   node build.js          write index.html
 *   node build.js --check  exit 1 if index.html is out of date (used in CI)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const here = __dirname;
const OUT = path.join(here, 'index.html');

// Data files embedded into the page, keyed as they appear on window.NikashaData.
const DATA_FILES = {
  framework: 'data/framework.json',
  costDefaults: 'data/cost_defaults.json',
  gridCarbon: 'data/grid_carbon.json',
  samples: 'data/samples.json',
  vyayaTariffs: 'vendor/vyaya/electricity_tariffs.json',
  vyayaAssumptions: 'vendor/vyaya/assumptions.json'
};

// Script files embedded verbatim, in load order.
const SCRIPTS = { VYAYA: 'vendor/vyaya/engine.js', COST: 'src/cost.js', ENGINE: 'src/engine.js' };

function read(rel) { return fs.readFileSync(path.join(here, rel), 'utf8'); }

function guard(rel, text) {
  if (/<\/script/i.test(text)) throw new Error(rel + ' contains "</script", which would break the inline script.');
  return text;
}

function embedScript(rel) {
  return '// BEGIN ' + rel + '\n' + guard(rel, read(rel)) + '// END ' + rel;
}

function embedData() {
  const parts = Object.keys(DATA_FILES).map((k) => {
    const rel = DATA_FILES[k];
    const json = JSON.stringify(JSON.parse(read(rel)));
    return '  // ' + rel + '\n  ' + JSON.stringify(k) + ': ' + guard(rel, json);
  });
  return '// BEGIN data\nwindow.NikashaData = {\n' + parts.join(',\n') + '\n};\n// END data';
}

function build() {
  let html = read('src/template.html');
  const slots = ['DATA'].concat(Object.keys(SCRIPTS));
  for (const s of slots) {
    if (!html.includes('/*@@' + s + '@@*/')) throw new Error('template.html is missing the ' + s + ' placeholder.');
  }
  html = html.replace('/*@@DATA@@*/', () => embedData());
  for (const s of Object.keys(SCRIPTS)) html = html.replace('/*@@' + s + '@@*/', () => embedScript(SCRIPTS[s]));
  return html;
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

module.exports = { build, OUT, DATA_FILES, SCRIPTS };
