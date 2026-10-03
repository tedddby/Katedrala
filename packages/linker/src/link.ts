/**
 * The linker: turns per-file extractions and adapter projects into the structural part of an architecture
 * document (directories, packages, files, symbols, externals, typed edges with provenance, entry points,
 * diagnostics, statistics). Language-neutral: it knows only the plugin-api and IR contracts.
 *
 * Stages: validate and sort files → packages → file and symbol records → imports → name resolvers
 * (`AdapterProject.link`) → owners → references and facts → entry points → `declared` flags → edges →
 * entities, diagnostics and statistics. Files are processed in path order and every output array is sorted
 * canonically, so the result does not depend on the order of the input.
 */
import { compareStrings, directoryId, normalizePath, parentPath, baseName } from "@katedrala/ir";
import type {
  EntryPointEntry,
  ExternalEntity,
  ExternalId,
  FileAnalysis,
  FileEntity,
  FileId,
  NodeId,
  SymbolEntity,
} from "@katedrala/ir";
import type { LinkView, NameResolver } from "@katedrala/plugin-api";
import { Binder } from "./binder.js";
import type { BinderHost } from "./binder.js";
import { DiagnosticSink, errorMessage } from "./diagnostics.js";
import { aggregateEdges } from "./edges.js";
import { LinkerError } from "./errors.js";
import { ExternalRegistry } from "./externals.js";
import type { ExternalUsage } from "./imports.js";
import { resolveImports } from "./imports.js";
import type { FileRecord, SymbolRecord } from "./model.js";
import { ModuleResolver } from "./modules.js";
import { compareEntryPoints } from "./order.js";
import type { PackageIndex, PackageRecord } from "./packages.js";
import { buildPackages } from "./packages.js";
import { createFileRecord } from "./records.js";
import { bindReferences, collectFacts } from "./references.js";
import { buildDirectories, languageSummaries } from "./structure.js";
import { assignPartials, exportedFlags, globalScope, symbolEntity } from "./symbols.js";
import type { LinkFile, LinkInput, LinkProject, LinkResult } from "./types.js";

function validatedFiles(files: readonly LinkFile[]): LinkFile[] {
  const sorted = [...files].sort((a, b) => compareStrings(a.path, b.path));
  let previous: string | undefined;
  for (const file of sorted) {
    let normalized: string | undefined;
    try {
      normalized = normalizePath(file.path);
    } catch {
      normalized = undefined;
    }
    if (file.path === "" || normalized !== file.path) {
      throw new LinkerError(
        "invalid-path",
        `Invalid file path ${JSON.stringify(file.path)}: paths must be normalized and relative to the analysis root`,
      );
    }
    if (file.path === previous) {
      throw new LinkerError("duplicate-file", `File listed twice: ${file.path}`);
    }
    previous = file.path;
  }
  return sorted;
}

/** Projects in adapter-id order; for a repeated adapter id the first project listed is used. */
function orderedProjects(projects: readonly LinkProject[]): LinkProject[] {
  const seen = new Set<string>();
  const unique: LinkProject[] = [];
  for (const project of projects) {
    if (seen.has(project.adapterId)) continue;
    seen.add(project.adapterId);
    unique.push(project);
  }
  return unique.sort((a, b) => compareStrings(a.adapterId, b.adapterId));
}

/** Call `AdapterProject.link` once for every project whose adapter extracted at least one file. */
async function prepareNameResolvers(
  projects: readonly LinkProject[],
  records: readonly FileRecord[],
  byPath: ReadonlyMap<string, FileRecord>,
  diagnostics: DiagnosticSink,
): Promise<Map<string, NameResolver>> {
  const resolvers = new Map<string, NameResolver>();
  const analyzed = records.filter((record) => record.extraction !== undefined);
  const view: LinkView = {
    files: analyzed.map((record) => record.path),
    extraction: (path) => byPath.get(path)?.extraction,
  };
  const adapters = new Set(analyzed.map((record) => record.adapterId));
  for (const { adapterId, project } of projects) {
    if (project.link === undefined || !adapters.has(adapterId)) continue;
    try {
      resolvers.set(adapterId, await project.link(view));
    } catch (error) {
      diagnostics.pluginError(
        `link\u0000${adapterId}`,
        `Adapter "${adapterId}" failed to prepare name lookup: ${errorMessage(error)}; unbound names of its files are looked up in the global scope`,
      );
    }
  }
  return resolvers;
}

function safeNormalize(path: string): string | undefined {
  try {
    return normalizePath(path);
  } catch {
    return undefined;
  }
}

