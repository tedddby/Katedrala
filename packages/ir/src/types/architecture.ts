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

/** A physical architectural unit: a package root or a source directory. */
export interface ComponentEntity {
  id: ComponentId;
  /** Directory name, or package name for package components. */
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

/** What an inferred module's identity and name derive from. */
export interface ModuleAnchor {
  /** The directory most member files share (see docs/ALGORITHMS.md). */
  directory: string;
  /** The common file-name stem, for modules that cut across directories (e.g. `payment`). */
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
  /** Packages owning member files, sorted. Modules may span packages. */
  packages: PackageId[];
  /** Member files, sorted. Every analyzed source file belongs to at most one module. */
  files: FileId[];
  /** Components owning at least one member file, sorted. */
  components: ComponentId[];
  /**
   * Intended public surface: entry files declared in configuration, or barrel/index files at the module's
   * anchor. Sorted.
   */
  entryPoints: FileId[];
  /** Member files that files of other modules import or re-export from (actual usage). Sorted. */
  publicApi: FileId[];
  /** Present for inferred modules. */
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
  /** Member files, sorted. */
  files: FileId[];
  /** Present for inferred layers. */
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
