'use strict';
// Shared test helpers: schema validator, data loaders, a seeded random
// generator for property tests, and a builder for valid random tools.
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const root = path.join(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

function validator() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  for (const f of fs.readdirSync(path.join(root, 'schema'))) ajv.addSchema(readJson('schema/' + f), f);
  return {
    ajv,
    check(schemaName, doc) {
      const ok = ajv.validate(schemaName, doc);
      return { ok, errors: ok ? null : ajv.errorsText(ajv.errors, { separator: '\n' }) };
    }
  };
}

// mulberry32: small, fast, reproducible.
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CERT = ['clinical_use', 'peer_reviewed', 'live_demo', 'preprint', 'vendor_claim', 'unsupported'];
const MODES = ['administrative', 'advisory', 'triage', 'autonomous'];
const GATE = ['met', 'met', 'met', 'not_met', 'unknown'];

// A random tool that is valid against tool.schema.json.
function randomTool(r, framework, k) {
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const params = {};
  framework.parameters.forEach((p) => {
    params[p.id] = p.kind === 'derived' ? { certainty: pick(CERT) } : { magnitude: Math.floor(r() * 4), certainty: pick(CERT) };
  });
  const gates = {};
  ['regulatory', 'data_protection', 'intended_use', 'accountability', 'unsupervised_authorisation'].forEach((g) => { gates[g] = pick(GATE); });
  const s = 0.5 + r() * 0.5, sp = 0.5 + r() * 0.5;
  return {
    id: 'rand-' + k, name: 'Random tool ' + k, fictional: true,
    modality: r() < 0.9 ? pick(['CT', 'MRI']) : pick(['XRAY', 'MAMMOGRAPHY', 'ULTRASOUND', 'PET']),
    mode: pick(MODES), gates, params,
    infra: {
      studiesPerDay: 1 + Math.floor(r() * 400), energyWhPerStudy: r() * 200, idleWatts: r() * 300, gridIntensity: 400 + r() * 500,
      tariffPerKWh: 5 + r() * 10, feePerStudy: r() * 400, cloudPerDay: r() < 0.5 ? 0 : r() * 3000, storageTB: r() * 5,
      storagePerTBMonth: r() * 3000, retrievalPerMonth: r() * 2000, upfront: r() * 2e6, annualMaintenance: r() * 3e5
    },
    performance: r() < 0.85 ? { sensitivity: { point: s, lower95: s * (0.8 + r() * 0.2) }, specificity: { point: sp, lower95: sp * (0.8 + r() * 0.2) } } : undefined,
    cost: {
      prevalence: r() * 0.5, readMinutesManual: r() * 30, costPerMissInr: r() * 2e5, readTimeSavingPct: r() * 40,
      supportInrPerMonth: r() * 1e5, unreadFraction: r()
    }
  };
}

// Every number reachable in an object, with its path.
function numbers(o, p, out) {
  out = out || []; p = p || '$';
  if (typeof o === 'number') out.push([p, o]);
  else if (o && typeof o === 'object') Object.keys(o).forEach((k) => numbers(o[k], p + '.' + k, out));
  return out;
}

const RANK = { REJECTED: 0, NOT_READY: 1, CONDITIONAL: 2, READY: 3 };
const clone = (o) => JSON.parse(JSON.stringify(o));

module.exports = { root, readJson, validator, rng, randomTool, numbers, RANK, MODES, clone };
