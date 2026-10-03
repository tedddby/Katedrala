import type { FileExtraction } from "@katedrala/plugin-api";
import fc from "fast-check";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { detectTypeScriptLanguage } from "../languages.js";
import { resolveTypeScriptAdapterOptions } from "../options.js";
import { extractTypeScriptFile, parseTypeScriptFile, type ParseOptions } from "./index.js";
import { internalBinder } from "./ts-internals.js";

function parse(text: string, path = "src/sample.ts", options?: ParseOptions) {
  const detection = detectTypeScriptLanguage(path);
  if (detection === undefined) throw new Error(`unsupported path ${path}`);
  return parseTypeScriptFile({ path, text, ...detection }, options);
}

function extract(text: string, path = "src/sample.ts", options?: ParseOptions): FileExtraction {
  return extractTypeScriptFile(
    parse(text, path, options),
    resolveTypeScriptAdapterOptions(undefined),
  );
}

describe("parsing", () => {
  it("reports syntax errors with flattened messages and 1-based positions", () => {
    const parsed = parse(
      'import { a } from "./a";\n\nexport function f() {\n  const x = a(1;\n}\n',
    );
    expect(parsed.syntaxErrors).toEqual([{ message: "')' expected.", line: 4, column: 16 }]);
    const extraction = extractTypeScriptFile(parsed, resolveTypeScriptAdapterOptions(undefined));
    expect(extraction.syntaxErrors).toEqual(parsed.syntaxErrors);
    expect(extraction.imports.map((entry) => entry.specifier)).toEqual(["./a"]);
    expect(extraction.symbols.map((symbol) => symbol.localName)).toEqual(["f"]);
  });

  it("reports no syntax errors for valid files", () => {
    expect(parse("export const a = 1;").syntaxErrors).toEqual([]);
  });

  it("chooses the script kind by dialect", () => {
    expect(parse("const a = <T,>(x: T) => x;").sourceFile.languageVariant).toBe(
      ts.LanguageVariant.Standard,
    );
    expect(parse("const a = <div />;", "src/a.tsx").syntaxErrors).toEqual([]);
    expect(parse("const a = <div />;", "src/a.jsx").syntaxErrors).toEqual([]);
    expect(parse("const a = <div />;", "src/a.js").syntaxErrors).toEqual([]);
    expect(parse("const a = <div />;", "src/a.ts").syntaxErrors.length).toBeGreaterThan(0);
    expect(parse("const a = (x as number);", "src/a.mts").syntaxErrors).toEqual([]);
  });

  it("recognizes declaration files regardless of extension case", () => {
    expect(parse("declare const a: number;", "types/A.D.TS").sourceFile.isDeclarationFile).toBe(
      true,
    );
    expect(parse("declare const a: number;", "types/a.d.mts").sourceFile.isDeclarationFile).toBe(
      true,
    );
    expect(parse("const a = 1;", "src/a.ts").sourceFile.isDeclarationFile).toBe(false);
  });

  it("parses JSDoc only in JavaScript files", () => {
    const javascript = extract('/** @type {import("./x").X} */\nlet a;', "src/a.js");
    const typescript = extract('/** @type {import("./x").X} */\nlet a;', "src/a.ts");
    expect(javascript.imports.map((entry) => entry.specifier)).toEqual(["./x"]);
    expect(typescript.imports).toEqual([]);
  });

  it("falls back to the path when the dialect is missing or unknown", () => {
    const parsed = parseTypeScriptFile({
      path: "src/A.TSX",
      text: "export const a = <b />;",
      language: "typescript",
    });
    expect(parsed.dialect).toBe("tsx");
    expect(parsed.suffix).toBe(".tsx");
    const unknown = parseTypeScriptFile({
      path: "src/a.ts",
      text: "",
      language: "typescript",
      dialect: "weird",
    });
    expect(unknown.dialect).toBe("ts");
    const forced = parseTypeScriptFile({
      path: "src/script",
      text: "const a = 1;",
      language: "javascript",
    });
    expect(forced.dialect).toBe("js");
    expect(forced.language).toBe("javascript");
  });

  it("binds files for scope analysis", () => {
    expect(internalBinder()).toBeTypeOf("function");
    expect(parse("const a = 1;").bound).toBe(true);
  });

  it("extracts identically through the program-based binding fallback", () => {
    const sources: Array<[string, string]> = [
      [
        "src/service.ts",
        `import { Repo } from "./repo";
         export class Service { constructor(private repo: Repo) {} run(id: string) { return this.repo.find(id); } }
         namespace N { export const a = 1; }
         namespace N { export const b = a; }
         export function f(x: Repo) { const y = new Repo(); return y.save(x); }`,
      ],
      [
        "src/routes.js",
        `const express = require("express");
         function register(app) { app.get("/x", () => {}); }
         module.exports = { register };`,
      ],
    ];
    for (const [path, text] of sources) {
      expect(extract(text, path, { binding: "program" })).toEqual(extract(text, path));
    }
  });
});

describe("robustness against arbitrary input", () => {
  it("never throws and keeps positions 1-based (property)", () => {
    const fragments = [
      "class",
      "function",
      "const",
      "let",
      "import",
      "export",
      "default",
      "from",
      "require",
      "(",
      ")",
      "{",
      "}",
      "[",
      "]",
      "<",
      ">",
      "=>",
      "=",
      ";",
      ",",
      ".",
      "this",
      "super",
      "new",
      "@dec",
      "x",
      "y",
      '"m"',
      "`t${",
      "}`",
      "async",
      "await",
      "yield",
      "namespace",
      "declare",
      "module",
      "enum",
      "interface",
      "type",
      "?",
      ":",
      "/**",
      "*/",
      "\n",
      " ",
      "#p",
      "...",
      "process.env.X",
      "fetch(",
      "exports.a =",
      "module.exports =",
    ];
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...fragments), { maxLength: 60 }),
        fc.constantFrom("src/a.ts", "src/a.tsx", "src/a.js", "src/a.d.ts", "src/a.mjs"),
        (parts, path) => {
          const extraction = extract(parts.join(" "), path);
          const names = new Set(extraction.symbols.map((symbol) => symbol.localName));
          expect(names.size).toBe(extraction.symbols.length);
          for (const reference of extraction.references) {
            expect(reference.line).toBeGreaterThanOrEqual(1);
            expect(reference.column).toBeGreaterThanOrEqual(1);
            if (reference.from !== undefined) expect(names.has(reference.from)).toBe(true);
          }
          for (const symbol of extraction.symbols) {
            if (symbol.parent !== undefined) expect(names.has(symbol.parent)).toBe(true);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("accepts arbitrary unicode text", () => {
    fc.assert(
      fc.property(fc.string({ unit: "grapheme", maxLength: 200 }), (text) => {
        expect(() => extract(text)).not.toThrow();
      }),
      { numRuns: 200 },
    );
  });
});
