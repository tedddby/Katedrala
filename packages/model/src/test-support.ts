/**
 * Synthetic document builders, a reference fixture and comparison helpers for this package's tests. Not
 * exported from the package entry point.
 */
import {
  SYMBOL_KIND_CATEGORY,
  baseName,
  compareStrings,
  componentId,
  directoryId,
  edgeId,
  emptyDocument,
  externalId,
  fileId,
  layerId,
  moduleId,
  packageId,
  parentPath,
  symbolId,
} from "@katedrala/ir";
import type {
  ArchitectureDocument,
  ComponentEntity,
  DocumentLimits,
  EdgeEntity,
  EdgeId,
  EdgeKind,
  EntityId,
  ExternalEntity,
  ExternalNamespace,
  FileEntity,
  FileRole,
  LayerEntity,
  ModuleEntity,
  NodeId,
  PackageEntity,
  PackageId,
  SymbolEntity,
} from "@katedrala/ir";
import type { Projection, ProjectionEdgeInfo } from "./projection.js";

// ─── Builders ────────────────────────────────────────────────────────────────

/** Options of {@link makeFile}. */
export interface FileOptions {
  /** Default `source`. */
  role?: FileRole;
  package?: PackageId;
}

/** A parsed TypeScript file entity at `path`. */
export function makeFile(path: string, options: FileOptions = {}): FileEntity {
  const file: FileEntity = {
    id: fileId(path),
    path,
    name: baseName(path),
    directory: directoryId(parentPath(path)),
    language: "typescript",
    role: options.role ?? "source",
    size: 1,
    analysis: { status: "parsed" },
    symbols: [],
    imports: [],
    exports: [],
    tags: [],
  };
  if (options.package !== undefined) file.package = options.package;
  return file;
}

/** Options of {@link makeSymbol}. */
export interface SymbolOptions {
  /** Default `function`. */
  kind?: keyof typeof SYMBOL_KIND_CATEGORY;
  /** Qualified name of the lexical parent (in the same file). */
  parent?: string;
  /** Declared role, when it differs from the file's. */
  role?: FileRole;
}

/** A symbol declared in the file at `path`. */
export function makeSymbol(
  path: string,
  qualifiedName: string,
  options: SymbolOptions = {},
): SymbolEntity {
  const kind = options.kind ?? "function";
  const symbol: SymbolEntity = {
    id: symbolId(path, qualifiedName),
    name: qualifiedName.split(".").pop() ?? qualifiedName,
    qualifiedName,
    kind,
    category: SYMBOL_KIND_CATEGORY[kind],
    file: fileId(path),
    range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
    exported: true,
  };
  if (options.parent !== undefined) symbol.parent = symbolId(path, options.parent);
  if (options.role !== undefined) symbol.role = options.role;
  return symbol;
}

/** Options of {@link makeEdge}. */
export interface EdgeOptions {
  /** Default 1. */
  observations?: number;
  /** Default false. */
  typeOnly?: boolean;
}

/** An edge with its canonical identifier and no provenance. */
export function makeEdge(
  kind: EdgeKind,
  source: NodeId,
  target: NodeId,
  options: EdgeOptions = {},
): EdgeEntity {
  return {
    id: edgeId(kind, source, target),
    kind,
    source,
    target,
    observations: options.observations ?? 1,
    typeOnly: options.typeOnly ?? false,
    confidence: 1,
    provenance: [],
  };
}

/** A directory component owning the files at `paths` directly. */
export function makeComponent(path: string, paths: readonly string[]): ComponentEntity {
  return {
    id: componentId(path),
    name: path === "" ? "root" : baseName(path),
    kind: "directory",
    path,
    packages: [],
    children: [],
    files: paths.map((file) => fileId(file)),
    totals: { files: paths.length, symbols: 0, lines: 0 },
    modules: [],
    dependencies: [],
    dependents: [],
  };
}

