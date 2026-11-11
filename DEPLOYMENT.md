# Deploying Nikasha

This file is for the engineer who has to put Nikasha in front of users, keep its data current and prove that it still works. It assumes no knowledge of the clinical side. Read the status notice in the README first: this is a working example on synthetic data, for illustration only.

## What you are deploying

Nikasha is one static HTML file, `index.html`, of about 175 KB. All logic and data are embedded in it at build time. It has no backend, no database, no API keys, no telemetry, no cookies and no network calls; a test fails the build if any of those appear. Anything a user types stays in their browser tab and is lost on reload.

| Need | Requirement |
|---|---|
| To serve the page | Any static file host, or none at all (open the file directly) |
| To use the page | Any current browser: Chrome, Edge, Firefox or Safari from the last two years |
| To build and test | Node.js 18 or later (CI uses 22), npm, and git |
| To run the browser check | Playwright's Chromium (about 110 MB, downloaded once) |
| Runtime dependencies | None |
| Development dependencies | `ajv` (schema validation in tests) and `playwright` (headless check), pinned in `package-lock.json` |

## Five-minute deployment

### Option A: GitHub Pages (recommended)

1. In the repository, open Settings, then Pages.
2. Under Build and deployment, choose "Deploy from a branch", branch `main`, folder `/ (root)`, and save.
3. Wait for the first Pages build (about a minute). The page is then at `https://agravaaniresearch.github.io/nikasha/`.

No build step runs on Pages, because `index.html` is committed already built. The `.nojekyll` file stops Pages from running Jekyll over the repository.

### Option B: any static host or an intranet

Copy `index.html` to the web root of any server (nginx, Apache, IIS, S3, an intranet share). Serve it with `Content-Type: text/html; charset=utf-8`. It needs no other file. A suitable Content Security Policy is:

```
Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'
```

The page has no external script, so `'unsafe-inline'` is the only script source it needs, and `connect-src` can stay at `'none'`.

### Option C: no server at all

Email or copy `index.html` and open it from disk. This is how it is meant to reach people without IT support.

## Build, test and verify

```bash
git clone https://github.com/agravaaniresearch/nikasha
cd nikasha
npm ci                          # exact dev dependencies from the lockfile
npx playwright install chromium # once per machine; add --with-deps on a bare Linux box
npm run verify                  # build check, 191 tests, demo, headless browser check
```

`npm run verify` runs, in order:

| Step | Command | Fails when |
|---|---|---|
| Build check | `node build.js --check` | `index.html` differs from what `src/`, `data/` and `vendor/` would produce |
| Test bed | `npm test` | Any of the 191 tests fails (see the README for the suites) |
| Demo | `npm run demo` | The engine throws on the sample tools |
| Browser check | `npm run check:browser` | Any console error, any network request, or any verdict on the page that differs from the engine |

Expected result: every step prints a pass line and the command exits 0. On a laptop the whole run takes about a minute. The property tests use 1,500 random tools; set `NIKASHA_PROPERTY_RUNS=10000` for a deeper run before a release.

Other commands:

| Command | Use |
|---|---|
| `npm run build` | Rebuild `index.html` after any change to `src/`, `data/` or `vendor/` |
| `npm run test:coverage` | Line, branch and function coverage of `src/` |
| `npm run screenshots` | Re-take `docs/img/*.png` for the README |
| `npm run serve` | Serve the folder at http://localhost:8080 |
| `node demo.js --json` | Full evaluation records as JSON, for integration work |

## Continuous integration

`.github/workflows/ci.yml` runs `npm run verify` on every push and pull request with Node 22 on Ubuntu. `.github/workflows/tag.yml` creates the release tag named in `package.json` (for example `nikasha-v0.2.0`) on `main` after CI passes, and does nothing if the tag already exists. Protect `main` so that a red CI run cannot be merged.

## Changing things safely

Every change follows the same loop: edit, `npm run build`, `npm run verify`, commit both the source and the rebuilt `index.html`.

