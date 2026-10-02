/**
 * Language adapters: the only language-specific part of the analysis pipeline.
 *
 * Conceptually an adapter offers `detect`, `parse`, `extract_symbols`, `extract_imports`, `extract_exports`
 * and `extract_relationships`. For performance the four extraction facets are produced by a single
 * {@link LanguageAdapter.extract} pass returning a {@link FileExtraction} whose `symbols`, `imports`,
 * `exports` and `references` fields are those facets. Project-level knowledge (module resolution, package
 * manifests, package-scoped names) is provided separately by {@link AdapterProject}, so per-file extraction
 * stays cacheable.
 */
import type {
  Diagnostic,
  EdgeMechanism,
  EntryPointEntry,
  ImportKind,
  LanguageId,
  PackageDependency,
  ResolutionMethod,
} from "@katedrala/ir";
import type { FileExtraction } from "./extraction.js";
import type { SourceEntry } from "./source.js";

/** Version of the plugin contract implemented by this package. */
export const PLUGIN_API_VERSION = 1;

export interface LanguageInfo {
  id: LanguageId;
  displayName: string;
  /** Lower-case file extensions including the dot, e.g. `.ts`. */
  extensions: readonly string[];
}

export interface DetectInput {
  /** Normalized path of the file. */
  path: string;
}

export interface LanguageDetection {
  language: LanguageId;
  /** Adapter-specific dialect (e.g. `tsx`, `dts`, `cjs`); part of the extraction cache key. */
  dialect?: string;
}

export interface ParseInput {
  path: string;
  /** Normalized file content: UTF-8 decoded, byte-order mark removed, line endings converted to LF. */
  text: string;
  language: LanguageId;
  dialect?: string;
}

/**
 * A language adapter. Implementations must be deterministic: the same input must always produce the same
 * extraction, and `version` must change whenever extraction output for some input changes (it is part of the
 * cache key).
 *
 * @typeParam TParsed - the adapter's own syntax tree type; never crosses the adapter boundary.
 */
export interface LanguageAdapter<TParsed = unknown> {
  /** Stable identifier, e.g. `typescript`. */
  readonly id: string;
  /** Adapter version (semver); bump on any change to extraction output. */
  readonly version: string;
  readonly displayName: string;
  readonly languages: readonly LanguageInfo[];
  /**
   * Module specifier that exports `createAdapter(options: unknown)` (a {@link LanguageAdapterFactory}) for
   * parsing in worker threads. When absent, the adapter runs in the main thread only.
   */
  readonly workerModule?: string;
  /** Options this adapter was created with; passed to `createAdapter` in workers. Must be cloneable. */
  readonly options?: unknown;

  /** One-time asynchronous initialization (e.g. loading a WebAssembly grammar, starting a helper process). */
  init?(): Promise<void>;
  /** Release resources acquired in `init`. */
  dispose?(): Promise<void>;
  /** Claim a file. Return undefined for files this adapter does not handle. */
  detect(input: DetectInput): LanguageDetection | undefined;
  /** Parse a file into the adapter's syntax tree. Must not throw on syntax errors (report them instead). */
  parse(input: ParseInput): TParsed | Promise<TParsed>;
  /** Extract the language-neutral facts of a parsed file. */
  extract(parsed: TParsed, input: ParseInput): FileExtraction | Promise<FileExtraction>;
  /**
   * Optional batch extraction for adapters backed by an external process; results are cached per file
   * exactly like `extract` results. Must return one extraction per input, in input order.
   */
  extractBatch?(inputs: readonly ParseInput[]): Promise<FileExtraction[]>;
  /** Prepare project-level knowledge for one snapshot (manifests, module resolution, name scopes). */
  createProject?(context: ProjectContext): Promise<AdapterProject>;
}

/** Signature of the `createAdapter` export of a worker module. */
export type LanguageAdapterFactory = (
  options: unknown,
) => LanguageAdapter | Promise<LanguageAdapter>;

/** What an adapter can see of the snapshot while preparing its project. */
export interface ProjectContext {
  /** Every file of the snapshot, sorted by path (UTF-16 code unit order). */
  readonly files: readonly SourceEntry[];
  hasFile(path: string): boolean;
  /** UTF-8 text of a listed file (normalized); undefined when absent or unreadable. */
  readText(path: string): Promise<string | undefined>;
  /**
   * The analysis root relative to the version-control top level (POSIX, "" when equal), when the snapshot
   * belongs to a version-controlled repository.
   */
  readonly subdirectory?: string;
  /**
   * Text of a file outside the analysis root but inside the version-control top level (e.g. a `go.mod` or
   * `tsconfig.base.json` above a subdirectory being analyzed), by path relative to the top level. Files read
   * this way contribute to the project configuration digest.
   */
  readAncestorText(pathFromTopLevel: string): Promise<string | undefined>;
  /** Report a configuration problem (e.g. an invalid tsconfig) as a document diagnostic. */
  report(diagnostic: Diagnostic): void;
}

