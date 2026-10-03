import { describe, expect, it } from "vitest";
import { extraction, fakeProject, file, findEdge, imp, run, sid, sym } from "./test-support.js";

describe("import entries", () => {
  it("records each import with its resolution, in source order", async () => {
    const result = await run([
      file(
        "src/main.ts",
        extraction({
          symbols: [sym("load", "function")],
          imports: [
            imp("./util", ["helper"], { line: 1, column: 1 }),
            imp("./types", [], { typeOnly: true, mechanism: "type-import", line: 2, column: 1 }),
            imp("./lazy", [], {
              kind: "dynamic",
              mechanism: "dynamic-import",
              from: "load",
              line: 7,
              column: 12,
            }),
            imp("fmt", [], { wildcard: true, global: true, optional: true, line: 3, column: 1 }),
          ],
        }),
      ),
      file("src/util.ts", extraction()),
      file("src/types.ts", extraction()),
      file("src/lazy.ts", extraction()),
    ]);
    expect(result.files.find((entry) => entry.path === "src/main.ts")?.imports).toEqual([
      {
        specifier: "./util",
        kind: "static",
        mechanism: "import-declaration",
        typeOnly: false,
        line: 1,
        column: 1,
        resolution: { status: "resolved", targets: ["file:src/util.ts"], method: "relative-path" },
      },
      {
        specifier: "./types",
        kind: "static",
        mechanism: "type-import",
        typeOnly: true,
        line: 2,
        column: 1,
        resolution: { status: "resolved", targets: ["file:src/types.ts"], method: "relative-path" },
      },
      {
        specifier: "./lazy",
        kind: "dynamic",
        mechanism: "dynamic-import",
        typeOnly: false,
        line: 7,
        column: 12,
        from: sid("src/main.ts", "load"),
        resolution: { status: "resolved", targets: ["file:src/lazy.ts"], method: "relative-path" },
      },
      {
        specifier: "fmt",
        kind: "static",
        mechanism: "import-declaration",
        typeOnly: false,
        line: 3,
        column: 1,
        wildcard: true,
        global: true,
        optional: true,
        resolution: { status: "external", target: "ext:npm:fmt", method: "external-package" },
      },
    ]);
  });

  it("passes specifier, importing file, kind and mechanism to the adapter's resolver", async () => {
    const project = fakeProject({ files: ["a.ts", "b.ts"] });
    await run(
      [
        file(
          "a.ts",
          extraction({
            imports: [imp("./b", [], { kind: "side-effect", mechanism: "side-effect-import" })],
          }),
        ),
        file("b.ts", extraction()),
      ],
      { projects: [{ adapterId: "fake", project }] },
    );
    expect(project.requests).toEqual([
      { specifier: "./b", fromFile: "a.ts", kind: "side-effect", mechanism: "side-effect-import" },
    ]);
  });

  it("keeps listed files of package-level resolutions and emits one edge per target", async () => {
    const result = await run(
      [
        file("main.go", extraction({ imports: [imp("example.com/m/util")] })),
        file("util/b.go", extraction()),
        file("util/a.go", extraction()),
      ],
      {
        project: {
          modules: {
            "example.com/m/util": {
              status: "resolved",
              paths: ["util/b.go", "util/gone.go", "util/a.go"],
              method: "package-scope",
              unit: "example.com/m/util",
              confidence: 0.75,
            },
          },
        },
      },
    );
    const entry = result.files.find((item) => item.path === "main.go")?.imports[0];
    expect(entry?.resolution).toEqual({
      status: "resolved",
      targets: ["file:util/a.go", "file:util/b.go"],
      method: "package-scope",
      unit: "example.com/m/util",
    });
    for (const target of ["file:util/a.go", "file:util/b.go"]) {
      expect(findEdge(result, "imports", "file:main.go", target)?.provenance).toEqual([
        {
          file: "file:main.go",
          line: 1,
          column: 1,
          mechanism: "import-declaration",
          resolution: "package-scope",
          confidence: 0.75,
          specifier: "example.com/m/util",
        },
      ]);
    }
  });

  it("does not count imports of files excluded from the analysis as unresolved", async () => {
    // Project resolvers match the snapshot's files: a resolved path that is not listed exists but was
    // excluded (configuration `exclude` / `include`).
    const result = await run(
      [file("a.ts", extraction({ imports: [imp("./gen/api", [], { line: 2, column: 3 })] }))],
      {
        project: {
          modules: {
            "./gen/api": {
              status: "resolved",
              paths: ["gen/api.generated.ts"],
              method: "relative-path",
            },
          },
        },
      },
    );
    expect(result.files[0]?.imports[0]?.resolution).toEqual({
      status: "excluded",
      paths: ["gen/api.generated.ts"],
      method: "relative-path",
    });
    // The entry says what happened; an excluded file is deliberate, not a problem to report.
    expect(result.diagnostics).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.stats.unresolvedImports).toBe(0);
  });

  it("records the unit of package-level imports whose files are all excluded", async () => {
    const result = await run(
      [file("main.go", extraction({ imports: [imp("example.com/m/gen")] }))],
      {
        project: {
          modules: {
            "example.com/m/gen": {
              status: "resolved",
              paths: ["gen/b.go", "gen/a.go"],
              method: "package-scope",
              unit: "example.com/m/gen",
            },
          },
        },
      },
    );
    expect(result.files[0]?.imports[0]?.resolution).toEqual({
      status: "excluded",
      paths: ["gen/a.go", "gen/b.go"],
      method: "package-scope",
      unit: "example.com/m/gen",
    });
    expect(result.stats.unresolvedImports).toBe(0);
  });

  it("treats a resolution to no file at all as unresolved", async () => {
    const result = await run([file("a.ts", extraction({ imports: [imp("./x")] }))], {
      project: { modules: { "./x": { status: "resolved", paths: [], method: "relative-path" } } },
    });
    expect(result.files[0]?.imports[0]?.resolution).toEqual({
      status: "unresolved",
      reason: "the resolver reported no files",
      method: "relative-path",
    });
    expect(result.stats.unresolvedImports).toBe(1);
  });

  it("registers external packages and built-in modules", async () => {
    const result = await run(
      [
        file(
          "a.ts",
          extraction({
            imports: [
              imp("@scope/pkg/sub", [], { line: 1 }),
              imp("node:fs", [], { line: 2 }),
              imp("yaml", [], { line: 3 }),
            ],
          }),
        ),
      ],
      {
        project: {
          modules: {
            yaml: {
              status: "external",
              namespace: "pypi",
              packageName: "PyYAML",
              importName: "yaml",
              method: "external-package",
              confidence: 0.6,
            },
          },
        },
      },
    );
    expect(result.files[0]?.imports.map((entry) => entry.resolution)).toEqual([
      { status: "external", target: "ext:npm:@scope/pkg", method: "external-package" },
      { status: "builtin", target: "ext:node:fs" },
      { status: "external", target: "ext:pypi:PyYAML", method: "external-package" },
    ]);
    expect(result.externals).toEqual([
      { id: "ext:node:fs", kind: "builtin", namespace: "node", name: "fs" },
      { id: "ext:npm:@scope/pkg", kind: "package", namespace: "npm", name: "@scope/pkg" },
      { id: "ext:pypi:PyYAML", kind: "package", namespace: "pypi", name: "PyYAML" },
    ]);
    expect(findEdge(result, "imports", "file:a.ts", "ext:node:fs")?.provenance[0]).toMatchObject({
      resolution: "builtin-module",
      confidence: 1,
      specifier: "node:fs",
    });
    expect(
      findEdge(result, "imports", "file:a.ts", "ext:pypi:PyYAML")?.provenance[0],
    ).toMatchObject({
      resolution: "external-package",
      confidence: 0.6,
    });
  });

  it("moves unregistered external namespaces into the plugin space", async () => {
    const result = await run([file("a.ts", extraction({ imports: [imp("jsr:@std/path")] }))], {
      project: {
        modules: {
          "jsr:@std/path": {
            status: "external",
            namespace: "jsr",
            packageName: "@std/path",
            method: "external-package",
          },
        },
      },
    });
    expect(result.externals.map((external) => external.id)).toEqual(["ext:x-jsr:@std/path"]);
  });
});

