import { GraphError } from "@katedrala/graph";
import { componentId, fileId, symbolId } from "@katedrala/ir";
import type { EdgeEntity, EdgeKind, EntityId, FileRole, NodeId } from "@katedrala/ir";
import { describe, expect, it } from "vitest";
import { ArchitectureModel } from "./model.js";
import type { ModelDocument } from "./model.js";
import { Projection } from "./projection.js";
import type { ProjectionEdgeInfo } from "./projection.js";
import { DEFAULT_EDGE_KINDS, PROJECTION_LEVELS } from "./spec.js";
import type { ProjectionSpec } from "./spec.js";
import {
  C,
  F,
  L,
  M,
  P,
  S,
  X,
  describeProjection,
  documentOf,
  edgePairs,
  idsOf,
  makeComponent,
  makeEdge,
  makeFile,
  makeSymbol,
  shopDocument,
  shopEdges,
  shuffleDocument,
} from "./test-support.js";

const E = shopEdges();
const shop = () => ArchitectureModel.from(shopDocument());
const WITH_TESTS = new Set<FileRole>(["source", "declaration", "test"]);
const WITH_MANIFESTS = new Set<EdgeKind>([...DEFAULT_EDGE_KINDS, "depends-on-package"]);

function infoOf(projection: Projection, source: EntityId, target: EntityId) {
  return projection.edgeInfo(projection.indexOf(source), projection.indexOf(target));
}

function internalOf(projection: Projection, node: EntityId) {
  return projection.internalInfo(projection.indexOf(node));
}

/** The expected description of a projection edge made of `edges`. */
function info(
  edges: EdgeEntity[],
  observations: number,
  runtimeEdgeCount: number,
  kindCounts: ProjectionEdgeInfo["kindCounts"],
): ProjectionEdgeInfo {
  return {
    edgeCount: edges.length,
    observations,
    runtimeEdgeCount,
    kindCounts,
    edges: idsOf(...edges),
  };
}

describe("symbol level", () => {
  it("has listed symbols and files with admitted roles as nodes", () => {
    const projection = shop().projection({ level: "symbol" });
    expect(projection.nodes).toEqual([
      F.order,
      F.payment,
      F.types,
      F.app,
      F.view,
      S.orderService,
      S.place,
      S.charge,
      S.order,
      S.app,
      S.view,
    ]);
  });

  it("keeps symbol endpoints and keeps file endpoints as files", () => {
    const projection = shop().projection({ level: "symbol" });
    expect(edgePairs(projection)).toEqual([
      `${F.payment} > ${S.order}`,
      `${F.app} > ${F.order}`,
      `${S.place} > ${S.charge}`,
      `${S.place} > ${S.order}`,
      `${S.charge} > ${S.orderService}`,
      `${S.app} > ${S.orderService}`,
      `${S.app} > ${S.place}`,
      `${S.app} > ${S.view}`,
    ]);
    expect(infoOf(projection, S.app, S.place)).toEqual(info([E.appCallsPlace], 3, 1, { calls: 1 }));
    expect(infoOf(projection, F.payment, S.order)).toEqual(
      info([E.paymentReferencesOrder], 1, 0, { "references-type": 1 }),
    );
  });

  it("treats a recursive relationship as internal", () => {
    const projection = shop().projection({ level: "symbol" });
    const place = projection.indexOf(S.place);
    expect(projection.graph.hasEdge(place, place)).toBe(false);
    expect(projection.internalInfo(place)).toEqual(info([E.placeCallsPlace], 1, 1, { calls: 1 }));
    expect(internalOf(projection, S.app)).toBeUndefined();
  });

  it("admits test code only when tests are admitted", () => {
    const projection = shop().projection({ level: "symbol", fileRoles: WITH_TESTS });
    expect(projection.nodes).toContain(F.orderTest);
    expect(projection.nodes).toContain(S.suite);
    expect(infoOf(projection, S.suite, S.place)).toEqual(
      info([E.suiteCallsPlace], 4, 1, { calls: 1 }),
    );
  });

  it("never has package nodes", () => {
    const projection = shop().projection({
      level: "symbol",
      edgeKinds: WITH_MANIFESTS,
      includeExternals: true,
    });
    expect(projection.nodes.filter((node) => node.startsWith("pkg:"))).toEqual([]);
    expect(projection.nodes).toContain(X.react);
    expect(edgePairs(projection)).toContain(`${F.view} > ${X.react}`);
  });
});

