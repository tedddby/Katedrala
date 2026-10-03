# high-fan-out

A queue worker (serverless handler) that fulfils paid orders. One class, `FulfillmentOrchestrator` in
`src/orchestrator.ts`, builds every collaborator in `create()` and runs the whole flow in `fulfill()`. The
flow covers fraud check, stock reservation, pricing, discounts, tax, payment, shipping, pick list, invoice,
ERP booking, loyalty points, notifications and audit. This is the classic "orchestrator that knows
everything" shape.

## Architecture

```text
src/main.ts                     handler(event): reads settings from the environment, calls the orchestrator
src/orchestrator.ts             FulfillmentOrchestrator -> 10 services + 10 adapters (all value imports)
src/services/   (10)            inventory, pricing, tax, discount, fraud, payment, shipping, invoice,
                                loyalty, notification. They depend only on adapter types (import type)
src/adapters/   (10 + 1)        stripe (SDK), paypal, dhl, ups, warehouse, erp, crm (shared HttpClient),
                                email (@sendgrid/mail), sms (twilio), audit (node:fs); http-client.ts
```

The orchestrator imports exactly 20 files (`src/adapters/*.adapter.ts` and `src/services/*.service.ts`).
Every one of them is a value import used in a `new` expression. It imports no other file and no external
package. `src/adapters/http-client.ts` is shared by six adapters, but the orchestrator does not import it.

## What it tests

- Fan-out (efferent coupling) at file level: the number of distinct files a file imports.
- Ranking: the orchestrator is far ahead. Three services tie for second place with 2 imports each, and every
  other file has at most 1.
- Martin instability of a coordinator: Ce = 20 and Ca = 1 (`src/main.ts`), so I = 20/21 = 0.952381.
- The count is the same with or without type-only imports. The orchestrator's imports are all value imports.
  The services' adapter imports are all `import type`, so excluding type-only edges lowers only the services'
  fan-out.
- Anomaly detection: a file with outlying fan-out that coordinates many units is a god-component candidate
  (responsibility concentration). It is small in lines but has a very high fan-out.
- Impact analysis: changing almost any adapter or service affects `src/orchestrator.ts` and, through it,
  `src/main.ts`.

## Expected conclusions

- Highest file fan-out: `src/orchestrator.ts` with 20 (10 in `src/adapters`, 10 in `src/services`).
- No other file has a fan-out above 2.
- Orchestrator fan-in 1, instability 0.952381.
- Highest fan-in: `src/adapters/http-client.ts` with 6.
- The graph is acyclic. Externals: `stripe`, `@sendgrid/mail`, `twilio`, `node:fs`.

## `expected.json` expectations

Fan-out is the number of distinct fixture files a file imports. Fan-in is the number of distinct fixture
files that import it. Externals are not counted.

| Key                                   | Meaning                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| `highestFanOut`, `fanOut`             | The file with the highest fan-out, and that fan-out.                           |
| `orchestratorDependencies`            | The 20 files `src/orchestrator.ts` imports.                                    |
| `orchestratorDependenciesByDirectory` | How many of them are in each directory.                                        |
| `orchestratorFanIn`                   | Fan-in of the orchestrator.                                                    |
| `orchestratorInstability`             | Martin instability Ce / (Ca + Ce) at file level, rounded to 6 decimals.        |
| `maxFanOutOfOtherFiles`               | Highest fan-out of any file other than the orchestrator.                       |
