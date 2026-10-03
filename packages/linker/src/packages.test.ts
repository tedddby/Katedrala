import { describe, expect, it } from "vitest";
import type { EntryPointDescriptor, PackageDescriptor } from "@katedrala/plugin-api";
import {
  ADAPTER,
  extraction,
  fact,
  fakeProject,
  fid,
  file,
  findEdge,
  imp,
  run,
  sid,
  sym,
} from "./test-support.js";

function npm(
  path: string,
  name: string | undefined,
  dependencies: PackageDescriptor["dependencies"] = [],
  extra: Partial<PackageDescriptor> = {},
): PackageDescriptor {
  return {
    ...(name === undefined ? {} : { name }),
    ecosystem: "npm",
    path,
    manifest: path === "" ? "package.json" : `${path}/package.json`,
    dependencies,
    ...extra,
  };
}

const prod = (name: string, versionRange = "^1.0.0") =>
  ({ name, versionRange, scope: "production" }) as const;
const dev = (name: string, versionRange = "^1.0.0") =>
  ({ name, versionRange, scope: "development" }) as const;

describe("package entities", () => {
  it("maps descriptors to packages with sorted declared dependencies", async () => {
    const result = await run(
      [
        file("package.json"),
        file("packages/api/package.json"),
        file("packages/core/package.json"),
        file("tools/package.json"),
      ],
      {
        project: {
          packages: [
            npm("", "acme", [dev("typescript")], { private: true, workspaceRoot: true }),
            npm("packages/api", "@acme/api", [prod("zod"), prod("@acme/core", "workspace:*")], {
              version: "1.2.3",
            }),
            npm("packages/core", "@acme/core"),
            npm("tools", undefined, [prod("chalk"), dev("chalk", "^5")]),
            npm("missing", "ghost"),
          ],
        },
      },
    );
    expect(result.packages).toEqual([
      {
        id: "pkg:npm:",
        name: "acme",
        ecosystem: "npm",
        path: "",
        manifest: "file:package.json",
        private: true,
        workspaceRoot: true,
        declaredDependencies: [
          {
            name: "typescript",
            versionRange: "^1.0.0",
            scope: "development",
            target: "ext:npm:typescript",
          },
        ],
        dependencies: [],
        dependents: [],
      },
      {
        id: "pkg:npm:packages/api",
        name: "@acme/api",
        ecosystem: "npm",
        path: "packages/api",
        manifest: "file:packages/api/package.json",
        version: "1.2.3",
        declaredDependencies: [
          {
            name: "@acme/core",
            versionRange: "workspace:*",
            scope: "production",
            target: "pkg:npm:packages/core",
          },
          { name: "zod", versionRange: "^1.0.0", scope: "production", target: "ext:npm:zod" },
        ],
        dependencies: [],
        dependents: [],
      },
      {
        id: "pkg:npm:packages/core",
        name: "@acme/core",
        ecosystem: "npm",
        path: "packages/core",
        manifest: "file:packages/core/package.json",
        declaredDependencies: [],
        dependencies: [],
        dependents: [],
      },
      {
        id: "pkg:npm:tools",
        name: "tools",
        ecosystem: "npm",
        path: "tools",
        manifest: "file:tools/package.json",
        declaredDependencies: [
          { name: "chalk", versionRange: "^1.0.0", scope: "production", target: "ext:npm:chalk" },
          { name: "chalk", versionRange: "^5", scope: "development", target: "ext:npm:chalk" },
        ],
        dependencies: [],
        dependents: [],
      },
    ]);
    expect(result.externals).toEqual([
      { id: "ext:npm:chalk", kind: "package", namespace: "npm", name: "chalk" },
      { id: "ext:npm:typescript", kind: "package", namespace: "npm", name: "typescript" },
      { id: "ext:npm:zod", kind: "package", namespace: "npm", name: "zod" },
    ]);
    expect(result.stats.packages).toBe(4);
  });

  it("names an unnamed root package '.'", async () => {
    const result = await run([file("package.json")], {
      project: { packages: [npm("", undefined)] },
    });
    expect(result.packages.map((pkg) => pkg.name)).toEqual(["."]);
  });

  it("emits a depends-on-package edge per declared dependency from the manifest", async () => {
    const result = await run(
      [file("packages/api/package.json"), file("packages/core/package.json")],
      {
        project: {
          packages: [
            npm("packages/api", "@acme/api", [
              prod("@acme/core"),
              dev("@acme/core"),
              prod("zod"),
              prod("@acme/api"),
            ]),
            npm("packages/core", "@acme/core"),
          ],
        },
      },
    );
    const internal = findEdge(
      result,
      "depends-on-package",
      "pkg:npm:packages/api",
      "pkg:npm:packages/core",
    );
    expect(internal).toMatchObject({ observations: 2, typeOnly: false, confidence: 1 });
    expect(internal?.provenance).toEqual([
      {
        file: "file:packages/api/package.json",
        line: 1,
        column: 1,
        mechanism: "manifest-dependency",
        resolution: "manifest",
        confidence: 1,
      },
      {
        file: "file:packages/api/package.json",
        line: 1,
        column: 1,
        mechanism: "manifest-dependency",
        resolution: "manifest",
        confidence: 1,
      },
    ]);
    expect(
      findEdge(result, "depends-on-package", "pkg:npm:packages/api", "ext:npm:zod"),
    ).toBeDefined();
    // A package naming itself is recorded as declared but yields no self-loop.
    expect(
      result.packages[0]?.declaredDependencies.find((dependency) => dependency.name === "@acme/api")
        ?.target,
    ).toBe("pkg:npm:packages/api");
    expect(result.edges.every((edge) => edge.source !== edge.target)).toBe(true);
  });

  it("maps ecosystems to their external namespaces", async () => {
    const result = await run([file("Cargo.toml"), file("tool/pyproject.toml")], {
      project: {
        packages: [
          {
            name: "app",
            ecosystem: "cargo",
            path: "",
            manifest: "Cargo.toml",
            dependencies: [prod("serde")],
          },
          {
            name: "tool",
            ecosystem: "poetry",
            path: "tool",
            manifest: "tool/pyproject.toml",
            dependencies: [prod("requests")],
          },
        ],
      },
    });
    expect(result.externals.map((external) => external.id)).toEqual([
      "ext:cargo:serde",
      "ext:x-poetry:requests",
    ]);
  });

  it("ignores invalid package descriptors with a diagnostic", async () => {
    const result = await run([file("package.json")], {
      project: { packages: [{ ...npm("", "x"), ecosystem: "Not Valid" }] },
    });
    expect(result.packages).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "plugin-error",
        severity: "warning",
        file: "file:package.json",
      }),
    ]);
  });

  it("uses the first adapter (by id) that reports a manifest location", async () => {
    const files = [file("package.json")];
    const result = await run(files, {
      projects: [
        { adapterId: "zeta", project: fakeProject({ packages: [npm("", "from-zeta")] }) },
        { adapterId: "alpha", project: fakeProject({ packages: [npm("", "from-alpha")] }) },
      ],
    });
    expect(result.packages.map((pkg) => pkg.name)).toEqual(["from-alpha"]);
  });
});

