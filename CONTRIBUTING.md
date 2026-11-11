# Contributing

Nikasha is a working example on synthetic data. Contributions that make its data more honest are the most useful.

- **Corrections to defaults** go in `data/cost_defaults.json` or `data/grid_carbon.json`, with a source in `data/sources.json`. Every source needs an https link and a note on how it was read. Wikipedia is not accepted.
- **State tariffs, hardware life, GPU failure rates and PUE** belong in [Vyaya](https://github.com/agravaaniresearch/vyaya), which Nikasha vendors. Correct them there.
- **Changes to weights, thresholds or anchors** go in `data/framework.json` and need a stated clinical reason. The golden parity tests will fail on purpose; see `docs/SCHEMA.md` for the review steps.
- **Sample tools** must stay fictional, with invented names and synthetic figures.
- Run `npm run verify` before opening a pull request and commit the rebuilt `index.html`.
