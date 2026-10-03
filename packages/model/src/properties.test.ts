/**
 * Property-based tests: random small documents are projected and compared against brute-force reference
 * implementations of the lifting rules, written independently of the model.
 */
import fc from "fast-check";
import {
  compareStrings,
  componentId,
  fileId,
  layerId,
  moduleId,
  packageId,
  symbolId,
} from "@katedrala/ir";
import type {
  ArchitectureDocument,
  ComponentId,
  EdgeEntity,
  EdgeId,
  EdgeKind,
  EntityId,
  FileId,
  FileRole,
  LayerId,
  ModuleId,
  NodeId,
  PackageId,
  SymbolEntity,
  SymbolId,
} from "@katedrala/ir";
import { describe, expect, it } from "vitest";
import { AGGREGATION_LEVELS, aggregateDependencies } from "./aggregate.js";
import { ArchitectureModel } from "./model.js";
import type { Projection, ProjectionEdgeInfo } from "./projection.js";
import { PROJECTION_LEVELS, normalizeProjectionSpec } from "./spec.js";
import type { NormalizedProjectionSpec, ProjectionLevel, ProjectionSpec } from "./spec.js";
import {
  describeProjection,
  documentOf,
  edgePairs,
  makeComponent,
  makeEdge,
  makeExternal,
  makeFile,
  makeLayer,
  makeModule,
  makePackage,
  makeSymbol,
  shuffleDocument,
} from "./test-support.js";
import type { SymbolOptions } from "./test-support.js";

// ─── Random worlds ───────────────────────────────────────────────────────────

const ROLES: FileRole[] = ["source", "test", "declaration", "configuration"];
const KINDS: EdgeKind[] = [
  "imports",
  "calls",
  "references-type",
  "uses",
  "depends-on-package",
  "x-acme-event",
];
const PACKAGE_PATHS = ["", "p"];
const COMPONENT_PATHS = ["", "d0", "d1", "d0/x"];
const MODULE_KEYS = ["m1", "m0"];
const LAYER_NAMES = ["l1", "l0"];

interface RawSymbol {
  parent: number | null;
  role: FileRole | null;
  listed: boolean;
}

interface RawFile {
  role: FileRole;
  package: string | null;
  components: string[];
  modules: string[];
  layers: string[];
  symbols: RawSymbol[];
}

/**
 * An edge endpoint: mostly code of listed files (`code`), sometimes something else (`other`: an unlisted
 * file, a symbol of an unlisted file, a malformed identifier, an external or a package).
 */
interface RawEndpoint {
  pool: "code" | "other";
  index: number;
}

interface RawEdge {
  kind: EdgeKind;
  source: RawEndpoint;
  target: RawEndpoint;
  typeOnly: boolean;
  observations: number;
}

interface RawWorld {
  files: RawFile[];
  edges: RawEdge[];
}

/** `true` with weight `trueWeight` against weight `falseWeight`. */
const weightedBoolean = (trueWeight: number, falseWeight: number): fc.Arbitrary<boolean> =>
  fc.oneof(
    { weight: trueWeight, arbitrary: fc.constant(true) },
    { weight: falseWeight, arbitrary: fc.constant(false) },
  );

/** Mostly exactly one of `values`, sometimes none or two (ambiguous listings). */
const membership = (values: string[]): fc.Arbitrary<string[]> =>
  fc.oneof(
    { weight: 4, arbitrary: fc.constantFrom(...values).map((value) => [value]) },
    { weight: 1, arbitrary: fc.subarray(values, { maxLength: 2 }) },
  );

const rawSymbol = (withSymbolRoles: boolean): fc.Arbitrary<RawSymbol> =>
  fc.record({
    parent: fc.option(fc.nat({ max: 2 }), { nil: null }),
    role: withSymbolRoles
      ? fc.option(fc.constantFrom<FileRole>("test", "source"), { nil: null, freq: 3 })
      : fc.constant(null),
    listed: weightedBoolean(4, 1),
  });

