/**
 * Structural entities: facts read directly from the repository (no inference).
 */
import type {
  ColumnNumber,
  Confidence,
  Count,
  DirectoryId,
  Evidence,
  ExternalId,
  FileId,
  LanguageId,
  LineNumber,
  PackageId,
  Range,
  RepositoryId,
  SymbolId,
} from "./common.js";
import type { AggregatedDependency } from "./architecture.js";
import type { EdgeMechanism, ResolutionMethod } from "./edges.js";

// ─── Repository & snapshot ───────────────────────────────────────────────────

export interface RepositoryInfo {
  /**
   * `repo:<normalized remote>` when the repository has an `origin` remote (e.g. `repo:github.com/acme/shop`),
   * otherwise `repo:<name>`.
   */
  id: RepositoryId;
  /**
   * Display name: the configured name, else the root package manifest's name, else the last segment of the
   * normalized remote, else `repository`. Never derived from the checkout directory's name, so the same
   * content analyzed from different clones yields the same document.
   */
  name: string;
  /** Version-control metadata, when the analysis root is inside a version-controlled repository. */
  vcs?: VcsInfo;
  /** Languages present, sorted by descending line count, then by language id. */
  languages: LanguageSummary[];
  stats: RepositoryStats;
}

/** Version-control systems. Values prefixed with `x-` are reserved for plugins. */
export type VcsType = "git" | `x-${string}`;

export interface VcsInfo {
  type: VcsType;
  /**
   * The `origin` remote, normalized: scheme, credentials and a trailing `.git` removed, `git@host:path`
   * rewritten to `host/path` (e.g. `github.com/acme/shop`).
   */
  remote?: string;
}

export interface LanguageSummary {
  language: LanguageId;
  files: Count;
  /** Lines in files of this language whose content was read. */
  lines: Count;
  bytes: Count;
}

export interface RepositoryStats {
  /** Files listed in the document. */
  files: Count;
  /** Files parsed by a language adapter (analysis status `parsed` or `partial`). */
  analyzedFiles: Count;
  /** Files whose reading or parsing failed (analysis status `failed`). */
  failedFiles: Count;
  directories: Count;
  packages: Count;
  symbols: Count;
  externals: Count;
  edges: Count;
  endpoints: Count;
  /** Lines in files whose content was read. */
  lines: Count;
  bytes: Count;
  /**
   * Import entries whose specifier could not be resolved (status `unresolved`, see `diagnostics`). Imports
   * of files excluded from the analysis (status `excluded`) resolved and are not counted.
   */
  unresolvedImports: Count;
  /**
   * References recorded by adapters that the linker could not bind although a binding should exist (an
   * unknown name, a member a module does not export). References an adapter cannot express are not recorded
   * and therefore not counted, nor are references through imports of files excluded from the analysis
   * (status `excluded`), whose names are unknown.
   */
  unresolvedReferences: Count;
  /**
   * References to members of values whose type cannot be determined without type checking (e.g. a member of
   * the result of a function that declares no return type, or of a built-in result such as a promise). They
   * are not errors, but relationships through them are missing from the document.
   */
  untypedReferences: Count;
}

/**
 * Kinds of snapshot. `working-tree`: files as they are on disk. `git-revision`: files as committed in a git
 * revision. `in-memory`: files supplied programmatically. Values prefixed with `x-` are reserved for plugins.
 */
export type SnapshotKind = "working-tree" | "git-revision" | "in-memory" | `x-${string}`;

/** What exactly was analyzed. */
export interface SnapshotInfo {
  kind: SnapshotKind;
  /** The analyzed commit, or the working tree's `HEAD` commit. */
  revision?: RevisionInfo;
  /**
   * The analysis root relative to the version-control top-level directory (POSIX, "" when equal). Absent
   * when the root is not inside a repository. Consumers keying caches by commit must include it.
   */
  subdirectory?: string;
  /**
   * `sha256:<hex>` over the document's files: for each file in path order the line
   * `<path>\t<hash or ->\t<size>\n`. Identifies the analyzed content independently of how it was obtained.
   */
  contentDigest: string;
  /**
   * `sha256:<hex>` over everything besides the content of the document's files that influences results: the
   * effective configuration and options, the versions of Katedrala (and of this schema), its adapters and
   * plugins, and what the analysis saw outside the document's files: paths of listed files that are not
   * document files, skipped links, and the content (or absence) of project configuration files read outside
   * the document's files (excluded by `include` / `exclude`, or above the analysis root). Documents with
   * equal content and analysis digests are identical.
   */
  analysisDigest: string;
  /**
   * `sha256:<hex>` over the project configuration files adapters read (e.g. `tsconfig.json`,
   * `package.json`), including files above the analysis root; reported separately to explain resolution
   * changes. Configuration outside the document's files is also covered by `analysisDigest`.
   */
  projectConfigurationDigest: string;
}

