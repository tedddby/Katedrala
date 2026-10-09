import { Digraph, stronglyConnectedComponents } from "@katedrala/graph";
import { fileId } from "@katedrala/ir";
import type { EdgeKind, FileId } from "@katedrala/ir";
import { DEFAULT_EDGE_KINDS } from "@katedrala/model";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolveInferenceSettings } from "../settings.js";
import { syntheticModel } from "../test-support.js";
import { buildLayerGraph, exactLayerOrder, orderLayers } from "./order.js";
import type { LayerGraph, LayerOrder, LayerOrderOptions } from "./order.js";
import type { LayerPartition } from "./partition.js";

const EDGE_KINDS: ReadonlySet<EdgeKind> = new Set(DEFAULT_EDGE_KINDS);
const TIERS = resolveInferenceSettings().vocabulary.tiers;

/** `a>b=w` per arc of H, plus `(type-only t)` when part of the weight is type-only. */
function arcsOf(graph: LayerGraph): string[] {
  const arcs: string[] = [];
  const h = graph.graph;
  for (let a = 0; a < h.nodeCount; a++) {
    for (let e = h.outOffsets[a]!; e < h.outOffsets[a + 1]!; e++) {
      const typeOnly = graph.typeOnlyWeights[e]!;
      arcs.push(
        `${graph.layers[a]!}>${graph.layers[h.outTargets[e]!]!}=${h.outWeights[e]!}` +
          (typeOnly > 0 ? ` (type-only ${typeOnly})` : ""),
      );
    }
  }
  return arcs;
}

/**
 * A layer graph from named arcs `[from, to, weight]`, layers sorted by name. Every arc gets one file pair and
 * no depending file; the ordering reads only the graph.
 */
function layerGraph(
  names: readonly string[],
  arcs: readonly (readonly [from: string, to: string, weight: number])[],
): LayerGraph {
  const layers = [...names].sort();
  const indexed = arcs
    .map(([from, to, weight]) => [layers.indexOf(from), layers.indexOf(to), weight] as const)
    .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  return {
    layers,
    graph: Digraph.fromEdges(
      layers.length,
      indexed.map(([a]) => a),
      indexed.map(([, b]) => b),
      indexed.map(([, , w]) => w),
    ),
    typeOnlyWeights: new Float64Array(indexed.length),
    pairs: new Int32Array(indexed.length).fill(1),
    dependingFiles: indexed.map(() => []),
  };
}

/** Options with every layer in the package "" (a repository without manifests). */
function options(graph: LayerGraph, overrides: Partial<LayerOrderOptions> = {}): LayerOrderOptions {
  return {
    tiers: TIERS,
    exactOrderMaxLayers: 12,
    packages: graph.layers.map(() => new Set([""])),
    ...overrides,
  };
}

/** `name rank` per layer, by rank then name. */
function ranksOf(graph: LayerGraph, order: LayerOrder): string[] {
  return graph.layers
    .map((name, index) => [name, order.ranks[index]!] as const)
    .sort(([a, x], [b, y]) => x - y || (a < b ? -1 : 1))
    .map(([name, rank]) => `${name} ${rank}`);
}

/** `a>b` for index pairs. */
function named(graph: LayerGraph, arcs: readonly (readonly [number, number])[]): string[] {
  return arcs.map(([a, b]) => `${graph.layers[a]!}>${graph.layers[b]!}`);
}

