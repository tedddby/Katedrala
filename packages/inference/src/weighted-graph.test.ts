import { GraphError } from "@katedrala/graph";
import {
  compareStrings,
  externalId,
  fileId,
  packageId,
  parseSymbolId,
  symbolId,
} from "@katedrala/ir";
import type { EdgeEntity, EdgeKind, FileId, FileRole } from "@katedrala/ir";
import { DEFAULT_EDGE_KINDS } from "@katedrala/model";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  syntheticModel,
  prototypeFixtureNames,
  prototypeGraph,
  prototypeModel,
} from "./test-support.js";
import type { SyntheticEdgeSpec, SyntheticFileSpec } from "./test-support.js";
import type { WeightedFileGraph, WeightedGraphOptions } from "./types.js";
import { buildWeightedFileGraph, restrictWeightedGraph } from "./weighted-graph.js";

const SOURCE: ReadonlySet<FileRole> = new Set(["source"]);
const KINDS: ReadonlySet<EdgeKind> = new Set(DEFAULT_EDGE_KINDS);
const DEFAULTS: WeightedGraphOptions = {
  typeOnlyWeight: 0.5,
  minEdgeConfidence: 0.5,
  edgeKinds: KINDS,
  fileRoles: SOURCE,
};

/** Every arc as `source > target = weight`, in CSR order. */
function arcs(weighted: WeightedFileGraph): string[] {
  const name = (node: number): string => weighted.nodes[node]?.slice(5) ?? "?";
  return [...weighted.graph.edges()].map(([u, v, w]) => `${name(u)} > ${name(v)} = ${w}`);
}

/** Per node path: [admitted out-degree, re-export out-degree]. */
function degrees(weighted: WeightedFileGraph): Record<string, [number, number]> {
  return Object.fromEntries(
    weighted.nodes.map((node, index) => [
      node.slice(5),
      [weighted.admittedOutDegree[index]!, weighted.reexportOutDegree[index]!],
    ]),
  );
}

