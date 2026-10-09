import { Digraph } from "@katedrala/graph";
import { fileId } from "@katedrala/ir";
import type { EdgeKind, FileId, InferenceInfo } from "@katedrala/ir";
import { DEFAULT_EDGE_KINDS } from "@katedrala/model";
import { describe, expect, it } from "vitest";
import { inferRoles } from "../roles.js";
import { resolveInferenceSettings } from "../settings.js";
import { syntheticModel } from "../test-support.js";
import type { SyntheticModelSpec } from "../test-support.js";
import type { ConfiguredRoleSpec, FileLabel } from "../types.js";
import { LAYER_SIGNAL_WEIGHTS, explainLayers, measureLayers } from "./explain.js";
import { buildLayerGraph, orderLayers } from "./order.js";
import type { LayerGraph } from "./order.js";
import { partitionLayers } from "./partition.js";
import type { LayerPartition } from "./partition.js";

const SETTINGS = resolveInferenceSettings();
const EDGE_KINDS: ReadonlySet<EdgeKind> = new Set(DEFAULT_EDGE_KINDS);

/** The layer explanations of a synthetic repository, by layer name, with every step as in `inferLayers`. */
function explained(
  spec: SyntheticModelSpec,
  configured: readonly ConfiguredRoleSpec[] = [],
  maxEntities = 50,
): Map<string, InferenceInfo> {
  const model = syntheticModel(spec);
  const { labels } = inferRoles({ model, settings: SETTINGS, configured });
  const partition = partitionLayers(model, labels, SETTINGS.layers.minLayerFiles);
  const graph = buildLayerGraph(model, partition, { ...SETTINGS.weighting, edgeKinds: EDGE_KINDS });
  const order = orderLayers(graph, {
    tiers: SETTINGS.vocabulary.tiers,
    exactOrderMaxLayers: SETTINGS.layers.exactOrderMaxLayers,
    packages: partition.layers.map(() => new Set([""])),
  });
  const infos = explainLayers({
    partition,
    graph,
    order,
    labels,
    vocabulary: SETTINGS.vocabulary,
    method: SETTINGS.methods.layers,
    maxEntities,
  });
  return new Map(partition.layers.map((name, index) => [name, infos[index]!]));
}

/** The explanation of one layer; fails when the layer does not exist. */
function infoOf(infos: ReadonlyMap<string, InferenceInfo>, name: string): InferenceInfo {
  const info = infos.get(name);
  if (info === undefined) throw new Error(`No layer ${name}`);
  return info;
}

/** A classic layered shop with a misnamed model, a job layer nothing touches and an upward dependency. */
const SHOP: SyntheticModelSpec = {
  files: [
    "src/main.ts",
    "src/controllers/order.controller.ts",
    "src/controllers/user.controller.ts",
    "src/controllers/health.ts",
    "src/services/order.service.ts",
    "src/services/user-service.ts",
    "src/services/payment-gateway.ts",
    "src/repositories/order.repository.ts",
    "src/repositories/user.repository.ts",
    "src/models/order.ts",
    "src/models/user.ts",
    "src/models/sql-user-repository.ts",
    "src/jobs/cleanup.ts",
    "src/jobs/report.ts",
    "src/lib/cache.store.ts",
  ],
  edges: [
    ["src/main.ts", "src/controllers/order.controller.ts"],
    ["src/controllers/order.controller.ts", "src/services/order.service.ts"],
    ["src/controllers/user.controller.ts", "src/services/user-service.ts"],
    ["src/controllers/health.ts", "src/services/payment-gateway.ts"],
    ["src/services/order.service.ts", "src/repositories/order.repository.ts"],
    ["src/services/user-service.ts", "src/repositories/user.repository.ts"],
    ["src/services/order.service.ts", "src/models/order.ts"],
    ["src/repositories/order.repository.ts", "src/models/order.ts"],
    ["src/repositories/user.repository.ts", "src/models/user.ts"],
    // Against the order: one type-only and one runtime dependency from `model` back to `service`.
    { source: "src/models/order.ts", target: "src/services/order.service.ts", typeOnly: true },
    ["src/models/user.ts", "src/services/user-service.ts"],
  ],
};

const DIRECTION =
  "of the dependency weight between this layer and other layers follows the inferred order, outgoing to a " +
  "higher rank or incoming from a lower rank";
const AGREEMENT = "on average (maximum within a vote source, noisy-OR across sources).";
const SUPPORT = "(conventional arcs and upward dependencies do not count).";

