================= resolver-engine 8326
## Module resolution, project setup and engine: fix report

Nine of the eleven findings are fixed and each has a passing regression test. Finding 7 is fixed, but the IR doc wording still needs a contract change. Finding 9 belongs to core and core has already fixed it. Almost all of the fixes came from the earlier interrupted runs. In this session I confirmed them, tightened three tests and corrected two doc comments.

To check that the tests are real, I reverted each fix in a scratch copy of the code. Every regression test failed when its fix was removed. All of the review's reproduction scripts, run against the sources, now give the expected results. The only exception is the original E3 script: it now crashes because nothing is written to `../outside-cache` any more, which is the fix working. E3b shows the fixed behaviour.

### Findings
1. **Built-in check runs before paths/baseUrl — FIXED.** `nodeBuiltinOf` now matches only exact built-in names plus the subpaths Node really has (`fs/promises`, `path/posix`, …). The resolver now tries `paths`, then `baseUrl`, then built-ins, then workspace packages. `node:` is always a built-in.
   - **Deviation:** workspace packages still come *after* built-ins. Package lookup by name covers every `package.json` in the snapshot, so a test fixture named `path` would otherwise capture every `import "path"`. Node itself does the same. This is documented in `resolver.ts` and pinned by a new test.
   - **Tests:** `builtins.test.ts` (subpaths that are not built-ins), plus resolver tests "consults paths and baseUrl before…", "treats subpaths that Node.js does not expose…" and "keeps bare built-in names ahead of manifests…" (new).
2. **Bundler outputs never mapped back to .ts — FIXED.** In `output-mapping.ts`, `.mjs`/`.cjs` now map to any TS/JS source after the tsc counterparts, and `.d.mts`/`.d.cts` map to `.ts`/`.tsx`. Tests: output-mapping "maps bundler outputs…" and resolver "maps bundler outputs of exports…". I extended the resolver test to also check the `module` entry point.
3. **Repository-controlled cache.dir — FIXED as decided.** `cache.dir` from the snapshot's own configuration is dropped with a `configuration-warning`, and `cache.enabled: false` is still honoured. Callers can use the new `AnalyzeOptions.cacheDirectory`. An explicit `configPath` may still set `cache.dir`, relative to the analysis root.
   - I rewrote the regression test to run the review's attack with no cache option from the caller, using a stubbed `KATEDRALA_CACHE_DIR`. It checks that nothing is written outside the root and that the forged entries are never read.
   - The `cache.enabled: false` / explicit-config test now tells root-relative and file-relative `cache.dir` apart.
4. **Subdirectory analysis ignores the tsconfig.json above the root — FIXED.** The `tsconfig.json` and `jsconfig.json` of each directory above a subdirectory root are now read. They are searched after the configurations inside the root, nearest first. A solution config above the root only has its references followed back into the root. Tests: 4 under "configurations above the analysis root". I also ran it end to end on a real git repository.
5. **"extends" naming a workspace package is ignored — FIXED.** A bare `extends` is now looked up among the snapshot's packages. The target inside the package is chosen the way TypeScript 6.0.3 does it; I checked this against TypeScript's own resolver. Tests: "follows targets in workspace packages…", "looks up targets inside a package…", "keeps ignoring bare targets…".
6. **paths into node_modules make real npm imports unresolved — FIXED.**
   - A `paths` target inside `node_modules` that names a workspace package is looked up in that package's directory.
   - Any other installed package becomes an external (`@types/x` is reported as `x`). The catch-all `*` pattern only falls back to it after the snapshot.
   - Tests: "treats paths into node_modules as the installed packages", "tries the snapshot before node_modules…", plus `specifiers.test.ts`.
7. **Equal digests while documents differ — FIXED in the analysis digest; the IR wording NEEDS CONTRACT CHANGE.** `outsideDocumentLines` is folded into `analysisDigest`, and a comment in `structure.ts` says so. It covers:
   - listed files that are not document files;
   - skipped links;
   - the content of project files read that the document doesn't carry;
   - every read above the root, including files that are absent.

   Tests: 2 in `identity.test.ts` and 4 under "snapshot digests".