describe("buildWeightedFileGraph (§1.3)", () => {
  it("weighs runtime pairs 1, type-only pairs typeOnlyWeight, and drops pairs without admitted edges", () => {
    const model = syntheticModel({
      files: ["a.ts", "b.ts", "c.ts", "d.ts"],
      edges: [
        ["a.ts", "b.ts"],
        { source: "a.ts", target: "c.ts", typeOnly: true },
        { source: "a.ts", target: "d.ts", confidence: 0.3 },
        // Several relationships of one pair count once (§1.3: observation counts are ignored).
        { source: "b.ts", target: "c.ts", kind: "calls", observations: 30 },
        { source: "b.ts", target: "c.ts", kind: "imports" },
      ],
    });
    const weighted = buildWeightedFileGraph(model, DEFAULTS);
    expect(arcs(weighted)).toEqual(["a.ts > b.ts = 1", "a.ts > c.ts = 0.5", "b.ts > c.ts = 1"]);
    expect(degrees(weighted)).toEqual({
      "a.ts": [2, 0],
      "b.ts": [1, 0],
      "c.ts": [0, 0],
      "d.ts": [0, 0],
    });
    // Both directions are available, rows ascending.
    expect([...weighted.graph.predecessors(weighted.indexOf(fileId("c.ts")))]).toEqual([0, 1]);
    expect(weighted.graph.weight(weighted.indexOf(fileId("a.ts")), 2)).toBe(0.5);
  });

  it("decides runtime against type-only on admitted edges only (D-01)", () => {
    const model = syntheticModel({
      files: ["a.ts", "b.ts"],
      edges: [
        { source: "a.ts", target: "b.ts", kind: "calls", confidence: 0.3 },
        {
          source: "a.ts",
          target: "b.ts",
          kind: "references-type",
          typeOnly: true,
          confidence: 0.9,
        },
      ],
    });
    expect(arcs(buildWeightedFileGraph(model, DEFAULTS))).toEqual(["a.ts > b.ts = 0.5"]);
    // With a lower threshold the runtime edge is admitted too.
    expect(arcs(buildWeightedFileGraph(model, { ...DEFAULTS, minEdgeConfidence: 0.2 }))).toEqual([
      "a.ts > b.ts = 1",
    ]);
    // Above both, the pair has no evidence at all.
    const strict = buildWeightedFileGraph(model, { ...DEFAULTS, minEdgeConfidence: 0.95 });
    expect(arcs(strict)).toEqual([]);
    expect(degrees(strict)).toEqual({ "a.ts": [0, 0], "b.ts": [0, 0] });
    // The threshold is inclusive.
    expect(arcs(buildWeightedFileGraph(model, { ...DEFAULTS, minEdgeConfidence: 0.9 }))).toEqual([
      "a.ts > b.ts = 0.5",
    ]);
  });

  it("drops type-only pairs with type_only_weight 0 but still counts them for facades (D-04)", () => {
    const model = syntheticModel({
      files: ["src/index.ts", "src/a.ts", "src/b.ts", "src/c.ts"],
      edges: [
        { source: "src/index.ts", target: "src/a.ts", kind: "re-exports", typeOnly: true },
        { source: "src/index.ts", target: "src/b.ts", kind: "re-exports", typeOnly: true },
        { source: "src/index.ts", target: "src/c.ts", typeOnly: true },
        ["src/a.ts", "src/b.ts"],
      ],
    });
    const weighted = buildWeightedFileGraph(model, { ...DEFAULTS, typeOnlyWeight: 0 });
    expect(arcs(weighted)).toEqual(["src/a.ts > src/b.ts = 1"]);
    expect(degrees(weighted)["src/index.ts"]).toEqual([3, 2]);
    const halved = buildWeightedFileGraph(model, DEFAULTS);
    expect(arcs(halved)).toContain("src/index.ts > src/a.ts = 0.5");
    expect(degrees(halved)["src/index.ts"]).toEqual([3, 2]);
  });

  it("counts distinct targets for the facade test, re-exports only when admitted", () => {
    const model = syntheticModel({
      files: ["src/index.ts", "src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"],
      edges: [
        // re-exports and imports of one target: one target, re-exported
        { source: "src/index.ts", target: "src/a.ts", kind: "re-exports" },
        { source: "src/index.ts", target: "src/a.ts", kind: "imports" },
        { source: "src/index.ts", target: "src/b.ts", kind: "re-exports" },
        // a re-export below the confidence threshold next to an admitted import: not a re-export
        { source: "src/index.ts", target: "src/c.ts", kind: "re-exports", confidence: 0.4 },
        { source: "src/index.ts", target: "src/c.ts", kind: "imports" },
        // only a low-confidence re-export: not admitted at all
        { source: "src/index.ts", target: "src/d.ts", kind: "re-exports", confidence: 0.1 },
      ],
    });
    expect(degrees(buildWeightedFileGraph(model, DEFAULTS))["src/index.ts"]).toEqual([3, 2]);
  });

  it("excludes files, their arcs and their degrees", () => {
    const model = syntheticModel({
      files: ["src/a.ts", "src/b.ts", "src/payments/c.ts"],
      edges: [
        ["src/a.ts", "src/b.ts"],
        ["src/a.ts", "src/payments/c.ts"],
        { source: "src/payments/c.ts", target: "src/b.ts", kind: "re-exports" },
      ],
    });
    const weighted = buildWeightedFileGraph(model, {
      ...DEFAULTS,
      exclude: new Set([fileId("src/payments/c.ts")]),
    });
    expect(weighted.nodes).toEqual([fileId("src/a.ts"), fileId("src/b.ts")]);
    expect(arcs(weighted)).toEqual(["src/a.ts > src/b.ts = 1"]);
    expect(degrees(weighted)).toEqual({ "src/a.ts": [1, 0], "src/b.ts": [0, 0] });
    expect(weighted.indexOf(fileId("src/payments/c.ts"))).toBe(-1);
  });

  it("has the admitted files as nodes, sorted by UTF-16 code units", () => {
    const model = syntheticModel({
      files: [
        "src/b.ts",
        "src/B.ts",
        "src/a-b.ts",
        "src/é.ts",
        { path: "src/a.test.ts", role: "test" },
        { path: "src/types.d.ts", role: "declaration" },
        { path: "package.json", role: "configuration" },
      ],
    });
    const weighted = buildWeightedFileGraph(model, DEFAULTS);
    const expected = ["src/B.ts", "src/a-b.ts", "src/b.ts", "src/é.ts"].map((path) => fileId(path));
    expect(weighted.nodes).toEqual(expected);
    expect(Object.isFrozen(weighted.nodes)).toBe(true);
    expected.forEach((node, index) => {
      expect(weighted.indexOf(node)).toBe(index);
    });
    expect(weighted.indexOf(fileId("src/a.test.ts"))).toBe(-1);
    expect(weighted.graph.nodeCount).toBe(4);
    const withTests = buildWeightedFileGraph(model, {
      ...DEFAULTS,
      fileRoles: new Set<FileRole>(["source", "test", "declaration"]),
    });
    expect(withTests.nodes).toHaveLength(6);
  });

  it("lifts symbol relationships to files and ignores relationships within a file", () => {
    const model = syntheticModel({
      files: [
        { path: "src/order.service.ts", classes: ["OrderService"] },
        { path: "src/payment.ts", symbols: [{ name: "charge" }] },
        { path: "src/user.ts" },
      ],
      edges: [
        {
          source: symbolId("src/order.service.ts", "OrderService"),
          target: symbolId("src/payment.ts", "charge"),
          kind: "calls",
        },
        {
          source: "src/order.service.ts",
          target: symbolId("src/order.service.ts", "OrderService"),
        },
        // An unlisted symbol of a listed file is lifted through its identifier.
        { source: symbolId("src/user.ts", "User.name"), target: "src/payment.ts", kind: "uses" },
        // Externals and packages are never file nodes.
        { source: "src/user.ts", target: externalId("npm", "zod") },
        { source: packageId("npm", ""), target: "src/user.ts", kind: "depends-on-package" },
      ],
    });
    expect(arcs(buildWeightedFileGraph(model, DEFAULTS))).toEqual([
      "src/order.service.ts > src/payment.ts = 1",
      "src/user.ts > src/payment.ts = 1",
    ]);
  });

  it("lifts only the given relationship kinds and admits only the given file roles", () => {
    const model = syntheticModel({
      files: ["src/a.ts", "src/b.ts", { path: "test/a.test.ts", role: "test" }],
      edges: [
        { source: "src/a.ts", target: "src/b.ts", kind: "calls" },
        { source: "test/a.test.ts", target: "src/a.ts" },
        {
          source: symbolId("src/b.ts", "suite"),
          target: "src/a.ts",
          kind: "x-plugin",
        },
      ],
    });
    expect(
      arcs(
        buildWeightedFileGraph(model, { ...DEFAULTS, edgeKinds: new Set<EdgeKind>(["imports"]) }),
      ),
    ).toEqual([]);
    expect(arcs(buildWeightedFileGraph(model, DEFAULTS))).toEqual(["src/a.ts > src/b.ts = 1"]);
    expect(
      arcs(
        buildWeightedFileGraph(model, {
          ...DEFAULTS,
          edgeKinds: new Set<EdgeKind>(["imports", "calls", "x-plugin"]),
          fileRoles: new Set<FileRole>(["source", "test"]),
        }),
      ),
    ).toEqual([
      "src/a.ts > src/b.ts = 1",
      "src/b.ts > src/a.ts = 1",
      "test/a.test.ts > src/a.ts = 1",
    ]);
  });

  it("weighs type-only relationships whatever include_type_only says (D-02)", () => {
    const model = syntheticModel({
      files: ["a.ts", "b.ts"],
      edges: [{ source: "a.ts", target: "b.ts", kind: "references-type", typeOnly: true }],
    });
    // The metrics projection without type-only edges does not change the inference graph.
    expect(model.projection({ level: "file", includeTypeOnly: false }).graph.edgeCount).toBe(0);
    expect(arcs(buildWeightedFileGraph(model, DEFAULTS))).toEqual(["a.ts > b.ts = 0.5"]);
  });

  it("uses exact dyadic weights (D-67)", () => {
    const model = syntheticModel({
      files: ["a.ts", "b.ts", "c.ts"],
      edges: [
        { source: "a.ts", target: "b.ts", typeOnly: true },
        { source: "c.ts", target: "b.ts", typeOnly: true },
      ],
    });
    const weighted = buildWeightedFileGraph(model, { ...DEFAULTS, typeOnlyWeight: 3 / 1024 });
    expect([...weighted.graph.inWeights]).toEqual([3 / 1024, 3 / 1024]);
    for (const typeOnlyWeight of [0.3, -0.5, 1.5, 1 / 3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => buildWeightedFileGraph(model, { ...DEFAULTS, typeOnlyWeight })).toThrow(
        RangeError,
      );
    }
    for (const typeOnlyWeight of [0, 1 / 1024, 0.25, 1]) {
      expect(() => buildWeightedFileGraph(model, { ...DEFAULTS, typeOnlyWeight })).not.toThrow();
    }
    expect(() =>
      buildWeightedFileGraph(model, { ...DEFAULTS, minEdgeConfidence: Number.NaN }),
    ).toThrow(RangeError);
  });

  it("is empty for a document without admitted files", () => {
    const weighted = buildWeightedFileGraph(
      syntheticModel({ files: [{ path: "README.md", role: "documentation" }] }),
      DEFAULTS,
    );
    expect(weighted.nodes).toEqual([]);
    expect(weighted.graph.nodeCount).toBe(0);
    expect(weighted.admittedOutDegree).toHaveLength(0);
  });
});

