'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../src/engine.js');
const SAMPLES = require('../data/samples.json').samples;

const clone = (o) => JSON.parse(JSON.stringify(o));
const sample = (id) => clone(SAMPLES.find((s) => s.id === id));
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('sample tools render the expected verdicts', () => {
  assert.equal(SAMPLES.length, 3);
  const verdicts = SAMPLES.map((s) => N.evaluate(s).decision.verdict);
  assert.deepEqual(verdicts, ['READY', 'NOT_READY', 'CONDITIONAL']);
  assert.equal(N.evaluate(sample('pemberwick')).decision.row, 'R3', 'Pemberwick fails a knockout');
  SAMPLES.forEach((s) => {
    assert.equal(s.fictional, true);
    assert.equal(N.evaluate(s).decision.verdict, s.expectedVerdict);
  });
});

test('certainty table: published, ordered, unsupported fixed at zero', () => {
  const ids = N.CERTAINTY.map((c) => c.id);
  assert.deepEqual(ids, ['clinical_use', 'peer_reviewed', 'live_demo', 'preprint', 'vendor_claim', 'unsupported']);
  N.CERTAINTY.forEach((c) => assert.ok(c.lo <= c.hi && c.lo >= 0 && c.hi <= 1));
  const u = N.CERTAINTY.find((c) => c.id === 'unsupported');
  assert.equal(u.lo, 0); assert.equal(u.hi, 0);
});

test('peer-reviewed, live demo and clinical use outrank preprints and vendor documents', () => {
  const by = Object.fromEntries(N.CERTAINTY.map((c) => [c.id, c]));
  for (const strong of ['clinical_use', 'peer_reviewed', 'live_demo']) {
    for (const weak of ['preprint', 'vendor_claim', 'unsupported']) {
      assert.ok(by[strong].lo > by[weak].hi, `${strong} should beat ${weak} even worst-vs-best`);
    }
  }
  assert.ok(by.peer_reviewed.lo > by.preprint.hi, 'arXiv/preprint is not peer review');
});

test('certainty discount: effective = magnitude x multiplier', () => {
  for (const c of N.CERTAINTY) {
    for (const m of [0, 1, 2, 3]) {
      const e = N.effectiveScore(m, c.id);
      close(e.worst, m * c.lo);
      close(e.best, m * c.hi);
    }
  }
  const t = sample('halvorine');
  t.params.sensitivity = { magnitude: 3, certainty: 'preprint' };
  const p = N.evaluate(t).params.find((x) => x.id === 'sensitivity');
  close(p.worst, 3 * 0.25); close(p.best, 3 * 0.5);
});

test('unsupported claims score 0 whatever the magnitude', () => {
  const t = sample('halvorine');
  for (const id of Object.keys(t.params)) t.params[id].certainty = 'unsupported';
  const r = N.evaluate(t);
  r.params.forEach((p) => { assert.equal(p.worst, 0); assert.equal(p.best, 0); });
  assert.equal(r.merit.worst, 0); assert.equal(r.merit.best, 0);
  // Missing or malformed evidence is treated as unsupported.
  const t2 = sample('halvorine');
  delete t2.params.specificity.certainty;
  t2.params.sensitivity.certainty = 'my_cousin_said_so';
  const r2 = N.evaluate(t2);
  assert.equal(r2.params.find((p) => p.id === 'specificity').best, 0);
  assert.equal(r2.params.find((p) => p.id === 'sensitivity').best, 0);
  // Invalid magnitudes are treated as 0.
  const t3 = sample('halvorine');
  t3.params.sensitivity.magnitude = 7;
  assert.equal(N.evaluate(t3).params.find((p) => p.id === 'sensitivity').magnitude, 0);
});

test('tier order: entry, then legal gates, then knockouts, then merit', () => {
  // A tool that fails a gate AND a knockout is decided by the gate.
  const both = sample('pemberwick');
  both.gates.regulatory = 'not_met';
  const r = N.evaluate(both);
  assert.equal(r.decision.row, 'R2');
  assert.ok(r.knockouts.some((k) => !k.passed), 'knockout still computed and shown');
  assert.equal(r.informationalOnly, true);
  // Out of scope beats everything, and nothing else is evaluated.
  both.modality = 'XRAY';
  const r2 = N.evaluate(both);
  assert.equal(r2.decision.row, 'R1');
  assert.deepEqual(r2.tiersEvaluated, ['entry']);
  assert.equal(r2.gates.length, 0); assert.equal(r2.merit, null);
  // Exactly one decision-table row matches, and rows run R1..R6 in order.
  for (const s of SAMPLES) {
    const d = N.evaluate(s).decisionTable;
    assert.deepEqual(d.map((x) => x.id), ['R1', 'R2', 'R3', 'R4', 'R5', 'R6']);
    assert.equal(d.filter((x) => x.matched).length, 1);
  }
});

