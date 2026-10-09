import { louvain, UndirectedGraph } from "@katedrala/graph";
import type * as Graph from "@katedrala/graph";
import type { LouvainOptions } from "@katedrala/graph";
import { fileId, inferredModuleKey, shortHash } from "@katedrala/ir";
import type { FileId } from "@katedrala/ir";
import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InferenceSettings } from "../types.js";
import { structuralClasses } from "./classes.js";
import type { ClassifiedNodes } from "./classes.js";
import { membersByUnit, priorUnits } from "./prior.js";
import type { PriorUnits } from "./prior.js";
import {
  arbitraryScope,
  partitionLines,
  testScope,
  withModuleSettings,
} from "./reference.test-support.js";
import type { TestArc, TestScopeSpec } from "./reference.test-support.js";
import {
  fileNameKey,
  fileNameWithoutExtension,
  LOUVAIN_OPTIONS,
  mergeSmallPieces,
  splitOversized,
} from "./split.js";
import { applyStemUnits } from "./stems.js";

// Spy on Louvain (the real implementation runs) to check what P4 passes to it (D-68).
vi.mock("@katedrala/graph", async (importOriginal) => {
  const actual = await importOriginal<typeof Graph>();
  return { ...actual, louvain: vi.fn(actual.louvain) };
});

beforeEach(() => {
  vi.mocked(louvain).mockClear();
});

/** Oversized above 5 nodes; pieces need 3 (the default). */
const SMALL = withModuleSettings({ maxModuleFiles: 5 });

interface Split {
  readonly prior: PriorUnits;
  readonly classified: ClassifiedNodes;
  /** Units after P4 as `key kind[*] = paths`, in unit order. */
  readonly units: string[];
}

/** P1–P4 on a test scope. */
function split(
  spec: TestScopeSpec,
  settings: InferenceSettings = SMALL,
  entryPoints: readonly string[] = [],
): Split {
  const scope = testScope(spec);
  const prior = priorUnits(scope, settings);
  const stems = applyStemUnits(scope, prior, settings);
  const classified = structuralClasses(
    scope,
    prior.partition,
    settings,
    new Set<FileId>(entryPoints.map((path) => fileId(path))),
  );
  splitOversized(scope, prior, classified, settings, stems);
  return { prior, classified, units: partitionLines(prior.paths, prior.partition) };
}

/** Arcs `a → b → c → a` among the paths. */
function triangle(a: string, b: string, c: string): TestArc[] {
  return [
    [a, b],
    [b, c],
    [c, a],
  ];
}

describe("fallback names (D-34)", () => {
  it("joins the token keys of the file name, extension included", () => {
    expect(fileNameKey("src/lib/formatDate.ts")).toBe("format-date-ts");
    expect(fileNameKey("src/lib/format_date.ts")).toBe("format-date-ts");
    expect(fileNameKey("src/lib/HTTPServer.v2.mjs")).toBe("http-server-v2-mjs");
    expect(fileNameKey("src/lib/__.ts")).toBe("ts");
    expect(fileNameKey("src/lib/---")).toBe("");
  });

  it("drops the last extension only", () => {
    expect(fileNameWithoutExtension("src/lib/formatDate.ts")).toBe("formatDate");
    expect(fileNameWithoutExtension("src/lib/a.b.ts")).toBe("a.b");
    expect(fileNameWithoutExtension("src/lib/.eslintrc")).toBe(".eslintrc");
    expect(fileNameWithoutExtension("Makefile")).toBe("Makefile");
  });
});