describe("restrictWeightedGraph (D-03)", () => {
  const model = syntheticModel({
    files: ["p/a.ts", "p/b.ts", "p/c.ts", "q/d.ts", "q/e.ts"],
    edges: [
      ["p/a.ts", "p/b.ts"],
      { source: "p/a.ts", target: "q/d.ts", kind: "re-exports" },
      { source: "p/b.ts", target: "p/c.ts", typeOnly: true },
      ["q/d.ts", "q/e.ts"],
      ["q/e.ts", "p/a.ts"],
    ],
  });
  const full = buildWeightedFileGraph(model, DEFAULTS);

  it("induces the subgraph through { graph, mapping } with re-indexed nodes", () => {
    const scope = restrictWeightedGraph(full, Int32Array.from([2, 0, 1, 0]));
    expect(scope.nodes).toEqual([fileId("p/a.ts"), fileId("p/b.ts"), fileId("p/c.ts")]);
    expect(arcs(scope)).toEqual(["p/a.ts > p/b.ts = 1", "p/b.ts > p/c.ts = 0.5"]);
    expect(scope.indexOf(fileId("p/c.ts"))).toBe(2);
    expect(scope.indexOf(fileId("q/d.ts"))).toBe(-1);
    const other = restrictWeightedGraph(full, Int32Array.from([3, 4]));
    expect(arcs(other)).toEqual(["q/d.ts > q/e.ts = 1"]);
    expect(other.indexOf(fileId("q/e.ts"))).toBe(1);
  });

  it("carries the degree arrays along, counting targets outside the selection (D-04)", () => {
    const scope = restrictWeightedGraph(full, Int32Array.from([0, 1, 2]));
    expect(degrees(scope)).toEqual({ "p/a.ts": [2, 1], "p/b.ts": [1, 0], "p/c.ts": [0, 0] });
  });

  it("restricts to nothing, and to everything without change", () => {
    const none = restrictWeightedGraph(full, new Int32Array(0));
    expect(none.nodes).toEqual([]);
    expect(none.graph.edgeCount).toBe(0);
    const all = restrictWeightedGraph(full, Int32Array.from([4, 3, 2, 1, 0]));
    expect(all.nodes).toEqual(full.nodes);
    expect(arcs(all)).toEqual(arcs(full));
    expect(degrees(all)).toEqual(degrees(full));
  });

  it("rejects nodes that are not nodes of the graph", () => {
    expect(() => restrictWeightedGraph(full, Int32Array.from([5]))).toThrow(GraphError);
    expect(() => restrictWeightedGraph(full, Int32Array.from([-1]))).toThrow(GraphError);
  });
});

