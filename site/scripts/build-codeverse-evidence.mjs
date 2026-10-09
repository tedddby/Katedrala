// Builds public/data/codeverse-evidence.json, the evidence behind one real dependency in Katedrala's analysis of
// CodeVerse: the film's Act II ("Every conclusion has evidence.") and the Parse and Link rows of the hinge plate.
//
// Usage: node scripts/build-codeverse-evidence.mjs <path/to/codeverse-document.json>
//
// The document is the architecture document of CodeVerse as written by `analyzeStructure` and
// `serializeDocument` (the one build-codeverse-graph.mjs reads). Two more inputs are read from the site:
// public/data/codeverse-graph.json for the two files' levels (computed for the drawing; build it first, from the
// same document) and lib/site.ts, which stays canonical for the analysis the page quotes: the document must have
// the counts of CODEVERSE_ANALYSIS (an older engine's run of the same commit does not) and record REAL_EDGE,
// the relationship the page prints in full, exactly as lib/site.ts prints it.
//
// Written, all of it taken from the document: the two files' facts; every relationship from the dependent file to
// the dependency (the file itself and its symbols on both sides), verbatim, with every provenance entry; the
// symbols those relationships start from and every symbol of the dependency, with their ranges; the number of
// relationships of each kind; the repository statistics the page quotes. Nothing is hand-edited, and the same
// inputs give the same bytes. The output is printed as Prettier prints JSON, so the repository's format check
// passes.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** The dependency the film dives into: the dependent file, and the file it depends on. */
const DEPENDENT = "src/analysis/analysis-service.ts";
const DEPENDENCY = "src/analysis/cache-key.ts";
/** Size budget in bytes: the page hands this object to the browser with the film. */
const BUDGET = 8 * 1024;
/**
 * The repository statistics the page quotes: the files analyzed, the symbols and relationships across CodeVerse,
 * and what linking could not bind (docs/ARCHITECTURE.md, "Linking"). The others stay out, `packages` above all:
 * it counts the repository's own workspace packages, not the npm packages of lib/site.ts.
 */
const STATS = new Set([
  "analyzedFiles",
  "symbols",
  "edges",
  "unresolvedImports",
  "unresolvedReferences",
  "untypedReferences",
]);

const input = process.argv[2];
if (input === undefined) {
  console.error("usage: node scripts/build-codeverse-evidence.mjs <codeverse-document.json>");
  process.exit(1);
}
const site = resolve(import.meta.dirname, "..");
const output = resolve(site, "public", "data", "codeverse-evidence.json");
const doc = JSON.parse(readFileSync(input, "utf8"));
const graph = JSON.parse(
  readFileSync(resolve(site, "public", "data", "codeverse-graph.json"), "utf8"),
);
const siteFacts = readFileSync(resolve(site, "lib", "site.ts"), "utf8");

function fail(message) {
  console.error(`build-codeverse-evidence: ${message}`);
  process.exit(1);
}

/** A plain object literal of lib/site.ts (`export const NAME = { ... } as const;`), read as data. */
function siteLiteral(name) {
  const text = new RegExp(`export const ${name} = (\\{[\\s\\S]*?\\n\\}) as const;`).exec(
    siteFacts,
  )?.[1];
  if (text === undefined) fail(`lib/site.ts declares no ${name}`);
  try {
    return JSON.parse(
      text
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
        .replace(/,(\s*[}\]])/g, "$1"),
    );
  } catch {
    fail(`lib/site.ts's ${name} is not a plain literal this script can read`);
  }
}

// Provenance of the analysis, derived exactly as build-codeverse-graph.mjs derives it, and the same analysis.
const source = {
  repository: doc.repository.name === "codeverse" ? "tedddby/CodeVerse" : doc.repository.id,
  commit: doc.snapshot.revision?.commit?.slice(0, 7) ?? null,
  generator: `${doc.generator.name} ${doc.generator.version}`,
  schemaVersion: doc.schemaVersion,
};
for (const key of Object.keys(source)) {
  if (graph.source[key] !== source[key]) {
    fail(
      `codeverse-graph.json has ${key} ${graph.source[key]}, the document ${source[key]}: rebuild it first`,
    );
  }
}

// The analysis the page quotes, by its counts in lib/site.ts (as the IR names them in repository.stats).
const analysis = siteLiteral("CODEVERSE_ANALYSIS");
if (analysis.repository !== source.repository || analysis.commit !== source.commit) {
  fail(`lib/site.ts quotes ${analysis.repository} at ${analysis.commit}, the document is another`);
}
const quotedAs = {
  files: "files",
  analyzedFiles: "analyzedFiles",
  symbols: "symbols",
  relationships: "edges",
  externals: "externals",
  directories: "directories",
  unresolvedImports: "unresolvedImports",
};
for (const [fact, stat] of Object.entries(quotedAs)) {
  if (analysis[fact] !== doc.repository.stats[stat]) {
    fail(
      `lib/site.ts quotes ${analysis[fact]} ${fact}, the document has ${doc.repository.stats[stat]}: not the analysis the page quotes`,
    );
  }
}

const fileById = new Map(doc.files.map((f) => [f.id, f]));
const graphRow = new Map(graph.files.map((row) => [row[0], row]));
const symbolsOf = (file) => doc.symbols.filter((s) => s.file === file.id);

