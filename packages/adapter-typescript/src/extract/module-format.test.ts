import type { FileExtraction } from "@katedrala/plugin-api";
import { describe, expect, it } from "vitest";
import { detectTypeScriptLanguage } from "../languages.js";
import { resolveTypeScriptAdapterOptions } from "../options.js";
import { extractTypeScriptFile, parseTypeScriptFile } from "./index.js";

function extract(text: string, path = "src/sample.ts"): FileExtraction {
  const detection = detectTypeScriptLanguage(path);
  if (detection === undefined) throw new Error(`unsupported path ${path}`);
  const parsed = parseTypeScriptFile({ path, text, ...detection });
  return extractTypeScriptFile(parsed, resolveTypeScriptAdapterOptions(undefined));
}

const formatOf = (text: string, path?: string): FileExtraction["moduleFormat"] =>
  extract(text, path).moduleFormat;

describe("module format", () => {
  it.each([
    ['import x from "./x";', "esm"],
    ['import type { T } from "./t";', "esm"],
    ['import "./side-effect";', "esm"],
    ["export {};", "esm"],
    ["export const a = 1;", "esm"],
    ["export default 1;", "esm"],
    ['export * from "./x";', "esm"],
    ["const url = import.meta.url;", "esm"],
    ['import x from "./x";\nconst y = require("./y");', "esm"],
    ['const x = require("./x");', "commonjs"],
    ["module.exports = {};", "commonjs"],
    ["exports.a = 1;", "commonjs"],
    ["function f() { return module.exports.a; }", "commonjs"],
    ["Object.defineProperty(exports, '__esModule', { value: true });", "commonjs"],
    ['import fs = require("fs");', "commonjs"],
    ["export = {};", "commonjs"],
    ["const a = 1;", "script"],
    ["function require(x) {}\nrequire('./x');", "script"],
    ["const exports = {};\nexports.a = 1;", "script"],
  ])("%j is %s", (text, format) => {
    expect(formatOf(text)).toBe(format);
  });

  it("uses the extension for .mjs, .mts, .cjs and .cts files", () => {
    expect(formatOf("const a = 1;", "src/a.mjs")).toBe("esm");
    expect(formatOf("const a = 1;", "src/a.mts")).toBe("esm");
    expect(formatOf("const a = 1;", "types/a.d.mts")).toBe("esm");
    expect(formatOf("const a = 1;", "src/a.cjs")).toBe("commonjs");
    expect(formatOf('import x from "./x";', "src/a.cts")).toBe("commonjs");
    expect(formatOf("declare const a: number;", "types/a.d.cts")).toBe("commonjs");
  });

  it("treats declaration files without top-level imports and exports as scripts", () => {
    expect(
      formatOf(
        'declare const VERSION: string;\ndeclare module "x" { export const y: number; }',
        "src/globals.d.ts",
      ),
    ).toBe("script");
    expect(formatOf("export declare const VERSION: string;", "src/version.d.ts")).toBe("esm");
  });
});

describe("globals", () => {
  it("lists top-level declarations of scripts except ambient modules", () => {
    const extraction = extract(
      `declare const VERSION: string;
       declare namespace App { const name: string; }
       declare module "plugin" { export function load(): void; }
       function helper() {}
       interface Shape {}`,
      "src/globals.d.ts",
    );
    expect(extraction.globals).toEqual(["VERSION", "App", "helper", "Shape"]);
  });

  it("lists nothing for modules without declare global", () => {
    expect(extract("export const a = 1;").globals).toBeUndefined();
    expect(extract('const x = require("x");\nfunction f() {}', "src/a.js").globals).toBeUndefined();
  });

  it("lists declarations directly inside declare global", () => {
    const extraction = extract(`
      declare global {
        interface Window { app: unknown }
        namespace NodeJS { interface ProcessEnv { PORT?: string } }
        function track(event: string): void;
      }
      export {};
    `);
    expect(extraction.globals).toEqual(["Window", "NodeJS", "track"]);
    expect(extraction.symbols.map((symbol) => symbol.localName)).toEqual([
      "Window",
      "NodeJS",
      "NodeJS.ProcessEnv",
      "track",
    ]);
  });

  it("lists script declarations of JavaScript files", () => {
    expect(
      extract("var counter = 0;\nfunction increment() { counter++; }", "public/legacy.js").globals,
    ).toEqual(["counter", "increment"]);
  });
});