/** A declared module with the files at `paths`. */
export function makeModule(key: string, paths: readonly string[]): ModuleEntity {
  return {
    id: moduleId(key),
    name: key,
    origin: "declared",
    packages: [],
    files: paths.map((file) => fileId(file)),
    components: [],
    entryPoints: [],
    publicApi: [],
    dependencies: [],
    dependents: [],
  };
}

/** A declared layer with the files at `paths`. */
export function makeLayer(name: string, paths: readonly string[], rank = 0): LayerEntity {
  return {
    id: layerId(name),
    name,
    origin: "declared",
    rank,
    files: paths.map((file) => fileId(file)),
    dependencies: [],
    dependents: [],
  };
}

/** An npm package whose manifest is in the directory `path`. */
export function makePackage(path: string): PackageEntity {
  return {
    id: packageId("npm", path),
    name: path === "" ? "." : path,
    ecosystem: "npm",
    path,
    manifest: fileId(path === "" ? "package.json" : `${path}/package.json`),
    declaredDependencies: [],
    dependencies: [],
    dependents: [],
  };
}

/** An external package or built-in. */
export function makeExternal(namespace: ExternalNamespace, name: string): ExternalEntity {
  return {
    id: externalId(namespace, name),
    kind: namespace === "node" ? "builtin" : "package",
    namespace,
    name,
  };
}

/** The sections {@link documentOf} fills in. */
export interface DocumentParts {
  files?: FileEntity[];
  symbols?: SymbolEntity[];
  edges?: EdgeEntity[];
  packages?: PackageEntity[];
  externals?: ExternalEntity[];
  components?: ComponentEntity[];
  modules?: ModuleEntity[];
  layers?: LayerEntity[];
  limits?: Partial<DocumentLimits>;
}

/** A complete document (based on `emptyDocument`) with the given sections; file symbol lists are filled in. */
export function documentOf(parts: DocumentParts): ArchitectureDocument {
  const document = emptyDocument();
  const symbols = parts.symbols ?? [];
  document.files = (parts.files ?? []).map((file) => ({
    ...file,
    symbols: symbols.filter((symbol) => symbol.file === file.id).map((symbol) => symbol.id),
  }));
  document.symbols = symbols;
  document.edges = parts.edges ?? [];
  document.packages = parts.packages ?? [];
  document.externals = parts.externals ?? [];
  document.components = parts.components ?? [];
  document.modules = parts.modules ?? [];
  document.layers = parts.layers ?? [];
  document.limits = { ...document.limits, ...parts.limits };
  return document;
}

// ─── Reference fixture ───────────────────────────────────────────────────────

/** Packages of the shop fixture. */
export const P = {
  root: packageId("npm", ""),
  api: packageId("npm", "api"),
  web: packageId("npm", "web"),
} as const;

/** Files of the shop fixture. */
export const F = {
  rootManifest: fileId("package.json"),
  apiManifest: fileId("api/package.json"),
  order: fileId("api/src/order.ts"),
  payment: fileId("api/src/payment.ts"),
  types: fileId("api/src/types.d.ts"),
  orderTest: fileId("api/test/order.test.ts"),
  webManifest: fileId("web/package.json"),
  app: fileId("web/src/app.ts"),
  view: fileId("web/src/view.ts"),
} as const;

/** Symbols of the shop fixture. */
export const S = {
  orderService: symbolId("api/src/order.ts", "OrderService"),
  place: symbolId("api/src/order.ts", "OrderService.place"),
  charge: symbolId("api/src/payment.ts", "charge"),
  order: symbolId("api/src/types.d.ts", "Order"),
  suite: symbolId("api/test/order.test.ts", "suite"),
  app: symbolId("web/src/app.ts", "App"),
  view: symbolId("web/src/view.ts", "View"),
} as const;

/** Externals of the shop fixture. */
export const X = {
  react: externalId("npm", "react"),
  fs: externalId("node", "fs"),
} as const;

/** Components of the shop fixture. */
export const C = {
  root: componentId(""),
  api: componentId("api"),
  apiSrc: componentId("api/src"),
  apiTest: componentId("api/test"),
  web: componentId("web"),
  webSrc: componentId("web/src"),
} as const;

