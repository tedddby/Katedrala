import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix, win32 } from "node:path";
import type { FileExtraction, Logger } from "@katedrala/plugin-api";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MemoryExtractionCache, isFileExtraction } from "./cache.js";
import { defaultCacheDirectory } from "./directory.js";
import { FileSystemExtractionCache } from "./file-system.js";
import {
  CACHE_FORMAT_VERSION,
  adapterOptionsDigest,
  extractionCacheKey,
  type ExtractionCacheKeyInput,
} from "./key.js";

function extraction(name: string): FileExtraction {
  return {
    moduleFormat: "esm",
    syntaxErrors: [],
    symbols: [
      {
        localName: name,
        name,
        qualifiedName: name,
        kind: "function",
        range: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } },
      },
    ],
    imports: [],
    exports: [
      {
        name,
        targets: [{ type: "symbol", localName: name, members: [] }],
        typeOnly: false,
        line: 1,
        column: 1,
      },
    ],
    references: [],
    facts: [],
  };
}

function recordingLogger(): Logger & { messages: string[] } {
  const messages: string[] = [];
  const record = (message: string): void => {
    messages.push(message);
  };
  return { messages, debug: record, info: record, warn: record, error: record };
}

const BASE_KEY: ExtractionCacheKeyInput = {
  adapterId: "typescript",
  adapterVersion: "1.2.3",
  optionsDigest: adapterOptionsDigest({ recordUntypedCalls: true }),
  path: "src/index.ts",
  language: "typescript",
  dialect: "ts",
  contentHash: `sha256:${"0".repeat(64)}`,
};

