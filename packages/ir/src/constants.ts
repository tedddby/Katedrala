/**
 * Known values of the IR's enumerations, available at runtime (for validation, CLI help and schema
 * generation). Types marked extensible also admit `x-`-prefixed values reserved for plugins; every
 * enumeration may gain values in minor schema versions (consumers read tolerantly, see docs/IR.md).
 */
import type { SymbolCategory, SymbolKind } from "./types/structure.js";

export const EDGE_KINDS = [
  "imports",
  "re-exports",
  "calls",
  "instantiates",
  "extends",
  "implements",
  "references-type",
  "uses",
  "decorated-by",
  "depends-on-package",
  "reads-configuration",
  "calls-service",
  "accesses-data",
] as const;

export const EDGE_MECHANISMS = [
  "import-declaration",
  "side-effect-import",
  "dynamic-import",
  "require-call",
  "import-equals",
  "export-from",
  "export-all",
  "triple-slash-reference",
  "type-import",
  "call-expression",
  "new-expression",
  "tagged-template",
  "extends-clause",
  "implements-clause",
  "type-annotation",
  "jsx-element",
  "decorator",
  "value-reference",
  "manifest-dependency",
  "environment-read",
  "http-request",
  "data-access",
  "framework-convention",
] as const;

export const RESOLUTION_METHODS = [
  "relative-path",
  "tsconfig-paths",
  "base-url",
  "package-imports",
  "workspace-package",
  "package-self-reference",
  "external-package",
  "builtin-module",
  "ambient-module",
  "local-declaration",
  "import-binding",
  "namespace-member",
  "re-export-chain",
  "global-scope",
  "package-scope",
  "declared-type",
  "constructor-type",
  "return-type",
  "inherited-member",
  "manifest",
  "framework-convention",
] as const;

export const IMPORT_KINDS = [
  "static",
  "dynamic",
  "re-export",
  "side-effect",
  "include",
  "module-declaration",
] as const;

export const SYMBOL_KINDS = [
  "module",
  "namespace",
  "class",
  "struct",
  "record",
  "interface",
  "trait",
  "type-alias",
  "type",
  "enum",
  "enum-member",
  "function",
  "method",
  "constructor",
  "property",
  "field",
  "accessor",
  "event",
  "variable",
  "constant",
  "macro",
] as const;

export const SYMBOL_CATEGORIES = ["type", "callable", "value", "namespace"] as const;

/** The category of every known symbol kind. Plugins with `x-` kinds state the category explicitly. */
export const SYMBOL_KIND_CATEGORY: Readonly<Record<(typeof SYMBOL_KINDS)[number], SymbolCategory>> =
  {
    module: "namespace",
    namespace: "namespace",
    class: "type",
    struct: "type",
    record: "type",
    interface: "type",
    trait: "type",
    "type-alias": "type",
    type: "type",
    enum: "type",
    "enum-member": "value",
    function: "callable",
    method: "callable",
    constructor: "callable",
    property: "value",
    field: "value",
    accessor: "callable",
    event: "value",
    variable: "value",
    constant: "value",
    macro: "callable",
  };

/**
 * Normative precedence for symbol naming: among distinct declarations sharing a qualified name, the one whose
 * kind comes first here receives the bare identifier (`sym:<path>#<name>`); the others are disambiguated
 * (see docs/IR.md, "Symbols"). Unknown (`x-`) kinds follow, ordered by kind.
 */
export const SYMBOL_KIND_PRECEDENCE: readonly SymbolKind[] = [
  "class",
  "struct",
  "record",
  "enum",
  "function",
  "method",
  "constructor",
  "accessor",
  "property",
  "field",
  "event",
  "constant",
  "variable",
  "macro",
  "module",
  "namespace",
  "interface",
  "trait",
  "type",
  "type-alias",
  "enum-member",
];

export const SYMBOL_MODIFIERS = [
  "abstract",
  "static",
  "async",
  "generator",
  "readonly",
  "declare",
  "override",
  "optional",
  "final",
  "sealed",
  "virtual",
  "partial",
  "extension",
  "const",
  "default",
  "unsafe",
] as const;

export const VISIBILITIES = [
  "private",
  "file",
  "protected",
  "package",
  "module",
  "public",
] as const;

export const FILE_ROLES = [
  "source",
  "test",
  "declaration",
  "configuration",
  "script",
  "generated",
  "vendored",
  "documentation",
  "asset",
  "data",
  "other",
] as const;

export const ARCHITECTURAL_ROLES = [
  "http-controller",
  "route-definition",
  "middleware",
  "service",
  "repository",
  "data-model",
  "data-transfer-object",
  "module-definition",
  "external-client",
  "configuration-provider",
  "ui-component",
  "ui-page",
  "state-store",
  "utility",
] as const;

export const EXTERNAL_KINDS = [
  "package",
  "builtin",
  "environment-variable",
  "service",
  "datastore",
  "message-channel",
] as const;

/**
 * Registry of external identifier namespaces (`ext:<namespace>:<name>`). Package namespaces use the package
 * manager's distribution names. Plugins use `x-<name>` for namespaces not listed here.
 */
