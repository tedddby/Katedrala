// Every readout the landing can say: all files, both directions, from the analysis as the page has it. Counts the
// words of each (the readout is at most 25 words) and reports the longest, plus the drawing's notes (traceNote).
// Run: node --import ./ts-hooks.mjs r3/readouts.mjs
import { readFileSync } from "node:fs";
const S = "/home/user/Katedrala/site/components/stage";
const M = await import(`${S}/model.ts`);
const C = await import(`${S}/acts/copy.ts`);
const T = await import(`${S}/acts/trace.ts`);
const data = JSON.parse(readFileSync("/home/user/Katedrala/site/public/data/codeverse-graph.json", "utf8"));
const model = M.buildModel(data);
const g = T.traceGraph(data);
const words = (s) => s.trim().split(/\s+/).length;
let max = { n: 0, s: "" };
let total = 0;
let over = 0;
const hist = new Map();
for (let v = 0; v < model.n; v++) {
  for (const dir of ["down", "up"]) {
    const r = T.reachOf(g, v, dir);
    const path = model.paths[v];
    const s = dir === "up" ? C.restsOnSentence(path, r) : C.standsOnSentence(path, r, model.foundation[v] === 1);
    const n = words(s);
    total++;
    hist.set(n, (hist.get(n) ?? 0) + 1);
    if (n > 25) over++;
    if (n > max.n) max = { n, s };
  }
}
console.log(`readouts ${total}, over 25 words: ${over}, longest ${max.n}: "${max.s}"`);
console.log("words histogram", [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([k, c]) => `${k}:${c}`).join(" "));
console.log("none:", JSON.stringify(C.READOUT_NONE), words(C.READOUT_NONE));
console.log("files in model", model.n, "graph files", g.n ?? g.paths?.length);
const groups = T.listing(g);
console.log("select groups", groups.length, "options", groups.reduce((s, x) => s + x.files.length, 0));