8. **Explicit config path leaks into entryPoints[].source — FIXED.** A configuration that is not part of the snapshot is labelled `configuration#entry_points`. I corrected the `SnapshotConfiguration.path` doc to say it is never written into the document. Test: "names an explicit configuration file without its location".
9. **Case-insensitive read of files above the root — core's area, already fixed there.** `WorkingTreeSource.readAncestor` now checks the real path. E5 on win32 now gives the same result as the exact-case run.
10. **Extensionless specifiers prefer x.json — FIXED.** `.json` is never appended implicitly. The one exception is `require()` in JavaScript files, which, like Node's CommonJS loader, tries `.json` after code extensions and before the directory (the review's suggested condition). Tests: 2 in `probing.test.ts`, plus resolver "prefers a directory's index module…" and "probes extensions in order".
11. **mergeEntryPoints drops entries differing only in package — FIXED.** Entry points are now sorted and de-duplicated with the full comparator: entity, kind, source, package, then mappedFrom. Test: "keeps entry points that differ only in their package".

### Contract changes needed
For `SnapshotInfo` in `packages/ir/src/types/structure.ts` and the "Digests" section of `docs/IR.md`:
- **analysisDigest:** "…the effective configuration and options, the versions of Katedrala, its adapters and plugins, and what the analysis saw outside the document's files: paths of listed files that are not document files, skipped links, and the content (or absence) of project configuration files read outside the document's files (excluded by `include`/`exclude`, or above the analysis root). Documents with equal content and analysis digests are identical."
- **projectConfigurationDigest:** replace "already part of the content" with "including files above the analysis root; configuration outside the document's files is also covered by `analysisDigest`".

### Notes for other owners
- **Core:** the `CacheConfiguration.dir` doc in `config/schema.ts` and `settings.ts` should say it is honoured only from an explicit configuration file, and is ignored with a warning in the snapshot's own configuration.
- **fixtures/README.md:** "Resolution semantics" item 1 could mention the `require()` / `.json` exception for JavaScript files.

### Files changed (all attempts)
`packages/adapter-typescript/src/project/`: `builtins.ts`, `probing.ts`, `resolver.ts`, `specifiers.ts`, `output-mapping.ts`, `exports-field.ts`, `locations.ts`, `tsconfig.ts`, `config-set.ts`, `project.ts`, and the tests for builtins, probing, resolver, specifiers, output-mapping, exports-field, locations and tsconfig.

`packages/engine/src/`: `structure.ts`, `identity.ts`, `configuration.ts` (doc comment only), `structure.test.ts`, `identity.test.ts`.

### Verification
- **Type checks:** `tsc -p` for adapter-typescript and engine both pass with 0 errors.
- **My packages and fixtures:** `vitest run packages/adapter-typescript/src/project packages/engine tests/fixtures`: 20 files, 521 passed, 76 todo.
- **Whole adapter-typescript package:** the only failures are the 3 tests listed in the brief, in `extract/facts.test.ts` and `extract/references.test.ts`. They belong to the extractor area, not mine.
- **Lint and formatting:** eslint and prettier are clean on all my files.
- **Concurrent edits:** one run failed transiently while other engineers were editing core, linker and extractor files. It passed again on a clean rerun.

Reproduction scripts and the mutation-check setups are in `C:/Users/Awab/AppData/Local/Temp/claude/c--Users-Awab-Desktop-PROJECTS-Katedrala/f7609e3b-1ca5-4e98-a818-ae87ef209574/scratchpad/fixes/resolver-engine/` (`all.repro.mjs`, `final.txt`, `mut/`, `mutengine/`).
================= linker 9818
# Linker area: fix report

All 11 linker findings are fixed in the linker and each has a passing regression test. I also mutation-checked every test: reverting its fix makes it fail. For finding 7 the linker part is done, but the end-to-end result still needs a TypeScript adapter change that no area currently owns. Finding 8 is fixed in the linker, but the IR needs a contract change to record it properly. While verifying, I found and fixed two related star-export bugs (A and B below).

The one failing linker test was a stale expectation in `references.test.ts`. A named import from an unparsed file keeps the imported name in its path, as externals and `items.map` in the same test already do, so `getUser` became `api.getUser`.

## Findings

1. **CommonJS object-literal export assignment binds to nothing** — FIXED (critical). An `=` export that binds nothing now falls back to the module namespace. This covers `require()`, `import x = require()`, default imports and inline `require()`. Named imports from `=` modules look up named exports first, then members of the assigned value.
   - Test: `exports.test.ts` "binds every import of an object-literal export assignment to the module namespace".
   - e2e 01b and 07: all 7 calls bind, 0 unresolved.
   - The review's synthetic `01-cjs-object.mjs` still shows 1 unresolved. That is a flaw in the script: its fake resolver never tries `.js` for `./lib`.
