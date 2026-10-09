// Builds public/data/codeverse-graph.json, the real data behind the hanging-chain stage, from a Katedrala
// architecture document of CodeVerse (as written by `analyzeStructure` and `serializeDocument`).
//
// Usage: node scripts/build-codeverse-graph.mjs <path/to/codeverse-document.json>
//
// The output is a file-level graph of CodeVerse's source files: every file with its directory group, size,
// level (longest dependency path down to a foundation), reach (files resting on it, directly or not), fan-in
// and fan-out; every file-to-file dependency with its observation count and whether it survives at runtime;
// the foundations (source files that depend on no other source file) and the entry points (source files no
// other source file depends on). Everything is derived from the document; nothing is hand-edited.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const input = process.argv[2];
if (input === undefined) {
  console.error("usage: node scripts/build-codeverse-graph.mjs <codeverse-document.json>");
  process.exit(1);
}
const output = resolve(import.meta.dirname, "..", "public", "data", "codeverse-graph.json");
const doc = JSON.parse(readFileSync(input, "utf8"));

const ROLE = { source: 0, test: 1 };
const files = doc.files
  .filter((f) => f.analysis.status === "parsed" && f.role in ROLE)
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const index = new Map(files.map((f, i) => [f.id, i]));
const symbolFile = new Map(doc.symbols.map((s) => [s.id, s.file]));
const symbolsPerFile = new Map();
for (const s of doc.symbols) symbolsPerFile.set(s.file, (symbolsPerFile.get(s.file) ?? 0) + 1);
const fileOf = (id) => (id.startsWith("file:") ? id : id.startsWith("sym:") ? symbolFile.get(id) : undefined);

// Directory group: the first directory under src/ (or the top-level directory outside src/).
const groupOf = (path) => {
  const parts = path.split("/");
  if (parts[0] === "src" && parts.length > 2) return parts[1];
  return parts.length > 1 ? parts[0] : "(root)";
};
const groups = [...new Set(files.map((f) => groupOf(f.path)))].sort();
const groupIndex = new Map(groups.map((g, i) => [g, i]));

// File-level dependencies: lift every relationship between two different files of the set.
const pairs = new Map();
for (const e of doc.edges) {
  const a = index.get(fileOf(e.source));
  const b = index.get(fileOf(e.target));
  if (a === undefined || b === undefined || a === b) continue;
  const key = a * 100000 + b;
  const pair = pairs.get(key) ?? { a, b, observations: 0, runtime: false };
  pair.observations += e.observations ?? 1;
  if (!e.typeOnly) pair.runtime = true;
  pairs.set(key, pair);
}
const edges = [...pairs.values()].sort((x, y) => x.a - y.a || x.b - y.b);

// Measures over the runtime dependencies between source files.
const n = files.length;
const isSource = files.map((f) => f.role === "source");
const out = Array.from({ length: n }, () => []);
const inn = Array.from({ length: n }, () => []);
for (const e of edges) {
  if (!e.runtime || !isSource[e.a] || !isSource[e.b]) continue;
  out[e.a].push(e.b);
  inn[e.b].push(e.a);
}

