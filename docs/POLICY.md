# Policy notes

Status: working example on synthetic data, for illustration only. These notes describe questions the framework raises; they are not legal advice and do not describe any existing programme.

## The gap Nikasha is built for

Regulation answers whether a tool may legally be sold. Procurement answers whether a hospital will buy it. Between the two sits a question nobody owns: whether the tool should enter practice at a particular site, in a particular role, at a particular price. Market maps of AI tools tend to sort them by regulatory status. Nikasha adds the layer above that: what should enter practice, as opposed to what can legally enter the market. It is meant to extend existing regulatory mapping, not to replace or criticise it.

## Who pays

Every Nikasha result carries a who-pays split (hospital, patient, insurer or government scheme, pooled consortium). The default puts 100% on the hospital, which is what happens in practice when nobody decides otherwise. The split is a policy choice, not a calculation, and it should be set explicitly before anyone quotes a cost.

The cost layers show why this matters. In every sample, compute and power are 3% to 11% of the bill. Reading time, validation, governance and the cost of errors are the rest. A policy that subsidises GPUs or cloud credits pays for the smallest line. A policy that funds shared validation, shared governance and measured error costs pays for the largest.

## What a hospital would need before using a framework like this

1. **A named clinical owner** for each assessed tool, who signs off the assessment and the weights it was scored under.
2. **Local figures for the deciding placeholders.** The driver analysis names them for each tool. In the samples they are reader sensitivity, the cost of a delayed finding and the share of positives a normal queue delays. A hospital can measure the first and third from its own audit data.
3. **Its own volume.** The derived scores and break-even are per study, so the vendor's volume figure must be replaced with the site's.
4. **The state tariff.** If Vyaya has no verified figure for the state, the result is flagged. Contributing the SERC tariff order figure to Vyaya fixes it for every user.

## What a regulator or public funder would need

1. **A stakeholder panel to set the weights.** Every weight, knockout minimum and readiness bar is a placeholder. Swing weighting with clinicians, radiographers, hospital finance, patients and a regulator present is the proposed method. Finding F1 in `docs/FAILURE-MODES.md` is the first question that panel has to settle.
2. **Calibration.** The framework should be run on several tools whose real adoption outcome is known before any verdict is treated as predictive.
3. **Pooled validation.** Local validation is one of the larger fixed costs. A consortium that validates once on pooled multi-site data and leaves a smaller local check to each site would cut it for everyone. Vyaya already models a pooled scenario for document extraction; the same logic applies here.
4. **Published failure data.** Two figures decide much of the cost and have no public source in India: accelerator failure rates and the downstream cost of a missed or delayed imaging finding. A public dataset of either would be a public good.

## Data protection and medical device law in India

The legal gates are written generically so that they work in any jurisdiction. In India the data protection gate refers to the Digital Personal Data Protection Act, 2023, and software intended for diagnosis falls under the Medical Devices Rules, 2017, administered by the Central Drugs Standard Control Organisation. A gate is met only when it is documented as met for the intended use and autonomy mode being assessed. An authorisation to assist a clinician is not an authorisation to report without one.

## Why India first, and how it travels

India makes the hard cases common: high volumes, few radiologists, uneven power prices, scarce validation budgets and a mix of public and private payers. A method that gives a defensible answer under those constraints will give one anywhere. Nothing Indian is in the code. Tariffs, grid carbon, cost defaults, currency and the wording of the legal gates are all data files with schemas. Porting Nikasha to another health system means replacing those files, re-running the test bed, and convening a local panel for the weights.

One known limit on portability: the currency is INR throughout. The contract carries a currency field, but the cost defaults do not yet. A port should add a currency to `data/cost_defaults.json` and convert the defaults, rather than relabel them.

## Open source as a policy choice

The framework and its code are open so that any hospital, regulator or vendor can check exactly how a verdict was reached and reproduce it. The schemas are the part that matters most. If the panel's weights and the hospital's figures are recorded against the same schemas, two implementations written by different people must reach the same verdict, and a disagreement can be traced to a number rather than to a black box.
