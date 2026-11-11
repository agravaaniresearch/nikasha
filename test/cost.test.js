'use strict';
// Hand-checked arithmetic for the cost bridge. Each expected value below was
// worked out on paper from the formulas in src/cost.js; the comment beside it
// shows the working.
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../src/engine.js');
const Cost = require('../src/cost.js');
const Vyaya = require('../vendor/vyaya/engine.js');
const { clone } = require('./helpers');

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + ': ' + a + ' vs ' + b);
const layer = (p, id) => p.layers.find((l) => l.id === id);

// A tool with every cost switched off except what each test switches on.
function bare(mode) {
  return {
    id: 'bare', name: 'Bare', modality: 'CT', mode: mode || 'advisory', gates: {}, params: {},
    infra: { studiesPerDay: 100, energyWhPerStudy: 10, idleWatts: 0, gridIntensity: 700, tariffPerKWh: 10, feePerStudy: 20,
      cloudPerDay: 0, storageTB: 0, storagePerTBMonth: 0, retrievalPerMonth: 0, upfront: 0, annualMaintenance: 0 },
    performance: { sensitivity: { point: 0.8, lower95: 0.8 }, specificity: { point: 1, lower95: 1 } },
    cost: { prevalence: 0.1, readerSensitivity: 0.9, readerSpecificity: 1, readMinutesManual: 10, radiologistInrPerMin: 20,
      readTimeSavingPct: 0, flagReviewMinutes: 0, fpActedFraction: 0, fpWorkupInr: 0, costPerMissInr: 10000, costPerDelayInr: 1000,
      baselineDelayShare: 0.5, integrationInr: 0, integrationAmortMonths: 36, supportInrPerMonth: 30000, localValSample: 0,
      valMinPerCase: 0, valAnalysisInr: 0, valAmortMonths: 36, updatesPerYear: 0, revalSample: 0, auditFraction: 0,
      governanceInrPerMonth: 0, pue: 1, annualFailureRate: 0, hardwareShareOfUpfront: 0.5, failureUncoveredShare: 1, unreadFraction: 0.5 }
  };
}

test('advisory: every layer, total, manual, net and break-even by hand', () => {
  const p = Cost.buildProfile(bare('advisory'));
  // 100/day x 30 = 3000 studies a month
  assert.equal(p.volume.studiesPerMonth, 3000);
  near(layer(p, 'licence_compute').perStudy.worst, 20, 'fee 20');
  near(layer(p, 'power').perStudy.worst, 0.1, '10 Wh x PUE 1 x INR 10/kWh = 0.1');
  near(layer(p, 'integration').perStudy.worst, 10, '30000 / 3000');
  near(layer(p, 'reading').perStudy.worst, 200, '10 min x 20');
  // miss = (1-0.8)(1-0.9) = 0.02; 0.1 x 0.02 x 10000 = 20; no false alarms
  near(layer(p, 'errors').perStudy.worst, 20, 'errors');
  near(p.total.worst, 250.1, 'total');
  // manual = 200 + 0.1 x (1-0.9) x 10000 = 300
  near(p.manual.worst, 300, 'manual');
  near(p.net.worst, -49.9, 'net');
  // fixed 30000 / (300 - 240.1) = 500.8347...
  near(p.breakEvenStudiesPerMonth.worst, 30000 / 59.9, 'break-even');
  assert.equal(p.affordability.verdict, 'SAVES');
  near(p.computeShare.worst, 20.1 / 250.1, 'compute share');
});

test('triage: delays are charged for positives the tool misses and credited against the unprioritised queue', () => {
  const p = Cost.buildProfile(bare('triage'));
  // AI errors: 0.1 x 0.1 x 10000 = 100 (reader misses) + 0.1 x (0.2 x 0.5) x 1000 = 10 (delays) = 110
  near(layer(p, 'errors').perStudy.worst, 110);
  // manual: 200 + 100 + 0.1 x 0.5 x 1000 = 350
  near(p.manual.worst, 350);
  near(p.total.worst, 20 + 0.1 + 10 + 200 + 110);
  near(p.net.worst, -9.9);
});

