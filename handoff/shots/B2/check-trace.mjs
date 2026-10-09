// Acceptance checks for site/components/stage/acts/trace.ts (plan 4.3, B2 item 2): the plan's numbers (appendix A,
// Act III, the landing readouts, the crown hold); numbering identical to the hanging model; agreement with the
// model's own loadPathOf for every file; distances against an independent breadth-first search; the canonical
// tie-break (parent = the path-first file one step closer); independence from the order the data lists
// dependencies in; masks, paths, the folder listing; timings. Runs trace.ts itself through Node's type stripping.
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const SITE = "/home/user/Katedrala/site";
const T = await import(pathToFileURL(`${SITE}/components/stage/acts/trace.ts`).href);
const modelPath = existsSync(`${SITE}/components/stage/model.ts`)
  ? `${SITE}/components/stage/model.ts`
  : `${SITE}/components/lab/cinematic/model.ts`;
const M = await import(pathToFileURL(modelPath).href);
const data = JSON.parse(readFileSync(`${SITE}/public/data/codeverse-graph.json`, "utf8"));

const results = [];
const check = (name, ok, detail = "") => results.push([ok ? "PASS" : "FAIL", name, detail]);
const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);

let t0 = performance.now();
const g = T.traceGraph(data);
const buildMs = performance.now() - t0;
const model = M.buildModel(data);
const P = (v) => g.paths[v];
const F = (path) => T.fileOf(g, path);

// 1. Numbering identical to the hanging model.
check("404 source files, 587 files, 1,369 chains", g.sources === 404 && g.files === 587 && g.chains === 1369, `${g.sources} / ${g.files} / ${g.chains}`);
check("source numbering equals the model's", eq(g.paths.slice(0, g.sources), model.paths));
check("chain numbering equals the model's (edgeA, edgeB)", eq([...g.chainA], [...model.edgeA]) && eq([...g.chainB], [...model.edgeB]));
check("91 foundations, equal to the model's", g.foundation.reduce((s, x) => s + x, 0) === 91 && eq([...g.foundation.slice(0, g.sources)], [...model.foundation]));
check("rank is path order", [...g.paths.keys()].every((v) => [...g.paths.keys()].filter((w) => g.paths[w] < g.paths[v]).length === g.rank[v]));

// 2. The plan's numbers.
const types = F("src/graph/model/types.ts");
const up = T.trace(g, types, "up", "runtime");
check("types.ts per step 48, 78, 17, 4", eq(up.layers.slice(1).map((l) => l.length), [48, 78, 17, 4]), up.layers.slice(1).map((l) => l.length).join(", "));
check("types.ts running count 48, 126, 143, 147", eq([1, 2, 3, 4].map((d) => T.within(up, d)), [48, 126, 143, 147]), [1, 2, 3, 4].map((d) => T.within(up, d)).join(", "));
const upTypes = T.trace(g, types, "up", "types");
const upTests = T.trace(g, types, "up", "tests");
check("types.ts with type-only: 265 source files", upTypes.count === 265 && upTypes.sourceCount === 265, `${upTypes.count}`);
check("types.ts with tests: 409 files", upTests.count === 409, `${upTests.count} (${upTests.sourceCount} source, ${upTests.count - upTests.sourceCount} test)`);
check("types.ts is a foundation of 471 lines", g.foundation[types] === 1 && data.files[data.files.findIndex((f) => f[0] === "src/graph/model/types.ts")][3] === 471);
const crown = F("src/app/page.tsx");
const crownPath = T.pathTo(up, crown).map(P);
check("crown path page.tsx > landing-page.tsx > features.tsx > feature-mockups.tsx > types.ts", eq(crownPath, ["src/app/page.tsx", "src/components/landing/landing-page.tsx", "src/components/landing/features.tsx", "src/components/landing/feature-mockups.tsx", "src/graph/model/types.ts"]), crownPath.join(" > "));
check("the crown is the model's crown, level 15", model.paths[model.crown] === "src/app/page.tsx" && model.level[model.crown] === 15);
const crownDown = T.reachOf(g, crown, "down");
check("crown stands on 137 files, 1 directly, 40 foundations", crownDown.runtime === 137 && crownDown.direct === 1 && crownDown.foundations === 40, JSON.stringify(crownDown));
const summary = M.summarize(model, data);
check("crown hold equals the model's summary", summary.crown.direct === crownDown.direct && summary.crown.supports === crownDown.runtime && summary.crown.foundations === crownDown.foundations);
const cn = T.reachOf(g, F("src/lib/utils/cn.ts"), "up");
check("cn.ts: 88 rest on it at runtime, 63 directly; 90 with type-only; 113 with tests", cn.runtime === 88 && cn.direct === 63 && cn.types === 90 && cn.tests === 113, JSON.stringify(cn));
const reg = T.reachOf(g, F("src/lib/languages/registry.ts"), "up");
check("registry.ts: 107 (27 directly), 146, 248", reg.runtime === 107 && reg.direct === 27 && reg.types === 146 && reg.tests === 248, JSON.stringify(reg));
check("fileOf an unlisted path is -1", F("src/nope.ts") === -1);

