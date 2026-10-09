import { canonicalizeDocument, defaultLimits, emptyDocument, fileId } from "@katedrala/ir";
import type { EdgeKind, FileId, LayerEntity } from "@katedrala/ir";
import type { ArchitectureModel, ProjectionOptions } from "@katedrala/model";
import { DEFAULT_EDGE_KINDS } from "@katedrala/model";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { inferRoles } from "../roles.js";
import { resolveInferenceSettings } from "../settings.js";
import {
  prototypeFixtureNames,
  prototypeModel,
  shuffledModel,
  syntheticModel,
} from "../test-support.js";
import type { SyntheticModelSpec } from "../test-support.js";
import type {
  DeclaredLayerSpec,
  InferenceConfiguration,
  InferenceSettings,
  LayerDraft,
  LayersResult,
} from "../types.js";
import { inferLayers } from "./layers.js";
import { buildLayerGraph } from "./order.js";
import { partitionLayers } from "./partition.js";

const EDGE_KINDS: ReadonlySet<EdgeKind> = new Set(DEFAULT_EDGE_KINDS);
const PROJECTION: ProjectionOptions = { edgeKinds: EDGE_KINDS, includeTypeOnly: true };

function layersOf(
  model: ArchitectureModel,
  config?: InferenceConfiguration,
  overrides: { projection?: ProjectionOptions; declared?: readonly DeclaredLayerSpec[] } = {},
): LayersResult {
  const settings = resolveInferenceSettings(config);
  const { labels } = inferRoles({ model, settings, configured: [] });
  return inferLayers({
    model,
    settings,
    projection: overrides.projection ?? PROJECTION,
    labels,
    limits: defaultLimits(),
    ...(overrides.declared === undefined ? {} : { declared: overrides.declared }),
  });
}

/** The observed layer dependencies (arcs of H) as `a>b=w`, computed as `inferLayers` does. */
function layerDependencies(model: ArchitectureModel, settings: InferenceSettings): string[] {
  const { labels } = inferRoles({ model, settings, configured: [] });
  const partition = partitionLayers(model, labels, settings.layers.minLayerFiles);
  const graph = buildLayerGraph(model, partition, { ...settings.weighting, edgeKinds: EDGE_KINDS });
  const h = graph.graph;
  const arcs: string[] = [];
  for (let a = 0; a < h.nodeCount; a++) {
    for (let e = h.outOffsets[a]!; e < h.outOffsets[a + 1]!; e++) {
      arcs.push(`${graph.layers[a]!}>${graph.layers[h.outTargets[e]!]!}=${h.outWeights[e]!}`);
    }
  }
  return arcs;
}

/** `rank name confidence` per layer, in output order. */
function summary(layers: readonly LayerDraft[]): string[] {
  return layers.map((layer) => `${layer.rank} ${layer.name} ${layer.inference?.confidence ?? "-"}`);
}

/** The values of the weighted signals of a layer, by signal. */
function signals(layer: LayerDraft | undefined): Record<string, number | undefined> {
  const values: Record<string, number | undefined> = {};
  for (const evidence of layer?.inference?.evidence ?? []) {
    if (evidence.weight !== undefined) values[evidence.signal] = evidence.value;
  }
  return values;
}

const paths = (files: readonly FileId[]): string[] => files.map((file) => file.slice(5));

