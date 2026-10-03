import type { EdgeMechanism, ImportKind } from "@katedrala/ir";
import type { AdapterProject, ModuleResolution } from "@katedrala/plugin-api";
import { describe, expect, it } from "vitest";
import { DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS } from "../options.js";
import { createTypeScriptProject } from "./index.js";
import { createMemoryProjectContext } from "./memory-context.js";
import type { MemoryProjectContextOptions } from "./memory-context.js";

const json = (value: unknown): string => JSON.stringify(value, null, 2);

async function projectOf(
  files: Record<string, string>,
  options?: MemoryProjectContextOptions,
): Promise<AdapterProject> {
  const { context } = createMemoryProjectContext(files, options);
  return createTypeScriptProject(context, DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS);
}

function resolveIn(
  project: AdapterProject,
  fromFile: string,
  specifier: string,
  kind: ImportKind = "static",
  mechanism: EdgeMechanism = "import-declaration",
): ModuleResolution {
  return project.resolve({ specifier, fromFile, kind, mechanism });
}

const resolvedTo = (path: string, method = "relative-path"): ModuleResolution => ({
  status: "resolved",
  paths: [path],
  method: method as Extract<ModuleResolution, { status: "resolved" }>["method"],
});

describe("relative specifiers", () => {
  it("probes extensions in order", async () => {
    const project = await projectOf({
      "src/main.ts": "",
      "src/a.ts": "",
      "src/a.js": "",
      "src/b.tsx": "",
      "src/b.js": "",
      "src/c.d.ts": "",
      "src/c.js": "",
      "src/d.js": "",
      "src/d.jsx": "",
      "src/e.mts": "",
      "src/e.cjs": "",
      "src/f.json": "",
    });
    expect(resolveIn(project, "src/main.ts", "./a")).toEqual(resolvedTo("src/a.ts"));
    expect(resolveIn(project, "src/main.ts", "./b")).toEqual(resolvedTo("src/b.tsx"));
    expect(resolveIn(project, "src/main.ts", "./c")).toEqual(resolvedTo("src/c.d.ts"));
    expect(resolveIn(project, "src/main.ts", "./d")).toEqual(resolvedTo("src/d.js"));
    expect(resolveIn(project, "src/main.ts", "./e")).toEqual(resolvedTo("src/e.mts"));
    // A JSON module is named with its extension (TypeScript never appends .json).
    expect(resolveIn(project, "src/main.ts", "./f.json")).toEqual(resolvedTo("src/f.json"));
    expect(resolveIn(project, "src/main.ts", "./f")).toEqual({
      status: "unresolved",
      reason: "no file matches ./f",
    });
  });

  it("prefers a directory's index module over a JSON file of the same name (regression)", async () => {
    const project = await projectOf({
      "src/main.ts": "",
      "src/legacy.js": "",
      "src/config.json": "{}",
      "src/config/index.ts": "",
      "src/data.json": "{}",
      "src/table/index.json": "{}",
    });
    // TypeScript (bundler and node10, even with resolveJsonModule) resolves ./config to the directory.
    expect(resolveIn(project, "src/main.ts", "./config")).toEqual(
      resolvedTo("src/config/index.ts"),
    );
    expect(resolveIn(project, "src/main.ts", "./config", "static", "require-call")).toEqual(
      resolvedTo("src/config/index.ts"),
    );
    // require() in a JavaScript file follows the Node.js CommonJS loader: X.json before X/index.
    const require = (specifier: string): ModuleResolution =>
      resolveIn(project, "src/legacy.js", specifier, "static", "require-call");
    expect(require("./config")).toEqual(resolvedTo("src/config.json"));
    expect(require("./data")).toEqual(resolvedTo("src/data.json"));
    expect(require("./table")).toEqual(resolvedTo("src/table/index.json"));
    expect(resolveIn(project, "src/legacy.js", "./data")).toMatchObject({ status: "unresolved" });
  });

  it("maps .js specifiers to TypeScript sources, preferring an existing file", async () => {
    const project = await projectOf({
      "src/main.ts": "",
      "src/a.ts": "",
      "src/b.ts": "",
      "src/b.js": "",
      "src/c.tsx": "",
      "src/d.mts": "",
      "src/e.cts": "",
      "src/f.d.ts": "",
    });
    expect(resolveIn(project, "src/main.ts", "./a.js")).toEqual(resolvedTo("src/a.ts"));
    expect(resolveIn(project, "src/main.ts", "./b.js")).toEqual(resolvedTo("src/b.js"));
    expect(resolveIn(project, "src/main.ts", "./c.jsx")).toEqual(resolvedTo("src/c.tsx"));
    expect(resolveIn(project, "src/main.ts", "./c.js")).toEqual(resolvedTo("src/c.tsx"));
    expect(resolveIn(project, "src/main.ts", "./d.mjs")).toEqual(resolvedTo("src/d.mts"));
    expect(resolveIn(project, "src/main.ts", "./e.cjs")).toEqual(resolvedTo("src/e.cts"));
    expect(resolveIn(project, "src/main.ts", "./f.js")).toEqual(resolvedTo("src/f.d.ts"));
  });

  it("resolves directories through index files, files first", async () => {
    const project = await projectOf({
      "index.ts": "",
      "src/main.ts": "",
      "src/index.ts": "",
      "src/lib/index.tsx": "",
      "src/utils.ts": "",
      "src/utils/index.ts": "",
      "src/nested/deep/a.ts": "",
    });
    expect(resolveIn(project, "src/nested/deep/a.ts", "../../lib")).toEqual(
      resolvedTo("src/lib/index.tsx"),
    );
    expect(resolveIn(project, "src/main.ts", "./utils")).toEqual(resolvedTo("src/utils.ts"));
    expect(resolveIn(project, "src/main.ts", "./utils/")).toEqual(resolvedTo("src/utils/index.ts"));
    expect(resolveIn(project, "src/main.ts", ".")).toEqual(resolvedTo("src/index.ts"));
    expect(resolveIn(project, "src/main.ts", "./")).toEqual(resolvedTo("src/index.ts"));
    expect(resolveIn(project, "src/main.ts", "..")).toEqual(resolvedTo("index.ts"));
    expect(resolveIn(project, "src/nested/deep/a.ts", "../..")).toEqual(resolvedTo("src/index.ts"));
  });

  it("resolves directories with a package.json through types, main and module, mapped to sources", async () => {
    const project = await projectOf({
      "src/main.ts": "",
      "src/widget/package.json": json({ main: "./dist/widget.js" }),
      "src/widget/src/widget.ts": "",
      "src/typed/package.json": json({ types: "./typed.d.ts", main: "./typed.js" }),
      "src/typed/typed.d.ts": "",
      "src/typed/typed.js": "",
      "src/plain/package.json": json({ name: "plain" }),
      "src/plain/index.js": "",
    });
    expect(resolveIn(project, "src/main.ts", "./widget")).toEqual(
      resolvedTo("src/widget/src/widget.ts"),
    );
    expect(resolveIn(project, "src/main.ts", "./typed")).toEqual(
      resolvedTo("src/typed/typed.d.ts"),
    );
    expect(resolveIn(project, "src/main.ts", "./plain")).toEqual(resolvedTo("src/plain/index.js"));
  });

  it("matches paths exactly and case-sensitively", async () => {
    const project = await projectOf({ "src/main.ts": "", "src/button.tsx": "" });
    expect(resolveIn(project, "src/main.ts", "./Button")).toEqual({
      status: "unresolved",
      reason: "no file matches ./Button",
    });
  });

  it("reports unresolved relative imports with a reason", async () => {
    const project = await projectOf({ "src/main.ts": "", "src/a.ts": "" });
    expect(resolveIn(project, "src/main.ts", "./missing")).toEqual({
      status: "unresolved",
      reason: "no file matches ./missing",
    });
    expect(resolveIn(project, "src/main.ts", "../../outside")).toEqual({
      status: "unresolved",
      reason: "../../outside points outside the analysis root",
    });
    expect(resolveIn(project, "src/main.ts", "./a.ts/")).toMatchObject({ status: "unresolved" });
  });

  it("ignores query and fragment suffixes when the full name does not exist", async () => {
    const project = await projectOf({ "src/main.ts": "", "src/logo.svg": "", "src/worker.ts": "" });
    expect(resolveIn(project, "src/main.ts", "./logo.svg?react")).toEqual(
      resolvedTo("src/logo.svg"),
    );
    expect(resolveIn(project, "src/main.ts", "./worker?worker")).toEqual(
      resolvedTo("src/worker.ts"),
    );
    expect(resolveIn(project, "src/main.ts", "./logo.svg#icon")).toEqual(
      resolvedTo("src/logo.svg"),
    );
  });

  it("never resolves absolute paths or URLs", async () => {
    const project = await projectOf({ "src/main.ts": "", "src/a.ts": "" });
    for (const specifier of [
      "/src/a.ts",
      "file:///src/a.ts",
      "https://esm.sh/react",
      "C:\\src\\a.ts",
    ]) {
      expect(resolveIn(project, "src/main.ts", specifier)).toMatchObject({ status: "unresolved" });
    }
  });

  it("resolves /// <reference path> without ./ relative to the file", async () => {
    const project = await projectOf({ "src/main.ts": "", "src/globals.d.ts": "" });
    expect(
      resolveIn(project, "src/main.ts", "globals.d.ts", "include", "triple-slash-reference"),
    ).toEqual(resolvedTo("src/globals.d.ts"));
    expect(
      resolveIn(project, "src/main.ts", "./globals.d.ts", "include", "triple-slash-reference"),
    ).toEqual(resolvedTo("src/globals.d.ts"));
    expect(
      resolveIn(project, "src/main.ts", "types/missing.d.ts", "include", "triple-slash-reference"),
    ).toEqual({ status: "unresolved", reason: "no file matches types/missing.d.ts" });
    // `/// <reference types="vite/client" />` names a package.
    expect(
      resolveIn(project, "src/main.ts", "vite/client", "include", "triple-slash-reference"),
    ).toEqual({
      status: "external",
      namespace: "npm",
      packageName: "vite",
      method: "external-package",
    });
  });
});