test('legal gates: unknown and not_met both fail; autonomous adds a gate', () => {
  for (const v of ['unknown', 'not_met', undefined, 'probably']) {
    const t = sample('halvorine');
    t.gates.data_protection = v;
    const r = N.evaluate(t);
    assert.equal(r.decision.verdict, 'NOT_READY');
    assert.equal(r.decision.row, 'R2');
  }
  const adv = N.evaluate(sample('halvorine'), 'advisory').gates.map((g) => g.id);
  const auto = N.evaluate(sample('halvorine'), 'autonomous').gates.map((g) => g.id);
  assert.ok(!adv.includes('unsupervised_authorisation'));
  assert.ok(auto.includes('unsupervised_authorisation'));
});

test('knockout fails the tool on its own, even with perfect merit elsewhere', () => {
  const t = sample('halvorine');
  for (const id of Object.keys(t.params)) {
    t.params[id] = { magnitude: 3, certainty: 'clinical_use' };
  }
  assert.equal(N.evaluate(t).decision.verdict, 'READY');
  t.params.sensitivity = { magnitude: 1, certainty: 'clinical_use' }; // worst 0.9 < 1.5 advisory minimum
  const r = N.evaluate(t);
  assert.equal(r.decision.row, 'R3');
  assert.ok(r.merit.worst > r.threshold, 'merit alone would have passed');
  // Specificity (false positives) is also a knockout.
  const t2 = sample('halvorine');
  t2.params.specificity = { magnitude: 0, certainty: 'peer_reviewed' };
  assert.equal(N.evaluate(t2).decision.row, 'R3');
});

test('knockouts use the worst case, inclusive at the threshold', () => {
  const t = sample('halvorine'); // advisory: sensitivity minimum 1.5
  t.params.sensitivity = { magnitude: 2, certainty: 'peer_reviewed' }; // worst 1.5
  const k = N.evaluate(t).knockouts.find((x) => x.param === 'sensitivity');
  close(k.worst, 1.5); assert.equal(k.passed, true);
  t.params.sensitivity = { magnitude: 2, certainty: 'live_demo' }; // worst 1.1
  assert.equal(N.evaluate(t).knockouts.find((x) => x.param === 'sensitivity').passed, false);
});

test('autonomy weight profiles: each sums to 100 and scrutiny rises with autonomy', () => {
  const order = ['administrative', 'advisory', 'triage', 'autonomous'];
  assert.deepEqual(N.MODES.map((m) => m.id), order);
  const clinical = N.PARAMETERS.filter((p) => p.domain === 'clinical' && p.id !== 'workflow_integration').map((p) => p.id);
  const sums = order.map((m) => {
    const w = N.WEIGHTS[m];
    assert.deepEqual(Object.keys(w).sort(), N.PARAMETERS.map((p) => p.id).sort());
    assert.equal(Object.values(w).reduce((a, b) => a + b, 0), 100, m);
    return clinical.reduce((s, id) => s + w[id], 0);
  });
  for (let i = 1; i < sums.length; i++) assert.ok(sums[i] > sums[i - 1], 'clinical-safety weight rises');
  for (let i = 1; i < order.length; i++) {
    assert.ok(N.READY_THRESHOLD[order[i]] > N.READY_THRESHOLD[order[i - 1]], 'readiness bar rises');
    for (const k of N.KNOCKOUTS) {
      const a = k.thresholds[order[i - 1]], b = k.thresholds[order[i]];
      if (a !== null) assert.ok(b !== null && b >= a, `${k.param} minimum never falls`);
    }
  }
  // Same tool gets the same or a worse verdict as autonomy rises.
  const rank = { READY: 3, CONDITIONAL: 2, NOT_READY: 1, REJECTED: 0 };
  for (const s of SAMPLES) {
    const v = order.map((m) => rank[N.evaluate(s, m).decision.verdict]);
    for (let i = 1; i < v.length; i++) assert.ok(v[i] <= v[i - 1], `${s.id} verdict improved with autonomy`);
  }
  // Mode changes the merit actually computed.
  const a = N.evaluate(sample('orrisfield'), 'administrative').merit.worst;
  const b = N.evaluate(sample('orrisfield'), 'autonomous').merit.worst;
  assert.notEqual(a, b);
});