describe("layer signal weights (§4.5)", () => {
  it("are 0.35, 0.35, 0.20 and 0.10 and sum to 1", () => {
    expect(LAYER_SIGNAL_WEIGHTS).toEqual({
      "label-agreement": 0.35,
      "direction-consistency": 0.35,
      "order-support": 0.2,
      "layer-size": 0.1,
    });
    const sum = Object.values(LAYER_SIGNAL_WEIGHTS).reduce((total, weight) => total + weight, 0);
    expect(sum).toBeCloseTo(1, 12);
  });
});

describe("measureLayers (§4.5)", () => {
  // a → b (2), b → c (1), c → b (0.5); d has no dependency. The cycle b ↔ c is broken at c → b.
  const names = ["a", "b", "c", "d"];
  const graph: LayerGraph = {
    layers: names,
    graph: Digraph.fromEdges(4, [0, 1, 2], [1, 2, 1], [2, 1, 0.5]),
    typeOnlyWeights: new Float64Array(3),
    pairs: Int32Array.from([1, 1, 1]),
    dependingFiles: [[fileId("a1.ts")], [fileId("b1.ts")], [fileId("c1.ts")]],
  };
  const order = orderLayers(graph, {
    tiers: new Map(),
    exactOrderMaxLayers: 12,
    packages: names.map(() => new Set([""])),
  });
  const members: FileId[][] = [
    [fileId("a1.ts")],
    [fileId("b1.ts"), fileId("b2.ts")],
    [fileId("c1.ts")],
    [fileId("d1.ts"), fileId("d2.ts"), fileId("d3.ts")],
  ];
  const partition: LayerPartition = { layers: names, members };
  const scores = [0.94, 0.7, 0.8, 0.6, 0.7, 0.7, 0.7];
  const labels = new Map<FileId, FileLabel>(
    members.flatMap((files, layer) =>
      files.map((file): [FileId, FileLabel] => [
        file,
        { file, votes: [], label: names[layer]!, score: scores.shift() ?? 0 },
      ]),
    ),
  );

  it("measures direction consistency, order support, label agreement and size by hand", () => {
    expect([...order.ranks]).toEqual([0, 1, 2, 0]);
    expect(measureLayers(partition, graph, order, labels)).toEqual([
      {
        files: 1,
        labelAgreement: 0.94,
        incidentWeight: 2,
        followingWeight: 2,
        directionConsistency: 1,
        comparableLayers: 2,
        otherLayers: 3,
        orderSupport: 2 / 3,
        layerSize: 1 / 3,
      },
      {
        files: 2,
        labelAgreement: 0.75,
        // a → b and b → c follow the order; the removed c → b does not.
        incidentWeight: 3.5,
        followingWeight: 3,
        directionConsistency: 3 / 3.5,
        comparableLayers: 2,
        otherLayers: 3,
        orderSupport: 2 / 3,
        layerSize: 0.5,
      },
      {
        files: 1,
        labelAgreement: 0.6,
        incidentWeight: 1.5,
        followingWeight: 1,
        directionConsistency: 1 / 1.5,
        comparableLayers: 2,
        otherLayers: 3,
        orderSupport: 2 / 3,
        layerSize: 1 / 3,
      },
      {
        files: 3,
        // (0.7 + 0.7 + 0.7) / 3 in float64; published after roundMetric as 0.7.
        labelAgreement: expect.closeTo(0.7, 12) as number,
        incidentWeight: 0,
        followingWeight: 0,
        // D-45: no cross-layer dependency, so no direction to measure.
        directionConsistency: undefined,
        comparableLayers: 0,
        otherLayers: 3,
        orderSupport: 0,
        layerSize: 0.6,
      },
    ]);
  });

  it("does not count equal ranks as following the order", () => {
    // Both layers depend on each other with equal weight: the exact order keeps a → b and removes b → a.
    const cycle: LayerGraph = {
      layers: ["a", "b"],
      graph: Digraph.fromEdges(2, [0, 1], [1, 0], [1, 1]),
      typeOnlyWeights: new Float64Array(2),
      pairs: Int32Array.from([1, 1]),
      dependingFiles: [[], []],
    };
    const cycleOrder = orderLayers(cycle, {
      tiers: new Map(),
      exactOrderMaxLayers: 12,
      packages: [new Set([""]), new Set([""])],
    });
    const measured = measureLayers(
      { layers: ["a", "b"], members: [[], []] },
      cycle,
      cycleOrder,
      new Map(),
    );
    expect(measured.map((m) => m.directionConsistency)).toEqual([0.5, 0.5]);
    // Empty layers (hand-made input) measure an agreement of 0.
    expect(measured.map((m) => m.labelAgreement)).toEqual([0, 0]);
  });

  it("explains every layer with confidence = Σ weight × value and an absent direction contributing 0 (D-54)", () => {
    const infos = explainLayers({
      partition,
      graph,
      order,
      labels,
      vocabulary: SETTINGS.vocabulary,
      method: SETTINGS.methods.layers,
      maxEntities: 50,
    });
    for (const info of infos) {
      const weighted = info.evidence.filter((evidence) => evidence.weight !== undefined);
      expect(weighted.map((evidence) => evidence.signal).sort()).toEqual([
        "direction-consistency",
        "label-agreement",
        "layer-size",
        "order-support",
      ]);
      expect(weighted.reduce((sum, evidence) => sum + evidence.weight!, 0)).toBeCloseTo(1, 12);
      const recomputed = weighted.reduce(
        (sum, evidence) => sum + evidence.weight! * (evidence.value ?? 0),
        0,
      );
      expect(Math.abs(recomputed - info.confidence)).toBeLessThan(1e-8);
      expect(info.method).toBe("katedrala/layer-inference@1");
      expect(info.reason.startsWith("Inferred:")).toBe(true);
    }
    // d: 0.35 · 0.7 + 0.35 · 0 (absent) + 0.20 · 0 + 0.10 · 0.6.
    expect(infos[3]?.confidence).toBe(0.305);
    expect(infos[3]?.evidence.find((e) => e.signal === "direction-consistency")).toEqual({
      signal: "direction-consistency",
      description:
        "No dependency connects this layer with another layer, so the direction of its dependencies cannot be measured.",
      weight: 0.35,
    });
    // a: 0.35 · 0.94 + 0.35 · 1 + 0.20 · 2/3 + 0.10 · 1/3.
    expect(infos[0]?.confidence).toBe(0.845666667);
    // Without votes, the reason names no source (hand-made labels only).
    expect(infos[3]?.reason).toBe(
      "Inferred: 3 files are in this layer; no dependency connects it with another layer (rank 0).",
    );
    expect(infos[1]?.reason).toBe(
      "Inferred: 2 files are in this layer; `a` and `c` depend on it and it depends on `c` (rank 1).",
    );
  });
});

