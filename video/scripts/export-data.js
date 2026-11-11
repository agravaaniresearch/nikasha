// Exports the sample results the video shows, from the real engine.
'use strict';
const path = require('path');
const N = require('../../src/engine.js');
const S = require('../../data/samples.json').samples;
const out = S.map((t) => {
  const r = N.evaluate(t), p = r.costProfile;
  return { id: t.id, name: t.name, modality: t.modality, mode: t.mode, verdict: r.decision.verdict, label: r.decision.label,
    meritWorst: +r.merit.worst.toFixed(1), meritBest: +r.merit.best.toFixed(1), bar: r.threshold, afford: r.affordability.verdict,
    total: [Math.round(p.total.best), Math.round(p.total.worst)], manual: Math.round(p.manual.worst), computeShare: Math.round(p.computeShare.worst * 100),
    layers: p.layers.map((l) => ({ id: l.id, label: l.label, v: +l.perStudy.worst.toFixed(1) })),
    drivers: p.drivers.filter((d) => d.decidesVerdict).map((d) => d.label), reason: r.decision.reason };
});
require('fs').writeFileSync(path.join(__dirname, '..', 'src', 'data.json'), JSON.stringify(out, null, 1));
console.log('Wrote src/data.json for ' + out.length + ' samples.');