describe("unresolved and non-literal imports", () => {
  it("reports unresolved imports with a warning at their position", async () => {
    const result = await run([
      file("src/a.ts", extraction({ imports: [imp("./missing", [], { line: 4, column: 9 })] })),
    ]);
    expect(result.files[0]?.imports[0]?.resolution).toEqual({
      status: "unresolved",
      reason: "no file for ./missing",
    });
    expect(result.diagnostics).toEqual([
      {
        code: "unresolved-import",
        severity: "warning",
        message: 'Cannot resolve "./missing": no file for ./missing',
        file: "file:src/a.ts",
        line: 4,
        column: 9,
      },
    ]);
    expect(result.stats.unresolvedImports).toBe(1);
  });

  it("does not resolve non-literal specifiers and does not count them", async () => {
    const project = fakeProject();
    const result = await run(
      [
        file(
          "loader.js",
          extraction({
            imports: [
              imp("pluginPath", [], { literal: false, kind: "static", mechanism: "require-call" }),
            ],
          }),
        ),
      ],
      { projects: [{ adapterId: "fake", project }] },
    );
    expect(result.files[0]?.imports[0]?.resolution).toEqual({ status: "non-literal" });
    expect(project.requests).toEqual([]);
    expect(result.stats.unresolvedImports).toBe(0);
    expect(result.diagnostics).toEqual([]);
  });

  it("cannot resolve imports of files whose adapter has no project", async () => {
    const result = await run([
      file("a.py", extraction({ imports: [imp("os")] }), {
        adapter: { id: "python", version: "0.1.0" },
      }),
    ]);
    expect(result.files[0]?.imports[0]?.resolution).toEqual({
      status: "unresolved",
      reason: "no project for adapter python",
    });
  });

  it("reports a failing resolver once and keeps going", async () => {
    const result = await run(
      [file("a.ts", extraction({ imports: [imp("./b"), imp("./c")] })), file("b.ts", extraction())],
      { project: { failResolve: true } },
    );
    expect(result.files[0]?.imports.map((entry) => entry.resolution)).toEqual([
      { status: "unresolved", reason: "resolver failed: resolver exploded" },
      { status: "unresolved", reason: "resolver failed: resolver exploded" },
    ]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "plugin-error",
      "unresolved-import",
      "unresolved-import",
    ]);
  });
});

