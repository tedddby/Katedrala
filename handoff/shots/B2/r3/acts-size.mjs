// Estimates the acts' share of the film's director chunk: the client modules of acts/ (index, evidence, change,
// landing, shared, trace, timing, copy) stripped of types, each in its own scope as a bundler keeps them, joined,
// minified with Next's terser and gzipped. Every export is kept (copy.ts's server narration included), so the figure
// is an upper bound: the bundler shakes out what the client does not use. The real figure comes from the export's
// network log. Usage: node r3/acts-size.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const SITE = "/home/user/Katedrala/site";
const require = createRequire(`${SITE}/package.json`);
const ts = require("typescript");
const nextDir = require.resolve("next/package.json").replace(/package\.json$/, "");
const { minify } = require(`${nextDir}dist/compiled/terser`);
const dir = `${SITE}/components/stage/acts`;
const kb = (n) => `${(n / 1024).toFixed(2)} KB`;
const files = ["timing", "trace", "shared", "copy", "evidence", "change", "landing", "index"];
const externals = new Map();
const SHAKE = process.argv.includes("--shake");
const used = new Map(files.map((f) => [f, new Set()]));
used.get("index").add("LATER_ACTS");
for (const f of files) {
  const src = readFileSync(`${dir}/${f}.ts`, "utf8");
  for (const m of src.matchAll(/^import\s*\{([^}]*)\}\s*from\s+"\.\/([^"]+)";/gm)) {
    for (const n of m[1].split(",").map((x) => x.trim()).filter(Boolean)) {
      if (n.startsWith("type ")) continue;
      used.get(m[2])?.add(n.split(/\s+as\s+/)[0]);
    }
  }
}
let joined = "";
for (const f of files) {
  let js = ts.transpileModule(readFileSync(`${dir}/${f}.ts`, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  js = js.replace(/^import\s*\{([^}]*)\}\s*from\s+"([^"]+)";\s*$/gm, (_, names, from) => {
    const list = names.split(",").map((s) => s.trim()).filter(Boolean);
    if (from.startsWith("./")) return `const { ${list.map((n) => n.replace(/\s+as\s+/, ": ")).join(", ")} } = __${from.slice(2)};`;
    for (const n of list) externals.set(n, from);
    return "";
  });
  const names = [];
  js = js.replace(/^export \{([^}]*)\};?\s*$/gm, (_, list) => {
    names.push(...list.split(",").map((n) => n.trim()).filter(Boolean));
    return "";
  });
  js = js.replace(/^export (const|function|class|let) (\w+)/gm, (_, kind, name) => {
    names.push(name);
    return `${kind} ${name}`;
  });
  const kept = SHAKE ? names.filter((n) => used.get(f).has(n)) : names;
  joined += `\nconst __${f} = (() => {\n${js}\nreturn { ${kept.join(", ")} };\n})();\n`;
}
const byFrom = new Map();
for (const [n, from] of externals) {
  if (!byFrom.has(from)) byFrom.set(from, new Set());
  byFrom.get(from).add(n);
}
const head = [...byFrom].map(([from, names]) => `import { ${[...names].join(", ")} } from "${from}";`).join("\n");
const source = `${head}\n${joined}\nexport const LATER_ACTS = __index.LATER_ACTS;\n`;
let min;
try {
  min = (await minify(source, { module: true, compress: { passes: 2 }, mangle: true })).code;
} catch (error) {
  const lines = source.split("\n");
  console.log(`terser: ${error.message} at ${error.line}:${error.col}`);
  console.log(lines.slice(Math.max(0, error.line - 4), error.line + 2).join("\n"));
  process.exit(1);
}
console.log(
  `acts client modules (${SHAKE ? "unused exports shaken" : "upper bound"}): JS ${kb(Buffer.byteLength(source))}, minified ${kb(Buffer.byteLength(min))}, minified+gzip ${kb(gzipSync(min, { level: 9 }).length)}`,
);
