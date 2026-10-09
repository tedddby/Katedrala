/**
 * Test support for `@katedrala/inference` (plan 6.1), shared by the tests of every unit:
 *
 * - {@link syntheticModel}: documents and models built from a compact description (files with roles,
 *   packages, exported classes, edges with kind, type-only flag and confidence, entry points; directories
 *   derived);
 * - {@link shuffledModel}: the same document with every unordered array shuffled, for determinism properties;
 * - {@link prototypeModel}: the file graphs of the design prototype (`m5/fixture_graph.py`), ported faithfully
 *   so that the design's numbers can be replayed on every fixture, barrels included (review #8).
 *
 * Not part of the package build (`tsconfig.build.json` excludes `*test-support.ts`); like tests, it may use
 * Node.js (the lint restrictions of plan 2.1 exempt it). These are test inputs, not analysis results, so no
 * truth label applies to them.
 *
 * Determinism: every builder is a pure function of its arguments (and, for prototypes, of the fixture
 * bytes); documents come out canonical (`canonicalizeDocument`), shuffles are seeded (`createRandom`).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRandom } from "@katedrala/graph";
import type { RandomSource } from "@katedrala/graph";
import {
  baseName,
  canonicalizeDocument,
  compareStrings,
  directoryId,
  edgeId,
  emptyDocument,
  entityKindOf,
  fileId,
  isWithin,
  packageId,
  parentPath,
  parseSymbolId,
  symbolCategoryOf,
  symbolId,
} from "@katedrala/ir";
import type {
  ArchitectureDocument,
  DirectoryEntity,
  DocumentDetail,
  DocumentLimits,
  EdgeEntity,
  EdgeKind,
  EntryPointEntry,
  EntryPointKind,
  FileAnalysis,
  FileEntity,
  FileId,
  FileRole,
  NodeId,
  PackageEntity,
  PackageId,
  RoleEntry,
  SymbolEntity,
  SymbolId,
  SymbolKind,
} from "@katedrala/ir";
import { ArchitectureModel } from "@katedrala/model";
import type { ModelDocument } from "@katedrala/model";

// ─── Synthetic documents ──────────────────────────────────────────────────────────────────────────────

/** A symbol of a synthetic file. */
export interface SyntheticSymbolSpec {
  /** Qualified name within the file, e.g. `OrderService.place`. */
  readonly name: string;
  /** Default `function`. */
  readonly kind?: SymbolKind;
  /** Default true. */
  readonly exported?: boolean;
  /** Qualified name of the lexical parent in the same file. */
  readonly parent?: string;
  /** Declared role, when it differs from the file's. */
  readonly role?: FileRole;
}

/** A file of a synthetic document. */
export interface SyntheticFileSpec {
  /** Normalized path, e.g. `src/orders/order.service.ts`. */
  readonly path: string;
  /** Default `source`. */
  readonly role?: FileRole;
  /** Exported top-level classes (symbols of kind `class`), the type-name votes of D-16. */
  readonly classes?: readonly string[];
  /** Other symbols, listed after the classes. */
  readonly symbols?: readonly SyntheticSymbolSpec[];
  /** Role entries the file already has, e.g. a framework detector's. */
  readonly roles?: readonly RoleEntry[];
  readonly lines?: number;
  /** Default `parsed`. */
  readonly status?: FileAnalysis["status"];
}

/** A package of a synthetic document: its manifest directory, or a full description. */
export type SyntheticPackage =
  | string
  | {
      /** Manifest directory ("" for the root). */
      readonly path: string;
      /** Declared name; default as for an unnamed manifest: the path, or `.` at the root. */
      readonly name?: string;
      /** Default `npm`. */
      readonly ecosystem?: string;
      /** Manifest file name; default `package.json`. */
      readonly manifest?: string;
    };

/** An edge of a synthetic document. */
export interface SyntheticEdgeSpec {
  /** A file path, or a node identifier (`file:`, `sym:`, `pkg:`, `ext:`), e.g. from `symbolId`. */
  readonly source: string;
  /** As `source`. */
  readonly target: string;
  /** Default `imports`. */
  readonly kind?: EdgeKind;
  /** Default false. */
  readonly typeOnly?: boolean;
  /** Default 1. */
  readonly confidence?: number;
  /** Default 1. */
  readonly observations?: number;
}

