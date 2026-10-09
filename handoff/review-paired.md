
# claims-audit

Checked: Read every site source file (app/layout.tsx, app/page.tsx, components/**, lib/site.ts, lib/demo/*.ts, lib/text.ts) and the brief. Rendered http://localhost:3100/ in Edge at 1440 px (Playwright, reduced motion; scripts in scratchpad/review-claims) and extracted each section's text, the metadata, all 31 links and the aria labels. Also extracted every interactive state: 5 gravity choices, 6 entropy commits, 15 impact targets, 5 command tabs, 16 explorer members and the module view, and 24 hero joints. Spot-checked the mobile-developers and desktop-rules captures. Site sources did not change during the review.

Ground truth used: README.md, docs/ARCHITECTURE.md, docs/IR.md, docs/ROADMAP.md, CONTRIBUTING.md and LICENSE; packages/{engine,ir,linker,core,adapter-typescript,model}/src; packages/ir/schema; fixtures/dependency-violations; the CodeVerse README and source at local HEAD 6b942bc (also origin/main); and the draft metrics design in the scratchpad.

Checks run:
- Type-checked the analyze.ts snippet against the engine source with tsc 6.0.3 and the katedrala-source condition: exit 0, and the property names are correct.
- Recomputed the REAL_EDGE id hash: it matches, the edge is verbatim in the stored CodeVerse run, and lines 219:17 and 273:19 hold graphCacheKey calls.
- Validated the stored CodeVerse document with Ajv against architecture.schema.json.
- Probed the GitHub and CodeVerse URLs.

Verified accurate:
- Command names and `--fail-on` match IR.md and ROADMAP milestones 11–12.
- The rules YAML matches the fixture syntax.
- MILESTONES names match ROADMAP 1–15 (states 2–4 are intended).
- Every repository link target exists locally and is tracked.
- Demo numbers are internally consistent: 16 members on 8 levels, 8 modules on 6, 23 dependencies with 16 crossing, and the gravity terms add up.
- Citations are bibliographically correct.
- No stars, users or benchmarks appear.
- The no-network, no-LLM and determinism claims hold.

## A1 — CONFIRMED (critical) — open-source
- File: site/lib/site.ts
- Problem: The page says Katedrala is developed in public: 'Katedrala is MIT licensed and developed in public', 'Read every line of it', 'being built in public toward v1' and 'The engine runs today ... from a clone of the repository'. It sends 17 links to github.com/tedddby/Katedrala (nav GitHub and Get started, the three 'View on GitHub' buttons, Contribute, roadmap, the final Get started, and every footer project and documentation link), and that repository is not reachable. The code behind every 'Available today' mark except the IR (engine, linker, extraction, model, graph, fixtures, tests) is also uncommitted, so pushing HEAD today would publish only Milestone 1.
- Evidence: HTTP GET https://github.com/tedddby/Katedrala returns 404 (curl and WebFetch); github.com/tedddby/CodeVerse and codeverse.awab.tech return 200. .git/config has no [remote] section and .git/refs/remotes does not exist. HEAD is '04a4dea Milestone 1'. The session git status shows '?? packages/engine/', '?? packages/linker/', '?? packages/core/src/{cache,config,discovery,extraction,project,sources,text,util}/', '?? packages/graph/src/', '?? packages/model/src/model.ts', '?? fixtures/' and '?? tests/'. The link targets themselves exist and are tracked on local main: README.md, docs/IR.md, docs/ROADMAP.md, docs/ARCHITECTURE.md, CONTRIBUTING.md, LICENSE and docs/.
- Reviewer fix: Launch gate: commit milestones 2–4 and push main to a public github.com/tedddby/Katedrala before the page goes live; all 17 targets then resolve. If the page must ship first, make these copy changes and hide every LINKS.repository-based link until the URL returns 200:
- OpenSource.tsx lede: 'Katedrala is MIT licensed and will be developed in public. The engine, the document contract, the design decisions and the roadmap live in its repository.'
- FinalCta.tsx lede: 'Katedrala is open source and being built toward v1.'
- Developers.tsx note: 'The engine runs today as a TypeScript library; the repository opens before v1 and npm packages ship with v1.'
- Verifier: Confirmed, as a launch blocker rather than a code defect. curl returns 404 for https://github.com/tedddby/Katedrala, for /blob/main/docs/ROADMAP.md and for api.github.com/repos/tedddby/Katedrala. github.com/tedddby/CodeVerse and codeverse.awab.tech return 200. .git/config has no [remote] section, .git/refs holds only heads and tags, and HEAD is 04a4dea (Milestone 1). The session git status shows the engine, linker, graph/src, core/src/*, model.ts, fixtures and tests as untracked. The live DOM has 17 anchors built from LINKS.repository: desktop and mobile GitHub, desktop and mobile Get started, three View on GitHub, Contribute, roadmap, the final Get started and 7 footer links. The URL is the one the user gave: site/PRODUCT.md:80 says 'given by the user; may not be public yet'. So the copy becomes correct once the repo is public. Nothing gates the deploy, though: the Deploy section of site/README.md has no prerequisite. Also, the 'From the roadmap in the repository' link points to a docs/ROADMAP.md that still says M2–M4 are Planned, while the page shows them In progress.
- Verified fix: Treat this as a launch gate. Do not rewrite the copy permanently.
1. Commit M2–M4 (packages, fixtures, tests) and the site.
2. Update docs/ROADMAP.md so its states match MILESTONES.
3. Publish main at github.com/tedddby/Katedrala. This is the user's action; the charter says never push.
4. Add to the Deploy section of site/README.md: 'Deploy only after https://github.com/tedddby/Katedrala is public with milestones 2–4 on main; every link built from LINKS.repository must return 200.' Optionally add site/scripts/check-links.mjs, which sends a HEAD request to every LINKS value and exits non-zero on anything but 200.

Only if the page must go live before the repo is public:
- OpenSource.tsx lede: 'Katedrala is MIT licensed and will be developed in public. The engine, the document contract, the design decisions and the roadmap live in its repository.'
- FinalCta.tsx lede: 'Katedrala is open source and being built toward v1. Start with the README, follow the roadmap, or help build it.'
- Hide every link derived from LINKS.repository until it resolves.

## A2 — CONFIRMED (major) — developers
- File: site/components/sections/Developers.tsx
- Problem: 'Versioned schemas — Available today — Every document Katedrala writes validates against a published JSON Schema, so tools can rely on its shape' is false today. The same claim appears in Ecosystem: 'Your tools: Read the document, validated by its schema' and the chain step 'Architecture document: One versioned JSON document, one schema', both marked Available today. Katedrala writes no documents yet because there is no CLI. analyzeStructure returns a StructureDocument without `kind` and eight other required sections, so its output fails the published schema. That includes the CodeVerse document this page cites as real output. It validates only after being merged into emptyDocument(). Each document kind also has two schemas (consumer and strict), not one.
- Evidence: packages/engine/src/structure.ts:121-137: `StructureDocument = Pick<ArchitectureDocument, 'schemaVersion'|'generator'|'repository'|'snapshot'|'detail'|'limits'|'directories'|'packages'|'files'|'symbols'|'externals'|'edges'|'entryPoints'|'diagnostics'>`. The `required` list of packages/ir/schema/architecture.schema.json includes kind, components, modules, layers, endpoints, metrics, anomalies, violations and rules. Ajv2020 on the stored real CodeVerse run (%TEMP%/codeverse-structure.json, commit 6b942bc, generator 0.1.0) gives valid=false with 9 errors 'must have required property kind|components|modules|layers|endpoints|metrics|anomalies|violations|rules'; `{...emptyDocument(), ...doc}` gives valid=true. packages/engine/src/structure.test.ts:67-69 wraps the output in emptyDocument() before the strict-schema test (:113-117). ADR-004b in docs/ARCHITECTURE.md specifies two schemas per kind.
- Reviewer fix: - Developers.tsx 'Versioned schemas' text: 'The document contract is versioned and published as JSON Schema. The structure Katedrala extracts today validates against it inside a document (emptyDocument() from @katedrala/ir); the v1 command line writes complete documents.'
- Ecosystem.tsx TOOLS 'Your tools' text: 'Build on the versioned document contract and its published schemas.'
- Ecosystem.tsx CHAIN 'Architecture document' text: 'One versioned JSON document: the structure today, the full architecture in v1.'
- Verifier: Confirmed. StructureDocument (engine/src/structure.ts:121-137) is a Pick that has no kind, components, modules, layers, endpoints, metrics, anomalies, violations or rules. ArchitectureDocument.required in the schema lists all nine. I ran Ajv2020 (the repo's ajv 8.20 with ajv-formats) on %TEMP%/codeverse-structure.json. Against both architecture.schema.json and architecture.strict.schema.json it gives valid=false with exactly those 9 'must have required property' errors. {...emptyDocument(), ...doc} validates against both. structure.test.ts (asDocument) wraps the output the same way before its strict-schema test. The engine exports only analyzeStructure, so nothing produces a complete document. Yet three items are marked Available today: 'Every document Katedrala writes validates…', 'Your tools: Read the document, validated by its schema' and 'One versioned JSON document, one schema'. The page's own analyze.ts calls the result `document`. ADR-004b also publishes two schemas per kind. I downgraded this from critical: the schemas really are published and versioned, and the extracted sections validate once wrapped.
- Verified fix: - Developers.tsx, GUARANTEES 'Versioned schemas' text: 'The document format is versioned and published as JSON Schema. Today's structure output fills its structural sections; complete documents arrive with the v1 command line.' Keep the status as available.
- Ecosystem.tsx, TOOLS 'Your tools' text: 'Build on the versioned document contract and its published schemas.'
- Ecosystem.tsx, CHAIN 'Architecture document' text: 'One versioned JSON document: its structural sections today, the full architecture in v1.'

## B1 — CONFIRMED (major) — global
- File: site/app/layout.tsx
- Problem: The meta description, which search results and link previews show without any status mark, says in the present tense that Katedrala reconstructs boundaries, structural risk and the impact of change, 'with evidence for every conclusion'. Today it extracts files, symbols and typed dependencies. Boundaries (milestone 5), structural risk (milestone 7) and impact (milestone 9) are all planned.
- Evidence: layout.tsx:22-23: 'Katedrala is an open-source engine that reconstructs software architecture from source code: dependencies, boundaries, structural risk and the impact of change, with evidence for every conclusion.' docs/ROADMAP.md rows 5, 7 and 9 are 'Planned'. The page's own Ecosystem chain says 'Files, symbols and relationships today; modules and measures next.'
- Reviewer fix: description: 'Katedrala is an open-source engine that reconstructs the architecture of TypeScript and JavaScript code. Today: every dependency, with the line of code it came from. Next: boundaries, structural risk and the impact of change.'
- Verifier: Confirmed in the rendered meta description (layout.tsx:22-23). It names boundaries (M5), structural risk (M7) and the impact of change (M9), all Planned in docs/ROADMAP.md. It also promises 'evidence for every conclusion', while the page marks Explain as in development. All of this is in the present tense with no status. The page has no og: tags, so search results and link previews show exactly this text. The README uses similar wording but adds a Status line; the description has none.
- Verified fix: layout.tsx description: 'Katedrala is an open-source engine that maps the dependency structure of TypeScript and JavaScript code, with the file and line behind every relationship. Boundaries, structural risk and change impact are being built for v1.' Avoid the reviewer's 'every dependency' wording, which repeats B2's overclaim. Every edge in the real run carries a file and line, so this sentence holds.

## B2 — CONFIRMED (major) — how-it-works
- File: site/components/sections/Pipeline.tsx
- Problem: The Link card, marked Available today, says 'Every import and reference resolves to the declaration it names'. Katedrala documents that some references are not resolved: they are counted, not guessed. Imports of packages resolve to externals, not to declarations. Katedrala's own CodeVerse run, the page's real example, left 155 unresolved and 2,265 untyped references. The analyze transcript shows only 'unresolved imports 0', which reinforces the overclaim.
- Evidence: Pipeline.tsx:30. docs/ARCHITECTURE.md:127-129 says references that cannot be bound are counted in unresolvedReferences and untypedReferences, and :303-304 says 'member calls on values of unknown type are not resolved (and are counted, not guessed)'. packages/ir/src/types/structure.ts:79-92 defines those counters. Stats of the stored CodeVerse run: {"unresolvedImports":0,"unresolvedReferences":155,"untypedReferences":2265,"edges":14232}.
- Reviewer fix: Pipeline.tsx:30 text: 'Imports and references resolve to the declarations they name, through tsconfig paths, workspaces and package exports. What cannot be resolved is counted, never guessed.' At the CodeVerse re-run, add unresolvedReferences and untypedReferences to CODEVERSE_ANALYSIS and print them as two more rows in commands.ts analyze().
- Verifier: Confirmed. The Link card is marked Available today and says 'Every import and reference resolves to the declaration it names' (Pipeline.tsx:30). The stored CodeVerse run has unresolvedImports 0, unresolvedReferences 155 and untypedReferences 2265. The doc comment in ir/types/structure.ts says relationships through untyped references 'are missing from the document'. The ARCHITECTURE.md non-goals say member calls on values of unknown type are not resolved: they are counted, not guessed. Package imports resolve to external entities (status 'external', ext:npm:…), not to declarations. The analyze transcript shows only 'unresolved imports 0'.
- Verified fix: Pipeline.tsx:30 text: 'Imports resolve to files and packages through tsconfig paths, workspaces and package exports, and references bind to the declarations they name. What cannot be bound is counted, never guessed.'

Optional, with values refreshed at the planned CodeVerse re-run: add `unresolvedReferences: 155, untypedReferences: 2265` to CODEVERSE_ANALYSIS. Then add the rows ["unresolved references", a.unresolvedReferences] and ["untyped references", a.untypedReferences] after 'unresolved imports' in commands.ts analyze().

## B3 — CONFIRMED (major) — developers
- File: site/lib/demo/commands.ts
- Problem: The 'real counts' analyze transcript prints CODEVERSE_ANALYSIS.externals (59) as 'external packages 59'. RepositoryStats.externals counts every external entity: packages, Node built-ins, environment variables and services. In the real run only 39 of the 59 are packages.
- Evidence: commands.ts:49 `["external packages", a.externals]`. packages/linker/src/externals.ts:2: 'External entities (packages, built-ins, environment variables, services)'. packages/linker/src/link.ts:361: `externals: externalEntities.length`. The stored CodeVerse run has externals by kind {"package":39,"environment-variable":12,"builtin":8}, for example ext:env:GITHUB_TOKEN and ext:node:crypto.
- Reviewer fix: commands.ts:49: `["externals", a.externals, `${a.externalPackages} packages`]`, with externalPackages: 39 added to CODEVERSE_ANALYSIS and refreshed at the re-run. At minimum, relabel the row 'externals'.
- Verifier: Confirmed. commands.ts:49 prints a.externals (59) as 'external packages'. The stored run's externals break down as package 39, environment-variable 12 (for example ext:env:GITHUB_TOKEN) and builtin 8 (for example ext:node:crypto). linker/src/externals.ts:2 and link.ts:361 count every external entity. The row sits in the default tab, under the header 'real counts', which is the page's main proof of real output. Anyone checking CodeVerse's dependencies would find 39 packages, not 59.
- Verified fix: - site.ts CODEVERSE_ANALYSIS: add `externalPackages: 39,` and refresh it at the re-run.
- commands.ts:49: replace the row with ["externals", a.externals, `${count(a.externalPackages)} packages`].
- At minimum, relabel the row 'externals'.

## B4 — CONFIRMED (major) — architecture
- File: site/components/sections/Architecture.tsx
- Problem: This is the only capability section without a status mark. Its lede says in the present tense: 'Files, symbols and modules form one typed graph. Group it by module to see the boundaries, filter relationships by kind, and zoom into any member.' Modules are not in today's output: inference is milestone 5, a configured `modules:` section is accepted but not evaluated, and StructureDocument has no components, modules or layers. No implemented package produces the 'accesses data' relationship kind the explorer filters by. The group, filter and zoom controls belong to this page's demo, not to Katedrala, which has no UI.
- Evidence: Architecture.tsx:10-14 passes no `aside`. packages/engine/src/configuration.ts:87: 'Configuration section "${name}" is not evaluated by this version of Katedrala'. structure.ts:121-137 (StructureDocument). Edge kinds in the CodeVerse run: calls 4860, uses 3464, references-type 2964, imports 2616, instantiates 199, re-exports 43, depends-on-package 39, extends 20, reads-configuration 16, implements 11, and no accesses-data. A grep of linker, core and adapter-typescript finds no producer of 'accesses-data'.
- Reviewer fix: Add `aside={<Status status="in-development" label="Modules: in development for v1" />}`. Change the lede to: 'Files and symbols already form one typed graph; modules join it with inference in v1. Explore the demonstration system by member or by module, filter relationships by kind, and zoom into any member.'
- Verifier: Confirmed. Architecture.tsx:10-14 passes no aside. In the extracted statuses, 'architecture' is the only capability section with no status mark. The lede says in the present tense 'Files, symbols and modules form one typed graph', and the explorer's Modules view shows boundaries. Today StructureDocument has no modules, components or layers, and module inference is M5 (Planned). A configured `modules:` section produces 'is not evaluated by this version of Katedrala' (engine/configuration.ts:87). ArchitectureModel can project to modules, but none exist. The edge kinds in the CodeVerse run include no accesses-data: it is an IR kind with no producer in the linker, core or adapter. The only qualifier is the faint line 'Demonstration system.' under the plan. That labels the data, not whether the capability exists, so a reader can conclude that module grouping (or an explorer UI) ships today.
- Verified fix: In Architecture.tsx:
- Import Status from "@/components/ui/Status".
- Add `aside={<Status status="in-development" label="Modules: in development for v1" />}`. Use 'Modules: planned for v1' if B5's wording is adopted.
- Change the lede to: 'Files and symbols already form one typed graph; modules join it with inference in v1. Explore the demonstration system by member or by module, filter relationships by kind, and zoom into any member.'

## B5 — CONFIRMED (minor) — global
- File: site/lib/site.ts
- Problem: 'In development for v1' marks capabilities whose milestones the same page lists as 'Planned': 05 inference, 06 metrics, 08 rules, 09 impact, 10 diff, 11 command line, 12 git/CI and 14 CodeVerse adapter. None of them has code in the repository; design drafts for 5–9 exist only outside it. OpenSource then says 'Everything on this page marked in development is on this list', and the reader finds all of them there as 'Planned', which is also what the cited docs/ROADMAP.md says. The status overstates progress.
- Evidence: site.ts:23 `"in-development": "In development for v1"`; site.ts:35-45 set state 'planned'. Rendered '05 Architectural inference Planned' through '15 Documentation and release Planned' sit beside these items marked 'In development for v1': Infer, Analyze, Explain, Gravity, Entropy, Impact, Rules, History, Developers, 'Made for CI', 'CI pipelines', 'CodeVerse adapter' and 'CodeVerse'. packages/ has no inference, metrics, rules, impact, diff, cli or codeverse package, and core/src/sources has no git-revision source.
- Reviewer fix: site.ts STATUS_LABEL: `"in-development": "Planned for v1"` (keeps the open square). Gravity.tsx and Entropy.tsx aside label: 'Katedrala heuristic, planned for v1'. Hero.tsx: 'Gravity: draft method, planned for v1'. Evidence.tsx and History.tsx footnotes: 'draft ..., planned for v1'. OpenSource.tsx: 'Everything on this page marked planned for v1 is on this list.' Alternatively, mark milestones with active work 'In progress' in ROADMAP.md and MILESTONES together.
- Verifier: Confirmed. Items marked 'In development for v1' (Infer, Analyze, Explain, Impact, Rules, History, Developers, Made for CI, CI pipelines, CodeVerse adapter and CodeVerse) sit on the same page as a roadmap block, and the docs/ROADMAP.md it links to, which list M5–M15 as 'Planned'. packages/ has no inference, metrics, rules, impact, diff, cli or codeverse package. Only M5 and M6 have research prototypes, and those live outside the repo. I downgraded this from major: every such capability is still clearly marked as not available today, and 'In development for v1' is the vocabulary chosen in site/PRODUCT.md and the design brief. The defect is an internal inconsistency that overstates progress.
- Verified fix: - site.ts STATUS_LABEL: `"in-development": "Planned for v1"`. Keep the open square.
- Gravity.tsx and Entropy.tsx aside label: 'Katedrala heuristic, planned for v1'.
- Hero.tsx:30: 'Gravity: draft method, planned for v1'.
- Evidence.tsx:64: 'Demonstration system. Gravity is a draft Katedrala heuristic, planned for v1.'
- OpenSource.tsx:58-59: 'Everything on this page marked planned for v1 is on this list.'
- Update the same wording in site/PRODUCT.md and in the comments of Status.tsx and site.ts.

Alternative: keep the label, and set a milestone to In progress in ROADMAP.md and MILESTONES once its work actually starts.

## B6 — CONFIRMED (minor) — gravity
- File: site/components/sections/GravityStage.tsx
- Problem: 'Each term is normalized against the largest value possible for a system of this size, never against the largest value observed, so a score only moves when the member's own neighbourhood changes.' Both halves are wrong. Spread is a saturation s/(s+3), not a share of a maximum. The log-share terms divide by ln(1+(n−1)) or ln(1+(n−1)(n−2)), so adding any member anywhere moves every non-zero score. Reach and brokerage also depend on the whole upstream graph. The draft design itself says the value changes with the neighbourhood 'or (logarithmically) the system size'.
- Evidence: GravityStage.tsx:184-188. site/lib/demo/metrics.ts:143-145 define logShare and saturation; :174-179 normalize reach and fan-in with logShare(x, n−1), spread with saturation(x, 3) and brokerage with logShare(x, (n−1)(n−2)). Recomputing PaymentService after adding one isolated, unrelated member (n 16→17) moves it from 0.5800 to 0.5701, shown as 0.58 → 0.57. scratchpad designs/metrics.md §4.2: '...changes only when its own neighbourhood or (logarithmically) the system size changes. Spread uses an absolute saturation'.
- Reviewer fix: GravityStage.tsx:185-187: 'Reach, fan-in and brokerage are measured against the largest value possible for a system of this size, never against the largest value observed, and spread saturates at a fixed constant: a score moves when what rests on the member changes, and only slightly as the system grows.'
- Verifier: Confirmed with the page's own code; I transpiled lib/demo into my scratch folder. In metrics.ts:174-179, reach and fan-in use logShare(x, n−1), brokerage uses logShare(x, (n−1)(n−2)) and spread uses saturation(x, 3). So spread is not measured against a size-dependent maximum. I added one isolated, unrelated member (n 16→17):
- PaymentService: 0.5800 → 0.5701 (shown 0.58 → 0.57)
- Database: 0.6397 → 0.6291 (0.64 → 0.63)
- OrderService: 0.4595 → 0.4508 (0.46 → 0.45)

Reach and brokerage also depend on the whole upstream graph. I rate this minor rather than major: it is fine print about a draft heuristic, and no gravity is shown across versions.
- Verified fix: GravityStage.tsx:184-188: 'Reach, fan-in and brokerage are measured against the largest value possible for a system of this size, never against the largest value observed, and spread saturates at a fixed constant, so a score moves with what rests on the member and only slightly as the system grows.'

## B7 — CONFIRMED (minor) — gravity
- File: site/components/sections/Gravity.tsx
- Problem: 'The weights are design choices, documented with the method.' The repository the page sends readers to contains no method documentation. docs/IR.md and the published schema say the method is described in docs/ALGORITHMS.md, which does not exist. The draft katedrala/gravity@1 design lives only in a session scratchpad.
- Evidence: Gravity.tsx:18-19. docs/ contains only ARCHITECTURE.md, IR.md and ROADMAP.md. docs/IR.md says 'See [ALGORITHMS.md](ALGORITHMS.md) for metric definitions and references.' The GravityScore description in architecture.schema.json says '...described in MetricsReport.definitions (key gravity) and docs/ALGORITHMS.md'. In the repository, 'gravity@1' appears only as the schema's example string.
- Reviewer fix: 'The weights are design choices and will be published with the method in docs/ALGORITHMS.md.' Alternatively, commit sections 4–5 of designs/metrics.md as docs/ALGORITHMS.md before launch, which also repairs the dead link in IR.md.
- Verifier: Confirmed. docs/ holds only ARCHITECTURE.md, IR.md and ROADMAP.md. docs/IR.md:287 and the GravityScore and EntropyReport schema descriptions point to docs/ALGORITHMS.md, which does not exist. The gravity@1 design exists only in the session scratchpad (designs/metrics.md); the repo has no documentation of the method or its weights. The README's 'two documented Katedrala heuristics' makes the same overclaim. Minor, because it is a footnote in a section already marked in development.
- Verified fix: Gravity.tsx:18-19: '…The weights are design choices and will be published with the method in docs/ALGORITHMS.md.' Alternatively, commit the metrics design as docs/ALGORITHMS.md before launch, which also fixes IR.md's dead link.

## C1 — REFUTED — open-source
- File: site/components/sections/OpenSource.tsx
- Problem: Parse, Link, the engine API, Deterministic and Local are marked 'Available today', while the roadmap block lists the milestones that deliver them as 'In progress'. Nothing explains the apparent contradiction.
- Evidence: Rendered: '02 TypeScript and JavaScript parsing In progress', '03 Dependency graph In progress' and '04 Graph algorithms In progress' (site.ts:32-34, OpenSource.tsx:58-59), beside 'Available today' on Parse, Link and 'Or call the engine from code'.
- Reviewer fix: OpenSource.tsx:58-59: '{done} of {MILESTONES.length} milestones done and {inProgress} in progress. Parsing, the dependency graph and the graph algorithms are implemented and being finished, so what they deliver is marked Available today. Everything marked in development is on this list.'
- Verifier: Not a contradiction. 'Available today' says the capability can be used now; 'In progress' says the milestone is not closed. Both are true: M2–M4 work runs through analyzeStructure. The build plan marks M2–M4 Done when they are committed, so this state is temporary. The actual problem behind 'Available today', that the code is not in any public repo, is covered by A1.

## C2 — CONFIRMED (minor) — developers
- File: site/lib/demo/commands.ts
- Problem: The validate transcript and the Rules violation are hand-written, not computed. The demonstration graph has no OrderController → OrderRepository dependency, yet the Developers note says every value except the analyze counts is 'computed from the demonstration system'. The Rules figure is not labelled as a demonstration. 'The planned v1 format' and 'the output shows its planned format' imply a specified format that no document defines.
- Evidence: commands.ts:135-152 contains literals: 'OrderController depends on OrderRepository', 'src/orders/order.controller.ts:7' and '1 error, 2 rules checked'. lib/demo/system.ts:118-142 EDGES has only OrderController → OrderService, and the explorer shows 'OrderController ... Depends on OrderService'. Developers.tsx:50-51 and Rules.tsx:55-56 carry the notes; docs/ROADMAP.md:20 says only 'human/JSON/YAML output'.
- Reviewer fix: Model the change explicitly: export `RULE_CHANGE = ["OrderController", "OrderRepository"]` from lib/demo, evaluate the two rules in Rules.tsx CONFIG over EDGES plus RULE_CHANGE to derive the violation, the count and the exit code, and reuse the result in Rules.tsx. Developers note: 'The command line ships with v1 and this layout is a preview. The analyze counts are real; the other values come from the demonstration system, validate after one new import from OrderController to OrderRepository.' Rules footnote: 'Demonstration system. The configuration syntax is the one Katedrala's rule fixtures use today; the report layout is a preview.'
- Verifier: Confirmed. The validate transcript is literal text (commands.ts:135-152). EDGES has OrderController → OrderService only, so 'OrderController depends on OrderRepository' is not in the demo graph. ':7' is an invented number, which breaks site/README's rule 'No invented numbers'. Yet the Developers note says every value outside analyze is 'computed from the demonstration system'. The Rules figure does not say it is a demonstration. 'Planned (v1) format' implies a specification, but ROADMAP says only 'human/JSON/YAML output'. The error and rule counts do match CONFIG (2 rules), which is why this is minor.
- Verified fix: 1. In lib/demo/system.ts, export `export const RULE_CHANGE = { source: "OrderController", target: "OrderRepository" } as const;`.
2. In commands.ts validate(), compute `const violations = [...EDGES, RULE_CHANGE].filter((e) => nodeById.get(e.source)!.file.endsWith(".controller.ts") && nodeById.get(e.target)!.file.endsWith(".repository.ts"));`. Match file suffixes, mirroring CONFIG's globs, rather than roles; otherwise SessionStore counts as a repository.
3. Print `${v.source} depends on ${v.target}` and the source file with no line number, then `${counted(violations.length, "error")}, 2 rules checked`, and exit `violations.length > 0 ? "1" : "0"`.
4. Drop ':7' from commands.ts:147 and Rules.tsx:49.
5. Developers.tsx:50-51: 'The command line ships with v1; this layout is a preview. The analyze counts are real; the other values come from the demonstration system, and validate checks it after one new import from OrderController to OrderRepository.'
6. Rules.tsx:55-56: 'Demonstration system. The configuration syntax is the one Katedrala's rule fixtures use today; the report layout is a preview.'

## C3 — CONFIRMED (minor) — entropy
- File: site/components/sections/EntropyStage.tsx
- Problem: In the section whose point is that every score decomposes, the terms often don't add up to the score shown next to them. The Entropy contributions miss the total in 5 of 6 commit states and in the health transcript. The Explain pass shows only 3 of the 4 gravity terms.
- Evidence: Rendered Entropy states:
- base: 0.00+0.00+0.12+0.09=0.21, shown '0.22'
- +1: 0.46, shown '0.45'
- +2: 0.51, shown '0.52'
- +3: 0.56, shown '0.57'
- +5: 0.62, shown '0.63'
The health transcript shows '+0.00 +0.00 +0.12 +0.09' under 'entropy 0.22'. The Explain artifact shows reach 0.28, spread 0.13 and brokerage 0.07 (sum 0.48) beside 'gravity 0.58'; fan-in 0.10 is left out at Pipeline.tsx:62-66.
- Reviewer fix: Add a largest-remainder rounding helper to lib/demo/metrics.ts that rounds the contributions to two decimals so they sum to formatScore(score). Use it in EntropyStage.tsx:125-130, in commands.ts health(), and in GravityStage and Evidence. Add `["fan-in", formatScore(term("fan-in").contribution)]` to the Explain artifact, or caption it 'largest terms'.
- Verifier: Confirmed by clicking all six commit states. The shown contributions sum to 0.21, 0.46, 0.51, 0.56, 0.60 and 0.62 against displayed scores of 0.22, 0.45, 0.52, 0.57, 0.60 and 0.63: five of six miss. At base the exact parts are 0.1231 + 0.0933 = 0.2164. The health transcript prints +0.00 +0.00 +0.12 +0.09 under 0.22. The Gravity stage and Evidence terms add up for all five choices (0.64, 0.58, 0.46, 0.25, 0.00), so only Entropy, health and the Explain card are affected. The Explain card shows reach 0.28, spread 0.13 and brokerage 0.07, leaving out fan-in 0.10. The reviewer's fallback caption 'largest terms' would be wrong, because fan-in (0.10) is larger than brokerage (0.07).
- Verified fix: 1. Add a largest-remainder helper to lib/demo/metrics.ts:
`export function formatParts(parts: readonly number[], total: number): string[] { const cents = parts.map((p) => Math.floor(p * 100 + 1e-9)); let missing = Math.round(total * 100) - cents.reduce((s, c) => s + c, 0); const order = parts.map((_, i) => i).sort((a, b) => parts[b]! * 100 - cents[b]! - (parts[a]! * 100 - cents[a]!) || a - b); for (const i of order) { if (missing <= 0) break; cents[i]! += 1; missing -= 1; } return cents.map((c) => (c / 100).toFixed(2)); }`
2. EntropyStage.tsx: compute `const shown = formatParts(result.factors.map((f) => f.contribution), result.score)` and render shown[index] at :130. Keep TermBar on the raw contribution.
3. commands.ts health(): use the same helper and print `+${shown[i]}` instead of signed(factor.contribution).
4. Pipeline.tsx Explain artifact: add ["fan-in", formatScore(term("fan-in").contribution)] after reach.

With the helper, the six states read 0.22, 0.45, 0.52, 0.57, 0.60 and 0.63, each adding up.

## C4 — REFUTED — top
- File: site/components/hero/Hero.tsx
- Problem: The hero lede has no status and says Katedrala 'reconstructs the architecture inside TypeScript and JavaScript code'. Today the engine reconstructs the dependency structure: files, symbols, typed edges, packages and externals. Components, modules and layers come with milestone 5.
- Evidence: Hero.tsx:15-16. packages/engine/src/structure.ts:156-157: 'This is the observed-structure stage of the analysis. Architecture inference, metrics, anomalies and rule evaluation build on its result.' The Ecosystem chain on the same page says 'Files, symbols and relationships today; modules and measures next.'
- Reviewer fix: 'Katedrala reconstructs the dependency structure inside TypeScript and JavaScript code, with evidence for every dependency it finds, and is being built to infer the architecture above it.'
- Verifier: This is positioning language, not a false claim. The lede limits its evidence claim to 'every dependency it finds', which is accurate today: every edge in the CodeVerse run carries a file, line and column. 'Reconstructs the architecture' matches the README and the hero copy the brief suggested. The page qualifies it straight away: Infer is marked in development, and Ecosystem says 'Files, symbols and relationships today; modules and measures next'. The specific, unqualified overclaim is in the meta description (B1).

## C5 — CONFIRMED (minor) — how-it-works
- File: site/components/sections/Pipeline.tsx
- Problem: Two pass descriptions are inaccurate. The lede says 'Each pass reads only what the previous one produced', but linking also reads project configuration (tsconfig.json, package.json) straight from the snapshot, and metrics read the whole model. The Infer card says components, modules and layers each come 'with a confidence', but components are derived from directories and packages and carry none.
- Evidence: Pipeline.tsx:76 and :40. packages/engine/src/structure.ts:244-267: prepareProjects reads the source, and link() takes the extracted files plus prepared.projects. docs/ARCHITECTURE.md:132-133: 'Each stage reads the model and contributes one section of the document. Stages never mutate earlier sections.' In packages/ir/src/types/architecture.ts, ComponentEntity has no `inference` field; only ModuleEntity:117 and LayerEntity:137 have an optional one. ADR-006: components are 'derived deterministically'.
- Reviewer fix: Lede: 'Katedrala works in passes. Each pass adds to the document and never rewrites what an earlier pass found, so every result traces back to a line of source.' Infer text: 'Components are derived from directories and packages; modules and layers are inferred, each with a confidence and the evidence behind it.'
- Verifier: Confirmed on both points. The lede says 'Each pass reads only what the previous one produced'. In fact link() takes the extraction results plus prepareProjects output read straight from the snapshot (structure.ts:244-267). The page's own Link card cites tsconfig paths, workspaces and package exports, none of which Parse produces. ARCHITECTURE.md says stages read the model and never mutate earlier sections. On the Infer card: ComponentEntity has no inference or confidence field (ir/types/architecture.ts:59-80), and components are 'derived deterministically' (ADR-006). Only inferred modules and layers carry InferenceInfo.
- Verified fix: - Pipeline.tsx:76 lede: 'Katedrala works in passes. Each pass adds to the document and never rewrites what an earlier pass found, so every result traces back to a line of source.'
- Pipeline.tsx:40: 'Components are derived from directories and packages; modules and layers are inferred, each with a confidence and the evidence behind it.'
- Update the doc comment at :70 to match.

## C6 — REFUTED — ecosystem
- File: site/components/sections/Ecosystem.tsx
- Problem: Both CodeVerse entries are marked 'In development for v1', but CodeVerse already renders districts, buildings and arcs today with its own parser. Showing Katedrala's architecture in it is CodeVerse work outside Katedrala's v1 list, where only milestone 14 (the adapter) appears. That contradicts 'Everything on this page marked in development is on this list'.
- Evidence: Ecosystem.tsx:8-11 and :39-43. CodeVerse README.md:11-12: 'directories become districts, files become buildings, imports become arcs'. docs/ROADMAP.md:23: '14 | CodeVerse adapter | @katedrala/codeverse visualization model'. OpenSource.tsx:58-59.
- Reviewer fix: TOOLS CodeVerse text: 'Katedrala's architecture inside its 3D city, through the adapter.' Keep in-development for it, as it maps to milestone 14. CHAIN CodeVerse step: drop the status, since it is a separate product, and use the text 'Its districts, buildings and arcs will show the architecture once it reads the adapter's model.'
- Verifier: Both CodeVerse entries describe CodeVerse showing Katedrala's architecture. That depends on milestone 14 (CodeVerse adapter), which is on the list. The page already says that CodeVerse renders districts, buildings and arcs from its own analysis today and 'will show the architecture' with Katedrala. The status is a plan the user owns, consistent with the charter's plan for CodeVerse to consume the adapter, so it cannot be shown to be false.

## C7 — REFUTED — ecosystem
- File: site/components/sections/Ecosystem.tsx
- Problem: Three pieces of Ecosystem wording run ahead of the code:
- 'Any TypeScript or JavaScript codebase': the adapter claims only .ts/.tsx/.mts/.cts/.d.ts/.js/.jsx/.mjs/.cjs files, so script blocks in .vue/.svelte/.astro files and files over analysis.max_file_size (1 MiB) are not analyzed.
- The lede says visualizations, CI checks, editors and exporters 'read the same structure', in the present tense, although only 'Your tools' is available.
- The foundation caption 'parse, link, infer, measure, explain' has no status, although infer, measure and explain belong to milestones 5–6.
- Evidence: Ecosystem.tsx:23, :52 and :75. packages/adapter-typescript/src/languages.ts:25-36 and :50-62. packages/core/src/config/schema.ts:15: `DEFAULT_MAX_FILE_SIZE = 1_048_576`.
- Reviewer fix: - :23 'TypeScript and JavaScript codebases: .ts, .tsx, .mts, .cts, .js, .jsx, .mjs and .cjs files.'
- :52 '...Visualizations, CI checks, editors and exporters can read the same structure instead of parsing code themselves.'
- :75 'parse and link today; infer, measure and explain next'
- Verifier: These are wording points, not false capability claims. 'Any TypeScript or JavaScript codebase' describes the input, and the adapter covers every TS/JS file extension: .vue and .svelte containers are not TS/JS files, and the 1 MiB limit is a configurable default. The lede's present tense sits directly above the tool cards, four of which are marked in development or planned after v1. The foundation caption names the passes, and their statuses are shown in the Pipeline section.

## C8 — CONFIRMED (minor) — gravity
- File: site/components/sections/Gravity.tsx
- Problem: The citations are bibliographically right but loosely applied. The per-member quantity in MacCormack, Rusnak and Baldwin (2006) is visibility fan-in; propagation cost is its system average. The footnote presents Gravity as reachability plus betweenness, but it has four terms: fan-in is afferent coupling, and cross-module spread is Katedrala's own and depends on module membership. That also makes the lede's 'from the shape of its dependency graph alone' inexact.
- Evidence: Gravity.tsx:11 and :16-19. site/lib/demo/metrics.ts:147 sets WEIGHTS for reach, fan-in, spread and brokerage; :165-167 derive spread from module membership. scratchpad designs/metrics.md §2.5 ('These are the visibility fan-in and fan-out of MacCormack, Rusnak & Baldwin (2006)') and §2.1 (fan-in is afferent coupling, Martin 1994).
- Reviewer fix: Footnote: 'Gravity is a Katedrala heuristic, not an established metric. Three of its terms are established measures: reach is the visibility fan-in behind the propagation cost of MacCormack, Rusnak and Baldwin (2006), fan-in is afferent coupling (Martin 1994), and brokerage is betweenness centrality (Freeman 1977; computed with Brandes 2001). Cross-module spread is Katedrala's own. The weights are design choices.' Lede ending: '...from its dependency graph and module boundaries.'
- Verifier: The citations are correct, and 'reachability, as in the propagation cost…' is a fair association. But the lede's 'from the shape of its dependency graph alone' is inexact. Cross-module spread (metrics.ts:165-167) counts other modules among the direct dependents, which needs module membership, not graph shape. The footnote names only reachability and betweenness. That leaves fan-in (afferent coupling, Martin 1994) uncited and does not say that spread is Katedrala's own, which the page's principle of separating cited measures from heuristics asks for. All four terms do appear in the stage UI, so this is minor.
- Verified fix: - Gravity.tsx:11 lede: '…from its dependency graph and module boundaries.'
- Footnote: 'Gravity is a Katedrala heuristic, not an established metric. Three of its four terms are established measures: reach is the visibility fan-in behind the propagation cost of MacCormack, Rusnak and Baldwin (2006), fan-in is afferent coupling (Martin 1994), and brokerage is betweenness centrality (Freeman 1977; computed with Brandes 2001). Cross-module spread is Katedrala's own.' End with B7's sentence on the weights.

## C9 — CONFIRMED (minor) — entropy
- File: site/lib/demo/entropy.ts
- Problem: The Entropy wording has three problems:
- The evidence calls cross-module member dependencies 'module dependencies' (16 in the base system), while the explorer calls the 15 module pairs '15 dependencies between modules'.
- 'A dependency lands in 2.9 modules on average' misreads perplexity: each dependency lands in exactly one module.
- The lede lists three of the four factors and leaves out propagation.
- Evidence: Rendered at commit +1: '1 of 17 module dependencies run against the best one-way order'. The explorer shows '15 dependencies between modules' in the module view and '23 dependencies, 16 of them across a module boundary' in the member view. Sources: entropy.ts:208 and :217, Entropy.tsx:11.
- Reviewer fix: - entropy.ts:208: `${feedback} of ${crossWeight} cross-module dependencies run against the best one-way order.`
- entropy.ts:217: `A module's dependencies spread over ${perplexity.toFixed(1)} modules (effective number).`
- Entropy.tsx lede: '...cycles, dependencies that run against the grain, coupling scattered across modules, and how far a change can propagate. Apply the commits and watch it rise.'
- Verifier: Confirmed on the live page. At commit +1 it reads '1 of 17 module dependencies run against the best one-way order'. Here 17 counts cross-module member dependencies (16 at base plus 1). The explorer's module view says '15 dependencies between modules', and the diff transcript calls a module pair a 'module dependency'. 'A dependency lands in 2.9 modules on average' misreads the perplexity 2^H(target module | source module): each dependency lands in exactly one module. The lede names three of the four factors and leaves out propagation.
- Verified fix: - entropy.ts:208: `${feedback} of ${crossWeight} cross-module dependencies run against the best one-way order.`
- entropy.ts:217: `On average, a module's dependencies spread over ${perplexity.toFixed(1)} modules (effective number, own module included).`
- Entropy.tsx:11 lede: '…cycles, dependencies that run against the grain, coupling scattered across modules, and how far a change can propagate. Apply the commits and watch it rise.'

## C10 — CONFIRMED (minor) — history
- File: site/lib/demo/history.ts
- Problem: v4 is titled 'Against the grain', which is the name of an Entropy factor, but that factor is 0 for v4: there is no module cycle, and entropy moves only from 0.22 to 0.23, through propagation and scatter. v4's own finding says 'against the load path'. v1's change text 'Gateway, auth and users' leaves out Platform, although v1 draws 4 modules.
- Evidence: history.ts:68 (title) and :50 (change). Rendered: 'v4 entropy 0.23 Against the grain ... Payments now depends on Auth, against the load path.' The 'Against the grain' factor is the minimum feedback weight over module cycles (entropy.ts:151-157). Aria label: 'v1: 4 modules'.
- Reviewer fix: history.ts:68 title: 'Against the load path'. history.ts:50 change: 'Gateway, auth, users and platform'.
- Verifier: Confirmed by recomputing. v4 has no module cycle, and its 'Against the grain' (direction) factor is 0.000. Entropy rises from 0.2164 to 0.2332 through scatter and propagation only, and v4's own finding says 'against the load path'. v1 draws 4 modules (aria label 'v1: 4 modules': gateway, auth, users and platform), but its change text reads 'Gateway, auth and users'.
- Verified fix: - history.ts:68 title: 'Against the load path'.
- history.ts:50 change: 'Gateway, auth, users and platform'.

## C11 — CONFIRMED (minor) — evidence
- File: site/components/sections/Evidence.tsx
- Problem: 'It lies on 13.2 of the shortest dependency paths between other members' (and 'Brokerage 13.2 paths' in Gravity) misdescribes raw betweenness. Betweenness sums, over pairs of other members, the share of each pair's shortest paths that pass through the member. It is not a count of paths, which the fractional value shows.
- Evidence: Evidence.tsx:27 and GravityStage.tsx:204. metrics.ts:77-107 accumulates delta += (sigma[v]/sigma[w])*(1+delta[w]) (Brandes). Hand check for PaymentService: 6 pairs ending at StripeClient + 6 at PaymentRepository + 1/3 + 1/2 + 1/3 at Database = 13.17.
- Reviewer fix: Evidence.tsx:27: `The shortest dependency paths of ${payment.betweenness.toFixed(1)} pairs of other members run through it (a pair with several shortest paths counts by its share).` GravityStage.tsx:204: `${raw.toFixed(1)} pairs`.
- Verifier: Confirmed. metrics.ts:77-107 computes raw Brandes betweenness: over pairs of other members, the sum of each pair's share of shortest paths that pass through the member. PaymentService scores 13.1667, a fraction, not a count of paths. So 'lies on 13.2 of the shortest dependency paths' (Evidence.tsx:27) and '13.2 paths' (GravityStage rawLabel) misdescribe it.
- Verified fix: - Evidence.tsx:27: `Its betweenness is ${payment.betweenness.toFixed(1)}: summed over pairs of other members, the share of each pair's shortest dependency paths that pass through it.`
- GravityStage.tsx:204, the default case: `betweenness ${raw.toFixed(1)}`.

## C12 — CONFIRMED (minor) — impact
- File: site/components/sections/ImpactStage.tsx
- Problem: 'HTTP entry points' in the Impact counts and 'entry points:' in the impact transcript mean HTTP-facing members. In Katedrala's IR, entryPoints are declared ways into the code (manifest fields, scripts, configuration), and HTTP routes are endpoints.
- Evidence: ImpactStage.tsx:116 and commands.ts:130. docs/IR.md document tree: 'entryPoints  declared ways into the code' and 'endpoints  externally reachable entries (detected)'.
- Reviewer fix: ImpactStage.tsx:116: 'HTTP endpoints'. commands.ts:130: `endpoints: ${[...result.entryPoints].sort().join(", ")}`.
- Verifier: Confirmed. In the IR, entryPoints means declared ways into the code; in the CodeVerse run these are 4 package.json scripts. endpoints means detected HTTP routes, and ImpactReport has `endpoints: ImpactedEndpoint[]` ('Endpoints whose handlers are impacted'). The page's 'HTTP entry points' count and the transcript line 'entry points: ApiGateway, CheckoutController, OrderController', which previews `katedrala impact`, use the IR's other term for members that handle HTTP. The reviewer's 'endpoints' would label handler members as routes, and the demo has no routes.
- Verified fix: - ImpactStage.tsx:116: 'HTTP handlers'.
- commands.ts:130: `HTTP handlers: ${[...result.entryPoints].sort().join(", ")}`.
- Optionally rename Impact.entryPoints to httpHandlers in lib/demo/impact.ts.

## C13 — REFUTED — rules
- File: site/components/sections/Rules.tsx
- Problem: The rule id 'controllers-no-database' names a target the rule does not have: the rule forbids repositories, and the drawing beside it reads 'prohibited: controllers → repositories'. The id comes from the fixture.
- Evidence: Rules.tsx:14-17 and :41, commands.ts:144. fixtures/dependency-violations/katedrala.config.yaml has 'id: controllers-no-database' with the description 'Controllers cannot directly access repositories'.
- Reviewer fix: Rename it to 'controllers-no-repositories' in Rules.tsx (CONFIG and the report) and in commands.ts validate(). Optionally rename it in the fixture and its README too.
- Verifier: The id is copied verbatim from fixtures/dependency-violations/katedrala.config.yaml (id controllers-no-database, description 'Controllers cannot directly access repositories'). It also matches the brief's example: 'controllers cannot_depend_on database', with the violation 'controllers → repositories is prohibited'. Repositories are the data-access layer, and rule ids are arbitrary labels. This is a matter of taste.

## C14 — CONFIRMED (minor) — open-source
- File: site/lib/site.ts
- Problem: Milestone 6 is renamed 'Metrics: gravity and entropy', although the roadmap's scope also includes the established measures. The list therefore reads as if Katedrala's metrics were only its own heuristics. The sequence's accessible name also reads '1 milestones done'.
- Evidence: site.ts:36 vs docs/ROADMAP.md:15: '6 | Metrics | Martin metrics, propagation cost, Lakos CCD, core–periphery roles, Architectural Gravity, Entropy'. The aria-label at OpenSource.tsx:65 renders '1 milestones done, 3 in progress, 11 planned'. Related: the content-addressed extraction cache and worker pool from milestone 13 already exist (packages/core/src/cache, extraction/pool.ts), yet both ROADMAP and MILESTONES still say Planned.
- Reviewer fix: site.ts:36: name 'Metrics'. OpenSource.tsx:65: aria-label={`${counted(done, "milestone")} done, ${inProgress} in progress, ${MILESTONES.length - done - inProgress} planned`}, importing counted from @/lib/text.
- Verifier: Confirmed. The rendered aria-label on the milestone sequence reads '1 milestones done, 3 in progress, 11 planned' (OpenSource.tsx:65), a grammar error that screen readers announce. site.ts:36 renames row 6 'Metrics: gravity and entropy'. ROADMAP's scope for that row is wider: Martin metrics, propagation cost, Lakos CCD, core–periphery roles, Gravity and Entropy. And site.ts says it lists milestones 'as docs/ROADMAP.md lists them'. The existing cache and worker pool against M13 'Planned' is a ROADMAP freshness issue and out of scope here.
- Verified fix: - OpenSource.tsx:65: aria-label={`${counted(done, "milestone")} done, ${inProgress} in progress, ${MILESTONES.length - done - inProgress} planned`}, adding `import { counted } from "@/lib/text";`.
- site.ts:36: { name: "Metrics", state: "planned" }.

## C15 — CONFIRMED (minor) — global
- File: README.md
- Problem: 'Get started' in the nav, the mobile menu and the final CTA opens the README. The README has no getting-started for users: only `pnpm install` and `pnpm check` for contributors. Nothing explains how to call the engine from a clone, which needs `pnpm install`, `pnpm build`, and a script inside the workspace where the root devDependencies resolve @katedrala/engine.
- Evidence: Navbar.tsx:43-45 and :73-78, FinalCta.tsx:18, README.md:48-53. Root package.json devDependencies include '@katedrala/engine': 'workspace:*'. packages/engine/package.json exports default ./dist/index.js, which needs a build.
- Reviewer fix: Add a 'Use the engine today' section to README.md: clone, pnpm install, pnpm build, then run the page's analyze.ts snippet from the repository root. Point LINKS.readme at that section's anchor, or relabel the CTAs 'Read the README'.
- Verifier: Confirmed. The committed README.md has only 'Development: pnpm install / pnpm check', and CONTRIBUTING.md covers contributor setup only. Nothing tells a user how to run the engine 'from a clone', which Developers.tsx claims works today. That takes pnpm install, then pnpm build (the engine's default export is ./dist/index.js), then a script inside the workspace, where the root devDependencies resolve @katedrala/engine. All three 'Get started' CTAs land on #readme.
- Verified fix: Add a '## Use the engine today' section to README.md: clone, run `pnpm install` and `pnpm build`, save the page's snippet as analyze.mjs at the repository root, and run `node analyze.mjs`. Then set LINKS.readme to `${REPOSITORY_URL}#use-the-engine-today` in site.ts. If the README cannot change before launch, relabel the three CTAs 'Read the README'.

## C16 — REFUTED — top
- File: site/components/hero/Hero.tsx
- Problem: 'Line weight: load carried' and the idle card's 'Carries the most load' present 'load' like a measurement. It is this page's drawing convention: each member weighs 1 and passes its load evenly to what it rests on. It is not a Katedrala metric; it is absent from the IR and from the draft metrics design.
- Evidence: Hero.tsx:29, MemberCard.tsx:41, site/lib/demo/metrics.ts:16 and :65-75. packages/ir/src/types/metrics.ts has no load measure.
- Reviewer fix: Hero.tsx:29: '<span>Line weight: load, a drawing convention</span>'. MemberCard.tsx:41: 'Most of the system rests on'.
- Verifier: 'Line weight: load carried' is a legend entry in the drawing's title block, next to 'Demonstration system'. It defines the drawing's convention. The idle card's 'Carries the most load' is computed from that same labelled demo drawing. Nothing on the page presents load as a Katedrala metric; the metric the cards show is Gravity, labelled as a draft. This is a matter of taste.

# accessibility-audit

Checked: Tested on the live page http://localhost:3100/ (Next dev server) in headless Edge with playwright-core 1.63. Scripts and every cited screenshot are in C:/Users/Awab/AppData/Local/Temp/claude/c--Users-Awab-Desktop-PROJECTS-Katedrala/f7609e3b-1ca5-4e98-a818-ae87ef209574/scratchpad/shots/review-a11y/ (screenshots under out/).

What I ran:
- Full Tab and Shift+Tab walks at 1440x900 (93 stops) and 390x844 (61), waiting for the smooth focus scroll to finish at each stop.
- Keyboard, mouse and touch operation of every custom control, with a MutationObserver measuring what each aria-live region would announce.
- The accessibility tree via CDP: landmarks, roles, names, states, empty groups.
- Raw CDP touch swipes and two-finger pinches at 390.
- reducedMotion 'reduce' against 'no-preference' at 1x, 4x and 6x CPU.
- WCAG 2.5.8 target sizes at 390, including the spacing exception.
- Reflow at 320x640 and at 640x400 (200% zoom of 1280x800), plus the WCAG text-spacing override at 390 and 1440.
- Contrast of graph marks, composited with their opacity.
- Forced-colors emulation, with an injected fix to confirm it works.
- axe-core with the table alternative and the mobile menu opened.

Source read: all of site/components/**, app/layout.tsx, app/page.tsx, globals.css, lib/site.ts and lib/demo/{plan,entropy,history}.ts.

Verified fine:
- No keyboard traps: the forward walk ends after the last footer link and the backward walk at the skip link.
- The skip link shows on focus and the next Tab lands on 'Explore Katedrala'.
- The command tabs follow the APG pattern: roving tabindex, arrows wrap, Home and End, Tab moves into the panel.
- The explorer's +, −, arrows and 0 keys work, and members respond to Enter, Space and Escape.
- The Impact select is native and labelled.
- Copy works and strips the '$ ' prompt.
- Every HTML focus stop draws a 2px #3EA6FF outline (7.36:1).
- Headings run h1, then one h2 per section, then h3s.
- Every role=img SVG has a name.
- Nothing clips or overflows at 320, at 640x400, or under the text-spacing override.
- 2.5.8 passes everywhere through the spacing exception.
- Reduced motion is respected: one position with no scatter, 0.001s transitions, Impact rings and terminal printing off, instant anchor jumps.
- The explorer does not trap page scrolling at fitted scale: a swipe on it scrolled the page 267px.
- The viewport meta allows zoom.

## A1 — CONFIRMED (critical) — top
- File: site/components/drawing/LoadDrawing.tsx
- Problem: Hero drawing members cannot be selected with one tap or one click. On every touch device the first tap leaves the member unselected (idle card). A second tap selects it, and tapping another member clears the card. With a mouse, clicking the member you are hovering deselects it. Cause: hover activates on pointerenter, the svg's onPointerLeave (fired after every touch) clears it, focus-on-tap activates it, and then onClick toggles against the render-time value captured in setActive's closure (`next(active)`, lines 80-87), so the toggle goes the wrong way.
- Evidence: herotap.mjs, fresh page per run, Playwright touchscreen.tap on the joint. 390px module drawing: 1 tap on Payments gives aria-pressed=false and the card 'Carries the most load Database 13 of 15 members rest on it.'; 2 taps give aria-pressed=true and 'Payments Members PaymentService, PaymentRepository, StripeClient'. 820px member drawing: identical (1 tap idle, 2 taps PaymentService). mobile.mjs M3: with Payments selected, one tap on Orders returns the idle card. Event order per tap: pointerover, pointerenter x4, pointerdown, pointerup, pointerout, pointerleave x4, click. keyops.mjs B2 at 1440 with a mouse: hovering PaymentService shows its card; mouse down/up on the same joint reverts the card to 'Carries the most load…' with aria-pressed=false while the pointer is still on it. The idle card itself says 'Select any joint to test another member'.
- Reviewer fix: In LoadDrawing.tsx:
(1) Use the latest value: add `const activeRef = useRef(active); activeRef.current = active;` and in setActive call `next(activeRef.current)`; drop `active` from the useCallback deps.
(2) Hover only for mice. Line 165: `onPointerLeave={interactive ? (e) => { if (e.pointerType === 'mouse') setActive(null); } : undefined}`. Line 248: `onPointerEnter: (e: React.PointerEvent) => { if (e.pointerType === 'mouse') setActive(member.id); },`.
(3) Click selects instead of toggling. Line 252: `onClick: () => setActive(member.id),`.
(4) A tap on empty paper clears. On the <svg>: `onClick={interactive ? (e) => { if (!(e.target as Element).closest('.drawing-member')) setActive(null); } : undefined}`.
- Verifier: Reproduced with my own script (verify-a11y/hero.mjs, a new context for each run, Chromium touch emulation). At 390 on the module drawing, one tap on Payments leaves aria-pressed=false and the idle 'Carries the most load ... Database' card. Two taps select it. One further tap on Orders brings the idle card back. The 820 member drawing behaves the same. With a mouse at 1440, hovering PaymentService shows its card, a click while hovering returns the idle card (aria-pressed=false), and a second click selects it again. Event order per tap: pointerenter, pointerdown, pointerup, pointerleave (svg), mousedown, focusin, click. The reviewer's explanation of the cause needs a correction. By the time the click arrives, the member is already active, because focus (given by the compatibility mousedown) selected it, or mouse hover did. The toggle in onClick therefore clears it, whether its closure is stale or fresh. The mouse case shows this: hover happened long before the click. activeRef alone would not fix it. On touch, the svg's pointerleave also clears the hover selection after every tap.
- Verified fix: In site/components/drawing/LoadDrawing.tsx:
1) Lines 252-253 (the essential change): `onClick: () => setActive(member.id),` so a click always selects and never toggles.
2) Line 248: `onPointerEnter: (event: React.PointerEvent<SVGGElement>) => { if (event.pointerType === "mouse") setActive(member.id); },`
3) Line 165: `onPointerLeave={interactive ? (event) => { if (event.pointerType === "mouse") setActive(null); } : undefined}`
Leave onFocus and onBlur as they are. onBlur already clears the card when the user taps another member or empty paper, because focus leaves the member. The activeRef and the svg onClick from the reviewer's fix are not needed. Users can still deselect with Escape (see A2) or by tapping elsewhere.

## A2 — CONFIRMED (major) — top
- File: site/components/drawing/LoadDrawing.tsx
- Problem: Hero members are <g role='button' tabindex='0'> with only an Escape handler (lines 254-259). Enter does nothing. Space scrolls the page because its default is not prevented. Escape calls blur(), which drops focus to <body> and removes the visible focus. aria-pressed follows hover and focus (focus = pressed, blur = not pressed), so screen readers announce a toggle button whose state flips as the mouse moves and which Enter cannot toggle.
- Evidence: keyops.mjs at 1440, 11 Tabs to the first member:
- Focus on ApiGateway: aria-pressed=true, card filled.
- Enter: no change.
- Space: window.scrollY goes 0 -> 787 while focus stays on the member.
- Escape: document.activeElement is BODY and the card is idle; the next Tab lands on AuthService (Chromium keeps the starting point).
In the AX tree, button 'PaymentService, Payments module, gravity 0.58' flips pressed=true/false with focus.
- Reviewer fix: Replace the onKeyDown at lines 254-259 with `onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActive(member.id); } else if (event.key === 'Escape') { event.preventDefault(); setActive(null); } }`. Remove the `event.currentTarget.blur()` call so focus and its ring stay on the member. Remove `'aria-pressed': active === member.id` (line 247): a hover or focus preview is not a pressed state. If a pinned selection is added, expose only that with aria-pressed.
- Verifier: Reproduced at 1440 (hero.mjs):
- Focusing ApiGateway sets aria-pressed=true and fills the card.
- Enter changes nothing.
- Space scrolls the page from 0 to 787px while focus stays on the member, which is now off-screen.
- Escape leaves document.activeElement as BODY and the card idle.
- The next Tab goes to AuthService.
Lines 254-259 handle only Escape, and they call blur(). Keyboard operation of the hero's main control is broken: Space scrolls the page away and Escape drops focus.
- Verified fix: In LoadDrawing.tsx:
1) Delete line 247 (`"aria-pressed": active === member.id,`). A hover or focus preview is not a pressed state.
2) Replace lines 254-259 with:
onKeyDown: (event: React.KeyboardEvent<SVGGElement>) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    setActive(member.id);
  } else if (event.key === "Escape") {
    event.preventDefault();
    setActive(null);
  }
},
Do not call blur(). After Escape, focus stays on the member, and `.drawing-member:focus-visible .drawing-joint` (globals.css 299-302) keeps the blue ring visible.

## A3 — CONFIRMED (major) — global
- File: site/app/globals.css
- Problem: Focused elements can be scrolled behind the fixed 64px nav, which is opaque after 96px of scroll (WCAG 2.2 SC 2.4.11 Focus Not Obscured, AA). Moving backwards with Shift+Tab, Chromium aligns a partly visible element with the viewport's top edge, under the nav, and nothing pads for it. Firefox and Safari also align to the nearest edge on forward Tab.
- Evidence: tabwalk.mjs --back at 1440x900:
- Step 81: hero member 'ApiGateway, Gateway module' at y 0-29 with scrollY 160, entirely under the nav, which covers y 0-64.
- Step 17: Developers tab 'analyze' at y 0-79 with scrollY 10526; its name and the top of its focus ring are hidden.
- Steps 43-45: explorer AuthService, SessionStore and InvoiceService at y 50-94; the focused joint straddles the nav edge.
Screenshots: out/back-1440-81-ApiGateway_Gateway_module_gr.png, out/back-1440-17-analyzeWhat_is_in_this_reposit.png, out/back-1440-45-AuthService_Auth_module.png.
Re-run with `html { scroll-padding-top: 5rem }` injected: 0 of 92 Shift+Tab stops obscured.
- Reviewer fix: In the html rule of the base layer (globals.css lines 45-54), add `scroll-padding-top: 5rem;` (the 64px nav plus 16px). Verified in the browser. It also keeps anchor jumps clear of the nav.
- Verifier: My Shift+Tab walk (verify-a11y/walk.mjs, 1440x900, 92 steps back from the last footer link, waiting for each smooth scroll to finish) found these stops:
- Fully hidden: step 82, the hero member ApiGateway at y 0-29 with scrollY 160. It sits entirely under the fixed 64px nav, whose background is the 96%-opaque sheet colour. This fails WCAG 2.4.11 (AA).
- Partly covered: the 'analyze' tab (y 0-79), the terminal <pre>, the explorer members InvoiceService, SessionStore and AuthService (y 50-94), and CheckoutController (y 48-78).
Re-running with `html { scroll-padding-top: 5rem }` injected leaves no stop under the nav. The only remaining hit is the skip link, which is a false positive: it is fixed at z-index 60, above the nav. The site has no scroll-padding or scroll-margin anywhere.
- Verified fix: In globals.css, in the html rule of @layer base (lines 45-54), add `scroll-padding-top: 5rem;` (the 64px nav plus 16px). I verified this by injection. Anchor jumps will also land 80px lower; the sections' 80-136px top padding absorbs that.

## A4 — CONFIRMED (major) — architecture
- File: site/components/sections/ArchitectureExplorer.tsx
- Problem: When the plan is zoomed, Tab moves focus to members outside the visible part of the sheet. The sheet clips with overflow:hidden and the view is a CSS transform, so the browser cannot scroll them into view. Keyboard users see no focus at all (SC 2.4.7 and 2.4.11).
- Evidence: keyops.mjs C2 at 1440: after three clicks on 'Zoom in' (scale 1.95), focusing the sheet and tabbing through the 16 members, 5 focused members have their joint centre outside the .explorer-sheet rectangle: ApiGateway, PaymentService, UserRepository, Database, EventBus. Screenshot out/explorer-zoomed-focus-hidden.png: focus is on EventBus and nothing in view is highlighted.
- Reviewer fix: Pan to the focused member. Add `const reveal = (m: { x: number; y: number }) => setView((v) => { const sx = v.x + m.x * v.scale, sy = v.y + m.y * v.scale, pad = 48; if (sx >= pad && sx <= PLAN.width - pad && sy >= pad && sy <= PLAN_HEIGHT - pad) return v; return { ...v, x: PLAN.width / 2 - m.x * v.scale, y: PLAN_HEIGHT / 2 - m.y * v.scale }; });`. On the plan-member <g> (line 341 onwards) add `onFocus={() => reveal(member)}`.
- Verifier: Reproduced (verify-a11y/explorer.mjs, 1440). Three 'Zoom in' clicks give translate(-476.562px, -348.844px) scale(1.95312). Focusing the sheet and tabbing through the 16 members, 5 have their joint centre outside .explorer-sheet: ApiGateway, PaymentService, UserRepository, Database and EventBus. The sheet's scrollLeft and scrollTop stay 0, because the svg clips its transformed content, so the browser cannot bring them into view and the user sees no focus. This is the exact flow the sheet's label tells users to follow ('Use plus and minus to zoom ... Tab to reach members'). At fit, every member is at least 48 units from the edge (x 160-840 of 1000, y 65-655 of 732), so the proposed reveal() never moves the fitted plan.
- Verified fix: In ArchitectureExplorer.tsx, after zoomAt, add:
const reveal = (m: { x: number; y: number }) =>
  setView((v) => {
    const pad = 48;
    const sx = v.x + m.x * v.scale;
    const sy = v.y + m.y * v.scale;
    if (sx >= pad && sx <= PLAN.width - pad && sy >= pad && sy <= PLAN_HEIGHT - pad) return v;
    return { ...v, x: PLAN.width / 2 - m.x * v.scale, y: PLAN_HEIGHT / 2 - m.y * v.scale };
  });
On the plan-member <g> (line 341 onwards), add `onFocus={() => reveal(member)}`. The .plan-content transition animates the pan. If B6's clamp is added, a view centred on a member always falls inside it.

## A5 — CONFIRMED (minor) — gravity
- File: site/components/sections/GravityStage.tsx
- Problem: The member picker is announced as a radio group (role=radiogroup, role=radio, aria-checked) but does not behave like one. Arrow keys do nothing and all five radios are separate Tab stops, so screen-reader users are told to use arrows that do not work.
- Evidence: keyops.mjs D1-D3: with focus on 'Database 0.64', ArrowRight leaves focus where it is and aria-checked stays true,false,false,false,false. tabIndex on the five radios is 0,0,0,0,0, and Tab from the first radio goes to 'PaymentService 0.58'. Space does select (native button).
- Reviewer fix: Implement the APG radio group (lines 67-84). Add `const refs = useRef<(HTMLButtonElement | null)[]>([]);`. On the radiogroup: `onKeyDown={(e) => { const i = CHOICES.indexOf(selected as (typeof CHOICES)[number]), last = CHOICES.length - 1; const next = ({ ArrowRight: i === last ? 0 : i + 1, ArrowDown: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, ArrowUp: i === 0 ? last : i - 1, Home: 0, End: last } as Record<string, number>)[e.key]; if (next === undefined) return; e.preventDefault(); setSelected(CHOICES[next]!); refs.current[next]?.focus(); }}`. On each radio: `ref={(el) => { refs.current[i] = el; }}` and `tabIndex={selected === id ? 0 : -1}`. Change aria-label from 'Member' to 'Member to measure'.
- Verifier: Confirmed (misc1.mjs). The group is role=radiogroup with five role=radio buttons, all with tabIndex 0. ArrowRight on 'Database 0.64' moves neither focus nor aria-checked (it stays true,false,false,false,false). Tab goes to 'PaymentService 0.58'. Space and Enter do select, because these are native buttons. Everything is operable, so this is not a 2.1.1 or 4.1.2 failure. But the arrow keys that a radio group announces do nothing, and there are five tab stops where one is expected.
- Verified fix: In GravityStage.tsx:
1) Import useRef and add `const radios = useRef<(HTMLButtonElement | null)[]>([]);`.
2) On the radiogroup div (line 67), set `aria-label="Member to measure"` and add:
onKeyDown={(event) => {
  const last = CHOICES.length - 1;
  const i = CHOICES.indexOf(selected as (typeof CHOICES)[number]);
  const next =
    event.key === "ArrowRight" || event.key === "ArrowDown" ? (i === last ? 0 : i + 1)
    : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (i === 0 ? last : i - 1)
    : undefined;
  if (next === undefined) return;
  event.preventDefault();
  setSelected(CHOICES[next]!);
  radios.current[next]?.focus();
}}
3) Map with an index, `CHOICES.map((id, i) => ...)`, and give each button `ref={(el) => { radios.current[i] = el; }}` and `tabIndex={selected === id ? 0 : -1}`.

## A6 — CONFIRMED (major) — global
- File: site/components/sections/ImpactStage.tsx
- Problem: aria-live sits on whole result panels and is not atomic, so screen readers hear only the text nodes that changed. The result is strings of unlabelled numbers and path fragments, sometimes very long. The hero card is also live and changes on mouse hover, so moving the mouse over the drawing queues announcements. On keyboard focus the roughly 150-character card is announced on top of the button name.
- Evidence: MutationObserver on [aria-live] (keyops.mjs, impact.mjs):
- Impact, select Database: 746 chars / 90 words, '13 7 1OrderRepository → Database 1PaymentRepository → Database 1SessionStore → Database 2AuthService → SessionStore → …' (counts without their labels).
- Gravity, choose PaymentService: 'PaymentService | 0.58 | 6 of 15 rest on it | 0.28 | 3 direct | 0.10 | 3 other modules | 0.13 | 13.2 paths | 0.07'.
- Entropy, +5: '0.63 | high' (the word 'entropy' is in an unchanged node).
- Hero: 147 chars on keyboard focus of ApiGateway, 164 chars on mouse hover of PaymentService.
Regions: ImpactStage.tsx:105 (464 chars), GravityStage.tsx:160 (347), HeroDrawing.tsx:89 and :121 (133), EntropyStage.tsx:113.
- Reviewer fix: Remove aria-live from ImpactStage.tsx:105, GravityStage.tsx:160 and HeroDrawing.tsx:89 and :121, and add one short atomic status per demo:
- Impact: `<p role='status' aria-atomic='true' className='sr-only'>{`Changing ${target} affects ${counted(affected.length, 'member')} in ${counted(modules.size, 'module')} and ${counted(entryPoints.length, 'HTTP entry point')}.`}</p>`.
- Gravity: `<p role='status' aria-atomic='true' className='sr-only'>{`${selected}: gravity ${formatScore(m.gravity)}, ${m.transitiveDependents.length} of ${OTHER_MEMBERS} members rest on it.`}</p>`.
- Entropy: add `aria-atomic='true'` to the score div at EntropyStage.tsx:113 so it reads '0.63 high entropy'.
- Hero: keep the visual card without aria-live. Drive a sr-only role=status sentence only from focus, click or Enter (never pointerenter), e.g. `${id}: depends on ${dependsOn.join(', ') || 'nothing'}; ${dependedOnBy.length} members depend on it.`
- Verifier: Reproduced with a MutationObserver on the visible [aria-live] regions (misc1.mjs, selectkeys.mjs):
- Impact, select Database: 35 mutations, 746 characters, starting '13 7 1OrderRepository → Database 1PaymentRepository → Database ...'. The counts are read without their labels.
- Three ArrowDown presses on the closed native select (Edge changes the value on each press) produced 81 mutations and 1014 characters.
- Gravity, choose PaymentService: 'PaymentService | 0.58 | 6 of 15 rest on it | 0.28 | 3 direct | 0.10 | ...'.
- Entropy, commit +5: '0.63 | high'.
- The hero cards are live and also update on mouse hover.
The changes are exposed, so 4.1.3 is technically met. But in three demos, screen-reader output is long, fragmented and unlabelled. ArchitectureExplorer.tsx:403 uses the same non-atomic pattern, but it only changes on an explicit selection.
- Verified fix: - ImpactStage.tsx:105: remove aria-live="polite". Inside that column add <p role="status" aria-atomic="true" className="sr-only">{`Changing ${target} affects ${counted(affected.length, "member")} in ${counted(modules.size, "module")} and ${counted(entryPoints.length, "HTTP entry point")}.`}</p>.
- GravityStage.tsx:160: remove aria-live. Add <p role="status" aria-atomic="true" className="sr-only">{`${selected}: gravity ${formatScore(m.gravity)}, ${m.transitiveDependents.length} of ${OTHER_MEMBERS} members ${rests(m.transitiveDependents.length)} on it.`}</p>.
- EntropyStage.tsx:113: add aria-atomic="true", so it reads '0.63 high entropy'.
- HeroDrawing.tsx:89 and :121: remove aria-live. To keep the card's facts for screen readers without announcements on hover, give DrawingMember an optional `detail?: string`. LoadDrawing renders <desc>{member.detail}</desc> as the first child of each interactive member <g>; it becomes the accessible description and is read on focus. HeroDrawing sets, for example, detail: `Depends on ${m.dependsOn.join(", ") || "nothing"}. ${m.transitiveDependents.length} of ${OTHER_MEMBERS} members ${rests(m.transitiveDependents.length)} on it.`.
The reviewer's alternative, a sr-only role=status set only on focus, click or Enter, also works, but onActiveChange would then have to report what triggered the activation.

## A7 — CONFIRMED (major) — header
- File: site/components/site/Navbar.tsx
- Problem: Below 1024px the site navigation is a <details> menu with two problems. It is not inside a <nav>, so phones and tablets have no navigation landmark for the site menu. It also never closes on its own: choosing a link, pressing Escape or tapping outside all leave the 224x310 panel open over the content.
- Evidence: mobile.mjs at 390x844 (touch):
- CDP AX landmarks: banner, main, contentinfo, 13 regions and navigation Project/Documentation/Related, but no navigation 'Primary' (the desktop <nav> is display:none).
- Tap Menu, then 'Architecture': location.hash is #architecture and details.open is still true; the 224x310 panel at y=58 covers the section (out/mobile-390-menu-left-open.png).
- Escape: still open. Tap at (30,600): still open.
- Keyboard: Enter on the summary opens it, Tab reaches 'How it works', Escape leaves it open.
- Reviewer fix: Move the menu into a client component, components/site/MobileMenu.tsx ('use client'):
- Wrap the <ul> in `<nav aria-label='Primary'>` inside the <details>.
- Give the details a ref and close it on link click (`onClick={() => { ref.current!.open = false; }}` on each <a>).
- Close on Escape: `document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && d.open) { d.open = false; d.querySelector('summary')?.focus(); } })`.
- Close on pointerdown outside: `if (d.open && !d.contains(e.target as Node)) d.open = false`.
Render it in Navbar.tsx in place of lines 47-83.
- Verifier: Reproduced at 390 with touch (misc2.mjs):
- AX landmarks: banner, main, contentinfo and navigation Project/Documentation/Related, but no Primary navigation. The desktop <nav> is display:none below lg, and the <details> menu is not inside any nav.
- Tap Menu, then 'Architecture': the hash becomes #architecture, but details.open is still true and the 224x310 panel at (150,58) covers the top of the section.
- Escape: still open. A tap at (30,600): still open.
Every time someone uses the menu on a phone or tablet, the panel stays over the content.
- Verified fix: Create components/site/MobileMenu.tsx ('use client') and render it in Navbar.tsx in place of lines 47-83. Wrap the whole <details> in the nav, not just the <ul>: the content of a closed <details> is not rendered, so a nav inside it would disappear whenever the menu is closed. Only one 'Primary' nav is displayed at any width.
const ref = useRef<HTMLDetailsElement>(null);
useEffect(() => {
  const d = ref.current!;
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && d.open) { d.open = false; d.querySelector("summary")?.focus(); } };
  const onDown = (e: PointerEvent) => { if (d.open && !d.contains(e.target as Node)) d.open = false; };
  document.addEventListener("keydown", onKey);
  document.addEventListener("pointerdown", onDown);
  return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
}, []);
return (
  <nav aria-label="Primary" className="lg:hidden">
    <details ref={ref} className="nav-menu relative">
      <summary ...>Menu</summary>
      <div className="absolute right-0 top-11 w-56 ..." onClick={(e) => { if ((e.target as Element).closest("a")) ref.current!.open = false; }}>{/* same <ul> */}</div>
    </details>
  </nav>
);
Move ITEMS into a shared module, or pass it as a prop.

