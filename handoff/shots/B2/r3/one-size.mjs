// One module's minified+gzip size (types stripped, imports external). Usage: node r3/one-size.mjs <path.ts>...
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const SITE = "/home/user/Katedrala/site";
const require = createRequire(`${SITE}/package.json`);
const ts = require("typescript");
const nextDir = require.resolve("next/package.json").replace(/package\.json$/, "");
const { minify } = require(`${nextDir}dist/compiled/terser`);
for (const file of process.argv.slice(2)) {
  const js = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const min = (await minify(js, { module: true, compress: { passes: 2 }, mangle: true })).code;
  console.log(`${file.split("/").slice(-2).join("/")}: minified ${(min.length / 1024).toFixed(2)} KB, gzip ${(gzipSync(min, { level: 9 }).length / 1024).toFixed(2)} KB`);
}
