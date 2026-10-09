// The generator's guards, exercised on a scratch copy of its inputs (lib/site.ts, the graph JSON): the real
// inputs pass with the real output's bytes; each tampered input is refused with its own message.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const SITE = "/katedrala/site";
const FAKE = `${import.meta.dirname}/fake-site`;
const DOC = `${process.env.TEMP}/codeverse-structure-2.json`;
const real = readFileSync(`${SITE}/public/data/codeverse-evidence.json`, "utf8");
const siteTs = readFileSync(`${SITE}/lib/site.ts`, "utf8");
const graphJson = readFileSync(`${SITE}/public/data/codeverse-graph.json`, "utf8");

function run(name, tamperSite, tamperGraph, expectOk, expectMessage) {
  rmSync(FAKE, { recursive: true, force: true });
  mkdirSync(`${FAKE}/scripts`, { recursive: true });
  mkdirSync(`${FAKE}/lib`, { recursive: true });
  mkdirSync(`${FAKE}/public/data`, { recursive: true });
  cpSync(`${SITE}/scripts/build-codeverse-evidence.mjs`, `${FAKE}/scripts/build-codeverse-evidence.mjs`);
  writeFileSync(`${FAKE}/lib/site.ts`, tamperSite(siteTs));
  writeFileSync(`${FAKE}/public/data/codeverse-graph.json`, tamperGraph(graphJson));
  const r = spawnSync(process.execPath, [`${FAKE}/scripts/build-codeverse-evidence.mjs`, DOC], { encoding: "utf8" });
  const out = `${FAKE}/public/data/codeverse-evidence.json`;
  const wrote = existsSync(out);
  const ok = expectOk
    ? r.status === 0 && wrote && readFileSync(out, "utf8") === real
    : r.status === 1 && !wrote && r.stderr.includes(expectMessage);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  (${(r.stderr || r.stdout).trim().split("\n")[0]})`);
  return ok;
}

const same = (s) => s;
const results = [
  run("real inputs: written, bytes equal to the real output", same, same, true),
  run("REAL_EDGE with another line (219 -> 218) refused", (s) => s.replace("line: 219,", "line: 218,"), same, false, "otherwise than REAL_EDGE"),
  run("REAL_EDGE with its keys reordered refused", (s) => s.replace(/(\n  id: "edge:68b8718fedaa1a19",)(\n  kind: "calls",)/, "$2$1"), same, false, "otherwise than REAL_EDGE"),
  run("REAL_EDGE naming a relationship elsewhere refused", (s) => s.replace('id: "edge:68b8718fedaa1a19"', 'id: "edge:0000000000000000"'), same, false, "is not a relationship from"),
  run("CODEVERSE_ANALYSIS with another relationship count refused", (s) => s.replace("relationships: 14233,", "relationships: 14232,"), same, false, "not the analysis the page quotes"),
  run("CODEVERSE_ANALYSIS at another commit refused", (s) => s.replace('commit: "6b942bc",', 'commit: "0000000",'), same, false, "the document is another"),
  run("graph JSON whose chain carries other observations refused", same, (g) => { const d = JSON.parse(g); const a = d.files.findIndex((f) => f[0] === "src/analysis/analysis-service.ts"); const b = d.files.findIndex((f) => f[0] === "src/analysis/cache-key.ts"); d.edges.find((e) => e[0] === a && e[1] === b)[2] = 6; return JSON.stringify(d); }, false, "is not these 7 observations"),
  run("graph JSON from another commit refused", same, (g) => g.replace('"commit":"6b942bc"', '"commit":"0000000"'), false, "rebuild it first"),
  run("lib/site.ts without REAL_EDGE refused", (s) => s.replace("export const REAL_EDGE", "export const OTHER_EDGE"), same, false, "declares no REAL_EDGE"),
];
rmSync(FAKE, { recursive: true, force: true });
console.log(`${results.filter(Boolean).length} of ${results.length} pass`);
process.exitCode = results.every(Boolean) ? 0 : 1;
