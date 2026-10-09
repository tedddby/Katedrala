/**
 * Every type that crosses a unit boundary inside `@katedrala/inference`: the configuration as written, the
 * effective settings, the declarations the engine resolves, the shared helper types, the stage inputs and
 * results, and the evidence assembly input. Implementation modules import data types from here.
 *
 * Truth labels follow docs/ARCHITECTURE.md ("Truth levels"): components are [DERIVED]; roles, modules and
 * layers are [KATEDRALA HEURISTIC] and carry confidence and evidence. References: `§n` is a section of the
 * milestone 5 inference design and `D-nn` a decision of its implementation plan; docs/ALGORITHMS.md carries
 * both (shared definitions, components, roles, modules P0–P9, layers, evidence, configuration).
 *
 * Determinism: every collection documented as sorted is sorted by `compareStrings` (UTF-16 code units) or by
 * node number; `ReadonlySet` and `ReadonlyMap` values produced by `resolveInferenceSettings` iterate in sorted
 * key order. Consumers never rely on insertion order of other maps.
 */
import type {
  ArchitecturalRole,
  ComponentEntity,
  Diagnostic,
  DocumentLimits,
  EdgeKind,
  EntityId,
  FileId,
  FileRole,
  LayerEntity,
  ModuleAnchor,
  ModuleEntity,
  PackageId,
  RoleEntry,
} from "@katedrala/ir";
import type { Digraph } from "@katedrala/graph";
import type { ArchitectureModel, ProjectionOptions } from "@katedrala/model";

// ─── Configuration as written (snake_case, ADR-010). Validated by @katedrala/engine. ────────────────

/**
 * `modules.<name>`: a glob list (short form) or `{ files, entry }` (long form) [DERIVED: declared membership
 * is exact glob membership, §3.14]. Globs follow core's semantics (picomatch, relative to the analysis root,
 * `!pattern` excludes for the whole list) and need at least one pattern that is not an exclusion (D-71).
 */
export type DeclaredModuleConfiguration = string[] | { files: string[]; entry?: string[] };

/**
 * The `modules` section, keyed by module name (no `#` or `~`) [DERIVED]. Key order has no meaning: files
 * matched by several declared modules belong to the one whose name sorts first (D-23).
 */
export type ModulesConfiguration = Record<string, DeclaredModuleConfiguration>;

/**
 * One entry of the `layers` section: a declared layer, its member globs and an optional explicit rank
 * [DERIVED: declared layers are exact, §4.3, D-50].
 */
export interface DeclaredLayerConfiguration {
  name: string;
  files: string[];
  rank?: number;
}

/**
 * The `layers` section, outermost layer first [DERIVED]. Declaring layers disables layer inference; overlaps
 * resolve by list order (D-50).
 */
export type LayersConfiguration = DeclaredLayerConfiguration[];

/**
 * The `inference` section: the parameters and vocabularies of the [KATEDRALA HEURISTIC] stages (design §6.3,
 * docs/ALGORITHMS.md "Configuration reference"). Every key is optional; defaults are applied by
 * `resolveInferenceSettings`, never by the validators (D-61), so the canonical configuration JSON describes
 * the configuration completely. Vocabulary names are normalized as D-69 specifies.
 */
export interface InferenceConfiguration {
  /** Files with a configured architectural role (RoleEntry source `configuration`, confidence 1). */
  roles?: Partial<Record<ArchitecturalRole, string[]>>;
  components?: { file_roles?: FileRole[] };
  modules?: {
    enabled?: boolean;
    when_declared?: "infer-rest" | "none";
    file_roles?: FileRole[];
    /** A multiple of 1/1024 in [0, 1] (D-67). */
    type_only_weight?: number;
    min_edge_confidence?: number;
    max_module_files?: number;
    min_module_files?: number;
    stem_min_coverage?: number;
    utility_min_modules?: number;
    move_min_support?: number;
    move_min_weight?: number;
    max_passes?: number;
    attach_tests?: boolean;
    attach_declarations?: boolean;
    /** Added to the defaults; `!name` removes a default. Matched exactly, ASCII-lower-cased (D-07). */
    container_directories?: string[];
    /** Added to the defaults; `!name` removes a default. Matched S-stemmed (D-69). */
    shared_directories?: string[];
    /** Added to the defaults; `!name` removes a default. Matched S-stemmed (D-69). */
    generic_tokens?: string[];
  };
  layers?: {
    enabled?: boolean;
    /** Directory name → layer, merged over the defaults; `null` removes an entry. */
    directory_layers?: Record<string, string | null>;
    /** Role → layer, merged over the defaults; `null` means "no layer" (the label ⊥). */
    role_layers?: Record<string, string | null>;
    /** Naming suffix → role, merged over the defaults; `null` removes an entry. */
    naming_suffixes?: Record<string, ArchitecturalRole | null>;
    /** Replaces the default tiers; outermost tier first. */
    conventional_tiers?: string[][];
    min_label_score?: number;
    min_layer_files?: number;
    exact_order_max_layers?: number;
  };
}

