import { compareStrings, fileId, symbolId } from "@katedrala/ir";
import type { EdgeKind, FileId, FileRole } from "@katedrala/ir";
import { DEFAULT_EDGE_KINDS } from "@katedrala/model";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolveInferenceSettings } from "../settings.js";
import { syntheticModel } from "../test-support.js";
import type { SyntheticFileSpec } from "../test-support.js";
import type { ModuleSettings, WeightedFileGraph } from "../types.js";
import { buildWeightedFileGraph } from "../weighted-graph.js";
import { METRICS_PROJECTION } from "./hand-built.test-support.js";
import { entryPointFiles, metricsEdgeKinds, moduleScopes, shouldInferModules } from "./scopes.js";

const settings = resolveInferenceSettings();

/** Every arc as `source > target = weight`. */
function arcs(weighted: WeightedFileGraph): string[] {
  const name = (node: number): string => weighted.nodes[node]?.slice(5) ?? "?";
  return [...weighted.graph.edges()].map(([u, v, w]) => `${name(u)} > ${name(v)} = ${w}`);
}

describe("shouldInferModules (D-21)", () => {
  const modules = (overrides: Partial<ModuleSettings>): ModuleSettings => ({
    ...settings.modules,
    ...overrides,
  });

  it("infers unless disabled, or `none` with a declared module", () => {
    expect(shouldInferModules(modules({}), 0)).toBe(true);
    expect(shouldInferModules(modules({}), 2)).toBe(true);
    expect(shouldInferModules(modules({ whenDeclared: "none" }), 0)).toBe(true);
    expect(shouldInferModules(modules({ whenDeclared: "none" }), 1)).toBe(false);
    expect(shouldInferModules(modules({ enabled: false }), 0)).toBe(false);
    expect(shouldInferModules(modules({ enabled: false }), 1)).toBe(false);
  });
});

describe("metricsEdgeKinds (D-02)", () => {
  it("applies the projection default and keeps explicit kinds, sorted", () => {
    expect([...metricsEdgeKinds({})]).toEqual([...DEFAULT_EDGE_KINDS]);
    expect([...metricsEdgeKinds({ edgeKinds: new Set<EdgeKind>(["uses", "imports"]) })]).toEqual([
      "imports",
      "uses",
    ]);
  });
});

describe("entryPointFiles (D-31)", () => {
  it("collects the files of file and symbol entry points, sorted and distinct", () => {
    const model = syntheticModel({
      files: [{ path: "src/z.ts", symbols: [{ name: "run" }] }, "src/a.ts", "src/b.ts"],
      entryPoints: [
        "src/b.ts",
        { entity: symbolId("src/z.ts", "run"), kind: "bin" },
        { entity: "src/b.ts", kind: "script" },
      ],
    });
    expect([...entryPointFiles(model)]).toEqual(["file:src/b.ts", "file:src/z.ts"]);
    expect([...entryPointFiles(syntheticModel({ files: ["a.ts"] }))]).toEqual([]);
  });
});