function projectEntryPoints(
  projects: readonly LinkProject[],
  byPath: ReadonlyMap<string, FileRecord>,
  packages: PackageIndex,
): EntryPointEntry[] {
  const entries: EntryPointEntry[] = [];
  for (const { adapterId, project } of projects) {
    for (const descriptor of project.entryPoints) {
      const file = byPath.get(descriptor.path);
      if (file === undefined) continue;
      const packagePath =
        descriptor.packagePath === undefined ? undefined : safeNormalize(descriptor.packagePath);
      const packageId =
        (packagePath === undefined ? undefined : packages.packageAt(packagePath, adapterId)) ??
        file.packageId;
      entries.push({
        entity: file.id,
        kind: descriptor.kind,
        source: descriptor.source,
        ...(packageId === undefined ? {} : { package: packageId }),
        ...(descriptor.mappedFrom === undefined ? {} : { mappedFrom: descriptor.mappedFrom }),
      });
    }
  }
  return entries;
}

function uniqueEntryPoints(entries: readonly EntryPointEntry[]): EntryPointEntry[] {
  const sorted = [...entries].sort(compareEntryPoints);
  return sorted.filter((entry, index) => {
    const previous = sorted[index - 1];
    return previous === undefined || compareEntryPoints(previous, entry) !== 0;
  });
}

/**
 * `ExternalEntity.declared` for external packages imported by code: true iff every package whose files
 * import it declares it, in its own manifest or in its workspace root's. A package whose files import an npm
 * package only for types may declare its `@types` package instead. Files outside any package of the
 * external's ecosystem do not take part; externals without such users get no flag.
 */
function declaredFlags(
  usage: readonly ExternalUsage[],
  packages: PackageIndex,
): Map<ExternalId, boolean> {
  /** Per external: each using package, and whether all of its imports are type-only. */
  const users = new Map<
    ExternalId,
    { external: ExternalEntity; typeOnly: Map<PackageRecord, boolean> }
  >();
  for (const { file, external, typeOnly } of usage) {
    if (external.kind !== "package") continue;
    const owner = packages.ownerInNamespace(file.path, external.namespace);
    if (owner === undefined) continue;
    let entry = users.get(external.id);
    if (entry === undefined) {
      entry = { external, typeOnly: new Map() };
      users.set(external.id, entry);
    }
    entry.typeOnly.set(owner, (entry.typeOnly.get(owner) ?? true) && typeOnly);
  }
  const flags = new Map<ExternalId, boolean>();
  for (const [id, { external, typeOnly }] of users) {
    flags.set(
      id,
      [...typeOnly].every(([record, onlyTypes]) =>
        packages.satisfies(record, external.namespace, external.name, onlyTypes),
      ),
    );
  }
  return flags;
}

function analysisOf(file: LinkFile): FileAnalysis {
  return {
    status: file.status,
    ...(file.adapter === undefined
      ? {}
      : { adapter: `${file.adapter.id}@${file.adapter.version}` }),
    ...(file.reason === undefined ? {} : { reason: file.reason }),
    ...(file.extraction === undefined ? {} : { syntaxErrors: file.extraction.syntaxErrors.length }),
  };
}

/**
 * One `syntax-error` warning per file with syntax errors, at the first one. Problems that gave a file its
 * status (`failed`: unreadable or the adapter failed; `skipped`: too large, generated, ...) are reported by
 * the stage that set it (core's extraction emits `read-failed`, `parse-failed` and `file-too-large`); the
 * file's `analysis.reason` keeps them in the document.
 */
function syntaxDiagnostics(record: FileRecord, diagnostics: DiagnosticSink): void {
  const errors = record.extraction?.syntaxErrors ?? [];
  let first = errors[0];
  for (const error of errors) {
    if (
      first !== undefined &&
      (error.line < first.line || (error.line === first.line && error.column < first.column))
    ) {
      first = error;
    }
  }
  if (first !== undefined) {
    const count = `${errors.length} syntax ${errors.length === 1 ? "error" : "errors"}`;
    diagnostics.add({
      code: "syntax-error",
      severity: "warning",
      message: `${count}; first: ${first.message}`,
      file: record.id,
      line: first.line,
      column: first.column,
    });
  }
}

/**
 * Link a snapshot: resolve imports through the adapters' projects, bind references across files and build
 * the structural part of the architecture document. Asynchronous only because `AdapterProject.link` may
 * be.
 *
 * @throws {LinkerError} for invalid input: a path that is not normalized (`invalid-path`) or listed twice
 *   (`duplicate-file`).
 */
