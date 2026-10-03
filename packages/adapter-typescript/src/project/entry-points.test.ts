import type { AdapterProject, EntryPointDescriptor } from "@katedrala/plugin-api";
import { describe, expect, it } from "vitest";
import { DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS } from "../options.js";
import { declaredEntries } from "./entry-points.js";
import { createTypeScriptProject } from "./index.js";
import { createMemoryProjectContext } from "./memory-context.js";

const json = (value: unknown): string => JSON.stringify(value, null, 2);

async function entryPointsOf(
  files: Record<string, string>,
): Promise<readonly EntryPointDescriptor[]> {
  const { context } = createMemoryProjectContext(files);
  const project: AdapterProject = await createTypeScriptProject(
    context,
    DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS,
  );
  return project.entryPoints;
}

describe("declared entries", () => {
  it("walks exports through subpaths, conditions and fallback arrays", () => {
    const manifest = {
      path: "package.json",
      directory: "",
      json: {
        exports: {
          ".": {
            node: { import: "./a.mjs", require: "./a.cjs" },
            default: ["./b.js", null, "./c.js"],
          },
          "./sub": "./sub.js",
          "./features/*": "./features/*.js",
          "./internal": null,
          types: "./ignored-in-subpath-map.d.ts",
        },
      },
    };
    expect(declaredEntries(manifest)).toEqual([
      { kind: "exports", source: "package.json#exports[.].node.import", target: "./a.mjs" },
      { kind: "exports", source: "package.json#exports[.].node.require", target: "./a.cjs" },
      { kind: "exports", source: "package.json#exports[.].default[0]", target: "./b.js" },
      { kind: "exports", source: "package.json#exports[.].default[2]", target: "./c.js" },
      { kind: "exports", source: "package.json#exports[./sub]", target: "./sub.js" },
    ]);
    expect(
      declaredEntries({ path: "package.json", directory: "", json: { exports: "./index.js" } }),
    ).toEqual([{ kind: "exports", source: "package.json#exports", target: "./index.js" }]);
    expect(
      declaredEntries({
        path: "package.json",
        directory: "",
        json: { exports: { import: "./i.mjs", types: "./t.d.ts" } },
      }),
    ).toEqual([
      { kind: "exports", source: "package.json#exports.import", target: "./i.mjs" },
      { kind: "exports", source: "package.json#exports.types", target: "./t.d.ts" },
    ]);
  });

  it("reads main, module, types, typings, bin and scripts", () => {
    const manifest = {
      path: "package.json",
      directory: "",
      json: {
        name: "@acme/tool",
        main: "./dist/index.js",
        module: "./dist/index.mjs",
        types: "./dist/index.d.ts",
        typings: "./dist/legacy.d.ts",
        bin: { tool: "./dist/cli.js", other: 3 },
        scripts: {
          start: "node dist/server.js",
          dev: "tsx watch src/server.ts",
          build: "tsc",
          self: "node .",
          x: 1,
        },
      },
    };
    expect(declaredEntries(manifest)).toEqual([
      { kind: "main", source: "package.json#main", target: "./dist/index.js" },
      { kind: "module", source: "package.json#module", target: "./dist/index.mjs" },
      { kind: "types", source: "package.json#types", target: "./dist/index.d.ts" },
      { kind: "types", source: "package.json#typings", target: "./dist/legacy.d.ts" },
      { kind: "bin", source: "package.json#bin.tool", target: "./dist/cli.js" },
      { kind: "script", source: "package.json#scripts.start", target: "dist/server.js" },
      { kind: "script", source: "package.json#scripts.dev", target: "src/server.ts" },
    ]);
    expect(
      declaredEntries({ path: "package.json", directory: "", json: { bin: "./cli.js" } }),
    ).toEqual([{ kind: "bin", source: "package.json#bin", target: "./cli.js" }]);
  });
});

describe("entry points", () => {
  it("maps declared build output to sources and records what it was mapped from", async () => {
    const entryPoints = await entryPointsOf({
      "package.json": json({
        name: "server",
        main: "dist/server.js",
        types: "dist/server.d.ts",
        bin: { server: "./bin/server.js" },
        scripts: {
          start: "node dist/server.js",
          dev: "tsx watch src/server.ts",
          test: "node --test test/*.test.ts",
        },
      }),
      "tsconfig.json": json({ compilerOptions: { rootDir: "src", outDir: "dist" } }),
      "src/server.ts": "",
      "bin/server.js": "",
    });
    expect(entryPoints).toEqual([
      { path: "bin/server.js", kind: "bin", source: "package.json#bin.server", packagePath: "" },
      {
        path: "src/server.ts",
        kind: "main",
        source: "package.json#main",
        packagePath: "",
        mappedFrom: "dist/server.js",
      },
      {
        path: "src/server.ts",
        kind: "script",
        source: "package.json#scripts.dev",
        packagePath: "",
      },
      {
        path: "src/server.ts",
        kind: "script",
        source: "package.json#scripts.start",
        packagePath: "",
        mappedFrom: "dist/server.js",
      },
      {
        path: "src/server.ts",
        kind: "types",
        source: "package.json#types",
        packagePath: "",
        mappedFrom: "dist/server.d.ts",
      },
    ]);
  });

  it("maps exports of nested packages, skips patterns, and drops unmappable targets", async () => {
    const entryPoints = await entryPointsOf({
      "packages/lib/package.json": json({
        name: "lib",
        exports: {
          ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
          "./utils": "./lib/utils.cjs",
          "./features/*": "./dist/features/*.js",
          "./missing": "./dist/missing.js",
          "./remote": "https://cdn.example.com/x.js",
          "./outside": "../../../outside.js",
        },
      }),
      "packages/lib/src/index.ts": "",
      "packages/lib/src/utils.cts": "",
    });
    expect(entryPoints).toEqual([
      {
        path: "packages/lib/src/index.ts",
        kind: "exports",
        source: "package.json#exports[.].import",
        packagePath: "packages/lib",
        mappedFrom: "packages/lib/dist/index.js",
      },
      {
        path: "packages/lib/src/index.ts",
        kind: "exports",
        source: "package.json#exports[.].types",
        packagePath: "packages/lib",
        mappedFrom: "packages/lib/dist/index.d.ts",
      },
      {
        path: "packages/lib/src/utils.cts",
        kind: "exports",
        source: "package.json#exports[./utils]",
        packagePath: "packages/lib",
        mappedFrom: "packages/lib/lib/utils.cjs",
      },
    ]);
  });

  it("resolves extensionless and directory targets and de-duplicates identical entries", async () => {
    const entryPoints = await entryPointsOf({
      "package.json": json({
        name: "app",
        main: "src/server",
        module: "lib",
        scripts: { a: "node src/server.js && node src/server.js", start: "node dist/main" },
      }),
      "src/server.js": "",
      "lib/index.ts": "",
      "src/main.ts": "",
    });
    expect(entryPoints).toEqual([
      {
        path: "lib/index.ts",
        kind: "module",
        source: "package.json#module",
        packagePath: "",
        mappedFrom: "lib",
      },
      {
        path: "src/main.ts",
        kind: "script",
        source: "package.json#scripts.start",
        packagePath: "",
        mappedFrom: "dist/main",
      },
      {
        path: "src/server.js",
        kind: "main",
        source: "package.json#main",
        packagePath: "",
        mappedFrom: "src/server",
      },
      { path: "src/server.js", kind: "script", source: "package.json#scripts.a", packagePath: "" },
    ]);
  });
});