export const EXTERNAL_NAMESPACES = {
  npm: { kind: "package", description: "npm packages (package.json names)" },
  node: { kind: "builtin", description: "Node.js built-in modules (without the node: prefix)" },
  pypi: { kind: "package", description: "Python distributions (PyPI names)" },
  python: { kind: "builtin", description: "Python standard library modules" },
  maven: { kind: "package", description: "Maven artifacts (groupId:artifactId)" },
  jdk: { kind: "builtin", description: "Java platform modules and packages" },
  go: { kind: "package", description: "Go modules (module paths)" },
  "go-std": { kind: "builtin", description: "Go standard library packages" },
  cargo: { kind: "package", description: "Rust crates (crates.io names)" },
  "rust-std": { kind: "builtin", description: "Rust standard crates (std, core, alloc)" },
  nuget: { kind: "package", description: "NuGet packages" },
  dotnet: { kind: "builtin", description: ".NET base class library namespaces" },
  env: { kind: "environment-variable", description: "Environment variables" },
  http: { kind: "service", description: "Remote services addressed over HTTP, by host" },
  datastore: { kind: "datastore", description: "Databases and storage systems, by technology" },
} as const satisfies Record<string, { kind: (typeof EXTERNAL_KINDS)[number]; description: string }>;

export const ANOMALY_TYPES = [
  "dependency-cycle",
  "god-component",
  "hub",
  "boundary-bypass",
  "upward-dependency",
  "unstable-dependency",
  "coupled-cluster",
  "orphan",
  "zone-of-pain",
  "zone-of-uselessness",
  "undeclared-dependency",
] as const;

/** Anomaly types identified by their (source, target) pair rather than by their subject set. */
export const DIRECTIONAL_ANOMALY_TYPES = [
  "boundary-bypass",
  "upward-dependency",
  "unstable-dependency",
  "undeclared-dependency",
] as const;

export const RULE_TYPES = [
  "forbidden-dependency",
  "allowed-dependency",
  "layer-order",
  "module-isolation",
  "dependency-direction",
  "max-fan-out",
  "max-fan-in",
  "no-cycles",
  "public-api",
] as const;

export const DIAGNOSTIC_CODES = [
  "syntax-error",
  "read-failed",
  "parse-failed",
  "file-too-large",
  "unresolved-import",
  "invalid-manifest",
  "invalid-project-configuration",
  "configuration-warning",
  "duplicate-package-name",
  "symlink-skipped",
  "limit-reached",
  "approximation-used",
  "plugin-error",
] as const;

export const ANALYSIS_LEVELS = [
  "system",
  "package",
  "module",
  "layer",
  "component",
  "file",
  "symbol",
] as const;

export const SEVERITIES = ["info", "warning", "error"] as const;

export const VCS_TYPES = ["git"] as const;

export const SNAPSHOT_KINDS = ["working-tree", "git-revision", "in-memory"] as const;

export const DEPENDENCY_SCOPES = [
  "production",
  "development",
  "peer",
  "optional",
  "build",
  "provided",
] as const;

export const ENTRY_POINT_KINDS = [
  "main",
  "module",
  "exports",
  "bin",
  "types",
  "script",
  "framework",
  "configuration",
  "convention",
] as const;

export const ENDPOINT_PROTOCOLS = ["http"] as const;

export const RULE_PROBLEM_CODES = [
  "no-matching-sources",
  "no-matching-targets",
  "unknown-selector",
] as const;

/**
 * Every extensible enumeration type of the IR (by type name) with its known values. Each also admits
 * plugin-reserved `x-` values matching {@link EXTENSION_VALUE_PATTERN}.
 */
export const EXTENSIBLE_ENUMERATIONS = {
  EdgeKind: EDGE_KINDS,
  EdgeMechanism: EDGE_MECHANISMS,
  ResolutionMethod: RESOLUTION_METHODS,
  ImportKind: IMPORT_KINDS,
  SymbolKind: SYMBOL_KINDS,
  SymbolModifier: SYMBOL_MODIFIERS,
  ArchitecturalRole: ARCHITECTURAL_ROLES,
  ExternalKind: EXTERNAL_KINDS,
  AnomalyType: ANOMALY_TYPES,
  RuleType: RULE_TYPES,
  RuleProblemCode: RULE_PROBLEM_CODES,
  DiagnosticCode: DIAGNOSTIC_CODES,
  VcsType: VCS_TYPES,
  SnapshotKind: SNAPSHOT_KINDS,
  DependencyScope: DEPENDENCY_SCOPES,
  EntryPointKind: ENTRY_POINT_KINDS,
  EndpointProtocol: ENDPOINT_PROTOCOLS,
} as const;

/** Numeric rank of a severity, for comparisons (`info` = 0 < `warning` = 1 < `error` = 2). */
export function severityRank(severity: (typeof SEVERITIES)[number]): number {
  return SEVERITIES.indexOf(severity);
}

/**
 * Plugin-reserved extension values: `x-` followed by kebab-case words, e.g. `x-acme-event`. Plugins should
 * include their own name to avoid collisions.
 */
export const EXTENSION_VALUE_PATTERN = /^x-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Whether a string is a well-formed plugin-reserved extension value. */
export function isExtensionValue(value: string): value is `x-${string}` {
  return EXTENSION_VALUE_PATTERN.test(value);
}

/** The category of a symbol kind, or undefined for unknown (plugin) kinds. */
export function symbolCategoryOf(kind: string): SymbolCategory | undefined {
  return Object.hasOwn(SYMBOL_KIND_CATEGORY, kind)
    ? SYMBOL_KIND_CATEGORY[kind as (typeof SYMBOL_KINDS)[number]]
    : undefined;
}