const rawFile = (withSymbolRoles: boolean): fc.Arbitrary<RawFile> =>
  fc.record({
    role: fc.oneof(
      { weight: 4, arbitrary: fc.constant<FileRole>("source") },
      { weight: 3, arbitrary: fc.constantFrom(...ROLES) },
    ),
    package: fc.option(fc.constantFrom(...PACKAGE_PATHS), { nil: null, freq: 4 }),
    components: membership(COMPONENT_PATHS),
    modules: membership(MODULE_KEYS),
    layers: membership(LAYER_NAMES),
    symbols: fc.array(rawSymbol(withSymbolRoles), { maxLength: 3 }),
  });

const rawEndpoint: fc.Arbitrary<RawEndpoint> = fc.record({
  pool: fc.oneof(
    { weight: 6, arbitrary: fc.constant("code" as const) },
    { weight: 1, arbitrary: fc.constant("other" as const) },
  ),
  index: fc.nat(),
});

const rawEdge: fc.Arbitrary<RawEdge> = fc.record({
  kind: fc.constantFrom(...KINDS),
  source: rawEndpoint,
  target: rawEndpoint,
  typeOnly: weightedBoolean(1, 3),
  observations: fc.integer({ min: 0, max: 5 }),
});

const rawWorld = (withSymbolRoles = true): fc.Arbitrary<RawWorld> =>
  fc.record({
    files: fc.array(rawFile(withSymbolRoles), { minLength: 2, maxLength: 6, size: "max" }),
    edges: fc.array(rawEdge, { minLength: 1, maxLength: 40, size: "medium" }),
  });

const rawOptions = fc.record({
  edgeKinds: fc.oneof(
    { weight: 2, arbitrary: fc.constant(KINDS) },
    { weight: 2, arbitrary: fc.subarray(KINDS, { minLength: 3 }) },
    { weight: 1, arbitrary: fc.subarray(KINDS) },
  ),
  includeTypeOnly: weightedBoolean(3, 1),
  fileRoles: fc.oneof(
    { weight: 2, arbitrary: fc.constant<FileRole[]>(["declaration", "source"]) },
    { weight: 1, arbitrary: fc.constant(ROLES) },
    { weight: 2, arbitrary: fc.subarray(ROLES) },
  ),
  includeExternals: fc.boolean(),
});

const rawSpec: fc.Arbitrary<ProjectionSpec> = fc
  .tuple(fc.constantFrom(...PROJECTION_LEVELS), rawOptions)
  .map(([level, options]) => ({
    level,
    edgeKinds: new Set(options.edgeKinds),
    includeTypeOnly: options.includeTypeOnly,
    fileRoles: new Set(options.fileRoles),
    includeExternals: options.includeExternals,
  }));

/** What the generator knows about a listed file, independently of the model. */
interface FileFacts {
  role: FileRole;
  package: PackageId | undefined;
  components: ComponentId[];
  modules: ModuleId[];
  layers: LayerId[];
}

interface World {
  document: ArchitectureDocument;
  /** Listed files. */
  files: Map<FileId, FileFacts>;
  /** The file of every generated symbol, listed or not. */
  symbolFile: Map<SymbolId, FileId>;
  /** Listed symbols. */
  symbols: Map<SymbolId, SymbolEntity>;
}

