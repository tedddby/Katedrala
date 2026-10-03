import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type {
  FileExtraction,
  LanguageAdapter,
  LanguageAdapterFactory,
  Logger,
  ParseInput,
  SnapshotSource,
} from "@katedrala/plugin-api";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MemoryExtractionCache } from "../cache/cache.js";
import { FileSystemExtractionCache } from "../cache/file-system.js";
import { resolveCoreSettings } from "../config/settings.js";
import { discoverFiles, type DiscoveredFile } from "../discovery/discover.js";
import { InMemorySource, type InMemoryContent } from "../sources/in-memory.js";
import { contentHash } from "../text/text.js";
import { initializeAdapter } from "./adapters.js";
import { extractFiles, type ExtractionOptions, type ExtractionResults } from "./extract.js";
import { generatedMarkerLine, hasGeneratedMarker } from "./generated.js";

// ─── Fake adapters ───────────────────────────────────────────────────────────

/**
 * The "fake" language: a line `fn <name>` declares a function, a line `error` is a syntax error, a file
 * containing `throw` cannot be parsed.
 */
function fakeExtraction(text: string): FileExtraction {
  const extraction: FileExtraction = {
    moduleFormat: "esm",
    syntaxErrors: [],
    symbols: [],
    imports: [],
    exports: [],
    references: [],
    facts: [],
  };
  text.split("\n").forEach((line, index) => {
    if (line.startsWith("fn ")) {
      const name = line.slice(3);
      extraction.symbols.push({
        localName: name,
        name,
        qualifiedName: name,
        kind: "function",
        range: {
          start: { line: index + 1, column: 1 },
          end: { line: index + 1, column: line.length + 1 },
        },
      });
    }
    if (line === "error")
      extraction.syntaxErrors.push({ message: "Unexpected token", line: index + 1, column: 1 });
  });
  return extraction;
}

interface FakeAdapter extends LanguageAdapter<string> {
  /** Paths passed to `parse`, in call order. */
  parsed: string[];
  init: () => Promise<void>;
}

function syncAdapter(overrides: Partial<LanguageAdapter<string>> = {}): FakeAdapter {
  const parsed: string[] = [];
  return {
    id: "fake",
    version: "1.0.0",
    displayName: "Fake",
    languages: [{ id: "fake", displayName: "Fake", extensions: [".fake"] }],
    parsed,
    init: vi.fn(() => Promise.resolve()),
    detect: ({ path }) =>
      path.endsWith(".fake") ? { language: "fake", dialect: "v1" } : undefined,
    parse: (input) => {
      parsed.push(input.path);
      if (input.text.includes("throw")) throw new Error(`cannot parse ${input.path}`);
      return input.text;
    },
    extract: (text) => fakeExtraction(text),
    ...overrides,
  };
}

function asyncAdapter(): FakeAdapter {
  const parsed: string[] = [];
  let delay = 0;
  return {
    id: "afake",
    version: "2.0.0",
    displayName: "Async fake",
    languages: [],
    parsed,
    init: vi.fn(() => Promise.resolve()),
    detect: ({ path }) => (path.endsWith(".afake") ? { language: "afake" } : undefined),
    parse: async (input) => {
      parsed.push(input.path);
      // Complete in a scrambled order.
      await new Promise((resolve) => setTimeout(resolve, (delay++ * 7) % 4));
      if (input.text.includes("throw")) throw new Error(`cannot parse ${input.path}`);
      return input.text;
    },
    extract: (text) => Promise.resolve(fakeExtraction(text)),
  };
}

function recordingLogger(): Logger & { warnings: string[] } {
  const warnings: string[] = [];
  return {
    warnings,
    debug: () => undefined,
    info: () => undefined,
    warn: (message) => {
      warnings.push(message);
    },
    error: (message) => {
      warnings.push(message);
    },
  };
}

async function discover(
  source: SnapshotSource,
  adapters: readonly LanguageAdapter[],
  maxFileSize = 1000,
): Promise<DiscoveredFile[]> {
  return discoverFiles(
    await source.list(),
    resolveCoreSettings({ analysis: { max_file_size: maxFileSize } }),
    adapters,
  );
}

async function run(
  files: Record<string, InMemoryContent>,
  adapters: readonly LanguageAdapter[],
  options: ExtractionOptions = {},
): Promise<ExtractionResults> {
  const source = new InMemorySource({ files });
  return extractFiles(source, await discover(source, adapters), adapters, {
    concurrency: 1,
    maxFileSize: 1000,
    ...options,
  });
}

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

// ─── In-process extraction ───────────────────────────────────────────────────