describe("duplicate package names", () => {
  it("prefers workspace members, then the shortest path, and reports each name once", async () => {
    const result = await run(
      [
        file("package.json"),
        file("libs/ui/package.json"),
        file("apps/ui/package.json"),
        file("packages/app/package.json"),
        file("examples/x/package.json"),
      ],
      {
        project: {
          packages: [
            npm("", "root", [], { workspaceRoot: true }),
            npm("libs/ui", "ui"),
            npm("apps/ui", "ui"),
            npm("packages/app", "app", [prod("ui"), prod("app")]),
            npm("examples/x", "app"),
          ],
        },
      },
    );
    const app = result.packages.find((pkg) => pkg.id === "pkg:npm:packages/app");
    // Every package lies under the workspace root. "app": "examples/x" is shorter than "packages/app".
    // "ui": "apps/ui" and "libs/ui" are equally long, so the smallest id wins.
    expect(app?.declaredDependencies.map((dependency) => dependency.target)).toEqual([
      "pkg:npm:examples/x",
      "pkg:npm:apps/ui",
    ]);
    expect(result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.severity])).toEqual([
      ["duplicate-package-name", "info"],
      ["duplicate-package-name", "info"],
    ]);
    expect(result.diagnostics[0]?.message).toBe(
      'Package name "app" is declared by 2 npm manifests (examples/x/package.json, packages/app/package.json); dependencies on it refer to examples/x/package.json',
    );
  });

  it("prefers a workspace member over a shorter path outside the workspace", async () => {
    const result = await run(
      [file("ws/package.json"), file("ws/packages/lib/package.json"), file("lib/package.json")],
      {
        project: {
          packages: [
            npm("ws", "ws", [prod("lib")], { workspaceRoot: true }),
            npm("ws/packages/lib", "lib"),
            npm("lib", "lib"),
          ],
        },
      },
    );
    expect(result.packages.find((pkg) => pkg.id === "pkg:npm:ws")?.declaredDependencies).toEqual([
      {
        name: "lib",
        versionRange: "^1.0.0",
        scope: "production",
        target: "pkg:npm:ws/packages/lib",
      },
    ]);
  });

  it("matches dependency names within one ecosystem only", async () => {
    const result = await run([file("package.json"), file("crate/Cargo.toml")], {
      project: {
        packages: [
          npm("", "web", [prod("core")]),
          {
            name: "core",
            ecosystem: "cargo",
            path: "crate",
            manifest: "crate/Cargo.toml",
            dependencies: [],
          },
        ],
      },
    });
    expect(result.packages.map((pkg) => pkg.id)).toEqual(["pkg:cargo:crate", "pkg:npm:"]);
    expect(result.packages[1]?.declaredDependencies[0]?.target).toBe("ext:npm:core");
  });
});

