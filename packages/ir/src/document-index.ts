/**
 * An in-memory index over a document: O(1) lookups, adjacency queries and finding lookups. This is the
 * supported way for consumers to navigate documents; it has no dependencies and runs in browsers.
 *
 * Documents store relationships once (in `edges`); per-entity `dependencies` / `dependents` lists of files
 * and symbols are derived here rather than duplicated in the serialized form. Adjacency lists are returned
 * in canonical edge order (source, target, kind), so code built on the index is deterministic.
 */
import type {
  ComponentEntity,
  EndpointEntity,
  LayerEntity,
  ModuleEntity,
} from "./types/architecture.js";
import type {
  ComponentId,
  DirectoryId,
  EdgeId,
  EndpointId,
  EntityId,
  ExternalId,
  FileId,
  LayerId,
  ModuleId,
  NodeId,
  PackageId,
  SymbolId,
} from "./types/common.js";
import type { ArchitectureDocument } from "./types/document.js";
import type { EdgeEntity, EdgeKind } from "./types/edges.js";
import type { Anomaly, RuleViolation } from "./types/findings.js";
import type { UnitMetrics } from "./types/metrics.js";
import type {
  DirectoryEntity,
  ExternalEntity,
  FileEntity,
  PackageEntity,
  SymbolEntity,
} from "./types/structure.js";
import { DuplicateIdError, compareEdges } from "./canonical.js";
import { compareStrings } from "./ids.js";

/** Any entity stored in a document's entity arrays. */
export type AnyEntity =
  | DirectoryEntity
  | PackageEntity
  | FileEntity
  | SymbolEntity
  | ExternalEntity
  | ComponentEntity
  | ModuleEntity
  | LayerEntity
  | EndpointEntity;

/** The parts of a document the index uses; everything beyond structure is optional (e.g. mid-pipeline). */
export type IndexableDocument = Pick<
  ArchitectureDocument,
  "directories" | "packages" | "files" | "symbols" | "externals" | "edges"
> &
  Partial<
    Pick<
      ArchitectureDocument,
      "components" | "modules" | "layers" | "endpoints" | "metrics" | "anomalies" | "violations"
    >
  >;

const NO_EDGES: readonly EdgeEntity[] = Object.freeze([]);

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}

export class DocumentIndex {
  readonly #entities = new Map<string, AnyEntity>();
  readonly #filesByPath = new Map<string, FileEntity>();
  readonly #edges = new Map<EdgeId, EdgeEntity>();
  readonly #outgoing = new Map<string, EdgeEntity[]>();
  readonly #incoming = new Map<string, EdgeEntity[]>();
  readonly #childSymbols = new Map<SymbolId, SymbolId[]>();
  readonly #moduleOfFile = new Map<FileId, ModuleId>();
  readonly #componentOfFile = new Map<FileId, ComponentId>();
  readonly #layerOfFile = new Map<FileId, LayerId>();
  readonly #endpointsByHandler = new Map<string, EndpointId[]>();
  readonly #metrics = new Map<EntityId, UnitMetrics>();
  readonly #anomaliesBySubject = new Map<string, Anomaly[]>();
  readonly #violationsByEntity = new Map<string, RuleViolation[]>();

