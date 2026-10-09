export const meta = {
  name: 'm5-build',
  description: 'Implement milestone 5 (architectural inference) from the reviewed plan: foundations, four parallel units, integration, verification',
  phases: [
    { title: 'Foundations', detail: 'U1 PR 1 (types, vocabulary, settings, lexical, ids, canonicalJson, wiring, lint)' },
    { title: 'Foundations 2', detail: 'U1 PR 2 (directories, weighted graph, evidence, test support, model change, replay check)' },
    { title: 'Units', detail: 'U2 components/roles/layers, U3 clustering P1-P6, U4 module stage units, U5 engine work, in parallel' },
    { title: 'Integration', detail: 'U4 modules.ts, then U5 infer.ts, fixtures, goldens, IR docs and schemas, docs' },
    { title: 'Verify', detail: 'full check, CodeVerse run, plan conformance' },
  ],
}

const REPO = 'C:/Users/Awab/Desktop/PROJECTS/Katedrala'
const SP = 'C:/Users/Awab/AppData/Local/Temp/claude/c--Users-Awab-Desktop-PROJECTS-Katedrala/f7609e3b-1ca5-4e98-a818-ae87ef209574/scratchpad'
const PLAN = SP + '/m5-plan.md'
const DESIGN = SP + '/designs/inference.md'

const COMMON = `You are implementing milestone 5, architectural inference, of Katedrala (${REPO}): a deterministic, LLM-free software-architecture analysis engine. TypeScript 6.0.3, Node 22.12+, ESM, pnpm workspace, vitest 5 with fast-check, eslint strictTypeChecked, prettier (printWidth 100). Milestones 1-4 are committed (packages ir, plugin-api, core, adapter-typescript, linker, graph, model, engine); read docs/ARCHITECTURE.md (ADRs), docs/IR.md and CONTRIBUTING.md for the conventions.
THE SPECIFICATION is the reviewed implementation plan ${PLAN} (about 2,500 lines). Read sections 1, 2, 3 and 6 to 8 in full and every subsection of 4 and 5 that concerns your unit. It implements the research design ${DESIGN}; the Python prototypes are in ${SP}/m5/ and the linker-graph replay probes in ${SP}/probe/ and ${SP}/probe2/ (if present). Every choice in the plan carries a decision number (D-01 to D-74): implement it exactly and put the D-number in a comment where the choice is made. Where the plan and the design differ, the plan wins (it was corrected against the real linker output). If you find a real defect in the plan, fix it in the narrowest way, say so in your report with the reason, and keep every other unit's interface intact.
RULES: edit only the files your unit owns (plan sections 2.2 and 6.x); other engineers are working on the other units at the same time. Never edit anything under site/ or .claude/ (another team is working on the website right now). No git commands that write. No dependencies beyond those the plan names. Determinism rules of plan 6 (no Math.random, Date.now, localeCompare, toLocale*, Intl, unicode property classes, toLowerCase/toUpperCase outside asciiLower, or unsorted Map/Set iteration on an output path). TSDoc on every export with complexity, determinism notes, references and the label [DERIVED] or [KATEDRALA HEURISTIC]; heuristic conclusions are worded as inference ("Inferred: ...", D-66). Tests: unit tests, seeded fast-check property tests where the plan names an invariant, the design replays on prototype graphs where the plan requires them, statement coverage of at least 90 % for your files.
CHECKS: run your tests with "pnpm vitest run <paths>", type-check with "pnpm typecheck", lint with "pnpm lint", and format your files with "npx prettier --write <files>". When your unit is done, "pnpm typecheck", "pnpm lint" and "pnpm test" must pass for the whole repository. Prettier failures inside site/ belong to the website team and are not yours; check your own files with "npx prettier --check <files>". Before editing a shared root file (package.json, pnpm-lock.yaml, eslint.config.js, tsconfig files), re-read it, because another unit may have changed it.
REPORT (final answer): for each plan item of your unit: done or not done; the files you changed; the tests you added (names) and their results; every deviation from the plan with its reason; anything another unit must know; open issues.`

const unit = (name, text) => `${COMMON}\n\nYOUR UNIT: ${name}. ${text}`

phase('Foundations')
const u1a = await agent(
  unit('U1, pull request 1', `RESUMED RUN: an earlier attempt at this unit was stopped when the session paused, partway through: packages/inference is partly scaffolded and several shared files already changed (see "git status" and "git diff HEAD" for packages/, docs/IR.md, eslint.config.js, package.json and pnpm-lock.yaml; the root README.md change belongs to the website team, leave it alone). Inspect that work first, keep what is right, and finish PR 1. Implement exactly what plan 6.1 "Order" lists for PR 1: the package scaffold of @katedrala/inference and its wiring (manifests, tsconfig references, the lockfile via "pnpm install"), the minimal src/index.ts, types.ts (every type of plan 3.1), vocabulary.ts, settings.ts, lexical.ts, canonicalJson moved into ir with core's re-export, the module key derivation in packages/ir/src/ids.ts with its docs/IR.md Identifiers text, and the eslint restrictions for the inference package. Its tests as plan 6.1 lists for these files. After you, four units build on types.ts: make it complete and stable.`),
  { label: 'U1 PR1', phase: 'Foundations' },
)

phase('Foundations 2')
const u1b = await agent(
  unit('U1, pull request 2', `U1 PR 1 has landed (its report follows). Implement plan 6.1's PR 2: directories.ts, weighted-graph.ts, evidence.ts, test-support.ts (syntheticModel, shuffledModel and prototypeModel as a faithful port of ${SP}/m5/fixture_graph.py with barrel resolution and entry points), the model change (forEachUnderlyingEdge in packages/model/src/projection.ts), and their tests; then run the linker-graph replay check described in 6.1 and 7.3 and report every difference from plan 7.3.\n\nU1 PR 1 REPORT:\n${u1a}`),
  { label: 'U1 PR2', phase: 'Foundations 2' },
)

