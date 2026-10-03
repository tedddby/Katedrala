import { canonicalizeDocument, emptyDocument } from "@katedrala/ir";
import type { ArchitectureDocument } from "@katedrala/ir";
import { describe, expect, it } from "vitest";
import { LinkerError } from "./errors.js";
import type { LinkResult } from "./types.js";
import { extraction, fid, file, imp, run, sid, sym } from "./test-support.js";

function documentOf(result: LinkResult): ArchitectureDocument {
  const document = emptyDocument({ repositoryName: "repo" });
  return {
    ...document,
    repository: {
      ...document.repository,
      languages: result.languages,
      stats: { ...result.stats, endpoints: 0 },
    },
    directories: result.directories,
    packages: result.packages,
    files: result.files,
    symbols: result.symbols,
    externals: result.externals,
    edges: result.edges,
    entryPoints: result.entryPoints,
    diagnostics: result.diagnostics,
  };
}

describe("directories", () => {
  it("lists every ancestor directory with sorted children and files", async () => {
    const result = await run(
      [
        file("src/b.ts", extraction()),
        file("src/a/x.ts", extraction()),
        file("src/a-b/y.ts", extraction()),
        file("README.md"),
      ],
      { repositoryName: "shop" },
    );
    expect(result.directories).toEqual([
      {
        id: "dir:",
        path: "",
        name: "shop",
        directories: ["dir:src"],
        files: ["file:README.md"],
      },
      {
        id: "dir:src",
        path: "src",
        name: "src",
        parent: "dir:",
        directories: ["dir:src/a", "dir:src/a-b"],
        files: ["file:src/b.ts"],
      },
      {
        id: "dir:src/a",
        path: "src/a",
        name: "a",
        parent: "dir:src",
        directories: [],
        files: ["file:src/a/x.ts"],
      },
      {
        id: "dir:src/a-b",
        path: "src/a-b",
        name: "a-b",
        parent: "dir:src",
        directories: [],
        files: ["file:src/a-b/y.ts"],
      },
    ]);
  });

  it("always contains the root, even without files", async () => {
    const result = await run([], { repositoryName: "empty" });
    expect(result.directories).toEqual([
      { id: "dir:", path: "", name: "empty", directories: [], files: [] },
    ]);
    expect(result.files).toEqual([]);
    expect(result.stats.directories).toBe(1);
  });
});

describe("files", () => {
  it("describes parsed files with their analysis, namespaces and symbols in source order", async () => {
    const result = await run([
      file(
        "src/a.ts",
        extraction({
          namespaces: ["com.acme"],
          symbols: [sym("zeta", "function"), sym("alpha", "constant")],
        }),
        { dialect: "tsx", lines: 12, size: 345 },
      ),
    ]);
    expect(result.files).toEqual([
      {
        id: "file:src/a.ts",
        path: "src/a.ts",
        name: "a.ts",
        directory: "dir:src",
        language: "typescript",
        dialect: "tsx",
        role: "source",
        size: 345,
        lines: 12,
        hash: `sha256:${"0".repeat(64)}`,
        analysis: { status: "parsed", adapter: "fake@1.0.0", syntaxErrors: 0 },
        namespaces: ["com.acme"],
        symbols: [sid("src/a.ts", "zeta"), sid("src/a.ts", "alpha")],
        imports: [],
        exports: [],
        tags: [],
      },
    ]);
  });

  it("lists files that were not analyzed without pretending they were", async () => {
    const result = await run([
      file("docs/guide.md", undefined, { language: "markdown", role: "documentation" }),
      file("big.ts", undefined, {
        language: "typescript",
        status: "skipped",
        reason: "file-too-large",
        size: 9_000_000,
      }),
      file("bad.ts", undefined, {
        language: "typescript",
        status: "failed",
        reason: "parser crashed",
        adapter: { id: "fake", version: "1.0.0" },
      }),
    ]);
    const analyses = Object.fromEntries(result.files.map((entry) => [entry.path, entry.analysis]));
    expect(analyses).toEqual({
      "bad.ts": { status: "failed", adapter: "fake@1.0.0", reason: "parser crashed" },
      "big.ts": { status: "skipped", reason: "file-too-large" },
      "docs/guide.md": { status: "unsupported" },
    });
    expect(result.files.every((entry) => entry.lines === undefined)).toBe(true);
    expect(result.stats).toMatchObject({ files: 3, analyzedFiles: 0, failedFiles: 1 });
  });

  it("omits the owning package when there is none", async () => {
    const result = await run([file("a.ts", extraction())]);
    expect(result.files[0]?.package).toBeUndefined();
    expect(result.files[0]?.roles).toBeUndefined();
  });
});

