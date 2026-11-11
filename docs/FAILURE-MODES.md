# Failure modes and failure rates

Status: working example on synthetic data, for illustration only. Nothing here is a measured failure rate of a real product.

Three different things can fail, and they need to be kept apart. The tool being assessed can be wrong about a patient. The hardware it runs on can break. And Nikasha itself can give a misleading answer. This file records what is known about each, how the framework handles it, and what is still open.

## 1. The tool being assessed

| Failure | How Nikasha handles it | What is still weak |
|---|---|---|
| Missed findings (false negatives) | A knockout in every mode, compared on the worst-case evidence-discounted score; the minimum rises with autonomy. In the cost model, misses are priced per study using the lower 95% bound of sensitivity. | The cost of a miss is a placeholder (INR 50,000). It stands for downstream treatment and harm, and no authoritative figure exists. |
| False alarms (false positives) | A knockout in every mode. In the cost model, a share of false alarms is worked up at a stated cost, and flag review time is charged to the reading layer. | The share worked up and its cost are placeholders. |
| Missed findings in triage | Treated as delays, not misses, because every study is still read. The tool is credited for reading flagged positives first. | Delay cost and the share of positives delayed in an unprioritised queue are placeholders, and they decide the affordability verdict for both triage samples. |
| Reader and tool failing together | The advisory error model assumes the reader and the tool err independently, so a finding is missed only if both miss it. | Automation bias (readers deferring to the tool) breaks this assumption. Any saving on misses in advisory mode is therefore an upper bound, and the page says so. |
| Drift after deployment | Post-deployment monitoring is a merit parameter, and a knockout for autonomous use. The cost model charges an audit share and re-validation after each update. | The audit share and update cadence are placeholders; vendors rarely publish either. |
| Weak performance in a subgroup or on one scanner | A merit parameter with written anchors. | One target finding per assessment; a multi-finding tool needs one assessment per finding. |

## 2. Hardware and infrastructure

| Failure | How Nikasha handles it | What is still weak |
|---|---|---|
| Accelerator (GPU) failure | Expected uncovered failure cost per month = upfront x hardware share x annual failure rate x uncovered share / 12. The failure rate (0.09 a year) and uncovered share come from Vyaya. | Vyaya's figure is derived from one operator's large training cluster over 54 days and counts interruptions, not replacements. It is probably high for inference. No public dataset of GPU failures in Indian institutions exists. A small Backblaze-style open log from Indian hospital and academic clusters would fix this; whether it belongs in Vyaya or a separate paper is undecided. |
| Internet or cloud outage | The deployment parameter scores fully on-site inference that keeps working through an outage highest. | Outage frequency and its clinical cost are not modelled. |
| Power | Landed state tariff from Vyaya, with a facility overhead (PUE 1.6, a placeholder from Vyaya). | 32 of 36 states and union territories have no verified tariff in Vyaya yet (only Karnataka, Maharashtra, Tamil Nadu and Telangana do) and fall back to a flagged national default; Punjab is one of them. Grid carbon is a single national CO2-only figure (727 g/kWh, CEA database version 20.0, read from secondary summaries). |
| Silent model updates | The update-process parameter rewards site-controlled, versioned updates with local re-validation and rollback. The cost model charges re-validation per update. | Nothing detects an unannounced update; that needs monitoring at the site. |

## 3. The framework itself

These are findings about Nikasha, most of them surfaced by the test bed. Each has a test that pins it.

**F1. A verdict can improve with autonomy under the placeholder weights.** The v0.1 notes say scrutiny rises with autonomy, and the v0.1 tests checked that no sample tool gets a better verdict at a higher autonomy mode. That holds for the samples but not in general. A tool with perfect clinical evidence and no infrastructure evidence scores 45.0 to 50.0 in administrative mode (bar 55, not ready) and 76.5 to 85.0 in autonomous mode (bar 75, ready). The clinical share of the weights rises from 50 to 85 while the bar rises only from 55 to 75. Among 1,346 random in-scope tools with all gates met, 1 showed the inversion, so it is rare but real. This is a weighting decision for the stakeholder panel: either the bars must rise faster than the clinical share, or administrative mode should not penalise missing infrastructure evidence so heavily. Test: `invariants.test.js`, "KNOWN FINDING F1".

**F2. The affordability verdict is decided by numbers nobody has published.** In all three samples, the deciding inputs are placeholders: how good the radiologists already are, what a delayed finding costs, and what share of positives a normal queue delays. The driver analysis names them on every result, so the panel knows what to measure first. Until those are measured locally, an affordability verdict is an illustration of the method, not a finding. Test: `cost.test.js`, "driver analysis names the placeholder that decides the verdict".

**F3. Per-study normalisation rewards volume claims.** Cost and energy bands are per study, so claiming ten times the volume improves the derived infrastructure scores. The certainty discount limits the gain, and volume can never clear a knockout or a gate, but a vendor's volume figure should be checked against the site's own. Test: `adversarial.test.js`, A9.

**F4. One certainty table for every parameter.** A live demonstration is strong evidence that a tool runs and weak evidence of its sensitivity, but v0.1 and v0.2 use one table for all parameters.

**F5. Running cost is counted twice.** Daily running cost is also inside five-year cost of ownership, and both are merit parameters (with small weights). The affordability axis does not double-count, because it builds layers instead.

**F6. Assessor judgement.** Magnitude levels are chosen against written anchors, so two assessors can disagree. There is no inter-rater protocol yet.

**F7. No calibration.** The framework has not been run against tools with known adoption outcomes, so a "Ready" here predicts nothing about real-world success.

## Defects found and fixed in v0.2

| Defect | Found by | Fix |
|---|---|---|
| When infrastructure inputs were missing, derived parameters reported their figure as NaN, and the page's check treated a null as finite. | `failure.test.js` | Figures are null when not computable; the page checks for a number. |
| A gate value inherited through the prototype of the tool object counted as documented, so a crafted object could pass the legal gates. | `adversarial.test.js`, A14 | The engine and cost bridge read only properties the assessor set. |
| A value of 1e308 in an infrastructure field overflowed to infinity. | `failure.test.js` | Plausibility ceilings; values above them are treated as missing and flagged. |
| Modality or certainty strings such as "constructor" matched built-in object properties. | `adversarial.test.js`, A15 | Lookups use own properties only. |

## What the test bed does not cover

- It cannot tell whether a placeholder is right; it can only show which placeholders matter.
- The property tests sample random tools; they do not prove a property for every possible tool.
- The browser check runs Chromium only. Firefox and Safari are expected to work because the page uses plain DOM and SVG, but they are not tested in CI.
- Nothing tests the clinical validity of the anchors. That needs clinicians, not code.
