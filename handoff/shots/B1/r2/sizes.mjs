// An estimate of the film's client chunks (gzip): each module stripped of types (TypeScript), minified with Next's own
// terser, the group concatenated and gzipped. Next's real chunking differs a little; the build measures it exactly.
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
const SITE = "/home/user/Katedrala/site";
const require = createRequire(`${SITE}/package.json`);
const ts = require("typescript");
const nextDir = require.resolve("next/package.json").replace(/package\.json$/, "");
const { minify } = require(`${nextDir}dist/compiled/terser`);
const S = `${SITE}/components/stage/`;
const groups = {
  "director + acts + trace (the film's code)": ["director.ts", "labels.ts", "links.ts", "registry.ts", "hang.ts", "copy/hanging.ts", "acts/index.ts", "acts/evidence.ts", "acts/change.ts", "acts/landing.ts", "acts/copy.ts", "acts/trace.ts", "acts/timing.ts", "acts/shared.ts", "acts/facts.ts"],
  "director alone (with labels, links, Act I)": ["director.ts", "labels.ts", "links.ts", "registry.ts", "hang.ts", "copy/hanging.ts"],
  "acts (II, III, landing) + trace": ["acts/index.ts", "acts/evidence.ts", "acts/change.ts", "acts/landing.ts", "acts/copy.ts", "acts/trace.ts", "acts/timing.ts", "acts/shared.ts", "acts/facts.ts"],
  "shared by both modes (model, timeline)": ["model.ts", "timeline.ts"],
  "still controller + fallback": ["still.ts", "fallback.ts"],
  "fallback alone (the key plan's)": ["fallback.ts"],
  "island (FilmClient + mode)": ["FilmClient.tsx", "mode.ts"],
};
const kb = (n) => (n / 1024).toFixed(1);
for (const [name, files] of Object.entries(groups)) {
  let all = "";
  const missing = [];
  for (const f of files) {
    if (!existsSync(S + f)) { missing.push(f); continue; }
    const js = ts.transpileModule(readFileSync(S + f, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    all += (await minify(js, { module: true, compress: { passes: 2 }, mangle: true })).code + "\n";
  }
  console.log(`${name}: ${kb(Buffer.byteLength(all))} KB minified, ${kb(gzipSync(all, { level: 9 }).length)} KB gzip${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);
}
