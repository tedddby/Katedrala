import { InvalidIdentifierError, compareStrings, fileId } from "@katedrala/ir";
import type { FileId, FileRole } from "@katedrala/ir";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolveInferenceSettings } from "../settings.js";
import { syntheticModel } from "../test-support.js";
import type { DeclaredModuleSpec } from "../types.js";
import { identifyInferredModules, inferredModuleId, resolveDeclaredModules } from "./declared.js";
import { METRICS_PROJECTION, handClustering } from "./hand-built.test-support.js";
import { moduleScopes } from "./scopes.js";

const COMPONENT_ROLES = resolveInferenceSettings().componentFileRoles;

/** A spec over paths. */
function spec(
  name: string,
  paths: readonly string[],
  entry?: readonly string[],
): DeclaredModuleSpec {
  const files = paths.map((path) => fileId(path)).sort(compareStrings);
  return entry === undefined
    ? { name, files }
    : { name, files, entry: entry.map((path) => fileId(path)).sort(compareStrings) };
}

const model = syntheticModel({
  files: [
    "src/payments/checkout.ts",
    "src/payments/gateway.ts",
    "src/payments/refunds.ts",
    "src/shared/money.ts",
    { path: "src/payments/checkout.test.ts", role: "test" },
    { path: "src/payments/types.d.ts", role: "declaration" },
    { path: "src/payments/README.md", role: "documentation" },
    { path: "src/payments/config.json", role: "configuration" },
  ],
});