describe("import edges", () => {
  it("distinguishes imports from re-exports and skips module declarations", async () => {
    const result = await run([
      file(
        "src/index.ts",
        extraction({
          imports: [
            imp("./a", [], { kind: "re-export", mechanism: "export-all" }),
            imp("./b", ["b"]),
            imp("./c", [], { kind: "module-declaration", mechanism: "x-mod-item" }),
          ],
        }),
      ),
      file("src/a.ts", extraction()),
      file("src/b.ts", extraction()),
      file("src/c.ts", extraction()),
    ]);
    expect(result.edges.map((edge) => [edge.kind, edge.target])).toEqual([
      ["re-exports", "file:src/a.ts"],
      ["imports", "file:src/b.ts"],
    ]);
    expect(
      result.files.find((entry) => entry.path === "src/index.ts")?.imports[2]?.resolution,
    ).toEqual({
      status: "resolved",
      targets: ["file:src/c.ts"],
      method: "relative-path",
    });
  });

  it("aggregates repeated imports and keeps type-only only when every import is type-only", async () => {
    const result = await run([
      file(
        "a.ts",
        extraction({
          imports: [
            imp("./b", [], { typeOnly: true, mechanism: "type-import", line: 1 }),
            imp("./b", [], { line: 2 }),
            imp("./c", [], { typeOnly: true, mechanism: "type-import", line: 3 }),
          ],
        }),
      ),
      file("b.ts", extraction()),
      file("c.ts", extraction()),
    ]);
    const toB = findEdge(result, "imports", "file:a.ts", "file:b.ts");
    expect(toB).toMatchObject({ observations: 2, typeOnly: false });
    expect(toB?.provenance.map((item) => [item.line, item.typeOnly])).toEqual([
      [1, true],
      [2, undefined],
    ]);
    expect(findEdge(result, "imports", "file:a.ts", "file:c.ts")?.typeOnly).toBe(true);
  });

  it("never emits self-imports", async () => {
    const result = await run([file("a.ts", extraction({ imports: [imp("./a")] }))]);
    expect(result.files[0]?.imports[0]?.resolution.status).toBe("resolved");
    expect(result.edges).toEqual([]);
  });
});
