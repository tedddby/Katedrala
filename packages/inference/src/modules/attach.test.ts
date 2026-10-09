import { compareStrings, fileId, parentPath } from "@katedrala/ir";
import type { FileId, FileRole, ModuleId } from "@katedrala/ir";
import { DEFAULT_EDGE_KINDS } from "@katedrala/model";
import type { ArchitectureModel } from "@katedrala/model";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolveInferenceSettings } from "../settings.js";
import { syntheticModel } from "../test-support.js";
import type { SyntheticEdgeSpec, SyntheticFileSpec, SyntheticModelSpec } from "../test-support.js";
import type { InferenceSettings, Scope } from "../types.js";
import type { Attachments } from "./attach.js";
import { handStage } from "./hand-built.test-support.js";
import type { HandClusteringSpec, HandStage } from "./hand-built.test-support.js";

/** One unit per directory of the scope's nodes, anchored on it (a simple hand-built clustering). */
function byDirectory(scope: Scope): HandClusteringSpec {
  const members = new Map<string, string[]>();
  for (const node of scope.graph.nodes) {
    const path = node.slice("file:".length);
    const directory = parentPath(path);
    const list = members.get(directory);
    if (list === undefined) members.set(directory, [path]);
    else list.push(path);
  }
  return {
    units: [...members].map(([directory, paths]) => ({
      anchor: { directory },
      kind: "feature",
      members: paths,
    })),
  };
}

/** Every attachment as `path → module (rule candidates/support[ in directory])`. */
function summary(stage: HandStage): Record<string, string> {
  const result: Record<string, string> = {};
  stage.inferred.forEach((scoped, scope) => {
    scoped.clustering.units.forEach((_, unit) => {
      for (const attachment of stage.attachments.units[scope]?.[unit] ?? []) {
        const where = attachment.directory === undefined ? "" : ` in ${attachment.directory}`;
        result[attachment.file.slice(5)] =
          `${scoped.ids[unit] ?? "?"} (${attachment.role} ${attachment.rule} ` +
          `${attachment.support}/${attachment.candidates}${where})`;
      }
    });
  });
  return result;
}

const files: SyntheticFileSpec[] = [
  { path: "src/main.ts" },
  { path: "src/orders/order.ts" },
  { path: "src/orders/order-service.ts" },
  { path: "src/payments/payment.ts" },
  { path: "src/payments/gateway.ts" },
  { path: "src/legacy/legacy.ts" },
  { path: "src/legacy/old.ts" },
  { path: "src/legacy/legacy.test.ts", role: "test" },
  { path: "libs/billing/src/invoice.ts" },
  { path: "test/orders.test.ts", role: "test" },
  { path: "test/legacy.test.ts", role: "test" },
  { path: "test/billing.test.ts", role: "test" },
  { path: "test/none.test.ts", role: "test" },
  { path: "test/weak.test.ts", role: "test" },
  { path: "src/payments/split.test.ts", role: "test" },
  { path: "src/orders/sub/deep.test.ts", role: "test" },
  { path: "src/orders/types.d.ts", role: "declaration" },
  { path: "src/globals.d.ts", role: "declaration" },
  { path: "src/payments/unused.d.ts", role: "declaration" },
];

const edges: SyntheticEdgeSpec[] = [
  { source: "test/orders.test.ts", target: "src/orders/order.ts" },
  { source: "test/orders.test.ts", target: "src/orders/order-service.ts" },
  { source: "test/orders.test.ts", target: "src/payments/payment.ts", kind: "calls" },
  { source: "test/legacy.test.ts", target: "src/legacy/legacy.ts" },
  { source: "test/legacy.test.ts", target: "src/legacy/old.ts" },
  { source: "test/legacy.test.ts", target: "src/orders/order.ts" },
  { source: "test/billing.test.ts", target: "libs/billing/src/invoice.ts" },
  { source: "src/payments/split.test.ts", target: "src/orders/order.ts" },
  { source: "src/payments/split.test.ts", target: "src/payments/payment.ts" },
  // Below the confidence threshold: no candidate (D-41).
  { source: "test/weak.test.ts", target: "src/orders/order.ts", confidence: 0.3 },
  // Declarations: their dependents are the candidates.
  { source: "src/orders/order.ts", target: "src/orders/types.d.ts", typeOnly: true },
  { source: "src/orders/order-service.ts", target: "src/orders/types.d.ts", typeOnly: true },
  { source: "src/payments/payment.ts", target: "src/orders/types.d.ts", typeOnly: true },
  { source: "src/orders/order.ts", target: "src/globals.d.ts", kind: "uses" },
  { source: "src/payments/payment.ts", target: "src/globals.d.ts", kind: "uses" },
];