describe("resolveDeclaredModules (§3.14)", () => {
  it("keeps the files whose role components own (D-22): code, tests and declarations", () => {
    const declared = resolveDeclaredModules({
      model,
      specs: [
        spec(
          "payments",
          model.document.files.map((file) => file.path),
        ),
      ],
      fileRoles: COMPONENT_ROLES,
      maxExamples: 10,
    });
    expect(declared.modules).toEqual([
      {
        id: "mod:payments",
        name: "payments",
        files: [
          "file:src/payments/checkout.test.ts",
          "file:src/payments/checkout.ts",
          "file:src/payments/gateway.ts",
          "file:src/payments/refunds.ts",
          "file:src/payments/types.d.ts",
          "file:src/shared/money.ts",
        ],
      },
    ]);
    expect(declared.diagnostics).toEqual([]);
    expect([...declared.owners.keys()].sort(compareStrings)).toEqual(declared.modules[0]?.files);
  });

  it("resolves overlaps by name, whatever the order of the specs (D-23), and warns once per pair (D-24)", () => {
    const specs = [
      spec("zeta", ["src/payments/checkout.ts", "src/payments/gateway.ts", "src/shared/money.ts"]),
      spec("alpha", ["src/payments/checkout.ts", "src/payments/gateway.ts"]),
      spec("beta", ["src/shared/money.ts", "src/payments/refunds.ts"]),
    ];
    const resolve = (order: readonly DeclaredModuleSpec[]) =>
      resolveDeclaredModules({
        model,
        specs: order,
        fileRoles: COMPONENT_ROLES,
        maxExamples: 10,
        configurationFile: fileId("katedrala.config.yaml"),
      });
    const declared = resolve(specs);
    expect(resolve([...specs].reverse())).toEqual(declared);
    expect(declared.modules.map((module) => [module.name, module.files])).toEqual([
      ["alpha", ["file:src/payments/checkout.ts", "file:src/payments/gateway.ts"]],
      ["beta", ["file:src/payments/refunds.ts", "file:src/shared/money.ts"]],
      ["zeta", []],
    ]);
    expect(declared.owners.get(fileId("src/shared/money.ts"))).toBe("mod:beta");
    expect(declared.diagnostics).toEqual([
      {
        code: "configuration-warning",
        severity: "warning",
        message:
          'Files match several declared modules: 2 files match both "alpha" and "zeta", and the ' +
          'first by name ("alpha") keeps them: src/payments/checkout.ts and src/payments/gateway.ts',
        file: "file:katedrala.config.yaml",
      },
      {
        code: "configuration-warning",
        severity: "warning",
        message:
          'Files match several declared modules: 1 file matches both "beta" and "zeta", and the ' +
          'first by name ("beta") keeps it: src/shared/money.ts',
        file: "file:katedrala.config.yaml",
      },
    ]);
    // No line: key order never shows in the document (D-23).
    for (const diagnostic of declared.diagnostics) expect(diagnostic.line).toBeUndefined();
  });

  it("bounds the example paths of an overlap warning by maxExamples", () => {
    const paths = [
      "src/payments/checkout.ts",
      "src/payments/gateway.ts",
      "src/payments/refunds.ts",
    ];
    const warn = (maxExamples: number) =>
      resolveDeclaredModules({
        model,
        specs: [spec("a", paths), spec("b", paths)],
        fileRoles: COMPONENT_ROLES,
        maxExamples,
      }).diagnostics[0]?.message;
    expect(warn(2)).toBe(
      'Files match several declared modules: 3 files match both "a" and "b", and the first by name ' +
        '("a") keeps them: src/payments/checkout.ts, src/payments/gateway.ts and 1 more',
    );
    expect(warn(0)).toBe(
      'Files match several declared modules: 3 files match both "a" and "b", and the first by name ' +
        '("a") keeps them',
    );
  });

  it("keeps modules that match nothing, with a warning, and records entry files (D-71)", () => {
    const declared = resolveDeclaredModules({
      model,
      specs: [
        spec("docs", ["src/payments/README.md", "src/payments/config.json"]),
        spec("empty", []),
        spec(
          "payments",
          ["src/payments/refunds.ts", "src/payments/gateway.ts"],
          ["src/payments/gateway.ts"],
        ),
      ],
      fileRoles: COMPONENT_ROLES,
      maxExamples: 10,
    });
    expect(declared.modules).toEqual([
      { id: "mod:docs", name: "docs", files: [] },
      { id: "mod:empty", name: "empty", files: [] },
      {
        id: "mod:payments",
        name: "payments",
        files: ["file:src/payments/gateway.ts", "file:src/payments/refunds.ts"],
        entry: ["file:src/payments/gateway.ts"],
      },
    ]);
    expect(declared.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      'Declared module "docs" matches 2 files, none with a role modules contain ' +
        "(inference.components.file_roles: declaration, generated, script, source, test); it is " +
        "kept without member files",
      'Declared module "empty" matches no file; it is kept without member files',
    ]);
    expect(declared.diagnostics.every((diagnostic) => diagnostic.file === undefined)).toBe(true);
  });

  it("ignores files the document does not list", () => {
    const declared = resolveDeclaredModules({
      model,
      specs: [spec("ghost", ["src/missing.ts", "src/payments/refunds.ts"])],
      fileRoles: COMPONENT_ROLES,
      maxExamples: 10,
    });
    expect(declared.modules[0]?.files).toEqual(["file:src/payments/refunds.ts"]);
  });

  it("rejects duplicate names and names a module key cannot hold", () => {
    expect(() =>
      resolveDeclaredModules({
        model,
        specs: [spec("a", []), spec("a", [])],
        fileRoles: COMPONENT_ROLES,
        maxExamples: 10,
      }),
    ).toThrow(RangeError);
    expect(() =>
      resolveDeclaredModules({
        model,
        specs: [spec("a#b", [])],
        fileRoles: COMPONENT_ROLES,
        maxExamples: 10,
      }),
    ).toThrow(InvalidIdentifierError);
  });

  it("partitions the matched files: the first module by name keeps each one (property)", () => {
    const paths = model.document.files.map((file) => file.path);
    const roleOf = new Map(model.document.files.map((file) => [file.id, file.role] as const));
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom("a", "b", "c", "d"), { minLength: 1, maxLength: 4 }),
        fc.array(fc.subarray(paths), { minLength: 4, maxLength: 4 }),
        fc.subarray<FileRole>(["source", "test", "declaration", "documentation"], { minLength: 1 }),
        (names, matches, roles) => {
          const specs = names.map((name, index) => spec(name, matches[index] ?? []));
          const fileRoles = new Set(roles);
          const declared = resolveDeclaredModules({ model, specs, fileRoles, maxExamples: 3 });
          const byName = [...specs].sort((a, b) => compareStrings(a.name, b.name));
          const expectedOwner = new Map<FileId, string>();
          for (const module of byName) {
            for (const file of module.files) {
              const role = roleOf.get(file);
              if (role === undefined || !fileRoles.has(role) || expectedOwner.has(file)) continue;
              expectedOwner.set(file, `mod:${module.name}`);
            }
          }
          expect(new Map([...declared.owners].sort(([a], [b]) => compareStrings(a, b)))).toEqual(
            new Map([...expectedOwner].sort(([a], [b]) => compareStrings(a, b))),
          );
          expect(declared.modules.map((module) => module.name)).toEqual(byName.map((s) => s.name));
          for (const module of declared.modules) {
            expect(module.files).toEqual([...module.files].sort(compareStrings));
            for (const file of module.files) expect(declared.owners.get(file)).toBe(module.id);
          }
          // One overlap warning per (keeper, loser) pair with shared files.
          let pairs = 0;
          for (const loser of byName) {
            const keepers = new Set<string>();
            for (const file of loser.files) {
              const owner = expectedOwner.get(file);
              if (owner !== undefined && owner !== `mod:${loser.name}`) keepers.add(owner);
            }
            pairs += keepers.size;
          }
          const overlaps = declared.diagnostics.filter((diagnostic) =>
            diagnostic.message.startsWith("Files match several declared modules"),
          );
          expect(overlaps).toHaveLength(pairs);
        },
      ),
      { seed: 20261008, numRuns: 300 },
    );
  });
});

