import { existsSync, readFileSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigurationError, InMemorySource, MemoryExtractionCache } from "@katedrala/core";
import {
  emptyDocument,
  fileId,
  serializeDocument,
  type ArchitectureDocument,
  type ImportEntry,
} from "@katedrala/ir";
import type { SnapshotSource } from "@katedrala/plugin-api";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contentDigest } from "./identity.js";
import { analyzeStructure, type AnalyzeOptions, type StructureDocument } from "./structure.js";

const PROJECT: Readonly<Record<string, string>> = {
  "package.json": `${JSON.stringify({ name: "shop", version: "1.0.0", dependencies: { express: "^5.0.0" } }, null, 2)}\n`,
  "tsconfig.json": `${JSON.stringify({ compilerOptions: { strict: true } })}\n`,
  "src/index.ts": [
    'import express from "express";',
    'import { OrderService } from "./orders/order-service";',
    "const app = express();",
    "new OrderService().place();",
    "export { app };",
    "",
  ].join("\n"),
  "src/orders/order-service.ts": [
    'import { randomUUID } from "node:crypto";',
    'import type { Order } from "./order";',
    "export class OrderService {",
    "  place(): Order {",
    "    return { id: randomUUID() };",
    "  }",
    "}",
    "",
  ].join("\n"),
  "src/orders/order.ts": "export interface Order {\n  id: string;\n}\n",
  "README.md": "# Shop\n",
};

function source(
  extra: Readonly<Record<string, string>> = {},
  options: { remote?: string; subdirectory?: string } = {},
): InMemorySource {
  return new InMemorySource({ files: { ...PROJECT, ...extra }, ...options });
}

function analyze(options: AnalyzeOptions) {
  return analyzeStructure({ cache: false, concurrency: 1, ...options });
}

function importsOf(document: StructureDocument, path: string): ImportEntry[] {
  return document.files.find((file) => file.path === path)?.imports ?? [];
}

const strictSchema = (() => {
  const url = new URL("../../ir/schema/architecture.strict.schema.json", import.meta.url);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats.default(ajv);
  return ajv.compile(JSON.parse(readFileSync(url, "utf8")) as object);
})();

/** The structural sections inside an otherwise empty document, as the full pipeline will produce them. */
function asDocument(structure: StructureDocument): ArchitectureDocument {
  return { ...emptyDocument(), ...structure };
}

