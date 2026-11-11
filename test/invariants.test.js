'use strict';
// Property tests. Thousands of random, schema-valid tools from a fixed seed, so
// any failure is reproducible. Each property is a promise the framework makes.
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../src/engine.js');
const { readJson, validator, rng, randomTool, numbers, RANK, MODES, clone } = require('./helpers');

const FW = readJson('data/framework.json');
const V = validator();
const COUNT = Number(process.env.NIKASHA_PROPERTY_RUNS || 1500);
const r = rng(20261112);
const TOOLS = Array.from({ length: COUNT }, (_, k) => randomTool(r, FW, k));

test('random tools are valid against the tool schema (the generator is honest)', () => {
  TOOLS.forEach((t) => { const c = V.check('tool.schema.json', JSON.parse(JSON.stringify(t))); assert.ok(c.ok, t.id + '\n' + c.errors); });
});

test('evaluate never throws and always returns one of the four verdicts', () => {
  TOOLS.forEach((t) => {
    const res = N.evaluate(t);
    assert.ok(['READY', 'CONDITIONAL', 'NOT_READY', 'REJECTED'].includes(res.decision.verdict));
    assert.equal(res.decisionTable.filter((x) => x.matched).length, 1, 'exactly one decision row matches');
  });
});

test('no NaN or infinite number anywhere in a result', () => {
  TOOLS.forEach((t) => {
    const bad = numbers(N.evaluate(t)).filter(([, v]) => !Number.isFinite(v));
    assert.deepEqual(bad, [], t.id);
  });
});

test('merit stays within 0 to 100 and the worst case never beats the best case', () => {
  TOOLS.forEach((t) => {
    const m = N.evaluate(t).merit;
    if (!m) return;
    assert.ok(m.worst >= -1e-9 && m.best <= 100 + 1e-9 && m.worst <= m.best + 1e-9, t.id);
  });
});

test('the decision row is the first failing tier: gate before knockout before merit', () => {
  TOOLS.forEach((t) => {
    const res = N.evaluate(t);
    if (!res.entry.passed) return assert.equal(res.decision.row, 'R1');
    const gateFail = res.gates.some((g) => !g.passed), koFail = res.knockouts.some((k) => !k.passed);
    if (gateFail) assert.equal(res.decision.row, 'R2');
    else if (koFail) assert.equal(res.decision.row, 'R3');
    else assert.ok(['R4', 'R5', 'R6'].includes(res.decision.row));
  });
});

test('raising the evidence certainty of any one parameter never lowers merit', () => {
  const order = ['unsupported', 'vendor_claim', 'preprint', 'live_demo', 'peer_reviewed', 'clinical_use'];
  TOOLS.slice(0, 300).forEach((t) => {
    const base = N.evaluate(t); if (!base.merit) return;
    for (const p of FW.parameters) {
      const i = order.indexOf(t.params[p.id].certainty); if (i === order.length - 1) continue;
      const u = clone(t); u.params[p.id].certainty = order[i + 1];
      const m = N.evaluate(u).merit;
      assert.ok(m.worst >= base.merit.worst - 1e-9 && m.best >= base.merit.best - 1e-9, t.id + ' ' + p.id);
    }
  });
});

test('raising an assessed magnitude never lowers merit or turns a knockout pass into a fail', () => {
  TOOLS.slice(0, 300).forEach((t) => {
    const base = N.evaluate(t); if (!base.merit) return;
    FW.parameters.filter((p) => p.kind === 'assessed').forEach((p) => {
      if (t.params[p.id].magnitude === 3) return;
      const u = clone(t); u.params[p.id].magnitude += 1;
      const res = N.evaluate(u);
      assert.ok(res.merit.worst >= base.merit.worst - 1e-9, t.id + ' ' + p.id);
      base.knockouts.forEach((k, i) => { if (k.passed) assert.ok(res.knockouts[i].passed, t.id + ' ' + k.param); });
    });
  });
});

test('an unknown or missing gate is never treated as met', () => {
  TOOLS.forEach((t) => {
    const u = clone(t); u.gates = {};
    const res = N.evaluate(u);
    if (res.entry.passed) assert.equal(res.decision.verdict, 'NOT_READY');
  });
});

test('cost inputs other than the state never change readiness', () => {
  TOOLS.slice(0, 500).forEach((t) => {
    const a = N.evaluate(t);
    const u = clone(t);
    u.cost = { prevalence: 0.42, costPerMissInr: 1e7, readMinutesManual: 55, supportInrPerMonth: 9e5, readerSensitivity: 0.5, governanceInrPerMonth: 1e6 };
    u.performance = { sensitivity: { point: 0.51 }, specificity: { point: 0.52 } };
    const b = N.evaluate(u);
    assert.equal(b.decision.verdict, a.decision.verdict, t.id);
    if (a.merit) { assert.equal(b.merit.worst, a.merit.worst); assert.equal(b.merit.best, a.merit.best); }
  });
});