/** An edge: `[source, target]` (a runtime `imports` edge with confidence 1), or a full description. */
export type SyntheticEdge = readonly [source: string, target: string] | SyntheticEdgeSpec;

/** An entry point: a file path (kind `main`), or a full description. */
export type SyntheticEntryPoint =
  | string
  | {
      /** A file path, or a file or symbol identifier. */
      readonly entity: string;
      /** Default `main`. */
      readonly kind?: EntryPointKind;
      /** Default `test`. */
      readonly source?: string;
      /** The build output path the entry point was mapped from. */
      readonly mappedFrom?: string;
    };

/** The description of a synthetic document. */
export interface SyntheticModelSpec {
  /** Files: a path (a `source` file) or a full description. */
  readonly files: readonly (string | SyntheticFileSpec)[];
  /** Packages; their manifests are added as `configuration` files when they are not listed. */
  readonly packages?: readonly SyntheticPackage[];
  /**
   * Edges. Several edges of one kind between the same endpoints merge as the linker merges them:
   * observations add up, the merged edge is type-only only when all are, and its confidence is the maximum.
   */
  readonly edges?: readonly SyntheticEdge[];
  readonly entryPoints?: readonly SyntheticEntryPoint[];
  /** Default `repository`. */
  readonly repositoryName?: string;
  readonly limits?: Partial<DocumentLimits>;
  readonly detail?: Partial<DocumentDetail>;
}

/** A document language by extension (descriptive only: inference never reads it). */
function languageOf(path: string): string {
  const extension = /\.([^./]+)$/.exec(path)?.[1] ?? "";
  if (["ts", "tsx", "mts", "cts"].includes(extension)) return "typescript";
  if (["js", "jsx", "mjs", "cjs"].includes(extension)) return "javascript";
  return extension === "" ? "other" : extension;
}

/** An edge endpoint: a node identifier is used as given, anything else is a file path. */
function nodeOf(endpoint: string): NodeId {
  const kind = entityKindOf(endpoint);
  if (kind === "file" || kind === "symbol" || kind === "package" || kind === "external") {
    return endpoint as NodeId;
  }
  return fileId(endpoint);
}

/** An entry point entity: a file or symbol identifier is used as given, anything else is a file path. */
function entryEntityOf(entity: string): FileId | SymbolId {
  const kind = entityKindOf(entity);
  return kind === "file" || kind === "symbol" ? (entity as FileId | SymbolId) : fileId(entity);
}

function symbolOf(path: string, spec: SyntheticSymbolSpec): SymbolEntity {
  const kind = spec.kind ?? "function";
  const symbol: SymbolEntity = {
    id: symbolId(path, spec.name),
    name: spec.name.split(".").at(-1) ?? spec.name,
    qualifiedName: spec.name,
    kind,
    // Plugin (`x-`) kinds have no category; they are values for this test data.
    category: symbolCategoryOf(kind) ?? "value",
    file: fileId(path),
    range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
    exported: spec.exported ?? true,
  };
  if (spec.parent !== undefined) symbol.parent = symbolId(path, spec.parent);
  if (spec.role !== undefined) symbol.role = spec.role;
  return symbol;
}

/** The directories containing `paths`, the root included, with their child directories and files. */
function directoriesOf(paths: readonly string[], repositoryName: string): DirectoryEntity[] {
  const directories = new Map<string, DirectoryEntity>();
  const directoryOf = (path: string): DirectoryEntity => {
    let directory = directories.get(path);
    if (directory === undefined) {
      directory = {
        id: directoryId(path),
        path,
        name: path === "" ? repositoryName : baseName(path),
        directories: [],
        files: [],
      };
      directories.set(path, directory);
      if (path !== "") {
        directory.parent = directoryId(parentPath(path));
        directoryOf(parentPath(path)).directories.push(directory.id);
      }
    }
    return directory;
  };
  directoryOf("");
  for (const path of paths) directoryOf(parentPath(path)).files.push(fileId(path));
  return [...directories.values()];
}

