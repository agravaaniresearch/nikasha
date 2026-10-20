# Nikasha

**Status: Working example on synthetic data. Not clinically or academically validated.**

> All weights and thresholds are placeholders pending a stakeholder panel. Nikasha has not been calibrated against real adoption outcomes. The three preloaded tools are fictional; no real company, product or patient data appears anywhere in this repository.

## What it is

Nikasha (Sanskrit *nikaṣa*, the touchstone used to test gold) is an open-source evaluation framework that scores clinical AI tools for readiness to enter healthcare practice. Version 0.1 covers CT and MRI diagnostic tools only. It is delivered as one self-contained browser page: the pipeline (choose or enter a tool and set its parameters) sits on the left, and a live scoring dashboard sits on the right. Every score on the dashboard shows the inputs and the rule that produced it.

The scoring runs in four steps, applied in order:

1. **Entry.** Only CT and MRI tools are scored. X-ray (and mammography, which is X-ray based) is rejected with a stated reason.
2. **Tier 1, legal gates.** Regulatory authorisation, data protection, intended use matching the deployment mode, and clinical accountability. Autonomous mode adds a gate for unsupervised reporting. "Unknown" counts as not met.
3. **Tier 2, clinical knockouts.** Sensitivity (false negatives) and specificity (false positives) in every mode, external validation from triage upwards, and post-deployment monitoring in autonomous mode. Failing one fails the tool on its own.
4. **Tier 3, compensatory weighted merit.** Fifteen parameters, each scored 0 to 3 against written anchors, discounted by an evidence certainty table, and weighted by one of four autonomy profiles. Merit is reported as a worst-case to best-case band and the verdict comes from an explicit decision table.

## Open it

Open `nikasha/index.html` in any modern browser. It needs no server, no internet connection and no install; it has no CDN links, web fonts or network calls, so it also survives being emailed.

## Run the demo and tests

Requires Node.js 18 or later (CI uses 22).

```bash
cd nikasha
npm run demo            # scores the three sample tools and prints a plain-English result
npm test                # scoring-logic tests and the drift/self-containment tests
node build.js --check   # confirms index.html matches src/ exactly
npm install && npx playwright install chromium
npm run check:browser   # opens index.html headless; fails on any console error or wrong verdict
```