/**
 * The `inference.components` section [DERIVED: components are physical units, §2], for `satisfies` checks of
 * the validators (plan 5.2).
 */
export type ComponentInferenceConfiguration = NonNullable<InferenceConfiguration["components"]>;
/**
 * The `inference.modules` section [KATEDRALA HEURISTIC parameters, §3], for `satisfies` checks of the
 * validators (plan 5.2).
 */
export type ModuleInferenceConfiguration = NonNullable<InferenceConfiguration["modules"]>;
/**
 * The `inference.layers` section [KATEDRALA HEURISTIC parameters, §4], for `satisfies` checks of the
 * validators (plan 5.2).
 */
export type LayerInferenceConfiguration = NonNullable<InferenceConfiguration["layers"]>;

// ─── Effective settings ───────────────────────────────────────────────────────────────────────────────

/**
 * The effective vocabularies [KATEDRALA HEURISTIC]: defaults (docs/ALGORITHMS.md, "Shared definitions")
 * merged with the configuration. Entries are normalized as D-69 specifies: ASCII-lower-cased, then
 * S-stemmed except containers. Every set and map iterates in sorted key order.
 */
export interface Vocabulary {
  /** Exact lower-case directory names that are containers (D-07). */
  readonly containers: ReadonlySet<string>;
  /** S-stemmed keys of shared directory names. */
  readonly shared: ReadonlySet<string>;
  /** S-stemmed directory key → layer name (§4.3). Its keys are the "layer" directory kind. */
  readonly directoryLayers: ReadonlyMap<string, string>;
  /** S-stemmed naming suffix → architectural role (§4.2). */
  readonly namingSuffixes: ReadonlyMap<string, ArchitecturalRole>;
  /**
   * Role → layer name; null = cross-cutting (the label ⊥). Roles absent from the map vote ⊥. The effective
   * map lists only roles that have a layer: a configured `null` removes the entry, which means the same.
   */
  readonly roleLayers: ReadonlyMap<ArchitecturalRole, string | null>;
  /** Layer name → the role a location vote produces (unique inverse of roleLayers, D-18). */
  readonly locationRoles: ReadonlyMap<string, ArchitecturalRole>;
  /**
   * S-stemmed generic tokens (`index`, `util`, `service`, ...): never a file stem, and never a sub-directory
   * stem of P2 (D-28). An addition to plan 3.1: D-28 tests "is not a generic token", which `nonStemTokens`
   * (generic tokens ∪ naming-suffix keys) cannot answer once a configuration adds a naming suffix that is not
   * a generic token. With the default vocabularies both sets are equal.
   */
  readonly genericTokens: ReadonlySet<string>;
  /** S-stemmed tokens that never form a file stem: generic tokens ∪ naming-suffix keys (D-09). */
  readonly nonStemTokens: ReadonlySet<string>;
  /**
   * Layer name → conventional tier, 0 = outermost; layers without a tier are absent. Tiers are numbered
   * consecutively in configuration order; only their relative order has meaning (D-52, D-53).
   */
  readonly tiers: ReadonlyMap<string, number>;
}

/**
 * How file pairs are weighted [KATEDRALA HEURISTIC] (§1.3, D-01, D-02). `typeOnlyWeight` is a multiple of
 * 1/1024, so every weight sum is exact (D-67). Shared by module inference and layer ordering (D-51).
 */