/**
 * A complete, canonical document described by `spec` (plan 6.1): files with roles and symbols, packages
 * (each file belongs to the nearest enclosing manifest directory, as the IR defines `FileEntity.package`),
 * edges, entry points, and directories derived from the paths. Built on `emptyDocument`, so it is
 * schema-valid as long as the spec is (no duplicate files, no file path that is also a directory).
 *
 * Complexity: O(F · P + E + S + Σ path depth) for F files, P packages, E edges and S symbols, plus the
 * sorting of `canonicalizeDocument`.
 *
 * @throws {DuplicateIdError} (from `@katedrala/ir`) when two files or symbols share an identifier.
 */
export function syntheticDocument(spec: SyntheticModelSpec): ArchitectureDocument {
  const repositoryName = spec.repositoryName ?? "repository";
  const document = emptyDocument({ repositoryName });
  document.detail = { ...document.detail, ...spec.detail };
  document.limits = { ...document.limits, ...spec.limits };

  const packages: PackageEntity[] = (spec.packages ?? []).map((entry) => {
    const description = typeof entry === "string" ? { path: entry } : entry;
    const manifestName = description.manifest ?? "package.json";
    return {
      id: packageId(description.ecosystem ?? "npm", description.path),
      name: description.name ?? (description.path === "" ? "." : description.path),
      ecosystem: description.ecosystem ?? "npm",
      path: description.path,
      manifest: fileId(
        description.path === "" ? manifestName : `${description.path}/${manifestName}`,
      ),
      declaredDependencies: [],
      dependencies: [],
      dependents: [],
    };
  });
  /** The nearest enclosing package: the deepest manifest directory, then the smallest id. */
  const packageOf = (path: string): PackageId | undefined => {
    let best: PackageEntity | undefined;
    for (const candidate of packages) {
      if (!isWithin(path, candidate.path)) continue;
      if (
        best === undefined ||
        candidate.path.length > best.path.length ||
        (candidate.path.length === best.path.length && compareStrings(candidate.id, best.id) < 0)
      ) {
        best = candidate;
      }
    }
    return best?.id;
  };

  const fileSpecs: SyntheticFileSpec[] = spec.files.map((entry) =>
    typeof entry === "string" ? { path: entry } : entry,
  );
  const listed = new Set(fileSpecs.map((file) => file.path));
  for (const pkg of packages) {
    const manifestPath = pkg.manifest.slice("file:".length);
    if (!listed.has(manifestPath)) {
      fileSpecs.push({ path: manifestPath, role: "configuration" });
      listed.add(manifestPath);
    }
  }

  const symbols: SymbolEntity[] = [];
  const files: FileEntity[] = fileSpecs.map((file) => {
    const own = [
      ...(file.classes ?? []).map((name) => symbolOf(file.path, { name, kind: "class" })),
      ...(file.symbols ?? []).map((symbol) => symbolOf(file.path, symbol)),
    ];
    symbols.push(...own);
    const entity: FileEntity = {
      id: fileId(file.path),
      path: file.path,
      name: baseName(file.path),
      directory: directoryId(parentPath(file.path)),
      language: languageOf(file.path),
      role: file.role ?? "source",
      size: 1,
      analysis: { status: file.status ?? "parsed" },
      symbols: own.map((symbol) => symbol.id),
      imports: [],
      exports: [],
      tags: [],
    };
    const owner = packageOf(file.path);
    if (owner !== undefined) entity.package = owner;
    if (file.lines !== undefined) entity.lines = file.lines;
    if (file.roles !== undefined && file.roles.length > 0) entity.roles = [...file.roles];
    return entity;
  });

  const edges = new Map<string, EdgeEntity>();
  for (const entry of spec.edges ?? []) {
    const description: SyntheticEdgeSpec =
      "source" in entry ? entry : { source: entry[0], target: entry[1] };
    const kind = description.kind ?? "imports";
    const source = nodeOf(description.source);
    const target = nodeOf(description.target);
    const id = edgeId(kind, source, target);
    const observations = description.observations ?? 1;
    const typeOnly = description.typeOnly ?? false;
    const confidence = description.confidence ?? 1;
    const existing = edges.get(id);
    if (existing === undefined) {
      edges.set(id, {
        id,
        kind,
        source,
        target,
        observations,
        typeOnly,
        confidence,
        provenance: [],
      });
    } else {
      existing.observations += observations;
      existing.typeOnly &&= typeOnly;
      existing.confidence = Math.max(existing.confidence, confidence);
    }
  }

  const entryPoints = new Map<string, EntryPointEntry>();
  for (const entry of spec.entryPoints ?? []) {
    const description = typeof entry === "string" ? { entity: entry } : entry;
    const entity = entryEntityOf(description.entity);
    const point: EntryPointEntry = {
      entity,
      kind: description.kind ?? "main",
      source: description.source ?? "test",
    };
    if (description.mappedFrom !== undefined) point.mappedFrom = description.mappedFrom;
    const filePath = entity.startsWith("file:")
      ? entity.slice("file:".length)
      : (parseSymbolId(entity)?.path ?? "");
    const owner = packageOf(filePath);
    if (owner !== undefined) point.package = owner;
    entryPoints.set(`${point.entity}\n${point.kind}\n${point.source}`, point);
  }

  document.packages = packages;
  document.files = files;
  document.symbols = symbols;
  document.edges = [...edges.values()];
  document.entryPoints = [...entryPoints.values()];
  document.directories = directoriesOf(
    fileSpecs.map((file) => file.path),
    repositoryName,
  );
  return canonicalizeDocument(document);
}

