/**
 * Concise builders for this package's tests: extractions, symbols, imports, exports, references, facts,
 * link files and a fake adapter project whose resolver is backed by a map. Not exported from the package
 * entry point.
 */
import {
  defaultLimits,
  escapeNameSegment,
  fileId,
  fullDetail,
  joinPath,
  parentPath,
  symbolId,
} from "@katedrala/ir";
import type {
  DocumentDetail,
  DocumentLimits,
  EdgeEntity,
  EdgeKind,
  FileId,
  SymbolId,
  SymbolKind,
} from "@katedrala/ir";
import type {
  AdapterProject,
  BindingRef,
  EntryPointDescriptor,
  ExtractedExport,
  ExtractedFact,
  ExtractedImport,
  ExtractedReference,
  ExtractedSymbol,
  FileExtraction,
  LinkView,
  ModuleRequest,
  ModuleResolution,
  NameResolver,
  PackageDescriptor,
  ReferenceKind,
  ReferenceTarget,
  TypeRef,
} from "@katedrala/plugin-api";
import { link } from "./link.js";
import { splitLocalName } from "./records.js";
import type { LinkFile, LinkProject, LinkResult } from "./types.js";

/** Adapter id of the files built by {@link file}. */
export const ADAPTER = "fake";

// ─── Identifiers ─────────────────────────────────────────────────────────────

/** `file:<path>` */
export function fid(path: string): FileId {
  return fileId(path);
}

/** The symbol identifier of a local name in a file. */
export function sid(path: string, localName: string): SymbolId {
  const parts = splitLocalName(localName);
  return symbolId(path, parts.qualifiedName, parts.disambiguator);
}

// ─── Extractions ─────────────────────────────────────────────────────────────

/** An extraction with every list empty (ES module by default). */
export function extraction(parts: Partial<FileExtraction> = {}): FileExtraction {
  return {
    moduleFormat: "esm",
    syntaxErrors: [],
    symbols: [],
    imports: [],
    exports: [],
    references: [],
    facts: [],
    ...parts,
  };
}

/** Options of {@link sym} and {@link member}. */
export type SymbolOptions = Partial<Omit<ExtractedSymbol, "localName" | "kind">> & {
  /** First line of the declaration (default 1). */
  line?: number;
};

/** A symbol with a local name (`Foo`, `Foo.bar`, `Foo~namespace`); its name is the last segment. */
export function sym(
  localName: string,
  kind: SymbolKind,
  options: SymbolOptions = {},
): ExtractedSymbol {
  const { line = 1, ...rest } = options;
  const qualifiedName = splitLocalName(localName).qualifiedName;
  const lastDot = qualifiedName.lastIndexOf(".");
  const name = (lastDot === -1 ? qualifiedName : qualifiedName.slice(lastDot + 1))
    .replaceAll("%2E", ".")
    .replaceAll("%7E", "~")
    .replaceAll("%25", "%");
  return {
    localName,
    name,
    qualifiedName,
    kind,
    range: { start: { line, column: 1 }, end: { line: line + 1, column: 1 } },
    ...rest,
  };
}

/**
 * A member `name` of the symbol `parent` (a local name): its qualified name extends the parent's and its
 * `parent` is set; `disambiguator` is appended to the local name (e.g. `method-static`).
 */
export function member(
  parent: string,
  name: string,
  kind: SymbolKind,
  options: SymbolOptions & { disambiguator?: string } = {},
): ExtractedSymbol {
  const { disambiguator, ...rest } = options;
  const qualifiedName = `${splitLocalName(parent).qualifiedName}.${escapeNameSegment(name)}`;
  const localName =
    disambiguator === undefined ? qualifiedName : `${qualifiedName}~${disambiguator}`;
  return sym(localName, kind, { parent, ...rest });
}

/** An import binding: `"x"` is `{ local: "x", imported: "x" }`, `["x", "y"]` is local `x` of `y`. */
export type BindingSpec = string | readonly [local: string, imported: string];

/** A literal static import (override kind, mechanism, typeOnly, position via `options`). */
export function imp(
  specifier: string,
  bindings: readonly BindingSpec[] = [],
  options: Partial<ExtractedImport> = {},
): ExtractedImport {
  return {
    specifier,
    literal: true,
    kind: "static",
    mechanism: "import-declaration",
    typeOnly: false,
    line: 1,
    column: 1,
    bindings: bindings.map((binding) =>
      typeof binding === "string"
        ? { local: binding, imported: binding, typeOnly: false }
        : { local: binding[0], imported: binding[1], typeOnly: false },
    ),
    ...options,
  };
}

