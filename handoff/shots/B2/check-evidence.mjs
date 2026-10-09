// Acceptance checks for site/public/data/codeverse-evidence.json (plan 4.3, B2 item 1):
// two runs give identical bytes; its REAL_EDGE entry deep-equals lib/site.ts REAL_EDGE; under 8 KB; every value
// traced back to the CodeVerse document and the graph JSON.
import { execFileSync, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";

const SITE = "/katedrala/site";
const DOC = `${process.env.TEMP}/codeverse-structure-2.json`;
const OUT = `${SITE}/public/data/codeverse-evidence.json`;
const sha = () => createHash("sha256").update(readFileSync(OUT)).digest("hex");
const run = () => execFileSync(process.execPath, [`${SITE}/scripts/build-codeverse-evidence.mjs`, DOC], { encoding: "utf8" }).trim();

const results = [];
const check = (name, ok, detail) => { results.push([ok ? "PASS" : "FAIL", name, detail]); };

console.log(run());
const first = sha();
console.log(run());
const second = sha();
check("two runs, identical bytes", first === second, `${first.slice(0, 16)} / ${second.slice(0, 16)}`);

const ev = JSON.parse(readFileSync(OUT, "utf8"));
const bytes = readFileSync(OUT).length;
check("under 8 KB raw", bytes < 8192, `${bytes} bytes`);

const { REAL_EDGE } = await import(pathToFileURL(`${SITE}/lib/site.ts`).href);
const entry = ev.relationships.find((r) => r.id === ev.realEdge);
check("realEdge entry deep-equals lib/site.ts REAL_EDGE", isDeepStrictEqual(entry, JSON.parse(JSON.stringify(REAL_EDGE))), ev.realEdge);
check("key order of the REAL_EDGE entry matches lib/site.ts", JSON.stringify(entry) === JSON.stringify(REAL_EDGE), "");

// Traced to the document.
const doc = JSON.parse(readFileSync(DOC, "utf8"));
for (const r of ev.relationships) {
  const d = doc.edges.find((e) => e.id === r.id);
  check(`relationship ${r.id} verbatim`, isDeepStrictEqual(d, r), `${r.kind} ${r.target.split("#")[1] ?? r.target}`);
}
for (const s of ev.symbols) {
  const d = doc.symbols.find((x) => x.id === s.id);
  check(`symbol ${s.name}`, d && isDeepStrictEqual(d.range, s.range) && d.kind === s.kind && d.exported === s.exported && d.file === s.file, `${s.range.start.line}-${s.range.end.line}`);
}
const QUOTED = ["analyzedFiles", "symbols", "edges", "unresolvedImports", "unresolvedReferences", "untypedReferences"];
check("stats: exactly the six quoted counters, in the document's order", JSON.stringify(Object.keys(ev.stats)) === JSON.stringify(Object.keys(doc.repository.stats).filter((k) => QUOTED.includes(k))), Object.keys(ev.stats).join(", "));
check("stats verbatim", QUOTED.every((k) => ev.stats[k] === doc.repository.stats[k]), JSON.stringify(ev.stats));
check("no workspace 'packages' count that could be read as npm packages", !("packages" in ev.stats), "");
const kinds = {}; for (const e of doc.edges) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
check("edge kinds recount", isDeepStrictEqual(kinds, ev.edgeKinds), Object.entries(ev.edgeKinds).map(([k, v]) => `${k} ${v}`).join(", "));
check("edge kinds sum to relationships", Object.values(ev.edgeKinds).reduce((a, b) => a + b, 0) === ev.stats.edges, String(ev.stats.edges));

// Plan facts (appendix A and Act II).
const lines = ev.relationships.flatMap((r) => r.provenance.map((p) => p.line)).sort((a, b) => a - b);
check("seven observed lines 25 164 189 190 219 273 358", lines.join(" ") === "25 164 189 190 219 273 358", lines.join(" "));
check("analysis-service.ts 369 lines, 13 symbols, level 9", ev.dependent.lines === 369 && ev.dependent.symbolCount === 13 && ev.dependent.level === 9, JSON.stringify(ev.dependent));
check("cache-key.ts 51 lines, 4 symbols, level 1", ev.dependency.lines === 51 && ev.dependency.symbolCount === 4 && ev.dependency.level === 1, JSON.stringify(ev.dependency));
const g = JSON.parse(readFileSync(`${SITE}/public/data/codeverse-graph.json`, "utf8"));
const row = (p) => g.files.find((f) => f[0] === p);
check("levels equal the graph JSON", row(ev.dependent.path)[5] === ev.dependent.level && row(ev.dependency.path)[5] === ev.dependency.level, "");
check("source equals the graph JSON source", isDeepStrictEqual(g.source, ev.source), JSON.stringify(ev.source));

// Prettier leaves the file as it is.
let prettier = "clean";
try { execSync(`npx prettier --check "${OUT}"`, { cwd: "/katedrala", stdio: "pipe" }); } catch { prettier = "would reformat"; }
check("prettier --check", prettier === "clean", prettier);

for (const [s, n, d] of results) console.log(`${s}  ${n}${d ? `  (${d})` : ""}`);
process.exitCode = results.some(([s]) => s === "FAIL") ? 1 : 0;