describe("owning packages", () => {
  it("assigns each file to the nearest manifest directory (a manifest to its own package)", async () => {
    const result = await run(
      [
        file("package.json"),
        file("packages/api/package.json"),
        file("packages/api/Cargo.toml"),
        file("packages/api/src/deep/a.ts", extraction()),
        file("scripts/b.ts", extraction()),
        file("packages/c.ts", extraction()),
      ],
      {
        project: {
          packages: [
            npm("", "root"),
            npm("packages/api", "api"),
            {
              name: "api",
              ecosystem: "cargo",
              path: "packages/api",
              manifest: "packages/api/Cargo.toml",
              dependencies: [],
            },
          ],
        },
      },
    );
    const owners = Object.fromEntries(result.files.map((entry) => [entry.path, entry.package]));
    expect(owners).toEqual({
      "package.json": "pkg:npm:",
      "packages/api/Cargo.toml": "pkg:cargo:packages/api",
      "packages/api/package.json": "pkg:npm:packages/api",
      // One adapter reported both packages: the smallest id.
      "packages/api/src/deep/a.ts": "pkg:cargo:packages/api",
      "packages/c.ts": "pkg:npm:",
      "scripts/b.ts": "pkg:npm:",
    });
  });

  it("prefers the package reported by the file's adapter among manifests of one directory", async () => {
    // A napi-rs layout: package.json and Cargo.toml side by side.
    const result = await run(
      [
        file("package.json"),
        file("Cargo.toml"),
        file("README.md"),
        file("index.ts", extraction(), { adapter: { id: "ts", version: "1.0.0" } }),
        file("src/lib.rs", extraction(), {
          language: "rust",
          adapter: { id: "rust", version: "1.0.0" },
        }),
      ],
      {
        projects: [
          { adapterId: "ts", project: fakeProject({ packages: [npm("", "napi-demo")] }) },
          {
            adapterId: "rust",
            project: fakeProject({
              packages: [
                {
                  name: "napi_demo",
                  ecosystem: "cargo",
                  path: "",
                  manifest: "Cargo.toml",
                  dependencies: [],
                },
              ],
            }),
          },
        ],
      },
    );
    expect(Object.fromEntries(result.files.map((entry) => [entry.path, entry.package]))).toEqual({
      "Cargo.toml": "pkg:cargo:",
      // No adapter processed it: the smallest id.
      "README.md": "pkg:cargo:",
      "index.ts": "pkg:npm:",
      "package.json": "pkg:npm:",
      "src/lib.rs": "pkg:cargo:",
    });
  });
});