describe("file diagnostics", () => {
  it("reports syntax errors once per file at the first error", async () => {
    const result = await run([
      file(
        "src/broken.ts",
        extraction({
          syntaxErrors: [
            { message: "')' expected.", line: 12, column: 3 },
            { message: "Declaration expected.", line: 10, column: 7 },
          ],
        }),
      ),
      file("src/one.ts", extraction({ syntaxErrors: [{ message: "Oops.", line: 2, column: 1 }] })),
    ]);
    expect(result.files.map((entry) => entry.analysis)).toEqual([
      { status: "partial", adapter: "fake@1.0.0", syntaxErrors: 2 },
      { status: "partial", adapter: "fake@1.0.0", syntaxErrors: 1 },
    ]);
    expect(result.diagnostics).toEqual([
      {
        code: "syntax-error",
        severity: "warning",
        message: "2 syntax errors; first: Declaration expected.",
        file: "file:src/broken.ts",
        line: 10,
        column: 7,
      },
      {
        code: "syntax-error",
        severity: "warning",
        message: "1 syntax error; first: Oops.",
        file: "file:src/one.ts",
        line: 2,
        column: 1,
      },
    ]);
    expect(result.stats.analyzedFiles).toBe(2);
  });

  it("leaves read, parse and size problems to the extraction stage that reported them", async () => {
    const result = await run([
      file("a.ts", undefined, {
        status: "failed",
        reason: "Cannot read the file: EACCES: permission denied",
        adapter: { id: "fake", version: "1.0.0" },
      }),
      file("b.ts", undefined, { status: "skipped", reason: "file-too-large" }),
      file("c.ts", undefined, { status: "skipped", reason: "generated" }),
      file("d.ts", undefined, { status: "failed", reason: "grammar exploded" }),
    ]);
    // Core emits read-failed, parse-failed and file-too-large for these files; the analysis status keeps the
    // reason. Repeating them here would count every problem twice.
    expect(result.diagnostics).toEqual([]);
    expect(result.files.map((entry) => entry.analysis.reason)).toEqual([
      "Cannot read the file: EACCES: permission denied",
      "file-too-large",
      "generated",
      "grammar exploded",
    ]);
    expect(result.stats.failedFiles).toBe(2);
  });
});

describe("languages and statistics", () => {
  it("summarizes languages by descending lines, then language", async () => {
    const result = await run([
      file("a.ts", extraction(), { lines: 10, size: 100 }),
      file("b.ts", extraction(), { lines: 5, size: 50 }),
      file("c.json", undefined, { language: "json", lines: 15, size: 7 }),
      file("d.md", undefined, { language: "markdown", lines: 15, size: 9 }),
      file("e.png", undefined, { language: "unknown", size: 1000 }),
    ]);
    expect(result.languages).toEqual([
      { language: "json", files: 1, lines: 15, bytes: 7 },
      { language: "markdown", files: 1, lines: 15, bytes: 9 },
      { language: "typescript", files: 2, lines: 15, bytes: 150 },
      { language: "unknown", files: 1, lines: 0, bytes: 1000 },
    ]);
  });

  it("counts files, directories, symbols, externals, edges, lines and bytes", async () => {
    const result = await run([
      file(
        "src/a.ts",
        extraction({ symbols: [sym("a", "function")], imports: [imp("./b"), imp("react")] }),
        { lines: 3, size: 30 },
      ),
      file("src/b.ts", extraction({ symbols: [sym("b", "function")] }), { lines: 4, size: 40 }),
      file("src/c.ts", extraction({ imports: [imp("./missing")] }), { lines: 5, size: 50 }),
    ]);
    expect(result.stats).toEqual({
      files: 3,
      analyzedFiles: 3,
      failedFiles: 0,
      directories: 2,
      packages: 0,
      symbols: 2,
      externals: 1,
      edges: 2,
      lines: 12,
      bytes: 120,
      unresolvedImports: 1,
      unresolvedReferences: 0,
      untypedReferences: 0,
    });
  });
});

describe("input validation", () => {
  it("rejects files listed twice", async () => {
    await expect(run([file("a.ts"), file("a.ts")])).rejects.toMatchObject({
      name: "LinkerError",
      code: "duplicate-file",
    });
  });

  it("rejects paths that are not normalized", async () => {
    for (const path of ["./a.ts", "a//b.ts", "/a.ts", "a/../b.ts", "../a.ts", "a\\b.ts", ""]) {
      const error = await run([file(path)]).catch((caught: unknown) => caught);
      expect(error, path).toBeInstanceOf(LinkerError);
      expect((error as LinkerError).code, path).toBe("invalid-path");
    }
  });
});

describe("canonical output", () => {
  it("is already in canonical document order", async () => {
    const result = await run([
      file(
        "src/z.ts",
        extraction({
          symbols: [sym("b", "function"), sym("a", "function")],
          imports: [imp("./a"), imp("zod"), imp("node:fs")],
        }),
      ),
      file("src/a.ts", extraction({ symbols: [sym("x", "constant")] })),
      file("README.md"),
    ]);
    const document = documentOf(result);
    expect(canonicalizeDocument(document)).toEqual(document);
    expect(result.files.map((entry) => entry.id)).toEqual([
      fid("README.md"),
      fid("src/a.ts"),
      fid("src/z.ts"),
    ]);
  });
});
