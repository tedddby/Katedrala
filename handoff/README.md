# Cloud handoff: continuing the Katedrala build

On 2026-10-09 the build of Katedrala moved from a local Claude Code session on the user's Windows machine to a cloud session, so that it runs on the user's cloud credit instead of their plan limits. This folder holds everything the local session knew that was not in the repository:
- the plans;
- the reports of every agent that had finished;
- the reference captures;
- the test harness;
- the two workflows, rewritten to continue where the local run stopped.

This branch, `wip/cloud-handoff`, is not for merging as it is. It starts from local `main` (commit `29e5878`), adds commit `57bfb4d` with all the work in progress, then adds this folder. Before anything reaches `main`, `handoff/` and `.claude/` come out; the user decides when.

## Start here

You are the cloud session that continues the build. Do these in order.

1. **Check the configuration the user asked for**:
   - Claude Opus 5.5 (`claude-opus-5-5`) at max effort, for the session and for every agent.
   - Ultracode on.

   In your first reply, tell the user which model you are and whether a system reminder confirms that ultracode is on. If either is wrong, tell them how to fix it before starting heavy work:
   - The cloud environment's variables should be:
     ```
     ANTHROPIC_MODEL=claude-opus-5-5
     CLAUDE_CODE_EFFORT_LEVEL=max
     CLAUDE_CODE_SUBAGENT_MODEL=claude-opus-5-5
     CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1
     ```
     A changed variable only applies to a new session.
   - The user turns ultracode on by typing `/effort ultracode` in the session. Effort stays at max because the variable sets it.
2. **Set up the machine**: run `bash handoff/setup.sh`, unless the environment's setup script already ran it. It needs the environment's network access set to "Full". It:
   - installs both pnpm projects (the engine workspace and `site/`);
   - links the checkout to `/katedrala`, the path the harness scripts use;
   - clones CodeVerse to `/codeverse` at `6b942bc`;
   - clones the Impeccable skill to `/opt/impeccable`;
   - installs the Playwright harness, with Edge and Chromium.
3. **Load the `workflow-authoring` skill** before you run or edit a workflow.
4. **Start the site's dev server**: `pnpm exec next dev --port 3100` from `site/`, in the background. The builders verify on http://localhost:3100.
5. **Launch both continuation workflows in the background.** They work on separate files: milestone 5 under `packages/`, `docs/` and `tests/`; the landing page under `site/`.
   ```
   Workflow({ scriptPath: "<checkout>/handoff/workflows/m5-continue.js",        args: { repo: "<checkout>" } })
   Workflow({ scriptPath: "<checkout>/handoff/workflows/promotion-continue.js", args: { repo: "<checkout>" } })
   ```
   - `<checkout>` is the absolute path from `git rev-parse --show-toplevel`. Use the real path, not `/katedrala`, so that Next.js, tsc and vitest see a single path.
   - Optional args: `codeverse` (default `/codeverse`), `impeccable` (default `/opt/impeccable/plugin/skills/impeccable`), `model` (default `opus`), `effort` (default `max`).
   - Agents that finished before the pause are not run again. The scripts return their saved reports (the `DONE` table, also in `reports/`) and start real agents only for the work that is left.
6. **Then continue with "What is left"** below. With ultracode on, every substantive step is a workflow with adversarial verification.

If the cloud machine is reclaimed while a workflow runs, relaunch it with `Workflow({ scriptPath, resumeFromRunId })`. Agents that completed return from cache, but only up to the first one that had not finished; every call after that runs again. Give any agent that was cut off mid-work a "RESUMED RUN: inspect your partial work and continue" note in its prompt before relaunching.

## The project: rules that apply to every step

Katedrala is a standalone, open-source (MIT), deterministic software-architecture intelligence engine for TypeScript and JavaScript first. It is built as a pnpm monorepo in 15 milestones: 1 to 4 are done, and 5 and the landing page are in progress.

**The user's standing rules:**
- **No LLM in the core analysis.** Inferred architecture carries confidence and evidence. Katedrala's own heuristics (Gravity, Entropy, the inference rules) are documented as heuristics, distinct from established, cited concepts.
- **Never fake functionality.** If something cannot be done correctly yet, define the interface and document the limitation rather than pretending it works.
- **CodeVerse** (github.com/tedddby/CodeVerse) will consume Katedrala's output through a separate adapter, but it must never be a dependency of Katedrala.
- **Work autonomously.** Work through the milestones without asking permission between normal steps. After each milestone: run the tests, lint, typecheck, inspect the output, fix, and update the docs. Then report in exactly this format: **Implemented / Tests / Benchmarks / Architecture decisions / Known limitations / Next milestone**.
- **Don't start milestone 6** or later in this session unless the user asks.