describe("file level", () => {
  it("has the files with admitted roles as nodes", () => {
    const projection = shop().projection({ level: "file" });
    expect(projection.nodes).toEqual([F.order, F.payment, F.types, F.app, F.view]);
  });

  it("lifts symbols to their files and merges parallel relationships", () => {
    const projection = shop().projection({ level: "file" });
    expect(edgePairs(projection)).toEqual([
      `${F.order} > ${F.payment}`,
      `${F.order} > ${F.types}`,
      `${F.payment} > ${F.order}`,
      `${F.payment} > ${F.types}`,
      `${F.app} > ${F.order}`,
      `${F.app} > ${F.view}`,
    ]);
    expect(infoOf(projection, F.app, F.order)).toEqual(
      info([E.appImportsOrder, E.appCallsPlace, E.appInstantiatesService], 5, 3, {
        calls: 1,
        imports: 1,
        instantiates: 1,
      }),
    );
    expect(infoOf(projection, F.app, F.view)).toEqual(info([E.appUsesView], 2, 1, { uses: 1 }));
    expect(infoOf(projection, F.order, F.payment)).toEqual(
      info([E.placeCallsCharge], 2, 1, { calls: 1 }),
    );
    expect(infoOf(projection, F.order, F.types)).toEqual(
      info([E.placeReferencesOrder], 1, 0, { "references-type": 1 }),
    );
    expect(infoOf(projection, F.payment, F.order)).toEqual(
      info([E.chargeUsesService], 1, 1, { uses: 1 }),
    );
  });

  it("weighs graph edges by the sum of observations", () => {
    const projection = shop().projection({ level: "file" });
    for (const [source, target, weight] of projection.graph.edges()) {
      expect(weight).toBe(projection.edgeInfo(source, target)?.observations);
    }
    const app = projection.indexOf(F.app);
    expect(projection.graph.weight(app, projection.indexOf(F.order))).toBe(5);
  });

  it("treats relationships within a file as internal", () => {
    const projection = shop().projection({ level: "file" });
    expect(internalOf(projection, F.order)).toEqual(info([E.placeCallsPlace], 1, 1, { calls: 1 }));
    expect(internalOf(projection, F.payment)).toBeUndefined();
  });

  it("lists kind counts with sorted keys", () => {
    const projection = shop().projection({ level: "file" });
    expect(Object.keys(infoOf(projection, F.app, F.order)?.kindCounts ?? {})).toEqual([
      "calls",
      "imports",
      "instantiates",
    ]);
  });
});

describe("component level", () => {
  it("lifts files to the component owning them; components without admitted files are not nodes", () => {
    const projection = shop().projection({ level: "component" });
    expect(projection.nodes).toEqual([C.apiSrc, C.webSrc]);
    expect(edgePairs(projection)).toEqual([`${C.webSrc} > ${C.apiSrc}`]);
    expect(infoOf(projection, C.webSrc, C.apiSrc)).toEqual(
      info([E.appImportsOrder, E.appCallsPlace, E.appInstantiatesService], 5, 3, {
        calls: 1,
        imports: 1,
        instantiates: 1,
      }),
    );
  });

  it("summarizes relationships between a component's own files as internal", () => {
    const projection = shop().projection({ level: "component" });
    expect(internalOf(projection, C.apiSrc)).toEqual(
      info(
        [
          E.placeCallsCharge,
          E.placeReferencesOrder,
          E.placeCallsPlace,
          E.paymentReferencesOrder,
          E.chargeUsesService,
        ],
        6,
        3,
        { calls: 2, "references-type": 2, uses: 1 },
      ),
    );
    expect(internalOf(projection, C.webSrc)).toEqual(info([E.appUsesView], 2, 1, { uses: 1 }));
  });

  it("includes test components when tests are admitted", () => {
    const projection = shop().projection({ level: "component", fileRoles: WITH_TESTS });
    expect(projection.nodes).toEqual([C.apiSrc, C.apiTest, C.webSrc]);
    expect(infoOf(projection, C.apiTest, C.apiSrc)).toEqual(
      info([E.suiteCallsPlace], 4, 1, { calls: 1 }),
    );
  });

  it("uses the deepest component listing a file", () => {
    const document = documentOf({
      files: [makeFile("src/a.ts"), makeFile("src/deep/b.ts"), makeFile("other.ts")],
      edges: [
        makeEdge("imports", fileId("src/a.ts"), fileId("src/deep/b.ts")),
        makeEdge("imports", fileId("src/deep/b.ts"), fileId("other.ts")),
      ],
      components: [
        makeComponent("src", ["src/a.ts", "src/deep/b.ts"]),
        makeComponent("src/deep", ["src/deep/b.ts"]),
      ],
    });
    const projection = ArchitectureModel.from(document).projection({ level: "component" });
    expect(projection.nodes).toEqual([componentId("src"), componentId("src/deep")]);
    // other.ts is in no component: the relationship towards it is dropped.
    expect(edgePairs(projection)).toEqual([`${componentId("src")} > ${componentId("src/deep")}`]);
  });
});