describe("buildLayerGraph (§4.4 step 1, D-51)", () => {
  const model = syntheticModel({
    files: [
      "src/controllers/c1.ts",
      "src/controllers/c2.ts",
      "src/models/m1.ts",
      "src/services/s1.ts",
      "src/services/s2.ts",
      "src/main.ts",
      { path: "src/controllers/c1.test.ts", role: "test" },
    ],
    edges: [
      ["src/controllers/c1.ts", "src/services/s1.ts"],
      { source: "src/controllers/c1.ts", target: "src/services/s2.ts", typeOnly: true },
      // A runtime `calls` edge next to a type-only import makes the pair runtime.
      { source: "src/controllers/c2.ts", target: "src/services/s1.ts", typeOnly: true },
      { source: "src/controllers/c2.ts", target: "src/services/s1.ts", kind: "calls" },
      ["src/services/s1.ts", "src/models/m1.ts"],
      { source: "src/services/s2.ts", target: "src/models/m1.ts", typeOnly: true },
      // D-01: below min_edge_confidence, not even a type-only dependency.
      { source: "src/controllers/c2.ts", target: "src/models/m1.ts", confidence: 0.3 },
      // Inside a layer, from or to a file in no layer, from a test: not layer dependencies.
      ["src/controllers/c1.ts", "src/controllers/c2.ts"],
      ["src/controllers/c1.ts", "src/main.ts"],
      ["src/main.ts", "src/controllers/c1.ts"],
      ["src/controllers/c1.test.ts", "src/models/m1.ts"],
    ],
  });
  const partition: LayerPartition = {
    layers: ["controller", "model", "service"],
    members: [
      [fileId("src/controllers/c1.ts"), fileId("src/controllers/c2.ts")],
      [fileId("src/models/m1.ts")],
      [fileId("src/services/s1.ts"), fileId("src/services/s2.ts")],
    ],
  };
  const build = (typeOnlyWeight: number, edgeKinds = EDGE_KINDS): LayerGraph =>
    buildLayerGraph(model, partition, { typeOnlyWeight, minEdgeConfidence: 0.5, edgeKinds });

  it("sums the weights of the file pairs between two layers, with their type-only share", () => {
    const graph = build(0.5);
    expect(graph.layers).toEqual(["controller", "model", "service"]);
    expect(arcsOf(graph)).toEqual([
      "controller>service=2.5 (type-only 0.5)",
      "service>model=1.5 (type-only 0.5)",
    ]);
    expect([...graph.pairs]).toEqual([3, 2]);
    expect(graph.dependingFiles).toEqual([
      ["file:src/controllers/c1.ts", "file:src/controllers/c2.ts"],
      ["file:src/services/s1.ts", "file:src/services/s2.ts"],
    ]);
  });

  it("finds the type-only share exactly for every type_only_weight (D-51, D-67)", () => {
    // Weight 1: a type-only pair weighs as much as a runtime pair, and is still reported as type-only.
    expect(arcsOf(build(1))).toEqual([
      "controller>service=3 (type-only 1)",
      "service>model=2 (type-only 1)",
    ]);
    // Weight 0: type-only pairs are no dependencies at all.
    const zero = build(0);
    expect(arcsOf(zero)).toEqual(["controller>service=2", "service>model=1"]);
    expect([...zero.pairs]).toEqual([2, 1]);
    expect(arcsOf(build(3 / 1024))).toEqual([
      `controller>service=${2 + 3 / 1024} (type-only ${3 / 1024})`,
      `service>model=${1 + 3 / 1024} (type-only ${3 / 1024})`,
    ]);
  });

  it("lifts only the edge kinds of the metrics projection (D-51)", () => {
    // Without `calls`, the c2 → s1 pair is type-only.
    expect(arcsOf(build(0.5, new Set<EdgeKind>(["imports"])))).toEqual([
      "controller>service=2 (type-only 1)",
      "service>model=1.5 (type-only 0.5)",
    ]);
  });

  it("gives an empty graph when no file pair crosses layers", () => {
    const graph = buildLayerGraph(
      model,
      {
        layers: ["a", "b"],
        members: [[fileId("src/main.ts")], [fileId("src/controllers/c1.test.ts")]],
      },
      { typeOnlyWeight: 0.5, minEdgeConfidence: 0.5, edgeKinds: EDGE_KINDS },
    );
    expect(graph.graph.edgeCount).toBe(0);
    expect(graph.graph.nodeCount).toBe(2);
  });
});

