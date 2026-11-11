# Why the schema comes first

The code in this repository is short and could have been written by anyone. What took judgement is the shape of the record: what an assessor must write down about a tool, which rules turn that record into a verdict, and what a cost calculator must hand over so that a readiness framework can trust it. Those decisions live in the schemas and the data files they govern. The engine only applies them.

That has three consequences. First, a stakeholder panel changes Nikasha by editing `data/framework.json`, and the schema and tests check that the edit is coherent. Second, two independent implementations that read the same schema-valid assessment and the same framework file must reach the same verdict, so a disagreement always traces to a number. Third, Nikasha and Vyaya can evolve separately as long as both honour the cost-profile contract.

## The documents

| Document | Schema | Role |
|---|---|---|
| An assessment | `tool.schema.json` | The input. One tool, one target finding, one autonomy mode. |
| The framework | `framework.schema.json` | Every rule. Edited by the panel, never by the engine. |
| A cost profile | `cost-profile.schema.json` | The contract between a cost calculator and a readiness framework. Canonical here; Vyaya keeps an identical copy. |
| Cost defaults | `cost-defaults.schema.json` | What the cost model assumes when the assessor gives nothing, with provenance. |
| Grid carbon, sources, samples | `grid-carbon.schema.json`, `sources.schema.json`, `samples.schema.json` | Supporting data. The source schema refuses Wikipedia and plain http. |

## Rules a schema cannot express

JSON Schema cannot check that weights sum to 100 or that a knockout never loosens as autonomy rises. Those rules are enforced in `test/schema.test.js`, and they are as much part of the contract as the schemas:

- Each weight profile covers exactly the framework's parameters and sums to 100.
- Derived parameters and band cuts match one to one, and the cuts ascend.
- Knockouts name clinical parameters and never loosen, or switch off, at higher autonomy.
- Readiness bars rise with autonomy.
- In the certainty table, clinical use, peer review and live demonstration sit wholly above preprints, vendor documents and unsupported claims, so a preprint can never outscore a journal paper.
- Only CT and MRI are in scope, and every out-of-scope modality states why.
- Every cost default lies inside its own range and cites a known source.
- No cost input is defined both here and in Vyaya.

## Two vocabularies for evidence, and how they meet

Nikasha grades claims about a tool by certainty: clinical use, peer-reviewed publication, live demonstration, preprint, vendor document, unsupported. Vyaya labels input values by provenance: statutory, secondary, placeholder, illustrative, user. They answer different questions. Certainty says how far to trust a claim the vendor makes about the tool. Provenance says how far to trust a number the calculator assumes about the world. Nikasha uses certainty for readiness and provenance for affordability, and every cost profile lists the provenance of every input it used. The two are never mixed in one score.

## Versioning

- `data/framework.json` carries the framework version in `meta.version`. Any change to a rule is a new version and a changelog entry.
- The cost-profile contract carries `contractVersion` (semantic versioning). Consumers accept any minor version of the same major version and refuse a different major version. Adding an optional field is a minor change; removing or renaming one, or changing a unit, is a major change.
- Vyaya is pinned by commit in `vendor/vyaya/VYAYA.json`, with a hash for every vendored file.

## Changing the framework

1. Edit `data/framework.json`.
2. Run `npm test`. The schema and cross-document tests catch an incoherent edit; the golden parity tests fail on purpose, because verdicts changed.
3. Have the clinical owner review the new verdicts for the samples and for any real assessments on file.
4. Regenerate `test/fixtures/golden-v0.1.json` (rename it for the new version), bump `meta.version`, rebuild, and record the change and its reason in `CHANGELOG.md`.
