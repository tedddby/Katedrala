import fc from "fast-check";
import type { Diagnostic } from "@katedrala/ir";
import type { AdapterProject, ModuleResolution, ProjectContext } from "@katedrala/plugin-api";
import { describe, expect, it } from "vitest";
import { DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS } from "../options.js";
import { createTypeScriptProject } from "./index.js";
import { createMemoryProjectContext } from "./memory-context.js";

const json = (value: unknown): string => JSON.stringify(value, null, 2);

/** A small monorepo exercising every part of project setup. */
const MONOREPO: Record<string, string> = {
  "package.json": json({ name: "acme", private: true, workspaces: ["packages/*"] }),
  "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
  "tsconfig.base.json": json({
    compilerOptions: { baseUrl: ".", paths: { "@acme/shared/*": ["packages/shared/src/*"] } },
  }),
  "configs/strict": json({ compilerOptions: { strict: true } }),
  "packages/shared/package.json": json({
    name: "@acme/shared",
    exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
  }),
  "packages/shared/tsconfig.json": json({
    extends: ["../../tsconfig.base.json", "../../configs/strict", "@tsconfig/node22"],
    compilerOptions: { outDir: "dist", rootDir: "src" },
    include: ["src"],
  }),
  "packages/shared/src/index.ts": 'export * from "./money.js";\n',
  "packages/shared/src/money.ts": "export const money = 1;\n",
  "packages/shared/src/strings.ts": "export const s = 1;\n",
  "packages/api/package.json": json({
    name: "@acme/api",
    main: "dist/server.js",
    scripts: { start: "node dist/server.js" },
    dependencies: { "@acme/shared": "workspace:*", express: "^5" },
  }),
  "packages/api/tsconfig.json": json({ extends: "../../tsconfig.base.json", include: ["src"] }),
  "packages/api/src/server.ts":
    'import "@acme/shared";\nimport "@acme/shared/strings";\nimport "./routes";\n',
  "packages/api/src/routes.ts":
    'import express from "express";\nimport { readFile } from "node:fs/promises";\n',
  "packages/broken/package.json": "{ nope",
  "packages/broken/index.ts": "",
  "README.md": "# acme\n",
};

const REQUESTS: ReadonlyArray<[fromFile: string, specifier: string]> = [
  ["packages/api/src/server.ts", "@acme/shared"],
  ["packages/api/src/server.ts", "@acme/shared/strings"],
  ["packages/api/src/server.ts", "./routes"],
  ["packages/api/src/routes.ts", "express"],
  ["packages/api/src/routes.ts", "node:fs/promises"],
  ["packages/api/src/routes.ts", "./missing"],
  ["packages/shared/src/index.ts", "./money.js"],
  ["packages/shared/src/index.ts", "@acme/shared"],
  ["packages/broken/index.ts", "#x"],
];

interface Outcome {
  packages: AdapterProject["packages"];
  entryPoints: AdapterProject["entryPoints"];
  configurationFiles: AdapterProject["configurationFiles"];
  diagnostics: Diagnostic[];
  resolutions: ModuleResolution[];
}

async function outcomeOf(context: ProjectContext, diagnostics: Diagnostic[]): Promise<Outcome> {
  const project = await createTypeScriptProject(context, DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS);
  return {
    packages: project.packages,
    entryPoints: project.entryPoints,
    configurationFiles: project.configurationFiles,
    diagnostics,
    resolutions: REQUESTS.map(([fromFile, specifier]) =>
      project.resolve({ specifier, fromFile, kind: "static", mechanism: "import-declaration" }),
    ),
  };
}