test('merit is a band: worst <= best, computed from the certainty range', () => {
  for (const s of SAMPLES) {
    const r = N.evaluate(s);
    assert.ok(r.merit.worst <= r.merit.best);
    const w = N.WEIGHTS[r.mode];
    const worst = r.params.reduce((a, p) => a + w[p.id] * p.worst, 0) / 300 * 100;
    const best = r.params.reduce((a, p) => a + w[p.id] * p.best, 0) / 300 * 100;
    close(r.merit.worst, worst); close(r.merit.best, best);
  }
  // Everything at clinical use level 3 gives a band of 90 to 100.
  const t = sample('halvorine');
  for (const id of Object.keys(t.params)) t.params[id] = { magnitude: 3, certainty: 'clinical_use' };
  const r = N.evaluate(t);
  close(r.merit.best, 100); close(r.merit.worst, 90);
});

test('band decides READY, CONDITIONAL and merit NOT_READY', () => {
  const ready = N.evaluate(sample('halvorine'));
  assert.ok(ready.merit.worst >= ready.threshold);
  const cond = N.evaluate(sample('orrisfield'));
  assert.ok(cond.merit.worst < cond.threshold && cond.merit.best >= cond.threshold);
  assert.equal(cond.decision.row, 'R5');
  const low = sample('orrisfield');
  for (const id of ['workflow_integration', 'human_oversight', 'deployment', 'update_process', 'source_access']) low.params[id].magnitude = 0;
  const r = N.evaluate(low);
  assert.ok(r.merit.best < r.threshold);
  assert.equal(r.decision.row, 'R6');
});

test('X-ray tools are rejected at entry with a stated reason', () => {
  for (const mod of ['XRAY', 'MAMMOGRAPHY']) {
    const t = sample('halvorine');
    t.modality = mod;
    const r = N.evaluate(t);
    assert.equal(r.decision.verdict, 'REJECTED');
    assert.equal(r.decision.row, 'R1');
    assert.match(r.entry.reason, /X-ray/);
    assert.equal(r.decision.reason, r.entry.reason);
  }
  const unknown = sample('halvorine'); unknown.modality = 'SONAR';
  assert.equal(N.evaluate(unknown).decision.verdict, 'REJECTED');
  for (const mod of ['CT', 'MRI']) {
    const t = sample('halvorine'); t.modality = mod;
    assert.equal(N.evaluate(t).entry.passed, true);
  }
});

test('infrastructure figures and derived magnitudes', () => {
  const f = N.computeFigures(sample('halvorine').infra);
  // 120 studies x 6 Wh + 60 W x 24 h = 2160 Wh = 2.16 kWh/day
  close(f.kwhPerDay, 2.16);
  close(f.co2KgPerYear, 2.16 * 365 * 710 / 1000);
  close(f.dailyCost, 18 * 120 + 2.16 * 8);
  close(f.tco5y, 900000 + 150000 * 5 + f.dailyCost * 365 * 5 + 3000 * 60);
  assert.equal(N.bandMagnitude(10, [20, 60, 150]), 3);
  assert.equal(N.bandMagnitude(20, [20, 60, 150]), 3);
  assert.equal(N.bandMagnitude(61, [20, 60, 150]), 1);
  assert.equal(N.bandMagnitude(151, [20, 60, 150]), 0);
  // Missing inputs: figures invalid and derived parameters score 0.
  const t = sample('halvorine'); delete t.infra.studiesPerDay;
  const r = N.evaluate(t);
  assert.equal(r.figures.valid, false);
  r.params.filter((p) => p.kind === 'derived').forEach((p) => assert.equal(p.magnitude, 0));
  // Edge deployment and open source score higher by their anchors.
  assert.match(N.PARAMETERS.find((p) => p.id === 'deployment').anchors[3], /on site/);
  assert.match(N.PARAMETERS.find((p) => p.id === 'source_access').anchors[3], /Open source/);
});

test('notices state placeholders and lack of calibration', () => {
  assert.equal(N.STATUS_LINE, 'Working example on synthetic data. Not clinically or academically validated.');
  assert.match(N.PLACEHOLDER_NOTICE, /placeholders pending a stakeholder panel/);
  assert.match(N.PLACEHOLDER_NOTICE, /not been calibrated/);
});

test('explain() gives a plain-English line for every sample', () => {
  for (const s of SAMPLES) {
    const text = N.explain(N.evaluate(s));
    assert.ok(text.startsWith(s.name));
    assert.match(text, /Why:/);
  }
});