describe("module level", () => {
  it("lifts files to their module and drops relationships of files in no module", () => {
    const projection = shop().projection({ level: "module" });
    expect(projection.nodes).toEqual([M.orders, M.payments, M.web]);
    expect(edgePairs(projection)).toEqual([
      `${M.orders} > ${M.payments}`,
      `${M.payments} > ${M.orders}`,
      `${M.web} > ${M.orders}`,
    ]);
    // types.d.ts belongs to no module: the references to Order are dropped, not internal.
    expect(internalOf(projection, M.orders)).toEqual(info([E.placeCallsPlace], 1, 1, { calls: 1 }));
    expect(internalOf(projection, M.payments)).toBeUndefined();
    expect(internalOf(projection, M.web)).toEqual(info([E.appUsesView], 2, 1, { uses: 1 }));
  });

  it("drops relationships of admitted files that belong to no module", () => {
    const projection = shop().projection({ level: "module", fileRoles: WITH_TESTS });
    expect(projection.nodes).toEqual([M.orders, M.payments, M.web]);
    expect(edgePairs(projection)).toEqual(edgePairs(shop().projection({ level: "module" })));
  });
});

describe("layer level", () => {
  it("lifts files to their layer", () => {
    const projection = shop().projection({ level: "layer" });
    expect(projection.nodes).toEqual([L.service, L.ui]);
    expect(edgePairs(projection)).toEqual([`${L.ui} > ${L.service}`]);
    expect(internalOf(projection, L.service)).toEqual(
      info([E.placeCallsCharge, E.placeCallsPlace, E.chargeUsesService], 4, 3, {
        calls: 2,
        uses: 1,
      }),
    );
  });
});

describe("package level", () => {
  it("lifts files to their package", () => {
    const projection = shop().projection({ level: "package" });
    // The root package owns only a manifest (a configuration file): it is not a node.
    expect(projection.nodes).toEqual([P.api, P.web]);
    expect(edgePairs(projection)).toEqual([`${P.web} > ${P.api}`]);
    expect(infoOf(projection, P.web, P.api)?.edgeCount).toBe(3);
    expect(internalOf(projection, P.api)?.edgeCount).toBe(5);
  });

  it("lifts manifest declarations only when asked to, merging them with code relationships", () => {
    const projection = shop().projection({ level: "package", edgeKinds: WITH_MANIFESTS });
    expect(projection.nodes).toEqual([P.api, P.web]);
    expect(infoOf(projection, P.web, P.api)).toEqual(
      info(
        [E.appImportsOrder, E.appCallsPlace, E.appInstantiatesService, E.webDependsOnApi],
        6,
        4,
        { calls: 1, "depends-on-package": 1, imports: 1, instantiates: 1 },
      ),
    );
  });

  it("has external nodes only when externals are included", () => {
    const projection = shop().projection({
      level: "package",
      edgeKinds: WITH_MANIFESTS,
      includeExternals: true,
    });
    expect(projection.nodes).toEqual([X.fs, X.react, P.api, P.web]);
    expect(edgePairs(projection)).toEqual([
      `${P.api} > ${X.fs}`,
      `${P.web} > ${X.react}`,
      `${P.web} > ${P.api}`,
    ]);
    expect(infoOf(projection, P.web, X.react)).toEqual(
      info([E.viewImportsReact, E.webDependsOnReact], 2, 2, {
        "depends-on-package": 1,
        imports: 1,
      }),
    );
  });

  it("makes packages nodes through their admitted files", () => {
    const projection = shop().projection({
      level: "package",
      fileRoles: new Set(["configuration"]),
    });
    expect(projection.nodes).toEqual([P.root, P.api, P.web]);
    expect(projection.graph.edgeCount).toBe(0);
  });

  it("drops relationships of files without a package", () => {
    const document = documentOf({
      files: [makeFile("a.ts", { package: P.api }), makeFile("loose.ts")],
      edges: [makeEdge("imports", fileId("loose.ts"), fileId("a.ts"))],
    });
    const projection = ArchitectureModel.from(document).projection({ level: "package" });
    expect(projection.nodes).toEqual([P.api]);
    expect(projection.graph.edgeCount).toBe(0);
  });
});