describe("createTypeScriptProject", () => {
  it("lists every configuration file read, sorted", async () => {
    const { context } = createMemoryProjectContext(MONOREPO);
    const project = await createTypeScriptProject(context, DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS);
    expect(project.configurationFiles).toEqual([
      "configs/strict",
      "package.json",
      "packages/api/package.json",
      "packages/api/tsconfig.json",
      "packages/broken/package.json",
      "packages/shared/package.json",
      "packages/shared/tsconfig.json",
      "pnpm-workspace.yaml",
      "tsconfig.base.json",
    ]);
  });

  it("reports diagnostics once each, in canonical order, before resolving", async () => {
    const { context, diagnostics } = createMemoryProjectContext(MONOREPO);
    await createTypeScriptProject(context, DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS);
    expect(diagnostics).toEqual([
      {
        code: "invalid-manifest",
        severity: "warning",
        message: "Invalid package.json: '}' expected.",
        file: "file:packages/broken/package.json",
        line: 1,
        column: 7,
      },
      {
        code: "configuration-warning",
        severity: "info",
        message:
          '"extends": "@tsconfig/node22" names a package in node_modules, which is not part of the snapshot; its settings are ignored',
        file: "file:packages/shared/tsconfig.json",
      },
    ]);
  });

  it("returns frozen results and a synchronous resolver", async () => {
    const { context } = createMemoryProjectContext(MONOREPO);
    const project = await createTypeScriptProject(context, DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS);
    expect(Object.isFrozen(project)).toBe(true);
    expect(Object.isFrozen(project.packages)).toBe(true);
    expect(Object.isFrozen(project.entryPoints)).toBe(true);
    expect(Object.isFrozen(project.configurationFiles)).toBe(true);
    const result = project.resolve({
      specifier: "@acme/shared",
      fromFile: "packages/api/src/server.ts",
      kind: "static",
      mechanism: "import-declaration",
    });
    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toEqual({
      status: "resolved",
      paths: ["packages/shared/src/index.ts"],
      method: "workspace-package",
    });
    expect("resolveMember" in project).toBe(false);
    expect("link" in project).toBe(false);
  });

  it("resolves the same request identically every time", async () => {
    const { context } = createMemoryProjectContext(MONOREPO);
    const project = await createTypeScriptProject(context, DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS);
    const request = {
      specifier: "@acme/shared/strings",
      fromFile: "packages/api/src/server.ts",
      kind: "static",
      mechanism: "import-declaration",
    } as const;
    const first = project.resolve(request);
    for (let index = 0; index < 3; index++) expect(project.resolve(request)).toEqual(first);
    expect(first).toEqual({
      status: "resolved",
      paths: ["packages/shared/src/strings.ts"],
      method: "tsconfig-paths",
    });
  });

  it("does not depend on the order in which files are listed", async () => {
    const reference = createMemoryProjectContext(MONOREPO);
    const expected = await outcomeOf(reference.context, reference.diagnostics);
    const paths = Object.keys(MONOREPO);
    await fc.assert(
      fc.asyncProperty(
        fc.shuffledSubarray(paths, { minLength: paths.length, maxLength: paths.length }),
        async (order) => {
          const memory = createMemoryProjectContext(MONOREPO);
          const byPath = new Map(memory.context.files.map((entry) => [entry.path, entry]));
          const files = order
            .map((path) => byPath.get(path))
            .filter((entry) => entry !== undefined);
          const shuffled: ProjectContext = { ...memory.context, files };
          expect(await outcomeOf(shuffled, memory.diagnostics)).toEqual(expected);
        },
      ),
      { numRuns: 25 },
    );
  });

  it("does not depend on the order in which reads complete", async () => {
    const reference = createMemoryProjectContext(MONOREPO);
    const expected = await outcomeOf(reference.context, reference.diagnostics);
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.nat({ max: 20 }), { minLength: 32, maxLength: 32 }),
        async (delays) => {
          const memory = createMemoryProjectContext(MONOREPO);
          let call = 0;
          const delayed: ProjectContext = {
            ...memory.context,
            readText: async (path) => {
              const ticks = delays[call++ % delays.length] ?? 0;
              for (let tick = 0; tick < ticks; tick++) await Promise.resolve();
              return memory.context.readText(path);
            },
          };
          expect(await outcomeOf(delayed, memory.diagnostics)).toEqual(expected);
        },
      ),
      { numRuns: 25 },
    );
  });

  it("treats unreadable configuration files as present but unusable", async () => {
    const { context, diagnostics } = createMemoryProjectContext(
      {
        "tsconfig.json": json({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
        "src/a.ts": "",
      },
      { unreadable: ["tsconfig.json"] },
    );
    const project = await createTypeScriptProject(context, DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS);
    expect(project.configurationFiles).toEqual(["tsconfig.json"]);
    expect(diagnostics).toEqual([
      {
        code: "invalid-project-configuration",
        severity: "warning",
        message: "tsconfig.json could not be read",
        file: "file:tsconfig.json",
      },
    ]);
    expect(
      project.resolve({
        specifier: "@/a",
        fromFile: "src/a.ts",
        kind: "static",
        mechanism: "import-declaration",
      }),
    ).toMatchObject({ status: "unresolved" });
  });

  it("survives a context whose reads reject", async () => {
    const { context } = createMemoryProjectContext({
      "package.json": json({ name: "x" }),
      "tsconfig.json": "{}",
    });
    const failing: ProjectContext = {
      ...context,
      readText: () => Promise.reject(new Error("disk on fire")),
      readAncestorText: () => Promise.reject(new Error("disk on fire")),
    };
    const project = await createTypeScriptProject(failing, DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS);
    expect(project.packages).toEqual([]);
  });

  it("handles an empty snapshot", async () => {
    const { context, diagnostics } = createMemoryProjectContext({});
    const project = await createTypeScriptProject(context, DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS);
    expect(project.packages).toEqual([]);
    expect(project.entryPoints).toEqual([]);
    expect(project.configurationFiles).toEqual([]);
    expect(diagnostics).toEqual([]);
    expect(
      project.resolve({
        specifier: "react",
        fromFile: "a.ts",
        kind: "static",
        mechanism: "import-declaration",
      }),
    ).toEqual({
      status: "external",
      namespace: "npm",
      packageName: "react",
      method: "external-package",
    });
  });
});