describe("analyzeStructure", () => {
  it("links files, imports, symbols, edges and externals", async () => {
    const { document } = await analyze({ source: source() });
    expect(document.files.map((file) => file.path)).toEqual([
      "README.md",
      "package.json",
      "src/index.ts",
      "src/orders/order-service.ts",
      "src/orders/order.ts",
      "tsconfig.json",
    ]);
    const index = importsOf(document, "src/index.ts");
    expect(index.map((entry) => [entry.specifier, entry.resolution.status])).toEqual([
      ["express", "external"],
      ["./orders/order-service", "resolved"],
    ]);
    const service = importsOf(document, "src/orders/order-service.ts");
    expect(
      service.map((entry) => [entry.specifier, entry.resolution.status, entry.typeOnly]),
    ).toEqual([
      ["node:crypto", "builtin", false],
      ["./order", "resolved", true],
    ]);
    expect(document.externals.map((external) => external.id)).toEqual(
      expect.arrayContaining(["ext:npm:express", "ext:node:crypto"]),
    );
    const edges = document.edges.map((edge) => `${edge.kind} ${edge.source} -> ${edge.target}`);
    expect(edges).toEqual(
      expect.arrayContaining([
        "instantiates file:src/index.ts -> sym:src/orders/order-service.ts#OrderService",
        "calls file:src/index.ts -> sym:src/orders/order-service.ts#OrderService.place",
      ]),
    );
    expect(document.repository.name).toBe("shop");
    expect(document.repository.id).toBe("repo:shop");
    expect(document.repository.vcs).toBeUndefined();
    expect(document.generator.adapters.map((adapter) => adapter.id)).toEqual(["typescript"]);
    expect(document.repository.stats.analyzedFiles).toBe(3);
    expect(document.repository.stats.unresolvedImports).toBe(0);
    expect(document.diagnostics).toEqual([]);
  });

  it("produces structural sections that validate against the strict schema", async () => {
    const { document } = await analyze({ source: source() });
    const valid = strictSchema(asDocument(document));
    expect(strictSchema.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  });

  it("is deterministic and independent of listing order", async () => {
    const reversed = Object.fromEntries(Object.entries(PROJECT).reverse());
    const first = await analyze({ source: source() });
    const second = await analyze({ source: new InMemorySource({ files: reversed }) });
    expect(serializeDocument(second.document)).toBe(serializeDocument(first.document));
  });

  it("derives the content digest from content and the analysis digest from settings", async () => {
    const base = await analyze({ source: source() });
    expect(base.document.snapshot.contentDigest).toBe(contentDigest(base.document.files));

    const edited = await analyze({
      source: source({ "src/orders/order.ts": "export type Order = { id: string };\n" }),
    });
    expect(edited.document.snapshot.contentDigest).not.toBe(base.document.snapshot.contentDigest);
    expect(edited.document.snapshot.analysisDigest).toBe(base.document.snapshot.analysisDigest);

    const configured = await analyze({
      source: source({ "katedrala.config.yaml": "analysis:\n  detail: file\n" }),
    });
    expect(configured.document.snapshot.analysisDigest).not.toBe(
      base.document.snapshot.analysisDigest,
    );

    const fileDetail = await analyze({ source: source(), detail: { relationships: "file" } });
    expect(fileDetail.document.snapshot.analysisDigest).not.toBe(
      base.document.snapshot.analysisDigest,
    );
  });

  it("lifts every relationship to files when symbols are not requested", async () => {
    const { document } = await analyze({ source: source(), detail: { symbols: false } });
    expect(document.detail).toEqual({
      symbols: false,
      relationships: "file",
      symbolMetrics: false,
    });
    expect(document.symbols).toEqual([]);
    for (const edge of document.edges) {
      // Sources are files (or packages, for manifest dependencies); nothing points at a symbol.
      expect(edge.source.startsWith("sym:")).toBe(false);
      expect(edge.target.startsWith("sym:")).toBe(false);
    }
  });

  it("identifies the repository by its remote when there is one", async () => {
    const { document } = await analyze({
      source: source({}, { remote: "github.com/acme/storefront", subdirectory: "" }),
    });
    expect(document.repository.id).toBe("repo:github.com/acme/storefront");
    expect(document.repository.name).toBe("shop");
    expect(document.repository.vcs).toEqual({ type: "git", remote: "github.com/acme/storefront" });
    expect(document.snapshot.subdirectory).toBe("");
  });

  it("reports configuration sections that are not evaluated yet", async () => {
    const { document } = await analyze({
      source: source({
        "katedrala.config.yaml": "rules:\n  - id: no-cycles\n    no_cycles: true\n",
      }),
    });
    expect(document.diagnostics).toEqual([
      {
        code: "configuration-warning",
        severity: "warning",
        message: 'Configuration section "rules" is not evaluated by this version of Katedrala',
        file: "file:katedrala.config.yaml",
      },
    ]);
  });

  it("rejects invalid configuration", async () => {
    await expect(
      analyze({ source: source({ "katedrala.config.yaml": "analysis:\n  detail: everything\n" }) }),
    ).rejects.toBeInstanceOf(ConfigurationError);
  });

  it("reports invalid adapter options as configuration errors", async () => {
    const result = analyze({
      source: source({ "katedrala.config.yaml": "languages:\n  typescript:\n    bogus: true\n" }),
    });
    await expect(result).rejects.toBeInstanceOf(ConfigurationError);
    await expect(result).rejects.toMatchObject({ issues: [{ path: "languages.typescript" }] });
  });

  it("warns about options for adapters that are not installed", async () => {
    const { document } = await analyze({
      source: source({ "katedrala.config.yaml": "languages:\n  python:\n    version: 3\n" }),
    });
    expect(document.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      'Options for language adapter "python" are ignored: no such adapter is installed',
    ]);
  });

  it("adds configured entry points", async () => {
    const { document } = await analyze({
      source: source({ "katedrala.config.yaml": "entry_points:\n  - src/index.ts\n" }),
    });
    expect(document.entryPoints).toContainEqual({
      entity: fileId("src/index.ts"),
      kind: "configuration",
      source: "katedrala.config.yaml#entry_points",
    });
  });

  it("serves unchanged files from the extraction cache", async () => {
    const cache = new MemoryExtractionCache();
    const first = await analyzeStructure({ source: source(), cache, concurrency: 1 });
    const second = await analyzeStructure({ source: source(), cache, concurrency: 1 });
    expect(first.run.cache).toMatchObject({ enabled: true, hits: 0 });
    expect(second.run.cache).toEqual({ enabled: true, hits: 3, misses: 0 });
    expect(serializeDocument(second.document)).toBe(serializeDocument(first.document));
  });

  it("records run information outside the document", async () => {
    const stages: string[] = [];
    const { run, document } = await analyze({
      source: source(),
      onProgress: (progress) => {
        if (stages.at(-1) !== progress.stage) stages.push(progress.stage);
      },
    });
    expect(stages).toEqual([
      "listing",
      "configuration",
      "discovery",
      "extraction",
      "projects",
      "linking",
    ]);
    expect(Object.keys(run.timings)).toEqual(stages);
    expect(run.workers).toBe(1);
    expect(run.cache.enabled).toBe(false);
    expect("run" in document).toBe(false);
  });

  it("stops when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(analyze({ source: source(), signal: controller.signal })).rejects.toThrow();
  });

  it("returns a graph model over the structure", async () => {
    const { model } = await analyze({ source: source() });
    const files = model.projection({ level: "file" });
    expect(files.dependencies(fileId("src/index.ts"))).toContain(
      fileId("src/orders/order-service.ts"),
    );
  });

  it("keeps entry points that differ only in their package (regression)", async () => {
    const { document } = await analyze({
      source: new InMemorySource({
        files: {
          "package.json": JSON.stringify({
            name: "root",
            private: true,
            workspaces: ["packages/*"],
            bin: { tool: "./packages/cli/bin/tool.js" },
          }),
          "packages/cli/package.json": JSON.stringify({
            name: "@acme/cli",
            bin: { tool: "./bin/tool.js" },
          }),
          "packages/cli/bin/tool.js": "#!/usr/bin/env node\nconsole.log(1);\n",
        },
      }),
    });
    expect(document.entryPoints).toEqual([
      {
        entity: "file:packages/cli/bin/tool.js",
        kind: "bin",
        source: "package.json#bin.tool",
        package: "pkg:npm:",
      },
      {
        entity: "file:packages/cli/bin/tool.js",
        kind: "bin",
        source: "package.json#bin.tool",
        package: "pkg:npm:packages/cli",
      },
    ]);
  });

  it("exports namespace members only with an inner export, through an exported namespace", async () => {
    const { document } = await analyze({
      source: new InMemorySource({
        files: {
          "src/util.ts": [
            "export namespace Util {",
            "  function hidden() {}",
            "  export function shown() { hidden(); }",
            "  namespace Private { export const x = 1; }",
            "}",
            "namespace Local { export const y = 1; }",
            "",
          ].join("\n"),
        },
      }),
    });
    const exported = Object.fromEntries(
      document.symbols.map((symbol) => [symbol.qualifiedName, symbol.exported]),
    );
    expect(exported).toEqual({
      Util: true,
      "Util.hidden": false,
      "Util.shown": true,
      "Util.Private": false,
      "Util.Private.x": false,
      Local: false,
      "Local.y": false,
    });
  });

  it("records imports of excluded files as excluded, without counting or reporting them", async () => {
    const { document } = await analyze({
      source: source({
        "katedrala.config.yaml": "exclude:\n  - src/generated/**\n",
        "src/client.ts": 'import { api } from "./generated/api";\nexport const client = api;\n',
        "src/generated/api.ts": "export const api = 1;\n",
      }),
    });
    expect(importsOf(document, "src/client.ts").map((entry) => entry.resolution)).toEqual([
      { status: "excluded", paths: ["src/generated/api.ts"], method: "relative-path" },
    ]);
    expect(document.files.some((file) => file.path === "src/generated/api.ts")).toBe(false);
    expect(document.repository.stats.unresolvedImports).toBe(0);
    expect(document.repository.stats.unresolvedReferences).toBe(0);
    expect(document.diagnostics).toEqual([]);
    expect(strictSchema(asDocument(document))).toBe(true);
    expect(strictSchema.errors ?? []).toEqual([]);
  });
});

