'use strict';
// The Vyaya-to-Nikasha contract. Pinned files must be exactly what was pinned,
// every input Nikasha reads from Vyaya must exist there, and a profile made by
// Vyaya itself must be accepted or refused for the right reasons.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const N = require('../src/engine.js');
const Cost = require('../src/cost.js');
const Vyaya = require('../vendor/vyaya/engine.js');
const { root, readJson, validator, clone } = require('./helpers');

const PIN = readJson('vendor/vyaya/VYAYA.json');
const V = validator();

test('vendored Vyaya files match their pinned hashes (nobody edited them here)', () => {
  for (const [f, h] of Object.entries(PIN.sha256)) {
    const got = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'vendor', 'vyaya', f))).digest('hex');
    assert.equal(got, h, f + ' differs from the pinned copy; re-vendor from Vyaya and update VYAYA.json');
  }
});

test('the pin names a full commit and the engine version it carries', () => {
  assert.match(PIN.commit, /^[0-9a-f]{40}$/);
  assert.equal(Vyaya.ENGINE_VERSION, PIN.engineVersion);
});

test('the Vyaya functions Nikasha calls exist with the expected behaviour', () => {
  assert.equal(typeof Vyaya.capitalPerMonth, 'function');
  assert.equal(Vyaya.capitalPerMonth(1200, 1, 0, 0), 100, 'straight line with no cost of money');
  assert.ok(Vyaya.capitalPerMonth(1200, 1, 0, 12) > 100, 'cost of money raises the monthly charge');
});

test('every shared input exists in Vyaya with a number and a provenance status', () => {
  const A = Object.fromEntries(readJson('vendor/vyaya/assumptions.json').assumptions.map((a) => [a.id, a]));
  for (const id of Cost.SHARED_IDS) {
    assert.ok(A[id], id);
    assert.equal(typeof A[id].value, 'number', id);
    assert.ok(['statutory', 'secondary', 'placeholder', 'illustrative', 'user', 'constant'].includes(A[id].status), id);
  }
});

test('each sample\'s state is a row in the Vyaya tariff table', () => {
  const ids = new Set(readJson('vendor/vyaya/electricity_tariffs.json').rows.map((r) => r.id));
  readJson('data/samples.json').samples.forEach((s) => { if (s.cost && s.cost.state) assert.ok(ids.has(s.cost.state), s.id); });
});

test('Nikasha profiles round-trip: valid, accepted, and giving the same verdict when supplied ready-made', () => {
  for (const s of readJson('data/samples.json').samples) {
    const r = N.evaluate(s);
    assert.ok(V.check('cost-profile.schema.json', JSON.parse(JSON.stringify(r.costProfile))).ok, s.id);
    assert.ok(Cost.acceptProfile(r.costProfile).ok, s.id);
    const t = clone(s); t.costProfile = JSON.parse(JSON.stringify(r.costProfile)); t.infra = {};
    const r2 = N.evaluate(t);
    assert.equal(r2.decision.verdict, r.decision.verdict, s.id);
    assert.equal(r2.merit.worst, r.merit.worst, s.id);
  }
});

test('a profile produced by Vyaya itself is schema-valid', () => {
  const p = readJson('test/fixtures/vyaya-profile.json').profile;
  const c = V.check('cost-profile.schema.json', p);
  assert.ok(c.ok, c.errors);
  assert.equal(p.producer.name, 'vyaya');
});

test('a Vyaya per-patient profile is refused for imaging scoring, and the refusal is explained', () => {
  const p = readJson('test/fixtures/vyaya-profile.json').profile;
  const chk = Cost.acceptProfile(p);
  assert.equal(chk.ok, false);
  assert.ok(chk.problems.some((x) => /per_patient/.test(x)));
  const t = clone(readJson('data/samples.json').samples[0]); t.costProfile = p;
  const r = N.evaluate(t);
  assert.ok(r.profileProblems.length > 0);
  assert.equal(r.figures.valid, false, 'derived parameters get no figures from a per-patient profile');
  r.params.filter((x) => x.kind === 'derived').forEach((x) => assert.equal(x.magnitude, 0));
});

test('an incompatible contract version is refused', () => {
  const p = clone(N.evaluate(readJson('data/samples.json').samples[0]).costProfile);
  p.contractVersion = '2.0.0';
  assert.equal(Cost.acceptProfile(p).ok, false);
  p.contractVersion = '1.4.0';
  assert.equal(Cost.acceptProfile(p).ok, true, 'minor versions are compatible');
});

test('the contract schema refuses negative costs and unknown provenance', () => {
  const p = clone(N.evaluate(readJson('data/samples.json').samples[0]).costProfile);
  const a = clone(p); a.layers[0].perStudy.worst = -10;
  assert.equal(V.check('cost-profile.schema.json', a).ok, false);
  const b = clone(p); b.inputsUsed[0].status = 'trust me';
  assert.equal(V.check('cost-profile.schema.json', b).ok, false);
  const c = clone(p); c.unit = 'per_scan';
  assert.equal(V.check('cost-profile.schema.json', c).ok, false);
});

test('if Vyaya ships its copy of the contract, it is identical to ours', () => {
  const theirs = path.join(root, 'vendor', 'vyaya', 'cost-profile.schema.json');
  if (!fs.existsSync(theirs)) return; // pinned commit predates the contract
  assert.equal(fs.readFileSync(theirs, 'utf8'), fs.readFileSync(path.join(root, 'schema', 'cost-profile.schema.json'), 'utf8'));
});