describe("declared flags of external packages", () => {
  const workspace = [
    npm("", "acme-monorepo", [dev("typescript"), prod("left-pad")], {
      workspaceRoot: true,
      private: true,
    }),
    npm("packages/api", "@acme/api", [prod("@acme/core")]),
    npm("packages/web", "@acme/web", [prod("react"), prod("lodash")]),
    npm("packages/core", "@acme/core"),
  ];
  const manifests = [
    file("package.json"),
    file("packages/api/package.json"),
    file("packages/web/package.json"),
    file("packages/core/package.json"),
  ];

  it("flags phantom dependencies and accepts declarations of the workspace root", async () => {
    const result = await run(
      [
        ...manifests,
        file(
          "packages/api/src/server.ts",
          extraction({ imports: [imp("lodash"), imp("node:http"), imp("left-pad")] }),
        ),
        file("packages/web/src/app.tsx", extraction({ imports: [imp("react"), imp("lodash")] })),
        file("scripts/build.ts", extraction({ imports: [imp("esbuild")] })),
      ],
      { project: { packages: workspace } },
    );
    const declared = Object.fromEntries(
      result.externals.map((external) => [external.id, external.declared]),
    );
    expect(declared).toEqual({
      // Imported by api (undeclared) and web (declared): not declared by every user.
      "ext:npm:lodash": false,
      // Declared by the workspace root that api belongs to.
      "ext:npm:left-pad": true,
      "ext:npm:react": true,
      // Imported by a file of the root package, which does not declare it.
      "ext:npm:esbuild": false,
      // Not imported by code, or built-in: no flag.
      "ext:npm:typescript": undefined,
      "ext:node:http": undefined,
    });
  });

  it("accepts a declared @types package for packages imported only for types", async () => {
    const result = await run(
      [
        file("package.json"),
        file(
          "src/handler.ts",
          extraction({
            imports: [
              imp("aws-lambda", ["APIGatewayProxyEvent"], { typeOnly: true, line: 1 }),
              imp("@babel/core", ["TransformOptions"], { typeOnly: true, line: 2 }),
              imp("node-fetch", [["fetch", "default"]], { line: 3 }),
              imp("pg", ["PoolConfig"], { typeOnly: true, line: 4 }),
              imp("estree", ["Node"], { typeOnly: true, line: 5 }),
            ],
          }),
        ),
        // A value import of pg: its types package does not provide the runtime code.
        file("src/db.ts", extraction({ imports: [imp("pg", ["Pool"])] })),
      ],
      {
        project: {
          packages: [
            npm("", "lambda-svc", [
              dev("@types/aws-lambda"),
              dev("@types/babel__core"),
              dev("@types/node-fetch"),
              dev("@types/pg"),
            ]),
          ],
        },
      },
    );
    const declared = Object.fromEntries(
      result.externals.map((external) => [external.id, external.declared]),
    );
    expect(declared).toMatchObject({
      "ext:npm:aws-lambda": true,
      "ext:npm:@babel/core": true,
      "ext:npm:node-fetch": false,
      "ext:npm:pg": false,
      "ext:npm:estree": false,
    });
  });

  it("gives no flag when no importing file belongs to a package", async () => {
    const result = await run([file("a.ts", extraction({ imports: [imp("express")] }))]);
    expect(result.externals).toEqual([
      { id: "ext:npm:express", kind: "package", namespace: "npm", name: "express" },
    ]);
  });

  it("does not use the workspace root of another ecosystem", async () => {
    const result = await run(
      [
        file("Cargo.toml"),
        file("web/package.json"),
        file("web/a.ts", extraction({ imports: [imp("serde-js")] })),
      ],
      {
        project: {
          packages: [
            {
              name: "ws",
              ecosystem: "cargo",
              path: "",
              manifest: "Cargo.toml",
              workspaceRoot: true,
              dependencies: [prod("serde-js")],
            },
            npm("web", "web"),
          ],
        },
      },
    );
    expect(result.externals.find((external) => external.id === "ext:npm:serde-js")?.declared).toBe(
      false,
    );
  });
});