2. **Inline `require("./x").member` ignores the export assignment** — FIXED. Inline module references now start from the module's value, the same as the bound form. Members of an assigned value look up the module's other named exports first.
   - Tests: "binds inline requires to the export assignment, like bound requires" and "looks up members of an assigned value among the module's named exports first".
   - e2e 20, 20b, 20c: the inline and bound forms give the same targets.
3. **Type-only imports satisfied by `@types/*` flagged undeclared** — FIXED. Each external usage now records whether it is type-only. A package whose imports of P are all type-only is satisfied by a declared `@types/P` (or `@types/scope__name` for `@scope/name`), npm only, in its own manifest or its workspace root's.
   - Test: `packages.test.ts` "accepts a declared @types package for packages imported only for types". It covers a scoped package, and a value import of `pg` that `@types/pg` does not satisfy.
   - e2e 06: `aws-lambda` is `declared: true`.
4. **Two external `export *` make names ambiguous** — FIXED. A name that only external star modules can provide now binds to each of them (as `alternatives`) with confidence 1/n. AMBIGUOUS is kept for conflicts between modules known to provide the name.
   - Test: "binds a name only several external star modules can provide to each of them, splitting the confidence".
   - e2e 24b: both Radix packages at 0.5, 0 unresolved.
5. **Duplicate diagnostics for failed and oversized files** — FIXED, as suggested. The linker emits only `syntax-error`; core owns `read-failed`, `parse-failed` and `file-too-large`.
   - Test: `structure.test.ts` "leaves read, parse and size problems to the extraction stage that reported them".
   - Repros 18, 19, 19b: one diagnostic per problem, none mislabelled.
6. **File ownership ignores the ecosystem in shared directories** — FIXED, as suggested. In the nearest manifest directory the owner is: the package whose manifest is the file, then the package reported by the file's adapter, then the smallest id.
   - Test: "prefers the package reported by the file's adapter among manifests of one directory".
   - Repro 10: matches the expected owners.
7. **Non-exported namespace members reported as exported** — FIXED in the linker; end-to-end needs an adapter change. A namespace member now inherits the namespace's flag only if the adapter does not say `exported: false`.
   - Test: "exports a namespace member only if its namespace is exported and the adapter does not deny it".
   - e2e 04 still shows `Util.hidden exported=true`, because the TypeScript adapter never sets `exported` on namespace members. Fixing that belongs to the extractor area (`declarations.ts`), and none of its findings covers it.
8. **Imports of excluded files counted as unresolved** — FIXED. The linker can tell these files exist. The engine gives every snapshot entry to `prepareProjects`, and the resolver contract says resolved paths must match the snapshot's file list. So a resolved path missing from the linker input is an excluded file.
   - Such imports get a new internal `excluded` status. They are not counted in `unresolvedImports`, and references through them count as neither unresolved nor untyped.
   - They get an `unresolved-import` diagnostic at severity `info`.
   - The import entry still says `unresolved`, with the reason "resolved to files excluded from the analysis: …", because the IR has no better status (see contract change 1).
   - Tests: `imports.test.ts` "does not count imports of files excluded from the analysis as unresolved" and `references.test.ts` "does not count references through files excluded from the analysis".
   - e2e 11: 0 unresolved imports, 0 unresolved references.
9. **Star-export resolution is quadratic** — FIXED. Each file now has a memoized index of which `export *` modules can provide which names, so a lookup searches only those. Results do not change.
   - Test: "resolves names through a large export * barrel in linear time". It takes about 0.25 s, against 14.2 s with the index disabled.
   - Repro 12: 44, 53, 79 and 162 ms for N = 500 to 4000.
10. **Member paths into opaque modules dropped** — FIXED. Walking into a file with no extraction keeps the remaining path in `detail`. Invoking something read from a data file (JSON, CSS, assets) is now `uses`; code that was not parsed stays `calls`.
    - Test: "binds imports of files without an extraction to the file, keeping the member path".
    - e2e 25: `uses f -> data.json` with detail `items.map`.
11. **`namespace-member` resolution never recorded** — FIXED. Members found in a module's exports, and children of namespace declarations, are now recorded as `namespace-member`. They stay `re-export-chain` when the lookup went through a barrel.
    - Tests: "records member accesses on namespace imports and namespace declarations as namespace-member" and "counts a member a namespace does not export as unresolved".
    - Repro 16: both calls are `namespace-member`.

