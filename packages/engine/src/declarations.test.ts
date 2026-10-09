import type { ModulesConfiguration } from "@katedrala/inference";
import { directoryId, fileId, type FileEntity, type FileRole } from "@katedrala/ir";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolveDeclarations } from "./declarations.js";

function file(path: string, role: FileRole = "source"): FileEntity {
  const slash = path.lastIndexOf("/");
  return {
    id: fileId(path),
    path,
    name: path.slice(slash + 1),
    directory: directoryId(slash < 0 ? "" : path.slice(0, slash)),
    language: "typescript",
    role,
    size: 1,
    analysis: { status: "parsed" },
    symbols: [],
    imports: [],
    exports: [],
    tags: [],
  };
}

const FILES: readonly FileEntity[] = [
  file("src/payments/payment.ts"),
  file("src/payments/index.ts"),
  file("src/payments/payment.test.ts", "test"),
  file("src/payments/legacy/old.ts"),
  file("src/analytics/report.ts"),
  file("src/analytics/index.ts"),
  file("src/analytics/README.md", "documentation"),
  file("src/controllers/order.controller.ts"),
  file("src/services/order.service.ts"),
  file("src/types/global.d.ts", "declaration"),
  file(".github/scripts/release.ts", "script"),
  file("package.json", "configuration"),
];

const ids = (...paths: string[]) => paths.map(fileId);

describe("resolveDeclarations (plan 5.4)", () => {
  it("resolves module globs to every matching file, in file-id order (D-22)", () => {
    const declarations = resolveDeclarations(FILES, {
      modules: { payments: ["src/payments/**", "!src/payments/legacy"] },
    });
    // Role filtering is inference's (D-22): tests and declarations are listed as matched.
    expect(declarations).toEqual({
      modules: [
        {
          name: "payments",
          files: ids(
            "src/payments/index.ts",
            "src/payments/payment.test.ts",
            "src/payments/payment.ts",
          ),
        },
      ],
      roles: [],
    });
  });

  it("follows core's glob semantics: ancestors match, dotfiles are included, exclusions are list-wide", () => {
    const declarations = resolveDeclarations(FILES, {
      modules: {
        analytics: ["src/analytics", "!**/*.md"],
        tooling: [".github"],
        typings: ["**/*.d.ts"],
        nothing: ["src/missing/**"],
      },
    });
    expect(Object.fromEntries(declarations.modules.map((m) => [m.name, m.files]))).toEqual({
      analytics: ids("src/analytics/index.ts", "src/analytics/report.ts"),
      nothing: [],
      tooling: ids(".github/scripts/release.ts"),
      typings: ids("src/types/global.d.ts"),
    });
  });

  it("sorts modules by name whatever the key order (D-23) and keeps entry only when configured", () => {
    const written: ModulesConfiguration = {
      payments: { files: ["src/payments/**"], entry: ["src/payments/index.ts"] },
      Analytics: { files: ["src/analytics/**"] },
      "2024": ["src/services/**"],
      analytics: ["src/analytics/report.ts"],
    };
    const declarations = resolveDeclarations(FILES, { modules: written });
    expect(declarations.modules.map((m) => m.name)).toEqual([
      "2024",
      "Analytics",
      "analytics",
      "payments",
    ]);
    expect(declarations.modules[1]).toEqual({
      name: "Analytics",
      files: ids("src/analytics/README.md", "src/analytics/index.ts", "src/analytics/report.ts"),
    });
    expect(declarations.modules[3]).toMatchObject({ entry: ids("src/payments/index.ts") });
    expect("entry" in (declarations.modules[1] ?? {})).toBe(false);
  });

  it("keeps declared layers in list order, the rank defaulting to the position (D-50)", () => {
    const declarations = resolveDeclarations(FILES, {
      layers: [
        { name: "controller", files: ["src/controllers/**"] },
        { name: "service", files: ["src/services/**"], rank: 3 },
        { name: "domain", files: ["src/payments/**", "src/analytics/**"] },
      ],
    });
    expect(declarations.layers).toEqual([
      { name: "controller", rank: 0, files: ids("src/controllers/order.controller.ts") },
      { name: "service", rank: 3, files: ids("src/services/order.service.ts") },
      {
        name: "domain",
        rank: 2,
        files: ids(
          "src/analytics/README.md",
          "src/analytics/index.ts",
          "src/analytics/report.ts",
          "src/payments/index.ts",
          "src/payments/legacy/old.ts",
          "src/payments/payment.test.ts",
          "src/payments/payment.ts",
        ),
      },
    ]);
  });

  it("omits layers when none are declared, and sorts configured roles by role", () => {
    const declarations = resolveDeclarations(FILES, {
      inference: {
        roles: {
          service: ["src/**/*.service.ts"],
          "http-controller": ["src/**/*.controller.ts"],
          "x-acme-event": ["src/events/**"],
        },
      },
    });
    expect("layers" in declarations).toBe(false);
    expect(declarations.roles).toEqual([
      { role: "http-controller", files: ids("src/controllers/order.controller.ts") },
      { role: "service", files: ids("src/services/order.service.ts") },
      { role: "x-acme-event", files: [] },
    ]);
  });

  it("passes the configuration file through only when given", () => {
    expect(resolveDeclarations(FILES, {}, fileId("katedrala.config.yaml"))).toEqual({
      modules: [],
      roles: [],
      configurationFile: "file:katedrala.config.yaml",
    });
    expect("configurationFile" in resolveDeclarations(FILES, {})).toBe(false);
  });

  it("does not depend on the order of the files or of configuration keys (D-23)", () => {
    const modules: ModulesConfiguration = {
      payments: ["src/payments/**"],
      core: { files: ["src/**/*.ts", "!src/payments/**"], entry: ["src/**/index.ts"] },
      docs: ["**/*.md"],
    };
    const roles = { service: ["src/services/**"], "data-model": ["src/types/**"] };
    const expected = resolveDeclarations(FILES, { modules, inference: { roles } });
    fc.assert(
      fc.property(
        fc.shuffledSubarray([...FILES], { minLength: FILES.length }),
        fc.shuffledSubarray(Object.entries(modules), { minLength: 3 }),
        fc.shuffledSubarray(Object.entries(roles), { minLength: 2 }),
        (files, moduleEntries, roleEntries) => {
          const declarations = resolveDeclarations(files, {
            modules: Object.fromEntries(moduleEntries),
            inference: { roles: Object.fromEntries(roleEntries) },
          });
          expect(declarations).toEqual(expected);
        },
      ),
      { seed: 20261008, numRuns: 100 },
    );
  });
});
