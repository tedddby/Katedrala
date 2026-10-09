const fs = require("fs");
const doc = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const graph = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const real = doc.edges.find((e) => e.id === "edge:68b8718fedaa1a19");
console.log("REAL_EDGE in document:\n" + JSON.stringify(real, null, 1));
const A = "file:src/analysis/analysis-service.ts", B = "file:src/analysis/cache-key.ts";
const fileA = doc.files.find((f) => f.id === A), fileB = doc.files.find((f) => f.id === B);
console.log("fileA keys", Object.keys(fileA), JSON.stringify(fileA).slice(0, 600));
console.log("fileB", JSON.stringify(fileB).slice(0, 600));
const symsB = doc.symbols.filter((s) => s.file === B || (s.id || "").startsWith("sym:src/analysis/cache-key.ts#"));
console.log("symbols in cache-key:", symsB.map((s) => `${s.kind} ${s.name}`).join(", "));
const symsA = doc.symbols.filter((s) => (s.id || "").startsWith("sym:src/analysis/analysis-service.ts#"));
console.log("symbols in analysis-service:", symsA.length);
const inA = (id) => id === A || id.startsWith("sym:src/analysis/analysis-service.ts#");
const inB = (id) => id === B || id.startsWith("sym:src/analysis/cache-key.ts#");
const between = doc.edges.filter((e) => inA(e.source) && inB(e.target));
for (const e of between) console.log(e.kind, e.source, "->", e.target, "obs", e.observations, e.provenance.map((p) => `${p.line}:${p.column} ${p.mechanism}/${p.resolution}${p.detail ? " " + p.detail : ""}`).join("; "));
const kinds = {};
for (const e of doc.edges) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
console.log("edge kinds", Object.entries(kinds).sort((a, b) => b[1] - a[1]));
console.log("entryPoints", JSON.stringify(doc.entryPoints).slice(0, 500));
// graph json checks
console.log("graph counts", graph.counts, "groups", graph.groups.length);
const idx = new Map(graph.files.map((f, i) => [f[0], i]));
for (const p of ["src/analysis/analysis-service.ts", "src/analysis/cache-key.ts", "src/graph/model/types.ts", "src/app/page.tsx", "src/lib/utils/cn.ts", "src/lib/languages/registry.ts"]) {
  const f = graph.files[idx.get(p)];
  console.log(p, f && JSON.stringify(f));
}