## Additional fixes, found while verifying 4, 8 and 10

- **A. `export *` from code that was not analyzed.** Barrels over skipped files counted every name as unresolved, while a direct import of the same file bound. Example: `export * from './generated/graphql'`, where core skips the generated file.
  - Such modules are now open candidates. If one is the only candidate, the name binds to it the same way a direct import does.
  - Otherwise the name is not counted as unresolved.
  - A package-level module containing a skipped file is handled the same way.
  - Three new tests in `exports.test.ts`.
- **B. A guess from a nested barrel blocked the real provider.** In an enclosing barrel, a nested barrel's guess (an external or skipped star) was treated as a known binding. A name that another star module really provides then became ambiguous and was counted as unresolved. The single-external-star version of this predates the task.
  - Guessed bindings are now marked `open`. Known providers win over them, and several guesses share the confidence (1/n).
  - An external star next to an excluded or skipped star now gets that 1/n share instead of full confidence.
  - Test: "prefers modules known to provide a name over guesses of enclosed star exports".

## Contract changes needed (not made)

1. IR `ImportResolution`: add `{ status: "excluded"; paths: string[]; method }` and say in the `unresolvedImports` / `unresolvedReferences` docs that these are not counted. A dedicated diagnostic code could replace `unresolved-import` at `info`.
2. plugin-api `ExtractedSymbol.exported`: clarify that ECMAScript/TypeScript adapters state it for namespace members (the inner `export`), and that the linker combines it with the namespace's own visibility. The TypeScript adapter can then set `exported: false` for non-exported members, which finishes finding 7.
3. IR `ExternalEntity.declared`: say that a type-only use of an npm package counts as declared when its `@types` package is declared.

## Files

I own all of these, in `C:/Users/Awab/Desktop/PROJECTS/Katedrala/packages/linker/src/`:
- **Source:** `binder.ts`, `link.ts`, `imports.ts`, `modules.ts`, `model.ts`, `packages.ts`, `references.ts`, `symbols.ts`, `types.ts`
- **Tests:** `exports.test.ts`, `imports.test.ts`, `packages.test.ts`, `references.test.ts`, `structure.test.ts`

This session changed `binder.ts`, `references.ts`, `exports.test.ts` and `references.test.ts`; `link.ts` was only reformatted by prettier. The rest was already in place from the interrupted runs.

Throwaway scripts are in `C:/Users/Awab/AppData/Local/Temp/claude/c--Users-Awab-Desktop-PROJECTS-Katedrala/f7609e3b-1ca5-4e98-a818-ae87ef209574/scratchpad/fixes/linker/` (`mutate.mjs`, `generated-barrel-e2e.mjs`, `nested-guess.mjs`).

## Verification

| Check | Result |
|---|---|
| `tsc -p packages/linker/tsconfig.json` | clean |
| `vitest run packages/linker` | 126 passed |
| `eslint packages/linker/src` | clean |
| `prettier --write` | applied; check clean |
| `vitest run tests/fixtures` | 140 passed, 76 todo |
| Full suite | 1623 passed, 3 failed |
| Review reproductions re-run | all as expected; the 40-shuffle determinism script gives one distinct output |

The 3 full-suite failures are all extractor-area tests in `adapter-typescript`: `facts.test.ts` and two in `references.test.ts`. None is in the linker.
================= core 8002
# Core area fixes (`packages/core/src`): report

All 9 findings in my area are fixed, each with a passing regression test. No contract changes are needed. The core suite (386 tests) and the end-to-end fixture suite are green, and every review reproduction now gives the expected result.

## Findings

**1. `revision()` runs `git status`, which runs repository-configured filter drivers (high): FIXED.** Earlier attempts did this; I verified it.
- `git status` and `git diff` are no longer used. `sources/dirty.ts` works out `dirty` without git reading any file content:
  - the index is compared with HEAD using `ls-files -s` and `ls-tree -r`;
  - each tracked file is hashed in-process as a git blob (SHA-1 or SHA-256) and compared with its index id, as-is and with CRLF turned into LF.