// 3. Agreement with the model's own load paths, for every source file.
let agree = 0;
const disagree = [];
for (let v = 0; v < g.sources; v++) {
  const lp = M.loadPathOf(model, v);
  const tu = T.trace(g, v, "up", "runtime");
  const td = T.trace(g, v, "down", "runtime");
  const reachedUp = [...Array(g.sources).keys()].map((w) => (tu.step[w] > 0 ? 1 : 0));
  const reachedDown = [...Array(g.sources).keys()].map((w) => (td.step[w] > 0 ? 1 : 0));
  const mu = T.traceMask(tu);
  const md = T.traceMask(td);
  const ok =
    eq(reachedUp, [...lp.carriedBy]) &&
    eq(reachedDown, [...lp.supports]) &&
    eq([...mu.edges], [...lp.above]) &&
    eq([...md.edges], [...lp.below]) &&
    td.foundationCount === lp.foundationCount &&
    tu.count === lp.carriedCount &&
    td.count === lp.supportCount &&
    tu.count === model.reach[v];
  if (ok) agree++;
  else disagree.push(P(v));
}
check("reach, lit chains and foundations equal loadPathOf (and the data's reach) for all 404 files", agree === g.sources, disagree.slice(0, 3).join(", "));

// 4 and 5. Distances against an independent BFS; the canonical parent, for every file, direction and scope.
const inScope = (e, scope) => scope === "tests" || (scope === "types" ? data.files[e[0]][2] === 0 && data.files[e[1]][2] === 0 : e[3] === 1 && data.files[e[0]][2] === 0 && data.files[e[1]][2] === 0);
const dataIndex = new Map(data.files.map((f, i) => [f[0], i]));
const toTrace = (i) => F(data.files[i][0]);
const adjacency = {};
for (const scope of T.TRACE_SCOPES) {
  for (const dir of ["up", "down"]) {
    const adj = Array.from({ length: g.files }, () => []);
    for (const e of data.edges) {
      if (!inScope(e, scope)) continue;
      const a = toTrace(e[0]);
      const b = toTrace(e[1]);
      if (dir === "down") adj[a].push(b);
      else adj[b].push(a);
    }
    adjacency[`${scope} ${dir}`] = adj;
  }
}
let traces = 0;
let distanceErrors = 0;
let parentErrors = 0;
let pathErrors = 0;
let maskErrors = 0;
let folderErrors = 0;
const times = { runtime: [], types: [], tests: [] };
for (const scope of T.TRACE_SCOPES) {
  for (const dir of ["up", "down"]) {
    const adj = adjacency[`${scope} ${dir}`];
    const preds = Array.from({ length: g.files }, () => []);
    adj.forEach((list, u) => list.forEach((w) => preds[w].push(u)));
    for (let s = 0; s < g.files; s++) {
      const start = performance.now();
      const t = T.trace(g, s, dir, scope);
      times[scope].push(performance.now() - start);
      traces++;
      // Independent BFS, no ordering at all.
      const dist = new Array(g.files).fill(-1);
      dist[s] = 0;
      const queue = [s];
      for (let i = 0; i < queue.length; i++) for (const w of adj[queue[i]]) if (dist[w] === -1) { dist[w] = dist[queue[i]] + 1; queue.push(w); }
      if (!eq([...t.step], dist)) distanceErrors++;
      for (let w = 0; w < g.files; w++) {
        if (t.step[w] <= 0) continue;
        const candidates = preds[w].filter((u) => t.step[u] === t.step[w] - 1);
        const best = candidates.reduce((x, u) => (x === -1 || g.rank[u] < g.rank[x] ? u : x), -1);
        if (t.parent[w] !== best) parentErrors++;
        // The chain to the parent is the model chain between those two files, if there is one.
        const [da, db] = dir === "down" ? [t.parent[w], w] : [w, t.parent[w]];
        let k = -1;
        for (let c = 0; c < g.chains; c++) if (g.chainA[c] === da && g.chainB[c] === db) k = c;
        if (scope === "runtime" ? t.via[w] !== k || k === -1 : t.via[w] !== k) parentErrors++;
      }
      // Paths: from a file back to the subject, one step closer each time.
      for (const w of [t.layers.at(-1)[0], t.layers[1]?.[0]].filter((x) => x !== undefined)) {
        const p = T.pathTo(t, w);
        const ok = p.length === t.step[w] + 1 && p.at(-1) === s && p.every((v, i) => i === 0 || adj[v].includes(p[i - 1]));
        if (!ok) pathErrors++;
        const pm = T.pathMask(t, w);
        const nodes = p.filter((v) => v < g.sources);
        const chains = p.map((v) => t.via[v]).filter((k) => k >= 0);
        if (pm.nodes.reduce((x, y) => x + y, 0) !== nodes.length || !nodes.every((v) => pm.nodes[v] === 1) || pm.edges.reduce((x, y) => x + y, 0) !== chains.length) pathErrors++;
      }
      // Tree masks, step by step: the lit files and, at runtime, one chain per lit file but the subject.
      if (s < g.sources) {
        for (let d = 0; d < t.layers.length; d++) {
          const mk = T.traceMask(t, { upTo: d, tree: true });
          const nodes = mk.nodes.reduce((x, y) => x + y, 0);
          const edges = mk.edges.reduce((x, y) => x + y, 0);
          const expectNodes = 1 + t.layers.slice(1, d + 1).reduce((x, l) => x + l.filter((v) => v < g.sources).length, 0);
          if (nodes !== expectNodes || (scope === "runtime" && edges !== nodes - 1)) maskErrors++;
        }
      }
      const fc = T.folderCounts(t);
      if (fc.reduce((x, y) => x + y, 0) !== t.count) folderErrors++;
    }
  }
}
check(`distances equal an independent BFS (${traces} traces: every file, both directions, three scopes)`, distanceErrors === 0, `${distanceErrors} wrong`);
check("every parent is the path-first file one step closer; every via is the chain between them", parentErrors === 0, `${parentErrors} wrong`);
check("paths run back to the subject one step at a time; path masks light exactly the path", pathErrors === 0, `${pathErrors} wrong`);
check("tree masks light 1 + files within the step, and at runtime one chain per file reached", maskErrors === 0, `${maskErrors} wrong`);
check("folder counts sum to the files reached", folderErrors === 0, `${folderErrors} wrong`);

