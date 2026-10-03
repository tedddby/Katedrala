import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  TYPESCRIPT_LANGUAGES,
  detectTypeScriptLanguage,
  dialectSuffixOf,
  isTypeScriptDialect,
  languageOfDialect,
} from "./languages.js";

describe("detectTypeScriptLanguage", () => {
  it.each([
    ["src/a.ts", "typescript", "ts"],
    ["src/App.tsx", "typescript", "tsx"],
    ["src/a.mts", "typescript", "mts"],
    ["src/a.cts", "typescript", "cts"],
    ["types/a.d.ts", "typescript", "dts"],
    ["types/a.d.mts", "typescript", "dts"],
    ["types/a.d.cts", "typescript", "dts"],
    ["styles/button.d.css.ts", "typescript", "dts"],
    ["src/a.js", "javascript", "js"],
    ["src/View.jsx", "javascript", "jsx"],
    ["src/a.mjs", "javascript", "mjs"],
    ["src/a.cjs", "javascript", "cjs"],
    ["a.ts", "typescript", "ts"],
  ])("detects %s as %s (%s)", (path, language, dialect) => {
    expect(detectTypeScriptLanguage(path)).toEqual({ language, dialect });
  });

  it("matches extensions case-insensitively", () => {
    expect(detectTypeScriptLanguage("src/App.TSX")).toEqual({
      language: "typescript",
      dialect: "tsx",
    });
    expect(detectTypeScriptLanguage("types/Global.D.TS")).toEqual({
      language: "typescript",
      dialect: "dts",
    });
    expect(detectTypeScriptLanguage("lib/Main.MJS")).toEqual({
      language: "javascript",
      dialect: "mjs",
    });
  });

  it.each([
    "package.json",
    "README.md",
    "Makefile",
    "src/a.tsx.bak",
    "src/a.json",
    "styles/a.css",
    ".ts",
    "dir.ts/file",
    "src/a.d",
    "",
  ])("does not claim %j", (path) => {
    expect(detectTypeScriptLanguage(path)).toBeUndefined();
  });

  it("reports the matched suffix in lower case", () => {
    expect(dialectSuffixOf("x/Y.D.MTS")).toEqual({ suffix: ".d.mts", dialect: "dts" });
    expect(dialectSuffixOf("x/y.d.css.ts")).toEqual({ suffix: ".d.css.ts", dialect: "dts" });
    expect(dialectSuffixOf("x/y.ts")).toEqual({ suffix: ".ts", dialect: "ts" });
  });

  it("agrees with the lower-cased extension for any stem (property)", () => {
    const extensions = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
    fc.assert(
      fc.property(
        fc.stringMatching(/^[A-Za-z0-9_-]{1,12}$/),
        fc.constantFrom(...extensions),
        fc.boolean(),
        (stem, extension, upper) => {
          const path = `dir/${stem}${upper ? extension.toUpperCase() : extension}`;
          const detected = detectTypeScriptLanguage(path);
          expect(detected).toBeDefined();
          expect(detected?.dialect).toBe(extension.slice(1));
          expect(detected?.language).toBe(extension.includes("t") ? "typescript" : "javascript");
        },
      ),
    );
  });
});

describe("languages and dialects", () => {
  it("lists TypeScript and JavaScript with lower-case extensions", () => {
    expect(TYPESCRIPT_LANGUAGES.map((language) => language.id)).toEqual([
      "typescript",
      "javascript",
    ]);
    for (const language of TYPESCRIPT_LANGUAGES) {
      for (const extension of language.extensions) {
        expect(extension).toBe(extension.toLowerCase());
        expect(detectTypeScriptLanguage(`a${extension}`)?.language).toBe(language.id);
      }
    }
  });

  it("validates dialect names and maps them to languages", () => {
    expect(isTypeScriptDialect("tsx")).toBe(true);
    expect(isTypeScriptDialect("dts")).toBe(true);
    expect(isTypeScriptDialect("toString")).toBe(false);
    expect(isTypeScriptDialect(undefined)).toBe(false);
    expect(languageOfDialect("cjs")).toBe("javascript");
    expect(languageOfDialect("cts")).toBe("typescript");
  });
});
