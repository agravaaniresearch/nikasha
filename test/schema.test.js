'use strict';
// The schema is the contract. These tests check that every data file meets its
// schema, that the schemas reject malformed input, and that the cross-document
// rules JSON Schema cannot express still hold.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { root, readJson, validator, clone } = require('./helpers');

const V = validator();
const FW = readJson('data/framework.json');
const CD = readJson('data/cost_defaults.json');
const SAMPLES = readJson('data/samples.json');

const PAIRS = [
  ['data/framework.json', 'framework.schema.json'],
  ['data/cost_defaults.json', 'cost-defaults.schema.json'],
  ['data/grid_carbon.json', 'grid-carbon.schema.json'],
  ['data/sources.json', 'sources.schema.json'],
  ['data/samples.json', 'samples.schema.json']
];
for (const [file, schema] of PAIRS) {
  test(file + ' is valid against ' + schema, () => {
    const r = V.check(schema, readJson(file));
    assert.ok(r.ok, r.errors);
  });
}

test('every schema has an $id, a title and a description of what it governs', () => {
  for (const f of fs.readdirSync(path.join(root, 'schema'))) {
    const s = readJson('schema/' + f);
    assert.ok(s.$id && s.$id.endsWith('/' + f), f + ' $id');
    assert.ok(s.title, f + ' title');
  }
  for (const f of ['tool.schema.json', 'framework.schema.json', 'cost-profile.schema.json', 'cost-defaults.schema.json']) {
    assert.ok((readJson('schema/' + f).description || '').length > 60, f + ' needs a real description');
  }
});

// ---- Negative cases: the tool schema must refuse malformed assessments ----
const base = SAMPLES.samples[0];
const BAD = {
  'missing gates': (t) => { delete t.gates; },
  'magnitude 4': (t) => { t.params.sensitivity.magnitude = 4; },
  'fractional magnitude': (t) => { t.params.sensitivity.magnitude = 2.5; },
  'unknown certainty': (t) => { t.params.sensitivity.certainty = 'blog_post'; },
  'certainty missing': (t) => { delete t.params.specificity.certainty; },
  'lower-case modality': (t) => { t.modality = 'ct'; },
  'unknown mode': (t) => { t.mode = 'fully_automatic'; },
  'gate value yes': (t) => { t.gates.regulatory = 'yes'; },
  'unknown gate': (t) => { t.gates.ce_mark = 'met'; },
  'sensitivity above 1': (t) => { t.performance.sensitivity.point = 1.2; },
  'negative energy': (t) => { t.infra.energyWhPerStudy = -5; },
  'zero studies per day': (t) => { t.infra.studiesPerDay = 0; },
  'unknown infra field': (t) => { t.infra.gpuCount = 2; },
  'string cost input': (t) => { t.cost.prevalence = 'ten percent'; },
  'unknown top-level field': (t) => { t.score = 99; },
  'bad id': (t) => { t.id = 'Has Spaces'; }
};
for (const [name, mutate] of Object.entries(BAD)) {
  test('tool schema rejects: ' + name, () => {
    const t = clone(base); mutate(t);
    assert.equal(V.check('tool.schema.json', t).ok, false);
  });
}

test('a minimal real assessment (no fictional flag, no cost or performance) is valid', () => {
  const t = { id: 'minimal', name: 'Minimal', modality: 'MRI', mode: 'advisory', gates: {}, params: {} };
  assert.ok(V.check('tool.schema.json', t).ok);
});

test('samples must be flagged fictional', () => {
  const s = clone(SAMPLES); s.samples[0].fictional = false;
  assert.equal(V.check('samples.schema.json', s).ok, false);
});

test('framework schema rejects an assessed parameter without anchors and a derived one with them', () => {
  const f1 = clone(FW); delete f1.parameters.find((p) => p.kind === 'assessed').anchors;
  assert.equal(V.check('framework.schema.json', f1).ok, false);
  const f2 = clone(FW); f2.parameters.find((p) => p.kind === 'derived').anchors = ['a a a a a', 'b b b b b', 'c c c c c', 'd d d d d'];
  assert.equal(V.check('framework.schema.json', f2).ok, false);
});

test('sources schema rejects Wikipedia and plain http', () => {
  const s = readJson('data/sources.json');
  const w = clone(s); w.sources[0].url = 'https://en.wikipedia.org/wiki/Carbon_intensity';
  assert.equal(V.check('sources.schema.json', w).ok, false);
  const h = clone(s); h.sources[0].url = 'http://example.org';
  assert.equal(V.check('sources.schema.json', h).ok, false);
});

// ---- Cross-document rules ----
const PIDS = FW.parameters.map((p) => p.id);
const MODES = FW.modes.map((m) => m.id);

test('ids are unique in every list', () => {
  for (const key of ['certainty', 'modes', 'modalities', 'gates', 'parameters', 'decisionRows']) {
    const ids = FW[key].map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length, key);
  }
  const cids = CD.inputs.map((x) => x.id);
  assert.equal(new Set(cids).size, cids.length, 'cost inputs');
});

