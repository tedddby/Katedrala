// Prototype of the trace rules, to check the plan's numbers and the tie-breaking before writing trace.ts.
const fs = require("fs");
const g = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const F = g.files, n = F.length;
const idx = new Map(F.map((f, i) => [f[0], i]));
const src = (i) => F[i][2] === 0;
const scopes = {
  runtime: (e) => e[3] === 1 && src(e[0]) && src(e[1]),
  types: (e) => src(e[0]) && src(e[1]),
  tests: () => true,
};
function adj(scope, dir) {
  const a = Array.from({ length: n }, () => []);
  for (const e of g.edges) if (scopes[scope](e)) { if (dir === "up") a[e[1]].push(e[0]); else a[e[0]].push(e[1]); }
  for (const l of a) l.sort((x, y) => x - y); // index order = path order
  return a;
}
function trace(s, dir, scope, rule) {
  const A = adj(scope, dir);
  const step = new Int32Array(n).fill(-1), parent = new Int32Array(n).fill(-1);
  step[s] = 0; let frontier = [s]; const per = [1];
  while (frontier.length) {
    const next = [];
    for (const u of frontier) for (const w of A[u]) {
      if (step[w] === -1) { step[w] = step[u] + 1; parent[w] = u; next.push(w); }
      else if (rule === "canonical" && step[w] === step[u] + 1 && u < parent[w]) parent[w] = u;
    }
    if (rule === "canonical") next.sort((x, y) => x - y);
    if (next.length) per.push(next.length);
    frontier = next;
  }
  return { step, parent, per, count: per.slice(1).reduce((a, b) => a + b, 0) };
}
const pathTo = (t, v) => { const p = [v]; while (t.parent[v] !== -1) { v = t.parent[v]; p.push(v); } return p.map((i) => F[i][0]); };
const found = new Set(g.foundations);
for (const rule of ["bfs-order", "canonical"]) {
  console.log("== rule", rule);
  for (const p of ["src/graph/model/types.ts", "src/lib/utils/cn.ts", "src/lib/languages/registry.ts", "src/app/page.tsx"]) {
    const s = idx.get(p);
    const up = trace(s, "up", "runtime", rule), upT = trace(s, "up", "types", rule), upX = trace(s, "up", "tests", rule);
    const down = trace(s, "down", "runtime", rule);
    const downF = [...Array(n).keys()].filter((v) => down.step[v] > 0 && found.has(v)).length;
    console.log(p, "| up runtime", up.count, "per", up.per.slice(1).join("+"), "| types", upT.count, "| tests", upX.count,
      "| down runtime", down.count, "direct", down.per[1] ?? 0, "foundations", downF, "| down types", trace(s, "down", "types", rule).count, "| down tests", trace(s, "down", "tests", rule).count);
    if (p === "src/graph/model/types.ts") console.log("   crown path", pathTo(up, idx.get("src/app/page.tsx")).join(" -> "));
  }
}