describe("built-ins and external packages", () => {
  it("recognizes Node.js built-ins with and without node: and with subpaths", async () => {
    const project = await projectOf({ "a.ts": "" });
    expect(resolveIn(project, "a.ts", "node:fs")).toEqual({
      status: "builtin",
      namespace: "node",
      moduleName: "fs",
    });
    expect(resolveIn(project, "a.ts", "fs/promises")).toEqual({
      status: "builtin",
      namespace: "node",
      moduleName: "fs",
    });
    expect(resolveIn(project, "a.ts", "node:test")).toEqual({
      status: "builtin",
      namespace: "node",
      moduleName: "test",
    });
    expect(resolveIn(project, "a.ts", "test")).toEqual({
      status: "external",
      namespace: "npm",
      packageName: "test",
      method: "external-package",
    });
    expect(resolveIn(project, "a.ts", "node:")).toMatchObject({ status: "unresolved" });
  });

  it("names external packages by distribution name", async () => {
    const project = await projectOf({ "a.ts": "" });
    const external = (packageName: string): ModuleResolution => ({
      status: "external",
      namespace: "npm",
      packageName,
      method: "external-package",
    });
    expect(resolveIn(project, "a.ts", "react")).toEqual(external("react"));
    expect(resolveIn(project, "a.ts", "react-dom/client")).toEqual(external("react-dom"));
    expect(resolveIn(project, "a.ts", "@scope/pkg")).toEqual(external("@scope/pkg"));
    expect(resolveIn(project, "a.ts", "@scope/pkg/deep/x.js")).toEqual(external("@scope/pkg"));
    expect(resolveIn(project, "a.ts", "node", "include", "triple-slash-reference")).toEqual(
      external("node"),
    );
  });

  it("does not invent packages for alias-like specifiers", async () => {
    const project = await projectOf({ "a.ts": "" });
    expect(resolveIn(project, "a.ts", "@/utils")).toEqual({
      status: "unresolved",
      reason: "@/utils is not a valid package name",
    });
    expect(resolveIn(project, "a.ts", "")).toMatchObject({ status: "unresolved" });
  });

  it("consults paths and baseUrl before treating a bare name as a built-in (regression)", async () => {
    const project = await projectOf({
      "tsconfig.json": json({
        // Substitutions are relative to baseUrl.
        compilerOptions: { baseUrl: "src", paths: { "util/*": ["./util/*"] } },
      }),
      "src/main.ts": "",
      "src/domain/user.ts": "",
      "src/events/bus.ts": "",
      "src/constants/index.ts": "",
      "src/constants/routes.ts": "",
      "src/util/format.ts": "",
    });
    const from = "src/main.ts";
    // TypeScript 6.0 resolves all of these to the project's own files.
    expect(resolveIn(project, from, "domain/user")).toEqual(
      resolvedTo("src/domain/user.ts", "base-url"),
    );
    expect(resolveIn(project, from, "events/bus")).toEqual(
      resolvedTo("src/events/bus.ts", "base-url"),
    );
    expect(resolveIn(project, from, "constants")).toEqual(
      resolvedTo("src/constants/index.ts", "base-url"),
    );
    expect(resolveIn(project, from, "constants/routes")).toEqual(
      resolvedTo("src/constants/routes.ts", "base-url"),
    );
    expect(resolveIn(project, from, "util/format")).toEqual(
      resolvedTo("src/util/format.ts", "tsconfig-paths"),
    );
    // Without a file there, the names are the built-ins.
    const builtin = (moduleName: string): ModuleResolution => ({
      status: "builtin",
      namespace: "node",
      moduleName,
    });
    expect(resolveIn(project, from, "events")).toEqual(builtin("events"));
    expect(resolveIn(project, from, "domain")).toEqual(builtin("domain"));
    expect(resolveIn(project, from, "util/types")).toEqual(builtin("util"));
    expect(resolveIn(project, from, "node:events")).toEqual(builtin("events"));
  });

  it("keeps bare built-in names ahead of manifests with the same name, as Node.js does", async () => {
    const project = await projectOf({
      "src/main.ts": "",
      "test/fixtures/shadow/package.json": json({ name: "path" }),
      "test/fixtures/shadow/index.js": "",
    });
    expect(resolveIn(project, "src/main.ts", "path")).toEqual({
      status: "builtin",
      namespace: "node",
      moduleName: "path",
    });
    // Other subpaths are files of a package named `path`, here the one in the snapshot.
    expect(resolveIn(project, "src/main.ts", "path/index.js")).toEqual(
      resolvedTo("test/fixtures/shadow/index.js", "workspace-package"),
    );
  });

  it("treats subpaths that Node.js does not expose as npm package files (regression)", async () => {
    const project = await projectOf({ "a.ts": "" });
    const external = (packageName: string): ModuleResolution => ({
      status: "external",
      namespace: "npm",
      packageName,
      method: "external-package",
    });
    expect(resolveIn(project, "a.ts", "process/browser")).toEqual(external("process"));
    expect(resolveIn(project, "a.ts", "util/util.js")).toEqual(external("util"));
    expect(resolveIn(project, "a.ts", "punycode/")).toEqual(external("punycode"));
    expect(resolveIn(project, "a.ts", "stream/web")).toEqual({
      status: "builtin",
      namespace: "node",
      moduleName: "stream",
    });
  });
});