// ─── Properties ─────────────────────────────────────────────────────────────────────────────────────

const ROLES = ["source", "test", "declaration", "configuration"] as const;
const EDGE_KINDS = [
  "imports",
  "re-exports",
  "calls",
  "uses",
  "references-type",
  "depends-on-package",
  "x-plugin",
] as const;

interface RandomCase {
  readonly files: readonly SyntheticFileSpec[];
  readonly edges: readonly SyntheticEdgeSpec[];
  readonly options: WeightedGraphOptions;
}

const fileCount = 6;
const pathOf = (index: number): string => `src/f${index}.ts`;

/** An edge endpoint: a file, one of its symbols (listed, with a declared role, or unlisted), or not code. */
const endpoint = fc.oneof(
  { arbitrary: fc.nat(fileCount - 1).map((file) => pathOf(file)), weight: 6 },
  { arbitrary: fc.nat(fileCount - 1).map((file) => symbolId(pathOf(file), "Listed")), weight: 2 },
  { arbitrary: fc.nat(fileCount - 1).map((file) => symbolId(pathOf(file), "Suite")), weight: 1 },
  { arbitrary: fc.nat(fileCount - 1).map((file) => symbolId(pathOf(file), "Unlisted")), weight: 1 },
  { arbitrary: fc.constant(externalId("npm", "zod")), weight: 1 },
  { arbitrary: fc.constant(packageId("npm", "")), weight: 1 },
  { arbitrary: fc.constant("src/missing.ts"), weight: 1 },
);