const spec: SyntheticModelSpec = {
  files,
  edges,
  packages: [
    { path: "", name: "shop" },
    { path: "libs/billing", name: "@shop/billing" },
  ],
};
const model = syntheticModel(spec);
const LEGACY = {
  name: "legacy",
  files: ["src/legacy/legacy.test.ts", "src/legacy/legacy.ts", "src/legacy/old.ts"].map((path) =>
    fileId(path),
  ),
};

function stageWith(
  settings: InferenceSettings = resolveInferenceSettings(),
  model0 = model,
): HandStage {
  return handStage(model0, byDirectory, { settings, declared: [LEGACY] });
}

describe("attachFiles (P7, §3.11, D-65)", () => {
  it("attaches by strict majority, else tests by location; declarations never by location", () => {
    expect(summary(stageWith())).toEqual({
      "src/orders/sub/deep.test.ts": "mod:src/orders (test location 0/0 in src/orders)",
      "src/orders/types.d.ts": "mod:src/orders (declaration majority 2/3)",
      "src/payments/split.test.ts": "mod:src/payments (test location 1/2 in src/payments)",
      "test/orders.test.ts": "mod:src/orders (test majority 2/3)",
    });
  });

  it("leaves unassigned: majorities in declared modules or other scopes, declarations without majority", () => {
    const { attachments } = stageWith();
    for (const path of [
      "test/legacy.test.ts", // 2 of 3 candidates are declared files
      "test/billing.test.ts", // its only candidate lies in another package
      "src/globals.d.ts", // one dependent in each of two modules
      "src/payments/unused.d.ts", // no dependent
      "test/none.test.ts", // no candidate, and no node directly in test/ or the package root
      "test/weak.test.ts", // its only dependency is below min_edge_confidence
      "src/legacy/legacy.test.ts", // a declared member
    ]) {
      expect(attachments.moduleOf.has(fileId(path)), path).toBe(false);
    }
  });

  it("attaches tests by strict majority only when the metrics count them (include_tests_in_metrics)", () => {
    const settings = resolveInferenceSettings(undefined, { includeTestsInMetrics: true });
    expect(summary(stageWith(settings))).toEqual({
      "src/orders/types.d.ts": "mod:src/orders (declaration majority 2/3)",
      "test/orders.test.ts": "mod:src/orders (test majority 2/3)",
    });
  });

  it("follows attach_tests and attach_declarations", () => {
    expect(
      summary(stageWith(resolveInferenceSettings({ modules: { attach_tests: false } }))),
    ).toEqual({ "src/orders/types.d.ts": "mod:src/orders (declaration majority 2/3)" });
    expect(
      Object.keys(
        summary(stageWith(resolveInferenceSettings({ modules: { attach_declarations: false } }))),
      ).sort(compareStrings),
    ).toEqual(["src/orders/sub/deep.test.ts", "src/payments/split.test.ts", "test/orders.test.ts"]);
    const none = stageWith(
      resolveInferenceSettings({ modules: { attach_tests: false, attach_declarations: false } }),
    );
    expect(none.attachments.moduleOf.size).toBe(0);
  });

  it("skips files that are nodes (file_roles), and ignores arcs of weight 0", () => {
    const settings = resolveInferenceSettings({
      modules: { file_roles: ["source", "test"], type_only_weight: 0 },
    });
    // Tests are nodes now; the declaration's type-only dependents weigh 0, so it has no candidate.
    expect(summary(stageWith(settings))).toEqual({});
  });

  it("breaks location ties by the smallest module identifier and walks up to the scope directory", () => {
    const tie = syntheticModel({
      files: [
        "src/common/a.ts",
        "src/common/b.ts",
        "src/z/c.ts",
        { path: "src/common/common.test.ts", role: "test" },
        { path: "src/common/deep/more/x.test.ts", role: "test" },
        { path: "elsewhere.test.ts", role: "test" },
      ],
    });
    const stage = handStage(tie, () => ({
      units: [
        {
          anchor: { directory: "src/z" },
          kind: "feature",
          members: ["src/common/b.ts", "src/z/c.ts"],
        },
        { anchor: { directory: "src/b" }, kind: "feature", members: ["src/common/a.ts"] },
      ],
    }));
    expect(summary(stage)).toEqual({
      "src/common/common.test.ts": "mod:src/b (test location 0/0 in src/common)",
      "src/common/deep/more/x.test.ts": "mod:src/b (test location 0/0 in src/common)",
    });
  });

  it("does nothing without inferred modules", () => {
    const stage = handStage(
      syntheticModel({ files: [{ path: "a.test.ts", role: "test" }] }),
      byDirectory,
    );
    expect(stage.inferred).toEqual([]);
    expect(stage.attachments).toEqual({ units: [], moduleOf: new Map() });
  });

  it("matches a reference built from the file projection (property)", () => {
    const seen = { majority: 0, location: 0 };
    const paths = [
      "p/src/a.ts",
      "p/src/b.ts",
      "p/src/x/c.ts",
      "p/src/x/d.test.ts",
      "p/test/e.test.ts",
      "p/src/f.d.ts",
      "q/src/g.ts",
      "q/src/h.test.ts",
      "r.ts",
      "s/i.test.ts",
      "s/j.d.ts",
    ];
    const roleOptions: readonly FileRole[] = ["source", "test", "declaration"];
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...roleOptions), {
          minLength: paths.length,
          maxLength: paths.length,
        }),
        fc.array(
          fc.record({
            source: fc.constantFrom(...paths),
            target: fc.constantFrom(...paths),
            kind: fc.constantFrom("imports", "calls", "uses", "re-exports"),
            typeOnly: fc.boolean(),
          }),
          { maxLength: 25 },
        ),
        fc.subarray(paths, { maxLength: 3 }),
        fc.record({
          tests: fc.boolean(),
          declarations: fc.boolean(),
          inMetrics: fc.boolean(),
        }),
        (roles, randomEdges, declaredPaths, flags) => {
          const randomFiles = paths.map((path, index) => ({
            path,
            role: roles[index] ?? "source",
          }));
          const random = syntheticModel({
            files: randomFiles,
            packages: ["p", "q"],
            edges: randomEdges.filter((edge) => edge.source !== edge.target),
          });
          const settings = resolveInferenceSettings(
            { modules: { attach_tests: flags.tests, attach_declarations: flags.declarations } },
            { includeTestsInMetrics: flags.inMetrics },
          );
          const stage = handStage(random, byDirectory, {
            settings,
            declared: [
              {
                name: "decl",
                files: declaredPaths.map((path) => fileId(path)).sort(compareStrings),
              },
            ],
          });
          expect(normalize(stage.attachments)).toEqual(reference(random, stage, settings));
          for (const units of stage.attachments.units) {
            for (const list of units) {
              for (const attachment of list) seen[attachment.rule]++;
            }
          }
        },
      ),
      { seed: 20261008, numRuns: 300 },
    );
    // The generated documents exercise both rules.
    expect(seen.majority).toBeGreaterThan(20);
    expect(seen.location).toBeGreaterThan(20);
  });
});