/** The import entry an `export ... from` statement contributes (kind `re-export`). */
export function reexportImport(
  specifier: string,
  options: Partial<ExtractedImport> = {},
): ExtractedImport {
  return imp(specifier, [], { kind: "re-export", mechanism: "export-from", ...options });
}

/** A local export of one or more bindings. */
export function exportLocal(
  name: string,
  targets: BindingRef | readonly BindingRef[],
  options: Partial<ExtractedExport> = {},
): ExtractedExport {
  return {
    name,
    targets: Array.isArray(targets)
      ? [...(targets as readonly BindingRef[])]
      : [targets as BindingRef],
    typeOnly: false,
    line: 1,
    column: 1,
    ...options,
  };
}

/** `export { imported as name } from "from"` (`imported` defaults to `name`; `*` for `export * as`). */
export function exportFrom(
  name: string,
  from: string,
  imported: string = name,
  options: Partial<ExtractedExport> = {},
): ExtractedExport {
  return { name, from, imported, typeOnly: false, line: 1, column: 1, ...options };
}

/** `export * from "from"`. */
export function exportStar(from: string, options: Partial<ExtractedExport> = {}): ExtractedExport {
  return { name: "*", from, typeOnly: false, line: 1, column: 1, ...options };
}

/** Binding reference builders. */
export const ref = {
  import: (local: string, ...members: string[]): BindingRef => ({ type: "import", local, members }),
  symbol: (localName: string, ...members: string[]): BindingRef => ({
    type: "symbol",
    localName,
    members,
  }),
  module: (specifier: string, ...members: string[]): BindingRef => ({
    type: "module",
    specifier,
    members,
  }),
  name: (name: string, ...members: string[]): BindingRef => ({ type: "name", name, members }),
  local: (name: string, ...members: string[]): BindingRef => ({
    type: "local",
    name,
    declaredAt: { line: 1, column: 1 },
    members,
  }),
  parameter: (name: string, ...members: string[]): BindingRef => ({
    type: "parameter",
    index: 0,
    name,
    members,
  }),
};

/** An instance target: members of a value whose type is known locally. */
export function instance(
  via: "declared-type" | "constructor-type" | "call-result",
  of: ReferenceTarget,
  ...members: string[]
): ReferenceTarget {
  return { type: "instance", via, of, members };
}

/** A type reference. */
export function typeRef(binding: BindingRef): TypeRef {
  return { ref: binding };
}

/** A reference (file scope, line 1, column 1 unless overridden). */
export function use(
  kind: ReferenceKind,
  target: ReferenceTarget,
  options: Partial<ExtractedReference> = {},
): ExtractedReference {
  return { kind, target, typeOnly: false, line: 1, column: 1, ...options };
}

/** A fact (file scope, line 1, column 1 unless overridden). */
export function fact(
  type: ExtractedFact["type"],
  attributes: Record<string, string>,
  options: Partial<ExtractedFact> = {},
): ExtractedFact {
  return { type, attributes, line: 1, column: 1, ...options };
}

// ─── Files and projects ──────────────────────────────────────────────────────

/**
 * A listed file. With an extraction it is a parsed (or, with syntax errors, partial) TypeScript file of the
 * {@link ADAPTER} adapter; without one an unsupported file.
 */
export function file(
  path: string,
  parsed?: FileExtraction,
  options: Partial<LinkFile> = {},
): LinkFile {
  if (parsed === undefined) {
    return {
      path,
      size: 10,
      language: "unknown",
      role: "other",
      status: "unsupported",
      ...options,
    };
  }
  return {
    path,
    size: 100,
    language: "typescript",
    role: "source",
    status: parsed.syntaxErrors.length > 0 ? "partial" : "parsed",
    adapter: { id: ADAPTER, version: "1.0.0" },
    lines: 10,
    hash: `sha256:${"0".repeat(64)}`,
    extraction: parsed,
    ...options,
  };
}

/** A module resolution, or a shorthand for resolved paths. */
export type ResolutionSpec = ModuleResolution | string | readonly string[];

/** Options of {@link fakeProject}. */
export interface FakeProjectOptions {
  /** Paths relative specifiers resolve against (probing `x`, `x.ts`, `x.tsx`, `x/index.ts`, `.js` → `.ts`). */
  files?: readonly string[];
  /** Explicit resolutions keyed by `<fromFile>|<specifier>` or by specifier. */
  modules?: Readonly<Record<string, ResolutionSpec>>;
  /** `resolveMember` results keyed by `<modulePath>|<name>`. */
  members?: Readonly<Record<string, ResolutionSpec>>;
  packages?: readonly PackageDescriptor[];
  entryPoints?: readonly EntryPointDescriptor[];
  /** When present, the project has a `link` phase. */
  link?: (view: LinkView) => NameResolver | Promise<NameResolver>;
  /** Make `resolve` throw. */
  failResolve?: boolean;
  /** Make `resolveMember` throw. */
  failResolveMember?: boolean;
}

