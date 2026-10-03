import { compareStrings, fileId, moduleId, symbolId } from "@katedrala/ir";
import type { AggregatedDependency, EdgeEntity, EdgeKind, EntityId } from "@katedrala/ir";
import { describe, expect, it } from "vitest";
import { AGGREGATION_LEVELS, aggregateDependencies } from "./aggregate.js";
import type { AggregationLevel, UnitDependencies } from "./aggregate.js";
import { ModelError } from "./errors.js";
import { ArchitectureModel } from "./model.js";
import type { ModelDocument } from "./model.js";
import { DEFAULT_EDGE_KINDS, fromProjectionInfo, toProjectionInfo } from "./spec.js";
import type { ProjectionOptions, ProjectionSpec } from "./spec.js";
import {
  C,
  L,
  M,
  P,
  S,
  X,
  idsOf,
  makeComponent,
  makeEdge,
  makeFile,
  makeLayer,
  makeModule,
  shopDocument,
  shopEdges,
  shuffleDocument,
} from "./test-support.js";

const E = shopEdges();
const shop = () => ArchitectureModel.from(shopDocument());
const WITH_MANIFESTS = new Set<EdgeKind>([...DEFAULT_EDGE_KINDS, "depends-on-package"]);

function dependency(
  entity: AggregatedDependency["entity"],
  edges: EdgeEntity[],
  observations: number,
  runtimeEdgeCount: number,
  kindCounts: AggregatedDependency["kindCounts"],
  examples: EdgeEntity[],
): AggregatedDependency {
  return {
    entity,
    edgeCount: edges.length,
    observations,
    runtimeEdgeCount,
    kindCounts,
    examples: examples.map((edge) => edge.id),
  };
}

/** The shop's `web → orders` examples: most observed first, then by id. */
function webToOrdersExamples(): EdgeEntity[] {
  const [first, second] = [E.appImportsOrder, E.appInstantiatesService].sort((a, b) =>
    compareStrings(a.id, b.id),
  );
  return [
    E.appCallsPlace,
    ...(first === undefined ? [] : [first]),
    ...(second === undefined ? [] : [second]),
  ];
}

function entries(result: Map<EntityId, UnitDependencies>) {
  return [...result.entries()];
}

