# Landing-page follow-ups for milestone 5 (architectural inference)

For the site owner. Milestone 5 does not modify `site/` (plan 8.4). When `docs/ROADMAP.md` marks milestone 5
"Done", the statements below become untrue: the site would then understate (call a shipped stage planned),
never overstate, but the brief asks for honest status marks, so they should change together with the
roadmap. The list was taken from the working tree on 2026-10-09, while the promotion workflow was still
rewriting the page: re-check each file after the switch (some sections, and the whole lab, may have moved or
been deleted).

## What milestone 5 ships

So that the new wording claims exactly what exists:

- `analyzeArchitecture()` in `@katedrala/engine` (the library; the command line is still milestone 11, and npm
  packages are still planned for v1). It returns the structural sections plus `components`, `modules` and
  `layers`, and inferred roles in `files[].roles`.
- **Components**: derived from directories and package manifests (no judgement, no confidence).
- **Modules**: inferred (prior-anchored refinement: directories and file-name stems, overridden file by file
  by strict majorities of the dependency evidence), or declared in `katedrala.config.yaml` (exact).
- **Layers**: inferred from file-name roles and layer-named directories and ranked by the observed
  dependencies between them, or declared.
- Every inferred module and layer carries a confidence (a weighted sum, not a probability), its evidence and a
  reason that begins with "Inferred:"; every heuristic class names its rule and says "(Katedrala heuristic)".
- Still planned for v1: metrics (Gravity, Entropy), anomalies, rules, impact, diff, the CLI, git and CI
  integration, framework awareness, the CodeVerse adapter. The real CodeVerse data on the page
  (`CODEVERSE_ANALYSIS`, `site/data`, the film) comes from `analyzeStructure` and contains no modules.

## Statements to change

