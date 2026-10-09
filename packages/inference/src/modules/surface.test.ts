import { compareStrings, fileId, parentPath } from "@katedrala/ir";
import type { EdgeKind, FileId, FileRole, ModuleId } from "@katedrala/ir";
import { DEFAULT_EDGE_KINDS } from "@katedrala/model";
import type { ArchitectureModel, ProjectionOptions } from "@katedrala/model";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolveInferenceSettings } from "../settings.js";
import { prototypeModel, syntheticModel } from "../test-support.js";
import type { DeclaredModuleSpec, InferenceSettings, Scope } from "../types.js";
import { DESIGN_CLUSTERINGS } from "./design-clusterings.test-support.js";
import { METRICS_PROJECTION, handStage } from "./hand-built.test-support.js";
import type { HandClusteringSpec, HandStage } from "./hand-built.test-support.js";
import { moduleSurface } from "./surface.js";
import type { ModuleSurfaces } from "./surface.js";

/** Paths of file ids. */
function paths(files: readonly string[]): string[] {
  return files.map((file) => file.slice("file:".length));
}

/** `module id → surface` of a stage, with paths. */
function surfacesOf(
  stage: HandStage,
  surfaces: ModuleSurfaces,
): Record<string, { entryPoints: string[]; publicApi: string[]; packages: string[] }> {
  const result: Record<string, { entryPoints: string[]; publicApi: string[]; packages: string[] }> =
    {};
  stage.declared.modules.forEach((module, index) => {
    const surface = surfaces.declared[index];
    if (surface === undefined) return;
    result[module.id] = {
      entryPoints: paths(surface.entryPoints),
      publicApi: paths(surface.publicApi),
      packages: [...surface.packages],
    };
  });
  stage.inferred.forEach(({ ids }, scope) => {
    ids.forEach((id, unit) => {
      const surface = surfaces.inferred[scope]?.[unit];
      if (surface === undefined) return;
      result[id] = {
        entryPoints: paths(surface.entryPoints),
        publicApi: paths(surface.publicApi),
        packages: [...surface.packages],
      };
    });
  });
  return result;
}

function surface(
  model: ArchitectureModel,
  stage: HandStage,
  projection: ProjectionOptions = METRICS_PROJECTION,
): ReturnType<typeof surfacesOf> {
  const surfaces = moduleSurface({
    model,
    settings: stage.settings,
    projection,
    declared: stage.declared,
    inferred: stage.inferred,
    attachments: stage.attachments,
  });
  return surfacesOf(stage, surfaces);
}

const model = syntheticModel({
  files: [
    "src/main.ts",
    "src/orders/index.ts",
    "src/orders/api.ts",
    "src/orders/order.ts",
    "src/orders/sub/index.ts",
    "src/orders/sub/line.ts",
    "src/payments/payment.ts",
    "src/payments/gateway.ts",
    "src/legacy/index.ts",
    "src/legacy/barrel.ts",
    "src/legacy/legacy.ts",
    { path: "src/legacy/index.test.ts", role: "test" },
    { path: "test/legacy/legacy.test.ts", role: "test" },
    "src/explicit/a.ts",
    "src/explicit/b.ts",
    { path: "src/orders/index.test.ts", role: "test" },
    { path: "src/orders/types.d.ts", role: "declaration" },
    { path: "src/stray.d.ts", role: "declaration" },
  ],
  packages: [{ path: "", name: "shop" }],
  edges: [
    { source: "src/orders/index.ts", target: "src/orders/order.ts", kind: "re-exports" },
    { source: "src/orders/api.ts", target: "src/orders/order.ts", kind: "re-exports" },
    { source: "src/orders/api.ts", target: "src/orders/sub/line.ts", kind: "re-exports" },
    { source: "src/legacy/barrel.ts", target: "src/legacy/legacy.ts", kind: "re-exports" },
    // Public API: imports and re-exports from other modules (D-63).
    ["src/main.ts", "src/orders/index.ts"],
    { source: "src/payments/payment.ts", target: "src/orders/order.ts", kind: "calls" },
    { source: "src/payments/gateway.ts", target: "src/orders/api.ts", typeOnly: true },
    { source: "src/payments/payment.ts", target: "src/legacy/legacy.ts", kind: "re-exports" },
    ["src/legacy/legacy.ts", "src/explicit/a.ts"],
    // Within one module: never public.
    ["src/orders/order.ts", "src/orders/sub/line.ts"],
    // From a file in no module (a declaration nothing depends on): does not count.
    ["src/stray.d.ts", "src/explicit/b.ts"],
    // From attached files: the test is outside the metrics projection, the declaration inside.
    ["src/orders/index.test.ts", "src/payments/payment.ts"],
    ["src/orders/index.test.ts", "src/orders/order.ts"],
    ["src/orders/index.test.ts", "src/orders/sub/line.ts"],
    ["src/orders/types.d.ts", "src/payments/gateway.ts"],
    ["src/orders/order.ts", "src/orders/types.d.ts"],
  ],
});

