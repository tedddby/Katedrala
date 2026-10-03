/**
 * The architecture model: a read-only view over a (possibly partial) architecture document with containment
 * helpers and memoized graph projections at every level. Inference, metrics, anomalies, rules, impact and
 * diff read documents through it.
 */
import { DocumentIndex, entityKindOf, parseSymbolId, sortById } from "@katedrala/ir";
import type {
  ArchitectureDocument,
  ComponentId,
  EntityId,
  FileEntity,
  FileId,
  FileRole,
  IndexableDocument,
  LayerId,
  ModuleId,
  SymbolId,
} from "@katedrala/ir";
import { isExternalId, isFileId, isSymbolId } from "./identifiers.js";
import { Projection } from "./projection.js";
import { normalizeProjectionSpec, projectionKey } from "./spec.js";
import type { ProjectionLevel, ProjectionSpec } from "./spec.js";

/**
 * A document a model can be built from: the structural sections (directories, packages, files, symbols,
 * externals, edges) are required; every other section is optional, so stages can build models mid-pipeline
 * (e.g. before components, modules or layers exist).
 */
export type ModelDocument = IndexableDocument & Partial<ArchitectureDocument>;

/** Number of segments of a normalized path; 0 for the analysis root. */
function pathDepth(path: string): number {
  return path === "" ? 0 : path.split("/").length;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}

/**
 * An in-memory architecture model over one document.
 *
 * Containment is read from the document and made deterministic where a malformed document is ambiguous
 * (independent of the order of the document's arrays):
 * - a file's component is the deepest component listing it in `files` (most path segments, then the
 *   smallest id);
 * - a file's module or layer is the one listing it in `files` (the smallest id when several do);
 * - a file's package is `FileEntity.package`.
 *
 * The model is a view of the document as it was when the model was built: do not mutate the document
 * afterwards (build a new model instead). Projections are memoized per normalized specification.
 */
export class ArchitectureModel {
  /** The document this model is a view of. */
  readonly document: ModelDocument;
  /** Lookups and adjacency over the document (in canonical order). */
  readonly index: DocumentIndex;

  readonly #componentOfFile = new Map<FileId, ComponentId>();
  readonly #moduleOfFile = new Map<FileId, ModuleId>();
  readonly #layerOfFile = new Map<FileId, LayerId>();
  /** Listed files of every component, module, layer and package, sorted. */
  readonly #filesOfUnit = new Map<EntityId, FileId[]>();
  /** Memoized nearest declared symbol role (`null`: none). */
  readonly #declaredRoles = new Map<SymbolId, FileRole | null>();
  readonly #projections = new Map<string, Projection>();