export interface EdgeWeighting {
  readonly typeOnlyWeight: number;
  readonly minEdgeConfidence: number;
}

/**
 * Effective `inference.modules` settings, defaults applied [KATEDRALA HEURISTIC parameters]. See
 * docs/ALGORITHMS.md, "Modules", and design §3 and §6.3.
 */
export interface ModuleSettings {
  readonly enabled: boolean;
  readonly whenDeclared: "infer-rest" | "none";
  /** Roles of the files that are inference nodes; iterates in sorted order. */
  readonly fileRoles: ReadonlySet<FileRole>;
  readonly maxModuleFiles: number;
  readonly minModuleFiles: number;
  readonly stemMinCoverage: number;
  readonly utilityMinModules: number;
  readonly moveMinSupport: number;
  readonly moveMinWeight: number;
  readonly maxPasses: number;
  readonly attachTests: boolean;
  readonly attachDeclarations: boolean;
  /**
   * `analysis.include_tests_in_metrics`: the metrics projection counts tests, so tests are attached by
   * strict majority only, like declarations, which it always counts (D-65). Part of the module method (D-56).
   */
  readonly testsInMetrics: boolean;
}

/**
 * Effective `inference.layers` settings, defaults applied [KATEDRALA HEURISTIC parameters]. See
 * docs/ALGORITHMS.md, "Layers", and design §4 and §6.3.
 */
export interface LayerSettings {
  readonly enabled: boolean;
  readonly minLabelScore: number;
  readonly minLayerFiles: number;
  readonly exactOrderMaxLayers: number;
}

/**
 * Everything inference reads from the configuration, defaults applied, as returned by
 * `resolveInferenceSettings` [KATEDRALA HEURISTIC parameters; component file roles are DERIVED]. Plain,
 * frozen data whose sets and maps iterate in sorted order; equal effective configurations give deep-equal
 * settings and equal method strings (D-23, D-56).
 */
export interface InferenceSettings {
  /** Roles of the files components own (and declared modules may contain, D-22); sorted iteration. */
  readonly componentFileRoles: ReadonlySet<FileRole>;
  readonly weighting: EdgeWeighting;
  readonly modules: ModuleSettings;
  readonly layers: LayerSettings;
  readonly vocabulary: Vocabulary;
  /** `InferenceInfo.method` values, with the non-default parameters that can change them (D-56). */
  readonly methods: { readonly modules: string; readonly layers: string };
}

// ─── Declarations (globs resolved to files by the engine) ─────────────────────────────────────────────

/**
 * A declared module with its globs resolved to files [DERIVED] (§3.14). Produced by the engine's
 * `resolveDeclarations` (ADR-013).
 */
export interface DeclaredModuleSpec {
  readonly name: string;
  /** Every file matched by the `files` globs, sorted. Role filtering is inference's job (D-22). */
  readonly files: readonly FileId[];
  /** Files matched by the `entry` globs, sorted; absent when `entry` is not configured. */
  readonly entry?: readonly FileId[];
}

/** A declared layer with its globs resolved to files [DERIVED] (§4.3, D-50). */
export interface DeclaredLayerSpec {
  readonly name: string;
  /** Explicit `rank`, else the position in the list. */
  readonly rank: number;
  /** Every file matched by the `files` globs, sorted. Inference keeps `source` files only (D-50). */
  readonly files: readonly FileId[];
}

/**
 * The files `inference.roles.<role>` matches, sorted [DERIVED] (§4.2). Only `source` files get the role
 * (D-17).
 */
export interface ConfiguredRoleSpec {
  readonly role: ArchitecturalRole;
  readonly files: readonly FileId[];
}

/**
 * The declarations of a configuration, resolved by the engine (`resolveDeclarations`, ADR-013) [DERIVED].
 * Its lists are sorted as documented below, so they never depend on configuration key order (D-23).
 */
