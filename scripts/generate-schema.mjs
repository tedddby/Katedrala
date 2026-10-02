#!/usr/bin/env node
/**
 * Generates the published JSON Schemas of every Katedrala document kind from the TypeScript IR types in
 * packages/ir/src. The TypeScript types are the single source of truth; the schemas are derived artifacts,
 * committed to packages/ir/schema so consumers in any language can validate documents.
 *
 * Two variants per document kind (draft 2020-12):
 * - `<kind>.schema.json` — the consumer schema, identified per MAJOR version. Tolerant: unknown properties
 *   and unknown enumeration values are accepted, as the versioning policy requires (minor versions add both).
 * - `<kind>.strict.schema.json` — the producer schema for exactly this version: closed objects, closed
 *   enumerations (plus plugin-reserved `x-` values), used by Katedrala's own tests.
 *
 *   node scripts/generate-schema.mjs           # write schemas
 *   node scripts/generate-schema.mjs --check   # fail if committed schemas are out of date
 *
 * Requires a prior build of @katedrala/ir (for the runtime enumeration constants).
 */
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createGenerator } from "ts-json-schema-generator";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const irDir = join(root, "packages", "ir");
const outDir = join(irDir, "schema");
const check = process.argv.includes("--check");

const irEntry = join(irDir, "dist", "index.js");
try {
  await access(irEntry);
} catch {
  console.error(`${irEntry} not found. Build first: pnpm build`);
  process.exit(1);
}
const ir = await import(pathToFileURL(irEntry).href);
const MAJOR = ir.majorVersion(ir.IR_SCHEMA_VERSION);

/** Document kind → root type and description. */
const ROOTS = [
  [
    "architecture",
    "ArchitectureDocument",
    "A Katedrala architecture document (katedrala analyze).",
  ],
  ["impact", "ImpactReport", "A Katedrala change impact report (katedrala impact)."],
  ["diff", "DiffReport", "A Katedrala architecture diff report (katedrala diff)."],
  ["health", "HealthReport", "A Katedrala architecture health report (katedrala health)."],
  ["explain", "ExplainReport", "A Katedrala explanation report (katedrala explain)."],
  ["validation", "ValidationReport", "A Katedrala rule validation report (katedrala validate)."],
  ["history", "HistoryReport", "A Katedrala architecture history report (katedrala history)."],
];

/** Identifier types are template literals in TypeScript; publish them as patterns. */
const KEBAB = "[a-z0-9]+(?:-[a-z0-9]+)*";
const ID_PATTERNS = {
  RepositoryId: "^repo:.+$",
  DirectoryId: "^dir:",
  FileId: "^file:.+$",
  SymbolId: "^sym:[^#]+#.+$",
  PackageId: `^pkg:${KEBAB}:`,
  ExternalId: "^ext:[^:]+:.+$",
  ComponentId: "^cmp:",
  ModuleId: "^mod:.+$",
  LayerId: "^layer:.+$",
  EndpointId: "^endpoint:[0-9a-f]{16}$",
  EdgeId: "^edge:[0-9a-f]{16}$",
  AnomalyId: `^anomaly:(?:x-)?${KEBAB}:[0-9a-f]{16}$`,
  ViolationId: "^violation:.+:[0-9a-f]{16}$",
};

const EXTENSION_VALUE = { type: "string", pattern: `^x-${KEBAB}$` };