describe("tsconfig paths and baseUrl", () => {
  it("resolves exact keys and wildcard patterns", async () => {
    const project = await projectOf({
      "tsconfig.json": json({
        compilerOptions: { paths: { config: ["./src/config/index.ts"], "@/*": ["./src/*"] } },
      }),
      "src/main.ts": "",
      "src/config/index.ts": "",
      "src/utils/x.ts": "",
      "src/customers/index.ts": "",
    });
    expect(resolveIn(project, "src/main.ts", "config")).toEqual(
      resolvedTo("src/config/index.ts", "tsconfig-paths"),
    );
    expect(resolveIn(project, "src/main.ts", "@/utils/x")).toEqual(
      resolvedTo("src/utils/x.ts", "tsconfig-paths"),
    );
    expect(resolveIn(project, "src/main.ts", "@/utils/x.js")).toEqual(
      resolvedTo("src/utils/x.ts", "tsconfig-paths"),
    );
    expect(resolveIn(project, "src/main.ts", "@/customers")).toEqual(
      resolvedTo("src/customers/index.ts", "tsconfig-paths"),
    );
  });

  it("tries substitutions in order and prefers the longest prefix", async () => {
    const project = await projectOf({
      "tsconfig.json": json({
        compilerOptions: {
          paths: {
            "@app/*": ["./src/*", "./generated/*"],
            "@app/components/*": ["./ui/*"],
          },
        },
      }),
      "src/main.ts": "",
      "generated/api.ts": "",
      "ui/Button.tsx": "",
      "src/components/Button.tsx": "",
    });
    expect(resolveIn(project, "src/main.ts", "@app/api")).toEqual(
      resolvedTo("generated/api.ts", "tsconfig-paths"),
    );
    expect(resolveIn(project, "src/main.ts", "@app/components/Button")).toEqual(
      resolvedTo("ui/Button.tsx", "tsconfig-paths"),
    );
  });

  it("prefers an exact key over a matching pattern regardless of order", async () => {
    const project = await projectOf({
      "tsconfig.json": json({
        compilerOptions: { paths: { "lib/*": ["./a/*"], "lib/x": ["./b/x.ts"] } },
      }),
      "main.ts": "",
      "a/x.ts": "",
      "b/x.ts": "",
    });
    expect(resolveIn(project, "main.ts", "lib/x")).toEqual(resolvedTo("b/x.ts", "tsconfig-paths"));
  });

  it("reports a matched pattern without a file, unless another rule resolves the specifier", async () => {
    const project = await projectOf({
      "tsconfig.json": json({
        compilerOptions: { paths: { "@/*": ["./src/*"], "*": ["./types/*"] } },
      }),
      "src/main.ts": "",
      "types/custom.d.ts": "",
    });
    expect(resolveIn(project, "src/main.ts", "@/missing")).toEqual({
      status: "unresolved",
      reason: '@/missing matches "@/*" in the "paths" of tsconfig.json, but no file exists there',
    });
    // A catch-all pattern does not make every package unresolved.
    expect(resolveIn(project, "src/main.ts", "react")).toMatchObject({
      status: "external",
      packageName: "react",
    });
    expect(resolveIn(project, "src/main.ts", "custom")).toEqual(
      resolvedTo("types/custom.d.ts", "tsconfig-paths"),
    );
  });

  it("resolves substitutions against baseUrl when set, else against the declaring configuration", async () => {
    const project = await projectOf({
      "configs/base.json": json({ compilerOptions: { paths: { "@shared/*": ["../shared/*"] } } }),
      "app/tsconfig.json": json({ extends: "../configs/base.json" }),
      "app/main.ts": "",
      "shared/money.ts": "",
      "web/tsconfig.json": json({
        compilerOptions: { baseUrl: "..", paths: { "@shared/*": ["shared/*"] } },
      }),
      "web/main.ts": "",
    });
    expect(resolveIn(project, "app/main.ts", "@shared/money")).toEqual(
      resolvedTo("shared/money.ts", "tsconfig-paths"),
    );
    expect(resolveIn(project, "web/main.ts", "@shared/money")).toEqual(
      resolvedTo("shared/money.ts", "tsconfig-paths"),
    );
  });

  it("resolves through baseUrl when a file exists there, and falls back otherwise", async () => {
    const project = await projectOf({
      "tsconfig.json": json({ compilerOptions: { baseUrl: "." } }),
      "src/main.ts": "",
      "src/utils/collections.ts": "",
    });
    expect(resolveIn(project, "src/main.ts", "src/utils/collections")).toEqual(
      resolvedTo("src/utils/collections.ts", "base-url"),
    );
    expect(resolveIn(project, "src/main.ts", "lodash")).toMatchObject({
      status: "external",
      packageName: "lodash",
    });
  });

  it("treats paths into node_modules as the installed packages (regression)", async () => {
    const external = (packageName: string): ModuleResolution => ({
      status: "external",
      namespace: "npm",
      packageName,
      method: "external-package",
    });
    const project = await projectOf({
      "tsconfig.json": json({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            react: ["./node_modules/@types/react"],
            "@angular/*": ["./node_modules/@angular/*"],
            lodash: ["node_modules/lodash-es"],
            "@babel/core": ["node_modules/@types/babel__core"],
            "~ui/*": ["node_modules/@acme/ui/src/*"],
          },
        },
      }),
      "src/main.ts": "",
      "packages/ui/package.json": json({ name: "@acme/ui", exports: { ".": "./dist/index.js" } }),
      "packages/ui/src/button.tsx": "",
    });
    const from = "src/main.ts";
    // TypeScript resolves these with isExternalLibraryImport; nothing is reported as unresolved.
    expect(resolveIn(project, from, "react")).toEqual(external("react"));
    expect(resolveIn(project, from, "@angular/core")).toEqual(external("@angular/core"));
    expect(resolveIn(project, from, "@angular/common/http")).toEqual(external("@angular/common"));
    expect(resolveIn(project, from, "lodash")).toEqual(external("lodash-es"));
    expect(resolveIn(project, from, "@babel/core")).toEqual(external("@babel/core"));
    // node_modules/<name> of a workspace package is the package's directory.
    expect(resolveIn(project, from, "~ui/button")).toEqual(
      resolvedTo("packages/ui/src/button.tsx", "tsconfig-paths"),
    );
    expect(resolveIn(project, from, "~ui/missing")).toEqual({
      status: "unresolved",
      reason:
        '~ui/missing matches "~ui/*" in the "paths" of tsconfig.json, but no file exists there',
    });
  });

  it("tries the snapshot before node_modules for a catch-all pattern", async () => {
    const project = await projectOf({
      "tsconfig.json": json({
        compilerOptions: { baseUrl: ".", paths: { "*": ["node_modules/*", "types/*"] } },
      }),
      "src/main.ts": "",
      "types/custom.d.ts": "",
      "events/bus.ts": "",
    });
    const from = "src/main.ts";
    expect(resolveIn(project, from, "custom")).toEqual(
      resolvedTo("types/custom.d.ts", "tsconfig-paths"),
    );
    expect(resolveIn(project, from, "events/bus")).toEqual(resolvedTo("events/bus.ts", "base-url"));
    expect(resolveIn(project, from, "fs")).toEqual({
      status: "builtin",
      namespace: "node",
      moduleName: "fs",
    });
    expect(resolveIn(project, from, "react-dom/client")).toEqual({
      status: "external",
      namespace: "npm",
      packageName: "react-dom",
      method: "external-package",
    });
  });

  it("uses the configuration that governs the importing file", async () => {
    const project = await projectOf({
      "packages/a/tsconfig.json": json({ compilerOptions: { paths: { "~/*": ["./src/*"] } } }),
      "packages/a/src/main.ts": "",
      "packages/a/src/x.ts": "",
      "packages/b/tsconfig.json": json({ compilerOptions: { paths: { "~/*": ["./lib/*"] } } }),
      "packages/b/src/main.ts": "",
      "packages/b/lib/x.ts": "",
    });
    expect(resolveIn(project, "packages/a/src/main.ts", "~/x")).toEqual(
      resolvedTo("packages/a/src/x.ts", "tsconfig-paths"),
    );
    expect(resolveIn(project, "packages/b/src/main.ts", "~/x")).toEqual(
      resolvedTo("packages/b/lib/x.ts", "tsconfig-paths"),
    );
  });
});

