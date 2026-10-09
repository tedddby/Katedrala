// Size of B2's shipped pieces: trace.ts stripped of types (TypeScript), minified (Next's own terser), gzipped;
// and the evidence JSON raw and gzipped. An estimate of what the production chunk carries for trace.ts.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const SITE = "/katedrala/site";
const require = createRequire(`${SITE}/package.json`);
const ts = require("typescript");
const nextDir = require.resolve("next/package.json").replace(/package\.json$/, "");
const { minify } = require(`${nextDir}dist/compiled/terser`);

const source = readFileSync(`${SITE}/components/stage/acts/trace.ts`, "utf8");
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const min = (await minify(js, { module: true, compress: { passes: 2 }, mangle: true })).code;
const kb = (n) => `${(n / 1024).toFixed(2)} KB`;
console.log(`trace.ts: source ${kb(Buffer.byteLength(source))}, JS ${kb(Buffer.byteLength(js))}, minified ${kb(Buffer.byteLength(min))}, minified+gzip ${kb(gzipSync(min, { level: 9 }).length)}`);
const ev = readFileSync(`${SITE}/public/data/codeverse-evidence.json`);
console.log(`codeverse-evidence.json: raw ${ev.length} bytes (${kb(ev.length)}), gzip ${kb(gzipSync(ev, { level: 9 }).length)}, minified JSON ${kb(Buffer.byteLength(JSON.stringify(JSON.parse(ev))))} / gzip ${kb(gzipSync(JSON.stringify(JSON.parse(ev)), { level: 9 }).length)}`);