The GitHub Actions workflow at `.github/workflows/nikasha.yml` runs all of the above on every push. A second workflow, `.github/workflows/nikasha-tag.yml`, creates the `nikasha-v0.1` tag on main after the tests pass (the build session's git proxy refused tag pushes, so tagging was moved into CI).

## Layout

| Path | What it holds |
|---|---|
| `src/engine.js` | The only copy of the scoring logic, tables, weights and thresholds |
| `src/samples.js` | The three fictional sample tools |
| `src/template.html` | Page layout, styles and UI code |
| `build.js` | Embeds `engine.js` and `samples.js` verbatim into `index.html` |
| `index.html` | The built tool (committed, so it opens straight from the repository) |
| `test/engine.test.js` | Tier order, knockouts, certainty discount, unsupported claims, autonomy profiles, band, X-ray rejection |
| `test/build.test.js` | Fails if the logic inside `index.html` differs by one byte from `src/`, or if the page loads anything external |
| `test/browser-check.js` | Headless Chromium check of the built page |
| `demo.js` | Plain-English demo |
| `notes/nikasha.md` | Design reasoning, decisions and open questions |

## Sample results (synthetic)

| Fictional tool | Modality, mode | Verdict | Why |
|---|---|---|---|
| Halvorine Bleed Reader | CT, advisory | Ready | Worst-case merit 76.1 against a bar of 60 |
| Pemberwick Prostate Lens | MRI, triage | Not ready: clinical knockout | Sensitivity rests on a vendor brochure, so its worst-case effective score is 0.3 against a minimum of 2.0 |
| Orrisfield Nodule Sieve | CT, triage | Conditional | Merit band 49.8 to 69.0 straddles the triage bar of 68; firmer evidence would decide it |

## Decisions made

Each decision below was made during the build without review. The reasoning is in `notes/nikasha.md`.

1. **One logic file, embedded at build time.** `src/engine.js` is the single source; `build.js` pastes it verbatim into `index.html` between BEGIN/END markers, and a test fails if the two copies differ. This meets the "no external dependencies" rule (no `<script src>`) without a hand-maintained copy.
2. **No runtime dependencies at all.** Tests use Node's built-in test runner. Playwright is a development dependency used only for the browser check.
3. **Certainty is a range, not a point.** Each evidence level has a low and a high multiplier. The worst case uses the low end and the best case the high end; this is what produces the merit band. Unsupported claims are fixed at 0 to 0.
4. **Certainty order.** Clinical use (0.90 to 1.00), peer-reviewed publication (0.75 to 0.95), live demonstration (0.55 to 0.80), preprint or arXiv (0.25 to 0.50), vendor document (0.10 to 0.30), unsupported (0). The three favoured types sit wholly above the other three, so a preprint can never outscore a journal paper.
5. **Knockouts use the worst case.** A binary fail should not depend on optimism, so a knockout compares the worst-case effective score with its minimum (inclusive).
6. **Unknown legal status fails.** A gate passes only if documented as met, consistent with "unsupported claims count as 0".
7. **Later tiers are still computed for display.** When a gate or knockout decides the verdict, merit is still shown, marked as information only. When entry fails, nothing else is computed because the tool is out of scope.
8. **Scrutiny rises with autonomy through three levers:** clinical weights rise, knockout minimums rise (and new knockouts switch on), and the readiness bar rises (55, 60, 68, 75). Tests check that no sample gets a better verdict at higher autonomy.
9. **Four-row merit decision.** After gates and knockouts: worst case at or above the bar is Ready; best case at or above but worst case below is Conditional; best case below is Not ready.
10. **Infrastructure parameters are derived where possible.** Electricity, carbon, storage and retrieval cost, daily running cost and five-year cost of ownership take their level from computed figures per study, with the bands shown in the tool. Their evidence certainty is still assessed, because the figures are only as good as their source.
11. **Normalised per study.** Cost and energy bands are per study so that a busy site is not penalised for volume.
12. **Carbon is operational only.** kWh per day times grid intensity where the compute runs. The samples assume 710 g CO2e per kWh as an illustrative Indian grid figure. Embodied hardware carbon is not counted.
13. **Edge scores above cloud, open source above closed.** On-site inference that survives an internet outage and keeps images in the hospital is level 3; open source under an OSI licence with weights is level 3.
14. **Currency is INR**, because the intended first context is Indian hospitals. All amounts are synthetic.
15. **Mammography and other non-CT/MRI modalities are also rejected at entry**, each with its own reason; mammography shares the X-ray reason.
16. **Licence.** The repository already had an MIT licence at the root (copyright holder "Abhishek"). The brief said to add one only if none existed, so it was left unchanged. Change the holder to "Agravaani Research" by hand if that is wanted.
17. **Palette.** Warm stone and paper neutrals with an oxblood accent; semantic colours are moss (ready), ochre (conditional) and brick (not ready). A test fails if any hex colour in the page reads as blue. System font stacks only.
18. **Source access carries zero weight in autonomous mode**, where the clinical parameters take the whole weight budget; it still scores in the other three modes.
19. **Edits are not saved.** Changes made in the page reset on reload; nothing is stored in the browser.

## Known limits

- Weights, knockout minimums, readiness bars, certainty multipliers and infrastructure bands are placeholders, not the output of a stakeholder panel.
- The framework has not been calibrated against real adoption outcomes, so a "Ready" here predicts nothing about real-world success.
- Magnitude levels are chosen by an assessor against written anchors, so two assessors can disagree; there is no inter-rater protocol yet.
- One certainty table is used for every parameter. A live demonstration is strong evidence that a tool runs, but weak evidence of its sensitivity; v0.1 does not distinguish these.
- Daily running cost is also part of five-year cost of ownership, so cost is partly counted twice (with small weights).
- Carbon excludes embodied emissions, cooling overhead and the network.
- Only one target finding per tool is assessed.
- The sample data are synthetic and were chosen to illustrate each verdict.
