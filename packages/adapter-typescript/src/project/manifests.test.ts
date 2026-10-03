import type { Diagnostic } from "@katedrala/ir";
import type { AdapterProject } from "@katedrala/plugin-api";
import { describe, expect, it } from "vitest";
import { DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS } from "../options.js";
import { createTypeScriptProject } from "./index.js";
import { declaredDependencies, isManifestPath } from "./manifests.js";
import { createMemoryProjectContext } from "./memory-context.js";
import type { MemoryProjectContextOptions } from "./memory-context.js";

const json = (value: unknown): string => JSON.stringify(value, null, 2);

async function setup(
  files: Record<string, string>,
  options?: MemoryProjectContextOptions,
): Promise<{ project: AdapterProject; diagnostics: Diagnostic[] }> {
  const memory = createMemoryProjectContext(files, options);
  const project = await createTypeScriptProject(memory.context, DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS);
  return { project, diagnostics: memory.diagnostics };
}

describe("package descriptors", () => {
  it("describes every manifest outside node_modules", async () => {
    const { project, diagnostics } = await setup({
      "package.json": json({
        name: "shop",
        version: "1.2.3",
        private: true,
        dependencies: { zod: "^4.0.0", express: "^5.0.0" },
        devDependencies: { typescript: "6.0.3", zod: "^4.1.0" },
        peerDependencies: { react: ">=18" },
        optionalDependencies: { fsevents: "^2", broken: 3 },
      }),
      "packages/ui/package.json": json({ name: "@shop/ui", private: false }),
      "examples/package.json": json({ description: "unnamed" }),
      "node_modules/zod/package.json": json({ name: "zod" }),
      "packages/ui/node_modules/x/package.json": json({ name: "x" }),
    });
    expect(diagnostics).toEqual([]);
    expect(project.packages).toEqual([
      {
        ecosystem: "npm",
        path: "examples",
        manifest: "examples/package.json",
        dependencies: [],
      },
      {
        name: "shop",
        ecosystem: "npm",
        path: "",
        manifest: "package.json",
        version: "1.2.3",
        private: true,
        dependencies: [
          { name: "express", versionRange: "^5.0.0", scope: "production" },
          { name: "fsevents", versionRange: "^2", scope: "optional" },
          { name: "react", versionRange: ">=18", scope: "peer" },
          { name: "typescript", versionRange: "6.0.3", scope: "development" },
          { name: "zod", versionRange: "^4.0.0", scope: "production" },
          { name: "zod", versionRange: "^4.1.0", scope: "development" },
        ],
      },
      {
        name: "@shop/ui",
        ecosystem: "npm",
        path: "packages/ui",
        manifest: "packages/ui/package.json",
        private: false,
        dependencies: [],
      },
    ]);
  });

  it("sorts declared dependencies by name, then the IR's scope order", () => {
    expect(
      declaredDependencies({
        devDependencies: { a: "1" },
        optionalDependencies: { a: "2" },
        peerDependencies: { a: "3" },
        dependencies: { a: "4", b: "5" },
      }).map((dependency) => `${dependency.name}:${dependency.scope}`),
    ).toEqual(["a:production", "a:peer", "a:optional", "a:development", "b:production"]);
    expect(declaredDependencies({ dependencies: ["x"] })).toEqual([]);
  });

  it("recognizes manifest paths", () => {
    expect(isManifestPath("package.json")).toBe(true);
    expect(isManifestPath("a/b/package.json")).toBe(true);
    expect(isManifestPath("node_modules/a/package.json")).toBe(false);
    expect(isManifestPath("a/package.json.bak")).toBe(false);
    expect(isManifestPath("a/my-package.json")).toBe(false);
  });
});