/**
 * A model over {@link syntheticDocument}`(spec)` (plan 6.1).
 *
 * @example
 * syntheticModel({
 *   files: ["src/a.ts", { path: "src/b.service.ts", classes: ["BService"] }, { path: "test/a.test.ts", role: "test" }],
 *   packages: [{ path: "", name: "shop" }],
 *   edges: [["src/a.ts", "src/b.service.ts"], { source: "test/a.test.ts", target: "src/a.ts", typeOnly: true }],
 *   entryPoints: ["src/a.ts"],
 * });
 */
export function syntheticModel(spec: SyntheticModelSpec): ArchitectureModel {
  return ArchitectureModel.from(syntheticDocument(spec));
}

// ─── Shuffling ────────────────────────────────────────────────────────────────────────────────────────

/** A shuffled copy (Fisher–Yates). */
function shuffled<T>(items: readonly T[], random: RandomSource): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = result[i];
    const b = result[j];
    if (a === undefined || b === undefined) continue;
    result[i] = b;
    result[j] = a;
  }
  return result;
}

/**
 * A model over a copy of `model.document` with every array whose order carries no meaning shuffled
 * (plan 7.1, "Determinism"): directories with their child lists, packages, files with their role entries,
 * symbols, externals, edges, entry points, and the components, modules and layers present with their member
 * lists. Arrays in source order (`FileEntity.symbols`, `imports`, `exports`) keep their order, which is an
 * input. Entities are shallow copies; the seed is passed to `createRandom` (mulberry32).
 *
 * Complexity: O(size of the document).
 */
export function shuffledModel(model: ArchitectureModel, seed: number): ArchitectureModel {
  const random = createRandom(seed);
  const source = model.document;
  const document: ModelDocument = {
    ...source,
    directories: shuffled(source.directories, random).map((directory) => ({
      ...directory,
      directories: shuffled(directory.directories, random),
      files: shuffled(directory.files, random),
    })),
    packages: shuffled(source.packages, random),
    files: shuffled(source.files, random).map((file) =>
      file.roles === undefined ? { ...file } : { ...file, roles: shuffled(file.roles, random) },
    ),
    symbols: shuffled(source.symbols, random),
    externals: shuffled(source.externals, random),
    edges: shuffled(source.edges, random),
  };
  if (source.entryPoints !== undefined) document.entryPoints = shuffled(source.entryPoints, random);
  if (source.components !== undefined) {
    document.components = shuffled(source.components, random).map((component) => ({
      ...component,
      files: shuffled(component.files, random),
      children: shuffled(component.children, random),
    }));
  }
  if (source.modules !== undefined) {
    document.modules = shuffled(source.modules, random).map((module) => ({
      ...module,
      files: shuffled(module.files, random),
    }));
  }
  if (source.layers !== undefined) {
    document.layers = shuffled(source.layers, random).map((layer) => ({
      ...layer,
      files: shuffled(layer.files, random),
    }));
  }
  return ArchitectureModel.from(document);
}