describe("moduleScopes (P0, §3.4)", () => {
  const model = syntheticModel({
    files: [
      "tools/build.ts",
      "tools/lint.ts",
      "packages/web/src/app.ts",
      "packages/web/src/view.ts",
      "packages/api/src/server.ts",
      "packages/api/src/routes.ts",
      "packages/api/src/declared.ts",
      { path: "packages/api/src/server.test.ts", role: "test" },
      { path: "packages/api/src/types.d.ts", role: "declaration" },
    ],
    packages: [{ path: "packages/web", name: "@acme/web" }, { path: "packages/api" }],
    edges: [
      ["packages/api/src/server.ts", "packages/api/src/routes.ts"],
      ["packages/api/src/routes.ts", "packages/api/src/declared.ts"],
      // Cross-scope edges are not evidence (D-03).
      ["packages/web/src/app.ts", "packages/api/src/routes.ts"],
      ["tools/build.ts", "packages/web/src/view.ts"],
      ["tools/build.ts", "tools/lint.ts"],
      { source: "packages/web/src/app.ts", target: "packages/web/src/view.ts", typeOnly: true },
      ["packages/api/src/server.test.ts", "packages/api/src/server.ts"],
    ],
  });
  const declaredFiles = new Set<FileId>([fileId("packages/api/src/declared.ts")]);
  const { graph, scopes } = moduleScopes({
    model,
    settings,
    projection: METRICS_PROJECTION,
    declaredFiles,
  });

  it("lists scopes in identifier order, files without a package first", () => {
    expect(scopes.map((scope) => [scope.id, scope.directory, scope.packageName])).toEqual([
      ["", "", undefined],
      ["pkg:npm:packages/api", "packages/api", "packages/api"],
      ["pkg:npm:packages/web", "packages/web", "@acme/web"],
    ]);
  });

  it("makes source files nodes, except declared files", () => {
    expect(graph.nodes).toEqual([
      "file:packages/api/src/routes.ts",
      "file:packages/api/src/server.ts",
      "file:packages/web/src/app.ts",
      "file:packages/web/src/view.ts",
      "file:tools/build.ts",
      "file:tools/lint.ts",
    ]);
    expect(scopes.map((scope) => scope.graph.nodes.map((node) => node.slice(5)))).toEqual([
      ["tools/build.ts", "tools/lint.ts"],
      ["packages/api/src/routes.ts", "packages/api/src/server.ts"],
      ["packages/web/src/app.ts", "packages/web/src/view.ts"],
    ]);
  });

  it("keeps no arc between scopes (D-03)", () => {
    expect(scopes.map((scope) => arcs(scope.graph))).toEqual([
      ["tools/build.ts > tools/lint.ts = 1"],
      ["packages/api/src/server.ts > packages/api/src/routes.ts = 1"],
      ["packages/web/src/app.ts > packages/web/src/view.ts = 0.5"],
    ]);
  });

  it("takes its node roles and weighting from the settings", () => {
    const withTests = resolveInferenceSettings({
      modules: { file_roles: ["source", "test"], type_only_weight: 0 },
    });
    const result = moduleScopes({
      model,
      settings: withTests,
      projection: METRICS_PROJECTION,
      declaredFiles,
    });
    const api = result.scopes.find((scope) => scope.id === "pkg:npm:packages/api");
    expect(api?.graph.nodes).toContain("file:packages/api/src/server.test.ts");
    const web = result.scopes.find((scope) => scope.id === "pkg:npm:packages/web");
    expect(web === undefined ? [] : arcs(web.graph)).toEqual([]);
  });

  it("gives no scope to a document without nodes", () => {
    const empty = syntheticModel({ files: [{ path: "README.md", role: "documentation" }] });
    expect(
      moduleScopes({
        model: empty,
        settings,
        projection: METRICS_PROJECTION,
        declaredFiles: new Set(),
      }).scopes,
    ).toEqual([]);
  });

  it("partitions the nodes by package, each scope the induced subgraph (property)", () => {
    const paths = [
      "a/x.ts",
      "a/y.ts",
      "a/b/z.ts",
      "b/u.ts",
      "b/v.ts",
      "c.ts",
      "d/w.ts",
      "d/t.test.ts",
    ];
    const roles: readonly FileRole[] = ["source", "source", "source", "test", "declaration"];
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...roles), { minLength: paths.length, maxLength: paths.length }),
        fc.subarray(["a", "a/b", "b", "d"]),
        fc.array(
          fc.record({
            source: fc.constantFrom(...paths),
            target: fc.constantFrom(...paths),
            typeOnly: fc.boolean(),
          }),
          { maxLength: 20 },
        ),
        fc.subarray(paths, { maxLength: 2 }),
        (fileRoles, packages, edges, declaredPaths) => {
          const files: SyntheticFileSpec[] = paths.map((path, index) => ({
            path,
            role: fileRoles[index] ?? "source",
          }));
          const synthetic = syntheticModel({
            files,
            packages,
            edges: edges.filter((edge) => edge.source !== edge.target),
          });
          const declared = new Set(declaredPaths.map((path) => fileId(path)));
          const result = moduleScopes({
            model: synthetic,
            settings,
            projection: METRICS_PROJECTION,
            declaredFiles: declared,
          });
          const all = buildWeightedFileGraph(synthetic, {
            ...settings.weighting,
            edgeKinds: new Set(DEFAULT_EDGE_KINDS),
            fileRoles: settings.modules.fileRoles,
            exclude: declared,
          });
          expect(result.graph.nodes).toEqual(all.nodes);
          expect(result.scopes.map((scope) => scope.id)).toEqual(
            [...result.scopes.map((scope) => scope.id)].sort(compareStrings),
          );
          const covered: FileId[] = [];
          for (const scope of result.scopes) {
            for (const node of scope.graph.nodes) {
              expect(synthetic.index.file(node)?.package ?? "").toBe(scope.id);
              expect(declared.has(node)).toBe(false);
              covered.push(node);
            }
            const inScope = new Set(scope.graph.nodes.map((node) => node.slice(5)));
            expect(arcs(scope.graph)).toEqual(
              arcs(all).filter((arc) => {
                const [source = "", rest = ""] = arc.split(" > ");
                return inScope.has(source) && inScope.has(rest.split(" = ")[0] ?? "");
              }),
            );
          }
          expect(covered.sort(compareStrings)).toEqual(all.nodes);
        },
      ),
      { seed: 20261008, numRuns: 200 },
    );
  });
});
