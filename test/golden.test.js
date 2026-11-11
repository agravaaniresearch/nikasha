'use strict';
// Refactor guard. v0.2 moved every rule into data/framework.json. With the
// frozen v0.1 samples (no cost.state), the new engine must reproduce the v0.1
// engine's outputs exactly: every verdict, decision row, merit value, parameter
// magnitude and effective score, in all four modes.
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../src/engine.js');
const { readJson } = require('./helpers');

const G = readJson('test/fixtures/golden-v0.1.json').results;
const S = readJson('test/fixtures/samples-v0.1.json').samples;

for (const t of S) {
  for (const m of N.MODES.map((x) => x.id)) {
    test('v0.1 parity: ' + t.id + ' in ' + m + ' mode', () => {
      const r = N.evaluate(t, m);
      const got = { verdict: r.decision.verdict, row: r.decision.row, worst: r.merit.worst, best: r.merit.best,
        params: r.params.map((p) => [p.id, p.magnitude, p.worst, p.best]), ko: r.knockouts.map((k) => [k.param, k.passed]) };
      assert.deepEqual(got, G[t.id + ':' + m]);
    });
  }
}

test('v0.1 parity: X-ray rejection', () => {
  const x = JSON.parse(JSON.stringify(S[0])); x.modality = 'XRAY';
  const d = N.evaluate(x).decision;
  assert.equal(d.verdict, G.xray.verdict); assert.equal(d.row, G.xray.row);
});