// ─── Prototype fixture graphs (port of m5/fixture_graph.py) ───────────────────────────────────────────

/** The fixture repositories (`fixtures/` at the repository root). */
export const FIXTURES_DIRECTORY = fileURLToPath(new URL("../../../fixtures/", import.meta.url));

/** The relationship kinds of the prototype's file pairs. */
export type PrototypeKind = "imports" | "re-exports" | "via-re-export";

/** The IR edge kind each prototype kind becomes (plan 6.1: barrel resolutions are `uses` edges). */
export const PROTOTYPE_EDGE_KINDS: Readonly<Record<PrototypeKind, EdgeKind>> = Object.freeze({
  imports: "imports",
  "re-exports": "re-exports",
  "via-re-export": "uses",
});

/** One directed file pair of a prototype graph (`Fixture.edges` of the prototype). */
export interface PrototypePair {
  readonly source: string;
  readonly target: string;
  /** True when every relationship that formed the pair is type-only. */
  readonly typeOnly: boolean;
  /** Per kind, whether every relationship of that kind is type-only; keys sorted. */
  readonly kinds: ReadonlyMap<PrototypeKind, boolean>;
}

/** The prototype's description of a fixture (`Fixture` of `m5/fixture_graph.py`). */
export interface PrototypeGraph {
  readonly name: string;
  /** Every file (README.md and expected.json at the root excepted) with its prototype role, sorted. */
  readonly files: ReadonlyMap<string, FileRole>;
  /** Directories with a `package.json`, sorted ("" for the root). */
  readonly packages: readonly string[];
  /** Declared package names; unnamed manifests use their path, or `.` at the root. */
  readonly packageNames: ReadonlyMap<string, string>;
  /** Entry point files, sorted. */
  readonly entryPoints: readonly string[];
  /** The entry points as IR entries (kind and declaring manifest field). */
  readonly entryPointEntries: readonly EntryPointEntry[];
  /** File pairs in the prototype's insertion order. */
  readonly pairs: readonly PrototypePair[];
}

const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"] as const;
const CONFIGURATION_NAMES: ReadonlySet<string> = new Set([
  "package.json",
  "tsconfig.json",
  "tsconfig.base.json",
  "babel.config.json",
  "nest-cli.json",
  "katedrala.config.yaml",
  "pnpm-workspace.yaml",
  ".gitignore",
]);
const TEST_NAME = /\.(test|spec)\.[cm]?[jt]sx?$/;
// The prototype's regular expressions, unchanged. JavaScript's `\w` and `\s` are ASCII-based where Python's
// are Unicode-aware; every fixture is ASCII, so the matches are the same.
const IMPORT_STATEMENT =
  /(?:^|\n)\s*(import|export)\s+(type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']/g;
const DECLARATION =
  /export\s+(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/g;
const LOCAL_EXPORT = /export\s+(type\s+)?\{([^}]*)\}\s*(?!from)/g;
const BINDINGS = /\{([^}]*)\}/;
const SCRIPT_ENTRY = /(?:src|dist)\/[\w./-]+\.(?:ts|js|tsx)/g;
const MODULE_EXTENSION = /\.(d\.)?[cm]?[jt]sx?$/;
/** The prototype follows re-exports to this depth (`exported_names`). */
const MAX_REEXPORT_DEPTH = 6;

function endsWithCode(name: string): boolean {
  return CODE_EXTENSIONS.some((extension) => name.endsWith(extension));
}

/** The prototype's file roles (`classify`). */
export function prototypeRole(path: string): FileRole {
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (CONFIGURATION_NAMES.has(name) || name.endsWith(".config.json") || name.endsWith(".yaml")) {
    return "configuration";
  }
  if (name.endsWith(".d.ts")) return "declaration";
  if (name.endsWith(".json")) return "data";
  if (!endsWithCode(name)) return "other";
  if (
    TEST_NAME.test(name) ||
    path.startsWith("test/") ||
    path.includes("/test/") ||
    path.includes("/__tests__/")
  ) {
    return "test";
  }
  return "source";
}