**Technical decisions:**
- TypeScript is pinned to 6.0.3. TS 7 has no stable JS compiler API, and typescript-eslint needs TS below 6.1.
- Node 22.12 or later.
- ESM throughout.
- vitest 5 with fast-check.
- eslint strictTypeChecked.
- prettier, printWidth 100.
- Naming conventions:
  - JSON and IR fields are camelCase.
  - Config YAML keys are snake_case.
  - Enum values are kebab-case.
  - IDs are based on path and name.
- Determinism is a requirement (ADR-007). The banned APIs are listed in `m5-plan.md` section 6.

**Git, in the cloud:**
- Commit on this branch.
- Push only this branch. Never push `main`, never force-push, and don't merge.
- End every commit message with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
- Stage explicit paths. Never commit captures; `handoff/.gitignore` keeps new ones out.
- `.claude/skills/` is on this branch only because the user asked for it. `.claude/` stays in the root `.gitignore`.

**The landing page** (`site/`, from `landing-brief.md`, the user's verbatim brief):
- **Do not fake the product.** Every product claim must match Katedrala's real implementation, or be clearly marked as a future capability.
- The status vocabulary is exactly: "Available today", "Planned for v1" (key `planned`), "Planned after v1" (key `after-v1`). Every capability carries a status mark. Use the present tense only for what is available today.
- Never invent GitHub stars, downloads, users, benchmarks or customers. Real numbers come only from the data files.
- Don't copy another company's visual identity.
- The cathedral metaphor lives in structure and geometry only: no church imagery, crosses or fantasy.
- The GitHub repository is public (since 2026-10-03), but the site makes no "developed in public" claims.

**Design ambition:**
- The user rejected the first landing page as "too basic". They want something jaw-dropping, and they love the cinematic hanging-chain film.
- Keep honesty, accessibility and performance as the floor, never the ceiling.
- The Taste dials are DESIGN_VARIANCE 9, MOTION_INTENSITY 9 and VISUAL_DENSITY 3.
- The design skills the user insisted on are:
  - `.claude/skills/design-taste-frontend/` (verbatim copy of Leonxlnx/taste-skill@ce26fc2);
  - `.claude/skills/emil-design-eng/` (verbatim copy of emilkowalski/skills@e8a175d);
  - Impeccable 4.5.0 (see below).

  Don't reformat the vendored `SKILL.md` files.

**Impeccable in the cloud.** The Impeccable plugin does not load in cloud sessions. Its files are at `/opt/impeccable/plugin/` (github.com/pbakaus/impeccable, tag `skill-v4.5.0`):
- The skill: `skills/impeccable/SKILL.md`, and `reference/craft-floor.md`, which builders re-read before every UI edit.
- The launcher: `skills/impeccable/scripts/impeccable`, for `context` and `detect`. If it cannot find its engine binary, run `npx -y impeccable` with the same arguments.
- The agent definitions: `agents/impeccable-finish-reviewer.md` and `agents/impeccable-documenter.md`. Give their instructions to general workflow agents for the review and the documentation steps.

The site's `site/.impeccable/config.json` has one disclosed ignore: `bounce-easing` for `var(--k-spring)`, the film's damped-spring captions.

## Where things stand

### Milestone 5: architectural inference

The spec is `m5-plan.md`: about 2,500 lines, with decisions D-01 to D-74 and units U1 to U5. It implements the research in `designs/inference.md`; the prototypes are in `m5/`, `probe/` and `probe2/`.
- **Done**:
  - U1 PR1 and U1 PR2 (foundations);
  - U2 (components, roles, layers);
  - U3 (clustering, P1 to P6);
  - U4 unit-level work;
  - U5 engine work;
  - U4 integration.

  Their reports are in `reports/m5/`.
- **Partial**: the U5 integration (`infer.ts`, fixtures, goldens, IR docs and schemas, the docs, and `m5-site-followups.md`). It is committed in `57bfb4d`.
- **The workflow `m5-continue.js` runs**:
  - the U5 integration, with a resume note;
  - the verification: `pnpm check`, a CodeVerse run with workers and with concurrency 1 (the documents must be byte-identical), and plan conformance.
- **After it**:
  - Run an adversarial review workflow over the whole milestone (`git diff 29e5878 -- packages docs tests`), then fix the confirmed findings.
  - Get `pnpm check` green.
  - Commit "Milestone 5: architectural inference".
  - Write the milestone 5 report in the format above.
  - Apply `handoff/m5-site-followups.md` to the site, unless the promotion's switch step already did. "Infer" becomes "Available today" only if it really is.
  - Benchmarks measured here are this machine's: say so next to the Windows figures in the plan.

### The landing page: promoting the cinematic film to the main page

The spec is `lab/promotion-plan.md`, about 1,150 lines. It has the builders B1 to B5 in section 4, the gates in section 4.1, the review plan in section 6, and the user's confirmed decisions at the end:
- The hero's "Explore Katedrala" plays the film.
- Act III runs on the real structure with computed counts. The whole act is marked Planned for v1, with a scope line.
- The abandoned physical and drawing prototypes are deleted. Git history keeps them at `57bfb4d`.

Progress:
- **Done**:
  - the baseline (gate GB);
  - B2, the evidence generator and trace;
  - B3, the plate kit and shell (gate G2);
  - B5, the plates content.

  Their reports are in `reports/promotion/`.
- **Partial**: B1 (the film engine, up to gate G1) and B4 (the demonstration plates). Both are committed in `57bfb4d`, and their scripts are in `shots/B1/` and `shots/B4/`.
- **The workflow `promotion-continue.js` runs**:
  - the rest of round 1 (B1, B4);
  - round 2 (all five builders);
  - the switch (B3: gates G5 and GM, the new `site/app/page.tsx`, deleting the replaced sections and the lab);
  - the cleanup (B4);
  - the integration (gate GI: tsc, `pnpm build`, the capture set, axe, the detector, performance marks).
- **After it**:
  1. Run the review workflow of plan section 6: the Impeccable finish review against the direction contract `site/.impeccable/surfaces/app-page-tsx.md`, a creative judge, honesty and claims, accessibility, and performance. Verify findings adversarially, and run fix rounds until clean.
  2. Run the Impeccable documenter to write the site's `DESIGN.md`.
  3. Run a last integration pass, then commit the site.
  4. Before launch, the user runs `site/scripts/check-links.mjs`, which needs the repository public with the milestones on `main`.

**No GPU here.** WebGL renders in software (SwiftShader).
- Appearance and behaviour can be judged.
- Frame times and the other GPU-bound budgets of plan section 5 cannot. Report them as measured under SwiftShader, and list them for the user to re-measure locally.
- The reference captures (`lab/cinematic/final/` and `lab/promotion/baseline/`) were made with Edge on a GPU, so compare composition and content with them, not pixels.

## What is in this folder

| Path | What it is |
| --- | --- |
| `setup.sh` | Machine setup for the cloud session (above) |
| `workflows/m5-continue.js`, `workflows/promotion-continue.js` | The two continuation workflows |
| `workflows/original/` | The local run's scripts, unchanged |
| `reports/m5/`, `reports/promotion/` | Final reports of every agent that finished before the handoff |
| `m5-plan.md`, `designs/` | The milestone 5 plan, and the research designs for inference and metrics |
| `m5/`, `probe/`, `probe2/` | The Python prototypes and the linker-graph replay probes. The papers in `m5/refs/` were left out for copyright; `m5/refs.md` cites them |
| `lab/promotion-plan.md`, `lab/director2/` | The director's plan for the landing page, and the research it cites |
| `lab/cinematic/final/` | 70 parity captures of the finished film (the visual reference) |
| `lab/promotion/baseline/` | Gate GB: the page before the promotion (text, aria snapshots, controls, captures, source hashes) |
| `landing-brief.md` | The user's verbatim brief for the landing page |
| `fix-workflow.js` | Its `DECISIONS` constant holds the design decisions D1 to D9 that the builders follow |
| `review-paired.md`, `finish-review-1.md`, `fix-pass-results.md`, `fix-reports.md` | The earlier site review (101 verified findings) and the fix pass that resolved them |
| `shots/` | The Playwright harness (`capture.mjs` stitches full pages past Chromium's 16,384 px limit; also `review`, `axe`, `perf`, `pixdiff`, `crop`, `lab-cinematic/scrub.mjs`), and the builders' scripts in `shots/B1/` to `shots/B5/` |
| `data/codeverse-structure-2.json` | The stored CodeVerse architecture document that `site/scripts/build-codeverse-evidence.mjs` and `build-codeverse-graph.mjs` take as their argument |

**Old paths.** The plans and reports still use the Windows paths. Map them as follows:

| Windows path | Here |
| --- | --- |
| `C:/Users/Awab/Desktop/PROJECTS/Katedrala` | the checkout (also `/katedrala`) |
| `C:/Users/Awab/AppData/Local/Temp/claude/.../scratchpad`, or "the scratchpad" | `handoff/` |
| `C:/Users/Awab/Desktop/PROJECTS/CodeVerse` | `/codeverse` |
| `%TEMP%/codeverse-structure-2.json` | `handoff/data/codeverse-structure-2.json` |
| `C:/Users/Awab/.claude/plugins/cache/impeccable/impeccable/4.5.0/skills/impeccable` | `/opt/impeccable/plugin/skills/impeccable` |

## Handing the work back

1. Commit on this branch and push it.
2. Then give the user a short summary:
   - what is finished;
   - the test, lint and typecheck results;
   - the milestone 5 report;
   - what to check on their own machine: the GPU-bound performance budgets, and a look at the film in a real browser.
3. The user pulls the branch locally to review it. Removing `handoff/` and `.claude/` and merging to `main` is their call.