describe("inferred module identifiers (§3.10, IR.md Identifiers)", () => {
  it("appends ~inferred when a unit key equals a declared name", () => {
    expect(inferredModuleId({ key: "src", anchor: { directory: "src" } }, new Set(["src"]))).toBe(
      "mod:src~inferred",
    );
    expect(inferredModuleId({ key: "src", anchor: { directory: "src" } }, new Set(["lib"]))).toBe(
      "mod:src",
    );
    expect(
      inferredModuleId({ key: ".#payment", anchor: { directory: "", stem: "payment" } }, new Set()),
    ).toBe("mod:.#payment");
  });

  it("gives every unit of every scope its identifier, scopes in order", () => {
    const document = syntheticModel({
      files: ["payments/a.ts", "payments/b.ts", "src/c.ts"],
      packages: [{ path: "payments", name: "payments" }],
    });
    const declared = resolveDeclaredModules({
      model: document,
      specs: [spec("payments", [])],
      fileRoles: COMPONENT_ROLES,
      maxExamples: 10,
    });
    const settings = resolveInferenceSettings();
    const { scopes } = moduleScopes({
      model: document,
      settings,
      projection: METRICS_PROJECTION,
      declaredFiles: new Set(declared.owners.keys()),
    });
    const clusterings = scopes.map((scope) =>
      handClustering(
        scope,
        scope.id === ""
          ? { units: [{ anchor: { directory: "src" }, kind: "root", members: ["src/c.ts"] }] }
          : {
              units: [
                {
                  anchor: { directory: "payments" },
                  kind: "root",
                  members: ["payments/a.ts", "payments/b.ts"],
                },
              ],
            },
      ),
    );
    const inferred = identifyInferredModules(clusterings, declared);
    expect(inferred.map((scope) => [scope.clustering.scope.id, scope.ids])).toEqual([
      ["", ["mod:src"]],
      ["pkg:npm:payments", ["mod:payments~inferred"]],
    ]);
  });
});