## A8 — CONFIRMED (minor) — entropy
- File: site/components/sections/EntropyStage.tsx
- Problem: Which modules are tangled in the cycle is shown by colour alone: cyclic joints change from chalk to load blue (stroke 1.5px to 2.2px), and no text names them. The caption says 'lit modules are tangled in a cycle', the figure's name gives only a count, and the Cycles factor says '7 members in 1 cycle.' (SC 1.4.1).
- Evidence: colour.mjs at commit +5: the joints of Auth, Orders, Billing, Payments and Users are stroked rgb(62,166,255) at 2.2px, against Gateway's rgb(233,230,223) at 1.5px. The two stroke colours differ by only 2.08:1, under the 3:1 a colour-only difference would need. aria-label: 'Module drawing after 5 of 5 commits: 5 modules tangled in a cycle.' Factor evidence: '7 members in 1 cycle.' Screenshot out/entropy-cycle.png.
- Reviewer fix: Name the modules and add a mark that is not colour:
- Add `const cycleNames = [...state.inCycle].map((id) => moduleName(id as ModuleId));`.
- Append to the aria-label (line 43): `${cycleNames.length ? `: ${cycleNames.join(', ')} are tangled in a cycle` : ''}`.
- Under the figure, render `{cycleNames.length > 0 && <p className='mt-2 text-[0.8125rem] text-ink-soft'>In a cycle: {cycleNames.join(', ')}</p>}`.
- At lines 91-94, draw a second ring on cyclic joints: `{state.inCycle.has(m.id) && <circle r={14} className='entropy-ring' />}`, styled `.entropy-ring { fill: none; stroke: var(--color-load); stroke-width: 1.2; stroke-dasharray: 2 3; }`.
- Verifier: I confirmed the gap in the text. The svg's aria-label is 'Module drawing after 5 of 5 commits: 5 modules tangled in a cycle.' and the caption says 'lit modules are tangled in a cycle'. The commit messages describe features, so no text anywhere names Auth, Billing, Orders, Payments and Users. The 'colour alone' (SC 1.4.1) part is overstated. Cyclic joints are also thicker (stroke 1.5 to 2.2). Cyclic edges are solid and fully opaque, next to dashed added edges and faint base edges (entropy-cycle.png). So the drawing does have a cue other than colour. What matters is that screen-reader users cannot find out which modules form the cycle.
- Verified fix: In EntropyStage.tsx:
1) Import moduleName from "@/lib/demo/system".
2) In the component: `const cycleNames = [...state.inCycle].map((id) => moduleName(id as ModuleId)).sort();`.
3) Line 43: aria-label={`Module drawing after ${step} of ${DEGRADATION.length} commits: ${cycleNames.length === 0 ? "no module cycles" : `${cycleNames.join(", ")} are tangled in a cycle`}.`}. This also counts every cyclic module; the current label counts only moduleCycles[0].
4) In the figcaption (lines 106-109), append {cycleNames.length > 0 && <> In a cycle: {cycleNames.join(", ")}.</>}.
The reviewer's extra dashed ring is optional.