/** Project-level knowledge prepared by an adapter for one snapshot. */
export interface AdapterProject {
  /** Packages declared by manifests the adapter understands (e.g. package.json). */
  readonly packages: readonly PackageDescriptor[];
  /** Entry points declared by manifests, mapped back to source files where possible. */
  readonly entryPoints: readonly EntryPointDescriptor[];
  /** Configuration files read while preparing the project (they contribute to the configuration digest). */
  readonly configurationFiles: readonly string[];
  /**
   * Resolve a module specifier. Must be synchronous, pure and deterministic, and must match paths exactly
   * (case-sensitively) against the snapshot's file list regardless of the host file system.
   */
  resolve(request: ModuleRequest): ModuleResolution;
  /**
   * Resolve a name that is not an export of a resolved module but a child module of it (Python submodules,
   * Rust child modules). Called by the linker before giving up on a member.
   */
  resolveMember?(modulePath: string, name: string): ModuleResolution | undefined;
  /**
   * Prepare package- or namespace-level name lookup once all extractions exist (Go/Java same-package
   * declarations, C# namespaces, wildcard imports). Not needed for module-scoped languages.
   */
  link?(view: LinkView): NameResolver | Promise<NameResolver>;
}

export interface PackageDescriptor {
  /** Declared name; undefined for unnamed manifests. */
  name?: string;
  /** Packaging ecosystem, e.g. `npm` (part of the package identifier). */
  ecosystem: string;
  /** Directory containing the manifest ("" for the analysis root). */
  path: string;
  /** Path of the manifest file. */
  manifest: string;
  version?: string;
  private?: boolean;
  workspaceRoot?: boolean;
  dependencies: Array<Pick<PackageDependency, "name" | "versionRange" | "scope">>;
}

export interface EntryPointDescriptor {
  /** Source file of the entry point. */
  path: string;
  kind: EntryPointEntry["kind"];
  /** What declared it, e.g. `package.json#bin.katedrala`. */
  source: string;
  /** Directory of the declaring package. */
  packagePath?: string;
  /** The declared (build output) path the entry point was mapped from. */
  mappedFrom?: string;
}

export interface ModuleRequest {
  specifier: string;
  /** Path of the importing file. */
  fromFile: string;
  kind: ImportKind;
  mechanism: EdgeMechanism;
}

export type ModuleResolution =
  | {
      status: "resolved";
      /** Files the specifier denotes, sorted; several for package-level imports (Go, Java wildcard). */
      paths: string[];
      method: ResolutionMethod;
      /** The imported unit when it is not a single file (a Go import path, a Java package, a namespace). */
      unit?: string;
      /** Trailing names to look up from the resolved module's exports (e.g. Java `import a.b.Order.Status`). */
      members?: string[];
      /** Confidence when resolution is heuristic; 1 when omitted. */
      confidence?: number;
    }
  | {
      status: "external";
      /** External identifier namespace (`npm`, `pypi`, ...). */
      namespace: string;
      /** Distribution name the package manager uses (the name manifests declare). */
      packageName: string;
      /** The name used in code when it differs from `packageName` (e.g. Python `yaml` for `PyYAML`). */
      importName?: string;
      method: ResolutionMethod;
      confidence?: number;
    }
  | { status: "builtin"; namespace: string; moduleName: string }
  | { status: "unresolved"; reason: string };

/** Read access to every extraction of the snapshot, for project link phases. */
export interface LinkView {
  /** Paths of every analyzed file, sorted. */
  readonly files: readonly string[];
  extraction(path: string): FileExtraction | undefined;
}

/** Package- or namespace-scoped name lookup prepared by {@link AdapterProject.link}. */
export interface NameResolver {
  /**
   * Candidates for an unbound name (a `name` binding) referenced from `fromFile`, best first. Several
   * candidates mean the name is ambiguous (e.g. alternative build tags); the linker records each with its
   * confidence.
   */
  lookup(request: { name: string; fromFile: string; from?: string }): NameCandidate[];
}

export interface NameCandidate {
  path: string;
  /** Local name of the declaration in `path`. */
  localName: string;
  method: ResolutionMethod;
  confidence: number;
}
