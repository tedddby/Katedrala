import { describe, expect, it } from "vitest";
import { ConfigSet } from "./config-set.js";
import { DiagnosticCollector } from "./diagnostics.js";
import { Locator } from "./locations.js";
import { createMemoryProjectContext } from "./memory-context.js";
import { OutputMapper, outputExtensionOf } from "./output-mapping.js";
import { SnapshotIndex } from "./snapshot.js";
import { loadProjectConfigs } from "./tsconfig.js";

const json = (value: unknown): string => JSON.stringify(value, null, 2);

async function mapperOf(files: Record<string, string>): Promise<OutputMapper> {
  const memory = createMemoryProjectContext(files);
  const snapshot = new SnapshotIndex(Object.keys(files));
  const locator = new Locator(undefined);
  const reader = {
    readFile: (path: string) => memory.context.readText(path),
    readAncestor: (path: string) => memory.context.readAncestorText(path),
  };
  const loaded = await loadProjectConfigs(reader, snapshot, locator, new DiagnosticCollector());
  return new OutputMapper(snapshot, new ConfigSet(loaded, snapshot, locator));
}

describe("outputExtensionOf", () => {
  it.each([
    ["a.js", ".js", [".ts", ".tsx", ".js", ".jsx"]],
    ["a.jsx", ".jsx", [".tsx", ".jsx"]],
    ["a.mjs", ".mjs", [".mts", ".mjs", ".ts", ".tsx", ".cts", ".js", ".jsx"]],
    ["a.cjs", ".cjs", [".cts", ".cjs", ".ts", ".tsx", ".mts", ".js", ".jsx"]],
    ["a.d.ts", ".d.ts", [".ts", ".tsx"]],
    ["a.d.mts", ".d.mts", [".mts", ".ts", ".tsx"]],
    ["a.d.cts", ".d.cts", [".cts", ".ts", ".tsx"]],
    ["a.json", ".json", [".json"]],
  ])("%s has the output extension %s", (path, extension, sources) => {
    expect(outputExtensionOf(path)).toEqual({ extension, sources });
  });

  it("has no output extension for sources and unknown files", () => {
    expect(outputExtensionOf("a.ts")).toBeUndefined();
    expect(outputExtensionOf("a")).toBeUndefined();
    expect(outputExtensionOf("a.css")).toBeUndefined();
  });
});