export interface Declarations {
  /** Sorted by name (D-23). */
  readonly modules: readonly DeclaredModuleSpec[];
  /** Configuration order; absent = layers are inferred. */
  readonly layers?: readonly DeclaredLayerSpec[];
  /** Sorted by role. */
  readonly roles: readonly ConfiguredRoleSpec[];
  /** The configuration file when it is a file of the snapshot (location of configuration warnings). */
  readonly configurationFile?: FileId;
}

// ─── Weighted file graph (§1.3) ───────────────────────────────────────────────────────────────────────

/** What `buildWeightedFileGraph` admits [KATEDRALA HEURISTIC] (§1.3, D-01–D-04). */
export interface WeightedGraphOptions extends EdgeWeighting {
  readonly edgeKinds: ReadonlySet<EdgeKind>;
  readonly fileRoles: ReadonlySet<FileRole>;
  /** Files that are not nodes (declared-module files during module inference). */
  readonly exclude?: ReadonlySet<FileId>;
}

/**
 * The weighted file graph of §1.3 [KATEDRALA HEURISTIC]: one node per admitted file, one weighted arc per
 * ordered file pair with an admitted dependency. Observation counts are deliberately ignored.
 */
export interface WeightedFileGraph {
  /** Sorted by UTF-16 code units. */
  readonly nodes: readonly FileId[];
  /** Node number of a file; -1 when it is not a node. */
  indexOf(file: FileId): number;
  /**
   * w(u, v) > 0 in CSR form (both directions, rows ascending): 1 when some admitted edge is a runtime edge,
   * else typeOnlyWeight. Weights are dyadic (D-67), so sums and comparisons of sums are exact.
   */
  readonly graph: Digraph;
  /** Per node: distinct node targets reached by an admitted projection edge (weight 0 included)... */
  readonly admittedOutDegree: Int32Array;
  /** ...and how many of those carry the `re-exports` kind (facade test, P3). */
  readonly reexportOutDegree: Int32Array;
}

// ─── Lexical and directory helpers ────────────────────────────────────────────────────────────────────

/**
 * A name token [KATEDRALA HEURISTIC] (§1.4, D-05). text: original spelling; key: ASCII-lower-cased. Tokens
 * never contain an ASCII character other than letters and digits.
 */
export interface Token {
  readonly text: string;
  readonly key: string;
}

/**
 * A file name without its last extension, split on `.` [DERIVED] (§1.4): the head (original spelling) and the
 * qualifiers (ASCII-lower-cased), e.g. `payment.controller.ts` → head `payment`, qualifiers `[controller]`.
 */
export interface NameParts {
  readonly head: string;
  readonly qualifiers: readonly string[];
}

/**
 * A file stem [KATEDRALA HEURISTIC] (§1.4, D-06): the S-stemmed key of the head's first token and that token's
 * original spelling, which module names keep (§3.10).
 */
export interface StemToken {
  readonly stem: string;
  readonly original: string;
}

/**
 * Directory kinds [KATEDRALA HEURISTIC] (§1.4), by precedence container > layer > shared > feature (D-08).
 */
export type DirectoryKind = "container" | "layer" | "shared" | "feature";

// ─── Roles and per-file layer labels (§4.2, §4.3) ─────────────────────────────────────────────────────

/** Vote sources [KATEDRALA HEURISTIC], by precedence: configuration > detector > naming > location (§4.3). */
export type VoteSource = "configuration" | "detector" | "naming" | "location";

/**
 * The rule that produced a vote [KATEDRALA HEURISTIC]; also the `Evidence.signal` of the role entry it
 * supports (§4.2, plan 4.6). Signal ids are part of the output contract.
 */
export type RoleSignal =
  | "configured-glob"
  | "detector-role"
  | "name-qualifier"
  | "name-suffix"
  | "type-name-suffix"
  | "directory-name";

/** One layer vote of a file [KATEDRALA HEURISTIC] (§4.3, D-14). */
export interface LayerVote {
  /** null = ⊥ (a role without a layer). */
  readonly label: string | null;
  readonly confidence: number;
  readonly source: VoteSource;
  /** The RoleEntry.source: a detector id, "naming", "location" or "configuration". */
  readonly producer: string;
  /** Absent for a location vote of a directory without a role (e.g. `domain`). */
  readonly role?: ArchitecturalRole;
  readonly signal: RoleSignal;
  /** The directory, symbol or file that carries the evidence. */
  readonly subject?: EntityId;
}