/** A file's facts: lines and symbols from the document, the level from the graph (computed for the drawing). */
function factsOf(path) {
  const file = fileById.get(`file:${path}`);
  if (file === undefined || file.analysis?.status !== "parsed" || file.role !== "source") {
    fail(`${path} is not a parsed source file in the document`);
  }
  const row = graphRow.get(path);
  if (row === undefined || row[3] !== file.lines || row[4] !== symbolsOf(file).length) {
    fail(`codeverse-graph.json disagrees with the document about ${path}: rebuild it first`);
  }
  return {
    id: file.id,
    path,
    lines: file.lines,
    symbolCount: symbolsOf(file).length,
    level: row[5],
  };
}
const dependent = factsOf(DEPENDENT);
const dependency = factsOf(DEPENDENCY);

// Every relationship from the dependent to the dependency, at file or symbol level on either side, in the
// document's canonical order and exactly as the document records it.
const within = (id, file) => id === file.id || id.startsWith(`sym:${file.path}#`);
const relationships = doc.edges.filter(
  (e) => within(e.source, dependent) && within(e.target, dependency),
);
if (relationships.length === 0) fail(`no relationship from ${DEPENDENT} to ${DEPENDENCY}`);
// The film draws a leader from every observed line, so every observation must be listed (none cut by limits).
for (const e of relationships) {
  if (e.provenance.length !== e.observations) fail(`${e.id} lists only some of its observations`);
}

// The relationship the page prints in full: REAL_EDGE in lib/site.ts stays canonical. It must be one of these,
// recorded exactly as lib/site.ts prints it, key for key and in the same order.
const quoted = siteLiteral("REAL_EDGE");
const realEdge = quoted.id;
const recorded = relationships.find((e) => e.id === realEdge);
if (recorded === undefined) {
  fail(`REAL_EDGE ${realEdge} is not a relationship from ${DEPENDENT} to ${DEPENDENCY}`);
}
if (JSON.stringify(recorded) !== JSON.stringify(quoted)) {
  fail(`the document records ${realEdge} otherwise than REAL_EDGE in lib/site.ts`);
}

// The chain the film draws between the two files is these relationships, lifted to files.
const indexOf = (path) => graph.files.findIndex((f) => f[0] === path);
const chain = graph.edges.find((e) => e[0] === indexOf(DEPENDENT) && e[1] === indexOf(DEPENDENCY));
const observed = relationships.reduce((sum, e) => sum + e.observations, 0);
if (chain?.[2] !== observed || chain[3] !== (relationships.some((e) => !e.typeOnly) ? 1 : 0)) {
  fail(`codeverse-graph.json's dependency is not these ${observed} observations: rebuild it first`);
}

// The symbols the relationships start from, and every symbol of the dependency, with their ranges.
const starts = new Set(relationships.map((e) => e.source));
const symbols = doc.symbols
  .filter((s) => (s.file === dependent.id && starts.has(s.id)) || s.file === dependency.id)
  .map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    file: s.file,
    range: s.range,
    exported: s.exported,
  }));

// Relationships of each kind across the whole document, most first (ties by kind).
const kindCount = new Map();
for (const e of doc.edges) kindCount.set(e.kind, (kindCount.get(e.kind) ?? 0) + 1);
const edgeKinds = Object.fromEntries(
  [...kindCount].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
);

// The quoted statistics, values verbatim and in the document's order.
const stats = Object.fromEntries(
  Object.entries(doc.repository.stats).filter(([key]) => STATS.has(key)),
);
for (const key of STATS) {
  if (!Number.isInteger(stats[key])) fail(`repository.stats has no ${key}`);
}
// The kinds must account for every relationship the statistics count (a cut edge list would not).
if (doc.edges.length !== stats.edges) {
  fail(`${doc.edges.length} relationships listed, repository.stats counts ${stats.edges}`);
}

const data = {
  about:
    "Katedrala's evidence for one real dependency in CodeVerse: every relationship between the two files, every observation behind them and the symbols they bind, with the document's counts. Generated by site/scripts/build-codeverse-evidence.mjs from the architecture document; do not edit by hand.",
  source,
  dependent,
  dependency,
  symbols,
  realEdge,
  relationships,
  edgeKinds,
  stats,
};

// Objects one key per line and arrays of objects one element per line, as Prettier prints them. Prettier would
// join a short array of plain values onto one line, so the file must not contain one.
const hasPlainArray = (value) =>
  Array.isArray(value)
    ? value.some((item) => item === null || typeof item !== "object" || hasPlainArray(item))
    : value !== null && typeof value === "object" && Object.values(value).some(hasPlainArray);
if (hasPlainArray(data)) fail("an array of plain values would not print as Prettier prints it");
const text = `${JSON.stringify(data, null, 2)}\n`;
const bytes = Buffer.byteLength(text);
if (bytes >= BUDGET) fail(`${bytes} bytes, over the ${BUDGET}-byte budget`);

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, text);
const observations = relationships.reduce((sum, e) => sum + e.provenance.length, 0);
console.log(
  `wrote ${output}: ${relationships.length} relationships, ${observations} observations, ${symbols.length} symbols; ${bytes} bytes`,
);