## A9 — CONFIRMED (minor) — architecture
- File: site/app/globals.css
- Problem: Graphic marks that carry meaning fall below 3:1 (SC 1.4.11): the module boundaries (bays) in the explorer and Rules drawings, the original dependencies in Entropy and History, and the unpressed state of the relationship-kind toggles.
- Evidence: colour.mjs, composited with opacity:
- .plan-bay rect stroke #353A3F: 1.6:1 on the bay fill (about #121517) and 1.66:1 on the sheet, in both the explorer and the #rules drawing.
- .entropy-edge-base #8B8E92 at 0.55 opacity: 2.56:1.
- .history-edge-old #8B8E92 at 0.60: 2.82:1.
- .kind-toggle border #353A3F: 1.66:1 in both states; only the border style changes, and the unpressed sample line drops to 0.35 opacity.
For reference, hero edges at rest are 4.06:1 and explorer edges 8.9:1.
- Reviewer fix: In globals.css:
- `.plan-bay rect { stroke: var(--color-ink-faint); stroke-opacity: 0.75; }` (about 3.7:1 on the bay fill).
- `.entropy-edge-base { opacity: 0.8; }` and `.history-edge-old { opacity: 0.8; }` (about 4.1:1).
- `.kind-toggle[aria-pressed='true'] { border-color: var(--color-ink-faint); }`, so pressed becomes a solid 5.8:1 border next to the dashed 1.66:1 unpressed one.
- Verifier: I reproduced the ratios from the tokens (verify-a11y/contrast.mjs):
- .plan-bay rect stroke #353a3f: 1.60:1 on the bay fill (#121518) and 1.66:1 on the sheet, in the explorer and in #rules.
- .entropy-edge-base #8b8e92 at 0.55 opacity: 2.55:1.
- .history-edge-old at 0.60: 2.83:1.
- .kind-toggle border: 1.66:1 in both states. The text changes from #b4b1a9 to #8b8e92, only 1.54:1 apart.
These are partly offset by other cues. The bays have 5.6:1 labels and spatial grouping. Unpressed toggles also get a dashed border and a faded sample line; out/a9-toggles.png shows the state is still readable. The module boundary is the strongest 1.4.11 case: in a section about boundaries, it is the only visible outline of a module.
- Verified fix: In globals.css:
- Line 713, in .plan-bay rect: replace `stroke: var(--color-rule-strong);` with `stroke: var(--color-ink-faint); stroke-opacity: 0.75;` (3.68:1 on the bay fill, computed).
- Line 960: .entropy-edge-base { opacity: 0.8; }. Line 1153: .history-edge-old { opacity: 0.8; }. Both give 4.11:1.
- After line 668, add .kind-toggle[aria-pressed="true"] { border-color: var(--color-ink-faint); }. Pressed then shows a solid 5.79:1 border, unpressed a dashed 1.66:1 one.

## A10 — CONFIRMED (major) — architecture
- File: site/components/sections/Architecture.tsx
- Problem: The text-alternative table ('Read the graph as a table') sits in an overflow-x-auto wrapper with nothing focusable in it. On phones it scrolls horizontally but cannot be reached or scrolled by keyboard in browsers that do not make scrollers focusable automatically, such as Safari. The default axe run misses it because the <details> starts closed.
- Evidence: misc.mjs at 390px with details.table-alternative opened: axe-core reports scrollable-region-focusable (serious) on '.overflow-x-auto'. The table is 640px wide inside a 358px wrapper with tabIndex -1 and no focusable children. At 1440 there is no overflow and no violation.
- Reviewer fix: Architecture.tsx line 18: `<div className='mt-4 overflow-x-auto' tabIndex={0} role='region' aria-label='Graph as a table'>`.
- Verifier: Reproduced at 390 with details.table-alternative open (misc2.mjs). axe reports scrollable-region-focusable (serious) on .overflow-x-auto. The wrapper's scrollWidth is 640 against a clientWidth of 358, its tabIndex is -1, and it has no focusable descendants. Edge 154 makes the scroller focusable on its own: Tab reached it and ArrowRight scrolled it 120px (scroller.mjs). The keyboard failure is therefore in Safari, which does not make scrollers focusable; in Chromium the stop simply has no name. This is a Level A (2.1.1) gap in a mainstream browser at phone widths or high zoom, and the fix is one line.
- Verified fix: Architecture.tsx line 18: <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Graph as a table">. The base :focus-visible outline already styles it.

## A11 — CONFIRMED (minor) — global
- File: site/app/globals.css
- Problem: In Windows High Contrast (forced colors), three selected states disappear because they depend on background colour or box-shadow, which forced colors overrides or removes: the Members/Modules segmented control, the checked Gravity member and the current Entropy commit.
- Evidence: forced.mjs (forcedColors 'active'):
- out/forced-explorer-toolbar.png: Members and Modules look identical.
- out/forced-gravity-choices.png: the checked PaymentService stands out only while focused.
- out/forced-commit-log.png: +2 is pressed but has no mark.
Computed styles: the pressed segment's background is rgb(0,0,0), the same Canvas as unpressed; .commit[aria-pressed=true] has box-shadow 'none'. Kind toggles (dashed vs solid border), command tabs and the SVG drawings keep their states.
- Reviewer fix: Add to globals.css (verified, out/forced-fixed-*.png): `@media (forced-colors: active) { .segmented > button[aria-pressed='true'], .choice[aria-checked='true'], .commit[aria-pressed='true'] { forced-color-adjust: none; background: Highlight; color: HighlightText; } .choice[aria-checked='true'] .data, .commit[aria-pressed='true'] .data { color: HighlightText; } }`.
- Verifier: Reproduced with forcedColors 'active' (misc2.mjs). The pressed segment, the checked choice and the pressed commit compute background rgb(0,0,0), against transparent when not selected; both render as Canvas. The commit's box-shadow becomes none. In the screenshots, Members and Modules look identical, Database is not marked and +2 is not marked. Kind toggles keep their dashed/solid difference. The proposed CSS only works if it is not inside a layer. Tested inside @layer components, where the rest of globals.css lives, the commit's '+2' span keeps .text-ink-faint from the utilities layer: rgb(139,142,146) on Highlight rgb(26,235,255), about 2.3:1. This happens because forced-color-adjust: none is inherited. Unlayered, the span becomes rgb(0,0,0) (forced.mjs). Forced colors is not a WCAG requirement, and the plan's mode and the gravity readout show the selection in other ways.
- Verified fix: Append at the very end of globals.css, outside every @layer:
@media (forced-colors: active) {
  .segmented > button[aria-pressed="true"], .choice[aria-checked="true"], .commit[aria-pressed="true"] { forced-color-adjust: none; background: Highlight; color: HighlightText; }
  .choice[aria-checked="true"] .data, .commit[aria-pressed="true"] .data { color: HighlightText; }
}
If this goes inside @layer components, the second rule loses to .text-ink-faint and the +2 and base labels stay grey on Highlight. If B7 changes these attributes, update the selectors to match.