/** Every file below `root`, relative, sorted; README.md and expected.json of the root are skipped. */
function listFiles(root: string): string[] {
  const paths: string[] = [];
  const walk = (directory: string, prefix: string): void => {
    for (const name of readdirSync(directory)) {
      const path = prefix === "" ? name : `${prefix}/${name}`;
      const full = join(directory, name);
      if (statSync(full).isDirectory()) walk(full, path);
      else if (path !== "README.md" && path !== "expected.json") paths.push(path);
    }
  };
  walk(root, "");
  return paths.sort(compareStrings);
}

/** The text of a file with universal newlines, as Python's `open(..., encoding="utf-8").read()`. */
function readText(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n?/g, "\n");
}

/** Named bindings of an import or export clause (`parse_bindings`): `[imported name, type-only]`. */
function parseBindings(clause: string): [name: string, typeOnly: boolean][] {
  const match = BINDINGS.exec(clause);
  if (match === null) return [];
  const bindings: [string, boolean][] = [];
  for (const raw of (match[1] ?? "").split(",")) {
    let part = raw.trim();
    if (part === "") continue;
    const typeOnly = part.startsWith("type ");
    if (typeOnly) part = part.slice(5).trim();
    bindings.push([(part.split(" as ")[0] ?? "").trim(), typeOnly]);
  }
  return bindings;
}

/** Whether a parsed JSON value is an object (a Python dict). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface MutablePair {
  typeOnly: boolean;
  readonly kinds: Map<PrototypeKind, boolean>;
}

const prototypeGraphs = new Map<string, PrototypeGraph>();

/**
 * The prototype's graph of a fixture: a faithful port of `load()` in `m5/fixture_graph.py` (review #8).
 *
 * - Files: every file of the fixture except README.md and expected.json at its root, with the roles of
 *   `classify` ({@link prototypeRole}).
 * - Packages: every directory with a `package.json`; names from the manifests (unnamed: the path or `.`).
 * - Entry points: `main`, the values of a `bin` object and the `src/…` or `dist/…` files that scripts
 *   mention, mapped `./` → ``, `dist/` → `src/`, `.js` → `.ts`, then tried as written, with `.js` and with
 *   `.tsx`; listed files only.
 * - Pairs: one per `expected.json` import (`type` → type-only, `re-export` → kind `re-exports`, any other →
 *   `imports`), then barrel resolution: a named import from a file that re-exports is followed through the
 *   barrel's declarations, local exports and `export … from` statements (`exported_names`, depth ≤ 6,
 *   memoized as the prototype memoizes it) to the declaring file, which gives a `via-re-export` pair.
 *   Specifiers resolve against the importing file's pairs in insertion order (`resolve_spec`, the last match
 *   wins), and pairs added by earlier files are candidates for later ones, exactly as in the prototype.
 *
 * Results are memoized per fixture.
 *
 * Complexity: O(fixture size · pairs per file) for the specifier resolution, as in the prototype; the
 * fixtures are small.
 *
 * @throws {Error} when the fixture or one of its files cannot be read.
 */