describe("LOUVAIN_OPTIONS (D-68)", () => {
  it("pins every Louvain parameter to the graph package's current defaults", () => {
    expect(LOUVAIN_OPTIONS).toEqual({
      resolution: 1,
      maxLevels: Number.POSITIVE_INFINITY,
      maxPasses: 1000,
      minModularityGain: 1e-12,
      minPassGain: 1e-7,
    });
    expect(Object.isFrozen(LOUVAIN_OPTIONS)).toBe(true);
    // Same result as the defaults on a graph with structure (two triangles and a bridge).
    const graph = UndirectedGraph.fromEdges(6, [0, 1, 2, 3, 4, 5, 0], [1, 2, 0, 4, 5, 3, 3]);
    expect(louvain(graph, LOUVAIN_OPTIONS)).toEqual(louvain(graph));
  });

  it("passes all five parameters and the warm start to louvain", () => {
    split({
      paths: [
        "src/main.ts",
        "src/billing/invoice-a.ts",
        "src/billing/invoice-b.ts",
        "src/billing/invoice-c.ts",
        "src/billing/tax-a.ts",
        "src/billing/tax-b.ts",
        "src/billing/tax-c.ts",
      ],
      arcs: [
        ...triangle(
          "src/billing/invoice-a.ts",
          "src/billing/invoice-b.ts",
          "src/billing/invoice-c.ts",
        ),
        ...triangle("src/billing/tax-a.ts", "src/billing/tax-b.ts", "src/billing/tax-c.ts"),
      ],
    });
    const calls = vi.mocked(louvain).mock.calls;
    expect(calls).toHaveLength(1);
    const options = calls[0]?.[1] as LouvainOptions;
    expect(options).toMatchObject(LOUVAIN_OPTIONS);
    for (const key of Object.keys(LOUVAIN_OPTIONS)) expect(options).toHaveProperty(key);
    // Stem labels by first occurrence in node order (invoice → 0, tax → 1).
    expect(Array.from(options.initialCommunities ?? [])).toEqual([0, 0, 0, 1, 1, 1]);
  });
});

describe("mergeSmallPieces (D-33)", () => {
  /** An undirected graph from `[u, v, weight]` triples. */
  const graphOf = (
    n: number,
    edges: readonly (readonly [number, number, number])[],
  ): UndirectedGraph =>
    UndirectedGraph.fromEdges(
      n,
      edges.map((e) => e[0]),
      edges.map((e) => e[1]),
      edges.map((e) => e[2]),
    );

  it("merges a small piece into the piece it shares the most weight with", () => {
    const graph = graphOf(7, [
      [0, 1, 1],
      [1, 2, 1],
      [3, 0, 0.5],
      [3, 4, 1],
      [4, 5, 1],
      [5, 6, 1],
    ]);
    const merged = mergeSmallPieces(graph, Int32Array.from([0, 0, 0, 1, 2, 2, 2]), 3, 3);
    expect([...merged.pieces]).toEqual([0, 0, 0, 1, 1, 1, 1]);
    expect(merged.count).toBe(2);
  });

  it("breaks ties toward the smaller piece index (exact sums, D-67)", () => {
    const graph = graphOf(7, [
      [0, 1, 1],
      [1, 2, 1],
      [3, 0, 0.5],
      [3, 1, 0.5],
      [3, 4, 1],
      [4, 5, 1],
      [5, 6, 1],
    ]);
    const merged = mergeSmallPieces(graph, Int32Array.from([0, 0, 0, 1, 2, 2, 2]), 3, 3);
    expect([...merged.pieces]).toEqual([0, 0, 0, 0, 1, 1, 1]);
  });

  it("merges every small piece simultaneously and repeats while small pieces have edges", () => {
    // Small pieces {0} and {1} point to each other (weight 2 beats 1); merged, {0, 1} is still small and
    // points to the large piece {2, 3, 4}.
    const graph = graphOf(5, [
      [0, 1, 2],
      [1, 2, 1],
      [2, 3, 1],
      [3, 4, 1],
    ]);
    const merged = mergeSmallPieces(graph, Int32Array.from([0, 1, 2, 2, 2]), 3, 3);
    expect([...merged.pieces]).toEqual([0, 0, 0, 0, 0]);
    expect(merged.count).toBe(1);
  });

  it("keeps small pieces without edges to other pieces, renumbered by smallest member", () => {
    const graph = graphOf(6, [
      [1, 2, 1],
      [2, 3, 1],
      [4, 1, 1],
    ]);
    const merged = mergeSmallPieces(graph, Int32Array.from([0, 1, 1, 1, 2, 3]), 4, 3);
    expect([...merged.pieces]).toEqual([0, 1, 1, 1, 1, 2]);
    expect(merged.count).toBe(3);
    // With a minimum size of 1 no piece is small.
    expect([...mergeSmallPieces(graph, Int32Array.from([0, 1, 1, 1, 2, 3]), 4, 1).pieces]).toEqual([
      0, 1, 1, 1, 2, 3,
    ]);
  });
});