  private constructor(document: ModelDocument) {
    this.document = document;
    this.index = new DocumentIndex(document);

    const depthOf = new Map<ComponentId, number>();
    for (const component of sortById(document.components ?? [])) {
      const depth = pathDepth(component.path);
      depthOf.set(component.id, depth);
      for (const file of component.files) {
        const current = this.#componentOfFile.get(file);
        // Components are visited by ascending id, so on equal depth the smallest id is kept.
        if (current === undefined || depth > (depthOf.get(current) ?? 0)) {
          this.#componentOfFile.set(file, component.id);
        }
      }
    }
    for (const module of sortById(document.modules ?? [])) {
      for (const file of module.files) {
        if (!this.#moduleOfFile.has(file)) this.#moduleOfFile.set(file, module.id);
      }
    }
    for (const layer of sortById(document.layers ?? [])) {
      for (const file of layer.files) {
        if (!this.#layerOfFile.has(file)) this.#layerOfFile.set(file, layer.id);
      }
    }
    for (const file of sortById(document.files)) {
      const units = [
        this.#componentOfFile.get(file.id),
        this.#moduleOfFile.get(file.id),
        this.#layerOfFile.get(file.id),
        file.package,
      ];
      for (const unit of units) if (unit !== undefined) push(this.#filesOfUnit, unit, file.id);
    }
  }

  /**
   * Build a model over a document.
   *
   * @throws {DuplicateIdError} (from `@katedrala/ir`) when two entities or two edges share an identifier.
   */
  static from(document: ModelDocument): ArchitectureModel {
    return new ArchitectureModel(document);
  }

  /**
   * The file a file or symbol belongs to: a file is its own file; a symbol's file is read from the document,
   * or from the symbol identifier when the symbol is not listed (e.g. documents without `detail.symbols`).
   * Undefined for other entities and malformed symbol identifiers. Does not check that the file is listed.
   */
  fileOf(node: EntityId): FileId | undefined {
    if (isFileId(node)) return node;
    if (!isSymbolId(node)) return undefined;
    const symbol = this.index.symbol(node);
    if (symbol !== undefined) return symbol.file;
    const parsed = parseSymbolId(node);
    return parsed === undefined ? undefined : `file:${parsed.path}`;
  }

  /**
   * The effective role of a file or symbol: for a symbol, the role declared by the symbol itself or by its
   * nearest lexical ancestor declaring one (`SymbolEntity.role`, e.g. an in-file test module), else its
   * file's role. Undefined when the file is not listed, and for other entities.
   */
  roleOf(node: EntityId): FileRole | undefined {
    const file = this.#listedFile(node);
    if (file === undefined) return undefined;
    return (isSymbolId(node) ? this.#declaredRole(node) : undefined) ?? file.role;
  }

  /**
   * The unit an entity belongs to at a level (containment only: file roles and projection options do not
   * apply):
   * - files and symbols, when their file is listed: at `symbol` the entity itself, at `file` its file, at
   *   `component` the deepest component listing the file, at `module` / `layer` the module / layer listing
   *   the file, at `package` the file's package; undefined when the file has no unit at the level;
   * - externals: themselves at every level;
   * - packages, components, modules and layers: themselves at their own level (not checked against the
   *   document), undefined at other levels;
   * - every other entity: undefined.
   */
  unitOf(entity: EntityId, level: ProjectionLevel): EntityId | undefined {
    if (isFileId(entity) || isSymbolId(entity)) {
      const file = this.#listedFile(entity);
      if (file === undefined) return undefined;
      switch (level) {
        case "symbol":
          return entity;
        case "file":
          return file.id;
        case "component":
          return this.#componentOfFile.get(file.id);
        case "module":
          return this.#moduleOfFile.get(file.id);
        case "layer":
          return this.#layerOfFile.get(file.id);
        case "package":
          return file.package;
      }
    }
    if (isExternalId(entity)) return entity;
    return entityKindOf(entity) === level ? entity : undefined;
  }

  /**
   * The listed files whose code belongs to an entity, sorted, regardless of their role: the files a
   * component owns directly (see {@link ArchitectureModel.unitOf}), the member files of a module or layer,
   * the files of a package, a listed file itself, a symbol's listed file. Empty for other entities.
   */
  filesIn(unit: EntityId): FileId[] {
    if (isFileId(unit) || isSymbolId(unit)) {
      const file = this.#listedFile(unit);
      return file === undefined ? [] : [file.id];
    }
    return [...(this.#filesOfUnit.get(unit) ?? [])];
  }

  /**
   * The graph projection described by `spec` (see {@link Projection} for the lifting rules), memoized: equal
   * normalized specifications return the same instance.
   *
   * @throws {ModelError} `invalid-level` for an unknown level.
   */
  projection(spec: ProjectionSpec): Projection {
    const normalized = normalizeProjectionSpec(spec);
    const key = projectionKey(normalized);
    let projection = this.#projections.get(key);
    if (projection === undefined) {
      projection = new Projection(this, normalized);
      this.#projections.set(key, projection);
    }
    return projection;
  }

  /** The listed file entity of a file or symbol. */
  #listedFile(node: EntityId): FileEntity | undefined {
    const file = this.fileOf(node);
    return file === undefined ? undefined : this.index.file(file);
  }

  /** The role declared by a symbol or its nearest lexical ancestor declaring one. */
  #declaredRole(id: SymbolId): FileRole | undefined {
    const chain = new Set<SymbolId>();
    let role: FileRole | null = null;
    let current: SymbolId | undefined = id;
    // The chain set also guards against parent cycles in malformed documents.
    while (current !== undefined && !chain.has(current)) {
      const known = this.#declaredRoles.get(current);
      if (known !== undefined) {
        role = known;
        break;
      }
      chain.add(current);
      const symbol = this.index.symbol(current);
      if (symbol === undefined) break;
      if (symbol.role !== undefined) {
        role = symbol.role;
        break;
      }
      current = symbol.parent;
    }
    for (const member of chain) this.#declaredRoles.set(member, role);
    return role ?? undefined;
  }
}
