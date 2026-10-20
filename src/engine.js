/*
 * Nikasha scoring engine v0.1
 * ---------------------------------------------------------------------------
 * Single source of truth for every rule, table and threshold in Nikasha.
 * The browser tool (index.html) embeds this file verbatim at build time and
 * the Node tests require it directly, so the two can never drift apart.
 * A test (test/build.test.js) fails if the copy inside index.html differs
 * from this file by a single byte.
 *
 * Working example on synthetic data. Not clinically or academically validated.
 * Weights and thresholds are placeholders pending a stakeholder panel, and the
 * engine has not been calibrated against real adoption outcomes.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Nikasha = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '0.1.0';

  var STATUS_LINE = 'Working example on synthetic data. Not clinically or academically validated.';
  var PLACEHOLDER_NOTICE = 'All weights and thresholds are placeholders pending a stakeholder panel. ' +
    'Nikasha has not been calibrated against real adoption outcomes.';

  // -------------------------------------------------------------------------
  // Evidence certainty table (published). Effective score = magnitude x
  // multiplier. Each level carries a range: the low end feeds the worst case,
  // the high end feeds the best case. Unsupported claims are fixed at zero.
  // -------------------------------------------------------------------------
  var CERTAINTY = [
    { id: 'clinical_use', label: 'Actual clinical use', lo: 0.90, hi: 1.00,
      description: 'Deployed in routine care with audited local results.' },
    { id: 'peer_reviewed', label: 'Peer-reviewed publication', lo: 0.75, hi: 0.95,
      description: 'Published in a peer-reviewed journal. Preprints and arXiv do not count here.' },
    { id: 'live_demo', label: 'Live demonstration', lo: 0.55, hi: 0.80,
      description: 'Shown working on cases chosen by the assessor, not by the vendor.' },
    { id: 'preprint', label: 'Preprint or arXiv', lo: 0.25, hi: 0.50,
      description: 'Public but not peer reviewed.' },
    { id: 'vendor_claim', label: 'Vendor document', lo: 0.10, hi: 0.30,
      description: 'White paper, brochure, slide deck or internal report.' },
    { id: 'unsupported', label: 'Unsupported claim', lo: 0.00, hi: 0.00,
      description: 'No evidence offered. Always scores 0.' }
  ];

  var CERTAINTY_BY_ID = {};
  CERTAINTY.forEach(function (c) { CERTAINTY_BY_ID[c.id] = c; });

  // -------------------------------------------------------------------------
  // Autonomy modes. Scrutiny rises from administrative to autonomous through
  // three levers: clinical weights, knockout thresholds and the readiness bar.
  // -------------------------------------------------------------------------
  var MODES = [
    { id: 'administrative', label: 'Administrative',
      description: 'Affects workflow only (worklist order, protocol suggestion). A clinician reads every study unaided.' },
    { id: 'advisory', label: 'Advisory',
      description: 'Shows findings to a clinician who reads the study and decides.' },
    { id: 'triage', label: 'Triage',
      description: 'Decides which studies are read first. A missed finding can delay care.' },
    { id: 'autonomous', label: 'Autonomous',
      description: 'Issues a result that some studies receive with no clinician read.' }
  ];
  var MODE_IDS = MODES.map(function (m) { return m.id; });

  // Minimum worst-case merit (0-100) for READY, per mode.
  var READY_THRESHOLD = { administrative: 55, advisory: 60, triage: 68, autonomous: 75 };

  // -------------------------------------------------------------------------
  // Entry: scope check on modality.
  // -------------------------------------------------------------------------
  var MODALITIES = [
    { id: 'CT', label: 'CT', inScope: true },
    { id: 'MRI', label: 'MRI', inScope: true },
    { id: 'XRAY', label: 'X-ray (plain radiograph)', inScope: false,
      reason: 'X-ray tools are out of scope. Nikasha v0.1 defines its false-negative and ' +
        'false-positive anchors for cross-sectional CT and MRI reads. A projection radiograph has ' +
        'different lesion conspicuity, reference standards and error profiles, so a score against ' +
        'these anchors would not mean anything.' },
    { id: 'MAMMOGRAPHY', label: 'Mammography', inScope: false,
      reason: 'Mammography is an X-ray technique and is out of scope for the same reason as plain ' +
        'radiography: the CT and MRI error anchors do not transfer to projection imaging.' },
    { id: 'ULTRASOUND', label: 'Ultrasound', inScope: false,
      reason: 'Ultrasound is out of scope in v0.1. Only CT and MRI diagnostic tools are assessed.' },
    { id: 'PET', label: 'PET or nuclear medicine', inScope: false,
      reason: 'PET and nuclear medicine are out of scope in v0.1. Only CT and MRI diagnostic tools are assessed.' }
  ];
  var MODALITY_BY_ID = {};
  MODALITIES.forEach(function (m) { MODALITY_BY_ID[m.id] = m; });

  // -------------------------------------------------------------------------
  // Tier 1: legal gates. Each must be documented as met. "unknown" fails,
  // because an unsupported claim counts as nothing.
  // -------------------------------------------------------------------------
  var GATE_VALUES = ['met', 'not_met', 'unknown'];
  var GATES = [
    { id: 'regulatory', label: 'Regulatory authorisation',
      description: 'Medical-device authorisation in the deploying jurisdiction covers this intended use.',
      modes: MODE_IDS },
    { id: 'data_protection', label: 'Data protection',
      description: 'Processing of patient data complies with applicable law (in India, the DPDP Act 2023).',
      modes: MODE_IDS },
    { id: 'intended_use', label: 'Intended use matches deployment',
      description: 'The autonomy mode being assessed sits inside the authorised intended use.',
      modes: MODE_IDS },
    { id: 'accountability', label: 'Clinical accountability',
      description: 'A named clinical owner and an incident-reporting route exist at the deploying site.',
      modes: MODE_IDS },
    { id: 'unsupervised_authorisation', label: 'Unsupervised reporting authorised',
      description: 'The authorisation explicitly permits results issued with no clinician read.',
      modes: ['autonomous'] }
  ];

  // -------------------------------------------------------------------------
  // Parameters. "assessed" parameters take a magnitude (0-3) chosen against
  // written anchors. "derived" parameters compute their magnitude from the
  // infrastructure figures with a stated rule; their certainty is still
  // assessed (how do we know the figures?).
  // -------------------------------------------------------------------------
  function bandRule(metricLabel, unit, cuts) {
    return [
      metricLabel + ' above ' + fmtNum(cuts[2]) + ' ' + unit + ', or inputs missing.',
      metricLabel + ' ' + fmtNum(cuts[1]) + ' to ' + fmtNum(cuts[2]) + ' ' + unit + '.',
      metricLabel + ' ' + fmtNum(cuts[0]) + ' to ' + fmtNum(cuts[1]) + ' ' + unit + '.',
      metricLabel + ' at or below ' + fmtNum(cuts[0]) + ' ' + unit + '.'
    ];
  }

  var DERIVED_CUTS = {
    electricity: { figure: 'whPerStudy', label: 'Energy per study', unit: 'Wh', cuts: [20, 60, 150] },
    carbon: { figure: 'gco2PerStudy', label: 'Emissions per study', unit: 'g CO2e', cuts: [15, 45, 110] },
    daily_cost: { figure: 'dailyCostPerStudy', label: 'Running cost per study', unit: 'INR', cuts: [25, 60, 120] },
    storage_cost: { figure: 'storageCostPerStudy', label: 'Storage and retrieval cost per study', unit: 'INR', cuts: [2, 6, 15] },
    tco: { figure: 'tcoPerStudy', label: 'Five-year cost of ownership per study', unit: 'INR', cuts: [80, 180, 350] }
  };

  var PARAMETERS = [
    { id: 'sensitivity', label: 'Sensitivity (false negatives)', domain: 'clinical', kind: 'assessed',
      anchors: [
        'Not reported, sensitivity below 85%, or lower 95% CI bound below 80%.',
        'Sensitivity 85 to 89% with lower 95% CI bound at least 80%.',
        'Sensitivity 90 to 94% with lower 95% CI bound at least 85%.',
        'Sensitivity at least 95% with lower 95% CI bound at least 90%, reported per finding type.'
      ] },
    { id: 'specificity', label: 'Specificity (false positives)', domain: 'clinical', kind: 'assessed',
      anchors: [
        'Not reported, specificity below 80%, or no false-positive rate per 100 studies.',
        'Specificity 80 to 87%, false positives stated per 100 studies.',
        'Specificity 88 to 93%, with false positives per 100 studies and the review workload they create.',
        'Specificity at least 94%, false positives per 100 studies, and a review of what the false positives were.'
      ] },
    { id: 'external_validation', label: 'External validation', domain: 'clinical', kind: 'assessed',
      anchors: [
        'Internal or development-set results only.',
        'One external site, retrospective.',
        'Two or more external sites, or one prospective external study.',
        'Multi-site prospective validation on scanners and patients like those at the deploying site.'
      ] },
    { id: 'subgroup_performance', label: 'Subgroup and scanner robustness', domain: 'clinical', kind: 'assessed',
      anchors: [
        'No subgroup or scanner-level results.',
        'Results split by one factor, such as scanner vendor or age band.',
        'Results split by scanner vendor, field strength or slice thickness, and by age and sex.',
        'As level 2, plus a failure-mode analysis showing where the tool is weak and what it does there.'
      ] },
    { id: 'human_oversight', label: 'Human oversight and override', domain: 'clinical', kind: 'assessed',
      anchors: [
        'Output cannot be overridden or audited; no record of what the tool showed.',
        'Clinician can override and outputs are logged.',
        'Override and logging, plus the image region or evidence behind each finding is shown.',
        'As level 2, plus calibrated confidence, abstention on low-confidence cases and an audit report.'
      ] },
    { id: 'post_market_monitoring', label: 'Post-deployment monitoring', domain: 'clinical', kind: 'assessed',
      anchors: [
        'No monitoring after deployment.',
        'Vendor collects complaints only.',
        'Periodic audit against local reference reads.',
        'Continuous drift monitoring with preset thresholds that trigger review or withdrawal.'
      ] },
    { id: 'workflow_integration', label: 'Workflow integration', domain: 'clinical', kind: 'assessed',
      anchors: [
        'Separate login and manual upload; no PACS or RIS link.',
        'DICOM send and receive, but results shown outside PACS.',
        'Results returned into PACS as DICOM structured report or secondary capture.',
        'As level 2, plus worklist integration and structured report fields.'
      ] },
    { id: 'deployment', label: 'Deployment (edge or cloud)', domain: 'infrastructure', kind: 'assessed',
      anchors: [
        'Cloud only, hosted outside the country, no offline fallback.',
        'Cloud only, hosted in-country.',
        'Hybrid: inference on site, cloud used only for updates or analytics.',
        'Fully on site (edge); works through an internet outage and no image leaves the hospital.'
      ] },
    { id: 'electricity', label: 'Electricity use', domain: 'infrastructure', kind: 'derived',
      anchors: bandRule('Energy per study', 'Wh', DERIVED_CUTS.electricity.cuts) },
    { id: 'carbon', label: 'Carbon footprint', domain: 'infrastructure', kind: 'derived',
      anchors: bandRule('Emissions per study', 'g CO2e', DERIVED_CUTS.carbon.cuts) },
    { id: 'storage_cost', label: 'Storage and retrieval cost', domain: 'infrastructure', kind: 'derived',
      anchors: bandRule('Storage and retrieval cost per study', 'INR', DERIVED_CUTS.storage_cost.cuts) },
    { id: 'daily_cost', label: 'Daily running cost', domain: 'infrastructure', kind: 'derived',
      anchors: bandRule('Running cost per study', 'INR', DERIVED_CUTS.daily_cost.cuts) },
    { id: 'tco', label: 'Total cost of ownership', domain: 'infrastructure', kind: 'derived',
      anchors: bandRule('Five-year cost of ownership per study', 'INR', DERIVED_CUTS.tco.cuts) },
    { id: 'update_process', label: 'Update process', domain: 'infrastructure', kind: 'assessed',
      anchors: [
        'Silent or unannounced model updates.',
        'Vendor-pushed updates with release notes.',
        'Versioned updates scheduled by the site, with change notes and performance deltas.',
        'As level 2, plus local re-validation before go-live and one-step rollback.'
      ] },
    { id: 'source_access', label: 'Source code and algorithm access', domain: 'infrastructure', kind: 'assessed',
      anchors: [
        'Closed source; no description of the algorithm.',
        'Closed source; reviewable description of architecture and training data.',
        'Source or weights available to auditors under a restrictive licence.',
        'Open source under an OSI-approved licence, with weights and training recipe.'
      ] }
  ];
  var PARAM_BY_ID = {};
  PARAMETERS.forEach(function (p) { PARAM_BY_ID[p.id] = p; });

  // -------------------------------------------------------------------------
  // Tier 3 weight profiles (placeholders). Each profile sums to 100.
  // -------------------------------------------------------------------------
  var WEIGHTS = {
    administrative: { sensitivity: 8, specificity: 8, external_validation: 6, subgroup_performance: 4,
      human_oversight: 6, post_market_monitoring: 4, workflow_integration: 14, deployment: 8,
      electricity: 6, carbon: 6, storage_cost: 7, daily_cost: 7, tco: 10, update_process: 4, source_access: 2 },
    advisory: { sensitivity: 14, specificity: 12, external_validation: 10, subgroup_performance: 7,
      human_oversight: 9, post_market_monitoring: 6, workflow_integration: 10, deployment: 5,
      electricity: 3, carbon: 4, storage_cost: 4, daily_cost: 4, tco: 6, update_process: 3, source_access: 3 },
    triage: { sensitivity: 18, specificity: 14, external_validation: 12, subgroup_performance: 9,
      human_oversight: 9, post_market_monitoring: 8, workflow_integration: 8, deployment: 4,
      electricity: 2, carbon: 3, storage_cost: 3, daily_cost: 2, tco: 4, update_process: 2, source_access: 2 },
    autonomous: { sensitivity: 20, specificity: 16, external_validation: 14, subgroup_performance: 11,
      human_oversight: 10, post_market_monitoring: 10, workflow_integration: 4, deployment: 3,
      electricity: 1, carbon: 2, storage_cost: 2, daily_cost: 1, tco: 3, update_process: 3, source_access: 0 }
  };

  // -------------------------------------------------------------------------
  // Tier 2 clinical knockouts. A knockout compares the WORST-CASE effective
  // score with a mode-specific minimum. null = not a knockout in that mode.
  // -------------------------------------------------------------------------
  var KNOCKOUTS = [
    { param: 'sensitivity',
      thresholds: { administrative: 1.0, advisory: 1.5, triage: 2.0, autonomous: 2.5 } },
    { param: 'specificity',
      thresholds: { administrative: 1.0, advisory: 1.25, triage: 1.5, autonomous: 2.25 } },
    { param: 'external_validation',
      thresholds: { administrative: null, advisory: null, triage: 1.5, autonomous: 2.0 } },
    { param: 'post_market_monitoring',
      thresholds: { administrative: null, advisory: null, triage: null, autonomous: 1.5 } }
  ];

  // -------------------------------------------------------------------------
  // Infrastructure inputs and the figures computed from them.
  // -------------------------------------------------------------------------
  var INFRA_FIELDS = [
    { id: 'studiesPerDay', label: 'Studies processed per day', unit: 'studies' },
    { id: 'energyWhPerStudy', label: 'Compute energy per study', unit: 'Wh' },
    { id: 'idleWatts', label: 'Idle power of dedicated hardware', unit: 'W' },
    { id: 'gridIntensity', label: 'Grid carbon intensity where compute runs', unit: 'g CO2e/kWh' },
    { id: 'tariffPerKWh', label: 'Electricity tariff', unit: 'INR/kWh' },
    { id: 'feePerStudy', label: 'Licence fee per study', unit: 'INR' },
    { id: 'cloudPerDay', label: 'Cloud compute charge per day', unit: 'INR' },
    { id: 'storageTB', label: 'Storage held for the tool', unit: 'TB' },
    { id: 'storagePerTBMonth', label: 'Storage price', unit: 'INR/TB/month' },
    { id: 'retrievalPerMonth', label: 'Retrieval and egress charges', unit: 'INR/month' },
    { id: 'upfront', label: 'Upfront licence and hardware', unit: 'INR' },
    { id: 'annualMaintenance', label: 'Annual maintenance and support', unit: 'INR/year' }
  ];

  function num(v) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : NaN;
  }

  function computeFigures(infra) {
    infra = infra || {};
    var i = {};
    var missing = [];
    INFRA_FIELDS.forEach(function (f) {
      var n = num(infra[f.id]);
      if (isNaN(n) || n < 0) { missing.push(f.id); n = NaN; }
      i[f.id] = n;
    });
    if (!(i.studiesPerDay > 0)) { if (missing.indexOf('studiesPerDay') < 0) missing.push('studiesPerDay'); }
    if (missing.length) {
      return { valid: false, missing: missing };
    }
    var n = i.studiesPerDay;
    var kwhPerDay = (n * i.energyWhPerStudy + i.idleWatts * 24) / 1000;
    var whPerStudy = (kwhPerDay * 1000) / n;
    var co2KgPerYear = (kwhPerDay * 365 * i.gridIntensity) / 1000;
    var gco2PerStudy = (whPerStudy / 1000) * i.gridIntensity;
    var dailyCost = i.feePerStudy * n + kwhPerDay * i.tariffPerKWh + i.cloudPerDay;
    var storageMonthly = i.storageTB * i.storagePerTBMonth + i.retrievalPerMonth;
    var tco5y = i.upfront + i.annualMaintenance * 5 + dailyCost * 365 * 5 + storageMonthly * 60;
    return {
      valid: true,
      missing: [],
      kwhPerDay: kwhPerDay,
      whPerStudy: whPerStudy,
      co2KgPerYear: co2KgPerYear,
      gco2PerStudy: gco2PerStudy,
      dailyCost: dailyCost,
      dailyCostPerStudy: dailyCost / n,
      storageMonthly: storageMonthly,
      storageCostPerStudy: storageMonthly / (n * 30),
      tco5y: tco5y,
      tcoPerStudy: tco5y / (n * 365 * 5),
      formulas: {
        kwhPerDay: '(studies/day x Wh/study + idle W x 24) / 1000',
        co2KgPerYear: 'kWh/day x 365 x grid g CO2e/kWh / 1000',
        dailyCost: 'fee/study x studies/day + kWh/day x tariff + cloud/day',
        storageMonthly: 'TB x price/TB/month + retrieval/month',
        tco5y: 'upfront + maintenance x 5 + daily cost x 365 x 5 + storage/month x 60'
      }
    };
  }

  function bandMagnitude(value, cuts) {
    if (!isFinite(value)) return 0;
    if (value <= cuts[0]) return 3;
    if (value <= cuts[1]) return 2;
    if (value <= cuts[2]) return 1;
    return 0;
  }

  // -------------------------------------------------------------------------
  // Scoring helpers.
  // -------------------------------------------------------------------------
  function effectiveScore(magnitude, certaintyId) {
    var c = CERTAINTY_BY_ID[certaintyId] || CERTAINTY_BY_ID.unsupported;
    var m = validMagnitude(magnitude) ? magnitude : 0;
    return { worst: m * c.lo, best: m * c.hi, lo: c.lo, hi: c.hi, certainty: c.id };
  }

  function validMagnitude(m) {
    return typeof m === 'number' && (m === 0 || m === 1 || m === 2 || m === 3);
  }

  function round(x, dp) {
    var f = Math.pow(10, dp === undefined ? 1 : dp);
    return Math.round(x * f) / f;
  }

  function fmtNum(x) {
    return String(x);
  }

  function scoreParameter(param, input, figures) {
    input = input || {};
    var warnings = [];
    var certainty = input.certainty;
    if (!CERTAINTY_BY_ID[certainty]) {
      if (certainty !== undefined) warnings.push('Unknown certainty "' + certainty + '" treated as unsupported.');
      certainty = 'unsupported';
    }
    var magnitude, rule, figure = null;
    if (param.kind === 'derived') {
      var spec = DERIVED_CUTS[param.id];
      var value = figures && figures.valid ? figures[spec.figure] : NaN;
      magnitude = bandMagnitude(value, spec.cuts);
      figure = { name: spec.label, value: value, unit: spec.unit };
      rule = (isFinite(value)
        ? spec.label + ' = ' + round(value, 2) + ' ' + spec.unit + ', which falls in level ' + magnitude + '.'
        : 'Infrastructure inputs missing, so magnitude is 0.');
    } else {
      magnitude = input.magnitude;
      if (!validMagnitude(magnitude)) {
        if (magnitude !== undefined) warnings.push('Magnitude "' + magnitude + '" is not 0 to 3; treated as 0.');
        magnitude = 0;
      }
      rule = 'Assessor chose level ' + magnitude + ' against the written anchor.';
    }
    var eff = effectiveScore(magnitude, certainty);
    var c = CERTAINTY_BY_ID[certainty];
    var discount = certainty === 'unsupported'
      ? 'Unsupported claim, so the effective score is 0.'
      : magnitude + ' x ' + c.lo.toFixed(2) + ' = ' + round(eff.worst, 2) + ' (worst); ' +
        magnitude + ' x ' + c.hi.toFixed(2) + ' = ' + round(eff.best, 2) + ' (best).';
    return {
      id: param.id,
      label: param.label,
      domain: param.domain,
      kind: param.kind,
      magnitude: magnitude,
      anchor: param.anchors[magnitude],
      certainty: certainty,
      certaintyLabel: c.label,
      lo: c.lo,
      hi: c.hi,
      worst: eff.worst,
      best: eff.best,
      figure: figure,
      rule: rule,
      discount: discount,
      note: input.note || '',
      warnings: warnings
    };
  }

  function computeMerit(params, mode) {
    var w = WEIGHTS[mode];
    var sumW = 0, worst = 0, best = 0;
    var rows = params.map(function (p) {
      var weight = w[p.id] || 0;
      sumW += weight;
      worst += weight * p.worst;
      best += weight * p.best;
      return { id: p.id, weight: weight, worstPoints: weight * p.worst, bestPoints: weight * p.best };
    });
    var max = 3 * sumW;
    return {
      worst: max > 0 ? (worst / max) * 100 : 0,
      best: max > 0 ? (best / max) * 100 : 0,
      totalWeight: sumW,
      rows: rows,
      formula: 'Merit = sum(weight x effective score) / (3 x sum(weight)) x 100, computed once with ' +
        'worst-case and once with best-case effective scores.'
    };
  }

  function evaluateGates(tool, mode) {
    var gates = tool.gates || {};
    return GATES.filter(function (g) { return g.modes.indexOf(mode) >= 0; }).map(function (g) {
      var v = gates[g.id];
      if (GATE_VALUES.indexOf(v) < 0) v = 'unknown';
      return {
        id: g.id, label: g.label, description: g.description, value: v, passed: v === 'met',
        rule: v === 'met' ? 'Documented as met, so the gate passes.'
          : v === 'not_met' ? 'Documented as not met, so the gate fails.'
          : 'Not documented. Unknown counts as not met, so the gate fails.'
      };
    });
  }

  function evaluateKnockouts(paramsById, mode) {
    return KNOCKOUTS.filter(function (k) {
      return k.thresholds[mode] !== null && k.thresholds[mode] !== undefined;
    }).map(function (k) {
      var p = paramsById[k.param];
      var t = k.thresholds[mode];
      var passed = p.worst >= t - 1e-9;
      return {
        param: k.param, label: p.label, threshold: t, worst: p.worst, passed: passed,
        rule: 'Worst-case effective ' + round(p.worst, 2) + (passed ? ' >= ' : ' < ') + t +
          ' (minimum for ' + mode + ' mode), so the knockout ' + (passed ? 'passes.' : 'fails the tool.')
      };
    });
  }

  var DECISION_ROWS = [
    { id: 'R1', tier: 'Entry', condition: 'Modality is not CT or MRI', verdict: 'REJECTED', label: 'Rejected at entry' },
    { id: 'R2', tier: 'Tier 1', condition: 'Any legal gate not met', verdict: 'NOT_READY', label: 'Not ready: legal gate' },
    { id: 'R3', tier: 'Tier 2', condition: 'Any clinical knockout failed', verdict: 'NOT_READY', label: 'Not ready: clinical knockout' },
    { id: 'R4', tier: 'Tier 3', condition: 'Worst-case merit at or above the mode threshold', verdict: 'READY', label: 'Ready' },
    { id: 'R5', tier: 'Tier 3', condition: 'Best-case merit at or above threshold, worst-case below', verdict: 'CONDITIONAL', label: 'Conditional: evidence-dependent' },
    { id: 'R6', tier: 'Tier 3', condition: 'Best-case merit below the mode threshold', verdict: 'NOT_READY', label: 'Not ready: merit below threshold' }
  ];

  // -------------------------------------------------------------------------
  // Main entry point.
  // -------------------------------------------------------------------------
  function evaluate(tool, modeOverride) {
    tool = tool || {};
    var mode = modeOverride || tool.mode;
    if (MODE_IDS.indexOf(mode) < 0) mode = 'advisory';
    var threshold = READY_THRESHOLD[mode];
    var result = {
      engineVersion: VERSION,
      tool: { id: tool.id, name: tool.name, modality: tool.modality, finding: tool.finding },
      mode: mode,
      threshold: threshold,
      entry: null,
      gates: [],
      knockouts: [],
      params: [],
      figures: null,
      merit: null,
      decision: null,
      decisionTable: [],
      tiersEvaluated: [],
      informationalOnly: false
    };

    // Entry
    var mod = MODALITY_BY_ID[tool.modality];
    if (!mod) {
      result.entry = { passed: false, modality: tool.modality,
        reason: 'Modality "' + tool.modality + '" is not recognised. Only CT and MRI diagnostic tools are assessed.' };
    } else if (!mod.inScope) {
      result.entry = { passed: false, modality: mod.id, reason: mod.reason };
    } else {
      result.entry = { passed: true, modality: mod.id, reason: mod.label + ' is in scope.' };
    }
    result.tiersEvaluated.push('entry');

    var matched;
    if (!result.entry.passed) {
      matched = 'R1';
    } else {
      // Tier 1
      result.gates = evaluateGates(tool, mode);
      result.tiersEvaluated.push('legal');
      // Score parameters (needed by Tier 2 and Tier 3)
      result.figures = computeFigures(tool.infra);
      var inputs = tool.params || {};
      result.params = PARAMETERS.map(function (p) { return scoreParameter(p, inputs[p.id], result.figures); });
      var byId = {};
      result.params.forEach(function (p) { byId[p.id] = p; });
      // Tier 2
      result.knockouts = evaluateKnockouts(byId, mode);
      result.tiersEvaluated.push('knockout');
      // Tier 3
      result.merit = computeMerit(result.params, mode);
      result.tiersEvaluated.push('merit');

      var gateFail = result.gates.some(function (g) { return !g.passed; });
      var koFail = result.knockouts.some(function (k) { return !k.passed; });
      if (gateFail) matched = 'R2';
      else if (koFail) matched = 'R3';
      else if (result.merit.worst >= threshold) matched = 'R4';
      else if (result.merit.best >= threshold) matched = 'R5';
      else matched = 'R6';
      // Later tiers are still computed for transparency, but only the first
      // failing tier decides.
      result.informationalOnly = matched === 'R2' || matched === 'R3';
    }

    result.decisionTable = DECISION_ROWS.map(function (r) {
      return { id: r.id, tier: r.tier, condition: r.condition, verdict: r.verdict, label: r.label, matched: r.id === matched };
    });
    var row = DECISION_ROWS.filter(function (r) { return r.id === matched; })[0];
    result.decision = { row: row.id, verdict: row.verdict, label: row.label, reason: decisionReason(result, row.id) };
    return result;
  }

  function decisionReason(r, rowId) {
    var m = r.merit;
    switch (rowId) {
      case 'R1': return r.entry.reason;
      case 'R2': return 'Legal gate not met: ' + r.gates.filter(function (g) { return !g.passed; })
        .map(function (g) { return g.label + ' (' + g.value.replace('_', ' ') + ')'; }).join(', ') + '.';
      case 'R3': return 'Clinical knockout failed: ' + r.knockouts.filter(function (k) { return !k.passed; })
        .map(function (k) { return k.label + ' worst-case ' + round(k.worst, 2) + ' against a minimum of ' + k.threshold; })
        .join('; ') + '.';
      case 'R4': return 'Worst-case merit ' + round(m.worst).toFixed(1) + ' is at or above the ' + r.mode + ' threshold of ' + r.threshold + '.';
      case 'R5': return 'Merit band ' + round(m.worst).toFixed(1) + ' to ' + round(m.best).toFixed(1) + ' straddles the ' + r.mode +
        ' threshold of ' + r.threshold + '. Firmer evidence would decide it.';
      case 'R6': return 'Even the best-case merit of ' + round(m.best).toFixed(1) + ' is below the ' + r.mode + ' threshold of ' + r.threshold + '.';
    }
    return '';
  }

  // Plain-English summary, shared by the demo command and the browser tool.
  function explain(r) {
    var name = r.tool.name || 'Unnamed tool';
    var lines = [];
    lines.push(name + ' (' + (r.tool.modality || 'unknown modality') + ', ' + r.mode + ' mode): ' + r.decision.label.toUpperCase() + '.');
    lines.push('  Why: ' + r.decision.reason);
    if (r.entry.passed) {
      // Largest shortfalls = most weighted points lost in the worst case.
      var w = WEIGHTS[r.mode];
      var lowest = r.params.slice().filter(function (p) { return (w[p.id] || 0) > 0; })
        .sort(function (a, b) { return w[b.id] * (3 - b.worst) - w[a.id] * (3 - a.worst); }).slice(0, 3);
      lines.push('  Merit band: ' + round(r.merit.worst).toFixed(1) + ' (worst case) to ' + round(r.merit.best).toFixed(1) +
        ' (best case) out of 100; READY needs a worst case of at least ' + r.threshold + '.');
      if (r.figures && r.figures.valid) {
        lines.push('  Carbon footprint: about ' + Math.round(r.figures.co2KgPerYear) + ' kg CO2e per year (' +
          round(r.figures.gco2PerStudy) + ' g per study); running cost about INR ' + Math.round(r.figures.dailyCost) + ' per day.');
      }
      lines.push('  Largest shortfalls: ' + lowest.map(function (p) {
        return p.label + ' (level ' + p.magnitude + ', ' + p.certaintyLabel + ')';
      }).join('; ') + '.');
      if (r.informationalOnly) lines.push('  Later tiers were computed for information only; they do not change the verdict.');
    }
    return lines.join('\n');
  }

  return {
    VERSION: VERSION,
    STATUS_LINE: STATUS_LINE,
    PLACEHOLDER_NOTICE: PLACEHOLDER_NOTICE,
    CERTAINTY: CERTAINTY,
    MODES: MODES,
    MODALITIES: MODALITIES,
    GATES: GATES,
    GATE_VALUES: GATE_VALUES,
    PARAMETERS: PARAMETERS,
    WEIGHTS: WEIGHTS,
    KNOCKOUTS: KNOCKOUTS,
    READY_THRESHOLD: READY_THRESHOLD,
    INFRA_FIELDS: INFRA_FIELDS,
    DERIVED_CUTS: DERIVED_CUTS,
    DECISION_ROWS: DECISION_ROWS,
    computeFigures: computeFigures,
    bandMagnitude: bandMagnitude,
    effectiveScore: effectiveScore,
    evaluate: evaluate,
    explain: explain,
    round: round
  };
});