describe("splitOversized (P4, §3.8)", () => {
  const billing = [
    "src/billing/invoice-a.ts",
    "src/billing/invoice-b.ts",
    "src/billing/invoice-c.ts",
    "src/billing/tax-a.ts",
    "src/billing/tax-b.ts",
    "src/billing/tax-c.ts",
  ];
  const billingArcs: readonly TestArc[] = [
    ...triangle("src/billing/invoice-a.ts", "src/billing/invoice-b.ts", "src/billing/invoice-c.ts"),
    ...triangle("src/billing/tax-a.ts", "src/billing/tax-b.ts", "src/billing/tax-c.ts"),
    ["src/billing/invoice-a.ts", "src/billing/tax-a.ts", 0.5],
  ];

  it("splits an oversized flat directory into keyed pieces and keeps the remainder (D-32, D-34)", () => {
    const result = split({
      paths: [
        "src/main.ts",
        ...billing,
        // A utility (3 other units depend on it) and a file without edges: both stay in the remainder.
        "src/billing/money.ts",
        "src/billing/helpers.ts",
        "src/a/x.ts",
        "src/b/y.ts",
        "src/c/z.ts",
      ],
      arcs: [
        ...billingArcs,
        ["src/a/x.ts", "src/billing/money.ts"],
        ["src/b/y.ts", "src/billing/money.ts"],
        ["src/c/z.ts", "src/billing/money.ts"],
      ],
    });
    expect(result.units).toEqual([
      "src root = src/main.ts",
      "src/a feature* = src/a/x.ts",
      "src/b feature* = src/b/y.ts",
      "src/billing feature* = src/billing/helpers.ts, src/billing/money.ts",
      "src/c feature* = src/c/z.ts",
      "src/billing#invoice split* = src/billing/invoice-a.ts, src/billing/invoice-b.ts, src/billing/invoice-c.ts",
      "src/billing#tax split* = src/billing/tax-a.ts, src/billing/tax-b.ts, src/billing/tax-c.ts",
    ]);
    const { units } = result.prior.partition;
    const oversized = { directory: "src/billing", nodes: 8 };
    expect(units[3]).toMatchObject({
      key: "src/billing",
      kind: "feature",
      destination: true,
      oversized,
    });
    expect(units[5]).toMatchObject({
      key: "src/billing#invoice",
      anchor: { directory: "src/billing", stem: "invoice" },
      kind: "split",
      destination: true,
      oversized,
    });
    expect(units[5]?.fallbackName).toBeUndefined();
  });

  it("maps community labels back through the induced subgraph (review #16)", () => {
    // The utility `src/billing/money.ts` sorts between the two triangles, so the subgraph's node numbers
    // differ from the scope's after it; the pieces must still hold the right files.
    const result = split({
      paths: [...billing, "src/billing/money.ts", "src/a/x.ts", "src/b/y.ts", "src/c/z.ts"],
      arcs: [
        ...billingArcs,
        ["src/a/x.ts", "src/billing/money.ts"],
        ["src/b/y.ts", "src/billing/money.ts"],
        ["src/c/z.ts", "src/billing/money.ts"],
        ["src/billing/money.ts", "src/billing/tax-c.ts"],
      ],
    });
    expect(result.units.filter((line) => line.includes(" split*"))).toEqual([
      "src/billing#invoice split* = src/billing/invoice-a.ts, src/billing/invoice-b.ts, src/billing/invoice-c.ts",
      "src/billing#tax split* = src/billing/tax-a.ts, src/billing/tax-b.ts, src/billing/tax-c.ts",
    ]);
  });

  it("never splits units of at most maxModuleFiles nodes, nor stem units (D-32)", () => {
    const flat = split({ paths: billing.slice(0, 5), arcs: billingArcs.slice(0, 3) });
    expect(flat.units).toEqual([`src/billing root = ${billing.slice(0, 5).join(", ")}`]);
    expect(vi.mocked(louvain)).not.toHaveBeenCalled();
    const stem = split(
      {
        paths: [
          "src/controllers/order.controller.ts",
          "src/services/order.service.ts",
          "src/repositories/order.repository.ts",
        ],
        arcs: [
          ["src/controllers/order.controller.ts", "src/services/order.service.ts"],
          ["src/services/order.service.ts", "src/repositories/order.repository.ts"],
        ],
      },
      withModuleSettings({ maxModuleFiles: 2 }),
    );
    expect(stem.units.at(-1)).toBe(
      "src#order stem* = src/controllers/order.controller.ts, src/repositories/order.repository.ts, src/services/order.service.ts",
    );
    expect(vi.mocked(louvain)).not.toHaveBeenCalled();
  });

  it("does not reuse the stems P2 applied in the same directory (D-34)", () => {
    const result = split({
      paths: [
        "src/controllers/order.controller.ts",
        "src/services/order.service.ts",
        "src/cart-a.ts",
        "src/cart-b.ts",
        "src/cart-c.ts",
        "src/order-list.ts",
        "src/order-view.ts",
        "src/order-x.ts",
      ],
      arcs: [
        ["src/controllers/order.controller.ts", "src/services/order.service.ts"],
        ...triangle("src/cart-a.ts", "src/cart-b.ts", "src/cart-c.ts"),
        ...triangle("src/order-list.ts", "src/order-view.ts", "src/order-x.ts"),
      ],
    });
    expect(result.units).toEqual([
      "src root = ",
      "src/controllers layer = ",
      "src/services layer = ",
      "src#order stem* = src/controllers/order.controller.ts, src/services/order.service.ts",
      "src#cart split* = src/cart-a.ts, src/cart-b.ts, src/cart-c.ts",
      "src#order-list-ts split* = src/order-list.ts, src/order-view.ts, src/order-x.ts",
    ]);
    expect(result.prior.partition.units[5]?.fallbackName).toBe("order-list");
    expect(result.prior.partition.units[0]).toMatchObject({
      key: "src",
      kind: "root",
      destination: false,
      oversized: { directory: "src", nodes: 6 },
    });
  });

  it("falls back to the file-name key, then to a hash of the path (D-34)", () => {
    const result = split({
      paths: [
        "src/main.ts",
        "src/lib/format-a.ts",
        "src/lib/format-b.ts",
        "src/lib/format-c.ts",
        "src/lib/format-d.ts",
        "src/lib/formatDate.ts",
        "src/lib/formatDateTime.ts",
        "src/lib/formatDay.ts",
        "src/lib/format_date.ts",
        "src/lib/format_day.ts",
        "src/lib/format_x.ts",
      ],
      arcs: [
        ["src/lib/format-a.ts", "src/lib/format-b.ts"],
        ["src/lib/format-b.ts", "src/lib/format-c.ts"],
        ["src/lib/format-c.ts", "src/lib/format-d.ts"],
        ...triangle("src/lib/formatDate.ts", "src/lib/formatDateTime.ts", "src/lib/formatDay.ts"),
        ...triangle("src/lib/format_date.ts", "src/lib/format_day.ts", "src/lib/format_x.ts"),
      ],
    });
    const hash = shortHash("src/lib/format_date.ts");
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(result.units).toEqual([
      "src root = src/main.ts",
      "src/lib shared = ",
      "src/lib#format split* = src/lib/format-a.ts, src/lib/format-b.ts, src/lib/format-c.ts, src/lib/format-d.ts",
      "src/lib#format-date-ts split* = src/lib/formatDate.ts, src/lib/formatDateTime.ts, src/lib/formatDay.ts",
      `src/lib#${hash} split* = src/lib/format_date.ts, src/lib/format_day.ts, src/lib/format_x.ts`,
    ]);
    expect(result.prior.partition.units.map((unit) => unit.fallbackName)).toEqual([
      undefined,
      undefined,
      undefined,
      "formatDate",
      "format_date",
    ]);
  });

  it("leaves a unit of composition roots and utilities whole, as its remainder", () => {
    const result = split(
      {
        paths: ["src/boot/m1.ts", "src/boot/m2.ts", "src/boot/m3.ts", "src/a/x.ts"],
        arcs: [
          ["src/boot/m1.ts", "src/a/x.ts"],
          ["src/boot/m2.ts", "src/a/x.ts"],
          ["src/boot/m3.ts", "src/a/x.ts"],
        ],
      },
      withModuleSettings({ maxModuleFiles: 2 }),
      ["src/boot/m1.ts", "src/boot/m2.ts", "src/boot/m3.ts"],
    );
    expect(result.units).toEqual([
      "src/a feature* = src/a/x.ts",
      "src/boot feature* = src/boot/m1.ts, src/boot/m2.ts, src/boot/m3.ts",
    ]);
    expect(result.prior.partition.units[1]?.oversized).toEqual({ directory: "src/boot", nodes: 3 });
    expect(vi.mocked(louvain)).not.toHaveBeenCalled();
  });

  it("forms connected pieces of at least minModuleFiles, without composition roots or utilities (property)", () => {
    let pieces = 0;
    fc.assert(
      fc.property(
        fc.boolean().chain((flat) => arbitraryScope({ maxFiles: 30, maxArcs: 70, flat })),
        fc.integer({ min: 2, max: 6 }),
        fc.integer({ min: 1, max: 4 }),
        ({ scope }, maxModuleFiles, minModuleFiles) => {
          const settings = withModuleSettings({ maxModuleFiles, minModuleFiles });
          const prior = priorUnits(scope, settings);
          const stems = applyStemUnits(scope, prior, settings);
          const classified = structuralClasses(scope, prior.partition, settings, new Set());
          const before = prior.partition.units.length;
          splitOversized(scope, prior, classified, settings, stems);
          const { units, unitOf } = prior.partition;
          const members = membersByUnit(unitOf, units.length);
          const keys = new Set(units.map((unit) => unit.key));
          expect(keys.size).toBe(units.length);
          const { graph } = scope.graph;
          units.forEach((unit, index) => {
            expect(unit.key).toBe(inferredModuleKey(unit.anchor));
            if (index < before) return;
            const nodes = [...(members[index] ?? [])];
            expect(unit.kind).toBe("split");
            expect(unit.oversized).toBeDefined();
            expect(nodes.length).toBeGreaterThanOrEqual(minModuleFiles);
            const inPiece = new Set(nodes);
            for (const node of nodes) expect(classified.excluded[node]).toBe(0);
            // Connected in the undirected view of the arcs among its members.
            const [first] = nodes;
            const seen = new Set([first]);
            const pending = [first];
            for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
              for (const other of [...graph.successors(node), ...graph.predecessors(node)]) {
                if (inPiece.has(other) && !seen.has(other)) {
                  seen.add(other);
                  pending.push(other);
                }
              }
            }
            expect(seen.size).toBe(nodes.length);
          });
          pieces += units.length - before;
        },
      ),
      { seed: 20261008, numRuns: 300 },
    );
    expect(pieces).toBeGreaterThan(0);
  });
});
