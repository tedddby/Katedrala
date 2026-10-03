import type { Diagnostic } from "@katedrala/ir";
import type { AdapterProject, ModuleResolution } from "@katedrala/plugin-api";
import { describe, expect, it } from "vitest";
import { DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS } from "../options.js";
import { ConfigSet } from "./config-set.js";
import { DiagnosticCollector } from "./diagnostics.js";
import { createTypeScriptProject } from "./index.js";
import { Locator } from "./locations.js";
import type { Manifest } from "./manifests.js";
import { createMemoryProjectContext } from "./memory-context.js";
import type { MemoryProjectContextOptions } from "./memory-context.js";
import { SnapshotIndex } from "./snapshot.js";
import { isProjectConfigPath, loadProjectConfigs, packageConfigTargets } from "./tsconfig.js";
import type { ProjectConfig } from "./tsconfig.js";

const json = (value: unknown): string => JSON.stringify(value, null, 2);

function resolveIn(project: AdapterProject, fromFile: string, specifier: string): ModuleResolution {
  return project.resolve({ specifier, fromFile, kind: "static", mechanism: "import-declaration" });
}

async function load(
  files: Record<string, string>,
  options: MemoryProjectContextOptions = {},
): Promise<{
  configs: ConfigSet;
  diagnostics: Diagnostic[];
  config: (path: string) => ProjectConfig;
}> {
  const memory = createMemoryProjectContext(files, options);
  const snapshot = new SnapshotIndex(Object.keys(files));
  const locator = new Locator(options.subdirectory);
  const collector = new DiagnosticCollector();
  const reader = {
    readFile: (path: string) => memory.context.readText(path),
    readAncestor: (path: string) => memory.context.readAncestorText(path),
  };
  const configs = new ConfigSet(
    await loadProjectConfigs(reader, snapshot, locator, collector),
    snapshot,
    locator,
  );
  const config = (path: string): ProjectConfig => {
    const found = configs.get(path);
    if (found === undefined) throw new Error(`no configuration ${path}`);
    return found;
  };
  return { configs, diagnostics: collector.sorted(), config };
}

describe("configuration files", () => {
  it("recognizes tsconfig*.json and jsconfig.json outside node_modules", () => {
    expect(isProjectConfigPath("tsconfig.json")).toBe(true);
    expect(isProjectConfigPath("packages/a/tsconfig.build.json")).toBe(true);
    expect(isProjectConfigPath("tsconfig-base.json")).toBe(true);
    expect(isProjectConfigPath("jsconfig.json")).toBe(true);
    expect(isProjectConfigPath("jsconfig.app.json")).toBe(false);
    expect(isProjectConfigPath("node_modules/x/tsconfig.json")).toBe(false);
    expect(isProjectConfigPath("tsconfig.json.bak")).toBe(false);
  });
});