| File | Current text | Why it becomes untrue | Suggested change |
| --- | --- | --- | --- |
| `site/lib/site.ts` | `MILESTONES`: `{ name: "Architectural inference", state: "planned" }` (the file says "as docs/ROADMAP.md lists them. Update both together") | ROADMAP marks it Done | `state: "done"`. `OpenSource.tsx` then renders "5 of 15 milestones done, 1 in progress." and builds the gauge to milestone 5 by itself. |
| `site/components/sections/Architecture.tsx` | lede "Katedrala links files and symbols into one typed graph today; inferring the modules within it is planned for v1." | module inference is available | "Katedrala links files and symbols into one typed graph and infers the modules and layers within it, each with a confidence and its evidence." |
| same file | `<Status status="planned" label="Module inference, planned for v1" />` | as above | `<Status status="available" label="Module inference, available today" />` (the explorer still shows the demonstration system; say so if its modules are not real output) |
| same file | TSDoc: "grouping it into modules is inference, planned for v1" | as above | "grouping it into modules is inference, available today" |
| `site/components/sections/Pipeline.tsx` | the "Infer" pass: `status: "planned"`, text "Components will be derived from directories and packages; modules and layers will be inferred, each with a confidence and its evidence." | the pass runs today | `status: "available"`, present tense: "Components are derived from directories and packages; modules and layers are inferred, each with a confidence and its evidence." |
| same file | the pass's artifact (`module`, `members`, `layer`) comes from the demonstration system, and the footnote says "Infer, Analyze and Explain preview v1 on the demonstration system" | an available pass should show real output, like Parse and Link | Either show real output (re-run the analysis of CodeVerse with `analyzeArchitecture` and take the module and layer of the traced file into `lib/site.ts`), or keep the demonstration artifact and say "Infer runs today; its artifact here, like Analyze and Explain, comes from the demonstration system". The rule "no invented numbers" allows both. |
| same file | TSDoc: "Parse and Link run today ... Infer, Analyze and Explain are planned: open rings on dashed chains" (the hanging-chain drawing) | Infer runs today | "Parse, Link and Infer run today: solid weights on taut chains. Analyze and Explain are planned" (and draw the Infer weight solid). |
| `site/components/sections/Ecosystem.tsx` | Katedrala: "Files, symbols and relationships today; modules and measures next." | modules ship | "Files, symbols, relationships, modules and layers today; measures next." |
| same file | Architecture document: "Versioned JSON: the structure today, the full architecture in v1." | the document now holds components, modules and layers | "Versioned JSON: the structure and its modules and layers today; metrics and findings in v1." |
| `site/PRODUCT.md` | "Implemented today (milestones 1 to 4):" | milestone 5 is implemented | "Implemented today (milestones 1 to 5):" and a bullet: "Architectural inference (`analyzeArchitecture`): components derived from directories and packages; architectural roles; modules and layers inferred, each with a confidence, its evidence and a method string; declared modules and layers from `katedrala.config.yaml`." |
| same file | "Planned for v1 (milestones 5 to 15; ...): inference of components, modules and layers; metrics ..." | inference is no longer planned | "Planned for v1 (milestones 6 to 15; ...): metrics ...", without "inference of components, modules and layers". |
| `site/components/stage/copy/hanging.ts` (the film's plan beat) | "They are set out by directory. Directories are the boundaries Katedrala records today; modules are planned for v1." | modules are inferred today | The film's data is CodeVerse's structure document (`analyzeStructure`), which has no modules. Either: "They are set out by directory, the boundaries the structure analysis records; the modules Katedrala infers are not shown here." or regenerate the data with `analyzeArchitecture` and set the foundations out by module. |
| `site/components/stage/hang.ts` | TSDoc: "the boundaries Katedrala records today (modules are planned for v1, and the narration says so)" | as above | follow the narration's new wording |
| `site/components/stage/README.md` | "Honest labels": "Directories are the boundaries Katedrala records today; modules are planned for v1 (the narration says it at the plan beat)." | as above | follow the narration's new wording |
| `site/README.md` | "Launch gate. Deploy only after https://github.com/tedddby/Katedrala is public with milestones 1 to 4 on `main`." | the page will describe milestone 5 | "with milestones 1 to 5 on `main`" (`docs/ALGORITHMS.md`, which the new wording may link, exists only from milestone 5) |
| `site/app/layout.tsx` | metadata description: "... with the file and line behind every relationship. Boundaries, structural risk and change impact are planned for v1." | "Boundaries" reads as module boundaries, which are inferred today; boundary *rules* are milestone 8 | a judgement call: for example "... It infers modules and layers with their evidence today; structural risk, rules and change impact are planned for v1." |
| `site/app/lab/kit/page.tsx` | `<Status status="planned" label="Module inference, planned for v1" />` | as for Architecture | only if the lab still exists after the switch (the promotion plan deletes it) |

## Statements that stay true

- `Pipeline.tsx`: "each with a confidence and its evidence"; `PRODUCT.md`: "Inference is heuristic and says so";
  the root README: "every inferred grouping carries a confidence and the observations behind it". They hold
  because every attachment of a test or declaration to a module is explained by `attached-files` evidence,
  and every reason and heuristic description is worded as inference.
- `Developers.tsx`: "Today, `analyzeStructure` returns the document's structural sections." is still true;
  it can add "and `analyzeArchitecture` adds components, modules and layers". The `LIBRARY` snippet mirrors the
  root README's "Get started" script, which now also shows `analyzeArchitecture`.
- `Ecosystem.tsx`: "With Katedrala underneath, the city will show the architecture as well: inferred modules,
  ..." is about the CodeVerse adapter (milestone 14) and stays in the future tense.
- Gravity, Entropy, Impact, Rules, History, the command line and npm packages stay "Planned for v1".

## Coordination

The roadmap's "Done" for milestone 5 should land together with these changes. If they cannot land in the same
window, the roadmap still says "Done" and the milestone 5 report records this list as an open follow-up: the
page then understates for a while, and never overstates.