export interface RevisionInfo {
  /** Full commit hash. */
  commit: string;
  /**
   * Committer date, ISO-8601 UTC.
   * @format date-time
   */
  committedAt?: string;
  /** First line of the commit message. */
  subject?: string;
  /** For working-tree snapshots: whether analyzed files differ from `HEAD`. */
  dirty?: boolean;
}

// ─── Directories ─────────────────────────────────────────────────────────────

export interface DirectoryEntity {
  id: DirectoryId;
  /** "" for the analysis root. */
  path: string;
  /** Last path segment; the repository name for the root. */
  name: string;
  /** Absent for the root. */
  parent?: DirectoryId;
  /** Direct child directories, sorted by id. */
  directories: DirectoryId[];
  /** Files directly inside this directory, sorted by id. */
  files: FileId[];
}

// ─── Packages ────────────────────────────────────────────────────────────────

/** A unit declared by a package manifest (e.g. an npm `package.json`). */
export interface PackageEntity {
  /** `pkg:<ecosystem>:<path>`; stable across renames of the declared name. */
  id: PackageId;
  /** Declared name; for unnamed manifests, the manifest directory path ("." for the root). */
  name: string;
  /** Packaging ecosystem, e.g. `npm`. */
  ecosystem: string;
  /** Directory containing the manifest ("" for the analysis root). */
  path: string;
  /** The manifest file. */
  manifest: FileId;
  version?: string;
  /** Whether the manifest marks the package as not publishable. */
  private?: boolean;
  /** Whether this manifest declares a workspace (monorepo root). */
  workspaceRoot?: boolean;
  /** Dependencies declared in the manifest, sorted by name, scope, version range, then target. */
  declaredDependencies: PackageDependency[];
  /** Observed code-level dependencies of the package's files on other packages and externals. */
  dependencies: AggregatedDependency[];
  /** Packages whose files depend on this package's files. */
  dependents: AggregatedDependency[];
}

/** Dependency scopes. Values prefixed with `x-` are reserved for plugins. */
export type DependencyScope =
  "production" | "development" | "peer" | "optional" | "build" | "provided" | `x-${string}`;

export interface PackageDependency {
  /** Dependency name as declared. */
  name: string;
  /** Version range or protocol as declared (e.g. `^1.2.0`, `workspace:*`). */
  versionRange: string;
  scope: DependencyScope;
  /** The workspace package (internal dependency) or external entity the declaration refers to. */
  target: PackageId | ExternalId;
}

/**
 * Kinds of entry point. Values prefixed with `x-` are reserved for plugins.
 * - `main`, `module`, `exports`, `bin`, `types`: package manifest fields.
 * - `script`: a manifest script runs the file.
 * - `framework`: a framework convention (e.g. a Next.js page, a serverless handler).
 * - `configuration`: declared in Katedrala configuration.
 * - `convention`: a language convention (e.g. a `main` function).
 */
export type EntryPointKind =
  | "main"
  | "module"
  | "exports"
  | "bin"
  | "types"
  | "script"
  | "framework"
  | "configuration"
  | "convention"
  | `x-${string}`;

/**
 * A declared way into the code: manifest entry points, framework conventions, configuration. Used, among
 * others, to avoid reporting entry points as orphans.
 */
export interface EntryPointEntry {
  entity: FileId | SymbolId;
  kind: EntryPointKind;
  /** What declared it, e.g. `package.json#bin.katedrala`, `nestjs`, `katedrala.config.yaml`. */
  source: string;
  package?: PackageId;
  /** The build output path the entry point was mapped from (e.g. `dist/index.js` → `src/index.ts`). */
  mappedFrom?: string;
}

// ─── Files ───────────────────────────────────────────────────────────────────

/**
 * Broad purpose of a file. Classification is heuristic (paths, names, manifests) and configurable.
 * - `source`: production code. `test`: test code. `declaration`: type declarations only (`*.d.ts`).
 * - `configuration`: tool or build configuration. `script`: build/maintenance scripts.
 * - `generated`: generated code. `vendored`: third-party code copied into the repository.
 * - `documentation`, `asset`, `data`, `other`: non-code files.
 */