describe("filters", () => {
  it("drops type-only relationships unless included", () => {
    const projection = shop().projection({ level: "file", includeTypeOnly: false });
    expect(edgePairs(projection)).toEqual([
      `${F.order} > ${F.payment}`,
      `${F.payment} > ${F.order}`,
      `${F.app} > ${F.order}`,
      `${F.app} > ${F.view}`,
    ]);
    // The declaration file is still a node, now isolated.
    expect(projection.nodes).toContain(F.types);
  });

  it("lifts only the requested relationship kinds", () => {
    const imports = shop().projection({ level: "file", edgeKinds: new Set(["imports"]) });
    expect(edgePairs(imports)).toEqual([`${F.app} > ${F.order}`]);
    expect(infoOf(imports, F.app, F.order)).toEqual(
      info([E.appImportsOrder], 1, 1, { imports: 1 }),
    );
    const calls = shop().projection({ level: "file", edgeKinds: new Set(["calls"]) });
    expect(edgePairs(calls)).toEqual([`${F.order} > ${F.payment}`, `${F.app} > ${F.order}`]);
    expect(internalOf(calls, F.order)).toEqual(info([E.placeCallsPlace], 1, 1, { calls: 1 }));
    const none = shop().projection({ level: "file", edgeKinds: new Set() });
    expect(none.graph.edgeCount).toBe(0);
    expect(none.nodes).toHaveLength(5);
  });

  it("lifts plugin relationship kinds only when listed", () => {
    const document = shopDocument();
    const event = makeEdge("x-acme-event", S.charge, S.view);
    document.edges.push(event);
    const model = ArchitectureModel.from(document);
    expect(edgePairs(model.projection({ level: "file" }))).not.toContain(
      `${F.payment} > ${F.view}`,
    );
    const projection = model.projection({ level: "file", edgeKinds: new Set(["x-acme-event"]) });
    expect(edgePairs(projection)).toEqual([`${F.payment} > ${F.view}`]);
    expect(infoOf(projection, F.payment, F.view)?.kindCounts).toEqual({ "x-acme-event": 1 });
  });

  it("drops files whose role is not admitted, with their relationships", () => {
    const projection = shop().projection({ level: "file", fileRoles: new Set(["source"]) });
    expect(projection.nodes).toEqual([F.order, F.payment, F.app, F.view]);
    expect(edgePairs(projection)).toEqual([
      `${F.order} > ${F.payment}`,
      `${F.payment} > ${F.order}`,
      `${F.app} > ${F.order}`,
      `${F.app} > ${F.view}`,
    ]);
    const tests = shop().projection({ level: "file", fileRoles: WITH_TESTS });
    expect(infoOf(tests, F.orderTest, F.order)).toEqual(
      info([E.suiteCallsPlace], 4, 1, { calls: 1 }),
    );
  });

  it("drops relationships with externals unless externals are included", () => {
    expect(
      shop()
        .projection({ level: "file" })
        .nodes.some((n) => n.startsWith("ext:")),
    ).toBe(false);
    const projection = shop().projection({ level: "file", includeExternals: true });
    expect(projection.nodes).toEqual([X.fs, X.react, F.order, F.payment, F.types, F.app, F.view]);
    expect(infoOf(projection, F.payment, X.fs)).toEqual(
      info([E.paymentImportsFs], 1, 1, { imports: 1 }),
    );
    expect(infoOf(projection, F.view, X.react)).toEqual(
      info([E.viewImportsReact], 1, 1, { imports: 1 }),
    );
  });

  it("lifts relationships whose source is an external", () => {
    const document = shopDocument();
    const callback = makeEdge("calls", X.react, S.view);
    document.edges.push(callback);
    const projection = ArchitectureModel.from(document).projection({
      level: "module",
      includeExternals: true,
    });
    expect(infoOf(projection, X.react, M.web)).toEqual(info([callback], 1, 1, { calls: 1 }));
  });
});

