const fs = require("fs");
const g = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const files = g.files; // [path, group, role, lines, symbols, level, reach, fanIn, fanOut]
const idx = new Map(files.map((f, i) => [f[0], i]));
function reverseBFS(start, accept) {
  const inn = files.map(() => []);
  for (const e of g.edges) if (accept(e)) inn[e[1]].push(e[0]);
  const dist = new Map([[start, 0]]);
  const parent = new Map();
  let frontier = [start];
  while (frontier.length) {
    const next = [];
    for (const u of frontier) for (const w of [...inn[u]].sort((a, b) => (files[a][0] < files[b][0] ? -1 : 1))) {
      if (dist.has(w)) continue;
      dist.set(w, dist.get(u) + 1); parent.set(w, u); next.push(w);
    }
    frontier = next;
  }
  return { dist, parent };
}
const src = (i) => files[i][2] === 0;
for (const p of ["src/graph/model/types.ts", "src/lib/utils/cn.ts", "src/lib/languages/registry.ts", "src/app/page.tsx"]) {
  const s = idx.get(p);
  const runtime = reverseBFS(s, (e) => e[3] === 1 && src(e[0]) && src(e[1]));
  const all = reverseBFS(s, (e) => src(e[0]) && src(e[1]));
  const tests = reverseBFS(s, (e) => true);
  const steps = {};
  for (const [v, d] of runtime.dist) if (d > 0) steps[d] = (steps[d] || 0) + 1;
  const dirs = new Set([...runtime.dist.keys()].filter((v) => v !== s).map((v) => g.groups[files[v][1]]));
  console.log(p, "runtime reach", runtime.dist.size - 1, "steps", JSON.stringify(steps), "dirs", dirs.size, [...dirs].join(","));
  console.log("  with type-only (source)", all.dist.size - 1, " with tests (all)", tests.dist.size - 1, " direct runtime", steps[1]);
  // crown path
  const crown = idx.get("src/app/page.tsx");
  if (runtime.dist.has(crown)) {
    const path = [crown]; let v = crown; while (runtime.parent.has(v)) { v = runtime.parent.get(v); path.push(v); }
    console.log("  crown path", path.map((i) => files[i][0]).join(" -> "));
  }
}
console.log("groups", g.groups.join(", "));
const testCount = files.filter((f) => f[2] !== 0).length;
console.log("tests", testCount, "edges", g.edges.length, "edge row sample", JSON.stringify(g.edges[0]));