/** Every permutation of `0..k−1`, in lexicographic order. */
function permutations(k: number): number[][] {
  if (k === 0) return [[]];
  const result: number[][] = [];
  const extend = (prefix: number[], rest: number[]): void => {
    if (rest.length === 0) {
      result.push(prefix);
      return;
    }
    rest.forEach((next, index) => {
      extend([...prefix, next], [...rest.slice(0, index), ...rest.slice(index + 1)]);
    });
  };
  extend(
    [],
    Array.from({ length: k }, (_, index) => index),
  );
  return result;
}

/**
 * The reference of D-52: the permutation with the least backward weight, then the fewest inversions between
 * tiered layers, then the lexicographically smallest.
 */
function bruteForceOrder(
  weights: readonly number[],
  tiers: readonly (number | undefined)[],
): number[] {
  const k = tiers.length;
  let best: { weight: number; inversions: number; sequence: number[] } | undefined;
  for (const sequence of permutations(k)) {
    let weight = 0;
    let inversions = 0;
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const earlier = sequence[i]!;
        const later = sequence[j]!;
        weight += weights[later * k + earlier]!;
        const te = tiers[earlier];
        const tl = tiers[later];
        if (te !== undefined && tl !== undefined && te > tl) inversions++;
      }
    }
    if (
      best === undefined ||
      weight < best.weight ||
      (weight === best.weight && inversions < best.inversions)
    ) {
      best = { weight, inversions, sequence };
    }
  }
  return best?.sequence ?? [];
}

describe("exactLayerOrder (D-52)", () => {
  it("minimizes the weight of backward arcs", () => {
    // 0 → 1 (3), 1 → 2 (2), 2 → 0 (1): breaking 2 → 0 is cheapest.
    const weights = [0, 3, 0, 0, 0, 2, 1, 0, 0];
    expect(exactLayerOrder(weights, [undefined, undefined, undefined])).toEqual([0, 1, 2]);
    // 2 → 0 heavier than 0 → 1: break 0 → 1 instead.
    const heavier = [0, 1, 0, 0, 0, 2, 3, 0, 0];
    expect(exactLayerOrder(heavier, [undefined, undefined, undefined])).toEqual([1, 2, 0]);
  });

  it("breaks weight ties by inversions of the conventional tiers, counted only between tiered layers", () => {
    const cycle = [0, 1, 1, 0];
    // Layer 0 is inner (tier 2), layer 1 outer (tier 1): putting 1 first inverts nothing.
    expect(exactLayerOrder(cycle, [2, 1])).toEqual([1, 0]);
    expect(exactLayerOrder(cycle, [1, 2])).toEqual([0, 1]);
    // A layer without a tier never counts as an inversion: the smallest sequence wins.
    expect(exactLayerOrder(cycle, [undefined, 0])).toEqual([0, 1]);
    expect(exactLayerOrder(cycle, [3, undefined])).toEqual([0, 1]);
    // Equal tiers are no inversion either.
    expect(exactLayerOrder(cycle, [1, 1])).toEqual([0, 1]);
  });

  it("prefers less backward weight over fewer inversions", () => {
    // 0 (tier 4) → 1 (tier 0) weighs 2, the reverse 1: the order 0, 1 keeps the heavier arc forward.
    expect(exactLayerOrder([0, 2, 1, 0], [4, 0])).toEqual([0, 1]);
  });

  it("returns the lexicographically smallest optimal sequence", () => {
    expect(
      exactLayerOrder(new Float64Array(16), [undefined, undefined, undefined, undefined]),
    ).toEqual([0, 1, 2, 3]);
    expect(exactLayerOrder([], [])).toEqual([]);
    expect(exactLayerOrder([0], [undefined])).toEqual([0]);
  });

  it("rejects inputs it cannot order", () => {
    expect(() => exactLayerOrder([0, 1, 1], [undefined, undefined])).toThrow(RangeError);
    expect(() =>
      exactLayerOrder(
        [],
        Array.from({ length: 25 }, () => undefined),
      ),
    ).toThrow(RangeError);
  });

  it("equals brute force over all permutations for k ≤ 7 (property, lattice weights, tiers partly absent)", () => {
    const lattice = fc.oneof(
      { weight: 3, arbitrary: fc.constant(0) },
      { weight: 1, arbitrary: fc.integer({ min: 1, max: 4 }) },
      { weight: 2, arbitrary: fc.integer({ min: 1, max: 4096 }).map((n) => n / 1024) },
    );
    const instance = fc.integer({ min: 1, max: 7 }).chain((k) =>
      fc.record({
        weights: fc
          .array(lattice, { minLength: k * k, maxLength: k * k })
          .map((weights) => weights.map((weight, index) => (index % (k + 1) === 0 ? 0 : weight))),
        tiers: fc.array(fc.option(fc.integer({ min: 0, max: 4 }), { nil: undefined }), {
          minLength: k,
          maxLength: k,
        }),
      }),
    );
    fc.assert(
      fc.property(instance, ({ weights, tiers }) => {
        expect(exactLayerOrder(weights, tiers)).toEqual(bruteForceOrder(weights, tiers));
      }),
      { seed: 52, numRuns: 300 },
    );
  });
});