const DECLARED: DeclaredModuleSpec[] = [
  {
    name: "explicit",
    files: [fileId("src/explicit/a.ts"), fileId("src/explicit/b.ts")],
    entry: [fileId("src/explicit/b.ts"), fileId("src/main.ts")],
  },
  {
    name: "legacy",
    files: [
      "src/legacy/barrel.ts",
      "src/legacy/index.test.ts",
      "src/legacy/index.ts",
      "src/legacy/legacy.ts",
      "test/legacy/legacy.test.ts",
    ].map((path) => fileId(path)),
  },
];

const clustering = (): HandClusteringSpec => ({
  units: [
    { anchor: { directory: "src" }, kind: "root", members: ["src/main.ts"] },
    {
      anchor: { directory: "src/orders" },
      kind: "feature",
      members: [
        "src/orders/index.ts",
        "src/orders/api.ts",
        "src/orders/order.ts",
        "src/orders/sub/index.ts",
        "src/orders/sub/line.ts",
      ],
    },
    {
      anchor: { directory: "src", stem: "payment" },
      kind: "stem",
      members: ["src/payments/payment.ts", "src/payments/gateway.ts"],
    },
  ],
  orchestrators: { "src/main.ts": [1, 1] },
  facades: ["src/orders/index.ts", "src/orders/api.ts"],
});

/** The stage: `src/orders/index.test.ts` and `src/orders/types.d.ts` are attached to `mod:src/orders`. */
function stageOf(settings: InferenceSettings = resolveInferenceSettings()): HandStage {
  return handStage(model, clustering, { settings, declared: DECLARED });
}

