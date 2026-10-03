import { describe, expect, it } from "vitest";
import { isJsonObject, parseConfigJson, parseStrictJson, positionAt } from "./json.js";

describe("positionAt", () => {
  it("returns 1-based lines and columns", () => {
    expect(positionAt("abc", 0)).toEqual({ line: 1, column: 1 });
    expect(positionAt("ab\ncd", 3)).toEqual({ line: 2, column: 1 });
    expect(positionAt("ab\ncd", 4)).toEqual({ line: 2, column: 2 });
    expect(positionAt("ab", 99)).toEqual({ line: 1, column: 3 });
  });
});

describe("parseStrictJson", () => {
  it("parses JSON, ignoring a byte-order mark", () => {
    const byteOrderMark = String.fromCharCode(0xfeff);
    expect(parseStrictJson(`${byteOrderMark}{"name":"x"}`, "package.json")).toEqual({
      ok: true,
      value: { name: "x" },
    });
    expect(parseStrictJson("[1]", "package.json")).toEqual({ ok: true, value: [1] });
  });

  it("reports empty files", () => {
    expect(parseStrictJson("  \n", "package.json")).toEqual({
      ok: false,
      problem: { message: "the file is empty" },
    });
  });

  it("locates syntax errors with the TypeScript parser (deterministic message and position)", () => {
    const result = parseStrictJson('{\n  "name": "x",\n  "version": \n}\n', "package.json");
    expect(result).toEqual({
      ok: false,
      problem: { message: "Expression expected.", line: 4, column: 1 },
    });
  });

  it("reports comments and trailing commas as non-strict JSON", () => {
    const result = parseStrictJson('{\n  // comment\n  "name": "x",\n}', "package.json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem.message).toMatch(/not strict JSON/);
  });
});

describe("parseConfigJson", () => {
  it("accepts comments and trailing commas", () => {
    const result = parseConfigJson(
      '{\n  // options\n  "compilerOptions": { "paths": { "@/*": ["src/*",], }, },\n  /* done */\n}',
      "tsconfig.json",
    );
    expect(result).toEqual({ value: { compilerOptions: { paths: { "@/*": ["src/*"] } } } });
  });

  it("keeps what could be read before a syntax error and locates the error", () => {
    const result = parseConfigJson(
      '{\n  "extends": "./base.json",\n  "compilerOptions": { "x": }\n}',
      "tsconfig.json",
    );
    expect(result.value).toMatchObject({ extends: "./base.json" });
    // Line 3 is `  "compilerOptions": { "x": }`; the unexpected `}` is in column 29.
    expect(result.problem).toEqual({ message: "Expression expected.", line: 3, column: 29 });
  });

  it("treats a non-object root as an empty configuration with a problem", () => {
    const result = parseConfigJson("[1, 2]", "tsconfig.json");
    expect(result.value).toEqual({});
    expect(result.problem?.message).toMatch(/must be an object/);
  });

  it("recognizes JSON objects", () => {
    expect(isJsonObject({})).toBe(true);
    expect(isJsonObject([])).toBe(false);
    expect(isJsonObject(null)).toBe(false);
    expect(isJsonObject("x")).toBe(false);
  });
});