/** Modules of the shop fixture. */
export const M = {
  orders: moduleId("orders"),
  payments: moduleId("payments"),
  web: moduleId("web"),
} as const;

/** Layers of the shop fixture. */
export const L = {
  ui: layerId("ui"),
  service: layerId("service"),
} as const;

/** The edges of the shop fixture, by name. */
export function shopEdges() {
  return {
    appImportsOrder: makeEdge("imports", F.app, F.order),
    appCallsPlace: makeEdge("calls", S.app, S.place, { observations: 3 }),
    appInstantiatesService: makeEdge("instantiates", S.app, S.orderService),
    appUsesView: makeEdge("uses", S.app, S.view, { observations: 2 }),
    placeCallsCharge: makeEdge("calls", S.place, S.charge, { observations: 2 }),
    placeReferencesOrder: makeEdge("references-type", S.place, S.order, { typeOnly: true }),
    placeCallsPlace: makeEdge("calls", S.place, S.place),
    suiteCallsPlace: makeEdge("calls", S.suite, S.place, { observations: 4 }),
    viewImportsReact: makeEdge("imports", F.view, X.react),
    paymentImportsFs: makeEdge("imports", F.payment, X.fs),
    webDependsOnApi: makeEdge("depends-on-package", P.web, P.api),
    webDependsOnReact: makeEdge("depends-on-package", P.web, X.react),
    paymentReferencesOrder: makeEdge("references-type", F.payment, S.order, { typeOnly: true }),
    chargeUsesService: makeEdge("uses", S.charge, S.orderService),
  };
}

/** Identifiers of the given edges, sorted. */
export function idsOf(...edges: EdgeEntity[]): EdgeId[] {
  return edges.map((edge) => edge.id).sort(compareStrings);
}

/**
 * A small two-package repository:
 *
 * ```text
 * package.json                  configuration  pkg:npm:      cmp:
 * api/package.json              configuration  pkg:npm:api   cmp:api
 * api/src/order.ts              source         pkg:npm:api   cmp:api/src   mod:orders    layer:service
 * api/src/payment.ts            source         pkg:npm:api   cmp:api/src   mod:payments  layer:service
 * api/src/types.d.ts            declaration    pkg:npm:api   cmp:api/src   -             -
 * api/test/order.test.ts        test           pkg:npm:api   cmp:api/test  -             -
 * web/package.json              configuration  pkg:npm:web   cmp:web
 * web/src/app.ts                source         pkg:npm:web   cmp:web/src   mod:web       layer:ui
 * web/src/view.ts               source         pkg:npm:web   cmp:web/src   mod:web       layer:ui
 * ```
 *
 * The edges are those of {@link shopEdges}.
 */
export function shopDocument(limits: Partial<DocumentLimits> = {}): ArchitectureDocument {
  return documentOf({
    packages: [makePackage(""), makePackage("api"), makePackage("web")],
    files: [
      makeFile("package.json", { role: "configuration", package: P.root }),
      makeFile("api/package.json", { role: "configuration", package: P.api }),
      makeFile("api/src/order.ts", { package: P.api }),
      makeFile("api/src/payment.ts", { package: P.api }),
      makeFile("api/src/types.d.ts", { role: "declaration", package: P.api }),
      makeFile("api/test/order.test.ts", { role: "test", package: P.api }),
      makeFile("web/package.json", { role: "configuration", package: P.web }),
      makeFile("web/src/app.ts", { package: P.web }),
      makeFile("web/src/view.ts", { package: P.web }),
    ],
    symbols: [
      makeSymbol("api/src/order.ts", "OrderService", { kind: "class" }),
      makeSymbol("api/src/order.ts", "OrderService.place", {
        kind: "method",
        parent: "OrderService",
      }),
      makeSymbol("api/src/payment.ts", "charge"),
      makeSymbol("api/src/types.d.ts", "Order", { kind: "interface" }),
      makeSymbol("api/test/order.test.ts", "suite"),
      makeSymbol("web/src/app.ts", "App"),
      makeSymbol("web/src/view.ts", "View"),
    ],
    externals: [makeExternal("npm", "react"), makeExternal("node", "fs")],
    edges: Object.values(shopEdges()),
    components: [
      makeComponent("", ["package.json"]),
      makeComponent("api", ["api/package.json"]),
      makeComponent("api/src", ["api/src/order.ts", "api/src/payment.ts", "api/src/types.d.ts"]),
      makeComponent("api/test", ["api/test/order.test.ts"]),
      makeComponent("web", ["web/package.json"]),
      makeComponent("web/src", ["web/src/app.ts", "web/src/view.ts"]),
    ],
    modules: [
      makeModule("orders", ["api/src/order.ts"]),
      makeModule("payments", ["api/src/payment.ts"]),
      makeModule("web", ["web/src/app.ts", "web/src/view.ts"]),
    ],
    layers: [
      makeLayer("ui", ["web/src/app.ts", "web/src/view.ts"], 0),
      makeLayer("service", ["api/src/order.ts", "api/src/payment.ts"], 1),
    ],
    limits,
  });
}