function materialize(raw: RawWorld): World {
  const files = new Map<FileId, FileFacts>();
  const symbolFile = new Map<SymbolId, FileId>();
  const symbols = new Map<SymbolId, SymbolEntity>();
  const fileEntities = raw.files.map((rawFile, i) => {
    const path = `d${i % 2}/f${i}.ts`;
    const pkg = rawFile.package === null ? undefined : packageId("npm", rawFile.package);
    files.set(fileId(path), {
      role: rawFile.role,
      package: pkg,
      components: rawFile.components.map((component) => componentId(component)),
      modules: rawFile.modules.map((key) => moduleId(key)),
      layers: rawFile.layers.map((name) => layerId(name)),
    });
    const names: string[] = [];
    rawFile.symbols.forEach((rawSymbol, j) => {
      const parent =
        rawSymbol.parent !== null && rawSymbol.parent < j ? names[rawSymbol.parent] : undefined;
      const name = parent === undefined ? `s${j}` : `${parent}.s${j}`;
      names.push(name);
      const id = symbolId(path, name);
      symbolFile.set(id, fileId(path));
      if (!rawSymbol.listed) return;
      const options: SymbolOptions = {};
      if (parent !== undefined) options.parent = parent;
      if (rawSymbol.role !== null) options.role = rawSymbol.role;
      symbols.set(id, makeSymbol(path, name, options));
    });
    return makeFile(
      path,
      pkg === undefined ? { role: rawFile.role } : { role: rawFile.role, package: pkg },
    );
  });
  const listing = (select: (file: RawFile) => string[], value: string): string[] =>
    raw.files.flatMap((rawFile, i) =>
      select(rawFile).includes(value) ? [`d${i % 2}/f${i}.ts`] : [],
    );

  const externals = [makeExternal("npm", "x"), makeExternal("npm", "y")];
  const packages = PACKAGE_PATHS.map((path) => makePackage(path));
  const pools: Record<RawEndpoint["pool"], NodeId[]> = {
    code: [...files.keys(), ...symbolFile.keys()],
    other: [
      fileId("ghost.ts"),
      symbolId("ghost.ts", "g"),
      "sym:malformed",
      ...externals.map((external) => external.id),
      ...packages.map((pkg) => pkg.id),
    ],
  };
  const endpoint = ({ pool, index }: RawEndpoint): NodeId | undefined =>
    pools[pool][index % pools[pool].length];
  const edges = new Map<string, EdgeEntity>();
  for (const rawEdge of raw.edges) {
    const source = endpoint(rawEdge.source);
    const target = endpoint(rawEdge.target);
    if (source === undefined || target === undefined) continue;
    const edge = makeEdge(rawEdge.kind, source, target, {
      observations: rawEdge.observations,
      typeOnly: rawEdge.typeOnly,
    });
    if (!edges.has(edge.id)) edges.set(edge.id, edge);
  }
  const document = documentOf({
    files: fileEntities,
    symbols: [...symbols.values()],
    edges: [...edges.values()],
    packages,
    externals,
    components: COMPONENT_PATHS.map((path) =>
      makeComponent(
        path,
        listing((file) => file.components, path),
      ),
    ),
    modules: MODULE_KEYS.map((key) =>
      makeModule(
        key,
        listing((file) => file.modules, key),
      ),
    ),
    layers: LAYER_NAMES.map((name) =>
      makeLayer(
        name,
        listing((file) => file.layers, name),
      ),
    ),
  });
  return { document, files, symbolFile, symbols };
}

// ─── Brute-force reference ───────────────────────────────────────────────────

function fileOfNode(world: World, node: string): FileId | undefined {
  if (node.startsWith("file:")) return node as FileId;
  return world.symbolFile.get(node as SymbolId);
}

function declaredRole(world: World, symbol: SymbolId): FileRole | undefined {
  for (let current = world.symbols.get(symbol); current !== undefined;) {
    if (current.role !== undefined) return current.role;
    current = current.parent === undefined ? undefined : world.symbols.get(current.parent);
  }
  return undefined;
}

const depth = (id: string): number => {
  const path = id.slice("cmp:".length);
  return path === "" ? 0 : path.split("/").length;
};

function smallest<T extends string>(ids: readonly T[]): T | undefined {
  return [...ids].sort(compareStrings)[0];
}

function deepest(ids: readonly ComponentId[]): ComponentId | undefined {
  return [...ids].sort((a, b) => depth(b) - depth(a) || compareStrings(a, b))[0];
}