- `dirty` is omitted when only files under a `filter`, `ident` or `working-tree-encoding` attribute differ (Git LFS, for example), or when blobs are missing in a partial clone. The CRLF caveat is documented: line-ending-only changes are not "dirty".
- In `git.ts`, every git call also gets `--no-optional-locks`, `core.fsmonitor=false`, `core.virtualFilesystem=`, `log.showSignature=false`, `GIT_NO_LAZY_FETCH=1` and an empty `GIT_ALLOW_PROTOCOL`. I confirmed separately that each of the last two blocks an `ext::` transport program by itself.
- Tests: "runs no filter, textconv, fsmonitor, hook, pager or credential program of .git/config". It builds a temporary repository whose `.git/config` defines programs that write a marker file. It first proves plain `git status` writes the marker, then that no source call does. Also the partial-clone test and five dirty-state tests.

**2. Committed symlinks are listed and parsed when `core.symlinks=false` (medium): FIXED** (earlier attempt, verified). File kinds now come from the git mode (`ls-files -s`): mode 120000 is reported as skipped, and 160000 (submodules) is dropped, whatever the checkout wrote. Test: "skips a committed symbolic link however git checked it out".

**3. A root inside a directory its repository ignores yields an empty snapshot, silently (medium): FIXED** (earlier attempt, verified). `open()` runs `git check-ignore -q .`. If the root is ignored, it falls back to the `.gitignore`-aware walk, without revision metadata, and logs a warning. Test: "walks a root that its repository ignores, and says so".

**4. Generated-code detection skips hand-written files that only mention a marker phrase (medium): FIXED.**
- `extraction/generated.ts` is rewritten. It now looks only at the comments a file starts with, within the first 10 lines; a shebang, `<?php` or `"use strict"` line may come first. Text in strings, and comments after the first line of code, no longer count.
- A file counts as generated when a header comment has one of:
  - the `@generated` token, not in quotes or backticks;
  - a `<auto-generated>` tag;
  - a statement that the file is generated ("Code generated by…", "Generated by…", "This file was auto-generated…"), with a "do not edit" instruction in the same comment block.
- **Behavior change, as the review asked:** a bare "auto-generated" or "do not edit" no longer marks a file. Two existing test expectations changed because of this.
- I checked the rules against 30 real generator banners (Go, protobuf, Dart, Prisma, Android, openapi-typescript, orval and others) and 20 hand-written near-misses; all classify correctly.
- New export `generatedMarkerLine()`; the unused `GENERATED_MARKERS` export is removed.
- Instead of a new diagnostic (no IR diagnostic code fits), extraction logs one `info` entry listing these files with their marker line. Each such file is already recorded in the document as skipped, reason "generated".
- Tests: a 36-case table, plus the review's files in an extraction test.

**5. After worker restarts run out, innocent batch-mates of a crashing file fail, depending on worker count (medium): FIXED.** I followed the review's "reserve a restart budget" option.
- A file now fails only when its worker dies while it runs alone; files that only shared a batch with it are retried alone.
- Each file that crashes a worker alone earns two extra restarts. Several crashing files therefore never use up the budget.
- If no batch has completed yet, a crash is not blamed on the file straight away. If every file tried so far crashes (a broken environment), the pool gives up after at most 8 such crashes. It then sends everything not yet finished, batch-mates included, to the main thread.
- Stress runs with spread, clustered and 50 random crashing files at 2–8 workers: exactly the crashing files fail, with the same result for every worker count.
- Two new tests. I confirmed both fail against the old pool.

