# Changelog

Every change to a rule, default or contract is recorded here with its reason, so any past verdict can be reproduced.

## 0.2.0 — 12 November 2026

Nikasha moves to its own repository and is connected to Vyaya. Working example on synthetic data, for illustration only.

**Repository**
- Moved from `agravaaniresearch/healthtools` (folder `nikasha/`) with its seven-commit history. The page, build and tests now run from the repository root. The `nikasha-v0.1` tag remains in `healthtools`.

**Schema first**
- Every rule, weight, threshold, anchor and certainty multiplier moved from `src/engine.js` into `data/framework.json`, governed by `schema/framework.schema.json`. The engine now only applies the data.
- New schemas: `tool.schema.json` (the assessment), `cost-profile.schema.json` (the contract with Vyaya), `cost-defaults.schema.json`, `grid-carbon.schema.json`, `sources.schema.json`, `samples.schema.json`.
- Samples moved from `src/samples.js` to `data/samples.json`.

**Connection to Vyaya**
- New cost bridge `src/cost.js` builds a per-study cost profile with eight layers, a manual comparison, break-even volume, who pays, and a driver analysis that names the placeholder inputs deciding the answer.
- Vyaya's engine, tariffs, assumptions and sources are vendored at commit `2b5ae5e` with hashes. Six inputs are read from Vyaya instead of being duplicated: hardware life (6 years, Schedule II), residual value, cost of capital, GPU failure rate, uncovered share of a failure, and PUE.
- Setting a state on a tool takes its landed tariff from Vyaya. A state with no verified figure falls back to the national default and is flagged.
- Affordability is reported as a separate axis and never changes readiness. Tests enforce this.
- Grid carbon now defaults to the national CEA figure (727 g CO2/kWh, database version 20.0, read from secondary summaries) when a tool gives none. The samples keep their stated 710.

**Samples**
- Each sample gained numeric accuracy (point and lower 95% bound) and cost inputs, all synthetic. Readiness verdicts are unchanged. Orrisfield's sensitivity interval was widened and an in-house engineering cost added so that the samples show all three readiness outcomes and two affordability outcomes.

**Fixes found by the new test bed**
- Missing figures were reported as NaN; they are now null, and the page checks for a number.
- Gate values inherited through an object's prototype counted as documented; the engine now reads own properties only.
- Very large infrastructure values overflowed; plausibility ceilings now treat them as missing.
- Strings such as "constructor" matched built-in object properties in lookups; fixed.

**Known finding, not changed**
- F1: under the placeholder weights a verdict can improve with autonomy. This is a weighting question for the panel and is pinned by a test. See `docs/FAILURE-MODES.md`.

**Test bed**
- 191 tests in nine suites (schema, golden parity with v0.1, engine, hand-checked cost arithmetic, Vyaya contract, properties over 1,500 random tools, failure injection, adversarial, build), plus a headless browser check. Line coverage 99%, branch coverage 90%.
- The v0.2 engine reproduces every v0.1 output exactly on the frozen v0.1 samples.

**Documents**
- README with an example run on synthetic data, `DEPLOYMENT.md` for engineers, `docs/POLICY.md`, `docs/FAILURE-MODES.md`, `docs/SCHEMA.md`.

## 0.1.0 — October 2026

First working example in `healthtools/nikasha`: entry scope, legal gates, clinical knockouts, compensatory merit with a certainty-discounted band, four autonomy profiles, a single-file browser tool and its tests.