test('autonomous: unread studies carry the tool\'s own miss rate and save reading time', () => {
  const p = Cost.buildProfile(bare('autonomous'));
  near(layer(p, 'reading').perStudy.worst, 100, 'half the studies are not read');
  // miss = 0.5 x 0.2 + 0.5 x 0.2 x 0.1 = 0.11; 0.1 x 0.11 x 10000 = 110
  near(layer(p, 'errors').perStudy.worst, 110);
  near(p.manual.worst, 300);
});

test('administrative: the tool does not read, so errors equal the unaided reader', () => {
  const p = Cost.buildProfile(bare('administrative'));
  near(layer(p, 'errors').perStudy.worst, 100);
  near(layer(p, 'reading').perStudy.worst, 200);
});

test('false alarms: either reader or tool raising one, a share worked up', () => {
  const t = bare('advisory');
  t.performance.specificity = { point: 0.9, lower95: 0.9 };
  Object.assign(t.cost, { readerSpecificity: 0.95, fpActedFraction: 0.5, fpWorkupInr: 1000, costPerMissInr: 0 });
  const p = Cost.buildProfile(t);
  // alarm = 1 - 0.95 x 0.9 = 0.145; 0.9 x 0.145 x 0.5 x 1000 = 65.25
  near(layer(p, 'errors').perStudy.worst, 65.25);
  // manual: 0.9 x 0.05 x 0.5 x 1000 = 22.5, plus reading 200
  near(p.manual.worst, 222.5);
});

test('flag review time follows the flag rate', () => {
  const t = bare('advisory'); t.cost.flagReviewMinutes = 3;
  const p = Cost.buildProfile(t);
  // flags = 0.1 x 0.8 + 0.9 x 0 = 0.08; 0.08 x 3 min x 20 = 4.8
  near(layer(p, 'reading').perStudy.worst, 204.8);
});

test('capital recovery is Vyaya\'s formula with Vyaya\'s statutory hardware life', () => {
  const t = bare(); t.infra.upfront = 720000;
  const p = Cost.buildProfile(t);
  const life = Cost.DEFAULTS.lifeYears === undefined ? require('../vendor/vyaya/assumptions.json').assumptions.find((a) => a.id === 'lifeYears').value : null;
  assert.equal(life, 6, 'Schedule II server life, read from Vyaya');
  // 720000 / (6 x 12) = 10000 a month = 3.333 per study; plus fee 20
  near(Vyaya.capitalPerMonth(720000, 6, 0, 0), 10000);
  near(layer(p, 'licence_compute').perStudy.worst, 20 + 10000 / 3000);
});

test('expected hardware failure cost uses Vyaya\'s failure rate when not overridden', () => {
  const t = bare(); t.infra.upfront = 720000; delete t.cost.annualFailureRate; delete t.cost.failureUncoveredShare;
  const p = Cost.buildProfile(t);
  const afr = p.inputsUsed.find((u) => u.id === 'annualFailureRate');
  assert.equal(afr.origin, 'vyaya'); assert.equal(afr.status, 'placeholder');
  // 720000 x 0.5 x 0.09 x 1 / 12 = 2700 a month
  near(layer(p, 'licence_compute').fixedMonthly, 10000 + 2700);
});

test('state tariff comes from Vyaya and overrides the infra tariff', () => {
  const t = bare(); t.cost.state = 'mh';
  const p = Cost.buildProfile(t);
  assert.equal(p.tariff.value, 11.5);
  near(layer(p, 'power').perStudy.worst, 0.115);
  near(p.figures.dailyCost, 20 * 100 + 1 * 11.5, 'figures use the state tariff too');
});

test('a state with no verified tariff falls back to the national default and says so', () => {
  const t = bare(); t.cost.state = 'pb';
  const p = Cost.buildProfile(t);
  assert.equal(p.tariff.value, 9);
  assert.ok(p.flags.some((f) => f.level === 'warn' && /Punjab/.test(f.text)));
});

