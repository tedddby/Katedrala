/**
 * The architectural view: components (physical units), modules (logical groupings), layers (horizontal
 * roles) and endpoints (the system's externally reachable surface).
 *
 * - Components are derived deterministically from declared structure (packages and source directories).
 * - Modules are inferred logical groupings that may cut across directories (e.g. a "payments" feature spread
 *   over controllers/, services/ and repositories/), or declared in configuration. Inferred modules always
 *   carry {@link InferenceInfo}.
 * - Layers are horizontal roles with an expected dependency direction; they partition files.
 * - Endpoints are entry points into the running system detected by framework detectors (e.g. HTTP routes).
 */
import type {
  ComponentId,
  Count,
  EdgeId,
  EndpointId,
  ExternalId,
  FileId,
  InferenceInfo,
  LayerId,
  ModuleId,
  PackageId,
  SourceLocation,
  SymbolId,
} from "./common.js";
import type { EdgeKindCounts } from "./edges.js";

/**
 * An aggregated dependency between two units, derived by lifting the relationships between their files
 * (including symbol-level relationships) to the units, using the metrics projection (`metrics.projection`),
 * so that aggregated dependencies agree with unit metrics. In a `dependencies` list `entity` is the
 * depended-upon unit; in a `dependents` list it is the depending unit.
 */
export interface AggregatedDependency {
  /** The unit on the other side. */
  entity: PackageId | ComponentId | ModuleId | LayerId | ExternalId;
  /** Distinct underlying edges. */
  edgeCount: Count;
  /** Sum of the underlying edges' observations. */
  observations: Count;
  /** Underlying edges that are not type-only (0 means the dependency vanishes at runtime). */
  runtimeEdgeCount: Count;
  /** Underlying edge count per relationship kind. */
  kindCounts: EdgeKindCounts;
  /**
   * Representative underlying edges: sorted by descending observations, then id; truncated to
   * `limits.maxExamplesPerDependency`.
   */
  examples: EdgeId[];
}

export interface UnitTotals {
  files: Count;
  symbols: Count;
  lines: Count;
}

/**
 * A physical architectural unit, derived (never inferred): the analysis root, a package root, a directory
 * that directly contains code, or a directory where code branches into two or more subdirectories. Chains
 * of directories without code collapse into their deepest member (see docs/ALGORITHMS.md, "Components").
 */
export interface ComponentEntity {
  id: ComponentId;
  /**
   * Package components: the package's declared name. The analysis root of a repository without a root
   * manifest: the repository name. Other directories: the path relative to the parent component — the
   * directory name, or several segments when directories without code were collapsed (e.g.
   * `presentation/http`).
   */
  name: string;
  kind: "package" | "directory";
  /** Directory of the component ("" for the analysis root). */
  path: string;
  /** Packages declared in this directory or owning it, sorted (usually one). */
  packages: PackageId[];
  parent?: ComponentId;
  children: ComponentId[];
  /** Files owned directly by this component (not by a descendant component), sorted. */
  files: FileId[];
  /** Totals over the whole subtree (this component and all descendants). */
  totals: UnitTotals;
  /** Modules owning at least one file of the subtree, sorted. */
  modules: ModuleId[];
  /** Dependencies of directly owned files on files directly owned by other components. */
  dependencies: AggregatedDependency[];
  /** Components whose directly owned files depend on this component's directly owned files. */
  dependents: AggregatedDependency[];
}

/** What an inferred module's identity and name derive from: its prior (see docs/ALGORITHMS.md, "Modules"). */
export interface ModuleAnchor {
  /**
   * The directory of the module's prior: the directory the module was formed from, or the directory across
   * whose layer subdirectories a file-name stem recurs. It contains most member files when the module is
   * formed and is kept when files move in or out (reported as `anchor-drift` evidence), so that identities
   * are stable.
   */
  directory: string;
  /**
   * The S-stemmed first token the member file names share, ASCII letters lower-cased (e.g. `payment`), for
   * modules that cut across directories or that are pieces of an oversized directory. A piece without a
   * common stem uses the hyphen-joined tokens of its smallest member's file name (e.g. `format-date-ts`), or
   * a 16-hex-digit hash when that is taken.
   */
  stem?: string;
}