| You want to change | Edit | Notes |
|---|---|---|
| A weight, threshold, anchor, knockout or certainty multiplier | `data/framework.json` | Do not edit `src/engine.js` for this. The schema and the cross-document tests will tell you if the change breaks a rule (weights must sum to 100 per mode, knockouts may not loosen with autonomy). The golden test will fail on purpose: regenerate `test/fixtures/golden-v0.1.json` only after the clinical owner has approved the new verdicts, and record the change in `CHANGELOG.md`. |
| A cost default | `data/cost_defaults.json` | Give the value, range, provenance status, at least one source id and a reason. |
| The grid carbon figure | `data/grid_carbon.json` | Cite the CEA CO2 Baseline Database version and the year. |
| A state electricity tariff, hardware life, GPU failure rate or PUE | Vyaya, not here | These are held once, in Vyaya. Correct them there, then re-vendor (below). |
| A sample tool | `data/samples.json` | Keep `fictional: true` and invented names. The schema refuses a sample that is not flagged fictional. |
| Page layout or wording | `src/template.html` | The build test fails if any colour in the page reads as blue. |

### Re-vendoring Vyaya

Nikasha uses a pinned copy of Vyaya so that a change there can never alter a result here silently.

```bash
# from a checkout of agravaaniresearch/vyaya at the commit you want
cp js/engine.js data/electricity_tariffs.json data/assumptions.json data/sources.json LICENSE ../nikasha/vendor/vyaya/
cp schema/cost-profile.schema.json ../nikasha/vendor/vyaya/   # once Vyaya carries the contract
cd ../nikasha
# update vendor/vyaya/VYAYA.json: commit, engineVersion, copiedOn, and each file's sha256
node -e "const c=require('crypto'),fs=require('fs');for(const f of fs.readdirSync('vendor/vyaya'))if(f!=='VYAYA.json')console.log(f,c.createHash('sha256').update(fs.readFileSync('vendor/vyaya/'+f)).digest('hex'))"
npm run build && npm run verify
```

The contract tests fail until `VYAYA.json` matches the copied files, and they fail if Vyaya's copy of the contract schema differs from Nikasha's. Regenerate `test/fixtures/vyaya-profile.json` from the new Vyaya engine with its `toCostProfile()` after re-vendoring.

## Embedding the engine elsewhere

The engine runs unchanged in Node and in any browser.

```js
const Nikasha = require('./src/engine.js');           // also loads src/cost.js and the data
const result = Nikasha.evaluate(tool);                 // tool: a document valid against schema/tool.schema.json
result.decision.verdict;                               // READY | CONDITIONAL | NOT_READY | REJECTED
result.affordability.verdict;                          // SAVES | EVIDENCE_DEPENDENT | COSTS_MORE | INDETERMINATE
result.costProfile;                                    // valid against schema/cost-profile.schema.json
```

Validate the input against `schema/tool.schema.json` before calling `evaluate`. The engine never throws and treats bad input as missing evidence, but a validator gives the user a useful error instead of a low score. To accept a cost profile from Vyaya or another calculator, set `tool.costProfile`; Nikasha checks the contract version and unit and reports any problem in `result.profileProblems`.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `index.html is out of date` | You changed a source file without rebuilding. Run `npm run build` and commit `index.html`. |
| `vendored ... differs from the pinned copy` | A file in `vendor/vyaya/` was edited or re-copied without updating `VYAYA.json`. Re-vendor properly. |
| Golden parity tests fail after a framework edit | Intended when rules change. Have the change approved, then regenerate the golden fixture and record it in the changelog. |
| `browserType.launch: Executable doesn't exist` | Run `npx playwright install chromium` (with `--with-deps` on a fresh Linux machine). |
| Page shows "No verified landed tariff for <state>" | Vyaya has no SERC-sourced figure for that state yet. Contribute it to Vyaya. |
| The page is blank when opened from an email client preview | Some previews block scripts. Save the file and open it in a browser. |

## Security and privacy notes

- The page makes no network requests; the browser check fails if it makes any.
- It stores nothing: no cookies, no local storage. Closing the tab discards all input.
- No patient data is needed or accepted. The inputs describe a tool, not a patient.
- The engine reads only properties the assessor actually set, never values inherited through an object's prototype (adversarial test A14).
- Treat any real assessment typed into the page as confidential to the vendor until the vendor agrees otherwise, and do not commit real assessments to a public fork.