## A12 — CONFIRMED (minor) — top
- File: site/components/drawing/LoadDrawing.tsx
- Problem: Every LoadDrawing declares <pattern id='ground-hatch'>, so the page has three elements with the same id. url(#ground-hatch) resolves to the first one, and on phones that one sits inside the display:none desktop hero drawing. The hatched ground is therefore not painted under the hero or the Impact drawing on phones.
- Evidence: semantics.mjs: duplicate id 'ground-hatch' x3; at 390 the first definition is in a display:none subtree. hatch.mjs crops: out/hatch-1440-impact.png shows the hatch, while out/hatch-390-top.png and out/hatch-390-impact.png show only the bare ground line.
- Reviewer fix: In LoadDrawing: `import { useId } from 'react'`, then `const hatchId = useId();`. Line 169: `id={hatchId}`. Line 198: `fill={`url(#${hatchId})`}`.
- Verifier: Confirmed: id='ground-hatch' appears 3 times (misc1.mjs). At 390, the first definition is inside the display:none member drawing, and url(#ground-hatch) resolves to it, so the pattern is not painted. out/a12-390-top.png and out/a12-390-impact.png show only the ground line; out/a12-1440-top.png shows the hatch. A decorative mark of the visual direction is missing on phones, and the page has invalid duplicate ids. useId in React 19.3 returns '_r_..._' (checked in the react-dom 19.3.0 source), which is safe inside url(#...).
- Verified fix: In LoadDrawing.tsx: add useId to the react import and declare `const hatchId = useId();`. Line 169: `id={hatchId}`. Line 198: fill={`url(#${hatchId})`}.

## A13 — CONFIRMED (minor) — impact
- File: site/components/sections/ImpactStage.tsx
- Problem: SVG labels shrink with their drawings. Three drawings keep their desktop layout on phones, so their labels become unreadable: Impact (all 16 members), the Rules violation drawing and the Gravity tributary. Text alternatives exist (the path list and the violation report), so nothing is lost, but the drawings stop communicating on phones. The hero already switches to a module drawing for this reason.
- Evidence: reflow.mjs, rendered font size = CSS size x SVG scale. At 390px: #impact 4.7-6.1px, #rules 5.5-6.5px, #gravity 7.4-8.9px (hero 7.5-12.7px). At 320px: impact 3.8-4.9px, rules 4.3-5.1px, gravity 5.9-7.2px.
- Reviewer fix: - Impact: wrap the LoadDrawing at ImpactStage.tsx line 89 in `<div className='overflow-x-auto' tabIndex={0} role='region' aria-label='Impact drawing'><div className='min-w-[36rem]'>…</div></div>` (labels about 9.9px), or render a module-scale drawing below 640px as HeroStage does.
- Rules, in globals.css: `@media (max-width: 639px) { #rules .plan-label { font-size: 20px; } #rules .plan-bay-label { font-size: 15px; } #rules .rules-label { font-size: 17px; } }` (about 10.4, 7.8 and 8.9px; the labels still fit their 176-unit bays).
- Gravity: line 141 becomes `style={{ fontSize: isSelected ? 'var(--trib-lg, 14px)' : 'var(--trib-sm, 11.5px)' }}`, with `@media (max-width: 639px) { #gravity figure { --trib-sm: 17px; --trib-lg: 20px; } }`. Alternate label offsets on rows of five so they do not collide.
- Verifier: Measured as rendered font size = CSS size × CTM scale (verify-a11y/labels.mjs). At 390: impact 4.7-6.1px, rules 5.5-6.5px, gravity 7.4-8.9px. At 320: 3.8-4.9, 4.3-5.1 and 5.9-7.2px. The reviewer missed one case: the hero's member drawing measures 5.3-7.4px at 768-1023px, because the switch to it happens at md. The path list, the violation report and the term readouts next to each drawing carry the same information, and pinch-zoom works on these non-interactive drawings, so there is no WCAG failure. But the drawings themselves are not legible on phones.
- Verified fix: Apply the reviewer's three changes:
- Impact (ImpactStage.tsx:89): wrap the drawing in <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Impact drawing"><div className="min-w-[36rem]">...</div></div>. MEMBER_FRAME is 760 wide, so labels come out at about 9.9px.
- Rules: @media (max-width: 639px) { #rules .plan-label { font-size: 20px; } #rules .plan-bay-label { font-size: 15px; } #rules .rules-label { font-size: 17px; } }. The labels still fit their 176-unit bays.
- Gravity: per-size CSS variables for the 11.5px and 14px labels, with alternating offsets so rows of five do not collide.
Also move the hero's member/module switch from md to lg in HeroDrawing.tsx: line 89 'mt-auto hidden pt-12 lg:block', line 95 'hidden lg:block', line 107 'lg:hidden', line 121 'mt-4 lg:hidden'. The module drawing then gives labels of about 15px at 768-1023.

## A14 — CONFIRMED (minor) — architecture
- File: site/components/sections/ArchitectureExplorer.tsx
- Problem: At fitted scale the explorer svg has touch-action: pan-y. That turns off pinch-zoom for gestures that start on it, and the plan has no pinch handler of its own, so a pinch on the explorer does nothing. On phones the explorer spans the full content width and its Members-mode labels are about 4.5px. Page scrolling is not trapped (verified), so this is not a WCAG failure, but the most natural gesture for reading the plan silently fails.
- Evidence: pinch.mjs, two-finger pinch via raw CDP touch events at 390x844 (isMobile, hasTouch): on section text, visualViewport.scale becomes 5.00; on the explorer (computed touch-action 'pan-y') it stays 1.00 and the plan transform is unchanged. In Members mode at 390, .plan-label is 12.5 units x 0.358 ≈ 4.5px and the hit circles are 11.5px. For comparison (swipe2.mjs): at fit, a vertical swipe on the explorer scrolls the page 267px (249px on text); when zoomed, touch-action: none pans the plan, as designed.
- Reviewer fix: Line 231: change `${view.scale > 1 ? 'touch-none' : 'touch-pan-y'}` to `${view.scale > 1 ? 'touch-none' : 'touch-pan-y touch-pinch-zoom'}` (computed touch-action: pan-y pinch-zoom). Optionally map a two-pointer pinch on the svg to zoomAt().
- Verifier: Reproduced with raw CDP two-finger pinches at 390 (mobile, touch; verify-a11y/pinch.mjs). A pinch on section text sets visualViewport.scale to 5.00. A pinch on the explorer (touch-action pan-y) leaves it at 1.00, and drags the plan sideways to translate(337px, 0) instead. With 'pan-y pinch-zoom' injected, the same pinch gives 5.00. Tailwind 4.3 combines touch-pan-y and touch-pinch-zoom into touch-action: var(--tw-pan-x,) var(--tw-pan-y,) var(--tw-pinch-zoom,), so the class change is enough. Phones open the explorer in Modules mode (labels about 12px), and the visible touch hint points to + and −, so this is a UX gap rather than a WCAG failure.
- Verified fix: ArchitectureExplorer.tsx line 231: change `${view.scale > 1 ? "touch-none" : "touch-pan-y"}` to `${view.scale > 1 ? "touch-pinch-zoom" : "touch-pan-y touch-pinch-zoom"}`. At fit this gives touch-action 'pan-y pinch-zoom', which I verified. When zoomed, 'pinch-zoom' still sends single-finger drags to the pan handler while letting a pinch zoom the page.

## A15 — CONFIRMED (minor) — global
- File: site/components/drawing/LoadDrawing.tsx
- Problem: Keyboard users face 93 Tab stops at 1440px. 32 are individual drawing members (16 in the hero, 16 in the explorer) and 10 are elements that neither act nor scroll. Getting from the hero CTAs to the next section takes 16 extra Tabs; getting through the explorer takes 26. Hero members are ordered by module, not by position, so focus jumps around the drawing.
- Evidence: tabwalk.mjs at 1440: 93 stops. The hero has 18 (2 CTAs plus 16 members); the architecture section has 26 (8 toolbar controls, the sheet, 16 members, the summary).
Stops that neither act nor scroll (scrollWidth equals clientWidth):
- li.pipeline-stage x5 (Pipeline.tsx:80)
- pre.code-block-body x4 (CodeBlock.tsx:41, CommandShowcase.tsx:112)
- ol.history x1 (History.tsx:18)
Hero order: ApiGateway (1038,160) -> AuthService (1264,460) -> SessionStore (1262,531) -> CheckoutController (770,221) -> CheckoutService (734,282) -> …
- Reviewer fix: - Use a roving tabindex in LoadDrawing and ArchitectureExplorer: only the active member, or the first by level then x, gets `tabIndex={0}`; the rest get -1. On the <svg>, onKeyDown moves focus to the nearest member in the arrow's direction (compare member x/y), with Home/End for the first and last. Selection follows focus. This removes about 30 stops.
- Remove `tabIndex={0}` and its :focus-visible styling from li.pipeline-stage (Pipeline.tsx:80).
- Make the pre blocks and ol.history focusable only when they overflow (a small useOverflow hook comparing scrollWidth > clientWidth). When they are focusable, add `role='region'` and an `aria-label` (the block's label).
- Verifier: The walk counted 93 stops at 1440. The hero has 2 CTAs plus 16 members, and the architecture section has 26. li.pipeline-stage (Pipeline.tsx:80, tabIndex 0) does nothing on focus except change its style. The four <pre> blocks and ol.history are focusable even where they do not overflow (at 1440). This is not a WCAG failure: the skip link and headings provide bypass, and focusing a member does show content. Removing the tabIndex from pre and ol outright would break keyboard scrolling in Safari at phone widths (Chromium makes scrollers focusable automatically, Safari does not), so make it conditional.
- Verified fix: - Pipeline.tsx:80: remove tabIndex={0}. Drop the :focus-visible parts of the pipeline-stage rules in globals.css (565, 569-572, 585).
- CodeBlock.tsx:41, CommandShowcase.tsx:112 and History.tsx:18: make the element focusable only when it overflows. Use a small hook: const [scrolls, setScrolls] = useState(false); useEffect(() => { const el = ref.current!; const check = () => setScrolls(el.scrollWidth > el.clientWidth); check(); const ro = new ResizeObserver(check); ro.observe(el); return () => ro.disconnect(); }, []); then spread {...(scrolls ? { tabIndex: 0, role: "region", "aria-label": label } : {})}. History.tsx is a server component, so move the list into a small client wrapper.
- Optional, larger change: a roving tabindex for the 16 hero members and the 16 explorer members, giving one tab stop each, with arrow keys moving to the nearest member in that direction. The explorer sheet's own arrow handler already ignores keys pressed on members (event.target !== currentTarget).

## B1 — CONFIRMED (minor) — architecture
- File: site/app/globals.css
- Problem: SVG members set outline: none. Their only focus cue is the joint's thin stroke turning from chalk to blue (a 2.08:1 change) on a 12-15px circle. It is visible but weak in a dense plan, well short of the 2.4.13 focus-appearance guidance. In the hero, the lit load path hides this, because focus there also activates the member.
- Evidence: focusring.mjs: the explorer joint is 15.3px across at 1440 and 11.7px at 820. On focus the stroke becomes rgb(62,166,255) at 2.6 units instead of chalk at 1.5. Crops: out/focus-820-explorer-before.png and out/focus-820-explorer-after.png. Every HTML stop uses outline 2px solid #3EA6FF (7.36:1).
- Reviewer fix: Add a ring on the hit circle, next to lines 299 and 818: `.plan-member:focus-visible .plan-hit, .drawing-member:focus-visible .drawing-hit { stroke: var(--color-load); stroke-width: 1.5; }`. That draws a ring of about 32 units in the explorer and r+9 in the hero around the joint.
- Verifier: Confirmed in CSS (globals.css 299-302 and 818-821) and in the reviewer's crops. When an explorer member gets focus, its 6.5-radius joint changes from a 1.5 chalk stroke to a 2.6 load-blue stroke; the two colours are only 2.08:1 apart. The member itself has outline: none. This meets 2.4.7 but is weak in a dense plan, well short of 2.4.13 (AAA).
- Verified fix: In globals.css, next to lines 299 and 818, add: .plan-member:focus-visible .plan-hit, .drawing-member:focus-visible .drawing-hit { stroke: var(--color-load); stroke-width: 1.5; }. This draws a ring at r=16 in the explorer and at r+9 in the hero. Where the ring meets a label, the label's sheet-coloured halo paints over it.

## B2 — CONFIRMED (minor) — architecture
- File: site/components/sections/ArchitectureExplorer.tsx
- Problem: The explorer's keyboard controls (+/− zoom, arrows pan, 0 fit) are described only in the sheet's aria-label, so sighted keyboard users never see them. There are no pan buttons, so after zooming with the buttons a keyboard user cannot pan without discovering the arrow keys. In Modules mode the label still says 'Tab to reach members', but there are none.
- Evidence: Visible hint (lines 396-400): 'Drag to pan. Hold Ctrl or Cmd and scroll to zoom.' for fine pointers, or 'Zoom with + and −, then drag to pan.' for touch. Sheet aria-label: 'Architecture plan of the demonstration system. Use plus and minus to zoom, arrow keys to pan, Tab to reach members.' The keys themselves work (keyops C1: '+' gives scale(1.2), ArrowLeft moves x by +27.8, '0' resets).
- Reviewer fix: Add a third hint after the sheet: `<span className='hint-keyboard'>Focused plan: + and − zoom, arrow keys pan, 0 fits.</span>`, with `.hint-keyboard { display: none } .explorer-sheet:focus-visible + p .hint-keyboard { display: inline } .explorer-sheet:focus-visible + p :is(.hint-mouse, .hint-touch) { display: none }`. Point the sheet's `aria-describedby` at that span instead of putting the instructions in aria-label, and drop 'Tab to reach members' when mode === 'modules'.
- Verifier: Confirmed. At 1440 the visible hint reads 'Drag to pan. Hold Ctrl or Cmd and scroll to zoom.' (hint-touch is display:none). The keys (+, −, arrows, 0) are listed only in the sheet's fixed aria-label. That label still says 'Tab to reach members' in Modules mode, where members have tabIndex -1. The keys themselves work.
- Verified fix: In ArchitectureExplorer.tsx, shorten the sheet's aria-label to "Architecture plan of the demonstration system" and add aria-describedby={keysId}, with keysId from useId. Inside the hint <p> (line 396), add <span id={keysId} className="hint-keyboard">{mode === "members" ? "Plan focused: + and − zoom, arrow keys pan, 0 fits, Tab reaches members." : "Plan focused: + and − zoom, arrow keys pan, 0 fits."}</span>. In globals.css add: .hint-keyboard { display: none; } .explorer-sheet:focus-visible + p .hint-keyboard { display: inline; } .explorer-sheet:focus-visible + p :is(.hint-mouse, .hint-touch) { display: none; }. aria-describedby still reads a target that is display:none.

## B3 — CONFIRMED (minor) — rules
- File: site/components/ui/CodeBlock.tsx
- Problem: The three copy buttons all have the accessible name 'Copy'. aria-live is on the button itself, so the change to 'Copied' may be announced twice or not at all. A clipboard failure (denied permission, insecure context) shows no feedback. The button also sits inside <figcaption>, so the figure's name is 'katedrala.config.yamlCopy'.
- Evidence: semantics.mjs: buttons with duplicate names 'Copy' x3 (rules, evidence, developers), each a <button class='code-copy' aria-live='polite'>. misc2.mjs with navigator.clipboard.writeText rejected: the button still reads 'Copy' and nothing else appears. Copying itself works (keyops H1: 407, 706 and 241 characters copied, '$ ' prompts stripped).
- Reviewer fix: Lines 37-39: `<button type='button' onClick={copy} className='code-copy'>{state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}<span className='sr-only'> {label}</span></button>`. Add a separate `<span role='status' className='sr-only'>{state === 'copied' ? `${label} copied` : state === 'failed' ? 'Copy failed, select the code and press Ctrl+C' : ''}</span>`. Set state to 'failed' in the catch. Move the button out of <figcaption> into the header row beside it, so the figure's name is just the label.
- Verifier: AX tree (misc2.mjs, figs.mjs): there are three buttons named 'Copy' (rules, evidence, developers), and each carries aria-live on the button itself. The catch block calls setCopied(false), so a rejected clipboard write shows nothing. One part did not reproduce: in Edge 154 the code-block figures have an empty accessible name. The figcaption's textContent is 'katedrala.config.yamlCopy', but it is not used as the name, so the 'figure named ...Copy' claim depends on the browser engine.
- Verified fix: In CodeBlock.tsx:
1) Replace the boolean with const [state, setState] = useState<"idle" | "copied" | "failed">("idle").
2) In copy(), set "copied" on success and "failed" in the catch, resetting to idle after 1600ms in both cases.
3) Lines 37-39: <button type="button" onClick={copy} className="code-copy">{state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}<span className="sr-only"> {label}</span></button>, without aria-live. The accessible name becomes 'Copy katedrala.config.yaml' and still starts with the visible text.
4) Add <span role="status" className="sr-only">{state === "copied" ? `${label} copied` : state === "failed" ? "Copy failed. Select the code and press Ctrl+C." : ""}</span>.
Optionally, make the header a <div> and put aria-label={label} on the <figure>.

## B4 — CONFIRMED (minor) — impact
- File: site/components/drawing/LoadDrawing.tsx
- Problem: Non-interactive drawings (Impact) keep role='group' and an aria-label, but all their members are aria-hidden, so the accessibility tree holds a named group with no children. Screen readers in browse mode often skip empty groups, so 'Impact of changing PaymentService: 6 members depend on it' may never be read.
- Evidence: impact.mjs, CDP Accessibility.getFullAXTree: group 'Impact of changing PaymentService: 6 members depend on it', ignored false, 0 children, with 20 aria-hidden members inside.
- Reviewer fix: LoadDrawing.tsx line 163: `role={interactive ? 'group' : 'img'}`.
- Verifier: Confirmed in the AX tree (misc2.mjs): the group 'Impact of changing PaymentService: 6 members depend on it' has 0 unignored children. With interactive={false} every member is aria-hidden, and the edges and level lines expose nothing. Screen readers in browse mode can skip an empty group. The same count appears in the visible readout.
- Verified fix: LoadDrawing.tsx line 163: role={interactive ? "group" : "img"}.

## B5 — CONFIRMED (minor) — developers
- File: site/app/globals.css
- Problem: Below 1024px the command tablist becomes one horizontal row with its scrollbar hidden. On phones 'validate' is cut off and 'diff' is invisible, with no fade, arrow or scrollbar to show there is more. aria-orientation stays 'vertical' while the tabs sit in a row; both arrow pairs work, so this part is cosmetic.
- Evidence: misc.mjs at 390: tablist scrollWidth 468 vs clientWidth 358, scrollbar-width none, flex-direction row, aria-orientation vertical; 'validate' is cut and 'diff' is outside. At 320: 468 vs 288. out/tabs-390.png reads 'analyze · health · impact · valida'.
- Reviewer fix: In the @media (max-width: 1023px) block (lines 1274-1300): `.command-schedule { flex-wrap: wrap; overflow-x: visible; column-gap: 1rem; }` so all five tabs show on two lines. Optionally drop aria-orientation, or set it from matchMedia('(min-width: 1024px)').
- Verifier: At 390 (misc2.mjs), the tablist has a scrollWidth of 468 against a clientWidth of 358, with scrollbar-width none, flex-direction row and aria-orientation vertical. Tab positions: analyze 0-101, health 101-193, impact 193-284, validate 284-395 (cut off at 358), diff 395-468 (out of view). Nothing shows that more tabs exist, although arrow keys and swiping still reach them.
- Verified fix: In globals.css, in the @media (max-width: 1023px) .command-schedule rule (lines 1275-1280), replace overflow-x: auto and scrollbar-width: none with flex-wrap: wrap; overflow-x: visible;. The tabs' 1rem right padding already separates them. All five then fit on two rows at 390 (284px + 184px), and at 320 too (284px fits the 288px column). Optionally, set aria-orientation from matchMedia("(min-width: 1024px)").

## B6 — CONFIRMED (minor) — architecture
- File: site/components/sections/ArchitectureExplorer.tsx
- Problem: Panning has no limits. A single horizontal swipe or drag, even at fitted scale, can move the whole plan out of the sheet. That leaves an empty rectangle with no hint that 'Fit' restores it. Arrow-key panning is unbounded too.
- Evidence: misc2.mjs at 390 (touch): one horizontal swipe on the sheet at fit gives the plan translate(-943.82px, 0px) scale(1). out/explorer-dragged-away.png shows an empty sheet.
- Reviewer fix: Clamp every view update so at least half the plan stays in view: `const clamp = (v: View): View => ({ ...v, x: Math.min(PLAN.width / 2, Math.max(PLAN.width * (0.5 - v.scale), v.x)), y: Math.min(PLAN_HEIGHT / 2, Math.max(PLAN_HEIGHT * (0.5 - v.scale), v.y)) });`. Apply it in onPointerMove (`setView(clamp({ ...d.view, x: …, y: … }))`), in the arrow-key handlers and in zoomAt.
- Verifier: Reproduced (explorer.mjs): at 390 and at fit scale, one horizontal CDP swipe on the sheet gives translate(-842.697px, 0px) scale(1). The plan leaves the sheet entirely, and only Fit or the 0 key brings it back. Arrow-key panning and zoomAt have no bounds either.
- Verified fix: In ArchitectureExplorer.tsx, add: const clamp = (v: View): View => ({ ...v, x: Math.min(PLAN.width / 2, Math.max(PLAN.width * (0.5 - v.scale), v.x)), y: Math.min(PLAN_HEIGHT / 2, Math.max(PLAN_HEIGHT * (0.5 - v.scale), v.y)) });. This keeps at least half the sheet covered at any scale of 0.5 or more, and MIN_SCALE is 0.6. Apply it:
- in zoomAt: return clamp({ scale, x: ..., y: ... });
- in onPointerMove: setView(clamp({ ...d.view, x: d.view.x + dx, y: d.view.y + dy }));
- in the four arrow handlers, for example setView((v) => clamp({ ...v, x: v.x + step })).

## B7 — CONFIRMED (minor) — architecture
- File: site/components/sections/ArchitectureExplorer.tsx
- Problem: Several controls announce states they do not honour:
- Members/Modules and the six Entropy commits are mutually exclusive but use aria-pressed toggle buttons; pressing the pressed one does not unpress it.
- The last pressed relationship-kind toggle silently ignores clicks.
- The zoom buttons stay enabled at the 0.6 and 3.2 limits.
- Evidence: keyops C6: with 'calls' and 'instantiates' off, Enter on 'accesses data' leaves aria-pressed=true with no feedback (toggleKind keeps size > 1, lines 139-145). AX tree: button 'Members' pressed=true; button 'base Clean structure' pressed=true. MIN_SCALE 0.6 and MAX_SCALE 3.2 have no disabled state.
- Reviewer fix: - Segmented control: make it `role='radiogroup' aria-label='Scale'` with `role='radio' aria-checked` and arrow keys (as in A5), or keep plain buttons and replace aria-pressed with `aria-current={mode === m}`.
- Commits (EntropyStage.tsx:142 and :154): replace aria-pressed with `aria-current={step === i + 1 ? 'step' : undefined}`.
- Last kind toggle: `aria-disabled={kinds.size === 1 && kinds.has(kind)}` plus a visible note 'At least one kind stays on'.
- Zoom: `disabled={view.scale >= MAX_SCALE}` and `disabled={view.scale <= MIN_SCALE}`.
- Verifier: Confirmed (explorer.mjs):
- After 13 'Zoom in' clicks the scale is 3.2 and the button is still enabled.
- With 'calls' and 'instantiates' off, clicking 'accesses data' leaves aria-pressed=true with no feedback, because toggleKind keeps at least one kind.
- Clicking the already pressed 'Members' leaves it pressed. That is normal for a mutually exclusive segmented control and, on its own, only a question of semantics.
- Verified fix: - Zoom (lines 199-214): add aria-disabled={view.scale >= MAX_SCALE} to Zoom in and aria-disabled={view.scale <= MIN_SCALE} to Zoom out, plus .zoom-button[aria-disabled="true"] { opacity: 0.4; cursor: not-allowed; }. Use aria-disabled, not disabled: disabling the button that has focus drops keyboard focus to <body>. zoomAt already clamps the scale, so clicks at the limit do no harm.
- Last kind: either allow it to turn off (toggleKind: if (next.has(kind)) next.delete(kind); else next.add(kind);), or add aria-disabled={kinds.size === 1 && kinds.has(kind)} and a visible note, 'At least one kind stays on'.
- Optional: give the segmented control and the commits radio-group semantics (as in A5) or aria-current. If those attributes change, update the CSS selectors that use aria-pressed (globals.css 649, 653, 1016) and the forced-colors rule from A11.

## B8 — CONFIRMED (minor) — footer
- File: site/components/site/Footer.tsx
- Problem: The same link text leads to two different places: 'Architecture' is the in-page #architecture in the nav but docs/ARCHITECTURE.md in the footer. The 'Get started' links go to the GitHub README, and their accessible names never say so because the ↗ mark is aria-hidden.
- Evidence: semantics.mjs: 'Architecture' -> #architecture and https://github.com/tedddby/Katedrala/blob/main/docs/ARCHITECTURE.md. 25 visible links, 18 external, all in the same tab. 'Get started' (Navbar.tsx:43, FinalCta.tsx:18) -> https://github.com/tedddby/Katedrala#readme.
- Reviewer fix: Footer.tsx line 17: label it 'Architecture document'. In Button.tsx, give ExternalMark `<span className='sr-only'> (GitHub)</span>` for github.com hrefs, or name the CTAs 'Get started on GitHub'.
- Verifier: Confirmed (misc2.mjs): 'Architecture' links to #architecture in the nav and to .../docs/ARCHITECTURE.md in the footer. The 'Get started' links (Navbar.tsx:44 and :78, FinalCta.tsx:18) go to the GitHub README, and their only cue is the aria-hidden ↗. The footer link sits inside nav 'Documentation', so SC 2.4.4 (link purpose in context) passes. The problem is ambiguity in a screen reader's list of links (SC 2.4.9, AAA).
- Verified fix: Footer.tsx line 17: { label: "Architecture document", href: LINKS.architecture }. For the 'Get started' CTAs only (Navbar.tsx:43-45 and the mobile menu link at 72-79, FinalCta.tsx:18), append <span className="sr-only"> on GitHub</span> after the visible text. Do not add it inside Button.tsx: 'View on GitHub' would then be announced as 'View on GitHub on GitHub'.

## B9 — CONFIRMED (minor) — developers
- File: site/components/sections/CommandShowcase.tsx
- Problem: The terminal prompt '$' is text set in graphite (#5D6166, 3.06:1 on the sheet). It is the only text on the page that uses graphite.
- Evidence: colour.mjs text scan: the only graphite text is '$' in #developers (span.select-none.text-graphite, CommandShowcase.tsx:123). CodeBlock.tsx:61 does the same for shell blocks.
- Reviewer fix: CommandShowcase.tsx:123 and CodeBlock.tsx:61: change `text-graphite` to `text-ink-faint` (about 6:1 on #0A0B0D) and keep select-none.
- Verifier: Confirmed: the '$ ' prompt in the Developers terminal computes rgb(93,97,102) (graphite) on the code block's #0a0b0d, which is 3.16:1 (3.06:1 on the sheet), below the 4.5:1 needed for text. It is the only graphite text on the page. The shell branch at CodeBlock.tsx:61 is currently unused, because no CodeBlock on the page has language="shell".
- Verified fix: CommandShowcase.tsx:123 and CodeBlock.tsx:61: change text-graphite to text-ink-faint (5.98:1 on #0a0b0d) and keep select-none.

## B10 — CONFIRMED (minor) — open-source
- File: site/components/sections/OpenSource.tsx
- Problem: The milestone diagram's accessible name is ungrammatical when exactly one milestone is done.
- Evidence: semantics.mjs: svg role=img named '1 milestones done, 3 in progress, 11 planned'.
- Reviewer fix: Line 65: `aria-label={`${counted(done, 'milestone')} done, ${inProgress} in progress, ${MILESTONES.length - done - inProgress} planned`}`, importing counted from @/lib/text.
- Verifier: Confirmed on the live page: the aria-label reads '1 milestones done, 3 in progress, 11 planned', because MILESTONES has exactly one done item. The visible sentence ('1 of 15 milestones done') is correct.
- Verified fix: OpenSource.tsx: import { counted } from "@/lib/text"; line 65: aria-label={`${counted(done, "milestone")} done, ${inProgress} in progress, ${MILESTONES.length - done - inProgress} planned`}.

## B11 — CONFIRMED (minor) — gravity
- File: site/components/sections/GravityStage.tsx
- Problem: The tributary drawing's text alternative gives only a count. Which members rest on the selected one, and how far away, is shown only visually.
- Evidence: aria-label: 'Database carries 13 members of the demonstration system, stacked above it by distance.' The term list gives only numbers ('13 of 15 rest on it').
- Reviewer fix: In describe() (lines 208-212), build the text from tributary()'s rows grouped by distance, e.g. 'Database carries 13 members: directly OrderRepository, PaymentRepository, SessionStore, UserRepository; at two steps …'. Return the rows from tributary() and join them.
- Verifier: Confirmed: the aria-label reads 'PaymentService carries 6 members of the demonstration system, stacked above it by distance.' (and 'Database carries 13 members ...'). Which members rest on the selected one, and how far away, is the whole content of the figure, and it is shown only visually. No other text on the page lists these transitive dependents.
- Verified fix: In GravityStage.tsx:
1) Return the rows from tributary(): return { positions, edges, count: above.size, rows };
2) Rewrite describe():
function describe(id: string, rows: Map<number, string[]>): string {
  if (rows.size === 0) return `${id}: nothing in the demonstration system rests on it.`;
  const count = [...rows.values()].reduce((n, r) => n + r.length, 0);
  const tiers = [...rows].sort(([a], [b]) => a - b).map(([d, names]) => `${d === 1 ? "directly" : `${d} steps away`}: ${names.join(", ")}`);
  return `${id} carries ${counted(count, "member")}. ${tiers.join("; ")}.`;
}
3) Use aria-label={describe(selected, view.rows)} and import counted from @/lib/text.

## B12 — CONFIRMED (minor) — top
- File: site/app/globals.css
- Problem: The hero drawing is server-rendered in its final state but hidden by CSS (data-settle='pending') until hydration, or until a 3.5s failsafe. On slow CPUs this has two effects. Reduced-motion users wait for hydration even though no animation will play. With motion allowed, the failsafe first shows the final drawing, then hydration scatters it and replays the settle, so content already on screen flies apart. These timings come from the Next dev server, which hydrates more slowly than production; the window will be shorter there, but the logic flaw remains.
- Evidence: motion2.mjs sampled the opacity and data-settle of a hero member every frame at 1440:
- 4x CPU, no-preference: opacity 0 from 557ms (first paint) to 4353ms (failsafe), then running at 4988ms and done at 6848ms.
- 4x CPU, reduce: hidden from 558ms to 4365ms.
- 6x CPU, no-preference: hidden from 1467ms to 5382ms, re-settling from 8572ms to 10812ms.
- 1x CPU: hidden from 775ms to 1394ms.
Reduced motion is otherwise respected (motion.mjs): one position with no scatter, transitions 0.001s, Impact rings all shown at +60ms, terminal animation none, anchor jumps instant, scroll-behavior auto.
- Reviewer fix: - globals.css lines 305-308: wrap the `:root[data-js] .drawing[data-settle='pending']` rule in `@media (prefers-reduced-motion: no-preference) { … }`.
- In useSettle (LoadDrawing.tsx, around line 330), skip the scatter if the failsafe already revealed the drawing: `const first = memberRefs.current.values().next().value; if (first && getComputedStyle(first).opacity === '1') { figure.dataset.settle = 'done'; return; }`.
- Verifier: Confirmed in the code and on the page. globals.css 305-308 hides the hero members whenever :root[data-js] is set, whatever the motion preference. The reduced-motion block shortens animation durations but keeps the 3.5s delay. Measured on the dev server (verify-a11y/settle.mjs):
- reduce, 4x CPU: the hero member has opacity 0 until 2428ms, i.e. until hydration.
- reduce, 1x CPU: hidden until 458ms.
- motion allowed, 4x CPU: hidden until 2533ms.
The 'shown by the failsafe, then scattered again' case only occurs when hydration takes longer than 3.5s; the reviewer saw it at 6x CPU. Production hydrates faster than the dev server.
- Verified fix: - globals.css 305-308: wrap the :root[data-js] .drawing[data-settle="pending"] rule in @media (prefers-reduced-motion: no-preference) { ... } and leave the @keyframes outside it.
- In useSettle (LoadDrawing.tsx, after the reduced-motion check at line 334), skip the scatter if the failsafe has already shown the drawing. Check the CSS animation rather than computed opacity: opacity is unreliable here because of the 180ms opacity transition on .drawing-member and because React StrictMode runs effects twice in dev.
const failsafe = memberRefs.current.values().next().value?.getAnimations().find((a) => a instanceof CSSAnimation && a.animationName === "drawing-failsafe");
if (failsafe?.playState === "finished") { figure.dataset.settle = "done"; return; }

# copy-edit

Checked: I read every source file that renders copy: app/layout.tsx and page.tsx, all components (hero, sections, drawing, site, ui) and lib/site.ts, lib/text.ts and lib/demo/*.ts. I checked them against the brief, PRODUCT.md, docs/ARCHITECTURE.md, IR.md and ROADMAP.md, the plugin-api contracts, the engine's analyzeStructure API, fixtures/dependency-violations/katedrala.config.yaml, designs/metrics.md, and the real CodeVerse document (codeverse-structure.json, commit 6b942bc).

I drove the live page (localhost:3100) with Playwright in Edge, in my scratch folder (collect.mjs, fit.mjs; output in collected.json). At 1440 px, with reduced motion, I collected all visible text, aria-labels and options. I also captured every dynamic state:
- 16 hero member cards
- 16 explorer member details plus both summaries and the table
- 5 Gravity choices
- 6 Entropy steps
- 16 Impact targets
- 5 terminal transcripts
- the History cards
- at 390 px, the mobile hero idle card and 8 module cards

Results of the scans:
- No em dashes or en dashes anywhere in the rendered copy or the site source; the only special dash is a correct minus sign (U+2212) on the zoom button.
- The page uses American spelling (analyze, normalized, visualization, artifacts, toward, license). The one outlier is "neighbourhood".

I measured lede, caption and footnote line counts at 1440 px. Ten section ledes run 3 lines and the Ecosystem lede runs 4. I measured every proposed replacement the same way: all ledes come out at 2 lines or fewer, and no other replacement is longer than the current text.

I also viewed the review captures desktop-first-viewport, mobile-top, desktop-gravity, -ecosystem, -developers, -open-source and -rules.

## C1 — CONFIRMED (major) — developers
- File: site/lib/demo/commands.ts
- Problem: The analyze transcript, headed as real CodeVerse output, labels all 59 externals as packages. Only 39 are packages: the document's 59 externals are 39 npm packages, 8 Node built-ins and 12 environment variables.
- Evidence: Line 49: ["external packages", a.externals], renders "external packages        59" under the header "real counts: CodeVerse at 6b942bc". In codeverse-structure.json (commit 6b942bc), externals by namespace are {"env":12,"node":8,"npm":39}; repository.stats.externals = 59.
- Reviewer fix: Replace ["external packages", a.externals], with ["externals", a.externals], which is Katedrala's own field name. Optionally add the breakdown as the note column: ["externals", a.externals, "39 npm, 8 node, 12 env"]. If you do, store the three counts in CODEVERSE_ANALYSIS in site/lib/site.ts rather than typing them into the transcript.
- Verifier: Confirmed in C:/Users/Awab/AppData/Local/Temp/codeverse-structure.json (commit 6b942bc): repository.stats.externals = 59, split by namespace into env 12, node 8 and npm 39. IR.md defines externals as "packages, built-ins, environment variables, services". The live analyze tab prints "external packages        59" under the header "real counts: CodeVerse at 6b942bc", so 20 of the 59 are mislabelled as packages. The number is real but the label is wrong. That is major rather than critical.
- Verified fix: site/lib/site.ts: add `externalsByNamespace: { npm: 39, node: 8, env: 12 },` to CODEVERSE_ANALYSIS. site/lib/demo/commands.ts line 49: replace `["external packages", a.externals],` with `["externals", a.externals, `${a.externalsByNamespace.npm} npm, ${a.externalsByNamespace.node} node, ${a.externalsByNamespace.env} env`],`. This renders "externals   59   39 npm, 8 node, 12 env". Minimal version: `["externals", a.externals],`.

## C2 — CONFIRMED (major) — gravity
- File: site/components/sections/GravityStage.tsx
- Problem: Each term row prints the raw measurement times the weight, but the contribution is weight times the normalized value, so the arithmetic shown does not produce the number beside it. The Entropy panel prints the correct 'normalized × weight' form, so the two panels also disagree.
- Evidence: Lines 172-175: <span className="text-ink">{term.label}</span> and {rawLabel(term.key, term.raw)} × {term.weight.toFixed(2)}. For Database this renders "Reach 13 of 15 rest on it × 0.40 → 0.38" (13/15 × 0.40 = 0.35), "Fan-in 4 direct × 0.20 → 0.12" and "Cross-module spread 4 other modules × 0.25 → 0.14".
- Reviewer fix: Move the raw label next to the term name and print the normalized value in the formula:
<span className="text-ink">{term.label} <span className="text-ink-faint">{rawLabel(term.key, term.raw)}</span></span>
<span className="data text-ink-faint">{formatScore(term.normalized)} × {term.weight.toFixed(2)}</span>
Database then reads: Reach 13 of 15 rest on it, 0.95 × 0.40 = 0.38; Fan-in 4 direct, 0.58 × 0.20 = 0.12; Cross-module spread 4 other modules, 0.57 × 0.25 = 0.14.
- Verifier: Reproduced live at 1440 px. For Database the rows read "Reach | 13 of 15 rest on it × 0.40 | 0.38", "Fan-in | 4 direct × 0.20 | 0.12" and "Cross-module spread | 4 other modules × 0.25 | 0.14". For PaymentService, Brokerage reads "13.2 paths × 0.15 | 0.07". In metrics.ts:186, contribution = weight × normalized, with normalized = ln(1+x)/ln(1+15) or x/(x+3). The printed product therefore does not give the number shown (4 × 0.20 ≠ 0.12). The Entropy panel uses the same layout but prints normalized × weight, so the two panels disagree.
- Verified fix: GravityStage.tsx lines 172-175: `<span className="text-ink">{term.label} <span className="text-ink-faint">{rawLabel(term.key, term.raw)}</span></span>` and `<span className="data text-ink-faint">{formatScore(term.normalized)} × {term.weight.toFixed(2)}</span>`. formatScore is already imported. I tested this in the DOM: every row stays on one line (22 px) at both 1440 and 390 px. Database then reads 0.95 × 0.40 → 0.38, 0.58 × 0.20 → 0.12 and 0.57 × 0.25 → 0.14.

## C3 — CONFIRMED (minor) — evidence
- File: site/components/sections/Evidence.tsx
- Problem: Betweenness is a sum of fractions of shortest paths, not a count of paths, so the sentence claims a fractional number of paths.
- Evidence: Line 27: text: `It lies on ${payment.betweenness.toFixed(1)} of the shortest dependency paths between other members.` renders "It lies on 13.2 of the shortest dependency paths between other members."
- Reviewer fix: text: `It lies on shortest dependency paths between other members: betweenness ${payment.betweenness.toFixed(1)}.`, which renders "It lies on shortest dependency paths between other members: betweenness 13.2."
- Verifier: Brandes betweenness (metrics.ts:77-107) is a sum of fractions σst(v)/σst. For PaymentService it is 12 (every shortest path from its 6 dependents to StripeClient and to PaymentRepository) plus 1/3 + 1/3 + 1/2 (paths to Database from CheckoutController, CheckoutService and InvoiceService), which is 13.17. Live text: "It lies on 13.2 of the shortest dependency paths between other members." A fractional number of paths does not make sense.
- Verified fix: Evidence.tsx line 27: text: `It lies on shortest dependency paths between other members: betweenness ${payment.betweenness.toFixed(1)}.`, This stays 1 line at 1440 and 3 lines at 390, the same as now.

## C4 — CONFIRMED (minor) — entropy
- File: site/lib/demo/entropy.ts
- Problem: The Scatter evidence is wrong as stated: one dependency lands in exactly one module. The perplexity measures how many modules a module's dependencies spread over. The same string appears in the Entropy panel and in the health transcript.
- Evidence: Line 217: evidence: `A dependency lands in ${perplexity.toFixed(1)} modules on average.`, renders "A dependency lands in 2.9 modules on average." It also appears in the terminal as "scatter +0.12 A dependency lands in 2.9 modules on average."
- Reviewer fix: evidence: `A module's dependencies land in ${perplexity.toFixed(1)} modules on average.`, which renders "A module's dependencies land in 2.9 modules on average."
- Verifier: The raw value is the perplexity 2^H(T|S): the effective number of target modules over a source module's dependencies, with its own module included (entropy.ts:159-168; metrics.md F3). A single dependency always lands in exactly one module. Confirmed live in the Entropy panel at every step and in the health transcript ("scatter +0.12  A dependency lands in 2.9 modules on average.").
- Verified fix: entropy.ts line 217: evidence: `A module's dependencies land in ${perplexity.toFixed(1)} modules on average.`, This stays 1 line in the panel at 1440, 1024 and 390, and it is shorter than the direction line in the transcript.

## C5 — CONFIRMED (minor) — entropy
- File: site/lib/demo/entropy.ts
- Problem: Two problems:
- Agreement fails when the count is 1 ("1 of 17 … run").
- "Module dependencies" here counts member dependencies that cross modules (16 at base, 17 after commit 1). The Architecture section uses that term for the 15 aggregated edges ("15 dependencies between modules"), so the same term means two different counts.
- Evidence: Lines 206-208: ? "Module dependencies flow one way." : `${feedback} of ${crossWeight} module dependencies run against the best one-way order.` renders "1 of 17 module dependencies run against the best one-way order." The explorer says "23 dependencies, 16 of them across a module boundary" and "15 dependencies between modules".
- Reviewer fix: ? "Cross-module dependencies all flow one way." : `${feedback} of ${crossWeight} cross-module dependencies ${feedback === 1 ? "runs" : "run"} against the best one-way order.` This renders "1 of 17 cross-module dependencies runs against the best one-way order."
- Verifier: Live at step 1: "1 of 17 module dependencies run against the best one-way order." The page's own convention handles agreement with rests(), as in "1 of 15 rests on it". crossWeight counts member dependencies that cross a module boundary (16 at base, as the explorer says, plus 1). The explorer's module view says "15 dependencies between modules", and the diff transcript's "+ module dependency" means aggregated module edges. So one term names two different counts.
- Verified fix: entropy.ts lines 206-208: `? "Cross-module dependencies all flow one way."` and `: `${feedback} of ${crossWeight} cross-module dependencies ${feedback === 1 ? "runs" : "run"} against the best one-way order.``. This is 1 line at 1440 and 2 lines at 1024 and 390.

## C6 — CONFIRMED (minor) — gravity
- File: site/components/sections/GravityStage.tsx
- Problem: The figure's accessible name hard-codes the plural, so it reads "1 members".
- Evidence: Line 211: `${id} carries ${count} members of the demonstration system, stacked above it by distance.` produces the aria-label "CheckoutController carries 1 members of the demonstration system, stacked above it by distance."
- Reviewer fix: : `${id} carries ${counted(count, "member")} of the demonstration system, stacked above it by distance.`; and change line 6 to import { counted, rests } from "@/lib/text"; This gives "CheckoutController carries 1 member of …".
- Verifier: Confirmed. After selecting CheckoutController, the figure's aria-label reads "CheckoutController carries 1 members of the demonstration system, stacked above it by distance." Only screen-reader users hear it, so this is minor.
- Verified fix: GravityStage.tsx line 6: `import { counted, rests } from "@/lib/text";`. Line 211: `: `${id} carries ${counted(count, "member")} of the demonstration system, stacked above it by distance.`;`

## C7 — CONFIRMED (minor) — open-source
- File: site/components/sections/OpenSource.tsx
- Problem: The roadmap beam's accessible name reads "1 milestones".
- Evidence: Line 65: aria-label={`${done} milestones done, ${inProgress} in progress, ${MILESTONES.length - done - inProgress} planned`} renders "1 milestones done, 3 in progress, 11 planned".
- Reviewer fix: aria-label={`${counted(done, "milestone")} done, ${inProgress} in progress, ${MILESTONES.length - done - inProgress} planned`} and add import { counted } from "@/lib/text"; This gives "1 milestone done, 3 in progress, 11 planned".
- Verifier: Confirmed: the roadmap svg's aria-label is "1 milestones done, 3 in progress, 11 planned". The visible line ("1 of 15 milestones done") is correct.
- Verified fix: OpenSource.tsx: add `import { counted } from "@/lib/text";`. Line 65: aria-label={`${counted(done, "milestone")} done, ${inProgress} in progress, ${MILESTONES.length - done - inProgress} planned`}

## C8 — REFUTED — rules
- File: site/components/sections/Rules.tsx
- Problem: The rule id says "no-database" but the rule forbids repositories, so the report contradicts itself. The id was inherited from the fixture and the IR.md example.
- Evidence: Line 14:   - id: controllers-no-database, while line 17 is     cannot_depend_on: [repositories]. Line 41 renders "error  controllers-no-database" directly above "Controllers cannot depend on repositories." The validate transcript repeats the id: site/lib/demo/commands.ts line 144 { text: "controllers-no-database", tone: "ink" },
- Reviewer fix: Rename it in all three places:
- Rules.tsx line 14:   - id: controllers-no-repositories
- Rules.tsx line 41: error&nbsp;&nbsp;controllers-no-repositories
- commands.ts line 144: { text: "controllers-no-repositories", tone: "ink" },
- Verifier: The page copies fixtures/dependency-violations/katedrala.config.yaml exactly. There the id controllers-no-database carries the description "Controllers cannot directly access repositories". IR.md's violation example uses the same id, and the brief's own example maps "cannot_depend_on: database" to "controllers → repositories is prohibited". The id names the intent (no database access from controllers), and the rule enforces that at the repository layer. Renaming it would make the page diverge from the fixture that the footnote cites. This is a naming choice, not a contradiction.

## C9 — REFUTED — gravity
- File: site/components/sections/Gravity.tsx
- Problem: In Katedrala's vocabulary, "component" means a physical unit: a package root or source directory (ADR-006; IR.md cmp:). The widget below scores members (Database, PaymentService), so the title and lede name the wrong unit. "its dependency graph" is also ambiguous.
- Evidence: Line 10: title="Some components hold up more of the system than others." Line 11: lede="Architectural Gravity measures how much of a system rests on a component, from the shape of its dependency graph alone."
- Reviewer fix: title="Some code holds up more of the system than the rest."
lede="Architectural Gravity measures how much of a system rests on each member, from the shape of the dependency graph alone."
Both measure 2 lines at 1440 px.
- Verifier: "Component" is used here in the generic sense the brief itself uses ("Some components hold a system together more than others"). designs/metrics.md computes Gravity "for every unit at every level", Katedrala's directory and package components included, so the title is not wrong. The widget's own text consistently says "member". This is taste, and the proposed headline is weaker.

## C10 — REFUTED — impact
- File: site/components/sections/Impact.tsx
- Problem: The lede states an in-development capability in the present tense ("traces", "shows"), uses "component" for what the demo calls members, and runs 3 lines at 1440 px.
- Evidence: Line 11: lede="Katedrala traces dependency paths outward from a component to estimate the structural blast radius of a change, and shows the path behind every member it reaches." (3 lines)
- Reviewer fix: lede="Katedrala will trace dependency paths out from the code you change to estimate its structural blast radius." This measures 2 lines. The panel heading "Why each member is affected" already carries the per-member explanation.
- Verifier: The section has an "In development for v1" status mark beside the heading. Present-tense description next to that mark is the page's convention (Gravity, Entropy, Rules, History) and meets PRODUCT.md's "presented as in development". Ten of 13 ledes run 3 lines inside the 38rem lede measure, so length breaks no rule. "Component" is generic here.

## C11 — REFUTED — rules
- File: site/components/sections/Rules.tsx
- Problem: The lede describes the in-development rules engine as working today ("Rules live", "Every change is checked") and runs 3 lines.
- Evidence: Line 30: lede="Rules live in katedrala.config.yaml beside the code: forbidden and allowed dependencies, layers, isolation, cycles and fan-out. Every change is checked against them, on your machine or in CI."
- Reviewer fix: lede="Rules for dependencies, layers, isolation, cycles and fan-out will live in katedrala.config.yaml, checked on every change." This measures 2 lines.
- Verifier: The status mark "In development for v1" sits beside the heading, and the footnote says the report is the planned v1 format. The rule kinds listed match ROADMAP milestone 8. katedrala.config.yaml already exists (core config schema), with rules as a reserved section. The tense is covered by the mark, and the length is taste.

## C12 — REFUTED — history
- File: site/components/sections/History.tsx
- Problem: The lede says "Katedrala reports" in the present tense, but history and diff are in development. It also runs 3 lines.
- Evidence: Line 15: lede="Compare two revisions or sample a range of history, and Katedrala reports what changed in the architecture: new modules, new dependencies, new cycles."
- Reviewer fix: lede="Compare two revisions or a range of history, and Katedrala will report new modules, new dependencies and new cycles." This measures 2 lines.
- Verifier: The "In development for v1" mark is beside the heading. Diff and history are milestones 10 and 12, as described. Tense and length are style.

## C13 — REFUTED — developers
- File: site/components/sections/Developers.tsx
- Problem: The lede uses imperatives that present the planned CLI as usable now, restates the five tab questions, and runs 3 lines. The note under the terminal then repeats "The command line ships with v1".
- Evidence: Line 43: lede="Analyze a repository, measure its health, trace the impact of a change, enforce your rules and compare revisions, from the terminal or in CI." Lines 50-51: "The command line ships with v1, and the output shows its planned format. The analyze counts are real; the other values are computed from the demonstration system."
- Reviewer fix: lede="From v1, every question below is one command away, in your terminal or in CI." (2 lines). Change the note to: "The output shows the planned v1 format. The analyze counts are real; the other values are computed from the demonstration system."
- Verifier: The section carries the "In development for v1" mark, and the note under the terminal states explicitly that the command line ships with v1. Restating the five questions and repeating "ships with v1" is a matter of taste.

## C14 — CONFIRMED (minor) — ecosystem
- File: site/components/sections/Ecosystem.tsx
- Problem: The lede runs 4 lines at 1440 px. It says visualizations, CI checks, editors and exporters "read" the document, but the cards below mark them in development or planned after v1. The brief's key message, "an engine, not a visualization product", is only implied.
- Evidence: Line 52: lede="Everything Katedrala finds goes into one versioned document with a published schema. Visualizations, CI checks, editors and exporters read the same structure instead of parsing code themselves." (4 lines)
- Reviewer fix: lede="Katedrala is an engine, not a visualization product: it writes one versioned document for other tools to build on." This measures 2 lines.
- Verifier: A grep of components/lib/app finds no "not a visualization" or "engine, not" wording, though the brief marks that message "This is important". The section has no section-level status mark. Its lede says visualizations, CI checks, editors and exporters "read the same structure", yet none exists today: the cards below mark them in development or planned after v1. The lede measures 4 lines at 1440 px and 5 at 390 px.
- Verified fix: Ecosystem.tsx line 52: lede="Katedrala is an engine, not a visualization product: it writes one versioned document for other tools to build on." This measures 2 lines at 1440 and 3 at 390, and it is accurate today.

## C15 — CONFIRMED (minor) — gravity
- File: site/components/sections/Gravity.tsx
- Problem: The footnote claims documentation that does not exist yet. docs/ contains only ARCHITECTURE.md, IR.md and ROADMAP.md; the ALGORITHMS.md that IR.md references is not in the repository.
- Evidence: Lines 18-19: "The weights are design choices, documented with the method."
- Reviewer fix: "The weights are design choices and will be published with the method."
- Verifier: docs/ contains only ARCHITECTURE.md, IR.md, ROADMAP.md and README.md. IR.md and packages/ir/src/types/metrics.ts both point to docs/ALGORITHMS.md, which does not exist. The weights 0.40/0.20/0.25/0.15 appear nowhere in the repository; they exist only in a scratch design file. The footnote claims documentation that a visitor cannot find.
- Verified fix: Gravity.tsx lines 18-19: "The weights are design choices and will be published with the method."

## C16 — CONFIRMED (major) — how-it-works
- File: site/components/sections/Pipeline.tsx
- Problem: "Every import and reference resolves" overclaims. ARCHITECTURE.md lists it as a non-goal: member calls on values of unknown type are counted, not resolved. The real CodeVerse document has 155 unresolved and 2,265 untyped references.
- Evidence: Line 30: text: "Every import and reference resolves to the declaration it names, through tsconfig paths, workspaces and package exports.",
- Reviewer fix: text: "Imports and references are resolved to the declarations they name, through tsconfig paths, workspaces and package exports.",
- Verifier: This card is marked "Available today". ARCHITECTURE.md's non-goals say member calls on values of unknown type are not resolved (they are counted, not guessed). The real CodeVerse document shows unresolvedReferences 155 and untypedReferences 2,265. External imports resolve to externals, not to declarations. So "Every import and reference resolves" is false.
- Verified fix: Pipeline.tsx line 30: text: "Imports and references are resolved to the declarations they name, through tsconfig paths, workspaces and package exports.", The Link card stays 4 lines at 1440 and 1024 and 3 at 390, so row heights do not change.

## C17 — CONFIRMED (major) — top
- File: site/components/hero/HeroDrawing.tsx
- Problem: Below 768 px the hero drawing shows only the 8 modules. The idle card still names the member Database, which is not drawn, and says "Select any joint to test another member", but tapping a joint opens a module card.
- Evidence: mobile-top.png shows the labels Gateway through Platform, then the card "Carries the most load / Database / 13 of 15 members rest on it. Select any joint to test another member and light the load path it carries." Line 122: {module === null ? <IdleCard /> : <ModuleCard id={module} />}
- Reviewer fix: Replace line 122 with {module === null ? <ModuleIdleCard /> : <ModuleCard id={module} />}, add MODULE_MEASUREMENTS to the import from "@/lib/demo/metrics", and add:
function ModuleIdleCard() {
  const heaviest = [...MODULE_MEASUREMENTS.values()].reduce((a, b) => (b.load > a.load ? b : a));
  return (
    <div className="member-card">
      <p className="text-[0.8125rem] text-ink-faint">Carries the most load</p>
      <p className="mt-1 text-[0.9375rem] font-semibold text-ink">{heaviest.name}</p>
      <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-soft">Select any module to see its members and what it depends on.</p>
    </div>
  );
}
The card renders "Carries the most load / Platform / Select any module to see its members and what it depends on."
- Verifier: Confirmed live at 390 px. The idle card reads "Database / 13 of 15 members rest on it. Select any joint to test another member…" above a drawing of 8 modules. Worse, tapping a joint does nothing on touch. In LoadDrawing.tsx, onPointerEnter and onFocus set the member active, then onClick toggles it off. The traced event order was pointerenter … focusin → click, and aria-pressed stayed false at 390 and 820 px. On desktop, the first click after hovering clears the selection. The heaviest module is Platform: it is the only foundation, so it carries a load of 8.
- Verified fix: Use the reviewer's ModuleIdleCard: replace line 122 with {module === null ? <ModuleIdleCard /> : <ModuleCard id={module} />} and add MODULE_MEASUREMENTS to the "@/lib/demo/metrics" import. It renders "Carries the most load / Platform / Select any module to see its members and what it depends on." Also fix the tap in LoadDrawing.tsx:
- onPointerEnter: (e) => { if (e.pointerType === "mouse") setActive(member.id); },
- on the svg, onPointerLeave={interactive ? (e) => { if (e.pointerType === "mouse") setActive(null); } : undefined}
- onClick: () => setActive(member.id)
This way a tap or click selects instead of toggling.

## C18 — CONFIRMED (minor) — architecture
- File: site/components/sections/Architecture.tsx
- Problem: The lede promises files and symbols, which the explorer does not show, and describes the demo's controls as if they were product features. It runs 3 lines. Module grouping, whether inferred or declared, is in development for v1, but the section carries no status mark.
- Evidence: Line 13: lede="Files, symbols and modules form one typed graph. Group it by module to see the boundaries, filter relationships by kind, and zoom into any member." (3 lines). The <Section> has no aside.
- Reviewer fix: lede="One typed graph, from a single call up to the boundaries between modules. Filter it by kind and zoom into any member." (2 lines). Add aside={<Status status="in-development" label="Module grouping, in development for v1" />} and import Status from "@/components/ui/Status".
- Verifier: The real CodeVerse document has no components, modules or layers sections: analyzeStructure stops after linking, and inference is milestone 5, planned. Architecture is the only capability section with no status mark, yet its lede states "Files, symbols and modules form one typed graph. Group it by module…". The reviewer's claim that files and symbols are not shown is weak: members are symbols, and the detail card shows each file. The reviewer's `import Status from` would not compile, because Status is a named export.
- Verified fix: Keep the lede. In Architecture.tsx add `import { Status } from "@/components/ui/Status";` and on <Section> add aside={<Status status="in-development" label="Module grouping: in development for v1" />}. The label is scoped because the typed graph of files and symbols is available today.

## C19 — CONFIRMED (minor) — open-source
- File: site/components/sections/OpenSource.tsx
- Problem: "No model in the loop" repeats the Developers guarantees "Local" (no language model) and "Deterministic" (reproducible). Meanwhile this section lacks the brief's "Extensible / Language-aware" point.
- Evidence: Lines 18-21: title: "No model in the loop", text: "There is no language model in the analysis. Every result is computed, traceable and reproducible." Compare Developers.tsx line 27: "Analysis runs on your machine. No network calls, no language model, nothing uploaded."
- Reviewer fix: { title: "Built to extend", text: "Languages plug in through a typed adapter contract. TypeScript and JavaScript come first." } This is true today: LanguageAdapter is in @katedrala/plugin-api and the TypeScript/JavaScript adapter implements it.
- Verifier: "No language model" appears in both Developers "Local" and Open source "No model in the loop". The brief's requested "Extensible" appears nowhere on the page: a grep finds no extensibility or plugin copy, only "CodeVerse adapter". The replacement is true today. LanguageAdapter is in @katedrala/plugin-api (committed in milestone 1), the TS adapter implements it, and analyzeStructure accepts `adapters?: readonly LanguageAdapter[]` (engine/src/structure.ts:90).
- Verified fix: OpenSource.tsx lines 18-21: { title: "Built to extend", text: "Languages plug in through a typed adapter contract. TypeScript and JavaScript come first." },

## C20 — CONFIRMED (minor) — top
- File: site/components/hero/Hero.tsx
- Problem: The hero lede wraps to 3 lines at 1440 px with a two-word widow ("it finds."); the phrase adds nothing.
- Evidence: Lines 15-16: "Katedrala reconstructs the architecture inside TypeScript and JavaScript code, with evidence for every dependency it finds." (3 lines, last line "it finds.")
- Reviewer fix: "Katedrala reconstructs the architecture inside TypeScript and JavaScript code, with evidence for every dependency." This measures 2 lines.
- Verifier: Measured live: the hero lede ends with the runt "it finds." at 900, 1440 and 1920 px, even with text-wrap: pretty. But "it finds" is a deliberate hedge: 2,420 CodeVerse references are not bound, so "evidence for every dependency" would overreach. The reviewer's version also leaves "every dependency." alone on the last line at 768 px.
- Verified fix: Hero.tsx lines 15-16: keep the words and bind the tail, as the h1 already does: "Katedrala reconstructs the architecture inside TypeScript and JavaScript code, with evidence for every&nbsp;dependency&nbsp;it&nbsp;finds." Measured from 768 to 1920 px: the last line becomes "every dependency it finds." with no overflow, and 390 px is unchanged.

## C21 — REFUTED — top
- File: site/components/hero/MemberCard.tsx
- Problem: "test" collides with software tests, and "joint" is a third name for the thing the page calls a member.
- Evidence: Lines 45-46: " on it. Select any joint to test another member and light the load path it carries." renders "13 of 15 members rest on it. Select any joint to test another member and light the load path it carries."
- Reviewer fix: " on it. Select another member to light the load path it carries." This renders "13 of 15 members rest on it. Select another member to light the load path it carries." on 1 line in the card.
- Verifier: "Joint" and "test" belong to the page's load-drawing metaphor on purpose: joints are the drawn nodes, and MemberCard is documented as "the identity card of a tested member". On desktop the sentence is accurate. This is taste. The mobile mismatch is a separate, real problem, covered by C17.

## C22 — CONFIRMED (minor) — how-it-works
- File: site/components/sections/Pipeline.tsx
- Problem: The lede runs 3 lines. Its payoff ("traces back to a line of source") is a third copy of the traceability promise, after the Explain stage text and the Evidence lede. "Reads only what the previous one produced" is also looser than ARCHITECTURE.md ("Stages never mutate earlier sections").
- Evidence: Line 76: lede="Katedrala works in passes. Each pass reads only what the previous one produced, so every result traces back to a line of source."
- Reviewer fix: lede="Katedrala works in five passes. Each one adds to the document and never rewrites what an earlier pass produced." This measures 2 lines.
- Verifier: Per ARCHITECTURE.md, linking consumes both extraction and project setup. Inference, metrics, anomalies and rules each "read the model", and anomalies depend on metrics. Explain reads everything. The invariant the document actually states is "Stages never mutate earlier sections". "Each pass reads only what the previous one produced" is therefore inaccurate.
- Verified fix: Pipeline.tsx line 76: lede="Katedrala works in five passes. Each one adds to the document and never rewrites what an earlier pass produced." This measures 2 lines at 1440 and 3 at 390.

## C23 — CONFIRMED (minor) — how-it-works
- File: site/components/sections/Pipeline.tsx
- Problem: The three stages marked "In development for v1" are written in the present tense. Explain also repeats the Evidence lede ("the lines of code it came from"), and Infer says components carry a confidence, but components are derived, not inferred.
- Evidence: Line 40: "Components, modules and layers are discovered, each with a confidence and the evidence behind it." Line 50: "The dependency graph is measured: coupling, cycles, centrality, Gravity and Entropy." Line 60: "Every conclusion decomposes into the measurements and the lines of code it came from."
- Reviewer fix: Line 40: "Modules and layers will be inferred from the graph, each with a confidence and the evidence behind it."
Line 50: "The dependency graph will be measured for coupling, cycles, centrality, Gravity and Entropy."
Line 60: "Every conclusion will break down into the measurements and source locations behind it."
None is longer than the current card text.
- Verifier: Only the component claim holds. ARCHITECTURE.md's truth levels list components as derived (deterministic), and only modules and layers as inferred with a confidence. ComponentEntity (ir/src/types/architecture.ts) has no confidence or inference field. The present tense is covered by each card's "In development for v1" mark, and the Explain overlap is taste.
- Verified fix: Change only Pipeline.tsx line 40: text: "Modules and layers are inferred, each with a confidence and the evidence behind it.", This matches the card's artifact rows (module, members, layer). It measures 3 lines at 1440, 4 at 1024 and 2 at 390, so no row gets taller. Leave lines 50 and 60 as they are.

## C24 — CONFIRMED (minor) — gravity
- File: site/components/sections/GravityStage.tsx
- Problem: "neighbourhood" is the only British spelling on an otherwise American page (analyze, normalized, visualization, artifacts, toward, license). The claim also omits that scores shift slightly with system size, which designs/metrics.md states explicitly ("its own neighbourhood or (logarithmically) the system size").
- Evidence: Lines 185-187: "Each term is normalized against the largest value possible for a system of this size, never against the largest value observed, so a score only moves when the member's own neighbourhood changes."
- Reviewer fix: "Each term is normalized against the largest value possible for a system of this size, never against the largest value observed, so a score moves only when the member's own neighborhood or the size of the system changes." Line count is unchanged at 3.
- Verifier: A grep shows "neighbourhood" is the only British spelling in rendered copy. Reach, fan-in and brokerage are log-shares against n−1 and (n−1)(n−2) (metrics.ts:175-178), so scores also move when the system grows. designs/metrics.md says so explicitly.
- Verified fix: GravityStage.tsx lines 185-187: "Each term is normalized against the largest value possible for a system of this size, never against the largest value observed, so a score moves only when the member's own neighborhood or the size of the system changes." This still measures 3 lines at 1440 and 4 at 390.

## C25 — CONFIRMED (minor) — gravity
- File: site/components/sections/GravityStage.tsx
- Problem: The Brokerage raw value is labelled as a count of paths, but it is a fractional betweenness.
- Evidence: Line 204: return `${raw.toFixed(1)} paths`; renders "13.2 paths × 0.15" and "0.0 paths × 0.15".
- Reviewer fix: return `betweenness ${raw.toFixed(1)}`; This renders "betweenness 13.2" and matches C3 and the Freeman/Brandes citation.
- Verifier: This is the same issue as C3. Live rows show "13.2 paths", "20.2 paths" and "3.5 paths" for a fractional betweenness sum.
- Verified fix: GravityStage.tsx line 204: return `betweenness ${raw.toFixed(1)}`;

## C26 — REFUTED — entropy
- File: site/components/sections/Entropy.tsx
- Problem: The lede runs 3 lines, and its list names only three of the four factors (Propagation is missing), so it misdescribes the score shown beside it.
- Evidence: Line 11: lede="Architectural Entropy scores the disorder in a dependency graph: cycles, dependencies that run against the grain, and coupling scattered across modules. Apply the commits and watch it rise."
- Reviewer fix: lede="Architectural Entropy scores the disorder in a dependency graph, factor by factor. Apply the commits and watch it rise." This measures 2 lines.
- Verifier: The colon list is a summary. The panel right beside it lists all four factors with weights and evidence, Propagation included, so no reader is misled about the score. A 3-line lede is the norm on this page. The proposed rewrite also removes useful content.

## C27 — REFUTED — entropy
- File: site/components/sections/Entropy.tsx
- Problem: The footnote runs 5 lines at 1440 px and over-explains.
- Evidence: Lines 16-19: "Entropy is a Katedrala heuristic. Its factors come from established ideas: acyclic dependencies (Martin 2003), propagation cost (MacCormack, Rusnak and Baldwin 2006) and Shannon entropy (Shannon 1948). Their selection, normalization and weights are design choices, and the score has not been validated against maintenance outcomes."
- Reviewer fix: "Entropy is a Katedrala heuristic built on established ideas: acyclic dependencies (Martin 2003), Shannon entropy (Shannon 1948) and propagation cost (MacCormack, Rusnak and Baldwin 2006). Its weights are design choices, and the score has not been validated against maintenance outcomes." This measures 4 lines.
- Verifier: The footnote is accurate against designs/metrics.md. Its length is taste, and the proposed cut drops "selection, normalization", which is real information.

## C28 — REFUTED — impact
- File: site/components/sections/ImpactStage.tsx
- Problem: Members rest on other members, not on a change, so "rests on the change" does not make sense.
- Evidence: Line 101: "Impact rises through everything that rests on the change. Demonstration system."
- Reviewer fix: "Impact rises through everything that rests on the changed member. Demonstration system."
- Verifier: "Rests on the change" is a metonymy within the page's load metaphor, and the meaning is clear next to the drawing. Taste.

## C29 — CONFIRMED (minor) — impact
- File: site/components/sections/ImpactStage.tsx
- Problem: The footnote opens with an unanchored fragment ("Payments module member.").
- Evidence: Lines 152-153: {moduleName(nodeById.get(target)!.module)} module member. Paths are the shortest dependency chains; ties are broken by name, so the answer is the same on every run. This renders "Payments module member. Paths are …".
- Reviewer fix: {target} is in the {moduleName(nodeById.get(target)!.module)} module. Paths are the shortest dependency chains, with ties broken by name, so every run gives the same answer. This renders "PaymentService is in the Payments module. Paths are the shortest dependency chains, with ties broken by name, so every run gives the same answer." (still 2 lines).
- Verifier: Confirmed live: the note opens with the fragment "Payments module member. Paths are the shortest dependency chains; …", which has no subject or referent.
- Verified fix: ImpactStage.tsx lines 152-153: {target} is in the {moduleName(nodeById.get(target)!.module)} module. Paths are the shortest dependency chains, with ties broken by name, so every run gives the same answer.

## C30 — REFUTED — impact
- File: site/components/sections/ImpactStage.tsx
- Problem: Subheadings are inconsistent: most statement-style h3s end with a period, but these two do not.
- Evidence: ImpactStage.tsx lines 121-123: "Why each member is affected". OpenSource.tsx line 56: "The road to v1". Compare "Or call the engine from code.", "One relationship, as Katedrala records it." and "Being built to power CodeVerse."
- Reviewer fix: "Why each member is affected." (ImpactStage.tsx) and "The road to v1." (OpenSource.tsx).
- Verifier: Label-style h3s are unpunctuated elsewhere too: the Pipeline stage headings Parse, Link and so on have no period. Sentence-style headings end with one. That split is consistent enough, so this is taste.

## C31 — REFUTED — developers
- File: site/lib/demo/commands.ts
- Problem: The impact transcript's "entry points" label does not match the Impact panel's "HTTP entry points".
- Evidence: Line 130: plain(`entry points: ${[...result.entryPoints].sort().join(", ")}`, "faint"), renders "entry points: ApiGateway, CheckoutController, OrderController".
- Reviewer fix: plain(`HTTP entry points: ${[...result.entryPoints].sort().join(", ")}`, "faint"),
- Verifier: "entry points" in the transcript is a shortened label for the same set as the panel's "HTTP entry points". The two do not contradict each other.

## C32 — REFUTED — rules
- File: site/components/sections/Rules.tsx
- Problem: "rule fixtures" is internal jargon, and "the one … use today" is clumsy.
- Evidence: Lines 55-56: "The configuration syntax is the one Katedrala's rule fixtures use today. The report shows the planned v1 format."
- Reviewer fix: "The configuration follows the rule syntax already in Katedrala's test fixtures. The report shows the planned v1 format."
- Verifier: The claim is accurate. The page's YAML uses the fixture's syntax: groups, modules, and rules with id, severity, from, cannot_depend_on and module. "Fixtures" is standard developer vocabulary. Taste.

## C33 — REFUTED — evidence
- File: site/components/sections/Evidence.tsx
- Problem: The lede runs 3 lines at 1440 px.
- Evidence: Line 38: lede="Katedrala never reports a verdict without its trail. Every score breaks down into measurements, and every relationship points to the lines of code it came from."
- Reviewer fix: lede="No verdict without its trail: every score breaks down into measurements, every relationship points to its source lines." This measures 2 lines.
- Verifier: Three lines inside the 38rem measure is the page norm. Taste.

## C34 — REFUTED — evidence
- File: site/components/sections/Evidence.tsx
- Problem: "score" has no referent here: Gravity was three sections earlier, with Entropy, Impact and Rules in between.
- Evidence: Line 43: Why does PaymentService score {formatScore(payment.gravity)}? renders "Why does PaymentService score 0.58?"
- Reviewer fix: Why is PaymentService's Gravity {formatScore(payment.gravity)}? This renders "Why is PaymentService's Gravity 0.58?" and still fits on 1 line.
- Verifier: The footnote right under the list names Gravity. The four terms (reach, fan-in, spread, brokerage) and the 0.58 match the Gravity widget and the Pipeline artifact. Taste.

## C35 — REFUTED — evidence
- File: site/components/sections/Evidence.tsx
- Problem: On this page "rule" means an architectural rule. IR.md calls this field the resolution method.
- Evidence: Line 82: "with its file, line, column, syntax and the rule that resolved it."
- Reviewer fix: "with its file, line, column, syntax and the method that resolved it."
- Verifier: "The rule that resolved it" is plain English for the field shown in the JSON just above ("resolution": "import-binding"). The risk of confusing it with architectural rules is low. Taste.

## C36 — CONFIRMED (minor) — history
- File: site/lib/demo/history.ts
- Problem: Module names are lowercase in the change lines but capitalized everywhere else (Payments module, Users → Orders → Billing → Users).
- Evidence: Line 50: change: "Gateway, auth and users"; line 57: "+ payments module, 3 members"; line 64: "+ orders, checkout and billing"
- Reviewer fix: "Gateway, Auth and Users" / "+ Payments module, 3 members" / "+ Orders, Checkout and Billing". Lengths are unchanged, so each stays on 1 line.
- Verifier: Confirmed live. The change lines read "Gateway, auth and users", "+ payments module, 3 members" and "+ orders, checkout and billing", while the same cards' findings ("Payments now depends on Auth") and the diff transcript capitalize module names. v1 also mixes cases inside one string.
- Verified fix: history.ts lines 50, 57 and 64: "Gateway, Auth and Users", "+ Payments module, 3 members" and "+ Orders, Checkout and Billing".

## C37 — REFUTED — history
- File: site/lib/demo/history.ts
- Problem: The v4 card mixes two metaphors: the title "Against the grain" and the finding "against the load path". It also breaks the v5 pattern ("New cycle: …") and does not use Katedrala's anomaly name, upward-dependency.
- Evidence: Line 144: `${moduleName(upward[0])} now depends on ${moduleName(upward[1])}, against the load path.` renders "Payments now depends on Auth, against the load path." (also in the v4 aria-label).
- Reviewer fix: `New upward dependency: ${moduleName(upward[0])} → ${moduleName(upward[1])}.` This renders "New upward dependency: Payments → Auth." The upward test on line 138 uses >=; change it to > so a same-level dependency is never called upward.
- Verifier: "Against the grain" is the Entropy factor's own name for the direction measure, and "against the load path" is the drawing metaphor; this is a style choice. The proposed change from >= to > alters no current output: v4 is Payments (level 1) to Auth (level 2).

## C38 — REFUTED — developers
- File: site/components/sections/Developers.tsx
- Problem: The code comment prints numbers without thousands separators; everywhere else the page writes 3,766 and 14,232.
- Evidence: Line 12 renders "// CodeVerse at 6b942bc: 644 files, 3766 symbols, 14232 edges".
- Reviewer fix: // CodeVerse at ${CODEVERSE_ANALYSIS.commit}: ${CODEVERSE_ANALYSIS.files} files, ${CODEVERSE_ANALYSIS.symbols.toLocaleString("en-US")} symbols, ${CODEVERSE_ANALYSIS.relationships.toLocaleString("en-US")} edges. This renders "// CodeVerse at 6b942bc: 644 files, 3,766 symbols, 14,232 edges".
- Verifier: Plain integers are conventional in a code comment, and the values are correct. Taste.

## C39 — REFUTED — open-source
- File: site/components/sections/OpenSource.tsx
- Problem: The lede runs 3 lines, and its first sentence repeats both the "MIT licensed" card and the final CTA. The "A formal contract" card repeats Developers' "Versioned schemas" and the Ecosystem copy: "published … JSON Schema" appears three times on the page.
- Evidence: Line 33: lede="Katedrala is MIT licensed and developed in public. The engine, the document contract, the design decisions and the roadmap all live in the repository." Line 12: text: "The architecture document is specified in the repository and published as JSON Schema."
- Reviewer fix: lede="The engine, its output contract, its design decisions and its roadmap all live in the repository." (2 lines).
Card text: "The architecture document is specified field by field, and its schema is versioned apart from the engine." IR.md confirms schemaVersion is versioned independently of Katedrala.
- Verifier: The content is accurate: the schema exists in packages/ir/schema and the ADRs are in ARCHITECTURE.md. Repetition and a 3-line length are taste.

## C40 — CONFIRMED (minor) — open-source
- File: site/lib/site.ts
- Problem: Gravity and Entropy are capitalized as names everywhere else in prose ("Gravity is a Katedrala heuristic", Pipeline "Gravity and Entropy"), but not in this milestone title.
- Evidence: Line 36: { name: "Metrics: gravity and entropy", state: "planned" },
- Reviewer fix: { name: "Metrics: Gravity and Entropy", state: "planned" },
- Verifier: Elsewhere in prose the page capitalizes Gravity and Entropy as names ("Gravity is a Katedrala heuristic", "Gravity and Entropy"), and ROADMAP.md row 6 writes "Architectural Gravity, Entropy". The milestone name renders "Metrics: gravity and entropy".
- Verified fix: site.ts line 36: { name: "Metrics: Gravity and Entropy", state: "planned" },

## C41 — CONFIRMED (minor) — open-source
- File: site/lib/site.ts
- Problem: Three statuses disagree:
- The Pipeline marks Parse and Link "Available today".
- The milestones list shows 02 parsing and 03 dependency graph as "In progress".
- The cited source, "From the roadmap in the repository.", lists milestones 2-4 as "Planned" in docs/ROADMAP.md.
The summary line would also print "0 in progress" once nothing is in progress.
- Evidence: Lines 32-34: state: "in-progress" for "TypeScript and JavaScript parsing", "Dependency graph" and "Graph algorithms". docs/ROADMAP.md shows 2, 3 and 4 as "Planned". OpenSource.tsx line 58: {done} of {MILESTONES.length} milestones done, {inProgress} in progress.
- Reviewer fix: When M2–M4 are recorded as done, set state: "done" for those three in both site/lib/site.ts and docs/ROADMAP.md. Guard the zero case in OpenSource.tsx line 58: {done} of {MILESTONES.length} milestones done{inProgress > 0 ? `, ${inProgress} in progress` : ""}. This avoids "4 of 15 milestones done, 0 in progress."
- Verifier: docs/ROADMAP.md (committed and unmodified) lists milestones 2-4 as "Planned". site.ts shows them "in-progress", and the list cites "From the roadmap in the repository." PRODUCT.md even calls milestones 1-4 implemented. The "0 in progress" case would appear as soon as they close. The reviewer's fix waits on a future event and leaves the current mismatch in place.
- Verified fix: Now: in docs/ROADMAP.md, set the Status of rows 2-4 to "In progress", as site.ts says ("Update both together"). When those milestones close, set "Done" in both files. OpenSource.tsx line 58: {done} of {MILESTONES.length} milestones done{inProgress > 0 ? `, ${inProgress} in progress` : ""}.

## C42 — CONFIRMED (minor) — ecosystem
- File: site/components/sections/Ecosystem.tsx
- Problem: The foundation label names the passes differently from the Pipeline (Parse, Link, Infer, Analyze, Explain).
- Evidence: Line 75: "parse, link, infer, measure, explain"
- Reviewer fix: "parse, link, infer, analyze, explain"
- Verifier: The label lists the page's five passes but names the fourth "measure", while the Pipeline headings read Parse, Link, Infer, Analyze, Explain.
- Verified fix: Ecosystem.tsx line 75: "parse, link, infer, analyze, explain"

## C43 — REFUTED — ecosystem
- File: site/components/sections/Ecosystem.tsx
- Problem: This chain step repeats the versioned-document idea already stated in the lede and in the layer label "versioned, with a published JSON Schema".
- Evidence: Line 31: text: "One versioned JSON document, one schema.",
- Reviewer fix: text: "Files, symbols and relationships, each with its provenance.", This describes what the document contains today.
- Verifier: Accurate, and the repetition is taste.

## C44 — REFUTED — ecosystem
- File: site/components/sections/Ecosystem.tsx
- Problem: The CodeVerse card repeats "a city you can fly through", which the CodeVerse paragraph below also says.
- Evidence: Line 9: text: "The architecture as a city you can fly through." Line 89: "CodeVerse turns a GitHub repository into a 3D city you can fly through".
- Reviewer fix: text: "Modules, load and cycles in its 3D city.",
- Verifier: Repetition between a card and the paragraph below it is a matter of taste.

## C45 — REFUTED — ecosystem
- File: site/components/sections/Ecosystem.tsx
- Problem: The step is marked "In development for v1" but its text is in the present tense.
- Evidence: Line 37: text: "Turns the document into a visualization model.",
- Reviewer fix: text: "Will turn the document into a visualization model.",
- Verifier: The step carries its own "In development for v1" mark, which presents it as future.

## C46 — REFUTED — ecosystem
- File: site/components/sections/Ecosystem.tsx
- Problem: The determinism claim about CodeVerse already appears in Developers ("Two analyses of CodeVerse came out identical.").
- Evidence: Lines 98-99: "14,232 relationships, the same document on every run."
- Reviewer fix: End the sentence at {CODEVERSE_ANALYSIS.relationships.toLocaleString("en-US")} relationships. so it renders "Katedrala already analyzes its source: 3,766 symbols and 14,232 relationships."
- Verifier: Accurate (two runs produced byte-identical documents). Repetition is taste.

## C47 — REFUTED — get-started
- File: site/components/sections/FinalCta.tsx
- Problem: The final lede repeats the Open source section (open source, in public, roadmap) and echoes itself ("being built … help build it"). The final section should be simpler than the hero.
- Evidence: Lines 14-15: "Katedrala is open source and being built in public toward v1. Start with the README, follow the roadmap, or help build it."
- Reviewer fix: "Start with the README, follow the roadmap to v1, or help build it." This fits on 1 line.
- Verifier: The final section is already minimal: a title, a 2-line lede and two buttons. The overlap is taste.

## C48 — REFUTED — get-started
- File: site/components/sections/FinalCta.tsx
- Problem: The closing title reuses the Impact title's construction ("before you make it" / "before you change it"). The brief's line avoids the echo.
- Evidence: Line 11: "Understand your system before you change it." Impact title: "Know what a change will touch before you make it."
- Reviewer fix: "Understand your system before changing it."
- Verifier: The title is nearly the brief's own line. The echo of the Impact title is a style call.

## C49 — CONFIRMED (minor) — architecture
- File: site/components/sections/ArchitectureExplorer.tsx
- Problem: Printing the relationship kind after the target reads backwards, as if the target performed the action.
- Evidence: Line 459: {e.target} <span className="text-ink-faint">{e.kind.replace("-", " ")}</span> renders "AuthService calls", "StripeClient instantiates" and "Database accesses data" under "Depends on".
- Reviewer fix: <span className="text-ink-faint">{e.kind === "accesses-data" ? "accesses data in" : e.kind}</span> {e.target} This renders "calls AuthService", "instantiates StripeClient" and "accesses data in Database".
- Verifier: Confirmed live: OrderService's detail lists "InvoiceService calls" and PaymentRepository's lists "Database accesses data". Placing the kind after the target reads as if the target acts, which inverts the direction in the panel that teaches dependency direction.
- Verified fix: ArchitectureExplorer.tsx line 459: <span key={e.target} className="block"><span className="text-ink-faint">{e.kind === "accesses-data" ? "accesses data in" : e.kind}</span> {e.target}</span>

## C50 — REFUTED — architecture
- File: site/components/sections/Architecture.tsx
- Problem: The table says "nothing" where the cards say "nothing inside the system"; StripeClient plainly depends on Stripe.
- Evidence: Line 35: <td>{m.dependsOn.join(", ") || "nothing"}</td>
- Reviewer fix: <td>{m.dependsOn.join(", ") || "nothing inside the system"}</td>
- Verifier: The table describes the demonstration graph, and in that graph StripeClient has no outgoing edge, so "nothing" is accurate. Only the wording differs from the cards.

## C51 — CONFIRMED (minor) — top
- File: site/lib/demo/system.ts
- Problem: "http" is an initialism and should be uppercase. Database is labelled "configuration provider", but its dependents reach it through accesses-data edges, whose IR.md example is "repository → database model".
- Evidence: Lines 57 and 68: role: "http controller"; line 113: role: "configuration provider". These render under the names in the hero and explorer cards.
- Reviewer fix: role: "HTTP controller" (both places), and update site/lib/demo/impact.ts line 24 to new Set(["HTTP controller", "route definition"]). Change Database to role: "data model".
- Verifier: The roles mirror IR ArchitecturalRole values, but in display text "http" should be uppercase. "Configuration provider" also contradicts the demo's own edges: Database is reached only through accesses-data, and IR.md's example for that edge is "repository → database model", which is the data-model role. Database is the member featured in the hero, so the odd role is prominent.
- Verified fix: system.ts lines 56 and 68: role: "HTTP controller". Line 113: role: "data model". impact.ts line 24: new Set(["HTTP controller", "route definition"]).

## C52 — REFUTED — gravity
- File: site/components/sections/Gravity.tsx
- Problem: These two status marks use a custom label. Every other mark uses one of the three fixed labels, and "in development" here drops "for v1".
- Evidence: Gravity.tsx line 12 and Entropy.tsx line 12: label="Katedrala heuristic, in development"
- Reviewer fix: label="Heuristic, in development for v1" in both files.
- Verifier: The open-square glyph still encodes in-development status. The custom label adds the "heuristic" qualifier that PRODUCT.md requires. Dropping "for v1" misleads no one, since milestone 6 is in the roadmap list. Taste.

## C53 — REFUTED — footer
- File: site/components/site/Footer.tsx
- Problem: On this page "document" means Katedrala's JSON output, so "All documents" is ambiguous.
- Evidence: Line 19: { label: "All documents", href: LINKS.documentation },
- Reviewer fix: { label: "All docs", href: LINKS.documentation },
- Verifier: It sits in a column titled Documentation, so the context is clear. Taste.

## C54 — CONFIRMED (major) — global
- File: site/app/layout.tsx
- Problem: The meta description, shown in search results and link previews, presents boundaries, structural risk and change impact as present capabilities; all are in development.
- Evidence: Lines 22-23: "Katedrala is an open-source engine that reconstructs software architecture from source code: dependencies, boundaries, structural risk and the impact of change, with evidence for every conclusion."
- Reviewer fix: "Katedrala is an open-source engine that reconstructs the architecture inside TypeScript and JavaScript code, with evidence for every dependency."
- Verifier: The meta description (layout.tsx:22-23) is shown out of context in search results and link previews. It claims boundaries, structural risk and change impact, which are milestones 5-9, all planned, with no qualifier. The hero lede was deliberately scoped to what exists, and the brief forbids presenting unbuilt capabilities as real.
- Verified fix: description: "Katedrala is an open-source engine that reconstructs the architecture inside TypeScript and JavaScript code, with evidence for every dependency it finds." This is about 150 characters, so it is not truncated.

## C55 — CONFIRMED (minor) — developers
- File: site/components/sections/Developers.tsx
- Problem: The guarantee is imprecise. The same repository at different commits gives different documents; ARCHITECTURE.md defines the inputs as files, configuration and Katedrala version.
- Evidence: Line 17: "The same repository produces the same document, byte for byte. Two analyses of CodeVerse came out identical."
- Reviewer fix: "The same commit, configuration and Katedrala version produce the same document, byte for byte. Two analyses of CodeVerse came out identical."
- Verifier: ARCHITECTURE.md principle 1 and IR.md define determinism over files, configuration and Katedrala version. The document records generator.version, so the same repository analyzed with another Katedrala version cannot be byte-identical. "Same commit" is also not enough, because working-tree analysis includes uncommitted files.
- Verified fix: Developers.tsx line 17: "The same files, configuration and Katedrala version produce the same document, byte for byte. Two analyses of CodeVerse came out identical."

# visual-responsive-audit

Checked: Read the brief and every site source: page.tsx, layout.tsx, globals.css, all components, lib/site.ts and lib/demo/layout, plan, history and commands. Reviewed all 32 captures in site/.impeccable/review (1440 and 390).

My own Playwright/Edge captures were taken after scrolling the page and waiting for data-settle=done:
- every section at 320, 700, 768, 1024 and 1280: C:/Users/Awab/AppData/Local/Temp/claude/c--Users-Awab-Desktop-PROJECTS-Katedrala/f7609e3b-1ca5-4e98-a818-ae87ef209574/scratchpad/shots/review-visual/out
- interaction and motion frames at 1440 and 390: the same folder, out-i

The scripts are in review-visual (measure, pipeline, hovershift, clicktest, interact, checks2, checks3, commits, marks). They measured:
- the rendered CSS px of every SVG text at 320, 390, 640, 700, 767, 768, 1024, 1280 and 1440
- label-on-label and label-on-joint overlaps
- elements cut by the viewport: none, and document overflow is 0 at every width
- tap targets under 44 px, heading last lines and characters per line
- pipeline subgrid track widths from 1024 to 1440, and title-block rows from 640 to 1440
- layout shift while hovering the hero (768 to 1920), hero click and tap state, and menu state after navigation
- Modules-view edge/joint geometry, Gravity switch frames, commit-log stability and inline-code x-height
- hero settle timing: running at 948 ms, done at 2609 ms on the dev server. That is about 1.66 s, one-shot and purposeful.

First viewports:
- 1440x900 works: headline, lede, CTAs, drawing, card and title block are all above the fold with their bottoms aligned. It is affected by M2, M3, N1 and N19.
- 390x844 shows the headline, lede, CTAs and most of the module drawing, but the level labels are 7.5 px (M1).

Section headings sit on the frame edge at every width, and I found no single-word widows in headings.

## C1 — CONFIRMED (critical) — how-it-works
- File: site/app/globals.css
- Problem: From 1024 px to about 1350 px the five-pass pipeline breaks. The Parse and Link stages are wider than their grid cells, so their paragraphs and artifact boxes run under the next stage. At 1024 to 1180 the text visibly overprints; at 1280 the Link/Infer gutter collapses.
- Evidence: Stage width vs its column track. At 1024, Parse is 209.6 px and Link 233.0 px inside 172 px stages (the other three are 172 px). At 1180 they are 210 and 233 px inside 198 px. At 1280, Link is 233 px inside 218 px and the gutter to Infer drops from 24 px to 9 px. Widths match only from 1366. Cause: inside @media (min-width:1024px) each .pipeline-stage is display:grid with grid-template-rows:subgrid and an implicit auto column. That column's min-content comes from the nowrap dd.truncate values 'payment.service.ts' and 'payment.service.ts:14', so truncate never engages. In out/1024-how-it-works.png, 'exports and' runs under Link, 'paths,' collides with 'discovered', 'exports' collides with 'confidence', and the artifact boxes overlap.
- Reviewer fix: In the existing @media (min-width: 1024px) pipeline block, add `grid-template-columns: minmax(0, 1fr);` to `.pipeline-stage`. Keep values whole instead of truncating them, because the line number is the point of the 'from' row. Add `.pipeline-artifact > div { flex-wrap: wrap; column-gap: 0.75rem; }`, and in Pipeline.tsx change `<dd className="truncate text-ink">` to `<dd className="ml-auto min-w-0 text-right text-ink [overflow-wrap:anywhere]">`. If the 20 to 29 character lines at 1024 to 1279 still feel cramped, start the horizontal beam at 1280 instead of 1024.
- Verifier: Reproduced live (verify-visual/c1.mjs). At 1024 every stage box is 172px, but the stage's implicit grid column is 209.6px (Parse) and 233.0px (Link), so its p and dl paint 37.6px and 61.0px past the box. Parse intrudes 17.1px into Link and Link 40.5px into Infer. At 1100 Link intrudes 26.2px, at 1180 11.2px, at 1280 the Link to Infer gutter is 8.6px, and widths match only from 1366. out/c1-1024.png shows 'exports and', 'paths,'/'discovered' and 'exports'/'confidence' overprinting, with the artifact boxes overlapped. The root cause is as described. The reviewer's fix is incomplete in one respect: .pipeline-artifact is itself a grid with an auto column, so adding minmax(0,1fr) to the stage alone still overflows by 24.6/48px at 1024 (tested), and the dd must be allowed to wrap. The reviewer's full fix removes all overlap, but it has two side effects. The shared subgrid row stretches the shorter dl's, spreading their rows about 50px apart, and the row's gap-3 adds a 12px row-gap once a row wraps. The refined fix below gives 0px overflow at 390/768/1024/1180/1280/1440 with compact boxes (out/c1fix3-1024.png, out/c1fix3-1280.png).
- Verified fix: globals.css: in the existing `@media (min-width: 1024px)` pipeline block add `grid-template-columns: minmax(0, 1fr);` to `.pipeline-stage`, and add `align-content: start;` to `.pipeline-artifact`. Pipeline.tsx: `<div key={key} className="flex justify-between gap-3">` -> `<div key={key} className="flex flex-wrap justify-between gap-x-3">`; `<dd className="truncate text-ink">{value}</dd>` -> `<dd className="ml-auto min-w-0 text-right text-ink [overflow-wrap:anywhere]">{value}</dd>`. Values stay whole: at 1024 Parse and Link put each value under its key, and Link shows `payment.service.ts` / `:14`. Every row is single-line from 1366.

## M1 — CONFIRMED (major) — top
- File: site/components/hero/HeroDrawing.tsx
- Problem: Hero drawing text size jumps at every breakpoint. From 640 to 767 the module drawing fills the width and its labels outgrow the lede. At 768 the 16-member drawing drops into a 405 px column and becomes unreadable, and it stays under 10 px until about 1180. Level labels (+7 to ±0) are under 10 px at every width except 640 to 767 and 1440.
- Evidence: Rendered #top .drawing-label, with level labels in brackets, in CSS px: 320: 10.2 (6.0). 390: 12.7 (7.5). 700: 22.8 (13.4). 767: 25.0 (14.7), larger than the 18.7 px lede. 768: 6.9 (5.3). 1024: 9.3 (7.1). 1280: 11.6 (9.0). 1440: 13.0 (10.0). At 768 the h1 wraps to 3 lines in a 5/12 column, the CTAs stack, and the drawing column ends 270 px above the card (out/768-first-viewport.png, out/700-top.png).
- Reviewer fix: 1) Stack the hero until lg. Change `md:col-span-5 md:pt-8 lg:pt-12` to `lg:col-span-5 lg:pt-12`, `md:col-span-7` to `lg:col-span-7`, and the desktop card wrapper `md:block` to `lg:block` (see M3).
2) Switch drawings at sm instead of md. The member drawing wrapper becomes `hidden sm:block sm:max-w-[48rem]` and the module drawing `sm:hidden`. Under the drawing, show the ModuleCard below sm and the MemberCard from sm to lg (`hidden sm:block lg:hidden`). Labels then render at 10.4 px at 640, 12 px at 768 and about 13 px at 1023.
3) In LoadDrawing.tsx, add a ResizeObserver on the svg with `k = frame.width / svg.clientWidth`. Render member labels at `Math.max(labelSize, 11 * k)` and level labels at `Math.max(10, 10 * k)` user units, which gives 11 px at 1024. Apply N1 together with this so the larger labels stay clear.
- Verifier: Measured the visible hero drawing (m1.mjs). Rendered label/level-label sizes: 320 10.2/6.0, 390 12.7/7.5, 640 20.9/12.3, 700 22.8/13.4, 767 25.0/14.7 (lede 18.7), 768 6.9/5.3, 834 7.5/5.8, 1024 9.3/7.1, 1280 11.6/9.0, 1440 13.0/10.0. These are identical to the reviewer's figures. At 768 the h1 is 3 lines, the CTAs stack (474/530), and the title block ends at 495 while the card ends at 773, leaving a 278px void (out/m1-768-first.png). The hero centerpiece is unreadable on tablet portrait (768 to 1023). Checked the fix arithmetic: stacking until lg with the member drawing from sm gives 10.1px at 640 (not 10.4), 12.1 at 768 and 13.1 at 1023. Simulated part 3 (an 11px floor, k = 760/width) with N1 applied: zero text/text or text/joint collisions at 1024/1180/1280/1440 (m1n1.mjs, out/m1n1-1024.png). Without N1, the floor pushes UserRepository into the SessionStore joint at 1024, so the two must ship together.
- Verified fix: HeroDrawing.tsx: `col-span-12 flex flex-col md:col-span-5 md:pt-8 lg:pt-12` -> `col-span-12 flex flex-col lg:col-span-5 lg:pt-12`; desktop card slot `mt-auto hidden pt-12 md:block` -> `mt-auto hidden min-h-[16.5rem] pt-12 lg:block` (see M3); `col-span-12 md:col-span-7` -> `col-span-12 lg:col-span-7`; member-drawing wrapper `hidden md:block` -> `hidden sm:block sm:max-w-[48rem]`; module-drawing wrapper `md:hidden` -> `sm:hidden`; phone card `mt-4 md:hidden` -> `mt-4 sm:hidden` and move it directly after the module drawing (M2); after {titleBlock} add `<div className="mt-4 hidden sm:block lg:hidden" aria-live="polite">{member === null ? <IdleCard /> : <MemberCard id={member} />}</div>`. LoadDrawing.tsx (covers 1024-1279): ResizeObserver on the svg, `k = frame.width / entry.contentRect.width` in state; pass `Math.max(labelSize, 11 * k)` to MemberLabel and give level labels `style={{ fontSize: Math.max(10, 10 * k) }}`. Ship with N1.

## M2 — CONFIRMED (major) — top
- File: site/components/drawing/LoadDrawing.tsx
- Problem: Selecting a hero joint does the opposite of what the card invites ('Select any joint...'). On desktop the click clears the selection the hover just made. On phones the first tap selects and immediately deselects. On phones the result card also renders below the title block, off-screen when tapping in the first viewport.
- Evidence: At 1440, hovering PaymentService sets aria-pressed=true and the card shows PaymentService. A mouse click with the pointer still on the joint sets aria-pressed=false, the card reverts to 'Carries the most load / Database', and the drawing goes dark under the cursor. With touch emulation at 390, one tap on 'Payments' leaves aria-pressed=false and the card idle; a second tap sets it true. Cause: onPointerEnter and onFocus call setActive(id), then onClick toggles `current === id ? null : id`. On touch the svg's onPointerLeave also fires between them.
- Reviewer fix: In the interactive member props:
- `onPointerEnter: (e) => { if (e.pointerType === 'mouse') setActive(member.id) }`
- `onFocus: (e) => { if (e.currentTarget.matches(':focus-visible')) setActive(member.id) }`
- `onClick: () => setActive(member.id)`: select, never toggle. Escape, blur and pointer leave already clear it.
On the svg: `onPointerLeave={interactive ? (e) => { if (e.pointerType === 'mouse') setActive(null) } : undefined}`. In HeroDrawing.tsx, render the phone card directly after the module drawing and before {titleBlock}.
- Verifier: Reproduced (m2.mjs). Desktop at 1440: hovering PaymentService sets aria-pressed=true and mousedown focuses it. The click then sets aria-pressed=false and the card reverts to 'Carries the most load'; a second click selects again. Touch at 390, traced events: pointerenter > pointerleave(svg) > mousedown > focusin > click. After the first tap pressed=false and the card stays idle, and the second tap selects. Tapping Orders after Payments leaves nothing selected, so every new module needs two taps. Even a successful tap updates a card at top 882 in an 844px viewport. I also verified that :focus-visible is false for mouse and touch focus and true for keyboard Tab on these g[tabindex] elements, so the reviewer's onFocus guard works.
- Verified fix: LoadDrawing.tsx: svg `onPointerLeave={interactive ? () => setActive(null) : undefined}` -> `onPointerLeave={interactive ? (event) => { if (event.pointerType !== "touch") setActive(null); } : undefined}`. Member props: `onPointerEnter: (event: React.PointerEvent<SVGGElement>) => { if (event.pointerType !== "touch") setActive(member.id); }`, `onFocus: (event: React.FocusEvent<SVGGElement>) => { if (event.currentTarget.matches(":focus-visible")) setActive(member.id); }`, `onClick: () => setActive(member.id)` (select, never toggle; Escape, blur and mouse leave still clear). Use `!== "touch"` rather than the reviewer's `=== "mouse"` so pen hover keeps working. HeroDrawing.tsx: render the phone card `<div className="mt-4 sm:hidden" aria-live="polite">...</div>` right after the module-drawing wrapper, before {titleBlock}. That lifts it about 100px, so its top shows after a tap in the 390x844 first viewport.

## M3 — CONFIRMED (major) — top
- File: site/components/hero/HeroDrawing.tsx
- Problem: Hovering hero joints moves the whole page below the hero. The card grows from 128 px (idle) to as much as 213 px, and the copy column then sets the row height.
- Evidence: Top of #how-it-works while hovering each member, compared with idle: 1440 +58 px (Database); 1920 +70 px; 1280 +84 px (OrderService); 1024 +84 px (ApiGateway); 768 +146 px (Database, with a 296 px card). Sweeping the pointer across the drawing makes the next section bounce (hovershift.mjs).
- Reviewer fix: Reserve the tallest card so the row never depends on hover. Change `<div className="mt-auto hidden pt-12 md:block" aria-live="polite">` to `<div className="mt-auto hidden min-h-[16.5rem] flex-col justify-end pt-12 lg:flex" aria-live="polite">`: 48 px of padding plus 216 px, the tallest card measured at 1024 and above being 213 px. Cards then grow upward inside the slot. Make the drawing column `flex flex-col` and give the title block `lg:mt-auto` so the card and title-block bottoms stay aligned. Give the below-lg card slot a matching min-height.
- Verifier: Reproduced (m3.mjs). Hovering members moves #how-it-works by 146px at 768 (Database, 296px card), 84px at 1024 and 1280, 73px at 1366, 58px at 1440 and 70px at 1920. The idle card is 129px; the tallest is 213px at 1024 and above. The reviewer's reserved slot removes the movement, but its extra steps are harmful (m3full.mjs). With `justify-end` the card's top, and so its title, jumps on every hover as heights change. `lg:mt-auto` on the title block detaches the legend from the drawing by 73px at 1440, 116px at 1280 and 161px at 1024. A reserved block slot with the card at its top moves neither the next section nor the card top (0px at 1024 to 1920, m3top.mjs) and keeps the legend 12px under the drawing. The cost is about 61px of extra hero height at 1440.
- Verified fix: HeroDrawing.tsx desktop card slot `<div className="mt-auto hidden pt-12 md:block" aria-live="polite">` -> `<div className="mt-auto hidden min-h-[16.5rem] pt-12 lg:block" aria-live="polite">` with M1's lg split (48px padding + 216px >= the 213px tallest card at 1024+). Keep it a block, with no flex/justify-end, and do not move the title block. If the md split is kept instead of M1, use `md:block md:min-h-[22rem] lg:min-h-[16.5rem]` (the tallest card is 296px at 768).

## M4 — CONFIRMED (major) — architecture
- File: site/components/sections/ArchitectureExplorer.tsx
- Problem: The Modules view draws dependencies that do not exist, and it is the default view on phones. Three module edges run straight through other modules' joints, vertical edges lie on top of each other, and arrowheads land on labels because every module label sits above its joint, in the path of incoming edges.
- Evidence: Computed from the rendered plan at 390 and 1440. Gateway→Orders passes 0.0 units from the Checkout joint centre, so it reads as Gateway→Checkout→Orders. Checkout→Users passes 1.1 units from Billing, and Orders→Payments passes 1.6 units from Auth. Gateway→Checkout, Gateway→Orders and Checkout→Orders overlap on x=500. In the close-up out-i/modules-center-2x.png, one line runs through 'Checkout' and its joint and an arrowhead touches 'Orders'. Module labels are placed at y = -18 - n·2.5.
- Reviewer fix: In the PLAN_MODULE_EDGES map, render a <path> instead of a <line>. When the straight segment passes within (that joint's r + 8) of another module centre, draw a quadratic arc bending 48 units away from it; EntropyStage's arc() has the maths. Otherwise draw a straight path. The `plan-edge plan-module-edge` classes and markerEnd work on paths unchanged. Put module labels beside the joint instead of above it: `<text x={side * (r + 8)} y={4} textAnchor={side < 0 ? 'end' : 'start'}>`, with side = -1 for bays left of the plan's centre line and +1 otherwise.
- Verifier: Confirmed from the live DOM at 390 and 1440 (m4.mjs). Joints sit at Gateway(500,65) Checkout(500,183) Orders(500,301) Auth(412,419) Billing(672,419) Payments(328,537) Users(756,537) Platform(500,655). Gateway->Orders passes 0.0 units from Checkout's centre, Checkout->Users passes 1.1 from Billing (r 9.5), and Orders->Payments passes 1.6 from Auth (r 12). out/m4-1440-modules.png reads as Checkout->Billing and Orders->Auth->Payments, which do not exist in the demo system. This is the default view on phones. A geometric evaluator (m4geom.mjs/m4search.mjs) checks joint clearance, edges through label boxes at 12.5px and 34px label sizes, and near-parallel overlaps. It finds 22 issues on desktop and 30 on phones today. The reviewer's arc-plus-side-label rule fixes the three pass-throughs but leaves 8 to 9 issues. Checkout->Payments runs through the left-side Auth label, Checkout->Users through Orders, and Users->Platform through the Platform label on phones. The collinear Gateway->Orders arc either crosses the Checkout label or runs along Gateway->Auth. Offsetting joints inside their bays, with labels beside them, leaves 0 issues (minimum edge-to-joint clearance 12.8 units) and renders cleanly at 390 and 1440 (out/m4-proposed-390.png, out/m4-proposed-1440.png).
- Verified fix: ArchitectureExplorer.tsx: import `type ModuleId` from "@/lib/demo/system". After `bayCenter` add `const MODULE_JOINT: Record<ModuleId, { readonly dx: number; readonly side: -1 | 1 }> = { gateway: { dx: 20, side: 1 }, checkout: { dx: -72, side: -1 }, orders: { dx: 72, side: 1 }, auth: { dx: -20, side: -1 }, billing: { dx: 0, side: 1 }, payments: { dx: 88, side: -1 }, users: { dx: -16, side: 1 }, platform: { dx: 0, side: -1 } }; const modulePoint = (id: ModuleId) => { const c = bayCenter(id); return { x: c.x + MODULE_JOINT[id].dx, y: c.y }; };`. Use modulePoint instead of bayCenter for the module edges (`const a = modulePoint(edge.source); const b = modulePoint(edge.target);`), for collapsed members (`const center = modulePoint(member.module);`) and for module joints (`const c = modulePoint(bay.id);`). Replace `<text y={-18 - bay.members.length * 2.5} textAnchor="middle" className="plan-label">` with `<text x={MODULE_JOINT[bay.id].side * (7 + bay.members.length * 2.5 + 8)} dy="0.34em" textAnchor={MODULE_JOINT[bay.id].side < 0 ? "end" : "start"} className="plan-label">`. Optional: place the aggregate count at 35% along the edge (`x={x1 + (x2 - x1) * 0.35 + 6} y={y1 + (y2 - y1) * 0.35 - 4}`) so the Orders->Platform '2' leaves the Auth->Users crossing.

## M5 — CONFIRMED (minor) — architecture
- File: site/components/sections/ArchitectureExplorer.tsx
- Problem: From 640 px to about 1160 px the explorer opens in Members view at a scale where member and bay labels are unreadable. At lg the plan is also squeezed into 9 columns beside a 3-column aside, and the zoom group wraps onto its own toolbar row.
- Evidence: Rendered .plan-label and .plan-bay-label in Members view: 640: 7.3 and 6.2 px. 768: 8.8 and 7.4 px. 1024: 8.7 and 7.3 px. 1280: 11.0 and 9.2 px. 1440: 12.3 and 10.3 px. Modules view is forced only by matchMedia('(max-width: 639px)'). See out/1024-architecture.png and out/768-architecture.png.
- Reviewer fix: Give the plan the full width until xl: `col-span-12 lg:col-span-9` becomes `col-span-12 xl:col-span-9`, and the aside's `lg:col-span-3` becomes `xl:col-span-3`. At 1024 the plan is then 942 px wide with 11.8 px labels; at 1279 the labels are 14.7 px. Open in Modules below lg with `matchMedia('(max-width: 1023px)')`. Add a module scale for 640 to 1023 in globals.css: `@media (min-width: 640px) and (max-width: 1023px) { .plan-module .plan-label { font-size: 20px; stroke-width: 6px } .plan-count { font-size: 18px } }`.
- Verifier: Measured Members-view member/bay label sizes: 640 7.3/6.2, 768 8.8/7.4, 1024 8.7/7.3, 1180 10.1/8.5, 1280 11.0/9.2, 1440 12.3/10.3. Modules is forced only below 640, and the zoom group wraps to its own row at 1024 only (out/m5-768-viewport.png). This is a real legibility loss on tablets. The plan has +/-, Fit, ctrl-wheel zoom and drag, so it is degraded rather than unusable, hence minor. The reviewer's xl split has a side effect: at 1024 to 1279 it moves the selection card below a ~690px-tall plan, off-screen while selecting. A CSS label bump keeps the 9/3 layout. Validated by injection (m5fix.mjs): member labels 9.4/11.3/12.2/11.2/12.9/14.1px at 640/768/834/1024/1180/1279, no text/text or text/joint collisions, and every label inside its bay (out/m5fix-1024.png).
- Verified fix: globals.css (@layer components): `@media (min-width: 640px) and (max-width: 1279px) { .plan-member .plan-label { font-size: 16px; } .explorer-sheet .plan-bay-label { font-size: 13px; } }`. Scope the bay rule to .explorer-sheet because the Rules drawing reuses .plan-bay-label. ArchitectureExplorer.tsx: member label `<text y="26" textAnchor="middle" className="plan-label">` -> `<text y="24" textAnchor="middle" className="plan-label">`, so 16-unit descenders stay inside the 70-unit bay.

## M6 — CONFIRMED (major) — impact
- File: site/components/sections/ImpactStage.tsx
- Problem: The impact drawing is the full 16-member drawing at every width, so on phones the member names are specks. It is also below 10 px at 1024 to 1180.
- Evidence: Rendered #impact .drawing-label, with level labels in brackets: 320: 4.9 px (3.8). 390: 6.1 px (4.7). 640: 10.1 (7.7). 1024: 9.3 (7.1). 1280: 11.6 (9.0). See out/320-impact.png and mobile-impact.png. The hero already switches to the module reduction on phones for this reason.
- Reviewer fix: Below sm, render the module reduction as the hero does: `<div className="sm:hidden"><LoadDrawing frame={MODULE_FRAME} members={modules} edges={moduleEdges} maxEdgeLoad={MAX_MODULE_EDGE_LOAD} levels={MAX_MODULE_LEVEL} labelSize={17} settle={false} interactive={false} highlight={moduleHighlight} title={...} /></div>`. Wrap the member drawing in `hidden sm:block`. Build moduleHighlight as follows: focus is the target's module; members are the modules of the lit members; edges are `${moduleOf(m)}>${moduleOf(impact.next.get(m))}` for lit members whose next step crosses a module. The minimum label size from M1 in LoadDrawing covers 1024 to 1279.
- Verifier: Measured #impact drawing-label/level-label: 320 4.9/3.8, 390 6.1/4.7, 640 10.1/7.7, 1024 9.3/7.1, 1280 11.6/9.0. The 16-member MEMBER_FRAME drawing renders at every width, unlike the hero, which switches to the module reduction for this reason. On phones the drawing becomes decoration, although the brief asks for a deliberate mobile representation in this section. The module mapping in the fix is sound: impact.next gives each affected member's next hop toward the target, so module edges `${moduleOf(m)}>${moduleOf(next)}` (when the modules differ) all exist in MODULE_EDGES. Found while checking: every LoadDrawing defines `<pattern id="ground-hatch">`, and url(#ground-hatch) resolves to the first one in the document. On phones that one sits inside the display:none member drawing, so the hero's phone drawing currently renders no hatched ground (out/hatch-390.png vs out/hatch-1440.png). A hidden/visible pair in Impact would repeat this.
- Verified fix: Move the `modules`/`moduleEdges` arrays out of HeroDrawing.tsx into a shared module (e.g. export MODULE_DRAWING_MEMBERS and MODULE_DRAWING_EDGES from components/drawing/systemDrawings.ts) and import them in both files. ImpactStage.tsx: `const moduleOf = new Map(NODES.map((n) => [n.id, n.module]));` and `const moduleHighlight = useMemo(() => { const lit = new Set<string>(); const litEdges = new Set<string>(); for (const [member, d] of impact.distance) { if (d > revealed) continue; const a = moduleOf.get(member)!; const b = moduleOf.get(impact.next.get(member)!)!; lit.add(a); if (a !== b) litEdges.add(`${a}>${b}`); } return { focus: moduleOf.get(target)!, members: lit, edges: litEdges }; }, [impact, revealed, target]);`. Wrap the existing LoadDrawing in `<div className="hidden sm:block">` and add `<div className="sm:hidden"><LoadDrawing frame={MODULE_FRAME} members={MODULE_DRAWING_MEMBERS} edges={MODULE_DRAWING_EDGES} maxEdgeLoad={MAX_MODULE_EDGE_LOAD} levels={MAX_MODULE_LEVEL} labelSize={17} settle={false} interactive={false} highlight={moduleHighlight} title={`Impact of changing ${target}, by module: ${counted(modules.size, "module")} affected`} /></div>` (12.7px labels at 390). In LoadDrawing use `const hatchId = useId();` with `<pattern id={hatchId} ...>` and `fill={`url(#${hatchId})`}`, which also restores the hatch under the hero's phone drawing.

## M7 — CONFIRMED (minor) — rules
- File: site/components/sections/Rules.tsx
- Problem: The violation drawing (viewBox 620x230) just shrinks to phone width with no mobile representation, so the one picture of the rule breach is unreadable. It is also under 10 px at 1024 to 1180.
- Evidence: At 390, bay labels render at 5.5 px, member labels at 6.5 px, and 'prohibited: controllers → repositories' at 5.7 px. At 320 they are 4.3, 5.1 and 4.5 px; at 1024, 8.6, 10.2 and 9.0 px. See out/320-rules.png and mobile-rules.png.
- Reviewer fix: Add a portrait variant shown below sm (`sm:hidden`, with the current drawing in `hidden sm:block`). Use viewBox `0 0 320 400` with the bays stacked (x 20, width 280, height 84, y 20/150/280) and their labels at 10.5. Draw OrderController→OrderService→OrderRepository straight down x=160 and the violating import as the dashed .rules-violation arc on the right (`M 172 62 C 300 120, 300 300, 172 322`), with the break mark on the arc and the prohibited label at y 392. At 324 px wide every label renders at 10.5 px or more. For 1024 to 1279, stack the two panels until xl by changing `lg:col-span-5` / `lg:col-span-7` to `xl:`.
- Verifier: Measured bay/member/'prohibited' labels: 320 4.3/5.1/4.5, 390 5.5/6.5/5.7, 1024 8.6/10.2/9.0. The labels are illegible on phones. However, the figcaption directly below repeats everything the drawing says (rule id, 'OrderController now depends on OrderRepository', the explanation, file:line), so a supplementary visual degrades rather than information being lost, hence minor. A much smaller fix than the portrait redraw, validated by injection (m7fix.mjs): stepped label sizes give 9.9/11.5/10.5px at 390, 9.9 to 15.6px at 480 to 639 and 10.2/11.4/10.2px at 1024. There are no text collisions and every label stays inside its bay from 320 to 1440 (out/m7-css-390.png). 320 improves to 7.8/9.0/8.2px; the reviewer's portrait variant is the option if 320-class screens matter.
- Verified fix: globals.css (@layer components): `@media (max-width: 479px) { .violation .plan-bay-label { font-size: 19px; stroke-width: 6px; } .violation .plan-label { font-size: 22px; stroke-width: 6px; } .violation .rules-label { font-size: 20px; } } @media (min-width: 480px) and (max-width: 639px) { .violation .plan-bay-label { font-size: 15px; } .violation .plan-label { font-size: 17.5px; } .violation .rules-label { font-size: 16px; } } @media (min-width: 1024px) and (max-width: 1279px) { .violation .plan-bay-label { font-size: 12.5px; } .violation .plan-label { font-size: 14px; } .violation .rules-label { font-size: 12.5px; } }`.

## M8 — CONFIRMED (major) — gravity
- File: site/components/sections/GravityStage.tsx
- Problem: The tributary drawing keeps 11.5-unit labels in a 560-unit viewBox, so on phones the member names cannot be read.
- Evidence: Rendered #gravity .drawing-label: 5.9 to 7.2 px at 320 and 7.4 to 8.9 px at 390, including the selected member. Fine from 640 (12.1 px). See out/320-gravity.png and mobile-gravity.png.
- Reviewer fix: Measure the svg with a ResizeObserver (`k = W / svg.clientWidth`). Set non-selected labels to `Math.max(11.5, 11 * k)` user units and the selected one to `Math.max(14, 13 * k)`. Make room by alternating label rows: pass each member's index i within its distance row and use `y={isSelected ? r + 22 : i % 2 === 0 ? -11 : 21}`. Neighbours then never share a baseline, so each label can span 2 × 132 units.
- Verifier: Measured #gravity drawing-label: 5.9 to 7.2px at 320 and 7.4 to 8.9px at 390 (the selected member included), 12.1px from 640. The drawing is the only place that names the members resting on the selected one. I simulated the reviewer's fix in the live page for all five choices at 320/360/390/639 (m7m8.mjs). Non-selected labels at max(11.5, 11k) alternating -11/21, and the selected label at max(14, 13k), give 11px and 13px at 320 to 390 with no text/text or text/joint collisions. Labels drawn below joints sit on edges, but the sheet halo keeps them legible (out/m8-rev-390.png). The reviewer's fix misses one case: the ApiGateway empty-state sentence (.tributary-empty, 15 units) stays at 7.7px at 320 and 9.6px at 390.
- Verified fix: GravityStage.tsx: observe the stable `<figure>` with a ResizeObserver and keep `k = W / figure.clientWidth` in state. Observing the figure rather than the svg keeps working if M11 adds key={selected} to the svg. In tributary() store each member's index within its distance row (`positions.set(member, { x, y, i })`). Label: `y={isSelected ? (foundation ? 46 : r + 22) : k > 1.2 && p.i % 2 === 1 ? 21 : -11}` (N2 folded in; staggering only on narrow screens leaves desktop unchanged) and `style={{ fontSize: isSelected ? Math.max(14, 13 * k) : Math.max(11.5, 11 * k) }}`. Empty state: add `style={{ fontSize: Math.max(15, 14 * k) }}` to the `.tributary-empty` text.

## M9 — CONFIRMED (major) — nav
- File: site/components/site/Navbar.tsx
- Problem: The phone and tablet menu (a native <details>) stays open after a link is chosen, covering the section the user just jumped to. There is no Escape or outside-click close either.
- Evidence: At 390, open Menu and tap 'Developers'. The page scrolls to #developers but `document.querySelector('.nav-menu').open === true`, and the panel covers the heading and lede (out-i/390-menu-after-nav.png).
- Reviewer fix: Move the disclosure into a small client component with a ref and close it on navigation: on the panel, `onClick={(e) => { if ((e.target as Element).closest('a')) detailsRef.current?.removeAttribute('open') }}`. While it is open, close it on Escape (return focus to the summary) and on a document pointerdown outside the details.
- Verifier: Reproduced with touch at 390 and 834 (m9m10m11.mjs). After tapping Menu and then 'Developers', the page scrolls to #developers but `.nav-menu.open` stays true. The panel (224x310 at 390) overlaps the section heading and lede (out/m9-390.png). Pressing Escape and tapping outside both leave it open, because a native <details> has none of those behaviours.
- Verified fix: New client component components/site/NavMenu.tsx ("use client") with `const ref = useRef<HTMLDetailsElement>(null)`. It renders `<details ref={ref} className="nav-menu relative lg:hidden" onClick={(e) => { if ((e.target as Element).closest("a")) ref.current?.removeAttribute("open"); }}>{children}</details>`. A useEffect adds document listeners: on keydown Escape, if open set `ref.current.open = false` and focus its <summary>; on pointerdown outside ref.current, close it; remove both listeners on cleanup. Navbar.tsx wraps the existing summary and panel in <NavMenu> instead of <details>.

## M10 — CONFIRMED (minor) — history
- File: site/app/globals.css
- Problem: Below 1024 px the history row and the command-tabs row scroll inside the frame's content box. The peeking item is sliced mid-word inside the page gutter, 16 px from the screen edge on phones and 31 px at 768. Scrolled to the end, the previous item is sliced on the left as well.
- Evidence: At 390, with history scrolled to the end, v4 reads 'e grain', ':ervice', 'w depends on Auth,', cut at x=16 (out-i/390-history-end.png). The command tabs end in 'valida', cut at x=374 (out-i/390-dev-tabs.png). At 768, v4 'Again' and 'AuthS' are cut at x=737 (out/768-history.png).
- Reviewer fix: Let both rows bleed to the viewport and snap to the frame edge. Inside the existing `@media (max-width: 1023px)` blocks add: `.history, .command-schedule { margin-inline: calc(-1 * var(--page-gutter)); padding-inline: var(--page-gutter); scroll-padding-inline: var(--page-gutter); }`. To keep the tab row's bottom rule at frame width, move `border-bottom` from `.command-schedule` to a frame-width wrapper div in CommandShowcase.tsx.
- Verifier: Reproduced. At 390 the history scroller spans x 16..374 (scrollWidth 1104/358). Scrolled to the end, v4 is sliced at x=16 inside the gutter ('e grain', 'ow depends on Auth,'; out/m10-390-history-end.png), and the tab row cuts 'valida' at 374 (468/358). At 768 history spans 31..737 and the tabs fit. Everything stays reachable by scrolling, so the defect is the clipped-mid-word look, hence minor. I validated the bleed by injection (m10fix.mjs). The ol and tablist span 0..390 (0..768); the first item starts at 16 (31) and the last ends at 374 (738) when scrolled to the end, so cards now run off the screen edge. The tab rule stays at frame width without a wrapper by using a content-box background (out/m10fix-390-*.png).
- Verified fix: globals.css, in the existing `@media (max-width: 1023px)` blocks: `.history, .command-schedule { margin-inline: calc(-1 * var(--page-gutter)); padding-inline: var(--page-gutter); scroll-padding-inline: var(--page-gutter); }`. In the `.command-schedule` rule there, replace `border-bottom: 1px solid var(--color-rule);` with `background: linear-gradient(var(--color-rule), var(--color-rule)) bottom / 100% 1px no-repeat; background-origin: content-box;`. This keeps the rule at frame width with no wrapper div.

## M11 — CONFIRMED (minor) — gravity
- File: site/app/globals.css
- Problem: Switching the Gravity member animates the joints (`.tributary-member { transition: transform 380ms }`) but not the edges. For about 300 ms lines start and end in empty space, while leaving members vanish and new ones pop in. The glide also says nothing true about structure, since each member has a different tributary.
- Evidence: Frames 60 ms and 160 ms after clicking PaymentService at 1440: the joints are still travelling but every <line> is already at its final coordinates. The CheckoutService joint is about 12 px above its edges' ends, and InvoiceService is detached from its blue edge (out-i/1440-gravity-switch-60.png and -160.png).
- Reviewer fix: Delete `transition: transform 380ms var(--ease-out)` from `.tributary-member` and cross-fade the whole figure instead. In GravityStage, give the <svg> `key={selected}` and a class `tributary-swap`, with `.tributary-swap { animation: tributary-in 220ms var(--ease-out) both } @keyframes tributary-in { from { opacity: 0 } }`. The existing reduced-motion rule already neutralises it.
- Verifier: Reproduced by sampling frames after clicking PaymentService at 1440 (m9m10m11.mjs). The worst distance from an edge end to its joint is 177.7 user units at 66ms, 101 at 104ms, 13 at 217ms and 5.5 at 259ms, reaching 0 from about 370ms. out/m11-frame-1.png shows edges converging on empty points while joints glide. Persisting members transition `transform` over 380ms while every <line> jumps to its final coordinates and new members pop in. The frames look broken for about 250ms on every switch, but the end state is correct, hence minor.
- Verified fix: globals.css: delete `transition: transform 380ms var(--ease-out);` from `.tributary-member`; add `.tributary-swap { animation: tributary-in 220ms var(--ease-out) both; } @keyframes tributary-in { from { opacity: 0; } }`. GravityStage.tsx: `<svg key={selected} viewBox={`0 0 ${W} ${H}`} className="tributary-swap block h-auto w-full" ...>`. The global reduced-motion rule already neutralises the animation.

## N1 — CONFIRMED (minor) — top
- File: site/lib/demo/layout.ts
- Problem: In the 16-member drawing the 'UserRepository' label runs into the SessionStore joint. This shows in the hero's first viewport at every width of 768 and above, and in the Impact drawing.
- Evidence: Label/joint box overlap of 1.9 to 2.5 × 5 to 9 px at 768, 1024, 1280 and 1440. The close-up out-i/hero-userrepo-2x.png shows the joint's left side swallowed by the label halo, so it reads 'UserRepository)'.
- Reviewer fix: In MEMBER_X, move the right-hand column: `AuthService: { x: 716, side: "above" }` and `SessionStore: { x: 716, side: "below" }`. That leaves at least 13 units of clearance even with M1's larger labels.
- Verifier: Measured in user units: the UserRepository text spans x 592.6..672.0-673.4, while SessionStore's joint spans 669.9..682.1 on the same level (y 434). That is an overlap of 2.1 to 3.5 units plus the 2-unit halo at 768 to 1440; out/n1-1440-2x.png reads 'UserRepository)'. After moving both members to x=716 the label clears the joint, and with M1's 11px label floor there are still no collisions at 1024/1180/1280/1440 (m1n1.mjs). At 1024 SessionStore's label stays 1.8px inside the svg.
- Verified fix: lib/demo/layout.ts MEMBER_X: `AuthService: { x: 676, side: "above" }` -> `AuthService: { x: 716, side: "above" }`; `SessionStore: { x: 676, side: "below" }` -> `SessionStore: { x: 716, side: "below" }`.

## N2 — CONFIRMED (minor) — gravity
- File: site/components/sections/GravityStage.tsx
- Problem: When a foundation is selected (Database, the default), its label is drawn through the ground line and the support legs.
- Evidence: The label baseline is at r + 22 ≈ BASE_Y + 37 with 14-unit text, while the ground line is at BASE_Y + 26. The line crosses the top of 'Database' and the label halo breaks it (out-i/gravity-database-2x.png, desktop-gravity.png).
- Reviewer fix: Use `y={isSelected ? (foundation ? 46 : r + 22) : -11}` so a selected foundation is labelled below the ground; H=420 leaves room.
- Verifier: In the live svg the ground line is at y 398 (BASE_Y + 26) and the selected Database label box spans 396.7..412.2. The line therefore crosses the letter tops, and the halo breaks it (out/n2-before.png). Moving the label to y=46 puts its box at 405.5..420.9. Since 'Database' has no descenders, the glyphs end at baseline 418 and the 2-unit halo ends at 420, within the viewBox. It renders cleanly below the ground (out/n2-after.png).
- Verified fix: GravityStage.tsx: `y={isSelected ? r + 22 : -11}` -> `y={isSelected ? (foundation ? 46 : r + 22) : -11}`.

## N3 — CONFIRMED (minor) — top
- File: site/app/globals.css
- Problem: The hero title block wraps without rules between 640 and 1180 px. The third cell drops to a second row, keeps its border-left against the outer border (a doubled 2 px edge), and gets no divider above it.
- Evidence: Cell tops: 640: 913/913/946. 768: 427/427/461. 1024: 528/528/562. 1180: 589/589/623. It is one row only from 1280. See out/768-first-viewport.png, out/1024-first-viewport.png and out/700-top.png.
- Reviewer fix: Use collapsed rules that work in any wrap state: `.title-block { display: flex; flex-wrap: wrap; border: 1px solid var(--color-rule); overflow: hidden; } .title-block > span { flex: 1 1 auto; padding: 0.5rem 0.75rem; margin: -1px 0 0 -1px; border-top: 1px solid var(--color-rule); border-left: 1px solid var(--color-rule); }`. Delete the `span + span` rules and both 639/640 media blocks.
- Verifier: Cell geometry (nbatch.mjs): at 700, 1024 and 1180 the third span wraps to a second row (e.g. tops 528/528/562 at 1024). Its 1px border-left sits against the container's border, doubling the edge, and with border-top 0 there is no rule between the rows. It is a single row only from 1280. With the reviewer's collapsed-rule CSS injected, the rows are divided with no doubled edge at 1024, and 390 shows three clean rows (out/fix-n3-1024.png, out/fix-n3-390.png).
- Verified fix: globals.css: `.title-block { display: flex; flex-wrap: wrap; overflow: hidden; border: 1px solid var(--color-rule); font-family: var(--font-mono); font-size: var(--text-micro); font-variation-settings: "wdth" 87.5; letter-spacing: 0.02em; color: var(--color-ink-faint); } .title-block > span { flex: 1 1 auto; padding: 0.5rem 0.75rem; margin: -1px 0 0 -1px; border-top: 1px solid var(--color-rule); border-left: 1px solid var(--color-rule); }`. Delete the `.title-block > span + span` rule and both the `(min-width: 640px)` and `(max-width: 639px)` title-block media blocks.

## N4 — CONFIRMED (minor) — impact
- File: site/app/globals.css
- Problem: On phones the three impact counts sit on different baselines, because two of the labels wrap to two lines.
- Evidence: dd tops at 320 are 8848/8827/8848: the '4' sits 21 px higher than '6' and '3'. Same at 390. 'Members affected' and 'HTTP entry points' wrap; 'Modules' does not (out/320-impact.png).
- Reviewer fix: `.impact-counts > div { display: flex; flex-direction: column; } .impact-counts dd { margin-top: auto; padding-top: 0.25rem; }`. Grid items already stretch to the row height, so every value lands on the same line.
- Verifier: The dd tops are 8848/8827/8848 at 320 and 8450/8429/8450 at 390. 'Members affected' and 'HTTP entry points' wrap to 42px while 'Modules' is 21px; the values align at 768. With the fix injected they are 8444/8444/8444 at 390 and equal at 768, 1024 and 1440.
- Verified fix: globals.css: `.impact-counts > div { padding: 0.875rem 1rem 0 0; display: flex; flex-direction: column; }` and in `.impact-counts dd` replace `margin-top: 0.25rem;` with `margin-top: auto; padding-top: 0.25rem;`.

## N5 — REFUTED — impact
- File: site/components/sections/ImpactStage.tsx
- Problem: Line breaks split tokens that belong together: dependency arrows dangle at line ends, and a weight is separated from its ×.
- Evidence: Impact paths at 1440: 'ApiGateway → CheckoutController → CheckoutService →' / 'PaymentService'. At 390 and 320, three of six rows end in '→'. History v5 at 1440, and v4 and v5 at 1024: '+ UserRepository →' / 'OrderService' and '+ PaymentService →' / 'AuthService'. Gravity at 320: '4 other modules ×' / '0.25'.
- Reviewer fix: Bind each arrow to the following name with a no-break space. In ImpactStage, use `<span className="text-ink-faint"> →{" "}</span>`. In lib/demo/history.ts, use `change: "+ PaymentService → AuthService"` and `"+ UserRepository → OrderService"`. In GravityStage, use `{" "}<span className="whitespace-nowrap">× {term.weight.toFixed(2)}</span>`.
- Verifier: The breaks exist (n5.mjs): impact rows break after an arrow from 390 to 1440, the history change lines break after an arrow, and the only split '×' is the Gravity spread row at 320 ('4 other modules ×' / '0.25'). Breaking after a relation or operator is a standard typesetting convention (TeX breaks after binary operators and relations). The trailing arrow signals continuation, and every chain stays readable and unambiguous (out/n5-impact-390.png). Nothing is lost or misread, so this is a style preference. The no-break-space change would be harmless if wanted.

## N6 — CONFIRMED (minor) — evidence
- File: site/app/globals.css
- Problem: Inline code inherits the paragraph's size. Martian Mono's larger x-height and width then make 'createAnalysisService' and 'graphCacheKey' read a size bigger than the sentence around them.
- Evidence: In the #evidence caption, code is 14 px with a 9.0 px x-height against Archivo's 8.0 px at 14 px (+12.5%). It is visibly heavier in desktop-evidence.png, mobile-evidence.png and out/1280-evidence.png.
- Reviewer fix: Add to @layer base: `:where(p, li, dd, figcaption) code { font-size: 0.875em; }`.
- Verifier: A canvas measurement confirms the inline code is 14px with a 9.00px x-height against Archivo's 8.00px at 14px (+12.5%). The page has only two inline <code> elements (the Evidence caption), and both read visibly larger than the surrounding text. This is minor typographic polish. The proposed selector is broader than needed: `:not(pre) > code` targets inline code only, and excludes the CodeBlock and CommandShowcase code, which is always a direct child of pre.
- Verified fix: globals.css @layer base: `:not(pre) > code { font-size: 0.875em; }`.

## N7 — CONFIRMED (minor) — global
- File: site/app/globals.css
- Problem: Small print has no measure and no shared treatment. Section notes vary between 13 and 14 px with 16 to 48 px of top margin. Captions run 100 to 140 characters per line whenever they span a full row. `.measure` (68ch) gives 90-character lines, because ch is the width of '0', about 1.3 average glyphs.
- Evidence: Characters per line:
- Developers note (13px): 140 at 1440, 122 at 768.
- Gravity 'Each term is normalized...': 127 at 768.
- Impact note: 116 at 768.
- Explorer summary: 104 at 768.
- Gravity and Entropy citations (.measure, 14px): 90 at every width.
Margins: Pipeline mt-8, Gravity/Entropy mt-12, Rules/History mt-6, Impact mt-5, Developers mt-4. Sizes: 0.875rem vs 0.8125rem.
- Reviewer fix: 1) Set `.measure { max-width: 54ch; }` (about 70 characters).
2) Add `.footnote { margin-top: 2rem; max-width: 60ch; font-size: 0.8125rem; line-height: 1.6; color: var(--color-ink-faint); }` and use it for the section notes in Pipeline, Gravity, Entropy, Impact, Rules, History and Developers.
3) Add `max-w-[60ch]` to the card and caption paragraphs that span 12 columns below lg: explorer Summary, the Gravity normalisation note, the Impact note, the Ecosystem paragraphs and the guarantee dd.
- Verifier: Measured characters per line (final.mjs): the Developers note (13px) runs 140 at 1440 and 122 at 768. The Gravity normalisation note runs 127 at 768, the Impact note 116, the explorer Summary 104 and the Evidence caption 103 at 768. The .measure citations run 90 (Gravity) and 82 (Entropy) at every width. Note margins vary between 8, 16, 20, 24, 32 and 48px, and sizes between 13 and 14px. Small print at 100 to 140 characters per line is a concrete readability problem; minor.
- Verified fix: globals.css: `.measure { max-width: 54ch; }`; add `.footnote { margin-top: 2rem; max-width: 60ch; font-size: 0.8125rem; line-height: 1.6; color: var(--color-ink-faint); }` and use it for the section notes in Pipeline, Gravity, Entropy, Impact, Rules, History and Developers, replacing their mt-*, text-[...] and text-ink-faint classes. Add `max-w-[60ch]` to the explorer Summary p, the Gravity normalisation p, the Impact note, the Evidence caption, the Ecosystem paragraphs and the guarantee dd.

## N8 — CONFIRMED (minor) — entropy
- File: site/components/sections/EntropyStage.tsx
- Problem: The module drawing scales with its column up to 1.58×, so its labels are larger than the lede and its joints look swollen beside every other drawing (hero labels are 13 px). On phones, the commit list also jumps when the first commit is applied.
- Evidence: Rendered labels: 18.4 px at 640, 22.1 at 768, 16.9 at 1024, 21.3 at 1280 and 23.7 at 1440, with a 14 px joint radius (desktop-entropy.png, out/768-entropy.png). At 390 the commit log top moves 20 px after tapping '+1', because one factor's evidence line wraps to two lines.
- Reviewer fix: Give the svg `className="mx-auto block h-auto w-full max-w-[30rem] lg:mx-0"`. That is 1:1 with the 480-unit viewBox: 15 px labels and 9 px joints, with phones unchanged at 11.2 px. Give each factor's evidence <p> `min-h-[2lh] sm:min-h-0` so the commit list never moves under the finger.
- Verifier: The Entropy svg is 760x716 at 1440 (scale 1.58). Its labels render at 23.7px against a 21px lede (22.1px at 768, 18.4px at 640), heavier than every other drawing (the hero uses 13px) and out of scale beside the 14px factor labels (out/n8-1440.png). At 390, tapping '+1' moves the tapped row 21px because one factor's evidence line wraps; later steps move 0px. With `min-height: 2lh` injected on the evidence p below 640, the shift is 0px at every step at 320/360/390/639, and no evidence line exceeds two lines, so the reservation is sufficient.
- Verified fix: EntropyStage.tsx: svg `className="block h-auto w-full"` -> `className="mx-auto block h-auto w-full max-w-[30rem] lg:mx-0"` (1:1 with the 480-unit viewBox, so 15px labels); evidence `<p className="mt-1 text-[0.8125rem] text-ink-faint">` -> `<p className="mt-1 min-h-[2lh] text-[0.8125rem] text-ink-faint sm:min-h-0">`.

## N9 — CONFIRMED (minor) — rules
- File: site/components/sections/Rules.tsx
- Problem: The config block and the violation panel sit side by side but end at different heights.
- Evidence: Bottom edges differ by 93 px at 1024 (the code block is lower) and 34 px at 1440 (desktop-rules.png, out/1024-rules.png).
- Reviewer fix: Stretch both panels to the row: `<CodeBlock ... className="h-full" />` (CodeBlock already forwards className) and `<figure className="violation flex flex-1 flex-col">` with `mt-auto` on `figcaption.violation-report`.
- Verifier: Measured relative to the shared top, the code block ends at 478 while the violation panel ends at 385 at 1024 (93px), 437 at 1280 (41px) and 444 at 1440 (34px). These are two framed panels with aligned tops and ragged bottoms (out/n9-1440.png); minor polish. The fix works as written. CodeBlock forwards className to its figure, the stretched grid item makes h-full resolve, and the `mt-auto` utility overrides the component-layer margin on `.violation-report`.
- Verified fix: Rules.tsx: `<CodeBlock label="katedrala.config.yaml" language="yaml" code={CONFIG} className="h-full" />`; `<figure className="violation">` -> `<figure className="violation flex flex-1 flex-col">`; `<figcaption className="violation-report">` -> `<figcaption className="violation-report mt-auto">`.

## N10 — REFUTED — evidence
- File: site/components/sections/Evidence.tsx
- Problem: At lg and above, the reasons column ends about 500 px above the end of the JSON block. That leaves a void beside the code and separates the score from its evidence while scrolling.
- Evidence: At 1280 and 1440, the left content ends around 760 px into the section capture while the code block runs to about 1180 to 1260 px (out/1280-evidence.png, desktop-evidence.png).
- Reviewer fix: Add `lg:sticky lg:top-24 lg:self-start` to the left column `<div className="col-span-12 lg:col-span-6">`.
- Verifier: The geometry matches: at 1280 and 1440 the left content ends about 500px above the end of the JSON block, while both grid columns are 812 to 862px tall. But unequal column lengths in a two-column composition are ordinary, not a defect. The stated harm also does not hold. The right column is one real recorded CodeVerse relationship, not evidence for the demo PaymentService score on the left, so there is nothing that must stay together while scrolling. Making the column sticky would be an optional stylistic enhancement.

## N11 — CONFIRMED (minor) — architecture
- File: site/components/sections/ArchitectureExplorer.tsx
- Problem: In Modules view (the phone default), the three relationship-kind toggles are disabled at 40% opacity but still take two toolbar rows. That pushes the zoom group onto a third row: about 170 px of mostly inert controls above the plan.
- Evidence: mobile-architecture.png and out/320-architecture.png show Members|Modules, then greyed 'calls' and 'instantiates', then 'accesses data', then '+ − Fit' on its own row.
- Reviewer fix: Render the kind group only in Members mode: `{mode === "members" && <div role="group" aria-label="Relationship kinds" ...>}`. The Modules toolbar is then one row, with the segmented control on the left and zoom on the right.
- Verifier: At 320 and 390, in the default Modules view, the toolbar is 173px tall: the scale toggle (37px), the three disabled kind toggles on two rows (76px) and zoom on a third row. At 430 it is 131px (out/n11-390.png). In Modules mode the kind toggles do nothing (disabled, opacity 0.4). Without them the Modules toolbar fits one row: Members|Modules (~175px) plus zoom (~123px) fit in 358px.
- Verified fix: ArchitectureExplorer.tsx: render the kinds group only in Members mode, as `{mode === "members" && (<div role="group" aria-label="Relationship kinds" className="flex flex-wrap gap-2">...</div>)}`, and drop `disabled={mode === "modules"}` from the toggles.

## N12 — CONFIRMED (minor) — global
- File: site/app/globals.css
- Problem: On phones most secondary controls are smaller than a comfortable 44 px touch target.
- Evidence: At 390 and 320:
- Copy 51×28; Members/Modules 84×35; kind toggles 87×34
- zoom +/− 36×36; Fit 43×36; impact select 197×35
- commit rows 38 px tall; Gravity chips 40 px
- 'Read the graph as a table' 171×22; nav Menu 66×36
- footer links 16 px tall and 8 px apart (8 links); 'CodeVerse on GitHub' 24 px tall
- Reviewer fix: Under `@media (pointer: coarse)`:
- `.code-copy, .segmented > button, .kind-toggle, .zoom-button, .command-select, .commit, .choice { min-height: 2.75rem; }`
- `.zoom-button { min-width: 2.75rem; }`
- `.table-alternative > summary { padding-block: 0.75rem; }`
- `.nav-menu > summary { height: 2.75rem; }`
For footer links, use `className="block py-2.5 hover:text-ink"` and drop `space-y-2`.
- Verifier: Measured at 390: Copy 51x28, Members/Modules 89x35, kind toggles 87x34, zoom 36x36, impact select 197x35, commit rows 38px tall, Gravity chips 40px, 'Read the graph as a table' 171x22, Menu 66x36, and footer links whose inline boxes are 16px tall. These pass WCAG 2.2 AA 2.5.8 (24px, or the spacing exception) but miss the 44px comfort target for touch; minor. One correction to the fix: the menu summary's height comes from the `h-9` utility, which a rule in @layer components (where the existing pointer:coarse block lives) cannot override. Use Tailwind 4.3's `pointer-coarse:` variant on that element instead.
- Verified fix: globals.css, inside the existing `@media (pointer: coarse)` block in @layer components: `.code-copy, .segmented > button, .kind-toggle, .zoom-button, .command-select, .commit, .choice { min-height: 2.75rem; } .zoom-button { min-width: 2.75rem; } .table-alternative > summary { padding-block: 0.75rem; }`. Navbar.tsx summary: `h-9` -> `h-9 pointer-coarse:h-11`. Footer.tsx: remove `space-y-2` from the ul and give links `className="block py-2.5 hover:text-ink pointer-fine:py-1"`.

## N13 — CONFIRMED (minor) — developers
- File: site/app/globals.css
- Problem: On phones the terminal and code blocks scroll sideways with no cue. Lines are sliced mid-word at the border, so the health evidence column and the JSON paths look truncated rather than scrollable.
- Evidence: At 390: the health transcript is 638 px wide in a 356 px pane ('No member is par|'). Impact is 490 px, diff 461 and validate 396. The JSON is cut at '"sym:src/analysis/analysis-servi|' and analyze.ts at '"@katedrala' (out-i/390-dev-health.png, mobile-evidence.png, mobile-developers.png).
- Reviewer fix: Fade the trailing edge while a block can still scroll. Set `data-overflow` on `.code-block-body` from a ResizeObserver plus scroll listener, true when scrollWidth > clientWidth and the block is not scrolled to the end. Then add `.code-block-body[data-overflow] { mask-image: linear-gradient(to right, #000 calc(100% - 2.5rem), transparent); }`.
- Verifier: At 390 the Evidence JSON is 583px wide in a 356px pane and analyze.ts is 490px; the reviewer measured the health transcript at 638px. Touch shows no persistent scrollbar, and the block edge slices identifiers ('sym:src/analysis/analysis-servi|') and the evidence column, which reads as truncation. Horizontally scrolling code is a common pattern, so this is a minor discoverability issue.
- Verified fix: Add a small hook used by CodeBlock and CommandShowcase on `pre.code-block-body`: `useEffect(() => { const el = ref.current; if (!el) return; const update = () => { if (el.scrollWidth - el.clientWidth - el.scrollLeft > 1) el.dataset.overflow = ""; else delete el.dataset.overflow; }; update(); const ro = new ResizeObserver(update); ro.observe(el); el.addEventListener("scroll", update, { passive: true }); return () => { ro.disconnect(); el.removeEventListener("scroll", update); }; }, [/* CommandShowcase: command.id, because its pre remounts per command */]);`. Add the CSS `.code-block-body[data-overflow] { mask-image: linear-gradient(to right, #000 calc(100% - 2.5rem), transparent); }`.

## N14 — CONFIRMED (minor) — ecosystem
- File: site/app/globals.css
- Problem: Below 1024 px the tools stack into one continuous rule with a joint between every pair. In the page's own drawing language that says each tool rests on the next, whereas the wide layout correctly shows five columns each bearing on the document.
- Evidence: In mobile-ecosystem.png and out/768-ecosystem.png, the .eco-column joints under CodeVerse, CI pipelines, Editors and Exporters sit on the shared rule between tools.
- Reviewer fix: Inside `@media (max-width: 1023px)`, add `.eco-tool:not(:last-child) .eco-column { display: none; }` so only the joint on the beam remains and the rule reads as the tools' common support.
- Verifier: Below 1024, every .eco-tool keeps its .eco-column joint at its bottom-left corner, which lands on the shared stacked rule between tools (out/n14-390.png). The page's own drawing language defines that joint as where a tool's column meets what it rests on. Stacked, it says CodeVerse rests on CI pipelines and so on, contradicting the wide layout, where every tool rests on the document beam. A subtle semantic inconsistency; minor.
- Verified fix: globals.css, in the ecosystem section: `@media (max-width: 1023px) { .eco-tool:not(:last-child) .eco-column { display: none; } }`.

## N15 — CONFIRMED (minor) — global
- File: site/components/ui/Status.tsx
- Problem: The 'Planned after v1' mark is an 8 px square with a 2/1.5 dash. At 1x it renders as a grey smudge that is hard to tell from the open 'In development' square, which weakens the three-state status system.
- Evidence: Compare the close-ups out-i/mark-after-v1-1x.png and mark-in-dev-1x.png (Ecosystem 'Editors' and 'Exporters' at 1440).
- Reviewer fix: Draw every mark at 10 px on whole pixels: `viewBox="0 0 10 10" className="size-2.5"` with `<rect x="1" y="1" width="8" height="8" shapeRendering="crispEdges">`, and `strokeDasharray="2 2"` for after-v1.
- Verifier: Enlarged 1x captures (marks.mjs, out/n15-marks.png) show the problem. The after-v1 mark (8px, a 1.5 stroke on half pixels, 2/1.5 dashes) renders as a grey blurred ring that reads as a soft open square, and the in-development mark is a two-tone blur. A whole-pixel 10px variant (rect 1,1,8,8, stroke 1, crispEdges, dashes 2 2) renders a crisp open square, a crisp dashed square and a filled square. The text label still disambiguates the states, and 2x screens are mostly fine, so this is minor. The reviewer's fix omits the stroke width; at 1.5 with crispEdges the stroke snaps unevenly, so set it to 1.
- Verified fix: Status.tsx: `<svg aria-hidden="true" viewBox="0 0 10 10" className="size-2.5"><rect x="1" y="1" width="8" height="8" shapeRendering="crispEdges" fill={status === "available" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1" {...(status === "after-v1" ? { strokeDasharray: "2 2" } : {})} /></svg>`.

## N16 — CONFIRMED (minor) — architecture
- File: site/components/sections/Architecture.tsx
- Problem: The explorer is the only capability section without a status mark, even though its Modules view shows module grouping, which is inference.
- Evidence: The #architecture Section has no aside. Infer is marked 'In development for v1' in #how-it-works, and Gravity, Entropy, Impact, Rules, History and Developers all carry marks.
- Reviewer fix: Pass `aside={<Status status="in-development" label="Module grouping in development for v1" />}` to the Section, or put the mark beside the Members/Modules control.
- Verifier: Architecture.tsx passes no aside to Section, unlike Gravity, Entropy, Impact, Rules, History and Developers. The lede ('Files, symbols and modules form one typed graph. Group it by module...') and the Modules view present module grouping in the present tense. But docs/ROADMAP.md lists milestone 5, 'Architectural inference' (modules), as Planned, and the Pipeline marks Infer as 'In development for v1'. The page's own rule is that every capability carries a status mark; minor.
- Verified fix: Architecture.tsx: `import { Status } from "@/components/ui/Status";` and pass `aside={<Status status="in-development" label="Module grouping in development for v1" />}` to the Section. Files, symbols and typed relationships ship today; only the grouping does not.

## N17 — CONFIRMED (minor) — evidence
- File: site/app/globals.css
- Problem: The four evidence check marks are load blue although nothing in that list is active, so the page's one accent is spent on bullets.
- Evidence: `.evidence-item { color: var(--color-load) }` colours every tick (desktop-evidence.png). The direction reserves #3EA6FF for architecture that is active right now.
- Reviewer fix: Set `.evidence-item { color: var(--color-ink-faint); }`. The measured contributions on the right already carry the emphasis.
- Verifier: `.evidence-item { color: var(--color-load) }` (globals.css line 1128) colours all four check marks load blue. The file's own header says load blue 'appears only on architecture that is active right now', and nothing in this static list is active. A stated design-rule violation; minor.
- Verified fix: globals.css: in `.evidence-item`, replace `color: var(--color-load);` with `color: var(--color-ink-faint);`.

## N18 — CONFIRMED (minor) — architecture
- File: site/components/sections/ArchitectureExplorer.tsx
- Problem: Ctrl/Cmd+wheel zoom and held arrow-key panning are animated. Every event restarts the 280 ms `.plan-content.is-animated` transition, so the plan trails the input. High-frequency input should apply instantly.
- Evidence: `className={`plan-content ${dragging ? "" : "is-animated"}`}`: only a pointer drag removes the transition. The wheel listener (zoomAt) and onKeyDown (setView) both run with it active.
- Reviewer fix: Add `const [instant, setInstant] = useState(false)`. In the wheel listener, set it true and clear it with a 150 ms timeout after the last event; in onKeyDown, set it when `event.repeat` is true. Apply `is-animated` only when `!dragging && !instant`, so the +/−/Fit buttons and single key presses keep the 280 ms ease-out.
- Verifier: Confirmed: the class is `plan-content ${dragging ? "" : "is-animated"}`, so only a drag disables the 280ms transition. Eight Ctrl+wheel events 16ms apart gave target/rendered scales of 1.15/1.00 through 3.06/2.64, and the plan settled only about 400ms after the last event (final.mjs). I also found that every wheel event zooms a fixed 15% whatever its deltaY (eight small events reached 3.06x), so trackpad pinches, which fire many small-delta events, race to MAX_SCALE. Minor.
- Verified fix: ArchitectureExplorer.tsx: `const [instant, setInstant] = useState(false); const instantTimer = useRef<number | undefined>(undefined); const goInstant = useCallback(() => { setInstant(true); window.clearTimeout(instantTimer.current); instantTimer.current = window.setTimeout(() => setInstant(false), 150); }, []);` (clear the timer on unmount). In the wheel listener call `goInstant()` and replace `zoomAt(event.deltaY < 0 ? 1.15 : 1 / 1.15, x, y)` with `zoomAt(Math.exp(-(event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY) * 0.0015), x, y)`, adding goInstant to that effect's deps. In onKeyDown add `if (event.repeat) goInstant();` before running the action. Class: `plan-content ${dragging || instant ? "" : "is-animated"}`.

## N19 — REFUTED — nav
- File: site/components/site/Navbar.tsx
- Problem: The first viewport has two filled primary buttons with different destinations, nav 'Get started' (README) and hero 'Explore Katedrala' (#how-it-works), plus 'View on GitHub'. The nav button competes with the hero's primary action.
- Evidence: desktop-first-viewport.png and out/1024-first-viewport.png show both buttons as ink-filled (border-ink bg-ink) at equal visual weight in the same viewport.
- Reviewer fix: Use `<Button href={LINKS.readme} size="sm" variant="secondary">` in Navbar.tsx so the hero keeps the only filled button above the fold.
- Verifier: The buttons are not equal weight. The nav button is the sm size (h-9, 36px, 14px text), while the hero primary is md (h-11, 44px). The brief's own navigation spec puts 'Get Started' in the navbar, and the two buttons go to deliberately different places (README vs. #how-it-works). The first viewport has three buttons in all, which is not overdoing CTAs. This is a hierarchy preference, not a defect.