function referenceLift(
  world: World,
  spec: NormalizedProjectionSpec,
  node: string,
): string | undefined {
  if (node.startsWith("ext:")) return spec.includeExternals ? node : undefined;
  if (node.startsWith("pkg:")) return spec.level === "package" ? node : undefined;
  const file = fileOfNode(world, node);
  const facts = file === undefined ? undefined : world.files.get(file);
  if (file === undefined || facts === undefined || !spec.fileRoles.has(facts.role))
    return undefined;
  if (node.startsWith("sym:")) {
    const role = declaredRole(world, node as SymbolId);
    if (role !== undefined && !spec.fileRoles.has(role)) return undefined;
  }
  const units: Record<ProjectionLevel, string | undefined> = {
    symbol: node,
    file,
    component: deepest(facts.components),
    module: smallest(facts.modules),
    layer: smallest(facts.layers),
    package: facts.package,
  };
  return units[spec.level];
}

interface ReferenceProjection {
  nodes: string[];
  edges: Map<string, EdgeEntity[]>;
  internal: Map<string, EdgeEntity[]>;
}

const pairKey = (source: string, target: string): string => `${source} > ${target}`;

function referenceProjection(world: World, spec: NormalizedProjectionSpec): ReferenceProjection {
  const nodes = new Set<string>();
  const admit = (node: string) => {
    const unit = referenceLift(world, spec, node);
    if (unit !== undefined) nodes.add(unit);
  };
  for (const file of world.files.keys()) admit(file);
  if (spec.level === "symbol") for (const symbol of world.symbols.keys()) admit(symbol);
  const edges = new Map<string, EdgeEntity[]>();
  const internal = new Map<string, EdgeEntity[]>();
  for (const edge of world.document.edges) {
    if (!spec.edgeKinds.has(edge.kind) || (edge.typeOnly && !spec.includeTypeOnly)) continue;
    const source = referenceLift(world, spec, edge.source);
    const target = referenceLift(world, spec, edge.target);
    if (source === undefined || target === undefined) continue;
    nodes.add(source);
    nodes.add(target);
    const [map, key] = source === target ? [internal, source] : [edges, pairKey(source, target)];
    map.set(key, [...(map.get(key) ?? []), edge]);
  }
  return { nodes: [...nodes].sort(compareStrings), edges, internal };
}

function expectedInfo(edges: readonly EdgeEntity[]): ProjectionEdgeInfo {
  const kindCounts: Record<string, number> = {};
  for (const kind of edges.map((edge) => edge.kind).sort(compareStrings)) {
    kindCounts[kind] = (kindCounts[kind] ?? 0) + 1;
  }
  return {
    edgeCount: edges.length,
    observations: edges.reduce((sum, edge) => sum + edge.observations, 0),
    runtimeEdgeCount: edges.filter((edge) => !edge.typeOnly).length,
    kindCounts,
    edges: edges.map((edge) => edge.id).sort(compareStrings),
  };
}

function nodeInfo(projection: Projection, node: EntityId) {
  return projection.internalInfo(projection.indexOf(node));
}

/** The identifier of node `index`; throws for an invalid index. */
function nodeAt(projection: Projection, index: number): EntityId {
  const node = projection.nodes[index];
  if (node === undefined) throw new Error(`No node ${index}`);
  return node;
}

function isPackage(id: string): boolean {
  return id.startsWith("pkg:");
}

// ─── Properties ──────────────────────────────────────────────────────────────

