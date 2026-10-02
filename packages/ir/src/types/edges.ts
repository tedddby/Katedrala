/**
 * Relationships: the typed, directed multigraph of observed dependencies.
 *
 * Every edge is a direct observation in source code or a manifest, and carries provenance pointing at the
 * place(s) it was observed. Multiple relationship kinds between the same two nodes are separate edges
 * (e.g. A `imports` B and A `calls` B). Repeated observations of the same kind between the same nodes are
 * aggregated into one edge whose `observations` counts them.
 *
 * Direction is always dependent → dependency: the source depends on the target.
 */
import type {
  ColumnNumber,
  Confidence,
  Count,
  EdgeId,
  FileId,
  LineNumber,
  NodeId,
} from "./common.js";

/**
 * Relationship kinds. Values prefixed with `x-` are reserved for plugins. The listed endpoints are typical;
 * in documents whose `detail.relationships` is `file`, symbol endpoints are lifted to their files.
 * - `imports`: a file imports a module (file → file | external).
 * - `re-exports`: a file re-exports from a module (file → file | external).
 * - `calls`: code invokes a function or method (symbol | file → symbol | external).
 * - `instantiates`: code creates an instance of a class or struct (symbol | file → symbol | external).
 * - `extends`: inheritance or embedding (symbol → symbol | external).
 * - `implements`: a type implements an interface or trait (symbol → symbol | external).
 * - `references-type`: a type position names a type (symbol | file → symbol | external).
 * - `uses`: any other value reference, e.g. reading a constant or rendering a JSX component.
 * - `decorated-by`: a declaration is decorated or annotated by the target (symbol → symbol | external).
 * - `depends-on-package`: a manifest declares a dependency (package → package | external).
 * - `reads-configuration`: code reads configuration, e.g. an environment variable (→ external).
 * - `calls-service`: code calls a remote service, e.g. an HTTP API (→ external).
 * - `accesses-data`: code accesses a datastore or a persistence model (→ external | symbol).
 */
export type EdgeKind =
  | "imports"
  | "re-exports"
  | "calls"
  | "instantiates"
  | "extends"
  | "implements"
  | "references-type"
  | "uses"
  | "decorated-by"
  | "depends-on-package"
  | "reads-configuration"
  | "calls-service"
  | "accesses-data"
  | `x-${string}`;

/**
 * The syntactic construct that expresses a relationship. Values prefixed with `x-` are reserved for plugins.
 */
export type EdgeMechanism =
  | "import-declaration"
  | "side-effect-import"
  | "dynamic-import"
  | "require-call"
  | "import-equals"
  | "export-from"
  | "export-all"
  | "triple-slash-reference"
  | "type-import"
  | "call-expression"
  | "new-expression"
  | "tagged-template"
  | "extends-clause"
  | "implements-clause"
  | "type-annotation"
  | "jsx-element"
  | "decorator"
  | "value-reference"
  | "manifest-dependency"
  | "environment-read"
  | "http-request"
  | "data-access"
  | "framework-convention"
  | `x-${string}`;

/**
 * How the target of a relationship was determined. Values prefixed with `x-` are reserved for plugins.
 * - `relative-path`: a relative or absolute path specifier.
 * - `tsconfig-paths`: a `paths` mapping from a tsconfig. `base-url`: resolved against a tsconfig `baseUrl`.
 * - `package-imports`: a `#subpath` from the `imports` field of package.json.
 * - `workspace-package`: a bare specifier naming a package of the same repository.
 * - `package-self-reference`: a package importing itself by name.
 * - `external-package`: a bare specifier naming a third-party package.
 * - `builtin-module`: a platform built-in (e.g. `node:fs`).
 * - `ambient-module`: a `declare module "x"` declaration.
 * - `local-declaration`: an identifier bound to a declaration in the same file.
 * - `import-binding`: an identifier bound by an import, followed to the exporting declaration.
 * - `namespace-member`: a member access on a namespace import or namespace declaration.
 * - `re-export-chain`: followed through one or more `export ... from` statements (see `Provenance.via`).
 * - `global-scope`: an unbound identifier found among global declarations of other files.
 * - `package-scope`: an unbound identifier found in the same language-level package (e.g. Go, Java).
 * - `declared-type`: a member access on a value whose declared type names a class or interface.
 * - `constructor-type`: a member access on a value created with `new` / a constructor.
 * - `return-type`: a member access on the result of a call whose declared return type is known.
 * - `inherited-member`: a member found on a base type.
 * - `manifest`: declared in a package manifest.
 * - `framework-convention`: established by a framework detector (e.g. dependency injection).
 */
export type ResolutionMethod =
  | "relative-path"
  | "tsconfig-paths"
  | "base-url"
  | "package-imports"
  | "workspace-package"
  | "package-self-reference"
  | "external-package"
  | "builtin-module"
  | "ambient-module"
  | "local-declaration"
  | "import-binding"
  | "namespace-member"
  | "re-export-chain"
  | "global-scope"
  | "package-scope"
  | "declared-type"
  | "constructor-type"
  | "return-type"
  | "inherited-member"
  | "manifest"
  | "framework-convention"
  | `x-${string}`;

/** Number of relationships per kind; kinds with none are omitted. Keys are serialized sorted. */
export type EdgeKindCounts = Partial<Record<EdgeKind, Count>>;

export interface EdgeEntity {
  /** `edge:` + the first 16 hex digits of SHA-256 of `"<kind>\n<source>\n<target>"`. See docs/IR.md. */
  id: EdgeId;
  kind: EdgeKind;
  source: NodeId;
  target: NodeId;
  /** Total number of observations of this relationship (independent of how many are listed). */
  observations: Count;
  /** True when every observation is in a type-only position (no use as a value). */
  typeOnly: boolean;
  /** Confidence that the relationship exists: the maximum confidence over its observations. */
  confidence: Confidence;
  /**
   * Observations in canonical order (file, line, column, ...), truncated to `limits.maxProvenancePerEdge`.
   * The list is complete if and only if its length equals `observations`.
   */
  provenance: Provenance[];
}

/** One observation of a relationship. */
export interface Provenance {
  /** File containing the observation. */
  file: FileId;
  line: LineNumber;
  column: ColumnNumber;
  mechanism: EdgeMechanism;
  /** How the target was identified from the construct (the final step when several applied). */
  resolution: ResolutionMethod;
  /** Confidence that this particular observation denotes the target. */
  confidence: Confidence;
  /** The module specifier involved, for import-like mechanisms. */
  specifier?: string;
  /** True when the observation is in a type-only position. */
  typeOnly?: boolean;
  /** Re-exporting files traversed between the reference and the declaration, in order. */
  via?: FileId[];
  /** The framework detector that established the relationship, for `framework-convention`. */
  detector?: string;
  /** Additional explanation, e.g. the member path that could not be resolved further. */
  detail?: string;
}