test('every weight profile covers exactly the parameters and sums to 100', () => {
  for (const m of MODES) {
    assert.deepEqual(Object.keys(FW.weights[m]).sort(), PIDS.slice().sort(), m);
    assert.equal(Object.values(FW.weights[m]).reduce((a, b) => a + b, 0), 100, m);
  }
});

test('derived parameters and derivedCuts match one to one, and cuts ascend', () => {
  const derived = FW.parameters.filter((p) => p.kind === 'derived').map((p) => p.id).sort();
  assert.deepEqual(Object.keys(FW.derivedCuts).sort(), derived);
  for (const d of Object.values(FW.derivedCuts)) assert.ok(d.cuts[0] < d.cuts[1] && d.cuts[1] < d.cuts[2], d.label);
});

test('knockouts name real clinical parameters and never loosen with autonomy', () => {
  for (const k of FW.knockouts) {
    const p = FW.parameters.find((x) => x.id === k.param);
    assert.ok(p && p.domain === 'clinical', k.param);
    let last = -1;
    for (const m of MODES) {
      const v = k.thresholds[m];
      if (v === null) { assert.equal(last, -1, k.param + ' switches off after switching on'); continue; }
      assert.ok(v >= last, k.param + ' loosens at ' + m);
      last = v;
    }
  }
});

test('readiness bars rise with autonomy', () => {
  const bars = MODES.map((m) => FW.readyThreshold[m]);
  for (let i = 1; i < bars.length; i++) assert.ok(bars[i] > bars[i - 1]);
});

test('certainty: lo <= hi, unsupported is zero, and favoured evidence sits wholly above the rest', () => {
  const C = Object.fromEntries(FW.certainty.map((c) => [c.id, c]));
  FW.certainty.forEach((c) => assert.ok(c.lo <= c.hi, c.id));
  assert.equal(C.unsupported.lo, 0); assert.equal(C.unsupported.hi, 0);
  const favoured = ['clinical_use', 'peer_reviewed', 'live_demo'], other = ['preprint', 'vendor_claim', 'unsupported'];
  const minFav = Math.min(...favoured.map((id) => C[id].lo)), maxOther = Math.max(...other.map((id) => C[id].hi));
  assert.ok(minFav > maxOther, 'a preprint must never outscore peer review');
  assert.ok(C.peer_reviewed.lo > C.preprint.hi);
});

test('only CT and MRI are in scope, and every out-of-scope modality says why', () => {
  assert.deepEqual(FW.modalities.filter((m) => m.inScope).map((m) => m.id).sort(), ['CT', 'MRI']);
  FW.modalities.filter((m) => !m.inScope).forEach((m) => assert.ok(m.reason.length > 30, m.id));
});

test('decision table rows run R1 to R6 in tier order', () => {
  assert.deepEqual(FW.decisionRows.map((r) => r.id), ['R1', 'R2', 'R3', 'R4', 'R5', 'R6']);
});

test('the tool schema gate and modality enums match the framework', () => {
  const T = readJson('schema/tool.schema.json');
  assert.deepEqual(Object.keys(T.properties.gates.properties).sort(), FW.gates.map((g) => g.id).sort());
  assert.deepEqual(T.properties.modality.enum.slice().sort(), FW.modalities.map((m) => m.id).sort());
  assert.deepEqual(T.definitions.certainty.enum.slice().sort(), FW.certainty.map((c) => c.id).sort());
  assert.deepEqual(Object.keys(T.definitions.infra.properties).sort(), FW.infraFields.map((f) => f.id).sort());
});

test('every cost default sits inside its own range and cites a known source', () => {
  const own = new Set(readJson('data/sources.json').sources.map((s) => s.id));
  const vy = new Set(readJson('vendor/vyaya/sources.json').sources.map((s) => s.id));
  for (const a of CD.inputs) {
    assert.ok(a.value >= a.min && (a.max === undefined || a.value <= a.max), a.id);
    a.sources.forEach((s) => assert.ok(s.startsWith('vyaya:') ? vy.has(s.slice(6)) : own.has(s), a.id + ' cites unknown ' + s));
  }
  readJson('data/grid_carbon.json').rows.forEach((r) => r.sources.forEach((s) => assert.ok(own.has(s), r.id + ' cites ' + s)));
});

test('no cost input is defined both here and in Vyaya', () => {
  const vy = new Set(readJson('vendor/vyaya/assumptions.json').assumptions.map((a) => a.id));
  CD.inputs.forEach((a) => assert.ok(!(vy.has(a.id) && CD.meta.vyayaInputs.includes(a.id)), a.id));
  CD.meta.vyayaInputs.forEach((id) => {
    assert.ok(vy.has(id), id + ' must exist in Vyaya');
    assert.ok(!CD.inputs.some((a) => a.id === id), id + ' duplicated locally');
  });
});