test('validation, re-validation and audit by hand', () => {
  const t = bare();
  Object.assign(t.cost, { localValSample: 300, valMinPerCase: 12, valAnalysisInr: 100000, valAmortMonths: 36, updatesPerYear: 2, revalSample: 100, auditFraction: 0.02 });
  const p = Cost.buildProfile(t);
  // initial (300 x 12 x 20 + 100000)/36 = 172000/36; reval 2 x 100 x 12 x 20 / 12 = 4000; audit 0.02 x 12 x 20 = 4.8/study
  near(layer(p, 'validation').fixedMonthly, 172000 / 36 + 4000);
  near(layer(p, 'validation').perStudy.worst, (172000 / 36 + 4000) / 3000 + 4.8);
});

test('layers always add up to the total', () => {
  for (const s of require('../data/samples.json').samples) {
    const p = N.evaluate(s).costProfile;
    for (const k of ['worst', 'best']) near(p.layers.reduce((a, l) => a + l.perStudy[k], 0), p.total[k], s.id + ' ' + k);
  }
});

test('no break-even when the tool costs more per study than the service without it', () => {
  const t = bare(); t.infra.feePerStudy = 500;
  const p = Cost.buildProfile(t);
  assert.equal(p.breakEvenStudiesPerMonth.worst, null);
  assert.match(p.breakEvenStudiesPerMonth.reason, /never pays for itself/);
  assert.equal(p.affordability.verdict, 'COSTS_MORE');
});

test('without numeric accuracy, errors are left out and the output says so', () => {
  const t = bare(); delete t.performance;
  const p = Cost.buildProfile(t);
  assert.equal(layer(p, 'errors').perStudy.worst, 0);
  assert.ok(p.notIncluded.some((x) => /Cost of errors/.test(x)));
  assert.match(p.affordability.reason, /Errors are not costed/);
});

test('a missing lower bound narrows the band and is flagged', () => {
  const t = bare(); delete t.performance.sensitivity.lower95;
  const p = Cost.buildProfile(t);
  assert.ok(p.flags.some((f) => /No lower 95% bound for sensitivity/.test(f.text)));
});

test('payer shares split the monthly bill and must add to 100', () => {
  const t = bare(); Object.assign(t.cost, { payerHospital: 60, payerInsurer: 40 });
  const p = Cost.buildProfile(t);
  near(p.whoPays.monthlyWorst.hospital + p.whoPays.monthlyWorst.insurer, p.total.worst * 3000);
  const t2 = bare(); Object.assign(t2.cost, { payerHospital: 60, payerInsurer: 60 });
  assert.ok(Cost.buildProfile(t2).flags.some((f) => /add to 120%/.test(f.text)));
});

test('driver analysis names the placeholder that decides the verdict', () => {
  const s = clone(require('../data/samples.json').samples.find((x) => x.id === 'halvorine'));
  const p = N.evaluate(s).costProfile;
  const deciding = p.drivers.filter((d) => d.decidesVerdict).map((d) => d.id);
  assert.ok(deciding.includes('readerSensitivity'), 'how good the radiologists already are decides whether the tool pays');
  assert.ok(p.drivers.every((d) => ['placeholder', 'illustrative'].includes(d.status)));
  for (let i = 1; i < p.drivers.length; i++) assert.ok(p.drivers[i - 1].swingPerStudy >= p.drivers[i].swingPerStudy);
});

test('affordability never changes readiness: same verdict and merit for wildly different cost inputs', () => {
  for (const s of require('../data/samples.json').samples) {
    const a = N.evaluate(s);
    const t = clone(s); Object.assign(t.cost, { costPerMissInr: 1e8, readMinutesManual: 0, supportInrPerMonth: 1e7, prevalence: 0.9 });
    t.performance = { sensitivity: { point: 0.1 }, specificity: { point: 0.1 } };
    const b = N.evaluate(t);
    assert.equal(b.decision.verdict, a.decision.verdict, s.id);
    assert.equal(b.merit.worst, a.merit.worst); assert.equal(b.merit.best, a.merit.best);
    assert.notEqual(b.affordability.verdict + b.costProfile.net.worst, a.affordability.verdict + a.costProfile.net.worst);
  }
});