// 6. Independence from the order the data lists dependencies in.
const shuffled = { ...data, edges: [...data.edges] };
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
for (let i = shuffled.edges.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [shuffled.edges[i], shuffled.edges[j]] = [shuffled.edges[j], shuffled.edges[i]];
}
const g2 = T.traceGraph(shuffled);
let orderErrors = 0;
for (const scope of T.TRACE_SCOPES) {
  for (const dir of ["up", "down"]) {
    for (let s = 0; s < g.sources; s++) {
      const x = T.trace(g, s, dir, scope);
      const y = T.trace(g2, s, dir, scope);
      const ends = (gr, k) => (k < 0 ? "" : `${gr.paths[gr.chainA[k]]}>${gr.paths[gr.chainB[k]]}`);
      if (
        !eq([...x.step], [...y.step]) ||
        !eq([...x.parent], [...y.parent]) ||
        !eq(x.layers, y.layers) ||
        !eq([...x.via].map((k) => ends(g, k)), [...y.via].map((k) => ends(g2, k)))
      ) orderErrors++;
    }
  }
}
check("the same trees with the dependencies shuffled (2,424 traces)", orderErrors === 0, `${orderErrors} differ`);
const again = T.traceGraph(data);
check("two builds give identical traces", eq(T.trace(again, types, "up", "tests"), T.trace(g, types, "up", "tests")) || JSON.stringify(Object.entries(T.trace(again, types, "up", "tests")).filter(([k]) => k !== "graph").map(([k, v]) => [k, ArrayBuffer.isView(v) ? [...v] : v])) === JSON.stringify(Object.entries(T.trace(g, types, "up", "tests")).filter(([k]) => k !== "graph").map(([k, v]) => [k, ArrayBuffer.isView(v) ? [...v] : v])));