const role = fc.oneof(
  { arbitrary: fc.constant<FileRole>("source"), weight: 6 },
  { arbitrary: fc.constantFrom<FileRole>(...ROLES), weight: 2 },
);

const randomCase: fc.Arbitrary<RandomCase> = fc.record({
  files: fc.array(role, { minLength: fileCount, maxLength: fileCount }).map((roles) =>
    roles.map((fileRole, index): SyntheticFileSpec => ({
      path: pathOf(index),
      role: fileRole,
      symbols: [{ name: "Listed" }, { name: "Suite", role: "test" }],
    })),
  ),
  edges: fc.array(
    fc.record({
      source: endpoint,
      target: endpoint,
      kind: fc.oneof(
        { arbitrary: fc.constantFrom<EdgeKind>("imports", "re-exports"), weight: 2 },
        { arbitrary: fc.constantFrom<EdgeKind>(...EDGE_KINDS), weight: 2 },
      ),
      typeOnly: fc.boolean(),
      confidence: fc.constantFrom(0.2, 0.5, 0.7, 1),
    }),
    { minLength: 4, maxLength: 30 },
  ),
  options: fc.record({
    // D-67: weights from the 1/1024 lattice; 0 (type-only pairs are no arcs) and 1 drawn often.
    typeOnlyWeight: fc.oneof(
      fc.constantFrom(0, 0.5, 1),
      fc.integer({ min: 0, max: 1024 }).map((k) => k / 1024),
    ),
    minEdgeConfidence: fc.constantFrom(0, 0.5, 0.7, 1),
    edgeKinds: fc.oneof(
      fc.constant(new Set<EdgeKind>(DEFAULT_EDGE_KINDS)),
      fc.subarray([...EDGE_KINDS]).map((kinds) => new Set<EdgeKind>(kinds)),
    ),
    fileRoles: fc.oneof(
      fc.constant(new Set<FileRole>(["source"])),
      fc
        .subarray<FileRole>(["source", "test", "declaration"], { minLength: 1 })
        .map((roles) => new Set(roles)),
    ),
    exclude: fc
      .subarray(
        Array.from({ length: fileCount }, (_, index) => fileId(pathOf(index))),
        { maxLength: 2 },
      )
      .map((files) => new Set<FileId>(files)),
  }),
});

/**
 * The weighted graph computed directly from the document's edges (after the merging of repeated
 * relationships), without projections.
 */
function bruteForce(
  sample: RandomCase,
  edges: readonly EdgeEntity[],
): {
  nodes: FileId[];
  arcs: string[];
  degrees: Record<string, [number, number]>;
} {
  const { files, options } = sample;
  const roleOf = new Map(files.map((file) => [file.path, file.role ?? "source"] as const));
  /** The file of an admitted endpoint, else undefined (projection admission rules). */
  const admittedFile = (node: string): string | undefined => {
    const symbol = parseSymbolId(node);
    const path = node.startsWith("file:") ? node.slice(5) : symbol?.path;
    if (path === undefined) return undefined;
    const fileRole = roleOf.get(path);
    if (fileRole === undefined || !options.fileRoles.has(fileRole)) return undefined;
    // The symbol `Suite` declares the role `test`; other symbols take their file's role.
    if (symbol?.qualifiedName === "Suite" && !options.fileRoles.has("test")) return undefined;
    return path;
  };
  const nodes = files
    .filter((file) => options.fileRoles.has(file.role ?? "source"))
    .map((file) => fileId(file.path))
    .filter((id) => options.exclude?.has(id) !== true)
    .sort(compareStrings);
  const kept = new Set<string>(nodes);
  const pairs = new Map<string, { admitted: boolean; runtime: boolean; reexport: boolean }>();
  for (const edge of edges) {
    if (!options.edgeKinds.has(edge.kind)) continue;
    const source = admittedFile(edge.source);
    const target = admittedFile(edge.target);
    if (source === undefined || target === undefined || source === target) continue;
    if (!kept.has(fileId(source)) || !kept.has(fileId(target))) continue;
    const key = `${source} > ${target}`;
    const pair = pairs.get(key) ?? { admitted: false, runtime: false, reexport: false };
    pairs.set(key, pair);
    if (edge.confidence < options.minEdgeConfidence) continue;
    pair.admitted = true;
    if (!edge.typeOnly) pair.runtime = true;
    if (edge.kind === "re-exports") pair.reexport = true;
  }
  const degreesOf: Record<string, [number, number]> = Object.fromEntries(
    nodes.map((node) => [node.slice(5), [0, 0] as [number, number]]),
  );
  const expectedArcs: string[] = [];
  for (const key of [...pairs.keys()].sort(compareStrings)) {
    const pair = pairs.get(key)!;
    if (!pair.admitted) continue;
    const counts = degreesOf[key.split(" > ")[0]!]!;
    counts[0]++;
    if (pair.reexport) counts[1]++;
    const weight = pair.runtime ? 1 : options.typeOnlyWeight;
    if (weight > 0) expectedArcs.push(`${key} = ${weight}`);
  }
  return { nodes, arcs: expectedArcs, degrees: degreesOf };
}