describe("aggregateDependencies", () => {
  it("aggregates module dependencies in IR form", () => {
    const result = aggregateDependencies(shop(), "module");
    expect(entries(result)).toEqual([
      [
        M.orders,
        {
          dependencies: [
            dependency(M.payments, [E.placeCallsCharge], 2, 1, { calls: 1 }, [E.placeCallsCharge]),
          ],
          dependents: [
            dependency(M.payments, [E.chargeUsesService], 1, 1, { uses: 1 }, [E.chargeUsesService]),
            dependency(
              M.web,
              [E.appImportsOrder, E.appCallsPlace, E.appInstantiatesService],
              5,
              3,
              { calls: 1, imports: 1, instantiates: 1 },
              webToOrdersExamples(),
            ),
          ],
        },
      ],
      [
        M.payments,
        {
          dependencies: [
            dependency(M.orders, [E.chargeUsesService], 1, 1, { uses: 1 }, [E.chargeUsesService]),
          ],
          dependents: [
            dependency(M.orders, [E.placeCallsCharge], 2, 1, { calls: 1 }, [E.placeCallsCharge]),
          ],
        },
      ],
      [
        M.web,
        {
          dependencies: [
            dependency(
              M.orders,
              [E.appImportsOrder, E.appCallsPlace, E.appInstantiatesService],
              5,
              3,
              { calls: 1, imports: 1, instantiates: 1 },
              webToOrdersExamples(),
            ),
          ],
          dependents: [],
        },
      ],
    ]);
  });

  it("has an entry for every listed unit of the level, in identifier order", () => {
    const result = aggregateDependencies(shop(), "component");
    expect([...result.keys()]).toEqual([C.root, C.api, C.apiSrc, C.apiTest, C.web, C.webSrc]);
    expect(result.get(C.root)).toEqual({ dependencies: [], dependents: [] });
    expect(result.get(C.apiTest)).toEqual({ dependencies: [], dependents: [] });
    expect(result.get(C.webSrc)?.dependencies.map((d) => d.entity)).toEqual([C.apiSrc]);
    expect(result.get(C.apiSrc)?.dependents.map((d) => d.entity)).toEqual([C.webSrc]);
    expect([...aggregateDependencies(shop(), "layer").keys()]).toEqual([L.service, L.ui]);
    // Package dependencies include externals by default, so the externals are units on the other side.
    expect([...aggregateDependencies(shop(), "package").keys()]).toEqual([
      X.fs,
      X.react,
      P.root,
      P.api,
      P.web,
    ]);
    expect([
      ...aggregateDependencies(shop(), "package", { includeExternals: false }).keys(),
    ]).toEqual([P.root, P.api, P.web]);
  });

  it("includes externals in package dependencies by default, as the IR's packages list them", () => {
    // PackageEntity.dependencies: "Observed code-level dependencies of the package's files on other
    // packages and externals", computed with the projection options of the metrics.
    const document: ModelDocument = {
      directories: [],
      packages: [],
      files: [makeFile("a/x.ts", { package: P.api })],
      symbols: [],
      externals: [],
      edges: [makeEdge("imports", fileId("a/x.ts"), X.react, { observations: 4 })],
      components: [makeComponent("a", ["a/x.ts"])],
      modules: [makeModule("a", ["a/x.ts"])],
      layers: [makeLayer("a", ["a/x.ts"], 0)],
    };
    const model = ArchitectureModel.from(document);
    const metrics = fromProjectionInfo(toProjectionInfo({}));
    const packages = aggregateDependencies(model, "package", metrics);
    expect(packages.get(P.api)?.dependencies.map((d) => [d.entity, d.observations])).toEqual([
      [X.react, 4],
    ]);
    expect(packages.get(X.react)?.dependents.map((d) => d.entity)).toEqual([P.api]);
    expect(aggregateDependencies(model, "package").get(P.api)?.dependencies).toHaveLength(1);
    const excluded = aggregateDependencies(model, "package", {
      ...metrics,
      includeExternals: false,
    });
    expect([...excluded.keys()]).toEqual([P.api]);
    expect(excluded.get(P.api)?.dependencies).toEqual([]);
    // A component's dependencies are on files of other components: no externals unless asked for.
    for (const level of ["component", "module", "layer"] as const) {
      const units = aggregateDependencies(model, level, metrics);
      expect([...units.values()].flatMap((unit) => unit.dependencies)).toEqual([]);
      const withExternals = aggregateDependencies(model, level, { includeExternals: true });
      expect([...withExternals.values()].flatMap((unit) => unit.dependencies)).toHaveLength(1);
    }
  });

  it("includes externals as units on the other side when asked to", () => {
    const result = aggregateDependencies(shop(), "package", {
      edgeKinds: WITH_MANIFESTS,
      includeExternals: true,
    });
    expect([...result.keys()]).toEqual([X.fs, X.react, P.root, P.api, P.web]);
    expect(result.get(P.web)?.dependencies).toEqual([
      dependency(
        X.react,
        [E.viewImportsReact, E.webDependsOnReact],
        2,
        2,
        { "depends-on-package": 1, imports: 1 },
        [E.viewImportsReact, E.webDependsOnReact].sort((a, b) => compareStrings(a.id, b.id)),
      ),
      dependency(
        P.api,
        [E.appImportsOrder, E.appCallsPlace, E.appInstantiatesService, E.webDependsOnApi],
        6,
        4,
        { calls: 1, "depends-on-package": 1, imports: 1, instantiates: 1 },
        [
          E.appCallsPlace,
          ...[E.appImportsOrder, E.appInstantiatesService, E.webDependsOnApi].sort((a, b) =>
            compareStrings(a.id, b.id),
          ),
        ],
      ),
    ]);
    expect(result.get(X.react)?.dependents.map((d) => d.entity)).toEqual([P.web]);
    expect(result.get(P.api)?.dependencies.map((d) => d.entity)).toEqual([X.fs]);
    expect(result.get(P.root)).toEqual({ dependencies: [], dependents: [] });
  });

  it("passes the projection options through", () => {
    const document = shopDocument();
    const typeOnly = makeEdge("references-type", S.view, S.order, { typeOnly: true });
    document.edges.push(typeOnly);
    const model = ArchitectureModel.from(document);
    const onApi = (result: Map<EntityId, UnitDependencies>) =>
      result.get(P.web)?.dependencies.find((dependency) => dependency.entity === P.api);
    const all = onApi(aggregateDependencies(model, "package"));
    expect(all?.edgeCount).toBe(4);
    expect(all?.runtimeEdgeCount).toBe(3);
    expect(all?.kindCounts).toEqual({
      calls: 1,
      imports: 1,
      instantiates: 1,
      "references-type": 1,
    });
    const runtime = aggregateDependencies(model, "package", { includeTypeOnly: false });
    expect(onApi(runtime)?.edgeCount).toBe(3);
    const imports = aggregateDependencies(model, "package", { edgeKinds: new Set(["imports"]) });
    expect(onApi(imports)?.examples).toEqual([E.appImportsOrder.id]);
    expect(imports.get(P.web)?.dependencies.map((d) => d.entity)).toEqual([X.react, P.api]);
  });

  it("uses the level argument, not a level among the options", () => {
    const model = shop();
    const options = { level: "file" } as ProjectionSpec as ProjectionOptions;
    expect(entries(aggregateDependencies(model, "module", options))).toEqual(
      entries(aggregateDependencies(model, "module")),
    );
  });

  it("lists kind counts with sorted keys", () => {
    const result = aggregateDependencies(shop(), "module");
    const kinds = result.get(M.web)?.dependencies[0]?.kindCounts ?? {};
    expect(Object.keys(kinds)).toEqual(["calls", "imports", "instantiates"]);
  });

  it("returns objects that share nothing", () => {
    const model = shop();
    const result = aggregateDependencies(model, "module");
    const forward = result.get(M.web)?.dependencies[0];
    const backward = result.get(M.orders)?.dependents[1];
    expect(forward).toEqual({ ...backward, entity: M.orders });
    forward?.examples.pop();
    if (forward !== undefined) forward.kindCounts.calls = 42;
    expect(backward?.examples).toHaveLength(3);
    expect(backward?.kindCounts.calls).toBe(1);
    expect(
      aggregateDependencies(model, "module").get(M.web)?.dependencies[0]?.examples,
    ).toHaveLength(3);
  });

  it("does not depend on the order of the document's arrays", () => {
    const options: ProjectionOptions[] = [
      {},
      { edgeKinds: WITH_MANIFESTS, includeExternals: true },
      { fileRoles: new Set(["source", "test"]), includeTypeOnly: false },
    ];
    for (const level of AGGREGATION_LEVELS) {
      for (const option of options) {
        const expected = JSON.stringify(entries(aggregateDependencies(shop(), level, option)));
        for (const seed of [21, 22, 23, 24]) {
          const model = ArchitectureModel.from(shuffleDocument(shopDocument(), seed));
          expect(JSON.stringify(entries(aggregateDependencies(model, level, option)))).toBe(
            expected,
          );
        }
      }
    }
  });

  it("rejects levels without aggregated dependencies", () => {
    for (const level of ["file", "symbol", "system"]) {
      const attempt = () => aggregateDependencies(shop(), level as AggregationLevel);
      expect(attempt).toThrow(ModelError);
      expect(attempt).toThrow(/not at "/);
    }
  });

  it("works on partial documents without units of the level", () => {
    const partial: ModelDocument = {
      directories: [],
      packages: [],
      files: [makeFile("a.ts", { package: P.api }), makeFile("b.ts", { package: P.web })],
      symbols: [],
      externals: [],
      edges: [makeEdge("imports", fileId("a.ts"), fileId("b.ts"))],
    };
    const model = ArchitectureModel.from(partial);
    for (const level of ["component", "module", "layer"] as const) {
      expect(aggregateDependencies(model, level).size).toBe(0);
    }
    // Packages referenced by files are units even when the document does not list them.
    const packages = aggregateDependencies(model, "package");
    expect([...packages.keys()]).toEqual([P.api, P.web]);
    expect(packages.get(P.api)?.dependencies.map((d) => d.entity)).toEqual([P.web]);
  });
});

describe("examples", () => {
  it("are bounded by the document's limit", () => {
    const two = aggregateDependencies(
      ArchitectureModel.from(shopDocument({ maxExamplesPerDependency: 2 })),
      "module",
    );
    expect(two.get(M.web)?.dependencies[0]?.examples).toEqual(
      webToOrdersExamples()
        .slice(0, 2)
        .map((edge) => edge.id),
    );
    const one = aggregateDependencies(
      ArchitectureModel.from(shopDocument({ maxExamplesPerDependency: 1 })),
      "module",
    );
    expect(one.get(M.orders)?.dependents.map((d) => d.examples)).toEqual([
      [E.chargeUsesService.id],
      [E.appCallsPlace.id],
    ]);
  });

  it("are empty for a zero (or invalid) limit, and truncated for fractional limits", () => {
    for (const limit of [0, -3, Number.NaN]) {
      const result = aggregateDependencies(
        ArchitectureModel.from(shopDocument({ maxExamplesPerDependency: limit })),
        "module",
      );
      for (const unit of result.values()) {
        for (const entry of [...unit.dependencies, ...unit.dependents]) {
          expect(entry.examples).toEqual([]);
          expect(entry.edgeCount).toBeGreaterThan(0);
        }
      }
    }
    const fractional = aggregateDependencies(
      ArchitectureModel.from(shopDocument({ maxExamplesPerDependency: 2.7 })),
      "module",
    );
    expect(fractional.get(M.web)?.dependencies[0]?.examples).toHaveLength(2);
  });

  it("default to the IR bound of 5 when the document has no limits", () => {
    const calls = [1, 2, 3, 4, 5, 6, 7].map((observations) =>
      makeEdge("calls", symbolId("a.ts", `f${observations}`), symbolId("b.ts", "g"), {
        observations,
      }),
    );
    const document: ModelDocument = {
      directories: [],
      packages: [],
      files: [makeFile("a.ts"), makeFile("b.ts")],
      symbols: [],
      externals: [],
      edges: [...calls].reverse(),
      modules: [makeModule("a", ["a.ts"]), makeModule("b", ["b.ts"])],
    };
    const result = aggregateDependencies(ArchitectureModel.from(document), "module");
    const entry = result.get(moduleId("a"))?.dependencies[0];
    expect(entry?.edgeCount).toBe(7);
    expect(entry?.observations).toBe(28);
    expect(entry?.examples).toEqual([7, 6, 5, 4, 3].map((n) => calls[n - 1]?.id));
    expect(result.get(moduleId("b"))?.dependents[0]?.entity).toBe(moduleId("a"));
    expect(result.get(moduleId("b"))?.dependents[0]?.examples).toEqual(entry?.examples);
  });

  it("break ties in observations by edge id", () => {
    const edges = ["x", "y", "z"].map((name) =>
      makeEdge("uses", fileId("a.ts"), symbolId("b.ts", name), { observations: 3 }),
    );
    const document: ModelDocument = {
      directories: [],
      packages: [],
      files: [makeFile("a.ts"), makeFile("b.ts")],
      symbols: [],
      externals: [],
      edges,
      modules: [makeModule("a", ["a.ts"]), makeModule("b", ["b.ts"])],
    };
    const entry = aggregateDependencies(ArchitectureModel.from(document), "module")
      .get(moduleId("a"))
      ?.dependencies.at(0);
    expect(entry?.examples).toEqual(idsOf(...edges));
  });
});