describe("createMemoryProjectContext", () => {
  it("lists files in path order with their UTF-8 sizes and reads them exactly", async () => {
    const memory = createMemoryProjectContext(
      { "b.ts": "é", "a.ts": "ab" },
      { unreadable: ["b.ts"] },
    );
    expect(memory.context.files).toEqual([
      { path: "a.ts", size: 2 },
      { path: "b.ts", size: 2 },
    ]);
    expect(memory.context.hasFile("a.ts")).toBe(true);
    expect(memory.context.hasFile("A.ts")).toBe(false);
    expect(await memory.context.readText("a.ts")).toBe("ab");
    expect(await memory.context.readText("b.ts")).toBeUndefined();
    expect(await memory.context.readText("c.ts")).toBeUndefined();
    expect(memory.reads).toEqual(["a.ts", "b.ts", "c.ts"]);
    expect(memory.context.subdirectory).toBeUndefined();
  });

  it("serves ancestor files only when the subdirectory is known", async () => {
    const without = createMemoryProjectContext({}, { ancestors: { "x.json": "{}" } });
    expect(await without.context.readAncestorText("x.json")).toBeUndefined();
    const withTop = createMemoryProjectContext(
      {},
      { subdirectory: "apps/web", ancestors: { "x.json": "{}" } },
    );
    expect(withTop.context.subdirectory).toBe("apps/web");
    expect(await withTop.context.readAncestorText("x.json")).toBe("{}");
    expect(withTop.ancestorReads).toEqual(["x.json"]);
    withTop.context.report({ code: "x-test", severity: "info", message: "m" });
    expect(withTop.diagnostics).toEqual([{ code: "x-test", severity: "info", message: "m" }]);
  });
});