describe("properties", () => {
  it("weights and degrees equal a brute-force recomputation from document edges", () => {
    const seen = { arcs: 0, typeOnlyArcs: 0, zeroWeightPairs: 0, reexports: 0 };
    fc.assert(
      fc.property(randomCase, (sample) => {
        const model = syntheticModel({ files: sample.files, edges: sample.edges });
        const weighted = buildWeightedFileGraph(model, sample.options);
        const expected = bruteForce(sample, model.document.edges);
        expect(weighted.nodes).toEqual(expected.nodes);
        // Paths sort like their file ids here (same prefix), so CSR order is the sorted order.
        expect(arcs(weighted)).toEqual(expected.arcs);
        expect(degrees(weighted)).toEqual(expected.degrees);
        weighted.nodes.forEach((node, index) => {
          expect(weighted.indexOf(node)).toBe(index);
        });
        seen.arcs += weighted.graph.edgeCount;
        seen.typeOnlyArcs += [...weighted.graph.outWeights].filter((w) => w < 1).length;
        const admitted = weighted.admittedOutDegree.reduce((sum, count) => sum + count, 0);
        seen.zeroWeightPairs += admitted - weighted.graph.edgeCount;
        seen.reexports += weighted.reexportOutDegree.reduce((sum, count) => sum + count, 0);
      }),
      { seed: 20261008, numRuns: 500 },
    );
    // The generated documents exercise every case.
    for (const count of Object.values(seen)) expect(count).toBeGreaterThan(20);
  });

  it("restriction equals the brute-force induced subgraph", () => {
    fc.assert(
      fc.property(
        randomCase,
        fc.array(fc.nat(fileCount - 1), { maxLength: fileCount }),
        (sample, picks) => {
          const model = syntheticModel({ files: sample.files, edges: sample.edges });
          const weighted = buildWeightedFileGraph(model, sample.options);
          const selection = picks.filter((pick) => pick < weighted.nodes.length);
          const restricted = restrictWeightedGraph(weighted, Int32Array.from(selection));
          const chosen = [...new Set(selection)].sort((a, b) => a - b);
          expect(restricted.nodes).toEqual(chosen.map((node) => weighted.nodes[node]));
          const names = new Set(restricted.nodes.map((node) => node.slice(5)));
          expect(arcs(restricted)).toEqual(
            arcs(weighted).filter((arc) => {
              const [source = "", rest = ""] = arc.split(" > ");
              return names.has(source) && names.has(rest.split(" = ")[0] ?? "");
            }),
          );
          const all = degrees(weighted);
          expect(degrees(restricted)).toEqual(
            Object.fromEntries([...names].map((name) => [name, all[name]])),
          );
        },
      ),
      { seed: 20261008, numRuns: 200 },
    );
  });
});

describe("prototype graphs", () => {
  it("reproduce the prototype's weighted graph on every fixture", () => {
    for (const name of prototypeFixtureNames()) {
      const graph = prototypeGraph(name);
      const sources = new Set(
        [...graph.files].filter(([, role]) => role === "source").map(([path]) => path),
      );
      // m5/infer3.py, run(): source-file pairs, 0.5 when type-only, else 1.
      const expected = graph.pairs
        .filter((pair) => sources.has(pair.source) && sources.has(pair.target))
        .filter((pair) => pair.source !== pair.target)
        .sort((a, b) => compareStrings(a.source, b.source) || compareStrings(a.target, b.target))
        .map((pair) => `${pair.source} > ${pair.target} = ${pair.typeOnly ? 0.5 : 1}`);
      const weighted = buildWeightedFileGraph(prototypeModel(name), DEFAULTS);
      expect(arcs(weighted), name).toEqual(expected);
      expect(
        weighted.nodes.map((node) => node.slice(5)),
        name,
      ).toEqual([...sources]);
    }
  });
});