/** A fake adapter project that records the requests it receives. */
export interface FakeProject extends AdapterProject {
  readonly requests: ModuleRequest[];
  readonly linkViews: LinkView[];
}

function toResolution(spec: ResolutionSpec): ModuleResolution {
  if (typeof spec === "string")
    return { status: "resolved", paths: [spec], method: "relative-path" };
  if (Array.isArray(spec)) {
    return { status: "resolved", paths: [...(spec as readonly string[])], method: "relative-path" };
  }
  return spec as ModuleResolution;
}

/**
 * A fake project: explicit resolutions first; relative specifiers probe `files`; `node:` specifiers are
 * built-ins; other bare specifiers are npm packages.
 */
export function fakeProject(options: FakeProjectOptions = {}): FakeProject {
  const known = new Set(options.files ?? []);
  const modules = options.modules ?? {};
  const members = options.members ?? {};
  const requests: ModuleRequest[] = [];
  const linkViews: LinkView[] = [];
  const project: FakeProject = {
    packages: options.packages ?? [],
    entryPoints: options.entryPoints ?? [],
    configurationFiles: [],
    requests,
    linkViews,
    resolve(request: ModuleRequest): ModuleResolution {
      requests.push(request);
      if (options.failResolve === true) throw new Error("resolver exploded");
      const explicit =
        modules[`${request.fromFile}|${request.specifier}`] ?? modules[request.specifier];
      if (explicit !== undefined) return toResolution(explicit);
      const specifier = request.specifier;
      if (specifier.startsWith(".")) {
        let base: string;
        try {
          base = joinPath(parentPath(request.fromFile), specifier);
        } catch {
          return { status: "unresolved", reason: "outside the root" };
        }
        const candidates = [
          base,
          `${base}.ts`,
          `${base}.tsx`,
          `${base}/index.ts`,
          base.replace(/\.js$/, ".ts"),
        ];
        const found = candidates.find((candidate) => known.has(candidate));
        return found === undefined
          ? { status: "unresolved", reason: `no file for ${specifier}` }
          : { status: "resolved", paths: [found], method: "relative-path" };
      }
      if (specifier.startsWith("node:")) {
        return { status: "builtin", namespace: "node", moduleName: specifier.slice(5) };
      }
      const segments = specifier.split("/");
      const packageName = specifier.startsWith("@")
        ? segments.slice(0, 2).join("/")
        : (segments[0] ?? specifier);
      return { status: "external", namespace: "npm", packageName, method: "external-package" };
    },
    resolveMember(modulePath: string, name: string): ModuleResolution | undefined {
      if (options.failResolveMember === true) throw new Error("member resolver exploded");
      const spec = members[`${modulePath}|${name}`];
      return spec === undefined ? undefined : toResolution(spec);
    },
  };
  const linkPhase = options.link;
  if (linkPhase !== undefined) {
    project.link = (view: LinkView) => {
      linkViews.push(view);
      return linkPhase(view);
    };
  }
  return project;
}

/** Options of {@link run}. */
export interface RunOptions {
  /** Options of the default {@link ADAPTER} project (its `files` default to every listed path). */
  project?: FakeProjectOptions;
  /** Replaces the default project list. */
  projects?: readonly LinkProject[];
  detail?: Partial<DocumentDetail>;
  limits?: Partial<DocumentLimits>;
  repositoryName?: string;
}

/** Link files with a default fake project. */
export function run(files: readonly LinkFile[], options: RunOptions = {}): Promise<LinkResult> {
  const projects = options.projects ?? [
    {
      adapterId: ADAPTER,
      project: fakeProject({ files: files.map((entry) => entry.path), ...options.project }),
    },
  ];
  return link({
    files,
    projects,
    repositoryName: options.repositoryName ?? "repo",
    detail: { ...fullDetail(), ...options.detail },
    limits: { ...defaultLimits(), ...options.limits },
  });
}

// ─── Assertions ──────────────────────────────────────────────────────────────

/** Edges as `kind source -> target` strings (in canonical order), optionally of one kind. */
export function edgeList(result: LinkResult, kind?: EdgeKind): string[] {
  return result.edges
    .filter((edge) => kind === undefined || edge.kind === kind)
    .map((edge) => `${edge.kind} ${edge.source} -> ${edge.target}`);
}

/** The edge of a kind between two nodes. */
export function findEdge(
  result: LinkResult,
  kind: EdgeKind,
  source: string,
  target: string,
): EdgeEntity | undefined {
  return result.edges.find(
    (edge) => edge.kind === kind && edge.source === source && edge.target === target,
  );
}