describe("snapshot digests", () => {
  const importEdges = (document: StructureDocument): string[] =>
    document.edges
      .filter((edge) => edge.kind === "imports")
      .map((edge) => `${edge.source} -> ${edge.target}`);

  it("cover project configuration outside the document's files (regression)", async () => {
    const run = (target: string) =>
      analyze({
        source: new InMemorySource({
          files: {
            "katedrala.config.yaml": "include:\n  - src/**\n",
            "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@lib/*": [target] } } }),
            "src/main.ts": 'import { helper } from "@lib/helper";\nexport const y = helper();\n',
            "src/lib/helper.ts": "export function helper() { return 1; }\n",
            "src/other/helper.ts": "export function helper() { return 2; }\n",
          },
        }),
      });
    const a = await run("./src/lib/*");
    const b = await run("./src/other/*");
    expect(importEdges(a.document)).toEqual(["file:src/main.ts -> file:src/lib/helper.ts"]);
    expect(importEdges(b.document)).toEqual(["file:src/main.ts -> file:src/other/helper.ts"]);
    expect(a.document.files.map((file) => file.path)).not.toContain("tsconfig.json");
    expect(b.document.snapshot.contentDigest).toBe(a.document.snapshot.contentDigest);
    expect(b.document.snapshot.analysisDigest).not.toBe(a.document.snapshot.analysisDigest);
    const again = await run("./src/lib/*");
    expect(serializeDocument(again.document)).toBe(serializeDocument(a.document));
  });

  it("cover configuration read above the analysis root", async () => {
    const run = (target: string) =>
      analyze({
        source: new InMemorySource({
          files: {
            "tsconfig.json": JSON.stringify({ extends: "../../tsconfig.base.json" }),
            "src/main.ts": 'import { helper } from "@lib/helper";\nexport const y = helper();\n',
            "src/lib/helper.ts": "export function helper() { return 1; }\n",
            "src/other/helper.ts": "export function helper() { return 2; }\n",
          },
          subdirectory: "packages/api",
          ancestors: {
            "tsconfig.base.json": JSON.stringify({
              compilerOptions: { baseUrl: ".", paths: { "@lib/*": [target] } },
            }),
          },
        }),
      });
    const a = await run("packages/api/src/lib/*");
    const b = await run("packages/api/src/other/*");
    expect(importEdges(a.document)).not.toEqual(importEdges(b.document));
    expect(b.document.snapshot.contentDigest).toBe(a.document.snapshot.contentDigest);
    expect(b.document.snapshot.analysisDigest).not.toBe(a.document.snapshot.analysisDigest);
  });

  it("cover excluded files that resolution still sees", async () => {
    const run = (extra: Readonly<Record<string, string>>) =>
      analyze({
        source: new InMemorySource({
          files: {
            "katedrala.config.yaml": "exclude:\n  - src/config.ts\n",
            "src/main.ts": 'import { config } from "./config";\nexport const y = config;\n',
            "src/config/index.ts": "export const config = 1;\n",
            ...extra,
          },
        }),
      });
    const without = await run({});
    const shadowed = await run({ "src/config.ts": "export const config = 2;\n" });
    expect(serializeDocument(shadowed.document)).not.toBe(serializeDocument(without.document));
    expect(shadowed.document.snapshot.contentDigest).toBe(without.document.snapshot.contentDigest);
    expect(shadowed.document.snapshot.analysisDigest).not.toBe(
      without.document.snapshot.analysisDigest,
    );
  });

  it("leave the analysis digest alone when only the document's files change", async () => {
    const run = (target: string) =>
      analyze({
        source: source({
          "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@x/*": [target] } } }),
        }),
      });
    const a = await run("./src/*");
    const b = await run("./lib/*");
    expect(b.document.snapshot.contentDigest).not.toBe(a.document.snapshot.contentDigest);
    expect(b.document.snapshot.analysisDigest).toBe(a.document.snapshot.analysisDigest);
  });
});