/** `file → module` of every attachment, checking the parallel lists against `moduleOf`. */
function normalize(attachments: Attachments): Record<string, ModuleId> {
  const result: Record<string, ModuleId> = {};
  for (const [file, id] of [...attachments.moduleOf].sort(([a], [b]) => compareStrings(a, b))) {
    result[file] = id;
  }
  let listed = 0;
  for (const units of attachments.units) {
    for (const list of units) {
      expect(list.map((entry) => entry.file)).toEqual(
        [...list.map((entry) => entry.file)].sort(compareStrings),
      );
      listed += list.length;
    }
  }
  expect(listed).toBe(attachments.moduleOf.size);
  return result;
}

/**
 * P7 recomputed from its definition (plan 4.4 P7) on the model's file projection: candidates are the
 * projection neighbours (all synthetic edges have confidence 1 and weight > 0) that belong to a module.
 */
function reference(
  model: ArchitectureModel,
  stage: HandStage,
  settings: InferenceSettings,
): Record<string, ModuleId> {
  const { declared, inferred } = stage;
  const owner = new Map<FileId, { id: ModuleId; scope: string; inferred: boolean }>();
  for (const module of declared.modules) {
    for (const file of module.files) owner.set(file, { id: module.id, scope: "", inferred: false });
  }
  /** Scope → directory → nodes directly in it per module. */
  const direct = new Map<string, Map<string, Map<ModuleId, number>>>();
  for (const { clustering, ids } of inferred) {
    const directories = new Map<string, Map<ModuleId, number>>();
    direct.set(clustering.scope.id, directories);
    clustering.units.forEach((unit, index) => {
      const id = ids[index] ?? "mod:?";
      for (const node of unit.members) {
        const file = clustering.scope.graph.nodes[node] ?? "file:?";
        owner.set(file, { id, scope: clustering.scope.id, inferred: true });
        const directory = parentPath(file.slice(5));
        const counts = directories.get(directory) ?? new Map<ModuleId, number>();
        directories.set(directory, counts);
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    });
  }
  if (inferred.length === 0) return {};
  const projection = model.projection({
    level: "file",
    edgeKinds: new Set(DEFAULT_EDGE_KINDS),
    includeTypeOnly: true,
    fileRoles: new Set<FileRole>([...settings.modules.fileRoles, "test", "declaration"]),
  });
  const result: Record<string, ModuleId> = {};
  for (const file of [...model.document.files].sort((a, b) => compareStrings(a.id, b.id))) {
    if (file.role !== "test" && file.role !== "declaration") continue;
    const attach =
      file.role === "test" ? settings.modules.attachTests : settings.modules.attachDeclarations;
    if (!attach || settings.modules.fileRoles.has(file.role) || declared.owners.has(file.id))
      continue;
    const neighbours =
      file.role === "test" ? projection.dependencies(file.id) : projection.dependents(file.id);
    const counts = new Map<ModuleId, number>();
    let candidates = 0;
    for (const neighbour of neighbours) {
      const found = owner.get(neighbour as FileId);
      if (found === undefined) continue;
      candidates++;
      counts.set(found.id, (counts.get(found.id) ?? 0) + 1);
    }
    const scope = file.package ?? "";
    const majority = [...counts].find(([, count]) => count * 2 > candidates);
    if (majority !== undefined) {
      const found = [...owner.values()].find((entry) => entry.id === majority[0]);
      if (found?.inferred === true && found.scope === scope) result[file.id] = majority[0];
      continue;
    }
    if (file.role !== "test" || settings.modules.testsInMetrics) continue;
    const directories = direct.get(scope);
    const scoped = inferred.find((entry) => entry.clustering.scope.id === scope);
    if (directories === undefined || scoped === undefined) continue;
    const top = scoped.clustering.scope.directory;
    for (let directory = parentPath(file.path); ; directory = parentPath(directory)) {
      const ranked = [...(directories.get(directory) ?? new Map<ModuleId, number>())].sort(
        ([a, x], [b, y]) => y - x || compareStrings(a, b),
      );
      const best = ranked[0];
      if (best !== undefined) {
        result[file.id] = best[0];
        break;
      }
      if (directory === top || directory === "") break;
    }
  }
  return result;
}