  /** @throws {DuplicateIdError} when two entities share an identifier. */
  constructor(readonly document: IndexableDocument) {
    const add = (collection: string, entity: AnyEntity): void => {
      if (this.#entities.has(entity.id)) throw new DuplicateIdError(collection, entity.id);
      this.#entities.set(entity.id, entity);
    };
    for (const directory of document.directories) add("directories", directory);
    for (const pkg of document.packages) add("packages", pkg);
    for (const external of document.externals) add("externals", external);
    for (const file of document.files) {
      add("files", file);
      this.#filesByPath.set(file.path, file);
    }
    for (const symbol of document.symbols) {
      add("symbols", symbol);
      if (symbol.parent !== undefined) push(this.#childSymbols, symbol.parent, symbol.id);
    }
    for (const children of this.#childSymbols.values()) children.sort(compareStrings);

    for (const edge of [...document.edges].sort(compareEdges)) {
      if (this.#edges.has(edge.id)) throw new DuplicateIdError("edges", edge.id);
      this.#edges.set(edge.id, edge);
      push(this.#outgoing, edge.source, edge);
      push(this.#incoming, edge.target, edge);
    }
    for (const component of document.components ?? []) {
      add("components", component);
      for (const file of component.files) this.#componentOfFile.set(file, component.id);
    }
    for (const module of document.modules ?? []) {
      add("modules", module);
      for (const file of module.files) this.#moduleOfFile.set(file, module.id);
    }
    for (const layer of document.layers ?? []) {
      add("layers", layer);
      for (const file of layer.files) this.#layerOfFile.set(file, layer.id);
    }
    for (const endpoint of document.endpoints ?? []) {
      add("endpoints", endpoint);
      push(this.#endpointsByHandler, endpoint.handler, endpoint.id);
    }
    for (const unit of document.metrics?.units ?? []) this.#metrics.set(unit.entity, unit);
    for (const anomaly of document.anomalies ?? []) {
      for (const subject of new Set([...anomaly.subjects, anomaly.source, anomaly.target])) {
        if (subject !== undefined) push(this.#anomaliesBySubject, subject, anomaly);
      }
    }
    for (const violation of document.violations ?? []) {
      const involved = new Set<string>([violation.source, ...(violation.subjects ?? [])]);
      if (violation.target !== undefined) involved.add(violation.target);
      for (const entity of involved) push(this.#violationsByEntity, entity, violation);
    }
  }

  /** Any indexed entity by id. */
  entity(id: EntityId): AnyEntity | undefined {
    return this.#entities.get(id);
  }

  has(id: EntityId): boolean {
    return this.#entities.has(id);
  }

  directory(id: DirectoryId): DirectoryEntity | undefined {
    return this.#entities.get(id) as DirectoryEntity | undefined;
  }

  package(id: PackageId): PackageEntity | undefined {
    return this.#entities.get(id) as PackageEntity | undefined;
  }

  file(id: FileId): FileEntity | undefined {
    return this.#entities.get(id) as FileEntity | undefined;
  }

  fileByPath(path: string): FileEntity | undefined {
    return this.#filesByPath.get(path);
  }

  symbol(id: SymbolId): SymbolEntity | undefined {
    return this.#entities.get(id) as SymbolEntity | undefined;
  }

  external(id: ExternalId): ExternalEntity | undefined {
    return this.#entities.get(id) as ExternalEntity | undefined;
  }

  component(id: ComponentId): ComponentEntity | undefined {
    return this.#entities.get(id) as ComponentEntity | undefined;
  }

  module(id: ModuleId): ModuleEntity | undefined {
    return this.#entities.get(id) as ModuleEntity | undefined;
  }

  layer(id: LayerId): LayerEntity | undefined {
    return this.#entities.get(id) as LayerEntity | undefined;
  }

  endpoint(id: EndpointId): EndpointEntity | undefined {
    return this.#entities.get(id) as EndpointEntity | undefined;
  }

  edge(id: EdgeId): EdgeEntity | undefined {
    return this.#edges.get(id);
  }

  /** Edges whose source is `id` in canonical order, optionally restricted to some kinds. */
  outgoing(id: NodeId, kinds?: ReadonlySet<EdgeKind>): readonly EdgeEntity[] {
    const edges = this.#outgoing.get(id) ?? NO_EDGES;
    return kinds === undefined ? edges : edges.filter((edge) => kinds.has(edge.kind));
  }

  /** Edges whose target is `id` in canonical order, optionally restricted to some kinds. */
  incoming(id: NodeId, kinds?: ReadonlySet<EdgeKind>): readonly EdgeEntity[] {
    const edges = this.#incoming.get(id) ?? NO_EDGES;
    return kinds === undefined ? edges : edges.filter((edge) => kinds.has(edge.kind));
  }

  /** Distinct nodes `id` depends on directly, sorted. */
  dependencies(id: NodeId, kinds?: ReadonlySet<EdgeKind>): NodeId[] {
    return [...new Set(this.outgoing(id, kinds).map((edge) => edge.target))].sort(compareStrings);
  }

  /** Distinct nodes that depend on `id` directly, sorted. */
  dependents(id: NodeId, kinds?: ReadonlySet<EdgeKind>): NodeId[] {
    return [...new Set(this.incoming(id, kinds).map((edge) => edge.source))].sort(compareStrings);
  }

  /** Symbols declared in a file, in source order. */
  symbolsOf(file: FileId): SymbolEntity[] {
    const entity = this.file(file);
    if (entity === undefined) return [];
    return entity.symbols
      .map((id) => this.symbol(id))
      .filter((symbol): symbol is SymbolEntity => symbol !== undefined);
  }

  /** Direct lexical child symbols (members) of a symbol, sorted. */
  childrenOf(symbol: SymbolId): readonly SymbolId[] {
    return this.#childSymbols.get(symbol) ?? [];
  }

  /** The file a file or symbol belongs to; undefined for packages and externals. */
  fileOf(node: NodeId): FileId | undefined {
    if (node.startsWith("file:")) return node as FileId;
    if (node.startsWith("sym:")) return this.symbol(node as SymbolId)?.file;
    return undefined;
  }

  moduleOf(file: FileId): ModuleId | undefined {
    return this.#moduleOfFile.get(file);
  }

  componentOf(file: FileId): ComponentId | undefined {
    return this.#componentOfFile.get(file);
  }

  /** The layer of a file; layers partition files. */
  layerOf(file: FileId): LayerId | undefined {
    return this.#layerOfFile.get(file);
  }

  /** Endpoints handled by a file or symbol, sorted. */
  endpointsOf(handler: FileId | SymbolId): readonly EndpointId[] {
    return [...(this.#endpointsByHandler.get(handler) ?? [])].sort(compareStrings);
  }

  /** Metrics of a unit, when computed. */
  metricsOf(entity: EntityId): UnitMetrics | undefined {
    return this.#metrics.get(entity);
  }

  /** Anomalies that involve an entity directly (as subject, source or target), sorted by id. */
  anomaliesFor(entity: EntityId): Anomaly[] {
    return [...(this.#anomaliesBySubject.get(entity) ?? [])].sort((a, b) =>
      compareStrings(a.id, b.id),
    );
  }

  /** Rule violations that involve an entity directly (as source, target or subject), sorted by id. */
  violationsFor(entity: EntityId): RuleViolation[] {
    return [...(this.#violationsByEntity.get(entity) ?? [])].sort((a, b) =>
      compareStrings(a.id, b.id),
    );
  }
}