export type FileRole =
  | "source"
  | "test"
  | "declaration"
  | "configuration"
  | "script"
  | "generated"
  | "vendored"
  | "documentation"
  | "asset"
  | "data"
  | "other";

/**
 * Architectural roles assigned by framework detectors, naming conventions or configuration.
 * Values prefixed with `x-` are reserved for plugins.
 */
export type ArchitecturalRole =
  | "http-controller"
  | "route-definition"
  | "middleware"
  | "service"
  | "repository"
  | "data-model"
  | "data-transfer-object"
  | "module-definition"
  | "external-client"
  | "configuration-provider"
  | "ui-component"
  | "ui-page"
  | "state-store"
  | "utility"
  | `x-${string}`;

/** An architectural role with the evidence behind it. */
export interface RoleEntry {
  role: ArchitecturalRole;
  confidence: Confidence;
  /** The producer: a framework detector id (e.g. `nestjs`), `naming`, `location` or `configuration`. */
  source: string;
  evidence: Evidence[];
}

export interface FileEntity {
  id: FileId;
  path: string;
  /** Last path segment. */
  name: string;
  directory: DirectoryId;
  /** The package that owns the file (nearest enclosing manifest), if any. */
  package?: PackageId;
  language: LanguageId;
  /** Adapter-specific dialect, e.g. `tsx`, `jsx`, `dts`, `esm`, `cjs`. */
  dialect?: string;
  role: FileRole;
  /** Size in bytes of the file as stored (before text normalization). */
  size: Count;
  /** Line count of the normalized text, for files whose content was read. */
  lines?: Count;
  /**
   * `sha256:<hex>` of the normalized text encoded as UTF-8, for files whose content was read. Changes in
   * line endings alone do not change it.
   * @pattern ^sha256:[0-9a-f]{64}$
   */
  hash?: string;
  analysis: FileAnalysis;
  /** Package or namespace names the file declares (e.g. Java `package`, C# `namespace`). Omitted when none. */
  namespaces?: string[];
  /** Symbols declared in this file, in source order. */
  symbols: SymbolId[];
  /** Module imports, in source order. */
  imports: ImportEntry[];
  /** Exported names, sorted by name, then `from`, then `typeOnly`. */
  exports: ExportEntry[];
  /** Architectural roles, sorted by role. Omitted when none. */
  roles?: RoleEntry[];
  /** Free-form labels, sorted. */
  tags: string[];
}

/**
 * How deeply a file was analyzed. Katedrala never pretends a file was analyzed when it was not.
 * - `parsed`: parsed without syntax errors. `partial`: parsed with syntax errors; extraction is best-effort.
 * - `unsupported`: no language adapter handles this file (listed for completeness only).
 * - `skipped`: deliberately not parsed (size limit, generated/vendored, configuration); see `reason`.
 * - `failed`: reading or parsing failed; see `reason`.
 */
export interface FileAnalysis {
  status: "parsed" | "partial" | "unsupported" | "skipped" | "failed";
  /** `<adapter id>@<adapter version>` that processed the file. */
  adapter?: string;
  reason?: string;
  /** Number of syntax errors reported by the parser. */
  syntaxErrors?: Count;
}

/**
 * The semantic kind of an import. The syntax used is recorded separately in `mechanism`.
 * - `static`: a dependency resolved when the importing module loads (ES `import`, CommonJS `require`,
 *   TypeScript `import x = require()`, type-only imports, Java/Go/Python imports).
 * - `dynamic`: loaded on demand (`import()`).
 * - `re-export`: re-exports another module's names (`export ... from`).
 * - `side-effect`: loaded only for its side effects (`import "x"`).
 * - `include`: textual or declaration inclusion (`/// <reference path>`).
 * - `module-declaration`: declares a child module rather than depending on it (e.g. Rust `mod x;`).
 */
export type ImportKind =
  | "static"
  | "dynamic"
  | "re-export"
  | "side-effect"
  | "include"
  | "module-declaration"
  | `x-${string}`;