describe("workspace roots", () => {
  it("detects workspaces in package.json, pnpm-workspace.yaml and lerna.json", async () => {
    const { project } = await setup({
      "npm/package.json": json({ name: "npm-root", workspaces: ["packages/*"] }),
      "yarn/package.json": json({ name: "yarn-root", workspaces: { packages: ["packages/*"] } }),
      "pnpm/package.json": json({ name: "pnpm-root" }),
      "pnpm/pnpm-workspace.yaml": "packages:\n  - 'packages/*'\n",
      "lerna/package.json": json({ name: "lerna-root" }),
      "lerna/lerna.json": json({ version: "independent" }),
      "plain/package.json": json({ name: "plain" }),
      "invalid-workspaces/package.json": json({ name: "invalid", workspaces: "packages/*" }),
    });
    const roots = Object.fromEntries(
      project.packages.map((pkg): [string, boolean] => [
        pkg.name ?? "",
        pkg.workspaceRoot === true,
      ]),
    );
    expect(roots).toEqual({
      "npm-root": true,
      "yarn-root": true,
      "pnpm-root": true,
      "lerna-root": true,
      plain: false,
      invalid: false,
    });
  });

  it("reports invalid lerna.json files", async () => {
    const { project, diagnostics } = await setup({
      "package.json": json({ name: "root" }),
      "lerna.json": "{ nope",
    });
    expect(project.packages[0]?.workspaceRoot).toBe(true);
    expect(diagnostics).toEqual([
      {
        code: "invalid-project-configuration",
        severity: "warning",
        message: "Invalid lerna.json: '}' expected.",
        file: "file:lerna.json",
        line: 1,
        column: 7,
      },
    ]);
  });
});

describe("invalid manifests", () => {
  it("reports malformed manifests with a location and leaves them out", async () => {
    const { project, diagnostics } = await setup(
      {
        "package.json": json({ name: "root" }),
        "a/package.json": '{\n  "name": "a",\n  "version":\n}\n',
        "b/package.json": "[1, 2]",
        "c/package.json": "",
        "d/package.json": '{\n  // comment\n  "name": "d"\n}',
        "e/package.json": json({ name: "e" }),
      },
      { unreadable: ["e/package.json"] },
    );
    expect(project.packages.map((pkg) => pkg.manifest)).toEqual(["package.json"]);
    expect(diagnostics).toEqual([
      {
        code: "invalid-manifest",
        severity: "warning",
        message: "Invalid package.json: Expression expected.",
        file: "file:a/package.json",
        line: 4,
        column: 1,
      },
      {
        code: "invalid-manifest",
        severity: "warning",
        message: "Invalid package.json: the root value must be a JSON object",
        file: "file:b/package.json",
      },
      {
        code: "invalid-manifest",
        severity: "warning",
        message: "Invalid package.json: the file is empty",
        file: "file:c/package.json",
      },
      {
        code: "invalid-manifest",
        severity: "warning",
        message:
          "Invalid package.json: the file is not strict JSON (comments or trailing commas are not allowed)",
        file: "file:d/package.json",
      },
      {
        code: "invalid-manifest",
        severity: "warning",
        message: "package.json could not be read",
        file: "file:e/package.json",
      },
    ]);
  });
});

describe("duplicate package names", () => {
  it("keeps every package and reports each duplicated name once", async () => {
    const { project, diagnostics } = await setup({
      "fixtures/b/package.json": json({ name: "demo" }),
      "fixtures/a/package.json": json({ name: "demo" }),
      "examples/package.json": json({ name: "demo" }),
      "x/package.json": json({ name: "other" }),
      "y/package.json": json({ name: "other" }),
      "z/package.json": json({ name: "unique" }),
      "u1/package.json": json({}),
      "u2/package.json": json({}),
    });
    expect(project.packages).toHaveLength(8);
    expect(diagnostics).toEqual([
      {
        code: "duplicate-package-name",
        severity: "info",
        message:
          'Package name "demo" is declared by 3 manifests: examples/package.json, fixtures/a/package.json, fixtures/b/package.json',
        file: "file:examples/package.json",
      },
      {
        code: "duplicate-package-name",
        severity: "info",
        message: 'Package name "other" is declared by 2 manifests: x/package.json, y/package.json',
        file: "file:x/package.json",
      },
    ]);
  });
});