// Strongly connected components (iterative Tarjan), so levels are defined on the condensation.
const comp = new Array(n).fill(-1);
{
  let counter = 0;
  let count = 0;
  const idx = new Array(n).fill(-1);
  const low = new Array(n).fill(0);
  const onStack = new Array(n).fill(false);
  const stack = [];
  for (let root = 0; root < n; root++) {
    if (idx[root] !== -1) continue;
    const work = [[root, 0]];
    idx[root] = low[root] = counter++;
    stack.push(root);
    onStack[root] = true;
    while (work.length > 0) {
      const frame = work[work.length - 1];
      const [v, i] = frame;
      if (i < out[v].length) {
        frame[1]++;
        const w = out[v][i];
        if (idx[w] === -1) {
          idx[w] = low[w] = counter++;
          stack.push(w);
          onStack[w] = true;
          work.push([w, 0]);
        } else if (onStack[w]) low[v] = Math.min(low[v], idx[w]);
      } else {
        work.pop();
        if (work.length > 0) low[work[work.length - 1][0]] = Math.min(low[work[work.length - 1][0]], low[v]);
        if (low[v] === idx[v]) {
          let w;
          do {
            w = stack.pop();
            onStack[w] = false;
            comp[w] = count;
          } while (w !== v);
          count++;
        }
      }
    }
  }
}
// Level: longest path down to a foundation, over the condensation (members of a cycle share a level).
const level = new Array(n).fill(-1);
const levelOf = (v) => {
  const stack = [v];
  while (stack.length > 0) {
    const u = stack[stack.length - 1];
    if (level[u] !== -1) { stack.pop(); continue; }
    const pending = out[u].filter((w) => comp[w] !== comp[u] && level[w] === -1);
    if (pending.length > 0) { stack.push(...pending); continue; }
    level[u] = Math.max(0, ...out[u].filter((w) => comp[w] !== comp[u]).map((w) => level[w] + 1));
    stack.pop();
  }
  return level[v];
};
for (let v = 0; v < n; v++) if (isSource[v]) levelOf(v);
// Members of one cycle take the highest level among them.
const compLevel = new Map();
for (let v = 0; v < n; v++) if (isSource[v]) compLevel.set(comp[v], Math.max(compLevel.get(comp[v]) ?? 0, level[v]));
for (let v = 0; v < n; v++) if (isSource[v]) level[v] = compLevel.get(comp[v]);
// Reach: source files that depend on this one, directly or through others.
const reach = new Array(n).fill(0);
for (let v = 0; v < n; v++) {
  if (!isSource[v]) continue;
  const seen = new Set([v]);
  const queue = [v];
  while (queue.length > 0) for (const u of inn[queue.shift()]) if (!seen.has(u)) { seen.add(u); queue.push(u); }
  reach[v] = seen.size - 1;
}

const sourceIdx = files.map((_, i) => i).filter((i) => isSource[i]);
const foundations = sourceIdx.filter((i) => out[i].length === 0 && inn[i].length > 0);
const entries = sourceIdx.filter((i) => inn[i].length === 0 && out[i].length > 0);
const isolated = sourceIdx.filter((i) => inn[i].length === 0 && out[i].length === 0);
const sourceEdges = edges.filter((e) => e.runtime && isSource[e.a] && isSource[e.b]).length;

const data = {
  about:
    "Katedrala's structure analysis of CodeVerse, lifted to files. Generated by site/scripts/build-codeverse-graph.mjs from the architecture document; do not edit by hand.",
  source: {
    repository: doc.repository.name === "codeverse" ? "tedddby/CodeVerse" : doc.repository.id,
    commit: doc.snapshot.revision?.commit?.slice(0, 7) ?? null,
    generator: `${doc.generator.name} ${doc.generator.version}`,
    schemaVersion: doc.schemaVersion,
  },
  counts: {
    files: n,
    sourceFiles: sourceIdx.length,
    testFiles: n - sourceIdx.length,
    dependencies: edges.length,
    runtimeSourceDependencies: sourceEdges,
    foundations: foundations.length,
    entries: entries.length,
    isolated: isolated.length,
    maxLevel: Math.max(...sourceIdx.map((i) => level[i])),
  },
  groups,
  fileFields: ["path", "group", "role (0 source, 1 test)", "lines", "symbols", "level", "reach", "fanIn", "fanOut"],
  files: files.map((f, i) => [
    f.path,
    groupIndex.get(groupOf(f.path)),
    ROLE[f.role],
    f.lines ?? 0,
    symbolsPerFile.get(f.id) ?? 0,
    isSource[i] ? level[i] : -1,
    isSource[i] ? reach[i] : 0,
    inn[i].length,
    out[i].length,
  ]),
  edgeFields: ["dependent", "dependency", "observations", "runtime (1) or type-only (0)"],
  edges: edges.map((e) => [e.a, e.b, e.observations, e.runtime ? 1 : 0]),
  foundations,
  entries,
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(data));
console.log(`wrote ${output}: ${JSON.stringify(data.counts)}; ${Math.round(JSON.stringify(data).length / 1024)} KiB`);
