#!/usr/bin/env node
/*
 * Demo: scores the three fictional sample tools and prints a plain-English
 * result, then shows an X-ray tool being rejected at entry.
 *
 *   node demo.js        (or: npm run demo)
 */
'use strict';
const N = require('./src/engine.js');
const { SAMPLES } = require('./src/samples.js');

console.log('Nikasha ' + N.VERSION + ' demo');
console.log(N.STATUS_LINE);
console.log(N.PLACEHOLDER_NOTICE);
console.log('All three tools below are fictional; every figure is synthetic.\n');

for (const tool of SAMPLES) {
  console.log(N.explain(N.evaluate(tool)) + '\n');
}

const xray = JSON.parse(JSON.stringify(SAMPLES[0]));
xray.name = 'Same tool, resubmitted as a chest X-ray product';
xray.modality = 'XRAY';
console.log(N.explain(N.evaluate(xray)));