describe("entry points", () => {
  const descriptors: EntryPointDescriptor[] = [
    {
      path: "packages/core/src/index.ts",
      kind: "main",
      source: "package.json#main",
      packagePath: "packages/core",
      mappedFrom: "dist/index.js",
    },
    {
      path: "packages/core/src/index.ts",
      kind: "types",
      source: "package.json#types",
      packagePath: "packages/core",
    },
    { path: "packages/core/src/cli.ts", kind: "bin", source: "package.json#bin.core" },
    { path: "packages/core/dist/missing.js", kind: "module", source: "package.json#module" },
    {
      path: "scripts/x.ts",
      kind: "script",
      source: "package.json#scripts.x",
      packagePath: "nowhere",
    },
  ];

  it("maps project entry points of listed files with their package", async () => {
    const result = await run(
      [
        file("packages/core/package.json"),
        file("packages/core/src/index.ts", extraction()),
        file("packages/core/src/cli.ts", extraction()),
        file("scripts/x.ts", extraction()),
      ],
      { project: { packages: [npm("packages/core", "@acme/core")], entryPoints: descriptors } },
    );
    expect(result.entryPoints).toEqual([
      {
        entity: "file:packages/core/src/cli.ts",
        kind: "bin",
        source: "package.json#bin.core",
        package: "pkg:npm:packages/core",
      },
      {
        entity: "file:packages/core/src/index.ts",
        kind: "main",
        source: "package.json#main",
        package: "pkg:npm:packages/core",
        mappedFrom: "dist/index.js",
      },
      {
        entity: "file:packages/core/src/index.ts",
        kind: "types",
        source: "package.json#types",
        package: "pkg:npm:packages/core",
      },
      { entity: "file:scripts/x.ts", kind: "script", source: "package.json#scripts.x" },
    ]);
  });

  it("adds conventional entry points from facts, deduplicated", async () => {
    const result = await run([
      file(
        "cmd/main.go",
        extraction({
          symbols: [sym("main", "function")],
          facts: [
            fact("entry-point", { kind: "main" }, { from: "main" }),
            fact("entry-point", { kind: "main" }, { from: "main", line: 9 }),
            fact("entry-point", { kind: "guard" }),
          ],
        }),
      ),
    ]);
    expect(result.entryPoints).toEqual([
      { entity: fid("cmd/main.go"), kind: "convention", source: ADAPTER },
      { entity: sid("cmd/main.go", "main"), kind: "convention", source: ADAPTER },
    ]);
  });

  it("normalizes package paths and prefers the declaring adapter's package", async () => {
    const files = [
      file("tool/package.json"),
      file("tool/pyproject.toml"),
      file("tool/main.py", extraction()),
      file("tool/cli.ts", extraction()),
    ];
    const result = await run(files, {
      projects: [
        {
          adapterId: ADAPTER,
          project: fakeProject({
            packages: [npm("tool", "tool")],
            entryPoints: [
              {
                path: "tool/cli.ts",
                kind: "bin",
                source: "package.json#bin",
                packagePath: "./tool/",
              },
            ],
          }),
        },
        {
          adapterId: "python",
          project: fakeProject({
            packages: [
              {
                name: "tool",
                ecosystem: "pypi",
                path: "tool",
                manifest: "tool/pyproject.toml",
                dependencies: [],
              },
            ],
            entryPoints: [
              {
                path: "tool/main.py",
                kind: "script",
                source: "pyproject.toml#scripts.tool",
                packagePath: "tool",
              },
            ],
          }),
        },
      ],
    });
    expect(result.entryPoints).toEqual([
      {
        entity: "file:tool/cli.ts",
        kind: "bin",
        source: "package.json#bin",
        package: "pkg:npm:tool",
      },
      {
        entity: "file:tool/main.py",
        kind: "script",
        source: "pyproject.toml#scripts.tool",
        package: "pkg:pypi:tool",
      },
    ]);
  });
});