describe("extends", () => {
  it("follows relative targets with and without .json; the configuration overrides its bases", async () => {
    const { config, diagnostics } = await load({
      "configs/base.json": json({
        compilerOptions: { baseUrl: "..", outDir: "out", rootDir: "../src" },
      }),
      "configs/strict.json": json({ extends: "./base", compilerOptions: { outDir: "strict-out" } }),
      "tsconfig.json": json({
        extends: "./configs/strict.json",
        compilerOptions: { outDir: "dist" },
      }),
      "app/tsconfig.json": json({ extends: "../configs/strict" }),
    });
    expect(diagnostics).toEqual([]);
    const root = config("tsconfig.json");
    expect(root.baseUrl).toBe("");
    expect(root.rootDir).toBe("src");
    expect(root.outDir).toBe("dist");
    expect(config("app/tsconfig.json").outDir).toBe("configs/strict-out");
  });

  it("applies arrays of bases in order", async () => {
    const { config } = await load({
      "a.json": json({ compilerOptions: { outDir: "a", rootDir: "a-src" } }),
      "b.json": json({ compilerOptions: { outDir: "b" } }),
      "tsconfig.json": json({ extends: ["./a.json", "./b.json"] }),
      "tsconfig.reverse.json": json({ extends: ["./b.json", "./a.json"] }),
    });
    expect(config("tsconfig.json")).toMatchObject({ outDir: "b", rootDir: "a-src" });
    expect(config("tsconfig.reverse.json")).toMatchObject({ outDir: "a", rootDir: "a-src" });
  });

  it("replaces paths as a whole and keeps each value relative to the declaring configuration", async () => {
    const { config } = await load({
      "base/tsconfig.json": json({
        compilerOptions: { paths: { "@a/*": ["./a/*"], "@b/*": ["./b/*"] } },
      }),
      "app/tsconfig.json": json({
        extends: "../base/tsconfig.json",
        compilerOptions: { paths: { "@c/*": ["c/*"] } },
      }),
      "lib/tsconfig.json": json({ extends: "../base/tsconfig.json" }),
    });
    expect(config("app/tsconfig.json").paths?.entries.map((entry) => entry.key)).toEqual(["@c/*"]);
    expect(config("app/tsconfig.json").paths?.entries[0]?.substitutions).toEqual([
      { base: "app", template: "c/*" },
    ]);
    expect(config("lib/tsconfig.json").paths).toMatchObject({
      declaredIn: "base/tsconfig.json",
      entries: [
        {
          key: "@a/*",
          prefix: "@a/",
          suffix: "",
          wildcard: true,
          substitutions: [{ base: "base", template: "./a/*" }],
        },
        { key: "@b/*", substitutions: [{ base: "base", template: "./b/*" }] },
      ],
    });
  });

  it("resolves paths against baseUrl when one is set, wherever it is declared", async () => {
    const { config } = await load({
      "tsconfig.base.json": json({ compilerOptions: { baseUrl: "." } }),
      "packages/x/tsconfig.json": json({
        extends: "../../tsconfig.base.json",
        compilerOptions: { paths: { "@x/*": ["packages/x/src/*"] } },
      }),
    });
    expect(config("packages/x/tsconfig.json").paths?.entries[0]?.substitutions).toEqual([
      { base: "", template: "packages/x/src/*" },
    ]);
  });

  it("substitutes ${configDir} with the directory of the configuration being evaluated", async () => {
    const { config } = await load({
      "configs/shared.json": json({
        compilerOptions: { outDir: "${configDir}/dist", paths: { "~/*": ["${configDir}/src/*"] } },
        include: ["${configDir}/src"],
      }),
      "packages/a/tsconfig.json": json({ extends: "../../configs/shared.json" }),
    });
    const a = config("packages/a/tsconfig.json");
    expect(a.outDir).toBe("packages/a/dist");
    expect(a.paths?.entries[0]?.substitutions).toEqual([
      { base: "packages/a", template: "./src/*" },
    ]);
    expect(a.include?.test("/packages/a/src/x.ts")).toBe(true);
    expect(a.include?.test("/configs/src/x.ts")).toBe(false);
  });

  it("reports missing targets and ignores package targets once per specifier", async () => {
    const { config, diagnostics } = await load({
      "tsconfig.json": json({
        extends: ["@tsconfig/node22/tsconfig.json", "./missing", "./present"],
        compilerOptions: {},
      }),
      "present.json": json({ compilerOptions: { outDir: "dist" } }),
      "packages/a/tsconfig.json": json({ extends: "@tsconfig/node22/tsconfig.json" }),
      "packages/b/tsconfig.json": json({ extends: 42 }),
      "packages/c/tsconfig.json": json({ extends: "" }),
    });
    expect(config("tsconfig.json").outDir).toBe("dist");
    // One diagnostic for the package specifier, attached to the first configuration (in path order) using it.
    expect(diagnostics).toEqual([
      {
        code: "configuration-warning",
        severity: "info",
        message:
          '"extends": "@tsconfig/node22/tsconfig.json" names a package in node_modules, which is not part of the snapshot; its settings are ignored',
        file: "file:packages/a/tsconfig.json",
      },
      {
        code: "invalid-project-configuration",
        severity: "warning",
        message: '"extends" of packages/b/tsconfig.json must be a string or an array of strings',
        file: "file:packages/b/tsconfig.json",
      },
      {
        code: "invalid-project-configuration",
        severity: "warning",
        message: '"extends" of packages/c/tsconfig.json must not be an empty string',
        file: "file:packages/c/tsconfig.json",
      },
      {
        code: "invalid-project-configuration",
        severity: "warning",
        message: '"extends" target "./missing" of tsconfig.json was not found',
        file: "file:tsconfig.json",
      },
    ]);
  });

  it("reads bases above the analysis root through readAncestorText", async () => {
    const memory = createMemoryProjectContext(
      {
        "tsconfig.json": json({ extends: "../../tsconfig.base.json", include: ["src"] }),
        "src/main.ts": "",
        "src/x.ts": "",
      },
      {
        subdirectory: "packages/api",
        ancestors: {
          "tsconfig.base.json": json({
            extends: "./configs/paths",
            compilerOptions: { baseUrl: "." },
          }),
          "configs/paths.json": json({
            compilerOptions: { paths: { "@api/*": ["packages/api/src/*"] } },
          }),
        },
      },
    );
    const project = await createTypeScriptProject(
      memory.context,
      DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS,
    );
    expect(memory.diagnostics).toEqual([]);
    expect(project.configurationFiles).toEqual([
      "<top-level>/configs/paths.json",
      "<top-level>/tsconfig.base.json",
      "tsconfig.json",
    ]);
    expect(
      project.resolve({
        specifier: "@api/x",
        fromFile: "src/main.ts",
        kind: "static",
        mechanism: "import-declaration",
      }),
    ).toEqual({ status: "resolved", paths: ["src/x.ts"], method: "tsconfig-paths" });
  });

  it("cannot read bases above the root without a known top level", async () => {
    const { diagnostics } = await load({
      "tsconfig.json": json({ extends: "../tsconfig.base.json" }),
    });
    expect(diagnostics).toEqual([
      {
        code: "invalid-project-configuration",
        severity: "warning",
        message:
          '"extends" target "../tsconfig.base.json" of tsconfig.json lies outside the analysis root and cannot be read',
        file: "file:tsconfig.json",
      },
    ]);
    const above = await load(
      { "tsconfig.json": json({ extends: "../../../x.json" }) },
      { subdirectory: "a" },
    );
    expect(above.diagnostics[0]?.message).toMatch(/lies outside the analysis root/);
    const missingAncestor = await load(
      { "tsconfig.json": json({ extends: "../base.json" }) },
      { subdirectory: "a" },
    );
    expect(missingAncestor.diagnostics[0]?.message).toBe(
      '"extends" target "../base.json" of tsconfig.json was not found',
    );
  });

  it("follows targets in workspace packages, which node_modules links to (regression)", async () => {
    const memory = createMemoryProjectContext({
      "package.json": json({ name: "acme", private: true, workspaces: ["apps/*", "packages/*"] }),
      "packages/tsconfig/package.json": json({ name: "@acme/tsconfig" }),
      "packages/tsconfig/base.json": json({
        compilerOptions: { paths: { "~/*": ["${configDir}/src/*"] }, outDir: "${configDir}/dist" },
      }),
      "apps/web/tsconfig.json": json({ extends: "@acme/tsconfig/base.json" }),
      "apps/web/src/main.ts": "",
      "apps/web/src/lib/format.ts": "",
      "apps/api/tsconfig.json": json({ extends: "@acme/tsconfig/base" }),
      "apps/api/src/main.ts": "",
      "apps/api/src/lib/format.ts": "",
      "apps/broken/tsconfig.json": json({ extends: "@acme/tsconfig/missing" }),
    });
    const project = await createTypeScriptProject(
      memory.context,
      DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS,
    );
    expect(memory.diagnostics).toEqual([
      {
        code: "invalid-project-configuration",
        severity: "warning",
        message:
          '"extends" target "@acme/tsconfig/missing" of apps/broken/tsconfig.json was not found in workspace package @acme/tsconfig (packages/tsconfig/package.json)',
        file: "file:apps/broken/tsconfig.json",
      },
    ]);
    expect(project.configurationFiles).toContain("packages/tsconfig/base.json");
    expect(resolveIn(project, "apps/web/src/main.ts", "~/lib/format")).toEqual({
      status: "resolved",
      paths: ["apps/web/src/lib/format.ts"],
      method: "tsconfig-paths",
    });
    expect(resolveIn(project, "apps/api/src/main.ts", "~/lib/format")).toEqual({
      status: "resolved",
      paths: ["apps/api/src/lib/format.ts"],
      method: "tsconfig-paths",
    });
  });

  it("looks up targets inside a package as TypeScript does", () => {
    const locator = new Locator(undefined);
    const manifest = (json: Manifest["json"]): Manifest => ({
      path: "packages/tsconfig/package.json",
      directory: "packages/tsconfig",
      json,
      name: "@acme/tsconfig",
    });
    const plain = manifest({ name: "@acme/tsconfig" });
    expect(packageConfigTargets(plain, ".", locator)).toEqual(["packages/tsconfig/tsconfig.json"]);
    expect(packageConfigTargets(plain, "./base", locator)).toEqual([
      "packages/tsconfig/base",
      "packages/tsconfig/base.json",
      "packages/tsconfig/base/tsconfig.json",
    ]);
    expect(packageConfigTargets(plain, "./base.json", locator)).toEqual([
      "packages/tsconfig/base.json",
      "packages/tsconfig/base.json/tsconfig.json",
    ]);
    // `main` does not count; the `tsconfig` field does.
    expect(
      packageConfigTargets(
        manifest({ main: "./main.json", tsconfig: "./configs/main.json" }),
        ".",
        locator,
      ),
    ).toEqual(["packages/tsconfig/configs/main.json", "packages/tsconfig/tsconfig.json"]);
    // `exports` decide alone; conditions `node`, `require`, `types` and `default` count in key order.
    const exported = manifest({
      exports: {
        "./base": { import: "./import.json", types: "./types.json", default: "./default.json" },
        "./*": "./configs/*.json",
      },
    });
    expect(packageConfigTargets(exported, "./base", locator)).toEqual([
      "packages/tsconfig/types.json",
      "packages/tsconfig/default.json",
    ]);
    expect(packageConfigTargets(exported, "./node", locator)).toEqual([
      "packages/tsconfig/configs/node.json",
    ]);
    expect(
      packageConfigTargets(manifest({ exports: { "./a": "./a.json" } }), "./b", locator),
    ).toEqual([]);
  });

  it("keeps ignoring bare targets that no workspace package provides", async () => {
    const memory = createMemoryProjectContext({
      "package.json": json({ name: "acme" }),
      "tsconfig.json": json({ extends: "@tsconfig/node22/tsconfig.json" }),
    });
    await createTypeScriptProject(memory.context, DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS);
    expect(memory.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      '"extends": "@tsconfig/node22/tsconfig.json" names a package in node_modules, which is not part of the snapshot; its settings are ignored',
    ]);
  });

  it("detects cycles and reports each once", async () => {
    const { config, diagnostics } = await load({
      "a.json": json({ extends: "./b.json", compilerOptions: { outDir: "a" } }),
      "b.json": json({ extends: "./tsconfig.json", compilerOptions: { rootDir: "b" } }),
      "tsconfig.json": json({ extends: "./a.json" }),
    });
    expect(diagnostics).toEqual([
      {
        code: "invalid-project-configuration",
        severity: "warning",
        message: 'Circular "extends" chain: a.json -> b.json -> tsconfig.json -> a.json',
        file: "file:a.json",
      },
    ]);
    expect(config("tsconfig.json")).toMatchObject({ outDir: "a", rootDir: "b" });
  });

  it("uses what could be read of an invalid configuration, and ignores invalid bases", async () => {
    const { config, diagnostics } = await load({
      "tsconfig.json": '{\n  "compilerOptions": { "outDir": "dist", "rootDir": }\n}',
      "broken-base.json": '{ "compilerOptions": { "outDir": "never" }, }}',
      "app/tsconfig.json": json({
        extends: "../broken-base.json",
        compilerOptions: { rootDir: "src" },
      }),
    });
    expect(config("tsconfig.json").outDir).toBe("dist");
    expect(config("app/tsconfig.json").outDir).toBeUndefined();
    expect(config("app/tsconfig.json").rootDir).toBe("app/src");
    expect(diagnostics).toEqual([
      {
        code: "invalid-project-configuration",
        severity: "warning",
        message: "Invalid broken-base.json: Unexpected token.",
        file: "file:broken-base.json",
        line: 1,
        column: 46,
      },
      {
        code: "invalid-project-configuration",
        severity: "warning",
        message: "Invalid tsconfig.json: Expression expected.",
        file: "file:tsconfig.json",
        line: 2,
        // Line 2 is `  "compilerOptions": { "outDir": "dist", "rootDir": }`; the `}` is in column 53.
        column: 53,
      },
    ]);
  });

  it("reports options of the wrong type", async () => {
    const { diagnostics } = await load({
      "tsconfig.json": json({
        compilerOptions: { paths: { "a/*/*": ["x/*"], b: "x", ok: ["y"] } },
        include: "src",
        references: {},
      }),
      "tsconfig.other.json": json({ compilerOptions: [], include: ["src/**"] }),
      "tsconfig.third.json": json({ compilerOptions: { paths: [] }, references: [{ nope: true }] }),
    });
    expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      '"include" of tsconfig.json must be an array of strings',
      '"references" of tsconfig.json must be an array of objects with a string "path"',
      'Pattern "a/*/*" in "paths" of tsconfig.json can have at most one "*" character',
      'Substitutions for pattern "b" in "paths" of tsconfig.json must be an array of strings',
      '"compilerOptions" of tsconfig.other.json must be an object',
      "File specification cannot end in a recursive directory wildcard ('**'): src/** (in tsconfig.other.json)",
      '"paths" of tsconfig.third.json must be an object',
      '"references" of tsconfig.third.json must be an array of objects with a string "path"',
    ]);
  });
});