export function prototypeGraph(fixtureName: string): PrototypeGraph {
  const cached = prototypeGraphs.get(fixtureName);
  if (cached !== undefined) return cached;
  const root = join(FIXTURES_DIRECTORY, fixtureName);
  const paths = listFiles(root);
  const files = new Map(paths.map((path) => [path, prototypeRole(path)] as const));

  // Packages and entry points.
  const packages = [
    ...new Set(
      paths
        .filter((path) => path.endsWith("package.json"))
        .map((path) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "")),
    ),
  ].sort(compareStrings);
  const packageNames = new Map<string, string>();
  const entries = new Map<string, EntryPointEntry>();
  for (const pkg of packages) {
    const manifestPath = pkg === "" ? "package.json" : `${pkg}/package.json`;
    const manifest = JSON.parse(readText(join(root, manifestPath))) as unknown;
    const fields = isRecord(manifest) ? manifest : {};
    const declared = fields.name;
    packageNames.set(
      pkg,
      typeof declared === "string" && declared !== "" ? declared : pkg === "" ? "." : pkg,
    );
    const candidates: {
      readonly value: string;
      readonly kind: EntryPointKind;
      readonly field: string;
    }[] = [];
    if (typeof fields.main === "string")
      candidates.push({ value: fields.main, kind: "main", field: "main" });
    if (isRecord(fields.bin)) {
      for (const [key, value] of Object.entries(fields.bin)) {
        if (typeof value === "string") candidates.push({ value, kind: "bin", field: `bin.${key}` });
      }
    }
    if (isRecord(fields.scripts)) {
      for (const [key, script] of Object.entries(fields.scripts)) {
        if (typeof script !== "string") continue;
        for (const match of script.matchAll(SCRIPT_ENTRY)) {
          candidates.push({ value: match[0], kind: "script", field: `scripts.${key}` });
        }
      }
    }
    for (const candidate of candidates) {
      let mapped = candidate.value.startsWith("./") ? candidate.value.slice(2) : candidate.value;
      mapped = mapped.replace(/^dist\//, "src/").replace(/\.js$/, ".ts");
      for (const option of [
        mapped,
        mapped.replaceAll(".ts", ".js"),
        mapped.replaceAll(".ts", ".tsx"),
      ]) {
        const full = pkg === "" ? option : `${pkg}/${option}`;
        if (!files.has(full)) continue;
        const entry: EntryPointEntry = {
          entity: fileId(full),
          kind: candidate.kind,
          source: `${manifestPath}#${candidate.field}`,
          package: packageId("npm", pkg),
        };
        if (option !== candidate.value) entry.mappedFrom = candidate.value;
        entries.set(`${full}\n${entry.kind}\n${entry.source}`, entry);
      }
    }
  }

  // Pairs from expected.json, in insertion order.
  const pairs = new Map<string, Map<string, MutablePair>>();
  const order: { readonly source: string; readonly target: string; readonly pair: MutablePair }[] =
    [];
  const add = (source: string, target: string, typeOnly: boolean, kind: PrototypeKind): void => {
    let targets = pairs.get(source);
    if (targets === undefined) {
      targets = new Map();
      pairs.set(source, targets);
    }
    let pair = targets.get(target);
    if (pair === undefined) {
      pair = { typeOnly: true, kinds: new Map() };
      targets.set(target, pair);
      order.push({ source, target, pair });
    }
    pair.typeOnly &&= typeOnly;
    pair.kinds.set(kind, (pair.kinds.get(kind) ?? true) && typeOnly);
  };
  const expected = JSON.parse(readText(join(root, "expected.json"))) as {
    readonly imports: readonly (readonly [string, string, string])[];
  };
  for (const [source, target, kind] of expected.imports) {
    add(source, target, kind === "type", kind === "re-export" ? "re-exports" : "imports");
  }

  // Re-export resolution through barrels.
  const texts = new Map<string, string>();
  for (const path of paths) {
    if (endsWithCode(path) || path.endsWith(".d.ts")) texts.set(path, readText(join(root, path)));
  }
  const resolveSpecifier = (source: string, specifier: string): string | undefined => {
    const last = specifier.split("/").at(-1) ?? "";
    const base = last.endsWith(".js") ? last.slice(0, -3) : last;
    let best: string | undefined;
    for (const target of pairs.get(source)?.keys() ?? []) {
      const stem = target.slice(target.lastIndexOf("/") + 1).replace(MODULE_EXTENSION, "");
      const segments = target.split("/");
      const parent = segments.length >= 2 ? segments[segments.length - 2] : "";
      if (
        stem === base ||
        (stem === "index" && parent === base) ||
        ((base === "core" || base === "shared") && target.endsWith(`${base}/src/index.ts`))
      ) {
        best = target;
      }
    }
    return best;
  };
  const exportsCache = new Map<string, ReadonlyMap<string, string>>();
  const exportedNames = (path: string, depth: number): ReadonlyMap<string, string> => {
    const cached = exportsCache.get(path);
    if (cached !== undefined) return cached;
    const names = new Map<string, string>();
    const text = texts.get(path) ?? "";
    for (const match of text.matchAll(DECLARATION)) {
      const name = match[1];
      if (name !== undefined) names.set(name, path);
    }
    for (const match of text.matchAll(LOCAL_EXPORT)) {
      for (const [name] of parseBindings(`{${match[2] ?? ""}}`)) {
        if (!names.has(name)) names.set(name, path);
      }
    }
    if (depth < MAX_REEXPORT_DEPTH) {
      for (const match of text.matchAll(IMPORT_STATEMENT)) {
        const [, keyword, , clause = "", specifier = ""] = match;
        if (keyword !== "export") continue;
        const target = resolveSpecifier(path, specifier);
        if (target === undefined) continue;
        const reexported = exportedNames(target, depth + 1);
        if (clause.trim().startsWith("*")) {
          for (const [name, declaration] of reexported) {
            if (!names.has(name)) names.set(name, declaration);
          }
        } else {
          for (const [name] of parseBindings(clause)) {
            const declaration = reexported.get(name);
            if (declaration !== undefined && !names.has(name)) names.set(name, declaration);
          }
        }
      }
    }
    exportsCache.set(path, names);
    return names;
  };
  const barrels = new Set<string>();
  for (const [source, targets] of pairs) {
    for (const pair of targets.values()) if (pair.kinds.has("re-exports")) barrels.add(source);
  }
  for (const [source, text] of texts) {
    for (const match of text.matchAll(IMPORT_STATEMENT)) {
      const [, keyword, typeKeyword, clause = "", specifier = ""] = match;
      if (keyword !== "import") continue;
      const target = resolveSpecifier(source, specifier);
      if (target === undefined || !barrels.has(target)) continue;
      const names = exportedNames(target, 0);
      for (const [name, typeOnly] of parseBindings(clause)) {
        const declaration = names.get(name);
        if (
          declaration !== undefined &&
          declaration !== "" &&
          declaration !== target &&
          declaration !== source
        ) {
          add(source, declaration, typeKeyword !== undefined || typeOnly, "via-re-export");
        }
      }
    }
  }

  const graph: PrototypeGraph = {
    name: fixtureName,
    files,
    packages,
    packageNames,
    entryPoints: [...new Set([...entries.values()].map((entry) => entry.entity.slice(5)))].sort(
      compareStrings,
    ),
    entryPointEntries: [...entries.values()],
    pairs: order.map(({ source, target, pair }) => ({
      source,
      target,
      typeOnly: pair.typeOnly,
      kinds: new Map([...pair.kinds].sort(([a], [b]) => compareStrings(a, b))),
    })),
  };
  prototypeGraphs.set(fixtureName, graph);
  return graph;
}