describe("explainLayers: evidence and reasons (plan 4.6, D-51, D-66)", () => {
  const shop = explained(SHOP);

  it("explains a layer placed by location and naming", () => {
    expect(infoOf(shop, "controller")).toEqual({
      confidence: 0.861,
      method: "katedrala/layer-inference@1",
      reason:
        "Inferred: `src/controllers` holds 3 files, 2 of them named `*.controller.ts`; no other layer depends " +
        "on it and it depends on `service` (rank 0).",
      evidence: [
        {
          signal: "direction-consistency",
          description: `100% ${DIRECTION} (3.0 of 3.0).`,
          value: 1,
          weight: 0.35,
        },
        {
          signal: "label-agreement",
          description: `The members' votes for this layer score 0.86 ${AGREEMENT}`,
          value: 0.86,
          weight: 0.35,
        },
        {
          signal: "order-support",
          description: `Observed dependency paths order this layer relative to 3 of the 4 other layers ${SUPPORT}`,
          value: 0.75,
          weight: 0.2,
        },
        {
          signal: "layer-size",
          description: "The layer has 3 member files.",
          value: 0.6,
          weight: 0.1,
        },
        {
          signal: "role-sources",
          description: "2 members by location and naming, 1 by location only.",
        },
      ],
    });
  });

  it("reports upward dependencies with their type-only share, and members named for another layer", () => {
    expect(infoOf(shop, "model")).toEqual({
      confidence: 0.688333333,
      method: "katedrala/layer-inference@1",
      reason:
        "Inferred: `src/models` holds 3 files; `repository` and `service` depend on it and it depends on " +
        "`service` (rank 3).",
      evidence: [
        {
          signal: "label-agreement",
          description: `The members' votes for this layer score 0.70 ${AGREEMENT}`,
          value: 0.7,
          weight: 0.35,
        },
        {
          signal: "direction-consistency",
          description: `67% ${DIRECTION} (3.0 of 4.5).`,
          value: 0.666666667,
          weight: 0.35,
        },
        {
          signal: "order-support",
          description: `Observed dependency paths order this layer relative to 3 of the 4 other layers ${SUPPORT}`,
          value: 0.75,
          weight: 0.2,
        },
        {
          signal: "layer-size",
          description: "The layer has 3 member files.",
          value: 0.6,
          weight: 0.1,
        },
        {
          signal: "misplaced-by-name",
          description:
            "1 member is named for another layer than its directory: `src/models/sql-user-repository.ts` " +
            "(name: `repository`, directory: `model`).",
          value: 1,
          entities: ["file:src/models/sql-user-repository.ts"],
        },
        { signal: "role-sources", description: "3 members by location only." },
        {
          signal: "upward-dependencies",
          description:
            "2 file dependencies (weight 1.5, of which 0.5 type-only) point from `model` to `service`, " +
            "against the inferred order.",
          value: 1.5,
          entities: ["file:src/models/order.ts", "file:src/models/user.ts"],
        },
      ],
    });
  });

  it("words conventional order as a Katedrala heuristic on both layers (D-53, D-66)", () => {
    const job = infoOf(shop, "job");
    expect(job.reason).toBe(
      "Inferred: `src/jobs` holds 2 files; no dependency connects it with another layer (rank 0).",
    );
    expect(job.confidence).toBe(0.295);
    expect(job.evidence.filter((e) => e.weight === undefined)).toEqual([
      {
        signal: "conventional-order",
        description:
          "Placed before `service` by the conventional tier order (Katedrala heuristic): no observed " +
          "dependency path connects them.",
        entities: ["layer:job", "layer:service"],
      },
      { signal: "role-sources", description: "2 members by location only." },
    ]);
    expect(job.evidence.find((e) => e.signal === "direction-consistency")?.value).toBeUndefined();
    const service = infoOf(shop, "service");
    expect(service.reason).toBe(
      "Inferred: `src/services` holds 3 files, 1 of them named `*-service.ts`; `controller` and `model` " +
        "depend on it and it depends on `model` and `repository` (rank 1).",
    );
    expect(service.evidence.find((e) => e.signal === "conventional-order")).toEqual({
      signal: "conventional-order",
      description:
        "Placed after `job` by the conventional tier order (Katedrala heuristic): no observed dependency " +
        "path connects them.",
      entities: ["layer:job", "layer:service"],
    });
    expect(service.evidence.find((e) => e.signal === "direction-consistency")?.description).toBe(
      `80% ${DIRECTION} (6.0 of 7.5).`,
    );
    expect(infoOf(shop, "repository").reason).toBe(
      "Inferred: `src/repositories` holds 2 files named `*.repository.ts`; `service` depends on it and it " +
        "depends on `model` (rank 2).",
    );
    // A single naming-only member is no layer.
    expect(shop.has("store")).toBe(false);
  });

  it("names file-name patterns when no directory places the members", () => {
    const names = explained({
      files: [
        "src/orders/order.controller.ts",
        "src/orders/order.service.ts",
        "src/users/user.controller.ts",
        "src/users/user.service.ts",
        "src/users/UserService.ts",
      ],
      edges: [
        ["src/orders/order.controller.ts", "src/orders/order.service.ts"],
        ["src/users/user.controller.ts", "src/users/user.service.ts"],
        ["src/users/user.controller.ts", "src/users/UserService.ts"],
      ],
    });
    expect(infoOf(names, "controller").reason).toBe(
      "Inferred: 2 files are named `*.controller.ts`; no other layer depends on it and it depends on " +
        "`service` (rank 0).",
    );
    expect(infoOf(names, "service").reason).toBe(
      "Inferred: 2 of the layer's 3 files are named `*.service.ts`; `controller` depends on it and it " +
        "depends on no other layer (rank 1).",
    );
    expect(infoOf(names, "service").evidence.at(-1)).toEqual({
      signal: "role-sources",
      description: "3 members by naming only.",
    });
  });

  it("names the vote sources when neither a directory nor a file name places the members", () => {
    const configured = explained(
      {
        files: [
          "src/a/one.ts",
          "src/a/two.ts",
          "src/b/three.ts",
          { path: "src/b/four.ts", classes: ["FourService"] },
        ],
        edges: [["src/a/one.ts", "src/b/three.ts"]],
      },
      [
        { role: "http-controller", files: [fileId("src/a/one.ts"), fileId("src/a/two.ts")] },
        { role: "service", files: [fileId("src/b/three.ts")] },
      ],
    );
    expect(infoOf(configured, "controller").reason).toBe(
      "Inferred: 2 files are assigned to this layer by configuration; no other layer depends on it and it " +
        "depends on `service` (rank 0).",
    );
    expect(infoOf(configured, "service").reason).toBe(
      "Inferred: 2 files are assigned to this layer by configuration and naming; `controller` depends on it " +
        "and it depends on no other layer (rank 1).",
    );
    expect(infoOf(configured, "service").evidence.at(-1)).toEqual({
      signal: "role-sources",
      description: "1 member by configuration only, 1 by naming only.",
    });
  });

  it("names the dominant directory of members that lie in several", () => {
    const spread = explained({
      files: [
        "src/main.ts",
        "src/services/a.ts",
        "src/services/b.ts",
        "src/legacy/services/c.ts",
        "src/repositories/r.ts",
        "src/repositories/s.ts",
      ],
      edges: [["src/services/a.ts", "src/repositories/r.ts"]],
    });
    // `legacy` is a feature directory, so `src/legacy/services` is the location of c.ts.
    expect(infoOf(spread, "service").reason).toBe(
      "Inferred: `src/services` holds 2 of the layer's 3 files; no other layer depends on it and it depends " +
        "on `repository` (rank 0).",
    );
  });

  it("bounds the layer lists of reasons by limits.maxEvidenceEntities", () => {
    const bounded = explained(SHOP, [], 1);
    expect(infoOf(bounded, "service").reason).toBe(
      "Inferred: `src/services` holds 3 files, 1 of them named `*-service.ts`; `controller` and 1 more " +
        "depend on it and it depends on `model` and 1 more (rank 1).",
    );
    expect(
      infoOf(bounded, "model").evidence.find((e) => e.signal === "upward-dependencies")?.entities,
    ).toEqual(["file:src/models/order.ts"]);
    const none = explained(SHOP, [], 0);
    expect(infoOf(none, "model").reason).toBe(
      "Inferred: `src/models` holds 3 files; 2 layers depend on it and it depends on 1 layer (rank 3).",
    );
    expect(infoOf(none, "model").evidence.find((e) => e.signal === "misplaced-by-name")).toEqual({
      signal: "misplaced-by-name",
      description: "1 member is named for another layer than its directory: 1 file.",
      value: 1,
    });
  });

  it("words a single upward dependency without a type-only share", () => {
    const infos = explained({
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
        ["src/services/b.service.ts", "src/controllers/b.controller.ts"],
      ],
    });
    expect(
      infoOf(infos, "service").evidence.find((e) => e.signal === "upward-dependencies"),
    ).toEqual({
      signal: "upward-dependencies",
      description:
        "1 file dependency (weight 1.0) points from `service` to `controller`, against the inferred order.",
      value: 1,
      entities: ["file:src/services/b.service.ts"],
    });
    expect(
      infoOf(infos, "controller").evidence.some((e) => e.signal === "upward-dependencies"),
    ).toBe(false);
  });

  it("states several misplaced members", () => {
    const infos = explained({
      files: [
        "src/main.ts",
        "src/infrastructure/sql-book-repository.ts",
        "src/infrastructure/sql-loan-repository.ts",
        "src/infrastructure/clock.ts",
        "src/domain/book.ts",
        "src/domain/loan.ts",
      ],
      edges: [["src/infrastructure/clock.ts", "src/domain/book.ts"]],
    });
    expect(
      infoOf(infos, "infrastructure").evidence.find((e) => e.signal === "misplaced-by-name"),
    ).toEqual({
      signal: "misplaced-by-name",
      description:
        "2 members are named for another layer than their directory: " +
        "`src/infrastructure/sql-book-repository.ts` (name: `repository`, directory: `infrastructure`) and " +
        "`src/infrastructure/sql-loan-repository.ts` (name: `repository`, directory: `infrastructure`).",
      value: 2,
      entities: [
        "file:src/infrastructure/sql-book-repository.ts",
        "file:src/infrastructure/sql-loan-repository.ts",
      ],
    });
    expect(
      infoOf(infos, "domain").evidence.find((e) => e.signal === "order-support")?.description,
    ).toBe(
      `Observed dependency paths order this layer relative to 1 of the 1 other layer ${SUPPORT}`,
    );
  });

  it("uses the configured method string (D-56)", () => {
    const model = syntheticModel(SHOP);
    const settings = resolveInferenceSettings({ layers: { min_layer_files: 3 } });
    const { labels } = inferRoles({ model, settings, configured: [] });
    const partition = partitionLayers(model, labels, settings.layers.minLayerFiles);
    const graph = buildLayerGraph(model, partition, {
      ...settings.weighting,
      edgeKinds: EDGE_KINDS,
    });
    const order = orderLayers(graph, {
      tiers: settings.vocabulary.tiers,
      exactOrderMaxLayers: 12,
      packages: partition.layers.map(() => new Set([""])),
    });
    const infos = explainLayers({
      partition,
      graph,
      order,
      labels,
      vocabulary: settings.vocabulary,
      method: settings.methods.layers,
      maxEntities: 50,
    });
    expect(infos.map((info) => info.method)).toEqual(
      partition.layers.map(() => "katedrala/layer-inference@1?min_layer_files=3"),
    );
  });
});