describe("OutputMapper", () => {
  it("returns listed files unchanged", async () => {
    const mapper = await mapperOf({ "dist/index.js": "", "src/index.ts": "" });
    expect(mapper.map("dist/index.js", "")).toEqual({ path: "dist/index.js" });
  });

  it("maps outDir to rootDir with source extensions", async () => {
    const mapper = await mapperOf({
      "tsconfig.json": json({
        compilerOptions: { rootDir: "source", outDir: "build", declarationDir: "types" },
      }),
      "source/index.ts": "",
      "source/view.tsx": "",
      "source/legacy.js": "",
      "source/esm.mts": "",
      "source/cjs.cts": "",
    });
    expect(mapper.map("build/index.js", "")).toEqual({
      path: "source/index.ts",
      mappedFrom: "build/index.js",
    });
    expect(mapper.toSource("build/view.js", "")).toBe("source/view.tsx");
    expect(mapper.toSource("build/view.jsx", "")).toBe("source/view.tsx");
    expect(mapper.toSource("build/legacy.js", "")).toBe("source/legacy.js");
    expect(mapper.toSource("build/esm.mjs", "")).toBe("source/esm.mts");
    expect(mapper.toSource("build/cjs.cjs", "")).toBe("source/cjs.cts");
    expect(mapper.toSource("types/index.d.ts", "")).toBe("source/index.ts");
    expect(mapper.toSource("build/esm.d.mts", "")).toBe("source/esm.mts");
    expect(mapper.toSource("build/missing.js", "")).toBeUndefined();
  });

  it("infers the root directory from the inputs (TypeScript 5) or uses the configuration directory (TypeScript 6)", async () => {
    const mapper = await mapperOf({
      "pkg/tsconfig.json": json({ compilerOptions: { outDir: "out" }, include: ["app"] }),
      "pkg/app/main.ts": "",
      "pkg/app/nested/util.ts": "",
      "pkg/app/main.d.ts": "",
    });
    expect(mapper.toSource("pkg/out/main.js", "pkg")).toBe("pkg/app/main.ts");
    expect(mapper.toSource("pkg/out/nested/util.js", "pkg")).toBe("pkg/app/nested/util.ts");
    expect(mapper.toSource("pkg/out/app/main.js", "pkg")).toBe("pkg/app/main.ts");
  });

  it("falls back to replacing or removing leading build directories", async () => {
    const mapper = await mapperOf({
      "packages/a/src/index.ts": "",
      "packages/a/cli.ts": "",
      "packages/a/src/node/index.ts": "",
      "packages/a/server.ts": "",
    });
    expect(mapper.toSource("packages/a/dist/index.js", "packages/a")).toBe(
      "packages/a/src/index.ts",
    );
    expect(mapper.toSource("packages/a/lib/cli.js", "packages/a")).toBe("packages/a/cli.ts");
    expect(mapper.toSource("packages/a/dist/esm/index.mjs", "packages/a")).toBe(
      "packages/a/src/index.ts",
    );
    expect(mapper.toSource("packages/a/dist/esm/index.js", "packages/a")).toBe(
      "packages/a/src/index.ts",
    );
    expect(mapper.toSource("packages/a/build/node/index.js", "packages/a")).toBe(
      "packages/a/src/node/index.ts",
    );
    expect(mapper.toSource("packages/a/server.js", "packages/a")).toBe("packages/a/server.ts");
    expect(mapper.toSource("packages/a/vendor/index.js", "packages/a")).toBeUndefined();
    // Heuristics apply only inside the declaring package.
    expect(mapper.toSource("packages/a/dist/index.js", "packages/b")).toBeUndefined();
  });

  it("maps bundler outputs (.mjs, .cjs, .d.mts, .d.cts) back to .ts sources, tsc counterparts first", async () => {
    // tsup, tsdown, unbuild and pkgroll compile src/index.ts to all four of these.
    const mapper = await mapperOf({
      "packages/utils/src/index.ts": "",
      "packages/utils/src/cli.mts": "",
      "packages/utils/src/cli.ts": "",
      "packages/utils/src/view.tsx": "",
    });
    for (const output of ["index.mjs", "index.cjs", "index.d.mts", "index.d.cts"]) {
      expect(mapper.map(`packages/utils/dist/${output}`, "packages/utils")).toEqual({
        path: "packages/utils/src/index.ts",
        mappedFrom: `packages/utils/dist/${output}`,
      });
    }
    expect(mapper.toSource("packages/utils/dist/cli.mjs", "packages/utils")).toBe(
      "packages/utils/src/cli.mts",
    );
    expect(mapper.toSource("packages/utils/dist/cli.cjs", "packages/utils")).toBe(
      "packages/utils/src/cli.ts",
    );
    expect(mapper.toSource("packages/utils/dist/view.d.mts", "packages/utils")).toBe(
      "packages/utils/src/view.tsx",
    );
  });

  it("probes extensionless and directory targets before treating them as outputs", async () => {
    const mapper = await mapperOf({
      "src/server.ts": "",
      "lib/index.js": "",
      "src/main.ts": "",
      "index.ts": "",
    });
    expect(mapper.toSource("src/server", "")).toBe("src/server.ts");
    expect(mapper.toSource("lib", "")).toBe("lib/index.js");
    expect(mapper.toSource("dist/main", "")).toBe("src/main.ts");
    expect(mapper.toSource("", "")).toBe("index.ts");
  });

  it("does not map missing source files", async () => {
    const mapper = await mapperOf({ "src/index.tsx": "" });
    expect(mapper.toSource("src/index.ts", "")).toBeUndefined();
    expect(mapper.map("src/missing.css", "")).toBeUndefined();
  });
});