export interface ImportEntry {
  /** The specifier exactly as written; for non-literal specifiers, the source text. */
  specifier: string;
  kind: ImportKind;
  /** The syntax that expresses the import. */
  mechanism: EdgeMechanism;
  /**
   * True when the import is type-only by its syntax: `import type` / `export type`, every specifier marked
   * `type`, or a form that only exists in types (`import("m")` types, JSDoc `@import`, `/// <reference>`).
   * An ordinary import whose bindings happen to be used only in type positions is not type-only; the
   * `typeOnly` flags of the edges and provenance of its references say so.
   */
  typeOnly: boolean;
  line: LineNumber;
  column: ColumnNumber;
  /** The innermost declaration containing the import (e.g. a function with a dynamic import). */
  from?: SymbolId;
  /** The import brings every exported name into scope (`from x import *`, Java `.*`). */
  wildcard?: boolean;
  /** The import applies to every file of its project (C# `global using`). */
  global?: boolean;
  /** Failure to resolve at runtime is handled (e.g. Python optional imports). */
  optional?: boolean;
  resolution: ImportResolution;
}

/** Outcome of resolving an import specifier. */
export type ImportResolution =
  | {
      /** Points to one or more files in the document (several for package- or namespace-level imports). */
      status: "resolved";
      /** Sorted. */
      targets: FileId[];
      method: ResolutionMethod;
      /** The imported unit when it is not a single file (a Go package path, a Java package, a namespace). */
      unit?: string;
    }
  | {
      /**
       * Points to files of the snapshot that are excluded from the analysis (by `include` / `exclude`), so
       * they are not files of the document. The import resolved: it is neither counted in
       * `RepositoryStats.unresolvedImports` nor reported as a diagnostic.
       */
      status: "excluded";
      /** The files, by path relative to the analysis root (they have no identifiers). Sorted. */
      paths: string[];
      method: ResolutionMethod;
      /** The imported unit when it is not a single file (a Go package path, a Java package, a namespace). */
      unit?: string;
    }
  | {
      /** A third-party package. */
      status: "external";
      target: ExternalId;
      method: ResolutionMethod;
    }
  | {
      /** A platform built-in module. */
      status: "builtin";
      target: ExternalId;
    }
  | {
      /** Expected to resolve but did not. */
      status: "unresolved";
      reason: string;
      method?: ResolutionMethod;
    }
  | {
      /** The specifier is not statically known (e.g. `import(variable)`). */
      status: "non-literal";
    };

export interface ExportEntry {
  /**
   * Exported name; `default` for default exports; `=` for an export assignment (`export =`,
   * `module.exports =`); `*` for `export * from`.
   */
  name: string;
  /**
   * The declarations the name denotes, resolved through re-exports (several when one name denotes both a
   * value and a type, e.g. `const User` and `type User`). Sorted. Omitted when unknown.
   */
  symbols?: SymbolId[];
  /** For re-exports: the specifier being re-exported from. */
  from?: string;
  /** For re-exports: the resolved module. */
  target?: FileId | ExternalId;
  typeOnly: boolean;
}

// ─── Symbols ─────────────────────────────────────────────────────────────────

/**
 * Kind of a declared symbol. Values prefixed with `x-` are reserved for plugins (which must also give a
 * {@link SymbolCategory}).
 * - `module`: a module declaration (`declare module "x" {}`). `namespace`: a namespace / internal module.
 * - `type-alias`: an alias of another type. `type`: a distinct named type (e.g. Go `type Celsius float64`).
 * - `field`: a data member; `property`: a data member with accessor semantics (TS class fields are
 *   `property`).
 * - `constant`: an immutable binding whose value is not a function or class.
 */
export type SymbolKind =
  | "module"
  | "namespace"
  | "class"
  | "struct"
  | "record"
  | "interface"
  | "trait"
  | "type-alias"
  | "type"
  | "enum"
  | "enum-member"
  | "function"
  | "method"
  | "constructor"
  | "property"
  | "field"
  | "accessor"
  | "event"
  | "variable"
  | "constant"
  | "macro"
  | `x-${string}`;

/**
 * A closed, coarse classification of every symbol kind, for consumers that do not know a kind:
 * `type` (declares a type), `callable` (can be invoked), `value` (holds data), `namespace` (groups names).
 */
export type SymbolCategory = "type" | "callable" | "value" | "namespace";

/**
 * Language-neutral visibility, from narrowest to widest: `private` (own declaration), `file`, `protected`
 * (declaration and subtypes), `package` (language-level package, e.g. Java package-private, Go unexported),
 * `module` (compilation unit, e.g. C# `internal`, Rust `pub(crate)`), `public`.
 */
export type Visibility = "private" | "file" | "protected" | "package" | "module" | "public";