describe("moduleSurface (P8, §3.12)", () => {
  it("finds entry points: index files and barrels directly in the anchor, declared entry, D-43", () => {
    const stage = stageOf();
    expect([...stage.attachments.moduleOf]).toEqual([
      ["file:src/orders/index.test.ts", "mod:src/orders"],
      ["file:src/orders/types.d.ts", "mod:src/orders"],
    ]);
    const result = surface(model, stage);
    expect(result["mod:src/orders"]?.entryPoints).toEqual([
      "src/orders/api.ts",
      "src/orders/index.ts",
    ]);
    // Stem modules: the members lie below the anchor's layer directories.
    expect(result["mod:src#payment"]?.entryPoints).toEqual([]);
    // Declared, entry configured: entry ∩ members.
    expect(result["mod:explicit"]?.entryPoints).toEqual(["src/explicit/b.ts"]);
    // Declared without entry (D-43): index files and barrels in the common directory of the members with
    // node roles; tests in test/ do not move it, and a test named index.* is no entry point.
    expect(result["mod:legacy"]?.entryPoints).toEqual([
      "src/legacy/barrel.ts",
      "src/legacy/index.ts",
    ]);
  });

  it("lists as public API the members other modules import or re-export from (D-63)", () => {
    const result = surface(model, stageOf());
    expect(result["mod:src/orders"]?.publicApi).toEqual([
      "src/orders/api.ts",
      "src/orders/index.ts",
    ]);
    // `src/payments/gateway.ts` is imported only by an attached declaration of another module.
    expect(result["mod:src#payment"]?.publicApi).toEqual(["src/payments/gateway.ts"]);
    expect(result["mod:legacy"]?.publicApi).toEqual(["src/legacy/legacy.ts"]);
    expect(result["mod:explicit"]?.publicApi).toEqual(["src/explicit/a.ts"]);
    expect(result["mod:src"]?.publicApi).toEqual([]);
  });

  it("follows the metrics projection's type-only setting and file roles", () => {
    const withoutTypeOnly = surface(model, stageOf(), {
      ...METRICS_PROJECTION,
      includeTypeOnly: false,
    });
    expect(withoutTypeOnly["mod:src/orders"]?.publicApi).toEqual(["src/orders/index.ts"]);
    // With tests in the metrics, the attached test's import of payment.ts counts.
    const settings = resolveInferenceSettings(undefined, { includeTestsInMetrics: true });
    const stage = stageOf(settings);
    expect(stage.attachments.moduleOf.get(fileId("src/orders/index.test.ts"))).toBe(
      "mod:src/orders",
    );
    const withTests = surface(model, stage, {
      ...METRICS_PROJECTION,
      fileRoles: new Set<FileRole>(["declaration", "source", "test"]),
    });
    expect(withTests["mod:src#payment"]?.publicApi).toEqual([
      "src/payments/gateway.ts",
      "src/payments/payment.ts",
    ]);
    // Attached files are never listed, and a projection without declarations drops their imports.
    const sourcesOnly = surface(model, stageOf(), {
      ...METRICS_PROJECTION,
      fileRoles: new Set<FileRole>(["source"]),
    });
    expect(sourcesOnly["mod:src#payment"]?.publicApi).toEqual([]);
  });

  it("lists the packages of every member, attached files included", () => {
    const result = surface(model, stageOf());
    expect(result["mod:src/orders"]?.packages).toEqual(["pkg:npm:"]);
    const spanning = syntheticModel({
      files: ["a/x.ts", "b/y.ts", "c.ts"],
      packages: ["a", "b"],
    });
    const stage = handStage(
      spanning,
      (scope): HandClusteringSpec => ({
        units: scope.graph.nodes.map((node) => ({
          anchor: { directory: parentPath(node.slice(5)) },
          kind: "feature",
          members: [node.slice(5)],
        })),
      }),
      { declared: [{ name: "both", files: [fileId("a/x.ts"), fileId("b/y.ts")] }] },
    );
    const result2 = surface(spanning, stage);
    expect(result2["mod:both"]?.packages).toEqual(["pkg:npm:a", "pkg:npm:b"]);
    // `c.ts` has no package, so its module has none either.
    expect(Object.keys(result2).sort(compareStrings)).toEqual(["mod:.", "mod:both"]);
    expect(result2["mod:."]?.packages).toEqual([]);
  });

  it("keeps clean-architecture's barrel as the domain's public API, not its ports (D-63)", () => {
    const clean = prototypeModel("clean-architecture");
    const design = DESIGN_CLUSTERINGS["clean-architecture"];
    if (design === undefined) throw new Error("missing design clustering");
    const stage = handStage(clean, () => design);
    const domain = surface(clean, stage)["mod:src/domain"];
    expect(domain?.entryPoints).toEqual(["src/domain/index.ts"]);
    expect(domain?.publicApi).toContain("src/domain/index.ts");
    expect(domain?.publicApi).not.toContain("src/domain/ports/member-repository.ts");
    // The replay's list: the barrel plus the eight domain files other layers import directly (7.3).
    expect(domain?.publicApi).toHaveLength(9);
  });

  it("equals a brute-force recomputation from the document's edges (property)", () => {
    const files = ["a/a1.ts", "a/a2.ts", "b/b1.ts", "b/b2.ts", "c/c1.ts", "d/d1.ts", "a/t.test.ts"];
    const kinds: readonly EdgeKind[] = ["imports", "re-exports", "calls", "uses"];
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            source: fc.constantFrom(...files),
            target: fc.constantFrom(...files),
            kind: fc.constantFrom(...kinds),
            typeOnly: fc.boolean(),
          }),
          { maxLength: 20 },
        ),
        fc.boolean(),
        fc.subarray(files.slice(0, 6), { maxLength: 2 }),
        (randomEdges, includeTypeOnly, declaredPaths) => {
          const random = syntheticModel({
            files: files.map((path) => ({
              path,
              role: path.endsWith(".test.ts") ? ("test" as const) : ("source" as const),
            })),
            edges: randomEdges.filter((edge) => edge.source !== edge.target),
          });
          const stage = handStage(random, byDirectory, {
            declared: [
              {
                name: "decl",
                files: declaredPaths.map((path) => fileId(path)).sort(compareStrings),
              },
            ],
          });
          const projection = { ...METRICS_PROJECTION, includeTypeOnly };
          const computed = surface(random, stage, projection);
          const expected = bruteForce(random, stage, includeTypeOnly);
          for (const [id, entry] of Object.entries(computed)) {
            expect(entry.publicApi, id).toEqual(expected.get(id as ModuleId) ?? []);
          }
        },
      ),
      { seed: 20261008, numRuns: 300 },
    );
  });
});