describe("declared symbol roles", () => {
  const lib = "src/lib.rs";
  const util = "src/util.rs";
  const integration = "tests/it.rs";
  const document = () =>
    documentOf({
      files: [makeFile(lib), makeFile(util), makeFile(integration, { role: "test" })],
      symbols: [
        makeSymbol(lib, "run"),
        makeSymbol(lib, "tests", { kind: "module", role: "test" }),
        makeSymbol(lib, "tests.check", { parent: "tests" }),
        makeSymbol(util, "util"),
        makeSymbol(integration, "helper", { role: "source" }),
      ],
      edges: [
        makeEdge("calls", symbolId(lib, "run"), symbolId(util, "util")),
        makeEdge("calls", symbolId(lib, "tests.check"), symbolId(util, "util")),
        makeEdge("calls", symbolId(lib, "tests.check"), symbolId(lib, "run")),
        makeEdge("calls", symbolId(integration, "helper"), symbolId(util, "util")),
      ],
    });

  it("exclude an in-file test module and its members like test files", () => {
    const model = ArchitectureModel.from(document());
    const symbols = model.projection({ level: "symbol" });
    expect(symbols.nodes).toEqual([
      fileId(lib),
      fileId(util),
      symbolId(lib, "run"),
      symbolId(util, "util"),
    ]);
    expect(edgePairs(symbols)).toEqual([`${symbolId(lib, "run")} > ${symbolId(util, "util")}`]);
    const files = model.projection({ level: "file" });
    expect(infoOf(files, fileId(lib), fileId(util))?.edgeCount).toBe(1);
    expect(internalOf(files, fileId(lib))).toBeUndefined();
  });

  it("are admitted with tests", () => {
    const model = ArchitectureModel.from(document());
    const files = model.projection({ level: "file", fileRoles: WITH_TESTS });
    expect(infoOf(files, fileId(lib), fileId(util))?.edgeCount).toBe(2);
    expect(internalOf(files, fileId(lib))?.edgeCount).toBe(1);
    expect(infoOf(files, fileId(integration), fileId(util))?.edgeCount).toBe(1);
  });

  it("cannot admit a symbol of a file whose role is not admitted", () => {
    const model = ArchitectureModel.from(document());
    const helper = symbolId(integration, "helper");
    expect(model.roleOf(helper)).toBe("source");
    expect(model.projection({ level: "symbol" }).indexOf(helper)).toBe(-1);
  });
});