describe("file-level projection", () => {
  it("has exactly the distinct (file of source, file of target) pairs of admitted, non-self relationships", () => {
    fc.assert(
      fc.property(rawWorld(false), rawOptions, (raw, options) => {
        const world = materialize(raw);
        const projection = ArchitectureModel.from(world.document).projection({
          level: "file",
          edgeKinds: new Set(options.edgeKinds),
          includeTypeOnly: options.includeTypeOnly,
          fileRoles: new Set(options.fileRoles),
        });
        const roles = new Set(options.fileRoles);
        const kinds = new Set(options.edgeKinds);
        const admitted = (file: FileId | undefined): file is FileId => {
          const role = file === undefined ? undefined : world.files.get(file)?.role;
          return role !== undefined && roles.has(role);
        };
        const expected = new Set<string>();
        for (const edge of world.document.edges) {
          if (!kinds.has(edge.kind) || (edge.typeOnly && !options.includeTypeOnly)) continue;
          const source = fileOfNode(world, edge.source);
          const target = fileOfNode(world, edge.target);
          if (!admitted(source) || !admitted(target) || source === target) continue;
          expected.add(pairKey(source, target));
        }
        expect(new Set(edgePairs(projection))).toEqual(expected);
        expect(edgePairs(projection)).toHaveLength(expected.size);
        expect(projection.nodes).toEqual(
          [...world.files.keys()].filter(admitted).sort(compareStrings),
        );
      }),
    );
  });
});

describe("projections at every level", () => {
  it("match a brute-force implementation of the lifting rules", () => {
    fc.assert(
      fc.property(rawWorld(), rawSpec, fc.integer(), (raw, rawSpecification, seed) => {
        const world = materialize(raw);
        const spec = normalizeProjectionSpec(rawSpecification);
        // A shuffled document makes the model see entities in arbitrary order (e.g. members before
        // their parents); the reference does not depend on order.
        const model = ArchitectureModel.from(shuffleDocument(world.document, seed));
        const projection = model.projection(spec);
        const reference = referenceProjection(world, spec);

        expect(projection.nodes).toEqual(reference.nodes);
        expect([...edgePairs(projection)].sort(compareStrings)).toEqual(
          [...reference.edges.keys()].sort(compareStrings),
        );
        for (const [source, target, weight] of projection.graph.edges()) {
          const sourceId = projection.nodes[source] ?? "";
          const targetId = projection.nodes[target] ?? "";
          const underlying = reference.edges.get(pairKey(sourceId, targetId)) ?? [];
          expect(projection.edgeInfo(source, target)).toEqual(expectedInfo(underlying));
          expect(weight).toBe(expectedInfo(underlying).observations);
          expect(source).not.toBe(target);
        }
        for (const node of projection.nodes) {
          const underlying = reference.internal.get(node);
          expect(nodeInfo(projection, node)).toEqual(
            underlying === undefined ? undefined : expectedInfo(underlying),
          );
        }
      }),
    );
  });

  it("compose: lifting the edges of a finer projection gives the edges of a coarser one", () => {
    const pairs: Array<[ProjectionLevel, ProjectionLevel]> = [
      ["symbol", "file"],
      ["file", "component"],
      ["file", "module"],
      ["file", "layer"],
      ["file", "package"],
    ];
    fc.assert(
      fc.property(
        rawWorld(),
        rawOptions,
        fc.constantFrom(...pairs),
        (raw, options, [fine, coarse]) => {
          const world = materialize(raw);
          const model = ArchitectureModel.from(world.document);
          const common = {
            edgeKinds: new Set(options.edgeKinds),
            includeTypeOnly: options.includeTypeOnly,
            fileRoles: new Set(options.fileRoles),
            includeExternals: options.includeExternals,
          };
          const finer = model.projection({ ...common, level: fine });
          const coarser = model.projection({ ...common, level: coarse });

          const expected = new Map<string, string[]>();
          for (const [source, target] of finer.graph.edges()) {
            const from = model.unitOf(nodeAt(finer, source), coarse);
            const to = model.unitOf(nodeAt(finer, target), coarse);
            if (from === undefined || to === undefined || from === to) continue;
            const key = pairKey(from, to);
            const ids = finer.edgeInfo(source, target)?.edges ?? [];
            expected.set(key, [...(expected.get(key) ?? []), ...ids].sort(compareStrings));
          }
          // Relationships of packages themselves (e.g. manifest declarations) exist only at the package
          // level; the brute-force comparison above covers them.
          const touchesPackage = (id: EdgeId): boolean => {
            const edge = model.index.edge(id);
            return edge !== undefined && (isPackage(edge.source) || isPackage(edge.target));
          };
          const actual = new Map<string, string[]>();
          for (const [source, target] of coarser.graph.edges()) {
            const ids = (coarser.edgeInfo(source, target)?.edges ?? []).filter(
              (id) => !touchesPackage(id),
            );
            if (ids.length > 0) {
              actual.set(pairKey(nodeAt(coarser, source), nodeAt(coarser, target)), ids);
            }
          }
          expect(actual).toEqual(expected);
        },
      ),
    );
  });
});