describe("files outside the snapshot", () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), "katedrala-engine-"));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(scratch, { recursive: true, force: true });
  });

  const SERVICE: Readonly<Record<string, string>> = {
    "src/main.ts": 'import { helper } from "./forbidden";\nexport const x = helper();\n',
    "src/forbidden.ts": "export function helper() {\n  return 1;\n}\n",
  };
  const importEdges = (document: StructureDocument): string[] =>
    document.edges
      .filter((edge) => edge.kind === "imports")
      .map((edge) => `${edge.source} -> ${edge.target}`);

  it("never lets the snapshot's own configuration choose the cache location (regression)", async () => {
    const root = join(scratch, "repo");
    const chosen = join(scratch, "outside-cache");
    const userCache = join(scratch, "user-cache");
    // The user's cache location; the caller passes no cache option, as in a plain CLI run.
    vi.stubEnv("KATEDRALA_CACHE_DIR", userCache);
    const repository = new InMemorySource({
      files: { ...SERVICE, "katedrala.config.yaml": "cache:\n  dir: ../outside-cache\n" },
    });
    const warning = {
      code: "configuration-warning",
      severity: "warning",
      message:
        'The setting "cache.dir" is ignored: the cache location is chosen by the user (the cacheDirectory option or KATEDRALA_CACHE_DIR), never by the analyzed repository',
      file: "file:katedrala.config.yaml",
    };
    const first = await analyzeStructure({ root, source: repository, concurrency: 1 });
    expect(existsSync(chosen)).toBe(false);
    expect(await readdir(userCache)).not.toEqual([]);
    expect(first.settings.cache).toEqual({ enabled: true });
    expect(first.document.diagnostics).toEqual([warning]);

    // The repository ships cache entries with valid keys for its own files, with the import removed.
    await cp(userCache, chosen, { recursive: true });
    await rm(userCache, { recursive: true, force: true });
    for (const shard of await readdir(chosen)) {
      for (const name of await readdir(join(chosen, shard))) {
        const file = join(chosen, shard, name);
        const entry = JSON.parse(await readFile(file, "utf8")) as {
          extraction: { imports: unknown[] };
        };
        entry.extraction.imports = [];
        await writeFile(file, JSON.stringify(entry));
      }
    }
    const result = await analyzeStructure({ root, source: repository, concurrency: 1 });
    expect(importEdges(result.document)).toEqual(["file:src/main.ts -> file:src/forbidden.ts"]);
    expect(result.run.cache).toEqual({ enabled: true, hits: 0, misses: 2 });
    expect(serializeDocument(result.document)).toBe(serializeDocument(first.document));
    // The document does not depend on how this run caches.
    const uncached = await analyze({ root, source: repository });
    expect(serializeDocument(uncached.document)).toBe(serializeDocument(result.document));

    // The caller's cacheDirectory option takes precedence over the environment.
    const explicitCache = join(scratch, "explicit-cache");
    const explicit = await analyzeStructure({
      root,
      source: repository,
      cacheDirectory: explicitCache,
      concurrency: 1,
    });
    expect(await readdir(explicitCache)).not.toEqual([]);
    expect(explicit.run.cache).toEqual({ enabled: true, hits: 0, misses: 2 });
  });

  it("honours cache.enabled: false from any configuration and cache.dir from an explicit one", async () => {
    const root = join(scratch, "repo");
    const userCache = join(scratch, "user-cache");
    const disabled = await analyzeStructure({
      root,
      source: new InMemorySource({
        files: { ...SERVICE, "katedrala.config.yaml": "cache:\n  enabled: false\n" },
      }),
      cacheDirectory: userCache,
      concurrency: 1,
    });
    expect(disabled.run.cache.enabled).toBe(false);
    expect(existsSync(userCache)).toBe(false);

    const configPath = join(scratch, "ci", "nested", "katedrala.config.yaml");
    await mkdir(join(scratch, "ci", "nested"), { recursive: true });
    await writeFile(configPath, "cache:\n  dir: ../explicit-cache\n");
    const explicit = await analyzeStructure({
      root,
      source: new InMemorySource({ files: SERVICE }),
      configPath,
      concurrency: 1,
    });
    expect(explicit.run.cache.enabled).toBe(true);
    // Relative to the analysis root, as the configuration schema documents (not to the file).
    expect(await readdir(join(scratch, "explicit-cache"))).not.toEqual([]);
    expect(existsSync(join(scratch, "ci", "explicit-cache"))).toBe(false);
    expect(explicit.document.diagnostics).toEqual([]);
  });

  it("analyzes the working tree at the root when no source is given", async () => {
    const root = join(scratch, "tree");
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "package.json"), '{"name":"tree"}\n');
    for (const [path, text] of Object.entries(SERVICE)) await writeFile(join(root, path), text);
    const { document } = await analyze({ root, useGit: false });
    expect(document.snapshot.kind).toBe("working-tree");
    expect(document.repository.name).toBe("tree");
    expect(document.files.map((file) => file.path)).toEqual([
      "package.json",
      "src/forbidden.ts",
      "src/main.ts",
    ]);
    // The source this call opened is closed again, so the directory can be removed (Windows included).
    await rm(root, { recursive: true });
    expect(existsSync(root)).toBe(false);
  });

  it("reports the symbolic links the source skipped", async () => {
    const inner = new InMemorySource({ files: SERVICE });
    const withLink: SnapshotSource = {
      kind: inner.kind,
      description: inner.description,
      revision: () => inner.revision(),
      subdirectory: () => inner.subdirectory(),
      remote: () => inner.remote(),
      list: () => inner.list(),
      skipped: () => Promise.resolve(["src/link.ts"]),
      read: (path) => inner.read(path),
      readAncestor: (path) => inner.readAncestor(path),
      close: () => inner.close(),
    };
    const { document } = await analyze({ source: withLink });
    expect(document.diagnostics).toEqual([
      {
        code: "symlink-skipped",
        severity: "info",
        message:
          "Not analyzed: src/link.ts is a symbolic link or junction (links are never followed)",
      },
    ]);
    const plain = await analyze({ source: inner });
    // What was skipped is part of what the analysis saw (the analysis digest), not of the content.
    expect(document.snapshot.contentDigest).toBe(plain.document.snapshot.contentDigest);
    expect(document.snapshot.analysisDigest).not.toBe(plain.document.snapshot.analysisDigest);
  });

  it("names an explicit configuration file without its location (regression)", async () => {
    const files = { "src/main.ts": "export const x = 1;\n", "package.json": '{"name":"shop"}' };
    const run = async (directory: string) => {
      await mkdir(directory, { recursive: true });
      const configPath = join(directory, "katedrala.config.yaml");
      await writeFile(configPath, "entry_points:\n  - src/main.ts\n");
      return analyze({
        root: join(scratch, "root"),
        source: new InMemorySource({ files }),
        configPath,
      });
    };
    const a = await run(join(scratch, "ci-a"));
    const b = await run(join(scratch, "ci-b", "nested"));
    expect(a.document.entryPoints).toEqual([
      {
        entity: fileId("src/main.ts"),
        kind: "configuration",
        source: "configuration#entry_points",
      },
    ]);
    expect(serializeDocument(b.document)).toBe(serializeDocument(a.document));
  });
});