describe("configurations above the analysis root", () => {
  it("uses the tsconfig.json above a subdirectory root that has none of its own (regression)", async () => {
    const memory = createMemoryProjectContext(
      { "main.ts": "", "utils/format.ts": "" },
      {
        subdirectory: "src",
        ancestors: {
          "tsconfig.json": json({
            compilerOptions: { baseUrl: ".", paths: { "@app/*": ["src/*"], "~/*": ["src/*"] } },
          }),
        },
      },
    );
    const project = await createTypeScriptProject(
      memory.context,
      DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS,
    );
    expect(memory.diagnostics).toEqual([]);
    expect(memory.ancestorReads.sort()).toEqual(["jsconfig.json", "tsconfig.json"]);
    expect(project.configurationFiles).toEqual(["<top-level>/tsconfig.json"]);
    for (const specifier of ["@app/utils/format", "~/utils/format"]) {
      expect(resolveIn(project, "main.ts", specifier)).toEqual({
        status: "resolved",
        paths: ["utils/format.ts"],
        method: "tsconfig-paths",
      });
    }
  });

  it("searches above the root nearest first, after the configurations inside it", async () => {
    const { configs } = await load(
      {
        "tsconfig.json": json({ include: ["src"] }),
        "src/main.ts": "",
        "scripts/build.ts": "",
        "tools/x.ts": "",
      },
      {
        subdirectory: "apps/web",
        ancestors: {
          "apps/tsconfig.json": json({ include: ["web/scripts"] }),
          "jsconfig.json": json({}),
          "tsconfig.json": json({ files: ["apps/web/tools/x.ts"] }),
        },
      },
    );
    expect(configs.governing("src/main.ts")?.path).toBe("tsconfig.json");
    expect(configs.governing("scripts/build.ts")?.path).toBe("../tsconfig.json");
    expect(configs.governing("tools/x.ts")?.display).toBe("<top-level>/tsconfig.json");
    // Selected by none of them: the nearest configuration.
    const other = await load(
      { "tsconfig.json": json({ include: ["src"] }), "lib/y.ts": "" },
      { subdirectory: "apps/web", ancestors: { "tsconfig.json": json({ include: ["other"] }) } },
    );
    expect(other.configs.governing("lib/y.ts")?.path).toBe("tsconfig.json");
  });

  it("follows the references of a solution above the root only back into the root", async () => {
    const memory = createMemoryProjectContext(
      {
        "tsconfig.json": json({ files: [], references: [{ path: "./tsconfig.app.json" }] }),
        "tsconfig.app.json": json({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
        "src/main.ts": "",
        "src/a.ts": "",
      },
      {
        subdirectory: "packages/api",
        ancestors: {
          "tsconfig.json": json({
            files: [],
            references: [
              { path: "./packages/api" },
              { path: "./packages/web" },
              { path: "./packages/gone" },
            ],
          }),
          "packages/web/tsconfig.json": json({ compilerOptions: { paths: { "@/*": ["./x/*"] } } }),
        },
      },
    );
    const project = await createTypeScriptProject(
      memory.context,
      DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS,
    );
    expect(memory.diagnostics).toEqual([]);
    expect(memory.ancestorReads).not.toContain("packages/web/tsconfig.json");
    expect(project.configurationFiles).toEqual([
      "<top-level>/tsconfig.json",
      "tsconfig.app.json",
      "tsconfig.json",
    ]);
    expect(resolveIn(project, "src/main.ts", "@/a")).toEqual({
      status: "resolved",
      paths: ["src/a.ts"],
      method: "tsconfig-paths",
    });
  });

  it("reads nothing above the root when the root is the top level or the top level is unknown", async () => {
    const variants: MemoryProjectContextOptions[] = [{}, { subdirectory: "" }];
    for (const options of variants) {
      const memory = createMemoryProjectContext(
        { "a.ts": "" },
        { ...options, ancestors: { "tsconfig.json": "{}" } },
      );
      const project = await createTypeScriptProject(
        memory.context,
        DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS,
      );
      expect(memory.ancestorReads).toEqual([]);
      expect(project.configurationFiles).toEqual([]);
    }
  });
});

describe("problems in shared configurations", () => {
  it("reports problems once, at the configuration that declares them", async () => {
    const { diagnostics } = await load({
      "tsconfig.base.json": json({
        compilerOptions: { paths: { "a/*/*": ["x/*"] } },
        include: ["src/**"],
      }),
      "packages/a/tsconfig.json": json({ extends: "../../tsconfig.base.json" }),
      "packages/b/tsconfig.json": json({ extends: "../../tsconfig.base.json" }),
    });
    expect(diagnostics).toEqual([
      {
        code: "invalid-project-configuration",
        severity: "warning",
        message:
          "File specification cannot end in a recursive directory wildcard ('**'): src/** (in tsconfig.base.json)",
        file: "file:tsconfig.base.json",
      },
      {
        code: "invalid-project-configuration",
        severity: "warning",
        message:
          'Pattern "a/*/*" in "paths" of tsconfig.base.json can have at most one "*" character',
        file: "file:tsconfig.base.json",
      },
    ]);
  });

  it("reports referenced projects that do not exist", async () => {
    const { diagnostics } = await load({
      "tsconfig.json": json({
        files: [],
        references: [{ path: "./packages/gone" }, { path: "./tsconfig.lib.json" }],
      }),
      "tsconfig.lib.json": json({}),
    });
    expect(diagnostics).toEqual([
      {
        code: "invalid-project-configuration",
        severity: "warning",
        message: "Referenced project packages/gone/tsconfig.json of tsconfig.json was not found",
        file: "file:tsconfig.json",
      },
    ]);
  });
});

describe("files, include and exclude", () => {
  it("defaults include to everything below the configuration and exclude to the output directories", async () => {
    const { configs, config } = await load({
      "tsconfig.json": json({ compilerOptions: { outDir: "dist", declarationDir: "types" } }),
      "src/a.ts": "",
      "dist/a.js": "",
      "types/a.d.ts": "",
      ".storybook/main.ts": "",
    });
    const root = config("tsconfig.json");
    expect(configs.selects(root, "src/a.ts")).toBe(true);
    expect(configs.selects(root, "dist/a.js")).toBe(false);
    expect(configs.selects(root, "types/a.d.ts")).toBe(false);
    expect(configs.selects(root, ".storybook/main.ts")).toBe(false);
  });

  it("inherits include, exclude and files relative to the declaring configuration unless set", async () => {
    const { configs, config } = await load({
      "configs/base.json": json({ include: ["../src"], exclude: ["../src/**/*.test.ts"] }),
      "tsconfig.json": json({ extends: "./configs/base.json" }),
      "tsconfig.own.json": json({ extends: "./configs/base.json", include: ["lib"] }),
      "tsconfig.files.json": json({ files: ["src/a.ts"] }),
      "src/a.ts": "",
      "src/a.test.ts": "",
      "lib/b.ts": "",
    });
    const root = config("tsconfig.json");
    expect(configs.selects(root, "src/a.ts")).toBe(true);
    expect(configs.selects(root, "src/a.test.ts")).toBe(false);
    expect(configs.selects(root, "lib/b.ts")).toBe(false);
    const own = config("tsconfig.own.json");
    expect(configs.selects(own, "lib/b.ts")).toBe(true);
    expect(configs.selects(own, "src/a.ts")).toBe(false);
    const files = config("tsconfig.files.json");
    expect(configs.selects(files, "src/a.ts")).toBe(true);
    expect(configs.selects(files, "src/a.test.ts")).toBe(false);
  });

  it("selects files listed in files even when excluded", async () => {
    const { configs, config } = await load({
      "tsconfig.json": json({
        files: ["src/generated.ts"],
        include: ["src"],
        exclude: ["src/generated.ts"],
      }),
      "src/generated.ts": "",
    });
    expect(configs.selects(config("tsconfig.json"), "src/generated.ts")).toBe(true);
  });
});

describe("references and solutions", () => {
  it("resolves references to directories and files and recognizes solution-style configurations", async () => {
    const { config } = await load({
      "tsconfig.json": json({
        files: [],
        references: [{ path: "./packages/a" }, { path: "./tsconfig.node.json" }],
      }),
      "tsconfig.node.json": json({
        include: ["vite.config.ts"],
        references: [{ path: "./packages/b/tsconfig.lib.json" }],
      }),
      "packages/a/tsconfig.json": json({ compilerOptions: { composite: true } }),
      "packages/b/tsconfig.lib.json": json({}),
    });
    expect(config("tsconfig.json")).toMatchObject({
      references: ["packages/a/tsconfig.json", "tsconfig.node.json"],
      solution: true,
    });
    expect(config("tsconfig.node.json")).toMatchObject({
      references: ["packages/b/tsconfig.lib.json"],
      solution: false,
    });
    expect(config("packages/a/tsconfig.json").composite).toBe(true);
  });

  it("delegates recursively through nested solutions", async () => {
    const { configs } = await load({
      "tsconfig.json": json({ files: [], references: [{ path: "./apps" }] }),
      "apps/tsconfig.json": json({
        include: [],
        references: [{ path: "./web/tsconfig.app.json" }],
      }),
      "apps/web/tsconfig.app.json": json({ include: ["src"] }),
      "apps/web/src/main.ts": "",
      "scripts/x.ts": "",
    });
    expect(configs.governing("apps/web/src/main.ts")?.path).toBe("apps/web/tsconfig.app.json");
    expect(configs.governing("scripts/x.ts")?.path).toBe("tsconfig.json");
  });

  it("treats jsconfig.json as allowing JavaScript", async () => {
    const { config } = await load({ "jsconfig.json": json({}), "tsconfig.json": json({}) });
    expect(config("jsconfig.json").allowJs).toBe(true);
    expect(config("tsconfig.json").allowJs).toBe(false);
  });
});

describe("root directories of outputs", () => {
  it("uses rootDir, the configuration directory for composite projects, or the common source directory", async () => {
    const { configs, config } = await load({
      "explicit/tsconfig.json": json({ compilerOptions: { rootDir: "lib", outDir: "dist" } }),
      "composite/tsconfig.json": json({ compilerOptions: { composite: true, outDir: "dist" } }),
      "inferred/tsconfig.json": json({ compilerOptions: { outDir: "build" }, include: ["app"] }),
      "inferred/app/a.ts": "",
      "inferred/app/nested/b.ts": "",
      "inferred/app/types.d.ts": "",
      "js/jsconfig.json": json({ compilerOptions: { outDir: "out" } }),
      "js/lib/a.js": "",
      "js/src/b.js": "",
      "empty/tsconfig.json": json({ include: ["nothing"] }),
    });
    expect(configs.rootDirectories(config("explicit/tsconfig.json"))).toEqual(["explicit/lib"]);
    expect(configs.rootDirectories(config("composite/tsconfig.json"))).toEqual(["composite"]);
    expect(configs.rootDirectories(config("inferred/tsconfig.json"))).toEqual([
      "inferred/app",
      "inferred",
    ]);
    expect(configs.rootDirectories(config("js/jsconfig.json"))).toEqual(["js"]);
    expect(configs.rootDirectories(config("empty/tsconfig.json"))).toEqual(["empty"]);
  });

  it("finds the configurations whose output directory contains a path", async () => {
    const { configs } = await load({
      "tsconfig.json": json({ compilerOptions: { outDir: "dist", declarationDir: "types" } }),
      "packages/a/tsconfig.json": json({ compilerOptions: { outDir: "lib" } }),
    });
    expect(
      configs
        .outputConfigs("dist/index.js")
        .map(({ config, outputDirectory }) => [config.path, outputDirectory]),
    ).toEqual([["tsconfig.json", "dist"]]);
    expect(
      configs.outputConfigs("types/index.d.ts").map(({ outputDirectory }) => outputDirectory),
    ).toEqual(["types"]);
    expect(configs.outputConfigs("packages/a/lib/x.js").map(({ config }) => config.path)).toEqual([
      "packages/a/tsconfig.json",
    ]);
    expect(configs.outputConfigs("src/x.js")).toEqual([]);
  });
});