describe("aggregated dependencies", () => {
  it("mirror the projection edges in both directions", () => {
    fc.assert(
      fc.property(
        rawWorld(),
        rawOptions,
        fc.constantFrom(...AGGREGATION_LEVELS),
        fc.integer({ min: 0, max: 4 }),
        (raw, options, level, limit) => {
          const world = materialize(raw);
          world.document.limits.maxExamplesPerDependency = limit;
          const model = ArchitectureModel.from(world.document);
          const spec = {
            edgeKinds: new Set(options.edgeKinds),
            includeTypeOnly: options.includeTypeOnly,
            fileRoles: new Set(options.fileRoles),
            includeExternals: options.includeExternals,
          };
          const result = aggregateDependencies(model, level, spec);
          const projection = model.projection({ ...spec, level });
          const { document } = world;
          const units: Array<{ id: EntityId }> =
            level === "package"
              ? document.packages
              : level === "component"
                ? document.components
                : level === "module"
                  ? document.modules
                  : document.layers;
          const listed = units.map((unit) => unit.id);
          expect([...result.keys()]).toEqual(
            [...new Set([...projection.nodes, ...listed])].sort(compareStrings),
          );
          let count = 0;
          for (const [unit, { dependencies, dependents }] of result) {
            expect(dependencies.map((d) => d.entity)).toEqual(projection.dependencies(unit));
            expect(dependents.map((d) => d.entity)).toEqual(projection.dependents(unit));
            count += dependencies.length;
            for (const dependency of dependencies) {
              const info = projection.edgeInfo(
                projection.indexOf(unit),
                projection.indexOf(dependency.entity),
              );
              expect(info).toBeDefined();
              if (info === undefined) continue;
              const { edges, ...counts } = info;
              const { entity: _entity, examples, ...rest } = dependency;
              expect(rest).toEqual(counts);
              expect(examples).toHaveLength(Math.min(limit, edges.length));
              const observations = (id: EdgeId) => model.index.edge(id)?.observations ?? 0;
              const ranked = [...edges].sort(
                (a, b) => observations(b) - observations(a) || compareStrings(a, b),
              );
              expect(examples).toEqual(ranked.slice(0, limit));
              const mirrored = result
                .get(dependency.entity)
                ?.dependents.find((dependent) => dependent.entity === unit);
              expect(mirrored).toEqual({ ...dependency, entity: unit });
            }
          }
          expect(count).toBe(projection.graph.edgeCount);
        },
      ),
    );
  });
});

describe("determinism", () => {
  it("projections and aggregated dependencies do not depend on the order of the document's arrays", () => {
    fc.assert(
      fc.property(rawWorld(), rawSpec, fc.integer(), (raw, spec, seed) => {
        const world = materialize(raw);
        const original = ArchitectureModel.from(world.document);
        const shuffledModel = ArchitectureModel.from(shuffleDocument(world.document, seed));
        expect(describeProjection(shuffledModel.projection(spec))).toEqual(
          describeProjection(original.projection(spec)),
        );
        const { level: _level, ...options } = spec;
        for (const level of AGGREGATION_LEVELS) {
          expect(JSON.stringify([...aggregateDependencies(shuffledModel, level, options)])).toBe(
            JSON.stringify([...aggregateDependencies(original, level, options)]),
          );
        }
      }),
    );
  });
});