describe("partial documents", () => {
  const partial = (edges: ModelDocument["edges"]): ModelDocument => ({
    directories: [],
    packages: [],
    externals: [],
    symbols: [],
    files: [makeFile("a.ts", { package: P.api }), makeFile("b.ts", { package: P.web })],
    edges,
  });

  it("lift unlisted symbols through their identifiers", () => {
    const model = ArchitectureModel.from(
      partial([makeEdge("calls", symbolId("a.ts", "f"), symbolId("b.ts", "g"))]),
    );
    const symbols = model.projection({ level: "symbol" });
    expect(symbols.nodes).toEqual([
      fileId("a.ts"),
      fileId("b.ts"),
      symbolId("a.ts", "f"),
      symbolId("b.ts", "g"),
    ]);
    expect(edgePairs(symbols)).toEqual([`${symbolId("a.ts", "f")} > ${symbolId("b.ts", "g")}`]);
    expect(edgePairs(model.projection({ level: "file" }))).toEqual([
      `${fileId("a.ts")} > ${fileId("b.ts")}`,
    ]);
    expect(edgePairs(model.projection({ level: "package" }))).toEqual([`${P.api} > ${P.web}`]);
  });

  it("drop relationships with unlisted files, malformed identifiers and non-code entities", () => {
    const model = ArchitectureModel.from(
      partial([
        makeEdge("calls", symbolId("a.ts", "f"), symbolId("ghost.ts", "h")),
        makeEdge("calls", symbolId("a.ts", "f"), "sym:malformed"),
        makeEdge("imports", fileId("a.ts"), fileId("ghost.ts")),
        makeEdge("imports", componentId("") as unknown as NodeId, fileId("a.ts")),
      ]),
    );
    for (const level of PROJECTION_LEVELS) {
      const projection = model.projection({ level, includeExternals: true });
      expect(projection.graph.edgeCount).toBe(0);
      expect(projection.nodes.every((node) => !node.includes("ghost"))).toBe(true);
    }
    expect(model.projection({ level: "symbol" }).nodes).toEqual([fileId("a.ts"), fileId("b.ts")]);
  });

  it("have empty projections at levels the document does not describe yet", () => {
    const model = ArchitectureModel.from(
      partial([makeEdge("imports", fileId("a.ts"), fileId("b.ts"))]),
    );
    for (const level of ["component", "module", "layer"] as const) {
      const projection = model.projection({ level });
      expect(projection.nodes).toEqual([]);
      expect(projection.graph.nodeCount).toBe(0);
    }
  });
});