phase('Units')
const foundations = `RESUMED RUN: an earlier attempt at your unit was stopped partway when the session paused. Inspect your unit's files first (git status and git diff HEAD under packages/), keep what is right, and continue rather than starting over.

U1 has landed both pull requests; their reports follow.\n\nU1 PR 1 REPORT:\n${u1a}\n\nU1 PR 2 REPORT:\n${u1b}`
const [u2, u3, u4a, u5a] = await parallel([
  () => agent(unit('U2: components, roles and layers', `Implement plan 6.2 completely (components.ts, roles.ts, layers/partition.ts, layers/order.ts, layers/explain.ts, layers/layers.ts and their tests), including the design replays on prototypeModel that 6.2 "Done" requires.\n\n${foundations}`), { label: 'U2 components-roles-layers', phase: 'Units' }),
  () => agent(unit('U3: module clustering P1-P6', `Implement plan 6.3 completely (modules/prior.ts, stems.ts, classes.ts, split.ts, reassign.ts, identity.ts, cluster.ts, reference.test-support.ts and their tests), including the replays that 6.3 "Done" requires.\n\n${foundations}`), { label: 'U3 clustering', phase: 'Units' }),
  () => agent(unit('U4: module stage, unit-level work', `Implement plan 6.4's unit-level work now: modules/declared.ts, scopes.ts (P0), attach.ts (P7), surface.ts (P8), confidence.ts (P9), explain.ts and their tests, using hand-built ScopeClustering values as 6.4 describes. Do NOT write modules/modules.ts yet: it integrates U3's clusterScope, which is being written at the same time; it is done in the next phase.\n\n${foundations}`), { label: 'U4 module stage', phase: 'Units' }),
  () => agent(unit('U5: engine work', `Implement plan 6.5's engine work that can start now: the inference configuration schema and validators (plan 5.2), declarations, the metrics projection options, the inference stage wiring in the engine (analyzeArchitecture next to analyzeStructure, which must keep working), and their tests. infer.ts, the fixture tests, goldens, the IR TSDoc and schemas and the docs come in the integration phase, after the other units land.\n\n${foundations}`), { label: 'U5 engine', phase: 'Units' }),
])

phase('Integration')
const unitsReport = `UNIT REPORTS:\n\nU1 PR 1:\n${u1a}\n\nU1 PR 2:\n${u1b}\n\nU2:\n${u2}\n\nU3:\n${u3}\n\nU4 (unit level):\n${u4a}\n\nU5 (engine):\n${u5a}`
const u4b = await agent(
  unit('U4: module stage integration', `U2, U3, the U4 unit-level work and the U5 engine work have landed (reports follow). Write modules/modules.ts integrating U3's clusterScope with the declared modules, P0 and P7-P9, then the integration tests plan 6.4 requires, including inferModules on prototype graphs reproducing plan 3.16's member lists and confidences for the five named fixtures (6.4 "Done").\n\n${unitsReport}`),
  { label: 'U4 integration', phase: 'Integration' },
)
const u5b = await agent(
  unit('U5: integration', `RESUMED RUN: an earlier attempt at this unit was stopped partway when the session paused; inspect your partial work (git status and git diff HEAD under packages/, tests/ and docs/) and continue rather than starting over. Everything else has landed (reports follow). Complete plan 6.5: infer.ts and index.ts, the end-to-end engine path, tests/fixtures inference tests turning the todo keys of plan 7.2 into real checks (76 todos must drop to 55), the golden documents with the review against plan 3.16, 4.6 and 7.3 (every difference explained in docs/ALGORITHMS.md "Results on the fixtures"), the scale test, the IR TSDoc and regenerated schemas ("pnpm schema"), docs/IR.md semantics, docs/ALGORITHMS.md (new), docs/ARCHITECTURE.md (new ADRs as the plan names), docs/ROADMAP.md (milestone 5 Done only when everything passes), CONTRIBUTING.md and the root README, and the landing-page follow-up list of plan 8.4 written to ${SP}/m5-site-followups.md (do NOT edit site/). Finish with "pnpm check" green except prettier findings inside site/.\n\n${unitsReport}\n\nU4 integration:\n${u4b}`),
  { label: 'U5 integration', phase: 'Integration' },
)

phase('Verify')
const verify = await agent(
  `${COMMON}\n\nYOUR ROLE: verifier. Do not edit repository files except to fix a trivial, clearly broken detail (say so). 1. Run "pnpm check" from the repository root and report the result (prettier findings inside site/ are another team's). 2. Build ("pnpm build") and run the full analysis with inference on the CodeVerse repository at C:/Users/Awab/Desktop/PROJECTS/CodeVerse (read-only, cache disabled) using the engine's new entry point; report timings per stage, the number of components, modules and layers, three example modules with their confidence and evidence, the layers with their ranks, and whether two runs (workers and concurrency 1) give byte-identical documents. 3. Check plan conformance at a high level: every unit's "Done" criteria, the D-numbers present in code (grep), the determinism rules (grep for the banned APIs in packages/inference), docs present. Report findings that need fixing, ordered by severity.\n\n${unitsReport}\n\nU4 integration:\n${u4b}\n\nU5 integration:\n${u5b}`,
  { label: 'verify', phase: 'Verify' },
)

return { u1a, u1b, u2, u3, u4a, u5a, u4b, u5b, verify }