test('lower tool sensitivity never lowers the cost of errors (outside administrative mode)', () => {
  TOOLS.slice(0, 500).forEach((t) => {
    if (!t.performance || N.evaluate(t).costProfile === null) return;
    for (const mode of ['advisory', 'triage', 'autonomous']) {
      const hi = clone(t); hi.performance.sensitivity = { point: 0.95, lower95: 0.95 };
      const lo = clone(t); lo.performance.sensitivity = { point: 0.7, lower95: 0.7 };
      const e = (x) => { const p = N.evaluate(x, mode).costProfile; return p.layers.length ? p.layers.find((l) => l.id === 'errors').perStudy.worst : 0; };
      assert.ok(e(lo) >= e(hi) - 1e-9, t.id + ' ' + mode);
    }
  });
});

test('every cost profile is valid against the contract schema', () => {
  TOOLS.forEach((t) => {
    const p = N.evaluate(t).costProfile; if (!p) return;
    const c = V.check('cost-profile.schema.json', JSON.parse(JSON.stringify(p)));
    assert.ok(c.ok, t.id + '\n' + c.errors);
  });
});

test('cost layers are never negative and always sum to the total', () => {
  TOOLS.forEach((t) => {
    const p = N.evaluate(t).costProfile; if (!p || !p.total) return;
    for (const k of ['worst', 'best']) {
      p.layers.forEach((l) => assert.ok(l.perStudy[k] >= 0, t.id + ' ' + l.id));
      assert.ok(Math.abs(p.layers.reduce((a, l) => a + l.perStudy[k], 0) - p.total[k]) < 1e-6 * Math.max(1, p.total[k]));
    }
  });
});

test('the same input always gives the same output (no hidden state)', () => {
  TOOLS.slice(0, 100).forEach((t) => assert.deepEqual(N.evaluate(clone(t)), N.evaluate(clone(t))));
});

// ---- Known finding, pinned so it cannot be lost or silently fixed ----
// The v0.1 notes say scrutiny rises with autonomy and the tests checked that
// no SAMPLE gets a better verdict at higher autonomy. That holds for the
// samples but not in general: a tool with perfect clinical evidence and no
// infrastructure evidence fails administrative mode and passes autonomous
// mode, because infrastructure weight falls faster than the bar rises. This
// is a weighting question for the stakeholder panel (docs/FAILURE-MODES.md,
// F1). When the panel's weights remove it, this test fails: update the doc
// and replace this test with a strict monotonicity property.
test('KNOWN FINDING F1: a verdict can improve with autonomy under the placeholder weights', () => {
  const t = clone(readJson('data/samples.json').samples[0]);
  t.gates.unsupervised_authorisation = 'met';
  FW.parameters.forEach((p) => {
    t.params[p.id] = p.domain === 'clinical' ? { magnitude: 3, certainty: 'clinical_use' }
      : p.kind === 'derived' ? { certainty: 'unsupported' } : { magnitude: 0, certainty: 'unsupported' };
  });
  assert.equal(N.evaluate(t, 'administrative').decision.verdict, 'NOT_READY');
  assert.equal(N.evaluate(t, 'autonomous').decision.verdict, 'READY');
  const share = MODES.map((m) => FW.parameters.filter((p) => p.domain === 'clinical').reduce((a, p) => a + FW.weights[m][p.id], 0));
  assert.deepEqual(share, [50, 68, 78, 85], 'clinical weight share by mode');
});

test('monotonicity holds for every sample tool (the v0.1 claim, in the scope where it is true)', () => {
  for (const s of readJson('data/samples.json').samples) {
    const v = MODES.map((m) => RANK[N.evaluate(s, m).decision.verdict]);
    for (let i = 1; i < v.length; i++) assert.ok(v[i] <= v[i - 1], s.id + ' ' + MODES[i]);
  }
});

test('how often F1 occurs among random in-scope tools is measured, not assumed', () => {
  let n = 0, inv = 0;
  TOOLS.forEach((t) => {
    if (!['CT', 'MRI'].includes(t.modality)) return;
    const u = clone(t); Object.keys(u.gates).forEach((g) => { u.gates[g] = 'met'; });
    const v = MODES.map((m) => RANK[N.evaluate(u, m).decision.verdict]);
    n++; if (v.some((x, i) => i > 0 && x > v[i - 1])) inv++;
  });
  console.log('# F1 frequency: ' + inv + ' of ' + n + ' random tools with all gates met get a better verdict at a higher autonomy mode');
  assert.ok(n > 1000);
});
