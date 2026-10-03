import { compareStrings } from "@katedrala/ir";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SnapshotSourceError } from "./errors.js";
import { InMemorySource } from "./in-memory.js";

const decoder = new TextDecoder();

describe("InMemorySource", () => {
  it("lists normalized paths sorted by UTF-16 code units, with byte sizes", async () => {
    const source = new InMemorySource({
      files: {
        "src/b.ts": "b",
        "./src//a.ts": "café",
        "B.md": new Uint8Array([1, 2, 3]),
        "src\\lib\\c.ts": "",
        "src-x/d.ts": "d",
      },
    });
    expect(source.kind).toBe("in-memory");
    expect(await source.list()).toEqual([
      { path: "B.md", size: 3 },
      { path: "src-x/d.ts", size: 1 },
      { path: "src/a.ts", size: 5 },
      { path: "src/b.ts", size: 1 },
      { path: "src/lib/c.ts", size: 0 },
    ]);
    expect(await source.skipped()).toEqual([]);
    expect(source.description).toBe("in-memory snapshot (5 files)");
  });

  it("reads listed files as UTF-8 and returns copies", async () => {
    const source = new InMemorySource({
      files: { "a.txt": "héllo", "b.bin": Uint8Array.of(0, 1) },
    });
    const first = await source.read("a.txt");
    expect(decoder.decode(first)).toBe("héllo");
    first.fill(0);
    expect(decoder.decode(await source.read("a.txt"))).toBe("héllo");
    expect([...(await source.read("b.bin"))]).toEqual([0, 1]);
  });

  it("rejects reads of unlisted paths", async () => {
    const source = new InMemorySource({ files: { "src/a.ts": "a" } });
    await expect(source.read("src/missing.ts")).rejects.toMatchObject({
      name: "SnapshotSourceError",
      code: "unlisted-path",
      path: "src/missing.ts",
    });
    // Paths are matched exactly.
    await expect(source.read("./src/a.ts")).rejects.toBeInstanceOf(SnapshotSourceError);
    await expect(source.read("SRC/a.ts")).rejects.toBeInstanceOf(SnapshotSourceError);
  });

  it("rejects duplicate, empty and escaping paths", () => {
    expect(() => new InMemorySource({ files: { "a.ts": "1", "./a.ts": "2" } })).toThrow(
      expect.objectContaining({ code: "duplicate-path", path: "a.ts" }) as Error,
    );
    expect(() => new InMemorySource({ files: { "./": "x" } })).toThrow(
      expect.objectContaining({ code: "invalid-path" }) as Error,
    );
    expect(() => new InMemorySource({ files: { "../a.ts": "x" } })).toThrow(
      expect.objectContaining({ code: "invalid-path" }) as Error,
    );
    expect(() => new InMemorySource({ files: {}, subdirectory: "../x" })).toThrow(
      SnapshotSourceError,
    );
  });

  it("rejects a path that is also a directory", () => {
    expect(() => new InMemorySource({ files: { "src/a": "1", "src/a/b.ts": "2" } })).toThrow(
      expect.objectContaining({ code: "invalid-path", path: "src/a" }) as Error,
    );
    expect(
      () => new InMemorySource({ files: { "src/a-b.ts": "1", "src/a/b.ts": "2" } }),
    ).not.toThrow();
  });

  it("reports the revision, subdirectory, remote and ancestors it was given", async () => {
    const source = new InMemorySource({
      files: { "package.json": "{}" },
      revision: { commit: "a".repeat(40), subject: "Initial", dirty: false },
      subdirectory: "packages/api/",
      remote: "github.com/acme/shop",
      ancestors: { "tsconfig.base.json": "{ }", "./go.mod": "module x" },
      description: "fixture",
    });
    expect(await source.revision()).toEqual({
      commit: "a".repeat(40),
      subject: "Initial",
      dirty: false,
    });
    expect(await source.subdirectory()).toBe("packages/api");
    expect(await source.remote()).toBe("github.com/acme/shop");
    expect(decoder.decode(await source.readAncestor("tsconfig.base.json"))).toBe("{ }");
    expect(decoder.decode(await source.readAncestor("go.mod"))).toBe("module x");
    expect(await source.readAncestor("missing.json")).toBeUndefined();
    expect(await source.readAncestor("../outside")).toBeUndefined();
    expect(source.description).toBe("fixture");
    await source.close();
    await source.close();
  });

  it("never serves paths inside the analysis root as ancestors", async () => {
    const source = new InMemorySource({
      files: { "index.ts": "export {};" },
      subdirectory: "app",
      ancestors: {
        "tsconfig.base.json": "{}",
        "app/local.tsconfig.json": "{ machine-specific }",
        "application/tsconfig.json": "{ sibling }",
      },
    });
    expect(decoder.decode(await source.readAncestor("tsconfig.base.json"))).toBe("{}");
    expect(decoder.decode(await source.readAncestor("application/tsconfig.json"))).toBe(
      "{ sibling }",
    );
    // read() serves the root's files; the root's other files are not part of the snapshot at all.
    expect(await source.readAncestor("app/local.tsconfig.json")).toBeUndefined();
    expect(await source.readAncestor("./app/local.tsconfig.json")).toBeUndefined();
    expect(await source.readAncestor("app")).toBeUndefined();
    // At the top level, everything is inside the root.
    const atTop = new InMemorySource({
      files: {},
      subdirectory: "",
      ancestors: { "x.json": "{}" },
    });
    expect(await atTop.readAncestor("x.json")).toBeUndefined();
  });

  it("has no revision metadata unless given", async () => {
    const source = new InMemorySource({ files: {} });
    expect(await source.revision()).toBeUndefined();
    expect(await source.subdirectory()).toBeUndefined();
    expect(await source.remote()).toBeUndefined();
    expect(await source.list()).toEqual([]);
  });

  it("always lists in canonical order", async () => {
    const segment = fc
      .stringMatching(/^[a-zA-Z0-9_.-]{1,6}$/)
      .filter((s) => s !== "." && s !== "..");
    const path = fc.array(segment, { minLength: 1, maxLength: 3 }).map((parts) => parts.join("/"));
    await fc.assert(
      fc.asyncProperty(fc.uniqueArray(path, { maxLength: 12 }), async (paths) => {
        const files = Object.fromEntries(paths.map((p) => [p, p]));
        let source: InMemorySource;
        try {
          source = new InMemorySource({ files });
        } catch (error) {
          // Generated paths may clash as file and directory ("a" and "a/b").
          expect(error).toMatchObject({ code: "invalid-path" });
          return;
        }
        const listed = (await source.list()).map((entry) => entry.path);
        expect(listed).toEqual([...listed].sort(compareStrings));
        expect(new Set(listed).size).toBe(listed.length);
      }),
    );
  });
});
