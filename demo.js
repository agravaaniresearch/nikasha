#!/usr/bin/env node
/*
 * Demo: scores the three fictional sample tools for readiness and for
 * affordability, prints a plain-English result and the cost layers, then
 * shows an X-ray tool being rejected at entry.
 *
 *   node demo.js           (or: npm run demo)
 *   node demo.js --json    prints the full evaluation records instead
 *
 * Working example on synthetic data. Not clinically or academically validated.
 */
'use strict';
const N = require('./src/engine.js');
const { samples } = require('./data/samples.json');

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(samples.map((t) => N.evaluate(t)), null, 2));
  process.exit(0);
}

const inr = (x) => 'INR ' + Math.round(x).toLocaleString('en-IN');
const pad = (s, n) => String(s).padEnd(n);

console.log('Nikasha ' + N.VERSION + ' demo (cost bridge to Vyaya ' + N.Cost.SHARED_IDS.length + ' shared inputs, engine ' +
  require('./vendor/vyaya/VYAYA.json').engineVersion + ')');
console.log(N.STATUS_LINE);
console.log(N.PLACEHOLDER_NOTICE);
console.log('All three tools below are fictional; every figure is synthetic.\n');

for (const tool of samples) {
  const r = N.evaluate(tool);
  console.log(N.explain(r));
  const p = r.costProfile;
  if (p && p.layers.length) {
    console.log('  Cost layers per study (worst case), ' + p.volume.studiesPerMonth + ' studies a month, tariff ' +
      p.tariff.value + ' INR/kWh from ' + p.tariff.source + ':');
    for (const l of p.layers) console.log('    ' + pad(l.label, 48) + inr(l.perStudy.worst));
    const be = p.breakEvenStudiesPerMonth;
    console.log('  Break-even volume: ' + (be.worst === null ? 'none (' + be.reason + ')' : Math.ceil(be.worst) + ' studies a month (worst case)'));
    const deciding = p.drivers.filter((d) => d.decidesVerdict).map((d) => d.label + ' (' + d.status + ')');
    console.log('  Unmeasured inputs that decide the affordability verdict: ' + (deciding.length ? deciding.join('; ') : 'none; the verdict holds when each is halved or raised by half') + '.');
    p.flags.filter((f) => f.level === 'warn').forEach((f) => console.log('  Warning: ' + f.text));
  }
  console.log('');
}

const xray = JSON.parse(JSON.stringify(samples[0]));
xray.name = 'Same tool, resubmitted as a chest X-ray product';
xray.modality = 'XRAY';
console.log(N.explain(N.evaluate(xray)));