/**
 * The layer label of one source file [KATEDRALA HEURISTIC]: votes combine by maximum within a source and by
 * noisy-OR across sources (D-14); exact ties go to ⊥ (D-19).
 */
export interface FileLabel {
  readonly file: FileId;
  /** Sorted by source precedence, then label, then signal. */
  readonly votes: readonly LayerVote[];
  /** The winning label when its score ≥ minLabelScore, else null. */
  readonly label: string | null;
  /** Score of the winning label, noisy-OR across sources (D-14). */
  readonly score: number;
  /** The outermost layer-kind directory below the source root (D-18). */
  readonly location?: { readonly label: string; readonly directory: string };
}

/** Input of `inferRoles` (U2) [KATEDRALA HEURISTIC] (§4.2, §4.3). */
export interface RolesInput {
  readonly model: ArchitectureModel;
  readonly settings: InferenceSettings;
  readonly configured: readonly ConfiguredRoleSpec[];
}

/**
 * Result of `inferRoles` (U2) [KATEDRALA HEURISTIC]: role entries to merge into `files`, and per-file labels
 * for U3 and U4. Iterate the maps in file id order where output depends on it.
 */
export interface RolesResult {
  /** naming, location and configuration entries per file, canonical order (role, then source). */
  readonly roles: ReadonlyMap<FileId, readonly RoleEntry[]>;
  /** Every source file with at least one vote. */
  readonly labels: ReadonlyMap<FileId, FileLabel>;
}

// ─── Stage drafts (dependency lists and cross-references are filled by infer.ts, U5) ─────────────────

/** A component before `modules`, `dependencies` and `dependents` are filled [DERIVED] (§2). */
export type ComponentDraft = Omit<ComponentEntity, "modules" | "dependencies" | "dependents">;
/**
 * A module before `components`, `dependencies` and `dependents` are filled: declared modules are exact,
 * inferred modules [KATEDRALA HEURISTIC] carry `inference` (§3).
 */
export type ModuleDraft = Omit<ModuleEntity, "components" | "dependencies" | "dependents">;
/**
 * A layer before `dependencies` and `dependents` are filled: declared layers are exact, inferred layers
 * [KATEDRALA HEURISTIC] carry `inference` (§4).
 */
export type LayerDraft = Omit<LayerEntity, "dependencies" | "dependents">;

/** Input of `inferComponents` (U2) [DERIVED] (§2). */
export interface ComponentsInput {
  readonly model: ArchitectureModel;
  readonly fileRoles: ReadonlySet<FileRole>;
  readonly repositoryName: string;
}

// ─── Module clustering (U3 → U4) ──────────────────────────────────────────────────────────────────────

/** A module inference scope [DERIVED]: a package, or "" for files without a package (P0, §3.4). */
export type ScopeId = PackageId | "";

/** One scope of module inference and its graph [DERIVED] (P0, §3.4); edges never cross scopes (D-03). */
export interface Scope {
  readonly id: ScopeId;
  /** Package path; "" without a package. */
  readonly directory: string;
  /** Declared name of the scope package. */
  readonly packageName?: string;
  /** The scope's inference nodes and the edges among them. */
  readonly graph: WeightedFileGraph;
}

/** What `clusterScope` reads besides the scope (U3) [KATEDRALA HEURISTIC] (§3.5–§3.10). */
export interface ClusteringContext {
  readonly settings: InferenceSettings;
  /** For stem names (entity rule, D-39). */
  readonly labels: ReadonlyMap<FileId, FileLabel>;
  /** Files of document.entryPoints (D-31). */
  readonly entryPoints: ReadonlySet<FileId>;
  readonly repositoryName: string;
}

/** How a cluster unit was formed (P1, P2, P4) [KATEDRALA HEURISTIC]; also the module kind of D-48. */
export type UnitKind = "root" | "feature" | "layer" | "shared" | "stem" | "split";

/** The organization style of a split directory [KATEDRALA HEURISTIC] (P2, §3.6, D-26). */
export type OrganizationStyle = "feature" | "layer" | "mixed" | "none";