export type SymbolModifier =
  | "abstract"
  | "static"
  | "async"
  | "generator"
  | "readonly"
  | "declare"
  | "override"
  | "optional"
  | "final"
  | "sealed"
  | "virtual"
  | "partial"
  | "extension"
  | "const"
  | "default"
  | "unsafe"
  | `x-${string}`;

export interface SymbolEntity {
  id: SymbolId;
  /** Simple name, e.g. `charge`; `default` for anonymous default exports. */
  name: string;
  /**
   * Dot-separated path from the file scope, e.g. `PaymentService.charge`. Within each segment `%`, `.` and
   * `~` are percent-encoded (`%25`, `%2E`, `%7E`), so the dots are unambiguous separators.
   */
  qualifiedName: string;
  kind: SymbolKind;
  category: SymbolCategory;
  file: FileId;
  /** Lexically enclosing symbol (class of a method, namespace of a function). */
  parent?: SymbolId;
  /**
   * Semantic owner when it differs from the lexical parent: the type a member belongs to although it is
   * declared elsewhere (Go methods, Rust `impl` blocks, extension methods, module augmentation).
   */
  owner?: SymbolId | ExternalId;
  /** For partial declarations (e.g. C# `partial class`): the canonical declaration. */
  partOf?: SymbolId;
  /** The implementation declaration when one exists (e.g. the overload with a body), else the first. */
  range: Range;
  /** Every merged declaration (overloads, declaration merging), when there is more than one, in source order. */
  declarations?: SymbolDeclaration[];
  /**
   * Whether the symbol is visible outside its language-level module unit: its file for ECMAScript and
   * Python (exported), its package for Go and Java.
   */
  exported: boolean;
  visibility?: Visibility;
  /**
   * For types: whether the type is abstract in Martin's sense — an interface or trait declaring behaviour
   * (methods), or an abstract class. Data-only interfaces are not abstract.
   */
  abstract?: boolean;
  /** Sorted. Omitted when empty. */
  modifiers?: SymbolModifier[];
  /** Decorators / annotations in source order. Omitted when empty. */
  decorators?: DecoratorEntry[];
  /** Single-line declaration signature, at most 200 characters. */
  signature?: string;
  /** The symbol's role when it differs from its file's (e.g. an in-file test module). */
  role?: FileRole;
  /** Architectural roles, sorted by role. Omitted when none. */
  roles?: RoleEntry[];
  /** Free-form labels, sorted. Omitted when empty. */
  tags?: string[];
}

export interface SymbolDeclaration {
  range: Range;
  signature?: string;
}

export interface DecoratorEntry {
  /** Decorator name as written, without `@` (e.g. `Controller`, `nest.Injectable`). */
  name: string;
  /** Whether the decorator is invoked (`@Foo()`) rather than referenced (`@Foo`). */
  invoked: boolean;
  /** Source text of each argument (line endings normalized), each truncated to at most 200 characters. */
  arguments: string[];
}

// ─── Externals ───────────────────────────────────────────────────────────────

/**
 * Things outside the repository that code depends on. Values prefixed with `x-` are reserved for plugins.
 * - `package`: a third-party package. `builtin`: a platform built-in module.
 * - `environment-variable`: configuration read from the environment.
 * - `service`: a remote service addressed by code, e.g. an HTTP host.
 * - `datastore`: a database or storage system. `message-channel`: a queue or topic.
 */
export type ExternalKind =
  | "package"
  | "builtin"
  | "environment-variable"
  | "service"
  | "datastore"
  | "message-channel"
  | `x-${string}`;

export interface ExternalEntity {
  id: ExternalId;
  kind: ExternalKind;
  /**
   * The identifier namespace (e.g. `npm`, `node`, `pypi`, `env`, `http`). Equal to the second segment of the
   * id. See docs/IR.md for the registry of namespaces.
   */
  namespace: string;
  /**
   * Name within the namespace. For packages, the distribution name used by the package manager (the name a
   * manifest declares), not necessarily the name used in imports.
   */
  name: string;
  /**
   * For packages: whether every package whose files import this package declares it (in its own manifest or
   * in its workspace root's). For npm, a package whose imports of it are all type-only (`ImportEntry.typeOnly`)
   * may declare its DefinitelyTyped package instead (`@types/<name>`, or `@types/<scope>__<name>` for
   * `@<scope>/<name>`). `false` indicates at least one undeclared ("phantom") usage. Absent when no file of a
   * package of the external's ecosystem imports it.
   */
  declared?: boolean;
}