describe("inferLayers: the design's replays on prototype graphs (§4.6, review #8)", () => {
  it("reproduces layered-architecture: four layers, ranks 0–3, §4.6's confidences", () => {
    const model = prototypeModel("layered-architecture");
    const { layers, diagnostics } = layersOf(model);
    expect(diagnostics).toEqual([]);
    expect(summary(layers)).toEqual([
      "0 controller 0.939",
      "1 service 0.924666667",
      "2 repository 0.939",
      "3 model 0.861666667",
    ]);
    // §4.6 publishes three decimals: 0.939, 0.925, 0.939, 0.862.
    expect(layers.map((layer) => Number(layer.inference?.confidence.toFixed(3)))).toEqual([
      0.939, 0.925, 0.939, 0.862,
    ]);
    expect(layers.map(signals)).toEqual([
      {
        "label-agreement": 0.94,
        "direction-consistency": 1,
        "order-support": 1,
        "layer-size": 0.6,
      },
      {
        "label-agreement": 0.88,
        "direction-consistency": 1,
        "order-support": 1,
        "layer-size": 0.666666667,
      },
      {
        "label-agreement": 0.94,
        "direction-consistency": 1,
        "order-support": 1,
        "layer-size": 0.6,
      },
      {
        "label-agreement": 0.7,
        "direction-consistency": 1,
        "order-support": 1,
        "layer-size": 0.666666667,
      },
    ]);
    // Exactly the four layer dependencies of the fixture, none upward.
    expect(layerDependencies(model, resolveInferenceSettings())).toEqual([
      "controller>service=3",
      "repository>model=2",
      "service>model=4",
      "service>repository=3",
    ]);
    const evidence = layers.flatMap((layer) => layer.inference?.evidence ?? []);
    expect(evidence.some((e) => e.signal === "upward-dependencies")).toBe(false);
    expect(evidence.some((e) => e.signal === "conventional-order")).toBe(false);
    // `shared/*` and `main.ts` are in no layer (§4.3).
    const members = layers.flatMap((layer) => paths(layer.files));
    expect(
      members.filter((path) => path.startsWith("src/shared/") || path === "src/main.ts"),
    ).toEqual([]);
    expect(paths(layers[1]?.files ?? [])).toEqual([
      "src/services/order.service.ts",
      "src/services/payment-gateway.ts",
      "src/services/payment.service.ts",
      "src/services/user.service.ts",
    ]);
    expect(layers[0]?.inference?.reason).toBe(
      "Inferred: `src/controllers` holds 3 files named `*.controller.ts`; no other layer depends on it and " +
        "it depends on `service` (rank 0).",
    );
  });

  it("reproduces clean-architecture: infrastructure and presentation outermost, domain innermost", () => {
    const model = prototypeModel("clean-architecture");
    const { layers } = layersOf(model);
    expect(summary(layers)).toEqual([
      "0 infrastructure 0.736666667",
      "0 presentation 0.795",
      "1 application 0.795",
      "2 domain 0.878333333",
    ]);
    // §4.6: 0.737, 0.795, 0.795, 0.878.
    expect(layers.map((layer) => Number(layer.inference?.confidence.toFixed(3)))).toEqual([
      0.737, 0.795, 0.795, 0.878,
    ]);
    expect(layers.map(signals)).toEqual([
      {
        "label-agreement": 0.7,
        "direction-consistency": 1,
        "order-support": 0.333333333,
        "layer-size": 0.75,
      },
      {
        "label-agreement": 0.7,
        "direction-consistency": 1,
        "order-support": 0.666666667,
        "layer-size": 0.666666667,
      },
      {
        "label-agreement": 0.7,
        "direction-consistency": 1,
        "order-support": 0.666666667,
        "layer-size": 0.666666667,
      },
      {
        "label-agreement": 0.7,
        "direction-consistency": 1,
        "order-support": 1,
        "layer-size": 0.833333333,
      },
    ]);
    expect(layerDependencies(model, resolveInferenceSettings())).toEqual([
      "application>domain=11",
      "infrastructure>domain=7",
      "presentation>application=2",
      "presentation>domain=1",
    ]);
    const evidence = layers.flatMap((layer) => layer.inference?.evidence ?? []);
    expect(evidence.some((e) => e.signal === "upward-dependencies")).toBe(false);
    // Six infrastructure files: the SQL repositories stay in their location's layer (D-14).
    expect(paths(layers[0]?.files ?? [])).toEqual([
      "src/infrastructure/notifications/smtp-notifier.ts",
      "src/infrastructure/persistence/pool.ts",
      "src/infrastructure/persistence/sql-book-repository.ts",
      "src/infrastructure/persistence/sql-loan-repository.ts",
      "src/infrastructure/persistence/sql-member-repository.ts",
      "src/infrastructure/system-clock.ts",
    ]);
    expect(layers.flatMap((layer) => paths(layer.files))).not.toContain("src/main.ts");
    expect(layers[3]?.inference?.reason).toBe(
      "Inferred: `src/domain` holds 10 files; `application`, `infrastructure` and `presentation` depend on " +
        "it and it depends on no other layer (rank 2).",
    );
  });

  it("gives monorepo's unrelated layers rank 0 and a low confidence (D-55)", () => {
    const { layers } = layersOf(prototypeModel("monorepo"));
    expect(summary(layers)).toEqual(["0 component 0.295", "0 handler 0.295"]);
    const evidence = layers.flatMap((layer) => layer.inference?.evidence ?? []);
    expect(evidence.some((e) => e.signal === "conventional-order")).toBe(false);
  });

  it("infers no layers where fewer than two survive pruning", () => {
    for (const name of ["simple-dependencies", "tangled-architecture", "typescript-features"]) {
      expect(layersOf(prototypeModel(name)).layers).toEqual([]);
    }
  });

  it("satisfies the layer invariants on every prototype fixture", () => {
    for (const name of prototypeFixtureNames()) {
      const model = prototypeModel(name);
      const { layers, diagnostics } = layersOf(model);
      expect(diagnostics).toEqual([]);
      const seen = new Set<FileId>();
      for (const layer of layers) {
        expect(layer.origin).toBe("inferred");
        expect(layer.id).toBe(`layer:${layer.name}`);
        expect(layer.files.length).toBeGreaterThan(0);
        for (const file of layer.files) {
          // Each file is in at most one layer, and layers contain source files only.
          expect(seen.has(file)).toBe(false);
          seen.add(file);
          expect(model.index.file(file)?.role).toBe("source");
        }
        const info = layer.inference;
        expect(info?.reason.startsWith("Inferred:")).toBe(true);
        const weighted = (info?.evidence ?? []).filter((e) => e.weight !== undefined);
        expect(weighted.reduce((sum, e) => sum + e.weight!, 0)).toBeCloseTo(1, 12);
        const recomputed = weighted.reduce((sum, e) => sum + e.weight! * (e.value ?? 0), 0);
        expect(Math.abs(recomputed - (info?.confidence ?? -1))).toBeLessThan(1e-8);
        for (const evidence of info?.evidence ?? []) {
          if (evidence.value !== undefined && evidence.weight !== undefined) {
            expect(evidence.value).toBeGreaterThanOrEqual(0);
            expect(evidence.value).toBeLessThanOrEqual(1);
          }
        }
      }
      if (layers.length > 0) expect(layers.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("inferLayers: membership, order and configuration", () => {
  /** Layers without a dependency between them, in a repository without manifests. */
  const UNCONNECTED: SyntheticModelSpec = {
    files: [
      "src/main.ts",
      "src/routes/a.ts",
      "src/routes/b.ts",
      "src/services/a.ts",
      "src/services/b.ts",
    ],
    edges: [
      ["src/main.ts", "src/routes/a.ts"],
      ["src/main.ts", "src/services/a.ts"],
    ],
  };

  it("orders layers by convention in a repository without manifests (D-53, review #22)", () => {
    const { layers } = layersOf(syntheticModel(UNCONNECTED));
    expect(layers.map((layer) => `${layer.rank} ${layer.name}`)).toEqual(["0 route", "1 service"]);
    expect(
      layers.map(
        (layer) =>
          layer.inference?.evidence.find((e) => e.signal === "conventional-order")?.description,
      ),
    ).toEqual([
      "Placed before `service` by the conventional tier order (Katedrala heuristic): no observed dependency path connects them.",
      "Placed after `route` by the conventional tier order (Katedrala heuristic): no observed dependency path connects them.",
    ]);
    // In two packages, the layers share none: no conventional arc (D-53).
    const split = layersOf(
      syntheticModel({
        files: [
          "web/src/index.ts",
          "web/src/routes/a.ts",
          "web/src/routes/b.ts",
          "api/src/index.ts",
          "api/src/services/a.ts",
          "api/src/services/b.ts",
        ],
        packages: ["web", "api"],
      }),
    );
    expect(split.layers.map((layer) => `${layer.rank} ${layer.name}`)).toEqual([
      "0 route",
      "0 service",
    ]);
  });

  it("counts type-only dependencies at type_only_weight even when the metrics exclude them (D-51)", () => {
    const spec: SyntheticModelSpec = {
      files: [
        "src/main.ts",
        "src/controllers/a.controller.ts",
        "src/controllers/b.controller.ts",
        "src/services/a.service.ts",
        "src/services/b.service.ts",
      ],
      edges: [
        ["src/controllers/a.controller.ts", "src/services/a.service.ts"],
        ["src/controllers/b.controller.ts", "src/services/b.service.ts"],
        ["src/controllers/a.controller.ts", "src/services/b.service.ts"],
        ["src/services/a.service.ts", "src/controllers/a.controller.ts"],
        {
          source: "src/services/b.service.ts",
          target: "src/controllers/b.controller.ts",
          typeOnly: true,
        },
      ],
    };
    const model = syntheticModel(spec);
    const withoutTypeOnly = layersOf(model, undefined, {
      projection: { edgeKinds: EDGE_KINDS, includeTypeOnly: false },
    });
    expect(withoutTypeOnly).toEqual(layersOf(model));
    const service = withoutTypeOnly.layers.find((layer) => layer.name === "service");
    expect(service?.inference?.evidence.find((e) => e.signal === "upward-dependencies")).toEqual({
      signal: "upward-dependencies",
      description:
        "2 file dependencies (weight 1.5, of which 0.5 type-only) point from `service` to `controller`, " +
        "against the inferred order.",
      value: 1.5,
      entities: ["file:src/services/a.service.ts", "file:src/services/b.service.ts"],
    });
    // type_only_weight = 0 drops the type-only reference from the layer graph.
    const zero = layersOf(model, { modules: { type_only_weight: 0 } });
    const upward = zero.layers
      .find((layer) => layer.name === "service")
      ?.inference?.evidence.find((e) => e.signal === "upward-dependencies");
    expect(upward?.description).toBe(
      "1 file dependency (weight 1.0) points from `service` to `controller`, against the inferred order.",
    );
    expect(zero.layers[0]?.inference?.method).toBe(
      "katedrala/layer-inference@1?modules.type_only_weight=0",
    );
  });

  it("lifts the edge kinds of the metrics projection (D-51)", () => {
    const model = syntheticModel({
      files: ["src/routes/a.ts", "src/routes/b.ts", "src/services/a.ts", "src/services/b.ts"],
      edges: [{ source: "src/services/a.ts", target: "src/routes/a.ts", kind: "calls" }],
    });
    // With `calls`, service → route is observed; without it, the conventional order applies.
    expect(layersOf(model).layers.map((layer) => `${layer.rank} ${layer.name}`)).toEqual([
      "0 service",
      "1 route",
    ]);
    const importsOnly = layersOf(model, undefined, {
      projection: { edgeKinds: new Set<EdgeKind>(["imports"]) },
    });
    expect(importsOnly.layers.map((layer) => `${layer.rank} ${layer.name}`)).toEqual([
      "0 route",
      "1 service",
    ]);
    // Without edge kinds the metrics projection's default applies.
    expect(layersOf(model, undefined, { projection: {} })).toEqual(layersOf(model));
  });

  it("orders cycles beyond exact_order_max_layers greedily", () => {
    const model = syntheticModel({
      files: [
        "src/a/x.controller.ts",
        "src/a/y.controller.ts",
        "src/b/x.service.ts",
        "src/b/y.service.ts",
        "src/c/x.repository.ts",
        "src/c/y.repository.ts",
      ],
      edges: [
        ["src/a/x.controller.ts", "src/b/x.service.ts"],
        ["src/b/x.service.ts", "src/c/x.repository.ts"],
        ["src/c/x.repository.ts", "src/a/x.controller.ts"],
        ["src/c/y.repository.ts", "src/a/y.controller.ts"],
      ],
    });
    const exact = layersOf(model);
    const greedy = layersOf(model, { layers: { exact_order_max_layers: 2 } });
    const upward = (result: LayersResult): string[] =>
      result.layers.flatMap(
        (layer) =>
          layer.inference?.evidence
            .filter((e) => e.signal === "upward-dependencies")
            .map((e) => `${layer.name}: ${e.description}`) ?? [],
      );
    // The exact order breaks a lightest arc of the cycle; both candidates invert two tier pairs, so the
    // lexicographically smallest order (repository, controller, service) decides (D-52)...
    expect(upward(exact)).toEqual([
      "service: 1 file dependency (weight 1.0) points from `service` to `repository`, against the inferred order.",
    ]);
    // ...the greedy approximation is unweighted (Eades et al. 1993).
    expect(upward(greedy)).toEqual([
      "repository: 2 file dependencies (weight 2.0) point from `repository` to `controller`, against the inferred order.",
    ]);
    expect(greedy.layers[0]?.inference?.method).toBe(
      "katedrala/layer-inference@1?exact_order_max_layers=2",
    );
  });

  it("infers nothing when layer inference is disabled", () => {
    expect(
      layersOf(prototypeModel("layered-architecture"), { layers: { enabled: false } }),
    ).toEqual({ layers: [], diagnostics: [] });
  });

  it("takes declared layers exactly and infers none (D-50, D-71)", () => {
    const model = prototypeModel("layered-architecture");
    const declared: DeclaredLayerSpec[] = [
      {
        name: "web",
        rank: 0,
        files: [fileId("src/controllers/order.controller.ts"), fileId("src/main.ts")],
      },
      {
        name: "core",
        rank: 1,
        files: [fileId("src/services/order.service.ts"), fileId("src/main.ts")],
      },
      { name: "empty", rank: 2, files: [] },
    ];
    const settings = resolveInferenceSettings({ layers: { enabled: false } });
    const { labels } = inferRoles({ model, settings, configured: [] });
    const result = inferLayers({
      model,
      settings,
      projection: PROJECTION,
      labels,
      declared,
      limits: defaultLimits(),
      configurationFile: fileId("katedrala.config.yaml"),
    });
    // `inference.layers.enabled` does not apply to declared layers.
    expect(result.layers).toEqual([
      {
        id: "layer:web",
        name: "web",
        origin: "declared",
        rank: 0,
        files: ["file:src/controllers/order.controller.ts", "file:src/main.ts"],
      },
      {
        id: "layer:core",
        name: "core",
        origin: "declared",
        rank: 1,
        files: ["file:src/services/order.service.ts"],
      },
      { id: "layer:empty", name: "empty", origin: "declared", rank: 2, files: [] },
    ]);
    expect(result.diagnostics.map((d) => [d.code, d.file, d.message])).toEqual([
      [
        "configuration-warning",
        "file:katedrala.config.yaml",
        'Files match several declared layers: 1 file matches both "web" and "core", and the first in list ' +
          'order ("web") keeps it: src/main.ts',
      ],
      [
        "configuration-warning",
        "file:katedrala.config.yaml",
        'Declared layer "empty" matches no file; it is kept without member files',
      ],
    ]);
  });

  it("is canonical and independent of the order of the document's arrays (property)", () => {
    const model = prototypeModel("express-app");
    const expected = layersOf(model);
    expect(expected.layers.length).toBeGreaterThan(2);
    const entities: LayerEntity[] = expected.layers.map((layer) => ({
      ...layer,
      dependencies: [],
      dependents: [],
    }));
    expect(canonicalizeDocument({ ...emptyDocument(), layers: entities }).layers).toEqual(entities);
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 31 - 1 }), (seed) => {
        expect(layersOf(shuffledModel(model, seed))).toEqual(expected);
      }),
      { seed: 20261008, numRuns: 15 },
    );
  });
});
