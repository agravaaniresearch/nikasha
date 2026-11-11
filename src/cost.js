/*
 * Nikasha cost bridge v0.2: the Vyaya-to-Nikasha connection.
 * ---------------------------------------------------------------------------
 * Builds a deployment cost profile (schema/cost-profile.schema.json) for one
 * imaging AI tool, per study, from the tool's infra and cost inputs. It uses
 * the pinned Vyaya engine (vendor/vyaya/engine.js) for capital recovery, and
 * the pinned Vyaya data for state-wise landed tariffs, statutory hardware
 * life, GPU failure rate and facility overhead, so the two projects share one
 * source for every figure they have in common.
 *
 * The profile feeds Nikasha in two ways:
 *   1. profile.figures drive the five derived infrastructure parameters
 *      (same formulas as v0.1, so verdicts are unchanged unless a state is set);
 *   2. profile.layers, totals, break-even and who-pays form a separate
 *      affordability axis that never enters a gate, knockout or merit score.
 *
 * Worst case uses the lower 95% confidence bounds of sensitivity and
 * specificity; best case uses the point estimates.
 *
 * Working example on synthetic data. Not clinically or academically validated.
 * Pure functions: no DOM, no network, never throws on bad input.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../vendor/vyaya/engine.js'),
      {
        costDefaults: require('../data/cost_defaults.json'),
        gridCarbon: require('../data/grid_carbon.json'),
        vyayaTariffs: require('../vendor/vyaya/electricity_tariffs.json'),
        vyayaAssumptions: require('../vendor/vyaya/assumptions.json')
      }
    );
  } else {
    root.NikashaCost = factory(root.VyayaEngine, root.NikashaData);
  }
})(typeof self !== 'undefined' ? self : this, function (Vyaya, D) {
  'use strict';

  var CONTRACT_VERSION = '1.0.0';
  var COST_VERSION = '0.2.0';
  var DAYS_PER_MONTH = 30; // v0.1 convention for storage; kept so figures do not move.

  var INFRA_IDS = ['studiesPerDay', 'energyWhPerStudy', 'idleWatts', 'gridIntensity', 'tariffPerKWh',
    'feePerStudy', 'cloudPerDay', 'storageTB', 'storagePerTBMonth', 'retrievalPerMonth', 'upfront', 'annualMaintenance'];

  // Plausibility ceilings: a value above these is a typing or unit error, not a
  // tool, and would overflow the arithmetic. Generous on purpose.
  var CEILING = { studiesPerDay: 1e6, energyWhPerStudy: 1e6, idleWatts: 1e7, gridIntensity: 2000, tariffPerKWh: 1000 };

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function toNum(x) { var n = typeof x === 'number' ? x : parseFloat(x); return isFinite(n) ? n : NaN; }
  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
  function r2(x) { return Math.round(x * 100) / 100; }

  var DEFAULTS = {};
  (D.costDefaults.inputs || []).forEach(function (a) { DEFAULTS[a.id] = a; });
  var VYAYA_A = {};
  (D.vyayaAssumptions.assumptions || []).forEach(function (a) { VYAYA_A[a.id] = a; });
  var SHARED_IDS = D.costDefaults.meta.vyayaInputs || [];
  var NATIONAL_CARBON = (D.gridCarbon.rows || []).filter(function (r) { return r.id === 'IN-national'; })[0];

  /* ---------- Inputs with provenance ---------- */

  // Resolve one cost input: the tool's own value if valid, else the default.
  function resolve(cost, id, used) {
    var a = DEFAULTS[id] || VYAYA_A[id];
    var origin = DEFAULTS[id] ? 'nikasha' : 'vyaya';
    var v = cost && Object.prototype.hasOwnProperty.call(cost, id) ? cost[id] : undefined;
    var n = toNum(v);
    if (v !== undefined && v !== null && v !== '' && isFinite(n)) {
      var lo = isNum(a && a.min) ? a.min : -Infinity, hi = isNum(a && a.max) ? a.max : Infinity;
      var c = clamp(n, lo, hi);
      used.push({ id: id, value: c, status: 'user', origin: 'tool', corrected: c !== n ? n : undefined });
      return c;
    }
    if (!a) { used.push({ id: id, value: null, status: 'missing', origin: 'none' }); return NaN; }
    used.push({ id: id, value: a.value, status: a.status, origin: origin });
    return a.value;
  }

  function tariffFor(state, infraTariff, flags) {
    var rows = D.vyayaTariffs.rows || [];
    var nat = rows.filter(function (r) { return r.id === 'national-default'; })[0];
    if (state === undefined || state === null || state === '') {
      return { value: infraTariff, source: 'tool infra tariffPerKWh', status: 'user', state: null };
    }
    var row = rows.filter(function (r) { return r.id === state; })[0];
    if (!row) {
      flags.push({ level: 'warn', text: 'State "' + state + '" is not in the Vyaya tariff table; the national working default was used.' });
      return { value: nat.landedInrPerKwh, source: 'Vyaya national working default', status: nat.status, state: state };
    }
    if (!isNum(row.landedInrPerKwh)) {
      flags.push({ level: 'warn', text: 'No verified landed tariff for ' + row.state + ' in Vyaya yet; the national working default of INR ' +
        nat.landedInrPerKwh + '/kWh (' + nat.status + ') was used. Contribute the SERC figure to Vyaya to fix this.' });
      return { value: nat.landedInrPerKwh, source: 'Vyaya national working default (no figure for ' + row.state + ')', status: nat.status, state: state };
    }
    return { value: row.landedInrPerKwh, source: 'Vyaya landed tariff, ' + row.state, status: row.status, state: state };
  }

  /* ---------- Figures (v0.1 formulas, unchanged) ---------- */

  function figures(i) {
    var n = i.studiesPerDay;
    var kwhPerDay = (n * i.energyWhPerStudy + i.idleWatts * 24) / 1000;
    var whPerStudy = (kwhPerDay * 1000) / n;
    var co2KgPerYear = (kwhPerDay * 365 * i.gridIntensity) / 1000;
    var gco2PerStudy = (whPerStudy / 1000) * i.gridIntensity;
    var dailyCost = i.feePerStudy * n + kwhPerDay * i.tariffPerKWh + i.cloudPerDay;
    var storageMonthly = i.storageTB * i.storagePerTBMonth + i.retrievalPerMonth;
    var tco5y = i.upfront + i.annualMaintenance * 5 + dailyCost * 365 * 5 + storageMonthly * 60;
    return {
      valid: true, missing: [],
      kwhPerDay: kwhPerDay, whPerStudy: whPerStudy, co2KgPerYear: co2KgPerYear, gco2PerStudy: gco2PerStudy,
      dailyCost: dailyCost, dailyCostPerStudy: dailyCost / n,
      storageMonthly: storageMonthly, storageCostPerStudy: storageMonthly / (n * DAYS_PER_MONTH),
      tco5y: tco5y, tcoPerStudy: tco5y / (n * 365 * 5),
      formulas: {
        kwhPerDay: '(studies/day x Wh/study + idle W x 24) / 1000',
        co2KgPerYear: 'kWh/day x 365 x grid g CO2e/kWh / 1000',
        dailyCost: 'fee/study x studies/day + kWh/day x tariff + cloud/day',
        storageMonthly: 'TB x price/TB/month + retrieval/month',
        tco5y: 'upfront + maintenance x 5 + daily cost x 365 x 5 + storage/month x 60'
      }
    };
  }

  /* ---------- Error model ---------- */

  // Returns per-study error cost on the AI pathway. Assumes the tool and the
  // reader err independently (stated in the note; automation bias breaks it).
  // A false alarm is raised when either the reader or a tool flag the reader
  // follows says positive on a negative study; a share fpActedFraction of
  // false alarms are worked up. The manual baseline uses the same rule.
  function errorModel(mode, prev, sAI, spAI, c) {
    var sR = c.readerSensitivity, spR = c.readerSpecificity, u = c.unreadFraction;
    var miss, delay = 0, alarm, note;
    if (mode === 'administrative') {
      miss = 1 - sR; alarm = 1 - spR;
      note = 'Administrative mode: the tool does not read, so errors equal the unaided reader.';
    } else if (mode === 'advisory') {
      miss = (1 - sAI) * (1 - sR); alarm = 1 - spR * spAI;
      note = 'Advisory mode: a finding is missed only if both the tool and the reader miss it, and a false alarm is raised if either does. This assumes the two err independently; automation bias breaks that assumption, so treat any saving on misses as an upper bound.';
    } else if (mode === 'triage') {
      miss = 1 - sR; delay = (1 - sAI) * c.baselineDelayShare; alarm = 1 - spR;
      note = 'Triage mode: every study is still read, so misses and false alarms equal the unaided reader. Positives the tool flags are read first; positives it misses wait as they would without it.';
    } else {
      miss = u * (1 - sAI) + (1 - u) * (1 - sAI) * (1 - sR);
      alarm = u * (1 - spAI) + (1 - u) * (1 - spR * spAI);
      note = 'Autonomous mode: studies issued with no read carry the tool\'s own error rates; the rest behave as advisory.';
    }
    var perStudy = prev * miss * c.costPerMissInr + prev * delay * c.costPerDelayInr +
      (1 - prev) * alarm * c.fpActedFraction * c.fpWorkupInr;
    return { perStudy: perStudy, missRate: miss, delayRate: delay, falseAlarmRate: alarm, note: note };
  }

  /* ---------- Main ---------- */

  function buildProfile(tool, opts) {
    opts = opts || {};
    tool = tool || {};
    var flags = [], used = [], notIncluded = [];
    var mode = opts.mode || tool.mode || 'advisory';
    var infra = tool.infra || {};
    var cost = tool.cost || {};

    // Infra inputs, v0.1 validation rules.
    var i = {}, missing = [];
    INFRA_IDS.forEach(function (id) {
      var n = toNum(Object.prototype.hasOwnProperty.call(infra, id) ? infra[id] : undefined);
      if (id === 'gridIntensity' && isNaN(n) && NATIONAL_CARBON) {
        n = NATIONAL_CARBON.gPerKWh;
        flags.push({ level: 'info', text: 'No grid carbon intensity given; used the national figure of ' + n + ' g CO2/kWh (' + NATIONAL_CARBON.status + ', CEA).' });
      }
      if (isFinite(n) && n > (CEILING[id] || 1e12)) {
        flags.push({ level: 'warn', text: id + ' = ' + n + ' is beyond any plausible value (ceiling ' + (CEILING[id] || 1e12) + '); treated as missing.' });
        n = NaN;
      }
      if (isNaN(n) || n < 0) { missing.push(id); n = NaN; }
      i[id] = n;
    });
    if (!(i.studiesPerDay > 0) && missing.indexOf('studiesPerDay') < 0) missing.push('studiesPerDay');

    var tariff = tariffFor(cost.state, i.tariffPerKWh, flags);
    if (isNum(tariff.value)) {
      i.tariffPerKWh = tariff.value;
      var k = missing.indexOf('tariffPerKWh');
      if (k >= 0 && tariff.state) missing.splice(k, 1);
    }

    var profile = {
      contractVersion: CONTRACT_VERSION,
      producer: { name: 'nikasha-cost', version: COST_VERSION, vyayaEngine: Vyaya.ENGINE_VERSION },
      unit: 'per_study', currency: 'INR', mode: mode,
      volume: { studiesPerDay: isNum(i.studiesPerDay) ? i.studiesPerDay : null, studiesPerMonth: isNum(i.studiesPerDay) ? i.studiesPerDay * DAYS_PER_MONTH : null },
      tariff: tariff,
      figures: null, layers: [], total: null, manual: null, net: null,
      breakEvenStudiesPerMonth: null, computeShare: null, affordability: null,
      whoPays: null, drivers: [], notIncluded: notIncluded, inputsUsed: used, placeholdersInUse: [], flags: flags,
      synthetic: true
    };

    if (missing.length) {
      profile.figures = { valid: false, missing: missing };
      flags.push({ level: 'warn', text: 'Infrastructure inputs missing or negative (' + missing.join(', ') + '); figures and costs were not computed.' });
      profile.affordability = { verdict: 'INDETERMINATE', label: 'Not computed', reason: 'Infrastructure inputs are missing.' };
      return profile;
    }
    profile.figures = figures(i);
    if (i.energyWhPerStudy === 0 && i.idleWatts === 0) flags.push({ level: 'warn', text: 'Energy per study and idle power are both zero. No real inference uses no electricity; the derived electricity and carbon parameters will score their best level on this claim alone, so check its certainty.' });
    if (i.feePerStudy === 0 && i.upfront === 0 && i.cloudPerDay === 0 && i.annualMaintenance === 0) flags.push({ level: 'warn', text: 'Licence, upfront, cloud and maintenance costs are all zero. Even open-source tools carry hardware or hosting cost; check the cost inputs.' });

    // Resolve every cost input once.
    var c = {};
    Object.keys(DEFAULTS).concat(SHARED_IDS).forEach(function (id) { c[id] = resolve(cost, id, used); });
    var N = i.studiesPerDay * DAYS_PER_MONTH;

    // Performance: worst = lower 95% bound, best = point estimate.
    var perf = tool.performance || {};
    function perfPair(p, name) {
      var pt = toNum(p && Object.prototype.hasOwnProperty.call(p, 'point') ? p.point : NaN), lo = toNum(p && Object.prototype.hasOwnProperty.call(p, 'lower95') ? p.lower95 : NaN);
      if (!isFinite(pt)) return null;
      pt = clamp(pt, 0, 1);
      if (!isFinite(lo)) { lo = pt; flags.push({ level: 'warn', text: 'No lower 95% bound for ' + name + '; worst case uses the point estimate, so the cost band is too narrow.' }); }
      lo = clamp(Math.min(lo, pt), 0, 1);
      return { worst: lo, best: pt };
    }
    var sens = perfPair(perf.sensitivity, 'sensitivity'), spec = perfPair(perf.specificity, 'specificity');
    var errorsIncluded = !!(sens && spec);
    if (!errorsIncluded) notIncluded.push('Cost of errors (no numeric sensitivity and specificity given)');

    // Layer 1: licence, compute and hardware.
    var capital = Vyaya.capitalPerMonth(i.upfront, c.lifeYears, c.residualPct, c.costOfCapitalPct);
    var failure = i.upfront * c.hardwareShareOfUpfront * c.annualFailureRate * c.failureUncoveredShare / 12;
    var fixedCompute = capital + i.annualMaintenance / 12 + i.cloudPerDay * DAYS_PER_MONTH + failure;
    // Layer 2: power, with facility overhead.
    var idleKwhMonth = i.idleWatts * 24 * DAYS_PER_MONTH / 1000;
    var powerFixed = idleKwhMonth * c.pue * i.tariffPerKWh;
    var powerVar = (i.energyWhPerStudy / 1000) * c.pue * i.tariffPerKWh;
    // Layer 3: storage.
    var storage = profile.figures.storageMonthly;
    // Layer 4: integration and support.
    var integ = c.integrationInr / c.integrationAmortMonths + c.supportInrPerMonth;
    // Layer 5: validation and monitoring.
    var valInitial = (c.localValSample * c.valMinPerCase * c.radiologistInrPerMin + c.valAnalysisInr) / c.valAmortMonths;
    var reval = c.updatesPerYear * c.revalSample * c.valMinPerCase * c.radiologistInrPerMin / 12;
    var auditPerStudy = c.auditFraction * c.valMinPerCase * c.radiologistInrPerMin;
    // Layer 6: governance.
    var gov = c.governanceInrPerMonth;

    var unread = mode === 'autonomous' ? c.unreadFraction : 0;
    var prev = c.prevalence;

    function caseFor(which) {
      var sAI = sens ? sens[which] : NaN, spAI = spec ? spec[which] : NaN;
      var flagRate = errorsIncluded ? prev * sAI + (1 - prev) * (1 - spAI) : 0;
      var readMin = c.readMinutesManual * (1 - c.readTimeSavingPct / 100) * (1 - unread) +
        (mode === 'administrative' ? 0 : flagRate * c.flagReviewMinutes * (1 - unread));
      var reading = readMin * c.radiologistInrPerMin;
      var err = errorsIncluded ? errorModel(mode, prev, sAI, spAI, c) : { perStudy: 0, missRate: null, delayRate: null, falseAlarmRate: null, note: null };
      var L = [
        { id: 'licence_compute', label: 'Licence, compute and hardware', fixedMonthly: fixedCompute, variablePerStudy: i.feePerStudy },
        { id: 'power', label: 'Electricity (with facility overhead)', fixedMonthly: powerFixed, variablePerStudy: powerVar },
        { id: 'storage', label: 'Storage and retrieval', fixedMonthly: storage, variablePerStudy: 0 },
        { id: 'integration', label: 'Integration and support', fixedMonthly: integ, variablePerStudy: 0 },
        { id: 'validation', label: 'Validation, re-validation and audit', fixedMonthly: valInitial + reval, variablePerStudy: auditPerStudy },
        { id: 'governance', label: 'Clinical governance', fixedMonthly: gov, variablePerStudy: 0 },
        { id: 'reading', label: 'Radiologist reading and flag review', fixedMonthly: 0, variablePerStudy: reading },
        { id: 'errors', label: 'Cost of errors (misses, delays, false alarms)', fixedMonthly: 0, variablePerStudy: err.perStudy }
      ];
      var fixed = 0, variable = 0;
      L.forEach(function (l) { l.perStudy = l.fixedMonthly / N + l.variablePerStudy; fixed += l.fixedMonthly; variable += l.variablePerStudy; });
      var total = fixed / N + variable;
      // Manual baseline: the same service without the tool. In triage mode the
      // unprioritised queue delays a share of positives, so that delay is part of it.
      var manualErr = errorsIncluded ? prev * (1 - c.readerSensitivity) * c.costPerMissInr +
        (mode === 'triage' ? prev * c.baselineDelayShare * c.costPerDelayInr : 0) +
        (1 - prev) * (1 - c.readerSpecificity) * c.fpWorkupInr * c.fpActedFraction : 0;
      var manual = c.readMinutesManual * c.radiologistInrPerMin + manualErr;
      var be = null, beReason = null;
      if (manual > variable) be = fixed / (manual - variable);
      else beReason = 'The tool\'s variable cost per study (INR ' + r2(variable) + ') is at or above reading without it (INR ' + r2(manual) + '), so it never pays for itself at any volume.';
      return { layers: L, fixed: fixed, variable: variable, total: total, manual: manual, manualErrors: manualErr, net: total - manual,
        breakEven: be, breakEvenReason: beReason, error: err, flagRate: flagRate,
        computeShare: total > 0 ? (L[0].perStudy + L[1].perStudy) / total : null };
    }

    var W = caseFor('worst'), B = errorsIncluded ? caseFor('best') : W;

    profile.layers = W.layers.map(function (l, k) {
      return { id: l.id, label: l.label, perStudy: { worst: l.perStudy, best: B.layers[k].perStudy },
        fixedMonthly: l.fixedMonthly, variablePerStudy: { worst: l.variablePerStudy, best: B.layers[k].variablePerStudy } };
    });
    profile.total = { worst: W.total, best: B.total };
    profile.manual = { worst: W.manual, best: B.manual, readingOnly: c.readMinutesManual * c.radiologistInrPerMin };
    profile.net = { worst: W.net, best: B.net };
    profile.breakEvenStudiesPerMonth = {
      worst: W.breakEven, best: B.breakEven, reason: W.breakEvenReason || B.breakEvenReason || null,
      formula: 'fixed monthly cost / (manual cost per study - tool variable cost per study)'
    };
    profile.computeShare = { worst: W.computeShare, best: B.computeShare };
    profile.errorModel = errorsIncluded ? { note: W.error.note, worst: { missRate: W.error.missRate, delayRate: W.error.delayRate, falseAlarmRate: W.error.falseAlarmRate, flagRate: W.flagRate },
      best: { missRate: B.error.missRate, delayRate: B.error.delayRate, falseAlarmRate: B.error.falseAlarmRate, flagRate: B.flagRate } } : null;

    // Affordability: a separate axis, never part of readiness.
    // Worst and best name the performance case (lower bound or point), not the
    // cost. Lower sensitivity can mean fewer flags to review, so the cheaper
    // case is not always the better-performance one: judge on both nets.
    var hiNet = Math.max(W.net, B.net), loNet = Math.min(W.net, B.net);
    var aff;
    if (hiNet <= 0) aff = { verdict: 'SAVES', label: 'Costs less than the same service without it, in both performance cases' };
    else if (loNet <= 0) aff = { verdict: 'EVIDENCE_DEPENDENT', label: 'Pays for itself in one performance case only; firmer accuracy evidence would decide it' };
    else aff = { verdict: 'COSTS_MORE', label: 'Costs more per study than the same service without it' };
    aff.reason = 'Net cost per study against the same service without the tool: INR ' + r2(W.net) + ' (worst) to INR ' + r2(B.net) + ' (best) at ' +
      N + ' studies a month. Negative means the tool saves money.';
    if (!errorsIncluded) aff.reason += ' Errors are not costed, so this compares running cost with reading time only.';
    profile.affordability = aff;

    // Who pays.
    var shares = { hospital: c.payerHospital, patient: c.payerPatient, insurer: c.payerInsurer, consortium: c.payerConsortium };
    var sum = shares.hospital + shares.patient + shares.insurer + shares.consortium;
    if (Math.abs(sum - 100) > 0.01) flags.push({ level: 'warn', text: 'Payer shares add to ' + sum + '%, not 100%. Who-pays figures are scaled to the shares as entered.' });
    profile.whoPays = { sharesPct: shares, monthlyWorst: {}, monthlyBest: {} };
    Object.keys(shares).forEach(function (k) {
      profile.whoPays.monthlyWorst[k] = W.total * N * shares[k] / 100;
      profile.whoPays.monthlyBest[k] = B.total * N * shares[k] / 100;
    });

    // Honesty lists.
    notIncluded.push('Land and building (left out deliberately, as in Vyaya)');
    notIncluded.push('Embodied carbon of hardware, network transfer and cooling beyond the PUE factor');
    notIncluded.push('Patient-borne costs such as travel and lost wages');
    if (mode === 'advisory' && errorsIncluded) flags.push({ level: 'info', text: W.error.note });
    used.forEach(function (u) { if (u.status === 'placeholder' || u.status === 'illustrative') profile.placeholdersInUse.push(u.id); });
    used.forEach(function (u) { if (u.corrected !== undefined) flags.push({ level: 'warn', text: u.id + ' was ' + u.corrected + '; held to its allowed range at ' + u.value + '.' }); });
    if (!opts.noDrivers) profile.drivers = drivers(tool, opts, profile);
    if (profile.placeholdersInUse.length) flags.push({ level: 'info', text: profile.placeholdersInUse.length + ' cost inputs are still placeholders or illustrations; the cost figures are illustrative.' });
    return profile;
  }

  /* Which unmeasured inputs decide the answer? Each placeholder or
     illustrative input is halved and then raised by half; an input whose
     swing changes the affordability verdict is listed as deciding. */
  function drivers(tool, opts, base) {
    var out = [];
    base.placeholdersInUse.forEach(function (id) {
      var u = base.inputsUsed.filter(function (x) { return x.id === id; })[0];
      if (!u || !isNum(u.value) || u.value === 0) return;
      var a = DEFAULTS[id] || VYAYA_A[id];
      var hi = isNum(a.max) ? Math.min(a.max, u.value * 1.5) : u.value * 1.5;
      var res = [u.value * 0.5, hi].map(function (v) {
        var t = JSON.parse(JSON.stringify(tool));
        t.cost = t.cost || {}; t.cost[id] = v;
        var o = {}; Object.keys(opts).forEach(function (k) { o[k] = opts[k]; }); o.noDrivers = true;
        return buildProfile(t, o);
      });
      var swing = Math.abs(res[1].net.worst - res[0].net.worst);
      out.push({ id: id, label: a.label, status: u.status, value: u.value, tested: [u.value * 0.5, hi],
        netWorst: [res[0].net.worst, res[1].net.worst], swingPerStudy: swing,
        decidesVerdict: res[0].affordability.verdict !== base.affordability.verdict || res[1].affordability.verdict !== base.affordability.verdict });
    });
    out.sort(function (x, y) { return y.swingPerStudy - x.swingPerStudy; });
    return out;
  }

  /* Accept a profile made elsewhere (for example exported from Vyaya). */
  function acceptProfile(p) {
    var problems = [];
    if (!p || typeof p !== 'object') return { ok: false, problems: ['Profile is not an object.'] };
    if (typeof p.contractVersion !== 'string' || p.contractVersion.split('.')[0] !== CONTRACT_VERSION.split('.')[0]) problems.push('Contract version ' + p.contractVersion + ' is not compatible with ' + CONTRACT_VERSION + '.');
    if (p.unit !== 'per_study') problems.push('Profile unit is ' + p.unit + '; Nikasha scores imaging tools per study, so derived parameters cannot use it.');
    if (!p.figures || p.figures.valid !== true) problems.push('Profile has no valid figures; derived parameters will score 0.');
    return { ok: problems.length === 0, problems: problems };
  }

  return {
    CONTRACT_VERSION: CONTRACT_VERSION,
    COST_VERSION: COST_VERSION,
    DEFAULTS: DEFAULTS,
    SHARED_IDS: SHARED_IDS,
    INFRA_IDS: INFRA_IDS,
    buildProfile: buildProfile,
    acceptProfile: acceptProfile,
    figures: figures,
    errorModel: errorModel
  };
});
