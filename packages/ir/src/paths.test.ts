import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  PathOutsideRootError,
  ancestorsOf,
  baseName,
  extensionOf,
  isWithin,
  joinPath,
  normalizePath,
  parentPath,
  relativePath,
} from "./paths.js";

describe("normalizePath", () => {
  it.each([
    ["", ""],
    [".", ""],
    ["./", ""],
    ["src/a.ts", "src/a.ts"],
    ["./src/a.ts", "src/a.ts"],
    ["/src/a.ts", "src/a.ts"],
    ["src//a.ts", "src/a.ts"],
    ["src\\lib\\a.ts", "src/lib/a.ts"],
    ["src/./lib/../a.ts", "src/a.ts"],
    ["src/lib/", "src/lib"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizePath(input)).toBe(expected);
  });

  it("rejects paths that escape the root", () => {
    expect(() => normalizePath("../a.ts")).toThrow(PathOutsideRootError);
    expect(() => normalizePath("src/../../a.ts")).toThrow(PathOutsideRootError);
  });

  it("is idempotent", () => {
    const segment = fc.stringMatching(/^[a-zA-Z0-9_.-]{1,8}$/);
    fc.assert(
      fc.property(fc.array(segment, { maxLength: 6 }), (segments) => {
        let once: string;
        try {
          once = normalizePath(segments.join("/"));
        } catch (error) {
          expect(error).toBeInstanceOf(PathOutsideRootError);
          return;
        }
        expect(normalizePath(once)).toBe(once);
        expect(once.startsWith("/")).toBe(false);
        expect(once.endsWith("/")).toBe(false);
        expect(once.split("/")).not.toContain("..");
      }),
    );
  });
});

describe("path helpers", () => {
  it("joins and normalizes", () => {
    expect(joinPath("src", "lib", "../a.ts")).toBe("src/a.ts");
    expect(joinPath("", "a.ts")).toBe("a.ts");
  });

  it("computes parents, names and extensions", () => {
    expect(parentPath("src/lib/a.ts")).toBe("src/lib");
    expect(parentPath("a.ts")).toBe("");
    expect(parentPath("")).toBe("");
    expect(baseName("src/lib/a.ts")).toBe("a.ts");
    expect(baseName("")).toBe("");
    expect(extensionOf("src/a.TS")).toBe(".ts");
    expect(extensionOf("src/types.d.ts")).toBe(".ts");
    expect(extensionOf(".gitignore")).toBe("");
    expect(extensionOf("Makefile")).toBe("");
  });

  it("tests containment", () => {
    expect(isWithin("src/a.ts", "src")).toBe(true);
    expect(isWithin("src", "src")).toBe(true);
    expect(isWithin("srcx/a.ts", "src")).toBe(false);
    expect(isWithin("anything", "")).toBe(true);
  });

  it("lists ancestors nearest first", () => {
    expect(ancestorsOf("a/b/c.ts")).toEqual(["a/b", "a", ""]);
    expect(ancestorsOf("c.ts")).toEqual([""]);
    expect(ancestorsOf("")).toEqual([]);
  });

  it("computes relative paths", () => {
    expect(relativePath("src/a", "src/b/c.ts")).toBe("../b/c.ts");
    expect(relativePath("", "src/a.ts")).toBe("src/a.ts");
    expect(relativePath("src", "src")).toBe(".");
    expect(relativePath("src/a/b", "")).toBe("../../..");
  });
});
