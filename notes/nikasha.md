# Nikasha design notes

Status: Working example on synthetic data. Not clinically or academically validated. Weights and thresholds are placeholders pending a stakeholder panel; nothing has been calibrated against real adoption outcomes.

These notes explain why each rule exists, record the decisions taken during the v0.1 build, and list what is still open.

## The problem the design answers

A hospital deciding whether to bring a CT or MRI AI tool into practice faces three different kinds of question, and they should not be traded off against each other. Some questions are permissions (is it legal to use this here?). Some are safety floors (does it miss too much, or raise too many false alarms, to be safe in this role?). Only the rest are genuine trade-offs (integration, cost, energy, openness, update discipline). A single weighted average blends all three, so a cheap, well-integrated tool can buy its way past a dangerous miss rate. Nikasha separates them into ordered tiers so that cannot happen.

## Why each rule exists

**Entry scope (CT and MRI only).** The magnitude anchors for sensitivity and specificity are written for cross-sectional reads. Plain radiographs have different lesion conspicuity, reference standards and error profiles, so the same anchors would produce numbers that look comparable and are not. Rejecting X-ray at entry, with the reason shown, is more honest than scoring it badly. Mammography is X-ray based and is rejected for the same reason.

**Tier 1, legal gates first.** A tool that cannot lawfully be used has no readiness, however good it is. Gates are pass or fail and are not weighted. "Unknown" fails, because a legal status nobody has documented is an unsupported claim. The autonomous mode adds a gate for unsupervised reporting, because authorisation to assist a clinician does not imply authorisation to replace one.

**Tier 2, clinical knockouts second.** False negatives and false positives are the two ways a diagnostic tool harms patients directly: missed disease, and unnecessary workup, anxiety and workload. Each is a knockout in every mode. External validation becomes a knockout from triage upwards, because a triage or autonomous tool changes what happens to patients before a clinician looks, so internal results are not enough. Post-deployment monitoring becomes a knockout for autonomous use, because with no clinician read there is no other way to catch drift.

Knockouts compare the worst-case effective score with the minimum. A pass or fail cannot be a range, and a safety floor should not depend on optimistic reading of weak evidence. The comparison is inclusive at the threshold.

**Tier 3, compensatory merit last.** Only once a tool is lawful and above the safety floors is it fair to let strengths offset weaknesses. Merit is the weighted sum of effective scores divided by the maximum possible, on a 0 to 100 scale.

**Magnitude on written anchors.** Each parameter has four written levels so that a score points to a sentence, not a feeling. The sensitivity and specificity anchors include confidence-interval bounds and false positives per 100 studies, because a point estimate from a small study is not the same claim as a narrow interval.

**Certainty discount.** A strong claim with weak evidence is a weak claim. Effective score is magnitude times a multiplier from the published certainty table, which is shown inside the tool. The multiplier is a range: the low end feeds the worst case, the high end the best case. That range is what makes the merit a band rather than a single number. Unsupported claims are fixed at zero in both cases, so an assessor cannot score a claim nobody has evidenced.

**Evidence ordering.** The brief asked that peer-reviewed publication, live demonstration and actual clinical use score higher. The table places all three wholly above preprints, vendor documents and unsupported claims, so even the worst reading of a favoured type beats the best reading of an unfavoured one. Preprints and arXiv are deliberately not treated as peer review. Clinical use ranks highest because it is the only evidence produced in the conditions the tool will actually face.

**Autonomy profiles.** The same tool carries different risk in different roles. Scrutiny rises with autonomy through three levers at once: clinical weights grow (sensitivity weight goes 8, 14, 18, 20 from administrative to autonomous), knockout minimums grow and new knockouts switch on, and the readiness bar rises (55, 60, 68, 75). Infrastructure and cost weights fall correspondingly, since they matter less once patient safety dominates. The tool shows the same tool's verdict under all four modes side by side so this is visible.

**Band and decision table.** Reporting merit as a band keeps evidence uncertainty in view instead of hiding it inside one number. The decision table turns the band into a verdict: a worst case above the bar is Ready; a band that straddles the bar is Conditional, meaning firmer evidence would settle it; a best case below the bar is Not ready. All six decision rows are shown in the tool with the matching row highlighted.

**Infrastructure and sustainability.** Electricity, carbon, storage and retrieval, daily running cost and five-year cost of ownership are computed from stated inputs, normalised per study, and banded. Deriving them removes one source of assessor judgement and lets the dashboard show the actual figures, with carbon displayed prominently. Their certainty is still assessed, because an energy figure from a vendor slide is weaker than one metered in clinical use. Deployment favours edge (on-site) inference because it keeps images inside the hospital and keeps working through an internet outage. Update process rewards site-controlled, versioned updates with local re-validation and rollback, because a silently updated model is a different, unvalidated device. Open source scores highest for code and algorithm access because it allows independent audit.

## Decisions taken during the build

1. Logic lives once in `src/engine.js`; `build.js` embeds it verbatim into `index.html` and a test fails on any difference.
2. No runtime dependencies; Node's built-in test runner; Playwright only for the headless check.
3. Certainty multipliers as ranges: clinical use 0.90 to 1.00, peer reviewed 0.75 to 0.95, live demo 0.55 to 0.80, preprint 0.25 to 0.50, vendor document 0.10 to 0.30, unsupported 0.
4. Knockouts on worst case, inclusive.
5. Unknown gate status fails.
6. When a gate or knockout decides, later tiers are still computed and labelled information only; when entry fails, nothing else is computed.
7. Readiness bars 55, 60, 68, 75 by mode.
8. Infrastructure bands per study: energy 20, 60, 150 Wh; emissions 15, 45, 110 g CO2e; running cost INR 25, 60, 120; storage and retrieval INR 2, 6, 15; five-year cost of ownership INR 80, 180, 350 (at or below each cut earns levels 3, 2 and 1).
9. Carbon is operational only, using grid intensity where compute runs; samples assume 710 g CO2e per kWh as an illustrative figure.
10. Currency INR; all amounts synthetic.
11. Source access carries zero weight in autonomous mode, where clinical weights take the whole budget; it still scores in the other three modes.
12. Existing root MIT licence (holder "Abhishek") left unchanged, since the brief said to add one only if none existed.
13. Sample tools were tuned so that each illustrates one verdict; their figures mean nothing outside that purpose.

## Open questions

- Who sits on the stakeholder panel that replaces the placeholder weights, and what method (for example, swing weighting or discrete choice) do they use?
- How should Nikasha be calibrated against real adoption outcomes, and what counts as a successful adoption?
- Should certainty depend on the parameter? A live demonstration says a lot about workflow integration and little about sensitivity.
- Should magnitude anchors be finding-specific? Acceptable sensitivity for a haemorrhage detector may differ from that for a nodule detector.
- How should assessors be trained, and what inter-rater agreement is acceptable?
- Should embodied hardware carbon, cooling overhead and data transfer be counted?
- How should a tool that covers several findings be scored: per finding, or by its weakest finding?
- Is per-study normalisation fair to low-volume sites with fixed hardware costs?
- Daily running cost is part of five-year cost of ownership; should one of them be dropped to remove the overlap?
- Which regulatory regimes should the legal gates name explicitly beyond the generic wording used now?