// 7. Folder groups for the landing's list.
const list = T.listing(g);
const names = list.map((x) => x.folder);
check("14 folder groups: src itself, then the 13 folders under src/", eq(names, ["src", "src/analysis", "src/app", "src/components", "src/config", "src/engine", "src/fixtures", "src/github", "src/graph", "src/lib", "src/parser", "src/sources", "src/state", "src/workers"]), names.join(", "));
check("the groups list all 404 source files once, in path order", list.reduce((s, x) => s + x.files.length, 0) === 404 && eq(list.flatMap((x) => x.files).sort((p, q) => p - q), [...Array(404).keys()]) && list.every((x) => x.files.every((v, i) => i === 0 || g.paths[x.files[i - 1]] < g.paths[v])));
check("src holds only src/instrumentation.ts", eq(list[0].files.map(P), ["src/instrumentation.ts"]));
const typesFolders = T.folderCounts(up);
check("types.ts's runtime dependents span these folders", true, g.folders.map((f, i) => (typesFolders[i] > 0 ? `${f} ${typesFolders[i]}` : null)).filter(Boolean).join(", "));

// 8. Errors.
let thrown = 0;
for (const bad of [-1, 587, 1.5, NaN]) { try { T.trace(g, bad, "up", "runtime"); } catch (e) { if (e instanceof RangeError) thrown++; } }
check("a file number outside the data throws a RangeError", thrown === 4);
let foreign = false;
try { T.trace({ ...g }, 0, "up", "runtime"); } catch { foreign = true; }
check("a graph not made by traceGraph is refused", foreign);

// 9. Timings.
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const p95 = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)];
t0 = performance.now();
for (let v = 0; v < g.sources; v++) T.reachOf(g, v, "up");
const reachMs = (performance.now() - t0) / g.sources;
check("timings", true, `build ${buildMs.toFixed(2)} ms; trace median/p95 runtime ${median(times.runtime).toFixed(3)}/${p95(times.runtime).toFixed(3)} ms, types ${median(times.types).toFixed(3)}/${p95(times.types).toFixed(3)}, tests ${median(times.tests).toFixed(3)}/${p95(times.tests).toFixed(3)}; reachOf ${reachMs.toFixed(3)} ms per file`);

for (const [s, n, d] of results) console.log(`${s}  ${n}${d ? `  (${d})` : ""}`);
console.log(`${results.filter(([s]) => s === "PASS").length} pass, ${results.filter(([s]) => s === "FAIL").length} fail; model from ${modelPath.replace(SITE + "/", "")}`);
process.exitCode = results.some(([s]) => s === "FAIL") ? 1 : 0;