/**
 * The prototype graph of a fixture as a canonical document (plan 6.1): its files with the prototype's roles,
 * packages with their names, entry points, and one IR edge per pair and kind (`imports`, `re-exports`, and
 * `uses` for barrel resolutions), type-only when every relationship of that kind is, confidence 1. The
 * document lists no symbols (`detail.symbols` is false, relationships are file-level), so it has no
 * class-name votes, like the prototype.
 */
export function prototypeDocument(fixtureName: string): ArchitectureDocument {
  const graph = prototypeGraph(fixtureName);
  const edges: SyntheticEdgeSpec[] = [];
  for (const pair of graph.pairs) {
    for (const [kind, typeOnly] of pair.kinds) {
      edges.push({
        source: pair.source,
        target: pair.target,
        kind: PROTOTYPE_EDGE_KINDS[kind],
        typeOnly,
      });
    }
  }
  return syntheticDocument({
    files: [...graph.files].map(([path, role]) => ({ path, role })),
    packages: graph.packages.map((path) => ({
      path,
      name: graph.packageNames.get(path) ?? (path === "" ? "." : path),
    })),
    edges,
    entryPoints: graph.entryPointEntries,
    repositoryName: fixtureName,
    detail: { symbols: false, relationships: "file", symbolMetrics: false },
  });
}

/**
 * A model over {@link prototypeDocument}: the design prototype's graph of a fixture, on which the design's
 * numbers (§3.6, §3.16, §4.6) can be replayed with the production algorithms (plan 6.1, review #8). Each call
 * builds a new model.
 */
export function prototypeModel(fixtureName: string): ArchitectureModel {
  return ArchitectureModel.from(prototypeDocument(fixtureName));
}

/** The fixtures with an `expected.json`, sorted: those `prototypeModel` accepts. */
export function prototypeFixtureNames(): string[] {
  return readdirSync(FIXTURES_DIRECTORY)
    .filter((name) => existsSync(join(FIXTURES_DIRECTORY, name, "expected.json")))
    .sort(compareStrings);
}