describe("extractFiles", () => {
  it("parses claimed files and reads unclaimed text files", async () => {
    const fake = syncAdapter();
    const afake = asyncAdapter();
    const result = await run(
      {
        "src/a.fake": "fn alpha\r\nfn beta\r\n",
        "src/b.afake": "fn gamma",
        "README.md": "# Title\n\nText\n",
        "logo.png": PNG,
        "notes.txt": "x".repeat(2000),
        "data.bin": "\u0000binary",
      },
      [fake, afake],
    );
    expect(result.results).toEqual([
      {
        path: "README.md",
        status: "unsupported",
        lines: 3,
        hash: contentHash("# Title\n\nText\n"),
      },
      { path: "data.bin", status: "unsupported" },
      { path: "logo.png", status: "unsupported" },
      { path: "notes.txt", status: "unsupported" },
      {
        path: "src/a.fake",
        status: "parsed",
        lines: 2,
        hash: contentHash("fn alpha\nfn beta\n"),
        extraction: fakeExtraction("fn alpha\nfn beta\n"),
        adapter: { id: "fake", version: "1.0.0" },
      },
      {
        path: "src/b.afake",
        status: "parsed",
        lines: 1,
        hash: contentHash("fn gamma"),
        extraction: fakeExtraction("fn gamma"),
        adapter: { id: "afake", version: "2.0.0" },
      },
    ]);
    expect(result.diagnostics).toEqual([]);
    expect(result.stats).toEqual({ files: 6, cacheHits: 0, cacheMisses: 0, parsed: 2, workers: 0 });
    expect(fake.init).toHaveBeenCalledTimes(1);
    expect(afake.init).toHaveBeenCalledTimes(1);
  });

  it("marks files with syntax errors as partial", async () => {
    const result = await run({ "a.fake": "fn a\nerror\n" }, [syncAdapter()]);
    expect(result.results[0]).toMatchObject({ status: "partial", lines: 2 });
    expect(result.results[0]?.extraction?.syntaxErrors).toHaveLength(1);
  });

  it("fails only the file whose adapter throws", async () => {
    const result = await run(
      { "a.fake": "fn a", "b.fake": "throw", "c.afake": "throw", "d.afake": "fn d" },
      [syncAdapter(), asyncAdapter()],
    );
    expect(result.results.map((outcome) => [outcome.path, outcome.status, outcome.reason])).toEqual(
      [
        ["a.fake", "parsed", undefined],
        ["b.fake", "failed", "cannot parse b.fake"],
        ["c.afake", "failed", "cannot parse c.afake"],
        ["d.afake", "parsed", undefined],
      ],
    );
    expect(result.results[1]).toMatchObject({
      adapter: { id: "fake" },
      lines: 1,
      hash: contentHash("throw"),
    });
    expect(result.diagnostics).toEqual([
      {
        code: "parse-failed",
        severity: "error",
        message: "The fake adapter failed: cannot parse b.fake",
        file: "file:b.fake",
      },
      {
        code: "parse-failed",
        severity: "error",
        message: "The afake adapter failed: cannot parse c.afake",
        file: "file:c.afake",
      },
    ]);
  });

  it("returns extractions in their JSON form, so cached and fresh results are identical", async () => {
    const quirky = syncAdapter({
      extract: (text) => {
        const extraction = fakeExtraction(text);
        extraction.facts.push({
          type: "x-quirk",
          line: 1,
          column: 1,
          attributes: { kept: "yes", dropped: undefined as unknown as string },
        });
        extraction.references.push({
          kind: "call",
          target: { type: "name", name: "listen", members: [] },
          typeOnly: false,
          line: 1,
          column: 1,
          arguments: [
            { type: "number", value: Number.NaN },
            { type: "number", value: -0 },
            { type: "number", value: Infinity },
          ],
        });
        return extraction;
      },
    });
    const cache = new MemoryExtractionCache();
    const cold = await run({ "a.fake": "fn a" }, [quirky], { cache });
    const warm = await run({ "a.fake": "fn a" }, [quirky], { cache });
    const uncached = await run({ "a.fake": "fn a" }, [quirky]);
    expect(warm.stats.cacheHits).toBe(1);
    expect(warm.results).toEqual(cold.results);
    expect(uncached.results).toEqual(cold.results);
    const extraction = cold.results[0]?.extraction;
    expect(extraction?.facts[0]?.attributes).toEqual({ kept: "yes" });
    // `toEqual` distinguishes -0 from 0 (Object.is), so this also checks that -0 became 0.
    expect(extraction?.references[0]?.arguments).toEqual([
      { type: "number", value: null },
      { type: "number", value: 0 },
      { type: "number", value: null },
    ]);
  });

  it("fails files whose extraction JSON cannot represent", async () => {
    const cyclic = syncAdapter({
      extract: (text) => {
        const extraction = fakeExtraction(text) as FileExtraction & { self?: unknown };
        extraction.self = extraction;
        return extraction;
      },
    });
    const result = await run({ "a.fake": "fn a" }, [cyclic]);
    expect(result.results[0]).toMatchObject({ status: "failed", adapter: { id: "fake" } });
    expect(result.results[0]?.reason).toMatch(/^The extraction is not representable as JSON/);
    expect(result.diagnostics[0]?.code).toBe("parse-failed");
  });

  it("handles an empty file list", async () => {
    const source = new InMemorySource({ files: {} });
    expect(await extractFiles(source, [], [syncAdapter()])).toEqual({
      results: [],
      diagnostics: [],
      stats: { files: 0, cacheHits: 0, cacheMisses: 0, parsed: 0, workers: 0 },
    });
  });

  it("fails files whose adapter returns an invalid extraction", async () => {
    const adapter = syncAdapter({ extract: () => ({}) as FileExtraction });
    const result = await run({ "a.fake": "fn a" }, [adapter]);
    expect(result.results[0]).toMatchObject({
      status: "failed",
      reason: 'Adapter "fake" returned an invalid extraction',
    });
  });

  it("skips generated files by their header comment without parsing them, and says so", async () => {
    const fake = syncAdapter();
    const infos: Array<[string, Readonly<Record<string, unknown>> | undefined]> = [];
    const logger: Logger = {
      ...recordingLogger(),
      info: (message, data) => {
        infos.push([message, data]);
      },
    };
    const result = await run(
      {
        "gen.fake": "// Code generated by protoc-gen-fake. DO NOT EDIT.\nfn x\n",
        "facebook.fake": "/**\n * @generated SignedSource<<abc>>\n */\nfn y\n",
        "late.fake": `${"fn pad\n".repeat(10)}// @generated\n`,
        // A hand-written generator holding its banner in a string, and a maintenance comment.
        "scripts/gen-icons.fake": [
          "fn render",
          "",
          'const BANNER = "// Code generated by gen-icons. DO NOT EDIT.";',
        ].join("\n"),
        "src/routes.fake":
          "// Do not edit the order of these routes without updating the router tests.\nfn routes\n",
      },
      [fake],
      { logger },
    );
    expect(
      result.results.map((outcome) => [
        outcome.path,
        outcome.status,
        outcome.reason,
        outcome.generated,
      ]),
    ).toEqual([
      ["facebook.fake", "skipped", "generated", true],
      ["gen.fake", "skipped", "generated", true],
      ["late.fake", "parsed", undefined, undefined],
      ["scripts/gen-icons.fake", "parsed", undefined, undefined],
      ["src/routes.fake", "parsed", undefined, undefined],
    ]);
    expect(result.results[1]).toMatchObject({
      lines: 2,
      hash: expect.stringMatching(/^sha256:/) as string,
    });
    expect(fake.parsed).toEqual(["late.fake", "scripts/gen-icons.fake", "src/routes.fake"]);
    expect(infos).toEqual([
      [
        expect.stringContaining("a header comment marks these files as generated code") as string,
        { count: 2, files: ["facebook.fake:2", "gen.fake:1"] },
      ],
    ]);
  });

  it("follows discovery's skip reasons and does not read files that are too large", async () => {
    const fake = syncAdapter();
    const source = new InMemorySource({
      files: {
        "src/big.fake": `fn big\n${"x".repeat(2000)}`,
        "vendor/lib.fake": "fn vendored\n",
        "src/generated/api.fake": "fn generated\n",
        "src/ok.fake": "fn ok\n",
      },
    });
    const read = vi.spyOn(source, "read");
    const files = await discover(source, [fake]);
    const result = await extractFiles(source, files, [fake], { concurrency: 1 });
    expect(result.results.map((outcome) => [outcome.path, outcome.status, outcome.reason])).toEqual(
      [
        ["src/big.fake", "skipped", "file-too-large"],
        ["src/generated/api.fake", "skipped", "generated"],
        ["src/ok.fake", "parsed", undefined],
        ["vendor/lib.fake", "skipped", "vendored"],
      ],
    );
    expect(result.results[0]?.lines).toBeUndefined();
    expect(result.results[1]).toMatchObject({ generated: true, lines: 1 });
    expect(result.results[3]).toMatchObject({ lines: 1, hash: contentHash("fn vendored\n") });
    expect(read.mock.calls.map(([path]) => path)).not.toContain("src/big.fake");
    expect(fake.parsed).toEqual(["src/ok.fake"]);
    expect(result.diagnostics).toEqual([
      {
        code: "file-too-large",
        severity: "warning",
        message: "Not parsed: the file has 2007 bytes, more than the maximum file size",
        file: "file:src/big.fake",
      },
    ]);
  });

  it("skips binary files an adapter claims", async () => {
    const result = await run({ "image.fake": PNG }, [syncAdapter()]);
    expect(result.results).toEqual([{ path: "image.fake", status: "skipped", reason: "binary" }]);
  });

  it("reports read failures", async () => {
    const inner = new InMemorySource({
      files: { "a.fake": "fn a", "b.fake": "fn b", "c.txt": "text" },
    });
    const source: SnapshotSource = {
      kind: inner.kind,
      description: inner.description,
      revision: () => inner.revision(),
      subdirectory: () => inner.subdirectory(),
      remote: () => inner.remote(),
      list: () => inner.list(),
      skipped: () => inner.skipped(),
      read: (path) =>
        path === "a.fake" ? inner.read(path) : Promise.reject(new Error("EACCES: denied")),
      readAncestor: (path) => inner.readAncestor(path),
      close: () => inner.close(),
    };
    const adapters = [syncAdapter()];
    const result = await extractFiles(source, await discover(inner, adapters), adapters, {
      concurrency: 1,
    });
    expect(result.results).toEqual([
      expect.objectContaining({ path: "a.fake", status: "parsed" }) as unknown,
      { path: "b.fake", status: "failed", reason: "Cannot read the file: EACCES: denied" },
      { path: "c.txt", status: "unsupported", reason: "Cannot read the file: EACCES: denied" },
    ]);
    expect(
      result.diagnostics.map((diagnostic) => [
        diagnostic.code,
        diagnostic.severity,
        diagnostic.file,
      ]),
    ).toEqual([
      ["read-failed", "error", "file:b.fake"],
      ["read-failed", "warning", "file:c.txt"],
    ]);
  });

  it("serves unchanged files from the cache without calling the adapter", async () => {
    const cache = new MemoryExtractionCache();
    const files = {
      "a.fake": "fn a\n",
      "b.fake": "fn b\nerror\n",
      "c.afake": "fn c",
      "d.txt": "text",
    };
    const first = await run(files, [syncAdapter(), asyncAdapter()], { cache });
    expect(first.stats).toMatchObject({ cacheHits: 0, cacheMisses: 3, parsed: 3 });
    expect(cache.size).toBe(3);

    const fake = syncAdapter();
    const afake = asyncAdapter();
    const second = await run(files, [fake, afake], { cache });
    expect(second.stats).toMatchObject({ cacheHits: 3, cacheMisses: 0, parsed: 0 });
    expect(fake.parsed).toEqual([]);
    expect(afake.parsed).toEqual([]);
    expect(second.results).toEqual(first.results);

    // A changed file, a new adapter version or a new dialect are misses.
    const changed = await run({ ...files, "a.fake": "fn a2\n" }, [syncAdapter(), asyncAdapter()], {
      cache,
    });
    expect(changed.stats).toMatchObject({ cacheHits: 2, cacheMisses: 1 });
    const upgraded = await run(files, [syncAdapter({ version: "1.0.1" }), asyncAdapter()], {
      cache,
    });
    expect(upgraded.stats).toMatchObject({ cacheHits: 1, cacheMisses: 2 });
    const withOptions = await run(
      files,
      [syncAdapter({ options: { strict: true } }), asyncAdapter()],
      { cache },
    );
    expect(withOptions.stats).toMatchObject({ cacheHits: 1, cacheMisses: 2 });
  });

  it("persists extractions in a file-system cache across runs", async () => {
    const directory = await mkdtemp(join(tmpdir(), "katedrala-core-extract-cache-"));
    try {
      const files = { "a.fake": "fn a\n", "b.fake": "fn b\n" };
      const first = await run(files, [syncAdapter()], {
        cache: new FileSystemExtractionCache(directory),
      });
      const fake = syncAdapter();
      const second = await run(files, [fake], { cache: new FileSystemExtractionCache(directory) });
      expect(second.stats.cacheHits).toBe(2);
      expect(fake.parsed).toEqual([]);
      expect(second.results).toEqual(first.results);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("initializes an adapter once, shared with other users of the adapter", async () => {
    const fake = syncAdapter();
    await run({ "a.fake": "fn a" }, [fake]);
    await run({ "b.fake": "fn b" }, [fake]);
    await initializeAdapter(fake);
    expect(fake.init).toHaveBeenCalledTimes(1);
  });

  it("fails the files of an adapter that cannot be initialized, with one diagnostic", async () => {
    const broken = syncAdapter({ init: () => Promise.reject(new Error("grammar missing")) });
    const result = await run({ "a.fake": "fn a", "b.fake": "fn b", "c.md": "# c" }, [broken]);
    expect(result.results.map((outcome) => [outcome.path, outcome.status, outcome.reason])).toEqual(
      [
        ["a.fake", "failed", 'Adapter "fake" could not be initialized: grammar missing'],
        ["b.fake", "failed", 'Adapter "fake" could not be initialized: grammar missing'],
        ["c.md", "unsupported", undefined],
      ],
    );
    expect(result.results[0]?.adapter).toBeUndefined();
    expect(result.diagnostics).toEqual([
      {
        code: "plugin-error",
        severity: "error",
        message: 'Adapter "fake" could not be initialized: grammar missing',
      },
    ]);
  });

  it("uses extractBatch and falls back to single files when a batch fails", async () => {
    const batches: number[] = [];
    let rejectedBatches = 0;
    const batching = syncAdapter({
      // A slow initialization lets every job queue up before the first batch runs.
      init: () => new Promise((resolve) => setTimeout(resolve, 20)),
      extractBatch: (inputs: readonly ParseInput[]) => {
        batches.push(inputs.length);
        if (inputs.some((input) => input.text.includes("throw"))) {
          rejectedBatches++;
          return Promise.reject(new Error("batch failed"));
        }
        return Promise.resolve(inputs.map((input) => fakeExtraction(input.text)));
      },
    });
    const files = Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => [
        `f${String(index).padStart(2, "0")}.fake`,
        `fn f${index}`,
      ]),
    );
    const result = await run({ ...files, "z.fake": "throw" }, [batching]);
    expect(batches).toEqual([32, 9]);
    expect(rejectedBatches).toBe(1);
    expect(batching.parsed).toContain("z.fake");
    expect(result.results.filter((outcome) => outcome.status === "parsed")).toHaveLength(40);
    expect(result.results.at(-1)).toMatchObject({
      path: "z.fake",
      status: "failed",
      reason: "cannot parse z.fake",
    });
  });

  it("reports progress once per file", async () => {
    const progress: Array<[number, number, string]> = [];
    const result = await run({ "a.fake": "fn a", "b.txt": "b", "c.png": PNG }, [syncAdapter()], {
      onProgress: ({ completed, total, path }) => {
        progress.push([completed, total, path]);
      },
    });
    expect(progress.map(([completed]) => completed)).toEqual([1, 2, 3]);
    expect(progress.every(([, total]) => total === 3)).toBe(true);
    expect(progress.map(([, , path]) => path).sort()).toEqual(
      result.results.map((outcome) => outcome.path),
    );
  });

  it("survives a throwing progress callback", async () => {
    const logger = recordingLogger();
    const result = await run({ "a.fake": "fn a" }, [syncAdapter()], {
      logger,
      onProgress: () => {
        throw new Error("UI gone");
      },
    });
    expect(result.results[0]?.status).toBe("parsed");
    expect(logger.warnings).toContain("An extraction progress callback failed");
  });

  it("does not depend on input order or completion order", async () => {
    const source = new InMemorySource({
      files: Object.fromEntries(
        Array.from({ length: 30 }, (_, index) => [
          `src/m${index}.${index % 2 === 0 ? "fake" : "afake"}`,
          index % 7 === 0 ? "throw" : `fn m${index}\n${index % 5 === 0 ? "error\n" : ""}`,
        ]),
      ),
    });
    const files = await discover(source, [syncAdapter(), asyncAdapter()]);
    const reference = await extractFiles(source, files, [syncAdapter(), asyncAdapter()], {
      concurrency: 1,
    });
    await fc.assert(
      fc.asyncProperty(
        fc.shuffledSubarray(files, { minLength: files.length }),
        async (shuffled) => {
          const result = await extractFiles(source, shuffled, [syncAdapter(), asyncAdapter()], {
            concurrency: 1,
          });
          expect(result.results).toEqual(reference.results);
          expect(result.diagnostics).toEqual(reference.diagnostics);
        },
      ),
      { numRuns: 10 },
    );
  });

  it("rejects inconsistent input", async () => {
    const source = new InMemorySource({ files: { "a.fake": "fn a" } });
    const files = await discover(source, [syncAdapter()]);
    await expect(extractFiles(source, [...files, ...files], [syncAdapter()])).rejects.toThrow(
      TypeError,
    );
    await expect(extractFiles(source, files, [])).rejects.toThrow(/No adapter with id "fake"/);
    await expect(extractFiles(source, files, [syncAdapter(), syncAdapter()])).rejects.toThrow(
      TypeError,
    );
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const source = new InMemorySource({ files: { "a.fake": "fn a" } });
    const read = vi.spyOn(source, "read");
    const files = await discover(source, [syncAdapter()]);
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    await expect(
      extractFiles(source, files, [syncAdapter()], { signal: controller.signal }),
    ).rejects.toThrow("cancelled");
    expect(read).not.toHaveBeenCalled();
  });

  it("stops and rejects with the signal's reason when aborted during extraction", async () => {
    const controller = new AbortController();
    let parsedCount = 0;
    const aborting = syncAdapter({
      parse: (input) => {
        if (++parsedCount === 3) controller.abort(new Error("user cancelled"));
        return input.text;
      },
    });
    const files = Object.fromEntries(
      Array.from({ length: 50 }, (_, index) => [`f${index}.fake`, `fn f${index}`]),
    );
    await expect(run(files, [aborting], { signal: controller.signal })).rejects.toThrow(
      "user cancelled",
    );
    expect(parsedCount).toBeLessThan(50);
  });
});

describe("generatedMarkerLine", () => {
  it.each([
    // Conventions of generators, in the header comment.
    ["// Code generated by mockgen. DO NOT EDIT.\npackage x", 1],
    [
      "// Copyright 2024 Acme\n\n//go:build linux\n\n// Code generated by cgo; DO NOT EDIT.\npackage x",
      5,
    ],
    ["/* @generated */", 1],
    ["/**\n * @generated SignedSource<<abc>>\n */\nexport {};", 2],
    ["# This file is automatically @generated by Cargo.\nversion = 3", 1],
    ["// <auto-generated>\n//     This code was generated by a tool.\n// </auto-generated>", 1],
    ["# -*- coding: utf-8 -*-\n# Generated by the protocol buffer compiler.  DO NOT EDIT!", 2],
    ["<?php\n# Generated by the protocol buffer compiler.  DO NOT EDIT!\nnamespace A;", 2],
    ["#!/usr/bin/env node\n// Code generated by x. DO NOT EDIT.\nmain();", 2],
    ["// GENERATED CODE - DO NOT MODIFY BY HAND\npart of 'a.dart';", 1],
    ["/* AUTO-GENERATED FILE. DO NOT MODIFY.\n *\n * This class was generated by aapt.\n */", 1],
    ["/* !!! This is code generated by Prisma. Do not edit directly. !!! */\nexport {};", 1],
    [
      "/**\n * This file was auto-generated by openapi-typescript.\n * Do not make direct changes to the file.\n */",
      2,
    ],
    [
      "/**\n * Generated by orval v6.25.0\n * Do not edit manually.\n */\nimport axios from 'axios';",
      2,
    ],
    ["/*\n  Code generated by X. DO NOT EDIT.\n*/\nexport {};", 2],
    ["-- Code generated by sqlc. DO NOT EDIT.\nSELECT 1;", 1],
    ["// DO NOT EDIT. This file is generated by tools/gen.ts.\nexport const a = 1;", 1],
    ["// NOTE: This file is generated; do not modify.", 1],
    [`${"\n".repeat(9)}// @generated`, 10],
    // Hand-written files: string literals, code before the comment, ordinary maintenance comments.
    [
      'import fs from "node:fs";\n\nconst BANNER = "// Code generated by gen-icons. DO NOT EDIT.";',
      undefined,
    ],
    [
      "import { x } from './x';\nconst HEADER = `\n// Code generated by gen-icons. DO NOT EDIT.\n`;",
      undefined,
    ],
    ["export const a = 1;\n// Code generated by x. DO NOT EDIT.", undefined],
    ['#define BANNER "// Code generated by x. DO NOT EDIT."', undefined],
    ["// Do not edit the order of these routes without updating the router tests.", undefined],
    ["// Each output starts with: // Code generated by gen-icons. DO NOT EDIT.", undefined],
    [
      "// Generated code lives in ./gen and must not be edited by hand.\nexport * from './gen';",
      undefined,
    ],
    ["// Generated files live in src/gen.\n// Do not edit the order of the exports.", undefined],
    ["/**\n * Strips the `@generated` header. Do not edit the regex below.\n */", undefined],
    ["// Do not edit - see the generated docs in docs/api.", undefined],
    [
      "# Generated by Django 4.2.1 on 2023-05-01 12:00\n\nfrom django.db import migrations",
      undefined,
    ],
    // A bare "auto-generated" or "do not edit" is not a marker.
    ["# This file is AUTO-GENERATED by tool\n", undefined],
    ["// do not edit: produced by build", undefined],
    ["// autogenerated\n", undefined],
    ["export const generated = true;\n", undefined],
    [`${"\n".repeat(10)}// @generated`, undefined],
    ["", undefined],
  ])("finds the marker of %j on line %s", (text, expected) => {
    expect(generatedMarkerLine(text)).toBe(expected);
    expect(hasGeneratedMarker(text)).toBe(expected !== undefined);
  });
});

// ─── Worker threads ──────────────────────────────────────────────────────────

/** A worker module implementing the fake language (plain JavaScript, loadable in worker threads). */
const WORKER_MODULE = `
import { isMainThread } from "node:worker_threads";
function extract(text) {
  const extraction = { moduleFormat: "esm", syntaxErrors: [], symbols: [], imports: [], exports: [], references: [], facts: [] };
  text.split("\\n").forEach((line, index) => {
    if (line.startsWith("fn ")) {
      const name = line.slice(3);
      extraction.symbols.push({ localName: name, name, qualifiedName: name, kind: "function",
        range: { start: { line: index + 1, column: 1 }, end: { line: index + 1, column: line.length + 1 } } });
    }
    if (line === "error") extraction.syntaxErrors.push({ message: "Unexpected token", line: index + 1, column: 1 });
  });
  return extraction;
}
export async function createAdapter(options) {
  await new Promise((resolve) => setTimeout(resolve, 1));
  return {
    id: "wfake", version: "1.0.0", displayName: "Worker fake", languages: [], options,
    detect: ({ path }) => (path.endsWith(".fake") ? { language: "fake", dialect: "v1" } : undefined),
    parse(input) {
      if (input.text.includes("throw")) throw new Error("cannot parse " + input.path);
      if (input.text.includes("crash")) {
        if (!isMainThread) process.exit(3);
        throw new Error("crash requested");
      }
      return input.text;
    },
    extract: (text) => extract(text),
  };
}
`;

describe("extractFiles with worker threads", () => {
  let scratch = "";
  let moduleUrl = "";

  beforeAll(async () => {
    scratch = await mkdtemp(join(tmpdir(), "katedrala-core-workers-"));
    const modulePath = join(scratch, "fake-adapter.mjs");
    await writeFile(modulePath, WORKER_MODULE);
    moduleUrl = pathToFileURL(modulePath).href;
  });

  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  /** The main-thread adapter, created by the same factory the workers use. */
  async function workerAdapter(workerModule = moduleUrl): Promise<LanguageAdapter> {
    const module = (await import(moduleUrl)) as { createAdapter: LanguageAdapterFactory };
    const adapter = await module.createAdapter({ flavour: "test" });
    return { ...adapter, workerModule };
  }

  const manyFiles = (
    count: number,
    extra: Record<string, string> = {},
  ): Record<string, string> => ({
    ...Object.fromEntries(
      Array.from({ length: count }, (_, index) => [
        `src/f${String(index).padStart(3, "0")}.fake`,
        `fn f${index}\n${index % 9 === 0 ? "error\n" : ""}${index % 13 === 0 ? "fn more\n" : ""}`,
      ]),
    ),
    "README.md": "# Workers\n",
    ...extra,
  });

  async function runWith(
    files: Record<string, string>,
    adapter: LanguageAdapter,
    options: ExtractionOptions,
  ): Promise<ExtractionResults> {
    const source = new InMemorySource({ files });
    return extractFiles(source, await discover(source, [adapter]), [adapter], options);
  }

  it("parses small workloads in the main thread even with concurrency", async () => {
    const result = await runWith(manyFiles(20), await workerAdapter(), { concurrency: 4 });
    expect(result.stats.workers).toBe(0);
    expect(result.results.filter((outcome) => outcome.extraction !== undefined)).toHaveLength(20);
  });

  it("reports a failed initialization once for jobs held back for workers", async () => {
    const adapter: LanguageAdapter = {
      ...(await workerAdapter()),
      init: () => Promise.reject(new Error("no grammar")),
    };
    const result = await runWith(manyFiles(10), adapter, { concurrency: 4 });
    const failed = result.results.filter((outcome) => outcome.status === "failed");
    expect(failed).toHaveLength(10);
    expect(failed[0]?.reason).toBe('Adapter "wfake" could not be initialized: no grammar');
    expect(result.diagnostics).toEqual([
      {
        code: "plugin-error",
        severity: "error",
        message: 'Adapter "wfake" could not be initialized: no grammar',
      },
    ]);
  });

  it("falls back to the main thread when workers cannot start", async () => {
    const logger = recordingLogger();
    const files = manyFiles(100);
    const adapter = await workerAdapter();
    const reference = await runWith(files, adapter, { concurrency: 1 });
    const result = await runWith(files, adapter, {
      concurrency: 3,
      logger,
      workerUrl: pathToFileURL(join(scratch, "missing-entry.js")),
    });
    expect(result.results).toEqual(reference.results);
    expect(result.diagnostics).toEqual(reference.diagnostics);
    expect(result.stats.workers).toBe(0);
    expect(logger.warnings).toContain(
      "Extraction workers cannot be started; parsing in the main thread",
    );
  });

  const sourceEntry = new URL("./worker-entry.ts", import.meta.url);
  const builtEntry = new URL("../../dist/extraction/worker-entry.js", import.meta.url);

  describe.each([
    // Node strips types natively (Node >= 22.18 / 23.6), so the TypeScript entry can run as is.
    ["source entry (type stripping)", sourceEntry, process.features.typescript !== false],
    ["built entry", builtEntry, existsSync(fileURLToPath(builtEntry))],
  ])("%s", (_name, workerUrl, available) => {
    it.runIf(available)("produces the same results as the main thread", async () => {
      const logger = recordingLogger();
      const files = manyFiles(150, { "src/bad.fake": "throw" });
      const adapter = await workerAdapter();
      const reference = await runWith(files, adapter, { concurrency: 1 });
      const result = await runWith(files, adapter, { concurrency: 3, workerUrl, logger });
      expect(result.stats.workers).toBeGreaterThan(0);
      expect(result.stats.workers).toBeLessThanOrEqual(3);
      expect(logger.warnings).toEqual([]);
      expect(result.results).toEqual(reference.results);
      expect(result.diagnostics).toEqual(reference.diagnostics);
      expect(result.results.find((outcome) => outcome.path === "src/bad.fake")).toMatchObject({
        status: "failed",
        reason: "cannot parse src/bad.fake",
      });
    });

    it.runIf(available)("isolates a file that crashes its worker", async () => {
      const logger = recordingLogger();
      const files = manyFiles(90, { "src/crash.fake": "crash" });
      const result = await runWith(files, await workerAdapter(), {
        concurrency: 2,
        workerUrl,
        logger,
      });
      const crashed = result.results.find((outcome) => outcome.path === "src/crash.fake");
      expect(crashed).toMatchObject({ status: "failed" });
      expect(crashed?.reason).toMatch(/stopped unexpectedly/);
      expect(result.results.filter((outcome) => outcome.extraction !== undefined)).toHaveLength(90);
      expect(logger.warnings).toContain("An extraction worker stopped unexpectedly");
    });

    it.runIf(available)(
      "fails exactly the files that crash a worker, whatever the worker count",
      async () => {
        // Several crashing files, so that worker replacements used to run out and fail the files that
        // merely shared a batch with them (which ones depended on the worker count).
        const crashing = [5, 45, 85, 125, 165, 205].map(
          (index) => `src/f${String(index).padStart(3, "0")}.fake`,
        );
        const files = manyFiles(240);
        for (const path of crashing) files[path] = "crash";
        const adapter = await workerAdapter();
        const reference = await runWith(files, adapter, { concurrency: 1 });
        for (const concurrency of [2, 3]) {
          const result = await runWith(files, adapter, { concurrency, workerUrl });
          const failed = result.results.filter((outcome) => outcome.status === "failed");
          expect(failed.map((outcome) => outcome.path)).toEqual(crashing);
          for (const outcome of failed) expect(outcome.reason).toMatch(/stopped unexpectedly/);
          expect(result.results.filter((outcome) => !crashing.includes(outcome.path))).toEqual(
            reference.results.filter((outcome) => !crashing.includes(outcome.path)),
          );
        }
      },
    );

    it.runIf(available)("parses in the main thread when workers crash on every file", async () => {
      const logger = recordingLogger();
      const files = Object.fromEntries(
        Array.from({ length: 100 }, (_, index) => [
          `src/c${String(index).padStart(3, "0")}.fake`,
          "crash",
        ]),
      );
      const result = await runWith(files, await workerAdapter(), {
        concurrency: 2,
        workerUrl,
        logger,
      });
      // The worker module's parse throws in the main thread instead of exiting.
      expect(result.results.map((outcome) => outcome.reason)).toEqual(
        Array.from({ length: 100 }, () => "crash requested"),
      );
      expect(logger.warnings).toContain(
        "Extraction workers keep stopping; parsing the remaining files in the main thread",
      );
      expect(
        logger.warnings.filter((warning) => warning === "An extraction worker stopped unexpectedly")
          .length,
      ).toBeLessThanOrEqual(16);
    });

    it.runIf(available)(
      "parses in the main thread when an adapter cannot load in workers",
      async () => {
        const logger = recordingLogger();
        const files = manyFiles(80);
        const adapter = await workerAdapter(
          pathToFileURL(join(scratch, "missing-adapter.mjs")).href,
        );
        const reference = await runWith(files, adapter, { concurrency: 1 });
        const result = await runWith(files, adapter, { concurrency: 2, workerUrl, logger });
        expect(result.results).toEqual(reference.results);
        expect(logger.warnings).toContain(
          "An adapter cannot be loaded in worker threads; parsing in the main thread",
        );
      },
    );

    it.runIf(available)("stops workers when aborted", async () => {
      const controller = new AbortController();
      const files = manyFiles(200);
      const promise = runWith(files, await workerAdapter(), {
        concurrency: 2,
        workerUrl,
        signal: controller.signal,
        onProgress: ({ completed }) => {
          if (completed === 100) controller.abort(new Error("enough"));
        },
      });
      await expect(promise).rejects.toThrow("enough");
    });
  });
});
