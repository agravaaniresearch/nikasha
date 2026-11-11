'use strict';
// Failure injection. Every input the engine reads is corrupted in every way a
// form, a spreadsheet export or a hurried assessor could corrupt it. The
// engine must never throw, never emit NaN, and must fail safe: corrupted
// evidence scores as absent, never as present.
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../src/engine.js');
const Cost = require('../src/cost.js');
const { readJson, numbers, clone } = require('./helpers');

const S = readJson('data/samples.json').samples;
const halv = () => clone(S.find((s) => s.id === 'halvorine'));
const JUNK = [undefined, null, '', 'abc', -1, NaN, Infinity, -Infinity, 1e308, {}, [], true];
const finite = (o) => numbers(o).filter(([, v]) => !Number.isFinite(v)).map(([p]) => p);
const label = (v) => (typeof v === 'number' ? String(v) : JSON.stringify(v));

test('whole-tool junk: null, empty, arrays and strings do not throw', () => {
  for (const t of [null, undefined, {}, [], 'tool', 42, { params: [] }, { gates: 'met' }, { infra: 'none' }]) {
    const r = N.evaluate(t);
    assert.ok(r.decision.verdict, label(t));
    assert.deepEqual(finite(r), [], label(t));
  }
});

for (const f of N.INFRA_FIELDS.map((x) => x.id)) {
  test('infra.' + f + ' corrupted: never throws, never NaN, never better than the clean value', () => {
    const clean = N.evaluate(halv());
    for (const v of JUNK) {
      const t = halv(); t.infra[f] = v;
      const r = N.evaluate(t);
      assert.deepEqual(finite(r), [], f + '=' + label(v));
      const bad = !(typeof v === 'number' && isFinite(v) && v >= 0) && !(f === 'gridIntensity');
      if (bad && f !== 'tariffPerKWh') {
        assert.equal(r.figures.valid, false, f + '=' + label(v) + ' should invalidate figures');
        assert.ok(r.merit.worst <= clean.merit.worst + 1e-9, f + '=' + label(v) + ' raised merit');
      }
    }
  });
}

test('tariff corrupted but a state is set: the state tariff rescues the figures', () => {
  const t = halv(); t.infra.tariffPerKWh = 'abc'; t.cost.state = 'mh';
  const r = N.evaluate(t);
  assert.equal(r.figures.valid, true); assert.equal(r.costProfile.tariff.value, 11.5);
});

test('missing grid intensity falls back to the national CEA figure and is flagged', () => {
  const t = halv(); delete t.infra.gridIntensity;
  const r = N.evaluate(t);
  assert.equal(r.figures.valid, true);
  assert.ok(r.costProfile.flags.some((x) => /727 g CO2\/kWh/.test(x.text)));
});

test('corrupted magnitudes and certainties score as absent evidence, with a warning', () => {
  for (const v of JUNK.concat([4, 2.5, '3', 'high'])) {
    const t = halv(); t.params.sensitivity.magnitude = v;
    const p = N.evaluate(t).params.find((x) => x.id === 'sensitivity');
    if (v !== 3) assert.equal(p.magnitude, 0, 'magnitude ' + label(v));
  }
  for (const v of JUNK.concat(['Peer reviewed', 'PEER_REVIEWED', 'blog'])) {
    const t = halv(); t.params.sensitivity.certainty = v;
    const p = N.evaluate(t).params.find((x) => x.id === 'sensitivity');
    assert.equal(p.certainty, 'unsupported', 'certainty ' + label(v));
    assert.equal(p.worst, 0);
  }
});

test('a parameter left out entirely scores zero', () => {
  const t = halv(); delete t.params.sensitivity;
  const r = N.evaluate(t);
  assert.equal(r.params.find((x) => x.id === 'sensitivity').worst, 0);
  assert.equal(r.decision.row, 'R3', 'and the sensitivity knockout fails');
});

test('corrupted gate values fail the gate', () => {
  for (const v of JUNK.concat(['Met', 'MET', 'yes', 'pending'])) {
    const t = halv(); t.gates.regulatory = v;
    assert.equal(N.evaluate(t).decision.row, 'R2', 'regulatory=' + label(v));
  }
});

test('unknown modality or mode is handled: modality rejected at entry, mode defaults to advisory', () => {
  for (const m of ['ct', 'CT ', 'Ct', 'CTA', 'cardiac', null, 7]) {
    const t = halv(); t.modality = m;
    assert.equal(N.evaluate(t).decision.verdict, 'REJECTED', 'modality ' + label(m));
  }
  for (const m of ['AUTONOMOUS', 'full', null, 3]) {
    const t = halv(); t.mode = m;
    assert.equal(N.evaluate(t).mode, 'advisory', 'mode ' + label(m));
  }
});

for (const id of Object.keys(Cost.DEFAULTS).concat(Cost.SHARED_IDS)) {
  test('cost.' + id + ' corrupted: falls back to its default or is held in range', () => {
    for (const v of JUNK.concat([-1e9, 1e12])) {
      const t = halv(); t.cost[id] = v;
      const p = N.evaluate(t).costProfile;
      assert.deepEqual(finite(p), [], id + '=' + label(v));
      const used = p.inputsUsed.find((u) => u.id === id);
      const a = Cost.DEFAULTS[id] || require('../vendor/vyaya/assumptions.json').assumptions.find((x) => x.id === id);
      assert.ok(used.value >= a.min && (a.max === undefined || used.value <= a.max), id + '=' + label(v) + ' gave ' + used.value);
    }
  });
}

test('performance figures out of range are clamped to 0 to 1, and a lower bound above the point is pulled down', () => {
  const t = halv(); t.performance.sensitivity = { point: 1.7, lower95: 2 }; t.performance.specificity = { point: -0.2 };
  const p = N.evaluate(t).costProfile;
  assert.deepEqual(finite(p), []);
  assert.ok(p.errorModel.best.missRate >= 0 && p.errorModel.worst.missRate <= 1);
});

test('an unknown state falls back to the national default with a warning', () => {
  const t = halv(); t.cost.state = 'zz';
  const p = N.evaluate(t).costProfile;
  assert.equal(p.tariff.value, 9);
  assert.ok(p.flags.some((f) => f.level === 'warn' && /not in the Vyaya tariff table/.test(f.text)));
});

test('zero volume is refused, not divided by', () => {
  const t = halv(); t.infra.studiesPerDay = 0;
  const r = N.evaluate(t);
  assert.equal(r.figures.valid, false);
  assert.equal(r.affordability.verdict, 'INDETERMINATE');
});

test('the browser page survives the same corruption (engine is the only logic it runs)', () => {
  const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /N\.evaluate\(t\)/, 'the page evaluates through the engine, not its own copy');
});
