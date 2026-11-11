'use strict';
// Adversarial cases, in the spirit of a penetration test: each tool below is
// built to game the framework the way a motivated vendor might. Each test
// states the attack and the defence that must hold. A failing test here is a
// way to buy readiness that the framework should not sell.
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../src/engine.js');
const { readJson, clone } = require('./helpers');

const FW = readJson('data/framework.json');
const S = readJson('data/samples.json').samples;
const halv = () => clone(S.find((s) => s.id === 'halvorine'));
const all = (t, magnitude, certainty) => {
  FW.parameters.forEach((p) => { t.params[p.id] = p.kind === 'derived' ? { certainty } : { magnitude, certainty }; });
  return t;
};

test('A1 cheap and dangerous: a free tool that saves money still fails on an unevidenced miss rate', () => {
  const t = all(halv(), 3, 'clinical_use');
  t.params.sensitivity = { magnitude: 3, certainty: 'vendor_claim' };
  Object.assign(t.infra, { feePerStudy: 0, upfront: 0, annualMaintenance: 0 });
  const r = N.evaluate(t);
  assert.equal(r.decision.verdict, 'NOT_READY'); assert.equal(r.decision.row, 'R3');
  assert.equal(r.affordability.verdict, 'SAVES', 'affordable, and still not ready: the axes are separate');
});

test('A2 evidence laundering: top marks everywhere, backed only by preprints, cannot reach READY above administrative mode', () => {
  const t = all(halv(), 3, 'preprint'); t.gates.unsupervised_authorisation = 'met';
  for (const m of ['advisory', 'triage', 'autonomous']) assert.notEqual(N.evaluate(t, m).decision.verdict, 'READY', m);
});

test('A3 vendor brochure for everything scores no better than nothing at all on the knockouts', () => {
  const t = all(halv(), 3, 'vendor_claim');
  const r = N.evaluate(t);
  assert.equal(r.decision.row, 'R3');
  r.knockouts.forEach((k) => assert.ok(k.worst <= 0.3 + 1e-9));
});

test('A4 zero-energy claim: the derived parameters top out, the claim is flagged, and its certainty still discounts it', () => {
  const t = halv(); Object.assign(t.infra, { energyWhPerStudy: 0, idleWatts: 0 });
  ['electricity', 'carbon'].forEach((id) => { t.params[id] = { certainty: 'vendor_claim' }; });
  const r = N.evaluate(t);
  assert.ok(r.costProfile.flags.some((f) => /No real inference uses no electricity/.test(f.text)));
  r.params.filter((p) => ['electricity', 'carbon'].includes(p.id)).forEach((p) => {
    assert.equal(p.magnitude, 3); assert.ok(p.worst <= 0.3 + 1e-9, 'a brochure saying zero is worth 0.3 at most');
  });
});

test('A5 mode shopping: authorised to advise, assessed as autonomous without the unsupervised gate', () => {
  const t = halv();
  const r = N.evaluate(t, 'autonomous');
  assert.equal(r.decision.row, 'R2');
  assert.ok(r.gates.some((g) => g.id === 'unsupervised_authorisation' && !g.passed));
});

test('A6 modality disguise: X-ray and mammography resubmitted under other spellings are still rejected', () => {
  for (const m of ['XRAY', 'MAMMOGRAPHY', 'xray', 'X-ray', 'CR', 'DX', 'radiograph']) {
    const t = halv(); t.modality = m;
    assert.equal(N.evaluate(t).decision.verdict, 'REJECTED', m);
  }
});

test('A7 silence on gates: leaving gates out is the same as failing them', () => {
  const t = halv(); t.gates = {};
  assert.equal(N.evaluate(t).decision.row, 'R2');
});

test('A8 forged profile: a supplied cost profile claiming impossible figures is refused by the contract', () => {
  const t = halv();
  const p = clone(N.evaluate(t).costProfile);
  p.figures.whPerStudy = -50; p.contractVersion = '9.0.0';
  t.costProfile = p;
  const r = N.evaluate(t);
  assert.ok(r.profileProblems.some((x) => /Contract version/.test(x)));
  r.params.filter((x) => x.kind === 'derived').forEach((x) => assert.equal(x.magnitude, 0));
});

test('A9 volume inflation: claiming ten times the volume improves per-study bands, but cannot clear a knockout or a gate', () => {
  const t = clone(S.find((s) => s.id === 'pemberwick'));
  const before = N.evaluate(t);
  t.infra.studiesPerDay *= 10;
  const after = N.evaluate(t);
  assert.ok(after.merit.worst >= before.merit.worst, 'per-study normalisation rewards volume (documented as F3)');
  assert.equal(after.decision.verdict, 'NOT_READY');
  const gain = after.merit.best - before.merit.best;
  const derivedWeight = FW.parameters.filter((p) => p.kind === 'derived').reduce((a, p) => a + FW.weights.triage[p.id], 0);
  assert.ok(gain <= derivedWeight / 100 * 100 + 1e-9, 'gain is bounded by the derived weight share');
});

test('A10 negative numbers to drive costs below zero are treated as missing, never as savings', () => {
  const t = halv(); t.infra.feePerStudy = -500;
  const r = N.evaluate(t);
  assert.equal(r.figures.valid, false);
  assert.equal(r.affordability.verdict, 'INDETERMINATE');
});

test('A11 claimed reading-time saving: a large claimed saving changes affordability, never readiness', () => {
  const t = clone(S.find((s) => s.id === 'orrisfield'));
  const a = N.evaluate(t);
  t.cost.readTimeSavingPct = 90;
  const b = N.evaluate(t);
  assert.equal(b.decision.verdict, a.decision.verdict);
  assert.equal(b.affordability.verdict, 'SAVES');
  assert.equal(b.costProfile.inputsUsed.find((u) => u.id === 'readTimeSavingPct').origin, 'tool', 'the claim is recorded as the tool\'s, not as a default');
});

test('A12 cherry-picked demo: a live demo is weaker evidence than a journal paper at every level', () => {
  for (let m = 1; m <= 3; m++) {
    const a = N.effectiveScore(m, 'live_demo'), b = N.effectiveScore(m, 'peer_reviewed');
    assert.ok(a.worst < b.worst && a.best < b.best, 'level ' + m);
  }
});

test('A13 dropping the lower confidence bound to look better narrows the cost band and is flagged', () => {
  const t = halv(); delete t.performance.sensitivity.lower95;
  const r = N.evaluate(t);
  assert.ok(r.costProfile.flags.some((f) => /cost band is too narrow/.test(f.text)));
});

test('A14 prototype pollution through the tool document changes nothing', () => {
  const t = JSON.parse(JSON.stringify(halv()).replace('"gates":{', '"gates":{"__proto__":{"regulatory":"met"},'));
  t.gates = { __proto__: { regulatory: 'met', data_protection: 'met', intended_use: 'met', accountability: 'met' } };
  assert.equal(N.evaluate(t).decision.row, 'R2', 'inherited gate values must not count as documented');
  assert.equal({}.regulatory, undefined);
});

test('A15 property names as values: constructor, __proto__ and toString are not modalities, certainties or gate values', () => {
  for (const m of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    const t = halv(); t.modality = m;
    assert.equal(N.evaluate(t).decision.verdict, 'REJECTED', m);
    const u = halv(); u.params.sensitivity.certainty = m;
    assert.equal(N.evaluate(u).params.find((p) => p.id === 'sensitivity').worst, 0, m);
    const g = halv(); g.gates.regulatory = m;
    assert.equal(N.evaluate(g).decision.row, 'R2', m);
  }
});