describe("Projection API", () => {
  const files = () => shop().projection({ level: "file" });

  it("numbers nodes in identifier order", () => {
    const projection = files();
    projection.nodes.forEach((node, index) => {
      expect(projection.indexOf(node)).toBe(index);
    });
    expect(projection.indexOf(F.rootManifest)).toBe(-1);
    expect(projection.indexOf(X.react)).toBe(-1);
    expect(projection.graph.nodeCount).toBe(projection.nodes.length);
    expect(Object.isFrozen(projection.nodes)).toBe(true);
  });

  it("describes edges by node numbers and by out-edge index", () => {
    const projection = files();
    const { graph } = projection;
    for (let node = 0; node < graph.nodeCount; node++) {
      const start = graph.outOffsets[node] ?? 0;
      const end = graph.outOffsets[node + 1] ?? 0;
      for (let index = start; index < end; index++) {
        const target = graph.outTargets[index] ?? -1;
        expect(projection.edgeInfoAt(index)).toEqual(projection.edgeInfo(node, target));
        expect(projection.edgeInfoAt(index)?.observations).toBe(graph.outWeights[index]);
      }
    }
    for (const index of [-1, graph.edgeCount, 0.5, Number.NaN]) {
      expect(projection.edgeInfoAt(index)).toBeUndefined();
    }
  });

  it("visits the underlying edges of an out-edge in identifier order, without a summary", () => {
    for (const spec of [
      { level: "file" },
      { level: "symbol", fileRoles: WITH_TESTS },
      { level: "package", edgeKinds: WITH_MANIFESTS, includeExternals: true },
    ] satisfies ProjectionSpec[]) {
      const projection = shop().projection(spec);
      let visited = 0;
      for (let index = 0; index < projection.graph.edgeCount; index++) {
        const edges: EdgeEntity[] = [];
        projection.forEachUnderlyingEdge(index, (edge) => edges.push(edge));
        expect(edges.map((edge) => edge.id)).toEqual(projection.edgeInfoAt(index)?.edges);
        visited += edges.length;
      }
      expect(visited).toBeGreaterThan(0);
    }
    // The file-level edge app → order merges three relationships; they are the document's own objects.
    const model = shop();
    const projection = model.projection({ level: "file" });
    const index = projection.graph.edgeIndex(
      projection.indexOf(F.app),
      projection.indexOf(F.order),
    );
    const edges: EdgeEntity[] = [];
    projection.forEachUnderlyingEdge(index, (edge) => edges.push(edge));
    expect(edges.map((edge) => edge.id)).toEqual(
      idsOf(E.appImportsOrder, E.appCallsPlace, E.appInstantiatesService),
    );
    for (const edge of edges) expect(model.index.edge(edge.id)).toBe(edge);
  });

  it("visits nothing for an invalid out-edge index", () => {
    const projection = files();
    const { graph } = projection;
    for (const index of [-1, graph.edgeCount, graph.edgeCount + 1, 0.5, Number.NaN, Infinity]) {
      let calls = 0;
      projection.forEachUnderlyingEdge(index, () => calls++);
      expect(calls).toBe(0);
    }
    // A projection without edges.
    const empty = ArchitectureModel.from(documentOf({ files: [makeFile("a.ts")] })).projection({
      level: "file",
    });
    let calls = 0;
    empty.forEachUnderlyingEdge(0, () => calls++);
    expect(calls).toBe(0);
  });

  it("answers undefined for absent edges and invalid node numbers", () => {
    const projection = files();
    const app = projection.indexOf(F.app);
    const order = projection.indexOf(F.order);
    expect(projection.edgeInfo(app, order)).toBeDefined();
    expect(projection.edgeInfo(order, app)).toBeUndefined();
    expect(projection.edgeInfo(app, app)).toBeUndefined();
    for (const [source, target] of [
      [-1, order],
      [app, -1],
      [app, 99],
      [99, order],
      [0.5, order],
      [Number.NaN, order],
    ] as const) {
      expect(projection.edgeInfo(source, target)).toBeUndefined();
    }
    expect(projection.internalInfo(-1)).toBeUndefined();
    expect(projection.internalInfo(99)).toBeUndefined();
  });

  it("returns new objects that callers may modify", () => {
    const projection = files();
    const app = projection.indexOf(F.app);
    const order = projection.indexOf(F.order);
    const first = projection.edgeInfo(app, order);
    first?.edges.push(E.viewImportsReact.id);
    if (first !== undefined) first.kindCounts.calls = 99;
    expect(projection.edgeInfo(app, order)).toEqual(
      info([E.appImportsOrder, E.appCallsPlace, E.appInstantiatesService], 5, 3, {
        calls: 1,
        imports: 1,
        instantiates: 1,
      }),
    );
    const internal = projection.internalInfo(order);
    internal?.edges.pop();
    expect(projection.internalInfo(order)?.edges).toEqual([E.placeCallsPlace.id]);
  });

  it("lists direct dependencies and dependents, sorted", () => {
    const projection = files();
    expect(projection.dependencies(F.app)).toEqual([F.order, F.view]);
    expect(projection.dependents(F.order)).toEqual([F.payment, F.app]);
    expect(projection.dependents(F.types)).toEqual([F.order, F.payment]);
    expect(projection.dependencies(F.types)).toEqual([]);
    expect(projection.dependencies(F.rootManifest)).toEqual([]);
    expect(projection.dependents(X.react)).toEqual([]);
  });

  it("can be constructed directly, with the same content as the memoized projection", () => {
    const model = shop();
    const spec: ProjectionSpec = { level: "module", fileRoles: WITH_TESTS };
    const direct = new Projection(model, spec);
    expect(direct).not.toBe(model.projection(spec));
    expect(describeProjection(direct)).toEqual(describeProjection(model.projection(spec)));
  });

  it("rejects non-finite observations", () => {
    const document = shopDocument();
    document.edges.push({ ...makeEdge("uses", S.view, S.charge), observations: Number.NaN });
    expect(() => ArchitectureModel.from(document).projection({ level: "file" })).toThrow(
      GraphError,
    );
  });
});

describe("determinism", () => {
  const specs = PROJECTION_LEVELS.flatMap((level): ProjectionSpec[] => [
    { level },
    { level, fileRoles: WITH_TESTS, includeExternals: true, edgeKinds: WITH_MANIFESTS },
    { level, includeTypeOnly: false, fileRoles: new Set(["source"]) },
  ]);

  it("does not depend on the order of the document's arrays", () => {
    const reference = shop();
    const expected = specs.map((spec) => describeProjection(reference.projection(spec)));
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const model = ArchitectureModel.from(shuffleDocument(shopDocument(), seed));
      specs.forEach((spec, index) => {
        expect(describeProjection(model.projection(spec))).toEqual(expected[index]);
      });
    }
  });
});