/** One unit per directory of the scope's nodes. */
function byDirectory(scope: Scope): HandClusteringSpec {
  const members = new Map<string, string[]>();
  for (const node of scope.graph.nodes) {
    const directory = parentPath(node.slice(5));
    members.set(directory, [...(members.get(directory) ?? []), node.slice(5)]);
  }
  return {
    units: [...members].map(([directory, list]) => ({
      anchor: { directory },
      kind: "feature",
      members: list,
    })),
  };
}

/** Public APIs from the document's `imports` and `re-exports` edges and the memberships (D-63). */
function bruteForce(
  random: ArchitectureModel,
  stage: HandStage,
  includeTypeOnly: boolean,
): Map<ModuleId, string[]> {
  const listed = new Map<FileId, ModuleId>();
  const any = new Map<FileId, ModuleId>();
  for (const module of stage.declared.modules) {
    for (const file of module.files) {
      listed.set(file, module.id);
      any.set(file, module.id);
    }
  }
  for (const { clustering, ids } of stage.inferred) {
    clustering.units.forEach((unit, index) => {
      for (const node of unit.members) {
        const file = clustering.scope.graph.nodes[node] ?? "file:?";
        listed.set(file, ids[index] ?? "mod:?");
        any.set(file, ids[index] ?? "mod:?");
      }
    });
  }
  for (const [file, id] of stage.attachments.moduleOf) any.set(file, id);
  const roles = new Set<FileRole>(METRICS_PROJECTION.fileRoles ?? []);
  const result = new Map<ModuleId, Set<string>>();
  for (const edge of random.document.edges) {
    if (edge.kind !== "imports" && edge.kind !== "re-exports") continue;
    if (edge.typeOnly && !includeTypeOnly) continue;
    if (!new Set<EdgeKind>(DEFAULT_EDGE_KINDS).has(edge.kind)) continue;
    const source = random.fileOf(edge.source);
    const target = random.fileOf(edge.target);
    if (source === undefined || target === undefined || source === target) continue;
    const sourceRole = random.index.file(source)?.role;
    const targetRole = random.index.file(target)?.role;
    if (sourceRole === undefined || targetRole === undefined) continue;
    if (!roles.has(sourceRole) || !roles.has(targetRole)) continue;
    const from = any.get(source);
    const to = listed.get(target);
    if (from === undefined || to === undefined || from === to) continue;
    const set = result.get(to) ?? new Set<string>();
    set.add(target.slice(5));
    result.set(to, set);
  }
  return new Map([...result].map(([id, set]) => [id, [...set].sort(compareStrings)]));
}