export async function link(input: LinkInput): Promise<LinkResult> {
  const files = validatedFiles(input.files);
  const projects = orderedProjects(input.projects);
  const includeSymbols = input.detail.symbols;
  const diagnostics = new DiagnosticSink();
  const externals = new ExternalRegistry();

  const packageBuild = buildPackages(
    projects,
    new Set(files.map((file) => file.path)),
    externals,
    diagnostics,
  );
  const packages = packageBuild.index;

  const projectByAdapter = new Map(projects.map(({ adapterId, project }) => [adapterId, project]));
  const records = files.map((file) =>
    createFileRecord(file, {
      project: file.adapter === undefined ? undefined : projectByAdapter.get(file.adapter.id),
      packageId: packages.ownerOf(file.path, file.adapter?.id),
      diagnostics,
    }),
  );
  const byPath = new Map(records.map((record) => [record.path, record]));
  assignPartials(records);

  const modules = new ModuleResolver(byPath, externals, diagnostics);
  const imports = resolveImports(records, modules, diagnostics, includeSymbols);

  const nameResolvers = await prepareNameResolvers(projects, records, byPath, diagnostics);
  const globals = globalScope(records);
  const host: BinderHost = {
    files: byPath,
    specifier: (file, specifier, purpose) => modules.specifier(file, specifier, purpose),
    member: (moduleFile, name) => modules.member(moduleFile, name),
    nameResolver: (file) =>
      file.adapterId === undefined ? undefined : nameResolvers.get(file.adapterId),
    nameLookupFailed: (file, error) => {
      diagnostics.pluginError(
        `lookup\u0000${file.adapterId ?? ""}`,
        `The name resolver of adapter "${file.adapterId ?? "(none)"}" failed: ${errorMessage(error)}`,
      );
    },
    globals: (name) => globals.get(name) ?? [],
  };
  const binder = new Binder(records, host);
  binder.resolveOwners();

  const references = bindReferences(records, binder);
  const facts = collectFacts(records, externals, includeSymbols);
  const entryPoints = uniqueEntryPoints([
    ...projectEntryPoints(projects, byPath, packages),
    ...facts.entryPoints,
  ]);

  const fileOfSymbol = new Map<NodeId, FileId>();
  for (const record of records) {
    for (const symbol of record.symbols) fileOfSymbol.set(symbol.id, record.id);
  }
  const liftToFiles = input.detail.relationships === "file" || !includeSymbols;
  const edges = aggregateEdges(
    [
      ...packageBuild.observations,
      ...imports.observations,
      ...references.observations,
      ...facts.observations,
    ],
    {
      ...(liftToFiles ? { lift: (node: NodeId) => fileOfSymbol.get(node) ?? node } : {}),
      maxProvenancePerEdge: input.limits.maxProvenancePerEdge,
    },
  );

  const fileEntities: FileEntity[] = [];
  const symbolEntities: SymbolEntity[] = [];
  for (const record of records) {
    const extraction = record.extraction;
    if (includeSymbols) {
      const flags = exportedFlags(record, binder.locallyExported(record));
      for (const symbol of record.symbols) {
        symbolEntities.push(symbolEntity(symbol, flags.get(symbol) ?? false));
      }
    }
    fileEntities.push(
      fileEntity(record, {
        imports: imports.entries.get(record) ?? [],
        exports: binder.exportEntries(record, includeSymbols),
        symbols: includeSymbols ? record.symbols : [],
        namespaces: extraction?.namespaces ?? [],
      }),
    );
    syntaxDiagnostics(record, diagnostics);
  }
  symbolEntities.sort((a, b) => compareStrings(a.id, b.id));

  const directories = buildDirectories(
    files.map((file) => file.path),
    input.repositoryName,
  );
  const externalEntities = externals.entities(declaredFlags(imports.externalUsage, packages));
  const packageEntities = packages.entities();
  let lines = 0;
  let bytes = 0;
  for (const file of files) {
    lines += file.lines ?? 0;
    bytes += file.size;
  }
  return {
    directories,
    packages: packageEntities,
    files: fileEntities,
    symbols: symbolEntities,
    externals: externalEntities,
    edges,
    entryPoints,
    diagnostics: diagnostics.sorted(),
    languages: languageSummaries(files),
    stats: {
      files: files.length,
      analyzedFiles: files.filter((file) => file.status === "parsed" || file.status === "partial")
        .length,
      failedFiles: files.filter((file) => file.status === "failed").length,
      directories: directories.length,
      packages: packageEntities.length,
      symbols: symbolEntities.length,
      externals: externalEntities.length,
      edges: edges.length,
      lines,
      bytes,
      unresolvedImports: imports.unresolved,
      unresolvedReferences: references.unresolved,
      untypedReferences: references.untyped,
    },
  };
}

interface FileParts {
  readonly imports: FileEntity["imports"];
  readonly exports: FileEntity["exports"];
  readonly symbols: readonly SymbolRecord[];
  readonly namespaces: readonly string[];
}

function fileEntity(record: FileRecord, parts: FileParts): FileEntity {
  const input = record.input;
  return {
    id: record.id,
    path: record.path,
    name: baseName(record.path),
    directory: directoryId(parentPath(record.path)),
    ...(record.packageId === undefined ? {} : { package: record.packageId }),
    language: input.language,
    ...(input.dialect === undefined ? {} : { dialect: input.dialect }),
    role: input.role,
    size: input.size,
    ...(input.lines === undefined ? {} : { lines: input.lines }),
    ...(input.hash === undefined ? {} : { hash: input.hash }),
    analysis: analysisOf(input),
    ...(parts.namespaces.length === 0 ? {} : { namespaces: [...parts.namespaces] }),
    symbols: parts.symbols.map((symbol) => symbol.id),
    imports: parts.imports,
    exports: parts.exports,
    tags: [],
  };
}