describe("workspace packages", () => {
  const workspace = {
    "package.json": json({ name: "root", private: true, workspaces: ["packages/*"] }),
    "packages/shared/package.json": json({
      name: "@acme/shared",
      exports: {
        ".": { types: "./dist/index.d.ts", import: "./dist/index.js", require: "./dist/index.cjs" },
        "./utils": { types: "./dist/utils.d.ts", default: "./dist/utils.js" },
        "./features/*": "./dist/features/*.js",
        "./package.json": "./package.json",
      },
    }),
    "packages/shared/tsconfig.json": json({ compilerOptions: { outDir: "dist", rootDir: "src" } }),
    "packages/shared/src/index.ts": "",
    "packages/shared/src/utils.ts": "",
    "packages/shared/src/features/cart.ts": "",
    "packages/shared/src/internal.ts": "",
    "packages/legacy/package.json": json({ name: "legacy", main: "lib/index.js" }),
    "packages/legacy/src/index.ts": "",
    "packages/legacy/src/strings.ts": "",
    "packages/plain/package.json": json({ name: "plain" }),
    "packages/plain/index.js": "",
    "packages/srcpkg/package.json": json({ name: "srcpkg" }),
    "packages/srcpkg/src/index.tsx": "",
    "packages/sourced/package.json": json({
      name: "sourced",
      exports: { ".": { source: "./src/main.ts", default: "./dist/other.js" } },
    }),
    "packages/sourced/src/main.ts": "",
    "packages/sourced/src/other.ts": "",
    "packages/app/package.json": json({ name: "app" }),
    "packages/app/src/main.ts": "",
  };

  it("resolves exports with conditions by preference, mapped from dist to src", async () => {
    const project = await projectOf(workspace);
    const from = "packages/app/src/main.ts";
    expect(resolveIn(project, from, "@acme/shared")).toEqual(
      resolvedTo("packages/shared/src/index.ts", "workspace-package"),
    );
    expect(resolveIn(project, from, "@acme/shared/utils")).toEqual(
      resolvedTo("packages/shared/src/utils.ts", "workspace-package"),
    );
    expect(resolveIn(project, from, "@acme/shared/features/cart")).toEqual(
      resolvedTo("packages/shared/src/features/cart.ts", "workspace-package"),
    );
    expect(resolveIn(project, from, "@acme/shared/package.json")).toEqual(
      resolvedTo("packages/shared/package.json", "workspace-package"),
    );
    expect(resolveIn(project, from, "sourced")).toEqual(
      resolvedTo("packages/sourced/src/main.ts", "workspace-package"),
    );
  });

  it("does not resolve subpaths that exports does not export", async () => {
    const project = await projectOf(workspace);
    expect(resolveIn(project, "packages/app/src/main.ts", "@acme/shared/internal")).toEqual({
      status: "unresolved",
      reason:
        "./internal is not exported by workspace package @acme/shared (packages/shared/package.json)",
    });
  });

  it("resolves packages without exports through main, then src/index and index", async () => {
    const project = await projectOf(workspace);
    const from = "packages/app/src/main.ts";
    expect(resolveIn(project, from, "legacy")).toEqual(
      resolvedTo("packages/legacy/src/index.ts", "workspace-package"),
    );
    expect(resolveIn(project, from, "legacy/lib/strings")).toEqual(
      resolvedTo("packages/legacy/src/strings.ts", "workspace-package"),
    );
    expect(resolveIn(project, from, "legacy/src/strings")).toEqual(
      resolvedTo("packages/legacy/src/strings.ts", "workspace-package"),
    );
    expect(resolveIn(project, from, "plain")).toEqual(
      resolvedTo("packages/plain/index.js", "workspace-package"),
    );
    expect(resolveIn(project, from, "srcpkg")).toEqual(
      resolvedTo("packages/srcpkg/src/index.tsx", "workspace-package"),
    );
    expect(resolveIn(project, from, "legacy/missing")).toEqual({
      status: "unresolved",
      reason:
        "no file matches ./missing in workspace package legacy (packages/legacy/package.json)",
    });
  });

  it("maps bundler outputs of exports (.mjs, .cjs, .d.mts, .d.cts) to sources (regression)", async () => {
    // unbuild's documented layout; tsup, tsdown and pkgroll emit the same files.
    const project = await projectOf({
      "packages/utils/package.json": json({
        name: "@acme/utils",
        exports: {
          ".": {
            import: { types: "./dist/index.d.mts", default: "./dist/index.mjs" },
            require: { types: "./dist/index.d.cts", default: "./dist/index.cjs" },
          },
          "./format": {
            require: { types: "./dist/format.d.cts", default: "./dist/format.cjs" },
          },
        },
        main: "./dist/index.cjs",
        module: "./dist/index.mjs",
      }),
      "packages/utils/src/index.ts": "",
      "packages/utils/src/format.ts": "",
      "packages/app/src/main.ts": "",
    });
    const from = "packages/app/src/main.ts";
    expect(resolveIn(project, from, "@acme/utils")).toEqual(
      resolvedTo("packages/utils/src/index.ts", "workspace-package"),
    );
    expect(resolveIn(project, from, "@acme/utils/format")).toEqual(
      resolvedTo("packages/utils/src/format.ts", "workspace-package"),
    );
    expect(
      project.entryPoints.map((entry) => [entry.kind, entry.source, entry.path, entry.mappedFrom]),
    ).toEqual([
      [
        "exports",
        "package.json#exports[./format].require.default",
        "packages/utils/src/format.ts",
        "packages/utils/dist/format.cjs",
      ],
      [
        "exports",
        "package.json#exports[./format].require.types",
        "packages/utils/src/format.ts",
        "packages/utils/dist/format.d.cts",
      ],
      [
        "exports",
        "package.json#exports[.].import.default",
        "packages/utils/src/index.ts",
        "packages/utils/dist/index.mjs",
      ],
      [
        "exports",
        "package.json#exports[.].import.types",
        "packages/utils/src/index.ts",
        "packages/utils/dist/index.d.mts",
      ],
      [
        "exports",
        "package.json#exports[.].require.default",
        "packages/utils/src/index.ts",
        "packages/utils/dist/index.cjs",
      ],
      [
        "exports",
        "package.json#exports[.].require.types",
        "packages/utils/src/index.ts",
        "packages/utils/dist/index.d.cts",
      ],
      ["main", "package.json#main", "packages/utils/src/index.ts", "packages/utils/dist/index.cjs"],
      [
        "module",
        "package.json#module",
        "packages/utils/src/index.ts",
        "packages/utils/dist/index.mjs",
      ],
    ]);
  });

  it("reports self references", async () => {
    const project = await projectOf(workspace);
    expect(resolveIn(project, "packages/shared/src/utils.ts", "@acme/shared")).toEqual(
      resolvedTo("packages/shared/src/index.ts", "package-self-reference"),
    );
  });

  it("prefers tsconfig paths over workspace packages", async () => {
    const project = await projectOf({
      ...workspace,
      "tsconfig.json": json({
        compilerOptions: { paths: { "@acme/shared/*": ["./packages/shared/src/*"] } },
      }),
    });
    expect(resolveIn(project, "packages/app/src/main.ts", "@acme/shared/internal")).toEqual(
      resolvedTo("packages/shared/src/internal.ts", "tsconfig-paths"),
    );
  });

  it("chooses among packages with the same name by ownership, workspace and proximity", async () => {
    const project = await projectOf({
      "package.json": json({ name: "root", workspaces: ["packages/*"] }),
      "packages/ui/package.json": json({ name: "ui" }),
      "packages/ui/index.ts": "",
      "packages/app/package.json": json({ name: "app" }),
      "packages/app/main.ts": "",
      "examples/demo/package.json": json({ name: "ui" }),
      "examples/demo/index.ts": "",
      "examples/demo/nested/main.ts": "",
      "fixtures/x/ui/package.json": json({ name: "ui" }),
      "fixtures/x/ui/index.ts": "",
      "fixtures/x/main.ts": "",
    });
    expect(resolveIn(project, "packages/app/main.ts", "ui")).toEqual(
      resolvedTo("packages/ui/index.ts", "workspace-package"),
    );
    expect(resolveIn(project, "examples/demo/nested/main.ts", "ui")).toEqual(
      resolvedTo("examples/demo/index.ts", "package-self-reference"),
    );
    // Not a workspace member anywhere near: the workspace member of the root still wins over proximity.
    expect(resolveIn(project, "fixtures/x/main.ts", "ui")).toEqual(
      resolvedTo("packages/ui/index.ts", "workspace-package"),
    );
  });

  it("uses the longest package name and treats the rest as a subpath", async () => {
    const project = await projectOf({
      "lodash/package.json": json({ name: "lodash" }),
      "lodash/index.js": "",
      "lodash/fp.js": "",
      "main.ts": "",
    });
    expect(resolveIn(project, "main.ts", "lodash/fp")).toEqual(
      resolvedTo("lodash/fp.js", "workspace-package"),
    );
  });
});