/** The organization of one directory split by P1, as P2 classified it [KATEDRALA HEURISTIC]. */
export interface GroupOrganization {
  /** A directory split by P1. */
  readonly directory: string;
  readonly style: OrganizationStyle;
  readonly layerChildren: readonly string[];
  readonly featureChildren: readonly string[];
  readonly sharedChildren: readonly string[];
  /** Sorted. */
  readonly recurrentStems: readonly string[];
  /** Nodes of recurrent stems. */
  readonly coveredFiles: number;
  /** Nodes below layer children. */
  readonly layerFiles: number;
  /** Whether stem units were formed. */
  readonly stemsApplied: boolean;
}

/** One unit of a scope's clustering (P1–P6) [KATEDRALA HEURISTIC]. */
export interface ClusterUnit {
  /** inferredModuleKey(anchor), without `~inferred`. */
  readonly key: string;
  /** For pieces without a stem, `stem` is the fallback of D-34. */
  readonly anchor: ModuleAnchor;
  readonly kind: UnitKind;
  readonly name: string;
  /** Final node members (scope-local indices), ascending. */
  readonly members: Int32Array;
  /** Members after P2 and P4, before P5, ascending. */
  readonly prior: Int32Array;
  /** The split directory whose organization formed the unit. */
  readonly group?: string;
  /** P4: the directory that was split. */
  readonly oversized?: { readonly directory: string; readonly nodes: number };
  readonly destination: boolean;
}

/**
 * A file whose final unit differs from its prior unit [KATEDRALA HEURISTIC] (P5, §3.9, D-36). Sort map
 * entries by unit key before they reach an output.
 */
export interface Relocation {
  readonly node: number;
  /** Prior unit key. */
  readonly from: string;
  /** Final unit key. */
  readonly to: string;
  /** At the file's last move, per unit key. */
  readonly dependents: ReadonlyMap<string, { readonly weight: number; readonly files: number }>;
  readonly dependencies: ReadonlyMap<string, number>;
}

/**
 * The classes of P3 and what triggered each, so that U4 can word the evidence (D-66) [KATEDRALA HEURISTIC]
 * (§3.7). Arrays are indexed by scope node.
 */
export interface StructuralClasses {
  /** Per scope node: 1 = composition root. */
  readonly orchestrators: Uint8Array;
  /** Per scope node: 0 = none, 1 = entry-point rule, 2 = shape rule (the two orchestrator rules). */
  readonly orchestratorRule: Uint8Array;
  /** Shape rule: number of other units the node's non-utility dependencies reach. */
  readonly dependencyUnits: Int32Array;
  /** Final utilities (orchestrators ignored as dependents). */
  readonly utilities: Uint8Array;
  /** Utilities: number of other prior units among the node's non-orchestrator dependents. */
  readonly dependentUnits: Int32Array;
  readonly facades: Uint8Array;
}

/** The result of `clusterScope` (U3) for one scope [KATEDRALA HEURISTIC] (P1–P6, §3.5–§3.10). */
export interface ScopeClustering {
  readonly scope: Scope;
  readonly sourceRoot: string;
  /** Non-empty, sorted by key, keys unique. */
  readonly units: readonly ClusterUnit[];
  /** Scope node → index into units. */
  readonly unitOf: Int32Array;
  readonly classes: StructuralClasses;
  /** Sorted by directory. */
  readonly groups: readonly GroupOrganization[];
  /** Files whose final unit differs from their prior unit, by node. */
  readonly relocations: readonly Relocation[];
  readonly passes: number;
  /** false when P5 stopped at maxPasses with moves pending. */
  readonly converged: boolean;
}

// ─── Stage inputs and results ─────────────────────────────────────────────────────────────────────────

/** Input of `inferModules` (U4): declared modules [DERIVED] and inferred ones [KATEDRALA HEURISTIC] (§3). */
export interface ModulesInput {
  readonly model: ArchitectureModel;
  readonly settings: InferenceSettings;
  readonly declared: readonly DeclaredModuleSpec[];
  readonly labels: ReadonlyMap<FileId, FileLabel>;
  /** The metrics projection, for publicApi (D-63). The attachment policy reads settings (D-65). */
  readonly projection: ProjectionOptions;
  readonly repositoryName: string;
  readonly limits: DocumentLimits;
  readonly configurationFile?: FileId;
}