function cleanDescription(text) {
  return text
    .replace(/\s*\{@link\s+([^}\s]+)\s*\}\s*/g, (match, name) => {
      const before = /^\s/.test(match) ? " " : "";
      const after = /\s$/.test(match) ? " " : "";
      return `${before}\`${name}\`${after}`;
    })
    .replace(/\(\s+`/g, "(`")
    .replace(/`\s+\)/g, "`)")
    .replace(/ {2,}/g, " ");
}

/**
 * Apply a function to every schema node (objects in the tree). Nodes are collected before any is visited, so
 * structure created by `visit` is never itself visited. `inAnyOf` tells whether the node is an `anyOf` branch.
 */
function walk(root, visit) {
  const nodes = [];
  const collect = (node, inAnyOf) => {
    if (Array.isArray(node)) {
      node.forEach((item) => collect(item, inAnyOf));
    } else if (node !== null && typeof node === "object") {
      nodes.push([node, inAnyOf]);
      for (const [key, value] of Object.entries(node)) collect(value, key === "anyOf");
    }
  };
  collect(root, false);
  for (const [node, inAnyOf] of nodes) visit(node, inAnyOf);
}

function refineStrict(definitions) {
  for (const [name, pattern] of Object.entries(ID_PATTERNS)) {
    const definition = definitions[name];
    if (definition !== undefined) definitions[name] = { ...definition, type: "string", pattern };
  }
  for (const [name, values] of Object.entries(ir.EXTENSIBLE_ENUMERATIONS)) {
    const definition = definitions[name];
    if (definition === undefined) continue;
    definitions[name] = {
      description: definition.description,
      type: "string",
      anyOf: [{ enum: [...values] }, EXTENSION_VALUE],
    };
  }
  if (definitions.EdgeKindCounts !== undefined) {
    definitions.EdgeKindCounts = {
      description: definitions.EdgeKindCounts.description,
      type: "object",
      // Inlined (not a $ref): not every report schema contains an EdgeKind definition.
      propertyNames: { anyOf: [{ enum: [...ir.EDGE_KINDS] }, EXTENSION_VALUE] },
      additionalProperties: { type: "integer", minimum: 0 },
    };
  }
  walk(definitions, (node) => {
    if (typeof node.description === "string") node.description = cleanDescription(node.description);
    const version = node.properties?.schemaVersion;
    if (version !== undefined && version.type === "string") {
      node.properties.schemaVersion = { ...version, const: ir.IR_SCHEMA_VERSION };
    }
  });
  return definitions;
}

/** Derive the tolerant consumer variant from a strict schema (deep copy). */
function toConsumer(strict) {
  const schema = structuredClone(strict);
  walk(schema.$defs, (node, inAnyOf) => {
    if (node.additionalProperties === false) delete node.additionalProperties;
    // Closed enumerations become "known values or any string".
    if (
      !inAnyOf &&
      Array.isArray(node.enum) &&
      node.enum.every((value) => typeof value === "string")
    ) {
      const values = node.enum;
      delete node.enum;
      node.anyOf = [{ enum: values }, { type: "string" }];
    }
    // Extensible enumerations: replace the x- pattern branch with "any string".
    if (Array.isArray(node.anyOf)) {
      node.anyOf = node.anyOf.map((branch) =>
        branch.pattern === EXTENSION_VALUE.pattern ? { type: "string" } : branch,
      );
      // Discriminated unions of objects may gain branches in minor versions: accept unknown objects.
      const objects = node.anyOf.every(
        (branch) => branch.type === "object" && branch.properties !== undefined,
      );
      if (objects && node.anyOf.length > 1) node.anyOf.push({ type: "object" });
    }
    if (node.propertyNames?.anyOf !== undefined) delete node.propertyNames;
    const version = node.properties?.schemaVersion;
    if (version?.const !== undefined) {
      const { const: _exact, ...rest } = version;
      node.properties.schemaVersion = { ...rest, pattern: `^${MAJOR}\\.[0-9]+\\.[0-9]+` };
    }
  });
  return schema;
}

const generator = createGenerator({
  path: join(irDir, "src", "index.ts"),
  tsconfig: join(irDir, "tsconfig.schema.json"),
  expose: "export",
  topRef: true,
  jsDoc: "extended",
  additionalProperties: false,
  sortProps: true,
  strictTuples: true,
  skipTypeCheck: true,
});

const outputs = new Map();
for (const [kind, type, description] of ROOTS) {
  // The generator emits draft-07 (`definitions`); publish draft 2020-12 (`$defs`) instead.
  const { $schema: _draft07, definitions, ...generated } = generator.createSchema(type);
  const strict = JSON.parse(
    JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: ir.schemaUri(`katedrala.${kind}`, "strict"),
      title: `Katedrala ${kind} (strict, schema ${ir.IR_SCHEMA_VERSION})`,
      description: `${description} Strict producer schema for exactly this version.`,
      ...generated,
      $defs: refineStrict(definitions),
    }).replaceAll('"#/definitions/', '"#/$defs/'),
  );
  const consumer = toConsumer(strict);
  consumer.$id = ir.schemaUri(`katedrala.${kind}`, "consumer");
  consumer.title = `Katedrala ${kind} (schema ${MAJOR}.x)`;
  consumer.description = `${description} Tolerant consumer schema for every ${MAJOR}.x version: unknown properties and enumeration values are accepted.`;
  outputs.set(`${kind}.strict.schema.json`, strict);
  outputs.set(`${kind}.schema.json`, consumer);
}

let stale = 0;
await mkdir(outDir, { recursive: true });
for (const [name, schema] of outputs) {
  const text = `${JSON.stringify(schema, null, 2)}\n`;
  const file = join(outDir, name);
  if (check) {
    const current = await readFile(file, "utf8").catch(() => "");
    if (current !== text) {
      stale++;
      console.error(`Schema out of date: ${file}`);
    }
  } else {
    await writeFile(file, text);
    console.log(`Wrote ${file}`);
  }
}
const unexpected = (await readdir(outDir)).filter((name) => !outputs.has(name));
for (const name of unexpected) {
  stale++;
  console.error(`Unexpected file in ${outDir}: ${name} (delete it)`);
}

if (stale > 0) {
  console.error(`${stale} schema file(s) are stale. Run "pnpm schema" and commit the result.`);
  process.exit(1);
}