describe("extractionCacheKey", () => {
  it("is a deterministic 64-digit hex digest", () => {
    expect(extractionCacheKey(BASE_KEY)).toMatch(/^[0-9a-f]{64}$/);
    expect(extractionCacheKey({ ...BASE_KEY })).toBe(extractionCacheKey(BASE_KEY));
    expect(CACHE_FORMAT_VERSION).toBe(1);
  });

  it("changes with every component", () => {
    const base = extractionCacheKey(BASE_KEY);
    const variants: ExtractionCacheKeyInput[] = [
      { ...BASE_KEY, adapterId: "javascript" },
      { ...BASE_KEY, adapterVersion: "1.2.4" },
      { ...BASE_KEY, optionsDigest: adapterOptionsDigest({ recordUntypedCalls: false }) },
      { ...BASE_KEY, path: "src/index2.ts" },
      { ...BASE_KEY, language: "javascript" },
      { ...BASE_KEY, dialect: "tsx" },
      { ...BASE_KEY, dialect: "" },
      { ...BASE_KEY, dialect: undefined },
      { ...BASE_KEY, contentHash: `sha256:${"1".repeat(64)}` },
    ];
    const keys = variants.map(extractionCacheKey);
    expect(new Set([base, ...keys]).size).toBe(variants.length + 1);
  });

  it("separates components unambiguously", () => {
    const component = fc.string({ maxLength: 6 });
    fc.assert(
      fc.property(
        fc.record({
          adapterId: component,
          adapterVersion: component,
          path: component,
          language: component,
        }),
        fc.record({
          adapterId: component,
          adapterVersion: component,
          path: component,
          language: component,
        }),
        (a, b) => {
          const keyA = extractionCacheKey({ ...BASE_KEY, ...a });
          const keyB = extractionCacheKey({ ...BASE_KEY, ...b });
          const same =
            a.adapterId === b.adapterId &&
            a.adapterVersion === b.adapterVersion &&
            a.path === b.path &&
            a.language === b.language;
          expect(keyA === keyB).toBe(same);
        },
      ),
    );
  });

  it("digests adapter options canonically", () => {
    expect(adapterOptionsDigest({ a: 1, b: [1, 2] })).toBe(
      adapterOptionsDigest({ b: [1, 2], a: 1 }),
    );
    expect(adapterOptionsDigest(undefined)).toBe(adapterOptionsDigest(null));
    expect(adapterOptionsDigest({ a: 1 })).not.toBe(adapterOptionsDigest({ a: 2 }));
    expect(adapterOptionsDigest({})).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("isFileExtraction", () => {
  it("accepts extractions and rejects other shapes", () => {
    expect(isFileExtraction(extraction("a"))).toBe(true);
    expect(isFileExtraction(null)).toBe(false);
    expect(isFileExtraction([])).toBe(false);
    expect(isFileExtraction({ ...extraction("a"), symbols: undefined })).toBe(false);
    expect(isFileExtraction({ ...extraction("a"), moduleFormat: 1 })).toBe(false);
  });
});

describe("MemoryExtractionCache", () => {
  it("stores copies", async () => {
    const cache = new MemoryExtractionCache();
    expect(await cache.get("k")).toBeUndefined();
    const value = extraction("a");
    await cache.set("k", value);
    value.symbols.length = 0;
    const first = await cache.get("k");
    expect(first).toEqual(extraction("a"));
    first?.symbols.pop();
    expect(await cache.get("k")).toEqual(extraction("a"));
    expect(cache.size).toBe(1);
    cache.clear();
    expect(await cache.get("k")).toBeUndefined();
  });

  it("ignores values that cannot be cloned", async () => {
    const cache = new MemoryExtractionCache();
    await cache.set("k", {
      ...extraction("a"),
      facts: [() => 1] as unknown as FileExtraction["facts"],
    });
    expect(await cache.get("k")).toBeUndefined();
  });
});

describe("FileSystemExtractionCache", () => {
  let scratch = "";
  let counter = 0;
  const newCache = (logger?: Logger): FileSystemExtractionCache =>
    new FileSystemExtractionCache(
      join(scratch, `cache-${++counter}`),
      logger === undefined ? {} : { logger },
    );
  const key = (seed: string): string => extractionCacheKey({ ...BASE_KEY, path: seed });

  beforeAll(async () => {
    scratch = await mkdtemp(join(tmpdir(), "katedrala-core-cache-"));
  });

  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it("stores entries at <dir>/<key[0..2]>/<key>.json and reads them back", async () => {
    const cache = newCache();
    const k = key("a.ts");
    expect(await cache.get(k)).toBeUndefined();
    await cache.set(k, extraction("a"));
    expect(cache.entryPath(k)).toBe(join(cache.directory, k.slice(0, 2), `${k}.json`));
    const stored = JSON.parse(await readFile(cache.entryPath(k), "utf8")) as Record<
      string,
      unknown
    >;
    expect(stored).toEqual({ format: CACHE_FORMAT_VERSION, key: k, extraction: extraction("a") });
    expect(await cache.get(k)).toEqual(extraction("a"));
    // A second instance (another process) sees the entry.
    expect(await new FileSystemExtractionCache(cache.directory).get(k)).toEqual(extraction("a"));
  });

  it("writes atomically, leaving no temporary files, also with concurrent writers", async () => {
    const cache = newCache();
    const other = new FileSystemExtractionCache(cache.directory);
    const k = key("concurrent.ts");
    await Promise.all(
      Array.from({ length: 40 }, (_, index) =>
        (index % 2 === 0 ? cache : other).set(k, extraction("c")),
      ),
    );
    expect(await cache.get(k)).toEqual(extraction("c"));
    expect(await readdir(join(cache.directory, k.slice(0, 2)))).toEqual([`${k}.json`]);
  });

  it("treats corrupt and foreign entries as misses and overwrites them", async () => {
    const logger = recordingLogger();
    const cache = newCache(logger);
    const k = key("corrupt.ts");
    await mkdir(join(cache.directory, k.slice(0, 2)), { recursive: true });
    for (const content of [
      '{"format":1,"key":"',
      "null",
      JSON.stringify({ format: CACHE_FORMAT_VERSION + 1, key: k, extraction: extraction("x") }),
      JSON.stringify({
        format: CACHE_FORMAT_VERSION,
        key: key("other.ts"),
        extraction: extraction("x"),
      }),
      JSON.stringify({ format: CACHE_FORMAT_VERSION, key: k, extraction: { moduleFormat: "esm" } }),
    ]) {
      await writeFile(cache.entryPath(k), content);
      expect(await cache.get(k)).toBeUndefined();
    }
    expect(logger.messages.length).toBeGreaterThan(0);
    await cache.set(k, extraction("fixed"));
    expect(await cache.get(k)).toEqual(extraction("fixed"));
  });

  it("never throws on I/O problems or malformed keys", async () => {
    const logger = recordingLogger();
    const blocker = join(scratch, `blocker-${++counter}`);
    await writeFile(blocker, "a file where the cache directory should be");
    const broken = new FileSystemExtractionCache(blocker, { logger });
    const k = key("x.ts");
    await expect(broken.set(k, extraction("x"))).resolves.toBeUndefined();
    await expect(broken.get(k)).resolves.toBeUndefined();
    expect(logger.messages.some((message) => message.startsWith("Cannot write"))).toBe(true);

    const cache = newCache(logger);
    await cache.set("../../escape", extraction("x"));
    expect(await cache.get("../../escape")).toBeUndefined();
    expect(await cache.get("ABC")).toBeUndefined();
    expect(logger.messages).toContain("Ignoring an extraction cache write with a malformed key");
  });

  it("skips values that cannot be serialized", async () => {
    const debug = vi.fn();
    const cache = new FileSystemExtractionCache(join(scratch, `cache-${++counter}`), {
      logger: { debug, info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    const cyclic = extraction("c") as FileExtraction & { self?: unknown };
    cyclic.self = cyclic;
    await cache.set(key("cyclic.ts"), cyclic);
    expect(await cache.get(key("cyclic.ts"))).toBeUndefined();
    expect(debug).toHaveBeenCalled();
  });
});

describe("defaultCacheDirectory", () => {
  it("prefers KATEDRALA_CACHE_DIR", () => {
    expect(
      defaultCacheDirectory({
        env: { KATEDRALA_CACHE_DIR: "/var/cache/k" },
        platform: "linux",
        homeDirectory: "/home/u",
      }),
    ).toBe("/var/cache/k");
    expect(
      defaultCacheDirectory({
        env: { KATEDRALA_CACHE_DIR: "D:\\cache" },
        platform: "win32",
        homeDirectory: "C:\\Users\\u",
      }),
    ).toBe("D:\\cache");
  });

  it("uses LOCALAPPDATA on Windows", () => {
    expect(
      defaultCacheDirectory({
        env: { LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" },
        platform: "win32",
        homeDirectory: "C:\\Users\\u",
      }),
    ).toBe(win32.join("C:\\Users\\u\\AppData\\Local", "katedrala", "cache"));
    expect(
      defaultCacheDirectory({ env: {}, platform: "win32", homeDirectory: "C:\\Users\\u" }),
    ).toBe("C:\\Users\\u\\AppData\\Local\\katedrala\\cache");
  });

  it("uses ~/Library/Caches on macOS", () => {
    expect(defaultCacheDirectory({ env: {}, platform: "darwin", homeDirectory: "/Users/u" })).toBe(
      "/Users/u/Library/Caches/katedrala",
    );
  });

  it("uses XDG_CACHE_HOME or ~/.cache elsewhere", () => {
    expect(
      defaultCacheDirectory({
        env: { XDG_CACHE_HOME: "/xdg" },
        platform: "linux",
        homeDirectory: "/home/u",
      }),
    ).toBe("/xdg/katedrala");
    expect(
      defaultCacheDirectory({
        env: { XDG_CACHE_HOME: "relative" },
        platform: "linux",
        homeDirectory: "/home/u",
      }),
    ).toBe("/home/u/.cache/katedrala");
    expect(
      defaultCacheDirectory({
        env: { XDG_CACHE_HOME: " " },
        platform: "freebsd",
        homeDirectory: "/home/u",
      }),
    ).toBe(posix.join("/home/u", ".cache", "katedrala"));
  });

  it("defaults to the current process", () => {
    expect(defaultCacheDirectory()).toContain("katedrala");
  });
});