/**
 * Result of `inferModules` (U4) [KATEDRALA HEURISTIC for inferred modules]: module drafts in id order, and
 * diagnostics.
 */
export interface ModulesResult {
  readonly modules: readonly ModuleDraft[];
  readonly diagnostics: readonly Diagnostic[];
}

/** Input of `inferLayers` (U2): declared layers [DERIVED] or inferred ones [KATEDRALA HEURISTIC] (§4). */
export interface LayersInput {
  readonly model: ArchitectureModel;
  readonly settings: InferenceSettings;
  /** The metrics projection: its edge kinds are those of the layer graph. */
  readonly projection: ProjectionOptions;
  readonly labels: ReadonlyMap<FileId, FileLabel>;
  readonly declared?: readonly DeclaredLayerSpec[];
  readonly limits: DocumentLimits;
  readonly configurationFile?: FileId;
}

/**
 * Result of `inferLayers` (U2) [KATEDRALA HEURISTIC for inferred layers]: layer drafts in canonical order,
 * and diagnostics.
 */
export interface LayersResult {
  readonly layers: readonly LayerDraft[];
  readonly diagnostics: readonly Diagnostic[];
}

// ─── Evidence assembly (U1 → U2, U4) ──────────────────────────────────────────────────────────────────

/**
 * A weighted observation [KATEDRALA HEURISTIC]: contributes `weight × value` to the confidence (§5.1). The
 * weights of one kind sum to 1; the description states what was measured (D-66).
 */
export interface WeightedSignal {
  readonly signal: string;
  readonly weight: number;
  /** Absent = the signal could not be computed; it contributes 0 (D-45). */
  readonly value?: number;
  readonly description: string;
  readonly entities?: readonly EntityId[];
}

/**
 * An unweighted observation [KATEDRALA HEURISTIC] that explains a conclusion without entering its
 * confidence (§5.1). Descriptions of heuristic classes name the rule and say it is one (D-66).
 */
export interface ContextSignal {
  readonly signal: string;
  readonly description: string;
  readonly value?: number;
  readonly entities?: readonly EntityId[];
}

/**
 * Input of `inferenceInfo` (U1) [KATEDRALA HEURISTIC]: the parts of an `InferenceInfo` before ordering and
 * rounding (plan 4.6).
 */
export interface InferenceInfoInput {
  readonly method: string;
  /** Begins with "Inferred:" (D-66). */
  readonly reason: string;
  readonly weighted: readonly WeightedSignal[];
  readonly context: readonly ContextSignal[];
  /** limits.maxEvidenceEntities */
  readonly maxEntities: number;
}

// ─── Top level (U5) ───────────────────────────────────────────────────────────────────────────────────

/**
 * Input of `inferArchitecture` (U5): components [DERIVED], roles, modules and layers [KATEDRALA HEURISTIC].
 */
export interface InferenceInput {
  /** A model over the structural sections; existing units are ignored (D-20). */
  readonly model: ArchitectureModel;
  readonly settings: InferenceSettings;
  readonly declarations: Declarations;
  /** The metrics projection. Aggregated dependencies are computed on it. */
  readonly projection: ProjectionOptions;
  readonly repositoryName: string;
}

/**
 * Result of `inferArchitecture` (U5): components [DERIVED]; roles, inferred modules and inferred layers
 * [KATEDRALA HEURISTIC], each with confidence, evidence and a method string.
 */
export interface InferenceResult {
  readonly roles: ReadonlyMap<FileId, readonly RoleEntry[]>;
  /** Canonical order, dependency lists filled. */
  readonly components: ComponentEntity[];
  readonly modules: ModuleEntity[];
  readonly layers: LayerEntity[];
  readonly diagnostics: Diagnostic[];
  /**
   * A model over the structural sections plus the final units, with their dependency lists empty. Later
   * stages (M6) reuse it for unit-level projections, so the document index is not rebuilt (D-60).
   */
  readonly unitsModel: ArchitectureModel;
}
