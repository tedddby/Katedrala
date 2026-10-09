# B2 generator and trace

The final report of the "B2 generator and trace" agent, saved from the local run before the cloud handoff (2026-10-09).
The continuation workflow passes this text on exactly as the original run would have.

# B2 report, round 1: plan 4.3 items 1 and 2 (generator and trace.ts)

Both items are done and every generator acceptance check passes. While resuming I found a real gap in the earlier generator: an older analysis of the same commit passed all its checks and wrote different numbers (14,232 relationships instead of 14,233). It now refuses that document and leaves the output untouched.

The earlier, interrupted attempt had already written the generator and its output, but not trace.ts. I kept the generator, fixed it, and wrote trace.ts.

## Item 1: the generator
**What changed and why:**
- **Statistics trimmed.** The output now carries only the six counts the film quotes, values copied from the document: analyzedFiles 594, symbols 3,766, edges 14,233, unresolvedImports 0, unresolvedReferences 155, untypedReferences 2,055. The plan asks for "the needed repository.stats". The full block also had `packages: 1` (CodeVerse's own workspace packages), which a later reader could confuse with lib/site.ts's `packages: 39` (npm packages).
- **Bound to lib/site.ts.** The older document `%TEMP%/codeverse-structure.json` has the same commit, generator and schema strings as the stored one, but different counts (calls 4,860, uses 3,464, untyped references 2,265). The generator now refuses to write unless:
  - the document's counts equal `CODEVERSE_ANALYSIS` (files, analyzed files, symbols, relationships, externals, directories, unresolved imports, repository, commit);
  - the document records REAL_EDGE exactly as lib/site.ts prints it, keys in the same order;
  - the graph JSON's chain between the two files carries exactly these 7 observations.
- **Kind counts must add up.** The edge-kind counts must sum to the relationship count.

**Acceptance (plan 4.3):**

| Check | Result | Evidence |
|---|---|---|
| Two runs give identical bytes | PASS | sha256 f9b7a37459e4a65f on both runs, also when run from the repository root and from C:/ |
| REAL_EDGE deep-equals lib/site.ts | PASS | Node's deep-equality check, and the same key order; the generator itself now enforces this |
| Under 8 KB | PASS | 5,835 bytes raw, 1.10 KB gzip |
| Every value matches the document | PASS | 23 checks in check-evidence.mjs: the 3 relationships verbatim, the 5 symbol ranges, the seven observed lines 25 164 189 190 219 273 358, both files' lines, symbols and levels, Prettier clean |
| Guards refuse bad inputs | PASS | 9 cases in guards-evidence.mjs, on scratch copies of the inputs: each tampered input refused with its own message, real inputs give identical bytes; the older document gives exit 1 with nothing written |
| Dev server | PASS | Serves the file with HTTP 200, byte-identical |

## Item 2: site/components/stage/acts/trace.ts (new)
- **What it computes:** for any file, what it stands on (down) or what rests on it (up), step by step, with one shortest path from every file reached back to it. Three scopes, each adding to the one before: runtime dependencies between source files, then type-only ones, then tests.
- **Ties:** when two paths are equally short, the path runs through the file whose path sorts first. The tree is therefore the same whatever order the data lists its dependencies in.
- **Functions:** `traceGraph`, `trace`, `pathTo`, `within` (running counts), `traceMask`, `pathMask`, `reachOf`, `folderCounts`, `listing` (the 14 folder groups for the landing's file list), `fileOf`.
- **Numbering:** it uses the same numbering as the model (`buildModel`'s files and its 1,369 chains), so its masks light the drawing directly. Its masks match the shape the director already passes to the stage.
- **No imports.** It accepts the model's `GraphData` as is, so it compiles whatever state B1's move is in. A scratch type test proves this, and a negative control shows that test really catches errors.
- **Scope:** the header comment states that the page computes these traces itself and that they are not Katedrala's impact analysis (planned for v1).

**Acceptance: check-trace.mjs, 32 of 32 PASS**
- **Plan numbers:**
  - types.ts per step: 48, 78, 17, 4; running count 48, 126, 143, 147.
  - With type-only dependencies: 265. With tests: 409, which is 265 source plus 144 test files.
  - Crown path: page.tsx > landing-page.tsx > features.tsx > feature-mockups.tsx > types.ts.
  - The crown stands on 137 files, 1 directly, 40 of them foundations; this equals the model's own summary.
  - cn.ts: 88 / 63 / 90 / 113. registry.ts: 107 / 27 / 146 / 248.
- **Agrees with the model:** for all 404 files, reach, lit chains and foundations equal the model's own `loadPathOf` and the data's reach.
- **Correct paths:**
  - Distances match an independent breadth-first search over 3,522 traces.
  - Every parent is the path-first file one step closer.
  - Trees are identical after shuffling the dependency order (2,424 traces).
- **Masks and groups:** step-by-step masks and path masks are correct. There are 14 folder groups (src, then the 13 folders under src/) holding all 404 files once, in path order.
- **Bad input:** a file number outside the data throws an error.

**Measurements:**
- Size: 4.24 KB minified, 1.76 KB gzip, against the plan's 24 KB budget for director, acts and trace together (the director alone is 11.9 KB).
- Speed: building the graph takes about 4 ms. One trace takes 0.004 ms at the median and 0.021 ms at p95; a full readout (three traces) takes 0.016 ms.
- Checks: tsc over the whole site exits 0, and Prettier is clean on all three files.

**Not this round:** the acts, copy.ts and the accessibility and axe checks come next round, after G1. The numbers Act III and the landing need are already computed and verified above.

## Files changed
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/site/scripts/build-codeverse-evidence.mjs
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/site/public/data/codeverse-evidence.json (regenerated)
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/site/components/stage/acts/trace.ts (new)

The check scripts are in C:/Users/Awab/AppData/Local/Temp/claude/c--Users-Awab-Desktop-PROJECTS-Katedrala/f7609e3b-1ca5-4e98-a818-ae87ef209574/scratchpad/shots/B2/: check-evidence.mjs, guards-evidence.mjs, check-trace.mjs, measure-size.mjs and typecheck/.

## Items for other owners
- **B1:**
  - When model.ts moves to stage/, keep its numbering (source files and runtime chains in the data's order); check-trace.mjs switches to stage/model.ts automatically and re-verifies.
  - `loadPathOf` and trace.ts agree for every file, so hover tracing and the landing's traces will never disagree.
  - The leftover "the film's hero lede says code" is yours: plan 1.4 item 1 still quotes "the architecture of TypeScript and JavaScript", and the leftover overrides it.
- **B3:**
  - site/README.md should document the generator: run `node scripts/build-codeverse-evidence.mjs %TEMP%/codeverse-structure-2.json` after build-codeverse-graph.mjs, from the same document.
  - In lib/site.ts, keep REAL_EDGE and CODEVERSE_ANALYSIS as plain `export const NAME = { ... } as const;` literals; the generator reads them as data and fails loudly on any mismatch.
  - Hinge plate fields:
    - Parse: `dependency.path`, `dependency.symbolCount` (4), and the name of the symbol the REAL_EDGE relationship targets (graphCacheKey).
    - Link: the relationship whose id is `realEdge`: kind calls, from createAnalysisService to graphCacheKey, `provenance[0].line` 219 in `dependent.path`.
- **B5:** if you take the optional analyze-transcript counts, `stats.unresolvedReferences` (155) and `stats.untypedReferences` (2,055) are in the evidence JSON, taken from the document.

A newer Impeccable (v4.5.1) is available. Update now? It runs `npx impeccable update`.