describe("package imports (#)", () => {
  const files = {
    "package.json": json({
      name: "app",
      imports: {
        "#internal/*": "./src/internal/*.js",
        "#config": { node: "./src/config.node.ts", default: "./src/config.ts" },
        "#dep": "lodash",
        "#fs": "node:fs",
        "#ui": "ui",
        "#missing": "./src/missing.js",
      },
    }),
    "src/main.ts": "",
    "src/internal/a.ts": "",
    "src/config.ts": "",
    "packages/ui/package.json": json({ name: "ui", imports: { "#own": "./own.ts" } }),
    "packages/ui/index.ts": "",
    "packages/ui/own.ts": "",
    "broken/package.json": "{",
    "broken/a.ts": "",
    "standalone/a.ts": "",
  };

  it("resolves relative targets with patterns and conditions", async () => {
    const project = await projectOf(files);
    expect(resolveIn(project, "src/main.ts", "#internal/a")).toEqual(
      resolvedTo("src/internal/a.ts", "package-imports"),
    );
    expect(resolveIn(project, "src/main.ts", "#config")).toEqual(
      resolvedTo("src/config.ts", "package-imports"),
    );
    expect(resolveIn(project, "packages/ui/index.ts", "#own")).toEqual(
      resolvedTo("packages/ui/own.ts", "package-imports"),
    );
  });

  it("resolves bare targets as packages and built-ins", async () => {
    const project = await projectOf(files);
    expect(resolveIn(project, "src/main.ts", "#dep")).toEqual({
      status: "external",
      namespace: "npm",
      packageName: "lodash",
      method: "external-package",
    });
    expect(resolveIn(project, "src/main.ts", "#fs")).toEqual({
      status: "builtin",
      namespace: "node",
      moduleName: "fs",
    });
    expect(resolveIn(project, "src/main.ts", "#ui")).toEqual(
      resolvedTo("packages/ui/index.ts", "workspace-package"),
    );
  });

  it("falls back to tsconfig paths for # specifiers that imports does not define", async () => {
    const project = await projectOf({
      "package.json": json({ name: "app", imports: { "#config": "./src/config.ts" } }),
      "tsconfig.json": json({ compilerOptions: { paths: { "#/*": ["./src/*"] } } }),
      "src/main.ts": "",
      "src/config.ts": "",
      "src/components/button.ts": "",
    });
    expect(resolveIn(project, "src/main.ts", "#config")).toEqual(
      resolvedTo("src/config.ts", "package-imports"),
    );
    expect(resolveIn(project, "src/main.ts", "#/components/button")).toEqual(
      resolvedTo("src/components/button.ts", "tsconfig-paths"),
    );
    expect(resolveIn(project, "src/main.ts", "#/missing")).toEqual({
      status: "unresolved",
      reason: '#/missing matches "#/*" in the "paths" of tsconfig.json, but no file exists there',
    });
  });

  it("explains unresolved package imports", async () => {
    const project = await projectOf(files);
    expect(resolveIn(project, "src/main.ts", "#nope")).toEqual({
      status: "unresolved",
      reason: '#nope is not defined in the "imports" of package.json',
    });
    expect(resolveIn(project, "src/main.ts", "#missing")).toMatchObject({ status: "unresolved" });
    expect(resolveIn(project, "packages/ui/index.ts", "#internal/a")).toMatchObject({
      status: "unresolved",
    });
    expect(resolveIn(project, "broken/a.ts", "#x")).toEqual({
      status: "unresolved",
      reason: "the package.json governing #x (broken/package.json) is not valid",
    });
    const unscoped = await projectOf({ "a.ts": "" });
    expect(resolveIn(unscoped, "a.ts", "#x")).toEqual({
      status: "unresolved",
      reason: "no package.json declares imports for #x",
    });
  });
});