describe("orderLayers (§4.4 steps 2–4, D-52, D-53)", () => {
  it("removes the arcs against the exact order of a cycle and ranks the rest", () => {
    const graph = layerGraph(
      ["controller", "service", "repository"],
      [
        ["controller", "service", 3],
        ["service", "repository", 2],
        ["repository", "service", 1.5],
      ],
    );
    const order = orderLayers(graph, options(graph));
    expect(named(graph, order.removed)).toEqual(["repository>service"]);
    expect([...order.isRemoved]).toEqual([0, 1, 0]);
    expect(order.conventional).toEqual([]);
    expect(order.approximated).toEqual([]);
    expect(ranksOf(graph, order)).toEqual(["controller 0", "service 1", "repository 2"]);
  });

  it("orders cycles beyond exact_order_max_layers with the greedy heuristic (Eades et al. 1993)", () => {
    const graph = layerGraph(
      ["a", "b", "c"],
      [
        ["a", "b", 1],
        ["b", "c", 1],
        ["c", "a", 5],
      ],
    );
    const exact = orderLayers(graph, options(graph, { tiers: new Map() }));
    // The exact order breaks the cheapest arc...
    expect(named(graph, exact.removed)).toEqual(["a>b"]);
    expect(exact.approximated).toEqual([]);
    // ...the unweighted greedy approximation does not look at weights.
    const greedy = orderLayers(graph, options(graph, { tiers: new Map(), exactOrderMaxLayers: 2 }));
    expect(greedy.approximated).toEqual([[0, 1, 2]]);
    expect(greedy.removed).toHaveLength(1);
    expect(named(graph, greedy.removed)).toEqual(["c>a"]);
    expect(ranksOf(graph, greedy)).toEqual(["a 0", "b 1", "c 2"]);
  });

  it("adds conventional arcs in (tier(A), tier(B), A, B) order (D-53, express-app's layer graph)", () => {
    const graph = layerGraph(
      ["client", "controller", "database", "middleware", "model", "repository", "route", "service"],
      [
        ["controller", "database", 1],
        ["controller", "model", 1],
        ["controller", "service", 2],
        ["middleware", "model", 1],
        ["repository", "model", 2],
        ["route", "controller", 3],
        ["route", "middleware", 2],
        ["service", "client", 1],
        ["service", "model", 2],
        ["service", "repository", 2],
      ],
    );
    const order = orderLayers(graph, options(graph));
    expect(order.removed).toEqual([]);
    // 7.3: no conventional arc between controller and service, which an observed arc orders.
    expect(named(graph, order.conventional)).toEqual([
      "middleware>service",
      "middleware>database",
      "service>database",
      "client>database",
      "client>model",
      "repository>database",
    ]);
    expect(ranksOf(graph, order)).toEqual([
      "route 0",
      "controller 1",
      "middleware 1",
      "service 2",
      "client 3",
      "repository 3",
      "database 4",
      "model 4",
    ]);
  });

  it("orders by convention only layers that share a package (D-53, D-55)", () => {
    const graph = layerGraph(["component", "handler"], []);
    // Different packages of a monorepo: no arc, both rank 0.
    const separate = orderLayers(
      graph,
      options(graph, { packages: [new Set(["pkg:npm:web"]), new Set(["pkg:npm:api"])] }),
    );
    expect(separate.conventional).toEqual([]);
    expect(ranksOf(graph, separate)).toEqual(["component 0", "handler 0"]);
    // Files without a package share the package "" (review #22): handler (tier 1) before component (tier 2).
    const shared = orderLayers(graph, options(graph));
    expect(named(graph, shared.conventional)).toEqual(["handler>component"]);
    expect(ranksOf(graph, shared)).toEqual(["handler 0", "component 1"]);
    // Layers without a tier are never ordered by convention.
    const untiered = layerGraph(["adapter", "port"], []);
    expect(orderLayers(untiered, options(untiered)).conventional).toEqual([]);
  });

  /** A random layer graph with tiers and packages. */
  const randomInstance = fc.integer({ min: 2, max: 8 }).chain((k) =>
    fc.record({
      k: fc.constant(k),
      arcs: fc.uniqueArray(
        fc.tuple(
          fc.integer({ min: 0, max: k - 1 }),
          fc.integer({ min: 0, max: k - 1 }),
          fc.integer({ min: 1, max: 2048 }).map((n) => n / 1024),
        ),
        { maxLength: k * 3, selector: ([a, b]) => `${a} ${b}` },
      ),
      tiers: fc.array(fc.option(fc.integer({ min: 0, max: 4 }), { nil: undefined }), {
        minLength: k,
        maxLength: k,
      }),
      packages: fc.array(fc.subarray(["", "a", "b"], { minLength: 1 }), {
        minLength: k,
        maxLength: k,
      }),
      bound: fc.integer({ min: 2, max: 8 }),
    }),
  );

  it("yields a DAG in which every kept and every conventional arc goes to a higher rank (property)", () => {
    fc.assert(
      fc.property(randomInstance, ({ k, arcs, tiers, packages, bound }) => {
        const names = Array.from({ length: k }, (_, index) => `l${index}`);
        const graph = layerGraph(
          names,
          arcs.filter(([a, b]) => a !== b).map(([a, b, w]) => [`l${a}`, `l${b}`, w] as const),
        );
        const tierMap = new Map<string, number>();
        tiers.forEach((tier, index) => {
          if (tier !== undefined) tierMap.set(`l${index}`, tier);
        });
        const order = orderLayers(graph, {
          tiers: tierMap,
          exactOrderMaxLayers: bound,
          packages: packages.map((list) => new Set(list)),
        });
        const h = graph.graph;
        const { componentOf } = stronglyConnectedComponents(h);
        const rank = order.ranks;
        for (let a = 0; a < k; a++) {
          for (let e = h.outOffsets[a]!; e < h.outOffsets[a + 1]!; e++) {
            const b = h.outTargets[e]!;
            if (order.isRemoved[e] === 1) {
              // Upward dependencies are arcs inside a cycle of H.
              expect(componentOf[a]).toBe(componentOf[b]);
            } else {
              expect(rank[a]!).toBeLessThan(rank[b]!);
            }
          }
        }
        for (const [a, b] of order.conventional) {
          // Conventional arcs never create a cycle, follow the tiers and need a shared package.
          expect(rank[a]!).toBeLessThan(rank[b]!);
          expect(tierMap.get(`l${a}`)!).toBeLessThan(tierMap.get(`l${b}`)!);
          expect(packages[a]!.some((pkg) => packages[b]!.includes(pkg))).toBe(true);
          expect(h.hasEdge(a, b) || h.hasEdge(b, a)).toBe(false);
        }
        // Longest-path ranks: a layer of rank r > 0 has a predecessor of rank r − 1 in D, rank 0 none.
        const predecessors: number[][] = Array.from({ length: k }, () => []);
        for (let a = 0; a < k; a++) {
          for (let e = h.outOffsets[a]!; e < h.outOffsets[a + 1]!; e++) {
            if (order.isRemoved[e] === 0) predecessors[h.outTargets[e]!]!.push(a);
          }
        }
        for (const [a, b] of order.conventional) predecessors[b]!.push(a);
        for (let layer = 0; layer < k; layer++) {
          const best = Math.max(-1, ...predecessors[layer]!.map((p) => rank[p]!));
          expect(rank[layer]).toBe(best + 1);
        }
        // Large strongly connected sets are the approximated ones.
        for (const members of order.approximated) expect(members.length).toBeGreaterThan(bound);
      }),
      { seed: 53, numRuns: 400 },
    );
  });

  it("removes the minimum backward weight within each small cycle (property)", () => {
    fc.assert(
      fc.property(randomInstance, ({ k, arcs, tiers }) => {
        const names = Array.from({ length: k }, (_, index) => `l${index}`);
        const filtered = arcs.filter(([a, b]) => a !== b);
        const graph = layerGraph(
          names,
          filtered.map(([a, b, w]) => [`l${a}`, `l${b}`, w] as const),
        );
        const tierMap = new Map<string, number>();
        tiers.forEach((tier, index) => {
          if (tier !== undefined) tierMap.set(`l${index}`, tier);
        });
        const order = orderLayers(graph, options(graph, { tiers: tierMap }));
        const removedWeight = order.removed.reduce(
          (sum, [a, b]) => sum + graph.graph.weight(a, b),
          0,
        );
        // The best order of each strongly connected set, by brute force over its permutations.
        let expected = 0;
        for (const component of stronglyConnectedComponents(graph.graph).components) {
          if (component.length < 2) continue;
          const members = Array.from(component);
          const size = members.length;
          const weights = members.flatMap((a) => members.map((b) => graph.graph.weight(a, b)));
          const sequence = bruteForceOrder(
            weights,
            members.map((layer) => tierMap.get(`l${layer}`)),
          );
          for (let i = 0; i < size; i++) {
            for (let j = i + 1; j < size; j++)
              expected += weights[sequence[j]! * size + sequence[i]!]!;
          }
        }
        expect(removedWeight).toBe(expected);
      }),
      { seed: 2012, numRuns: 200 },
    );
  });
});

describe("layer graph files", () => {
  it("lists each depending file once per arc, sorted", () => {
    const model = syntheticModel({
      files: ["src/a/x.ts", "src/a/y.ts", "src/b/p.ts", "src/b/q.ts"],
      edges: [
        ["src/a/x.ts", "src/b/p.ts"],
        ["src/a/x.ts", "src/b/q.ts"],
        ["src/a/y.ts", "src/b/q.ts"],
      ],
    });
    const members: FileId[][] = [
      [fileId("src/a/x.ts"), fileId("src/a/y.ts")],
      [fileId("src/b/p.ts"), fileId("src/b/q.ts")],
    ];
    const graph = buildLayerGraph(
      model,
      { layers: ["a", "b"], members },
      { typeOnlyWeight: 0.5, minEdgeConfidence: 0.5, edgeKinds: EDGE_KINDS },
    );
    expect(graph.dependingFiles).toEqual([["file:src/a/x.ts", "file:src/a/y.ts"]]);
    expect([...graph.pairs]).toEqual([3]);
  });
});