**6. Globs like `./`, `/` or `!` pass validation, then crash discovery with a bare TypeError (low): FIXED.**
- Configuration validation now reports these as errors with the key path and line, for example `include.0: "./" names the analysis root itself; write "**" to match every file (line 1)`. I chose an error over silently treating `./` as `**`; the review accepted either.
- **Also rejected now:** patterns starting with `/`, which can never match, and patterns picomatch cannot compile (`a{`, a trailing `\`), which used to silently match nothing.
- `createPathMatcher` throws a clear TypeError for the same patterns.
- Tests in `config.test.ts` and `discovery.test.ts`.

**7. `readAncestor`'s `.git` / `node_modules` / `.katedrala` exclusion is case-sensitive (low): FIXED** (earlier attempt, verified). Segments are compared case-insensitively. The test covers `.GIT/config`, `Node_Modules/…` and other variants.

**8. `readAncestor` serves ignored, unlisted files inside the analysis root (low): FIXED.** Paths inside the root are rejected by both the working-tree source and the in-memory source. I added the in-memory test and a check that a sibling folder whose name starts with the root's name is still served.

**9. Files above the root are read case-insensitively on Windows/macOS (resolver review): FIXED** (earlier attempt, verified).
- The path must be listed by git at the top level under exactly that spelling: tracked as a regular file, or untracked and not ignored. Its real path must also be exactly that path. This rules out case variants, links, junctions and short names, and it no longer serves ignored files above the root.
- Test: `TSConfig.Base.json` and `Packages/…` return undefined.
- End to end on win32, the review's E5 case now matches the exact-case result: the import goes to `ext:npm:@api/x`, with the "not found" diagnostic.

## Files changed (`packages/core/src`)
- **This session:** `discovery/globs.ts`, `discovery/discover.ts` (doc only), `discovery/discovery.test.ts`, `config/schema.ts`, `config/config.test.ts`, `extraction/generated.ts`, `extraction/extract.ts`, `extraction/extract.test.ts`, `extraction/pool.ts`, `extraction/scheduler.ts`, `index.ts`, `sources/in-memory.test.ts`, `sources/working-tree.test.ts` (also quieted git's CRLF warnings in test output).
- **Earlier attempts, verified and reformatted:** `sources/working-tree.ts`, `sources/git.ts`, `sources/dirty.ts`, `sources/errors.ts`, `sources/files.ts`, `sources/in-memory.ts`.

## Verification
- `tsc -p packages/core/tsconfig.json`: passes. I also type-checked engine, which uses core's sources: passes.
- `vitest run packages/core`: 386 tests passed.
- `vitest run tests/fixtures`: 140 passed, 76 todo.
- `eslint packages/core/src`: clean. `prettier --write packages/core/src`: applied, and the check is clean.
- I also ran the engine, linker and adapter-typescript suites without changing anything there: 749 passed, 1 failed. The failure is `facts.test.ts > records destructured environment variables`, one of the known mid-fix failures in the extractor area, owned by another engineer.

Throwaway scripts are in `C:/Users/Awab/AppData/Local/Temp/claude/c--Users-Awab-Desktop-PROJECTS-Katedrala/f7609e3b-1ca5-4e98-a818-ae87ef209574/scratchpad/fixes/core/`.
================= graph-model 7268
## Graph/model area: fix report

All 5 findings are fixed, each with a regression test next to the code. Every regression scenario passes on the fixed sources and fails or times out on the original build, which I checked by replaying the same assertions against the old `dist`.

### 1. Bounded `elementaryCycles` takes exponential time (high): FIXED
The code fix in `cycles.ts` came from the earlier attempt. I proved it correct, checked it exhaustively, tightened its documentation and added the regression tests.
- **Lock fix (as the review suggested):** a node entered at depth d is locked at d. Without a reported cycle, locks only go down, so a node is entered at most L−1 times per start, each time at a smaller depth. A start with no cycles costs O(L·(n+m)); each reported cycle adds O(L²·(n+m)).
- **Where it differs from the paper:** I read Gupta & Suzumura (arXiv:2105.10094). Their exact rule (lock = L − blen + 1 for the shortest way back found) misses cycles. The proof of their Lemma 2 assumes that way back was actually explored, but a node on the stack can block it.
  - Counterexample: the 8-node graph in the new test loses the cycle [0,6,7,2,1].
  - The review saw the same thing: adding the +1 changed results in 177/20,000 tests. On the review's generator, the paper's rule gives 60 mismatches in 10,000 runs.
- **What the code does instead:** a node with a cycle below it is fully unlocked, and nodes reaching it in j B-list steps get lock L − j. That is what the original code did by accident (its distance was never incremented). Relaxation is now breadth-first, so each relaxation raises a lock at most once, which the bound needs. The invariant that guarantees no cycle is missed is written in the doc comment.
- **Extra speed-ups from the earlier attempt, kept:** B-lists are stored in a pre-allocated pool instead of Sets, and re-splitting into components waits longer when a split keeps most nodes together. The 200k-node/1M-edge graph with L=4 now takes 2.2 s instead of 23.8 s; the delayed re-split alone is 1.5–2.7× faster on the graphs I measured.
- **Exactness checks (scratch scripts):** results match brute force, including truncated prefixes, on all 65,536 four-node digraphs (with self-loops) and all 1,048,576 five-node digraphs without self-loops, at every L. They also match on 26,000 random graphs and multigraphs.
- **Speed:** a ladder graph with 2^40 paths and a 960-node layered graph finish in milliseconds. The original took 2.7 s at 24 rungs, doubling per rung, and 57 s on the layered graph; both exceed the 30 s test timeout.
- **Tests added** (`cycles.test.ts`, new describe "elementaryCycles with a length bound"):
  - 40-rung ladder: no cycles at L=42 and L=45; the first 1,000 cycles at L=46 match a formula exactly, in lexicographic order.
  - The review's layered graph: no cycles at L=18; the first 300 cycles at L=25 match a pruned brute force.
  - The counterexample graph.
  - Brute-force property tests on graphs and multigraphs of up to 14 nodes, dense graphs, and truncated prefixes.

### 2. `fromPairs` and `inducedSubgraph` accept invalid node ids (medium): FIXED
- `fromPairs` now passes plain arrays to `fromEdges`, so undefined, null, NaN, 1.5 and 2^32+1 are rejected with the same `GraphError` messages instead of being turned into valid node numbers.
- `inducedSubgraph` checks every entry before converting it.
- Tests added in `digraph.test.ts`.

### 3. `betweennessCentrality` returns NaN when path counts overflow (low): FIXED
- If any shortest-path count from a source exceeds 2^1000, that source is recomputed with logarithms of the counts, so ratios stay ≤ 1 and finite.
- Other sources run the same code as before, so results on normal graphs are unchanged bit for bit.
- Results now match the exact values on the review's graphs (worst relative error about 2.5e-12), with no NaN.
- Test added: layered graphs of width 2 and 3, with parallel edges and self-loops, plus the sampled variant.

### 4. `inducedSubgraph` merges parallel edges (low): FIXED
- The subgraph is now built without merging, so it copies the source graph's edges unchanged; the induced subgraph on all nodes equals the graph.
- Tests added, including a property test.

### 5. `fromProjectionInfo` drops externals from package dependencies (low): FIXED
- In `aggregateDependencies`, `includeExternals` now defaults to true at the `package` level and false elsewhere; an explicit value still wins. Package lists computed with `fromProjectionInfo(metrics.projection)` therefore include externals, as `PackageEntity.dependencies` requires. Both functions' docs explain this.
- New test reproduces the review's case (`model_ext.mjs`).
- Two existing tests in `aggregate.test.ts` changed their expectations because package results now include externals: the package keys, and looking up the web→api dependency by entity instead of by index.

### Contract changes needed
None. Optionally, the paragraph in `docs/IR.md` that says aggregated dependencies "lift every relationship between member files" could add that package dependencies also include externals, to match the `PackageEntity` doc. I did not edit it because it is outside my files.

### Other changes and notes
- `clustering.ts`: comment-only fix for the louvain mismatch the review noted but did not report (with zero total weight, the warm start still goes through the connected-component split).
- Not changed: the `Digraph` accessors (`successors`, `predecessors`, degrees) do not validate ids. `successors(nodeCount + 1)` or `successors(1.5)` returns the whole target array. Worth a follow-up.

### Files changed
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/packages/graph/src/cycles.ts
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/packages/graph/src/cycles.test.ts
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/packages/graph/src/digraph.ts
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/packages/graph/src/digraph.test.ts
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/packages/graph/src/centrality.ts
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/packages/graph/src/centrality.test.ts
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/packages/graph/src/clustering.ts (comment only)
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/packages/model/src/aggregate.ts
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/packages/model/src/aggregate.test.ts
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/packages/model/src/spec.ts (doc only)

### Verification
| Check | Result |
|---|---|
| `tsc -p packages/graph/tsconfig.json`, `tsc -p packages/model/tsconfig.json` | exit 0 |
| `vitest run packages/graph` | 157 passed |
| `vitest run packages/model` | 102 passed |
| `vitest run tests/fixtures` | 140 passed, 76 todo |
| eslint on changed files | clean |
| prettier on changed files | applied |
| Changed test files run 5 times | no flakes |

A full `vitest run` has one failure, in another area: `packages/adapter-typescript/src/extract/robustness.test.ts`, "extracts long operator chains of names in time linear in their length" (313 s).

Scratch scripts are in C:/Users/Awab/AppData/Local/Temp/claude/c--Users-Awab-Desktop-PROJECTS-Katedrala/f7609e3b-1ca5-4e98-a818-ae87ef209574/scratchpad/fixes/graph-model/ (`old_vs_new.mjs`, `exhaustive.mjs`, `bc_check.mjs`, `patience_cmp.mjs`, `review-new/`).