describe("governing configuration", () => {
  it("selects configurations by include and exclude, nearest first", async () => {
    const project = await projectOf({
      "tsconfig.json": json({
        compilerOptions: { paths: { "@x": ["./src/x.ts"] } },
        include: ["src"],
      }),
      "tsconfig.test.json": json({
        compilerOptions: { paths: { "@x": ["./test/x-mock.ts"] } },
        include: ["test"],
      }),
      "src/main.ts": "",
      "src/x.ts": "",
      "test/a.test.ts": "",
      "test/x-mock.ts": "",
    });
    expect(resolveIn(project, "src/main.ts", "@x")).toEqual(
      resolvedTo("src/x.ts", "tsconfig-paths"),
    );
    expect(resolveIn(project, "test/a.test.ts", "@x")).toEqual(
      resolvedTo("test/x-mock.ts", "tsconfig-paths"),
    );
  });

  it("delegates solution-style configurations to the referenced configuration that includes the file", async () => {
    const project = await projectOf({
      "tsconfig.json": json({
        files: [],
        references: [{ path: "./tsconfig.app.json" }, { path: "./tsconfig.node.json" }],
      }),
      "tsconfig.app.json": json({
        compilerOptions: { paths: { "@/*": ["./src/*"] } },
        include: ["src"],
      }),
      "tsconfig.node.json": json({
        compilerOptions: { paths: { "@/*": ["./build/*"] } },
        include: ["vite.config.ts"],
      }),
      "src/main.ts": "",
      "src/a.ts": "",
      "build/a.ts": "",
      "vite.config.ts": "",
    });
    expect(resolveIn(project, "src/main.ts", "@/a")).toEqual(
      resolvedTo("src/a.ts", "tsconfig-paths"),
    );
    expect(resolveIn(project, "vite.config.ts", "@/a")).toEqual(
      resolvedTo("build/a.ts", "tsconfig-paths"),
    );
  });

  it("falls back to the nearest configuration when none selects the file", async () => {
    const project = await projectOf({
      "tsconfig.json": json({
        compilerOptions: { paths: { "@/*": ["./src/*"] } },
        include: ["src"],
      }),
      "scripts/build.ts": "",
      "src/a.ts": "",
    });
    expect(resolveIn(project, "scripts/build.ts", "@/a")).toEqual(
      resolvedTo("src/a.ts", "tsconfig-paths"),
    );
  });

  it("excludes the output directory by default", async () => {
    const project = await projectOf({
      "tsconfig.json": json({ compilerOptions: { outDir: "dist", paths: { "@/*": ["./src/*"] } } }),
      "tsconfig.scripts.json": json({ compilerOptions: { paths: { "@/*": ["./other/*"] } } }),
      "dist/main.ts": "",
      "src/main.ts": "",
      "src/a.ts": "",
      "other/a.ts": "",
    });
    expect(resolveIn(project, "src/main.ts", "@/a")).toEqual(
      resolvedTo("src/a.ts", "tsconfig-paths"),
    );
    // tsconfig.json excludes its outDir, so the next configuration of the directory governs dist/main.ts.
    expect(resolveIn(project, "dist/main.ts", "@/a")).toEqual(
      resolvedTo("other/a.ts", "tsconfig-paths"),
    );
  });

  it("prefers tsconfig.json, then jsconfig.json, then other configurations of a directory", async () => {
    const project = await projectOf({
      "jsconfig.json": json({ compilerOptions: { paths: { "@/*": ["./js/*"] } } }),
      "tsconfig.build.json": json({ compilerOptions: { paths: { "@/*": ["./build/*"] } } }),
      "main.js": "",
      "js/a.js": "",
      "build/a.ts": "",
    });
    expect(resolveIn(project, "main.js", "@/a")).toEqual(resolvedTo("js/a.js", "tsconfig-paths"));
  });
});
