/*
 * Nikasha scoring engine v0.2
 * ---------------------------------------------------------------------------
 * The rules live in data/framework.json, validated by
 * schema/framework.schema.json. This file only applies them. Change a weight,
 * threshold, anchor or certainty multiplier in the data file, not here.
 *
 * Infrastructure figures come from a deployment cost profile
 * (schema/cost-profile.schema.json), built by src/cost.js from the pinned
 * Vyaya engine and data, or supplied ready-made on tool.costProfile.
 * Affordability is reported on its own axis and never changes readiness.
 *
 * Working example on synthetic data. Not clinically or academically validated.
 * Weights and thresholds are placeholders pending a stakeholder panel, and the
 * engine has not been calibrated against real adoption outcomes.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../data/framework.json'), require('./cost.js'));
  } else {
    root.Nikasha = factory(root.NikashaData.framework, root.NikashaCost);
  }
})(typeof self !== 'undefined' ? self : this, function (FW, Cost) {
  'use strict';

  var VERSION = FW.meta.version;
  var STATUS_LINE = FW.meta.status;
  var PLACEHOLDER_NOTICE = FW.meta.placeholderNotice;

  var CERTAINTY = FW.certainty;
  var CERTAINTY_BY_ID = {};
  CERTAINTY.forEach(function (c) { CERTAINTY_BY_ID[c.id] = c; });

  var MODES = FW.modes;
  var MODE_IDS = MODES.map(function (m) { return m.id; });
  var READY_THRESHOLD = FW.readyThreshold;

  var MODALITIES = FW.modalities;
  var MODALITY_BY_ID = {};
  MODALITIES.forEach(function (m) { MODALITY_BY_ID[m.id] = m; });

  var GATE_VALUES = FW.gateValues;
  var GATES = FW.gates.map(function (g) {
    return { id: g.id, label: g.label, description: g.description, modes: g.modes === 'all' ? MODE_IDS.slice() : g.modes };
  });

  function bandRule(metricLabel, unit, cuts) {
    return [
      metricLabel + ' above ' + fmtNum(cuts[2]) + ' ' + unit + ', or inputs missing.',
      metricLabel + ' ' + fmtNum(cuts[1]) + ' to ' + fmtNum(cuts[2]) + ' ' + unit + '.',
      metricLabel + ' ' + fmtNum(cuts[0]) + ' to ' + fmtNum(cuts[1]) + ' ' + unit + '.',
      metricLabel + ' at or below ' + fmtNum(cuts[0]) + ' ' + unit + '.'
    ];
  }

  var DERIVED_CUTS = FW.derivedCuts;
  // Derived parameters carry no written anchors in the data: their anchors are
  // generated from the band cuts so the two can never disagree.
  var PARAMETERS = FW.parameters.map(function (p) {
    var o = { id: p.id, label: p.label, domain: p.domain, kind: p.kind };
    if (p.kind === 'derived') {
      var d = DERIVED_CUTS[p.id];
      o.anchors = bandRule(d.label, d.unit, d.cuts);
    } else {
      o.anchors = p.anchors.slice();
    }
    return o;
  });
  var PARAM_BY_ID = {};
  PARAMETERS.forEach(function (p) { PARAM_BY_ID[p.id] = p; });

  var WEIGHTS = FW.weights;
  var KNOCKOUTS = FW.knockouts;
  var INFRA_FIELDS = FW.infraFields;
  var DECISION_ROWS = FW.decisionRows;

  function num(v) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : NaN;
  }

  // v0.1 entry point, kept for callers and tests. Same formulas, now in cost.js.
  function computeFigures(infra) {
    var p = Cost.buildProfile({ infra: infra || {} });
    return p.figures;
  }

  // Read only what the assessor actually wrote: never a value inherited
  // through the prototype chain of the tool document.
  function own(o, k) {
    return o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
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
    var c = Object.prototype.hasOwnProperty.call(CERTAINTY_BY_ID, certaintyId) ? CERTAINTY_BY_ID[certaintyId] : CERTAINTY_BY_ID.unsupported;
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
    if (!Object.prototype.hasOwnProperty.call(CERTAINTY_BY_ID, certainty)) {
      if (certainty !== undefined) warnings.push('Unknown certainty "' + certainty + '" treated as unsupported.');
      certainty = 'unsupported';
    }
    var magnitude, rule, figure = null;
    if (param.kind === 'derived') {
      var spec = DERIVED_CUTS[param.id];
      var value = figures && figures.valid ? figures[spec.figure] : NaN;
      magnitude = bandMagnitude(value, spec.cuts);
      figure = { name: spec.label, value: isFinite(value) ? value : null, unit: spec.unit };
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
      var v = own(gates, g.id);
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
      costProfile: null,
      affordability: null,
      profileProblems: [],
      merit: null,
      decision: null,
      decisionTable: [],
      tiersEvaluated: [],
      informationalOnly: false
    };

    // Entry
    var mod = Object.prototype.hasOwnProperty.call(MODALITY_BY_ID, tool.modality) ? MODALITY_BY_ID[tool.modality] : null;
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
      var prof = profileFor(tool, mode, result);
      result.costProfile = prof;
      result.figures = prof && prof.figures ? prof.figures : { valid: false, missing: ['costProfile'] };
      result.affordability = prof ? prof.affordability : null;
      var inputs = tool.params || {};
      result.params = PARAMETERS.map(function (p) { return scoreParameter(p, own(inputs, p.id), result.figures); });
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

  // A supplied profile (for example exported from Vyaya) wins over computing one.
  function profileFor(tool, mode, result) {
    if (tool.costProfile) {
      var chk = Cost.acceptProfile(tool.costProfile);
      result.profileProblems = chk.problems;
      if (chk.ok) return tool.costProfile;
      var p = JSON.parse(JSON.stringify(tool.costProfile));
      p.figures = { valid: false, missing: ['costProfile'] };
      return p;
    }
    try { return Cost.buildProfile(tool, { mode: mode }); }
    catch (e) { result.profileProblems = ['Cost model failed: ' + e.message]; return null; }
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
      if (r.affordability) {
        lines.push('  Affordability (separate axis, does not change readiness): ' + r.affordability.label + '.');
        if (r.costProfile && r.costProfile.total) {
          var cp = r.costProfile;
          lines.push('    Cost per study with the tool INR ' + Math.round(cp.total.best) + ' (best) to ' + Math.round(cp.total.worst) +
            ' (worst), against INR ' + Math.round(cp.manual.worst) + ' for the same service without it (reading plus errors).');
          lines.push('    Compute and power are ' + Math.round(cp.computeShare.worst * 100) + '% of the worst-case bill; reading time is ' +
            Math.round(cp.layers.filter(function (l) { return l.id === 'reading'; })[0].perStudy.worst / cp.total.worst * 100) + '%.');
        }
      }
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
    Cost: Cost,
    FRAMEWORK: FW,
    bandMagnitude: bandMagnitude,
    effectiveScore: effectiveScore,
    evaluate: evaluate,
    explain: explain,
    round: round
  };
});