// ─── Shuffling ───────────────────────────────────────────────────────────────

/** A deterministic pseudo-random generator in [0, 1) (mulberry32). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A shuffled copy (Fisher–Yates). */
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = result[i];
    const b = result[j];
    if (a === undefined || b === undefined) continue;
    result[i] = b;
    result[j] = a;
  }
  return result;
}

/** A copy of a document with every array the model reads shuffled, including unit membership lists. */
export function shuffleDocument(
  document: ArchitectureDocument,
  seed: number,
): ArchitectureDocument {
  const random = seededRandom(seed);
  return {
    ...document,
    directories: shuffled(document.directories, random),
    packages: shuffled(document.packages, random),
    files: shuffled(document.files, random),
    symbols: shuffled(document.symbols, random),
    externals: shuffled(document.externals, random),
    edges: shuffled(document.edges, random),
    components: shuffled(document.components, random).map((component) => ({
      ...component,
      files: shuffled(component.files, random),
    })),
    modules: shuffled(document.modules, random).map((module) => ({
      ...module,
      files: shuffled(module.files, random),
    })),
    layers: shuffled(document.layers, random).map((layer) => ({
      ...layer,
      files: shuffled(layer.files, random),
    })),
  };
}

// ─── Comparison ──────────────────────────────────────────────────────────────

/** A plain, comparable description of a projection edge. */
export interface DescribedEdge {
  source: EntityId;
  target: EntityId;
  weight: number;
  info: ProjectionEdgeInfo | undefined;
}

/** A plain, comparable description of everything a projection exposes. */
export interface DescribedProjection {
  nodes: EntityId[];
  edges: DescribedEdge[];
  internal: Array<{ node: EntityId; info: ProjectionEdgeInfo }>;
  csr: number[][];
}

/** Describe a projection as plain data (for deep equality across models). */
export function describeProjection(projection: Projection): DescribedProjection {
  const { graph, nodes } = projection;
  const name = (node: number): EntityId => nodes[node] ?? "file:<missing>";
  const internal: DescribedProjection["internal"] = [];
  nodes.forEach((node, index) => {
    const info = projection.internalInfo(index);
    if (info !== undefined) internal.push({ node, info });
  });
  return {
    nodes: [...nodes],
    edges: [...graph.edges()].map(([source, target, weight]) => ({
      source: name(source),
      target: name(target),
      weight,
      info: projection.edgeInfo(source, target),
    })),
    internal,
    csr: [
      graph.outOffsets,
      graph.outTargets,
      graph.outWeights,
      graph.inOffsets,
      graph.inSources,
      graph.inWeights,
    ].map((array) => [...array]),
  };
}

/** `"<source> > <target>"` for every edge of a projection, in graph order. */
export function edgePairs(projection: Projection): string[] {
  return [...projection.graph.edges()].map(
    ([source, target]) => `${projection.nodes[source] ?? "?"} > ${projection.nodes[target] ?? "?"}`,
  );
}