/** A logical architectural grouping of files. */
export interface ModuleEntity {
  /**
   * `mod:<configured name>` for declared modules; `mod:<anchor directory>` or
   * `mod:<anchor directory>#<stem>` for inferred modules.
   */
  id: ModuleId;
  /** Display name, e.g. `payments`. Unique among declared modules; inferred names may repeat. */
  name: string;
  /** `declared` modules come from configuration; `inferred` modules from evidence. */
  origin: "inferred" | "declared";
  /** Present for inferred modules. */
  anchor?: ModuleAnchor;
  /** Packages owning member files, sorted. Declared modules may span packages; inferred modules never do. */
  packages: PackageId[];
  /**
   * Member files, sorted. Inferred modules: the files inference assigned (by default production code) plus
   * tests and declarations attached for navigation; declarations, and tests counted in metrics, are attached
   * only by a strict majority of their dependents or dependencies (see docs/ALGORITHMS.md). Declared
   * modules: the configured matches with a role components own. Every file belongs to at most one module.
   */
  files: FileId[];
  /** Components owning at least one member file, sorted. */
  components: ComponentId[];
  /**
   * Intended public surface: entry files declared in configuration, or barrel/index files at the module's
   * anchor. Sorted.
   */
  entryPoints: FileId[];
  /**
   * Member files that files of other modules import or re-export from (actual usage). Sorted. Computed from
   * `imports` and `re-exports` edges, with the metrics projection's file roles and type-only setting;
   * attached files are never listed.
   */
  publicApi: FileId[];
  /**
   * Present for inferred modules; `method` is `katedrala/module-inference@1`, followed by the non-default
   * parameters that can change the result.
   */
  inference?: InferenceInfo;
  dependencies: AggregatedDependency[];
  dependents: AggregatedDependency[];
}

/**
 * A horizontal architectural role. Layers partition files: a file belongs to at most one layer.
 *
 * Dependencies are expected to point from a layer to layers of higher `rank` (e.g. `controller` (0) →
 * `service` (1) → `repository` (2)); a dependency toward a lower rank is an "upward" dependency.
 */
export interface LayerEntity {
  id: LayerId;
  name: string;
  origin: "inferred" | "declared";
  /** Position in the expected dependency order; 0 is the outermost/top layer. Ties are allowed. */
  rank: Count;
  /** Member files (production code), sorted. */
  files: FileId[];
  /**
   * Present for inferred layers; `method` is `katedrala/layer-inference@1`, followed by the non-default
   * parameters that can change the result.
   */
  inference?: InferenceInfo;
  dependencies: AggregatedDependency[];
  dependents: AggregatedDependency[];
}

/** Endpoint protocols. Values prefixed with `x-` are reserved for plugins. */
export type EndpointProtocol = "http" | `x-${string}`;

/** An externally reachable entry into the running system, e.g. an HTTP route. */
export interface EndpointEntity {
  /** `endpoint:` + 16 hex digits of SHA-256 of `"<protocol>\n<method>\n<path>\n<handler>"`. */
  id: EndpointId;
  protocol: EndpointProtocol;
  /** Upper-case method (e.g. `GET`), or `*` when the endpoint accepts every method. */
  method: string;
  /** Normalized path template, e.g. `/users/:id`. */
  path: string;
  /** False when part of the path (e.g. a router prefix) could not be determined statically. */
  pathComplete: boolean;
  /** The framework detector that found the endpoint, e.g. `express`. */
  framework: string;
  /** The code that handles requests. */
  handler: FileId | SymbolId;
  /** Where the endpoint is registered or declared. */
  location: SourceLocation;
  inference: InferenceInfo;
}
