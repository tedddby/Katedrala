import type { ExtractedImport, FileExtraction } from "@katedrala/plugin-api";
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

function importsOf(text: string, path?: string): ExtractedImport[] {
  return extract(text, path).imports;
}

describe("ES module imports", () => {
  it("records every import declaration form with its bindings", () => {
    const imports = importsOf(
      [
        'import Default from "./default";',
        'import { a, b as c, type T } from "./named";',
        'import * as ns from "./namespace";',
        'import Main, { helper } from "./mixed";',
        'import Main2, * as all from "./mixed-namespace";',
        'import { "string name" as text } from "./strings";',
        'import { default as renamed } from "./renamed";',
      ].join("\n"),
    );
    expect(imports).toEqual([
      {
        specifier: "./default",
        literal: true,
        kind: "static",
        mechanism: "import-declaration",
        typeOnly: false,
        bindings: [{ local: "Default", imported: "default", typeOnly: false }],
        line: 1,
        column: 1,
      },
      {
        specifier: "./named",
        literal: true,
        kind: "static",
        mechanism: "import-declaration",
        typeOnly: false,
        bindings: [
          { local: "a", imported: "a", typeOnly: false },
          { local: "c", imported: "b", typeOnly: false },
          { local: "T", imported: "T", typeOnly: true },
        ],
        line: 2,
        column: 1,
      },
      {
        specifier: "./namespace",
        literal: true,
        kind: "static",
        mechanism: "import-declaration",
        typeOnly: false,
        bindings: [{ local: "ns", imported: "*", typeOnly: false }],
        line: 3,
        column: 1,
      },
      {
        specifier: "./mixed",
        literal: true,
        kind: "static",
        mechanism: "import-declaration",
        typeOnly: false,
        bindings: [
          { local: "Main", imported: "default", typeOnly: false },
          { local: "helper", imported: "helper", typeOnly: false },
        ],
        line: 4,
        column: 1,
      },
      {
        specifier: "./mixed-namespace",
        literal: true,
        kind: "static",
        mechanism: "import-declaration",
        typeOnly: false,
        bindings: [
          { local: "Main2", imported: "default", typeOnly: false },
          { local: "all", imported: "*", typeOnly: false },
        ],
        line: 5,
        column: 1,
      },
      {
        specifier: "./strings",
        literal: true,
        kind: "static",
        mechanism: "import-declaration",
        typeOnly: false,
        bindings: [{ local: "text", imported: "string name", typeOnly: false }],
        line: 6,
        column: 1,
      },
      {
        specifier: "./renamed",
        literal: true,
        kind: "static",
        mechanism: "import-declaration",
        typeOnly: false,
        bindings: [{ local: "renamed", imported: "default", typeOnly: false }],
        line: 7,
        column: 1,
      },
    ]);
  });

  it("derives typeOnly from syntax only", () => {
    const imports = importsOf(
      [
        'import type { A } from "./a";',
        'import type B from "./b";',
        'import type * as C from "./c";',
        'import { type D, type E } from "./de";',
        'import { type F, G } from "./fg";',
        'import { H } from "./h";',
        "let used: H;",
      ].join("\n"),
    );
    expect(imports.map((entry) => [entry.specifier, entry.typeOnly])).toEqual([
      ["./a", true],
      ["./b", true],
      ["./c", true],
      ["./de", true],
      ["./fg", false],
      ["./h", false],
    ]);
    expect(imports[1]?.bindings).toEqual([{ local: "B", imported: "default", typeOnly: true }]);
    expect(imports[2]?.bindings).toEqual([{ local: "C", imported: "*", typeOnly: true }]);
  });

  it("records side-effect imports and empty import clauses", () => {
    const imports = importsOf('import "./polyfills.js";\nimport {} from "./nothing";\n');
    expect(imports).toEqual([
      {
        specifier: "./polyfills.js",
        literal: true,
        kind: "side-effect",
        mechanism: "side-effect-import",
        typeOnly: false,
        bindings: [],
        line: 1,
        column: 1,
      },
      {
        specifier: "./nothing",
        literal: true,
        kind: "static",
        mechanism: "import-declaration",
        typeOnly: false,
        bindings: [],
        line: 2,
        column: 1,
      },
    ]);
  });

  it("records TypeScript import-equals with the module object binding", () => {
    const imports = importsOf(
      'import legacy = require("./legacy");\nimport type Types = require("./types");\nnamespace N { export const y = 1; }\nimport alias = N.y;\nexport import exported = require("./exported");\n',
    );
    expect(
      imports.map(({ specifier, kind, mechanism, typeOnly, bindings }) => ({
        specifier,
        kind,
        mechanism,
        typeOnly,
        bindings,
      })),
    ).toEqual([
      {
        specifier: "./legacy",
        kind: "static",
        mechanism: "import-equals",
        typeOnly: false,
        bindings: [{ local: "legacy", imported: "=", typeOnly: false }],
      },
      {
        specifier: "./types",
        kind: "static",
        mechanism: "import-equals",
        typeOnly: true,
        bindings: [{ local: "Types", imported: "=", typeOnly: true }],
      },
      {
        specifier: "./exported",
        kind: "static",
        mechanism: "import-equals",
        typeOnly: false,
        bindings: [{ local: "exported", imported: "=", typeOnly: false }],
      },
    ]);
  });

  it("records re-exports", () => {
    const imports = importsOf(
      [
        'export { a, b as c } from "./named";',
        'export * from "./all";',
        'export * as ns from "./namespace";',
        'export type { T } from "./types";',
        'export { type U, type V } from "./type-specifiers";',
        'export { type W, x } from "./mixed";',
        'export type * from "./type-all";',
        "export { local };",
        "const local = 1;",
      ].join("\n"),
    );
    expect(
      imports.map(({ specifier, kind, mechanism, typeOnly, bindings }) => [
        specifier,
        kind,
        mechanism,
        typeOnly,
        bindings,
      ]),
    ).toEqual([
      ["./named", "re-export", "export-from", false, []],
      ["./all", "re-export", "export-all", false, []],
      ["./namespace", "re-export", "export-all", false, []],
      ["./types", "re-export", "export-from", true, []],
      ["./type-specifiers", "re-export", "export-from", true, []],
      ["./mixed", "re-export", "export-from", false, []],
      ["./type-all", "re-export", "export-all", true, []],
    ]);
  });
});

describe("dynamic imports", () => {
  it("records literal, template and non-literal dynamic imports with the enclosing symbol", () => {
    const imports = importsOf(
      [
        "export class Shop {",
        "  async report(name: string) {",
        '    const { build, default: main } = await import("./lazy");',
        "    const ns = await import(`./pages/home`);",
        "    await import(`./locales/${name}.js`);",
        "    import(modulePath).then((m) => m.run());",
        "  }",
        "}",
        'const page = import("./page");',
      ].join("\n"),
    );
    expect(imports).toEqual([
      {
        specifier: "./lazy",
        literal: true,
        kind: "dynamic",
        mechanism: "dynamic-import",
        typeOnly: false,
        bindings: [
          { local: "build", imported: "build", typeOnly: false },
          { local: "main", imported: "default", typeOnly: false },
        ],
        line: 3,
        column: 44,
        from: "Shop.report",
      },
      {
        specifier: "./pages/home",
        literal: true,
        kind: "dynamic",
        mechanism: "dynamic-import",
        typeOnly: false,
        bindings: [{ local: "ns", imported: "*", typeOnly: false }],
        line: 4,
        column: 22,
        from: "Shop.report",
      },
      {
        specifier: "`./locales/${name}.js`",
        literal: false,
        kind: "dynamic",
        mechanism: "dynamic-import",
        typeOnly: false,
        bindings: [],
        line: 5,
        column: 11,
        from: "Shop.report",
      },
      {
        specifier: "modulePath",
        literal: false,
        kind: "dynamic",
        mechanism: "dynamic-import",
        typeOnly: false,
        bindings: [],
        line: 6,
        column: 5,
        from: "Shop.report",
      },
      {
        specifier: "./page",
        literal: true,
        kind: "dynamic",
        mechanism: "dynamic-import",
        typeOnly: false,
        bindings: [],
        line: 9,
        column: 14,
        from: "page",
      },
    ]);
  });
});

describe("CommonJS require", () => {
  it("records require calls with their bindings", () => {
    const imports = importsOf(
      [
        'const express = require("express");',
        'const { join, resolve: absolute } = require("path");',
        'const helper = require("./helpers").helper;',
        'const other = require("./helpers")["other"];',
        'require("./side-effect");',
        'const app = require("express")();',
        "function load(name) {",
        '  const plugin = require("./plugins/" + name);',
        '  const config = require("./config.json");',
        "  return require(name);",
        "}",
        "module.exports = { load };",
      ].join("\n"),
      "src/server.js",
    );
    expect(
      imports.map(({ specifier, literal, kind, mechanism, bindings, from, line }) => ({
        specifier,
        literal,
        kind,
        mechanism,
        bindings,
        from,
        line,
      })),
    ).toEqual([
      {
        specifier: "express",
        literal: true,
        kind: "static",
        mechanism: "require-call",
        bindings: [{ local: "express", imported: "=", typeOnly: false }],
        from: undefined,
        line: 1,
      },
      {
        specifier: "path",
        literal: true,
        kind: "static",
        mechanism: "require-call",
        bindings: [
          { local: "join", imported: "join", typeOnly: false },
          { local: "absolute", imported: "resolve", typeOnly: false },
        ],
        from: undefined,
        line: 2,
      },
      {
        specifier: "./helpers",
        literal: true,
        kind: "static",
        mechanism: "require-call",
        bindings: [{ local: "helper", imported: "helper", typeOnly: false }],
        from: undefined,
        line: 3,
      },
      {
        specifier: "./helpers",
        literal: true,
        kind: "static",
        mechanism: "require-call",
        bindings: [{ local: "other", imported: "other", typeOnly: false }],
        from: undefined,
        line: 4,
      },
      {
        specifier: "./side-effect",
        literal: true,
        kind: "static",
        mechanism: "require-call",
        bindings: [],
        from: undefined,
        line: 5,
      },
      {
        specifier: "express",
        literal: true,
        kind: "static",
        mechanism: "require-call",
        bindings: [],
        from: "app",
        line: 6,
      },
      {
        specifier: '"./plugins/" + name',
        literal: false,
        kind: "static",
        mechanism: "require-call",
        bindings: [],
        from: "load",
        line: 8,
      },
      {
        specifier: "./config.json",
        literal: true,
        kind: "static",
        mechanism: "require-call",
        bindings: [{ local: "config", imported: "=", typeOnly: false }],
        from: "load",
        line: 9,
      },
      {
        specifier: "name",
        literal: false,
        kind: "static",
        mechanism: "require-call",
        bindings: [],
        from: "load",
        line: 10,
      },
    ]);
  });

  it("ignores require when it is locally rebound", () => {
    const imports = importsOf(
      [
        "function withLoader(require) {",
        '  return require("./not-an-import");',
        "}",
        "function inner() {",
        "  const require = makeRequire();",
        '  require("./also-not");',
        "}",
        'require("./real");',
      ].join("\n"),
      "src/loader.js",
    );
    expect(imports.map((entry) => entry.specifier)).toEqual(["./real"]);
  });

  it("does not treat require.resolve as an import", () => {
    expect(importsOf('const where = require.resolve("./x");', "src/where.js")).toEqual([]);
  });

  it("records require calls through a local module loader (createRequire)", () => {
    const extraction = extract(
      [
        'import { createRequire } from "node:module";',
        "const require = createRequire(import.meta.url);",
        'const pkg = require("../package.json");',
        'const legacy = require("./legacy.cjs");',
        'const { helper } = require("./helpers.cjs");',
        'require("./side-effect.cjs");',
        "export function version() { return pkg.version + legacy.name + helper(); }",
      ].join("\n"),
      "src/cli.mjs",
    );
    expect(
      extraction.imports.map(({ specifier, mechanism, bindings }) => ({
        specifier,
        mechanism,
        bindings,
      })),
    ).toEqual([
      {
        specifier: "node:module",
        mechanism: "import-declaration",
        bindings: [{ local: "createRequire", imported: "createRequire", typeOnly: false }],
      },
      {
        specifier: "../package.json",
        mechanism: "require-call",
        bindings: [{ local: "pkg", imported: "=", typeOnly: false }],
      },
      {
        specifier: "./legacy.cjs",
        mechanism: "require-call",
        bindings: [{ local: "legacy", imported: "=", typeOnly: false }],
      },
      {
        specifier: "./helpers.cjs",
        mechanism: "require-call",
        bindings: [{ local: "helper", imported: "helper", typeOnly: false }],
      },
      { specifier: "./side-effect.cjs", mechanism: "require-call", bindings: [] },
    ]);
    // The loaded modules are import bindings, not constants of the file.
    expect(extraction.symbols.map((symbol) => symbol.localName)).toEqual(["require", "version"]);
    expect(
      extraction.references
        .filter((reference) => reference.from === "version")
        .map((reference) => reference.target),
    ).toEqual([
      { type: "import", local: "pkg", members: ["version"] },
      { type: "import", local: "legacy", members: ["name"] },
      { type: "import", local: "helper", members: [] },
    ]);
    expect(
      importsOf(
        'import module from "node:module";\nconst require = module.createRequire(import.meta.url);\nconst pkg = require("./package.json");\n',
        "src/meta.mjs",
      ).map((entry) => entry.specifier),
    ).toEqual(["node:module", "./package.json"]);
  });

  it("records require calls through the require parameter of an AMD factory", () => {
    const extraction = extract(
      [
        'define(["require"], function (require) {',
        '  const dep = require("./dep");',
        '  require("./other").start();',
        "  return dep;",
        "});",
      ].join("\n"),
      "src/amd.js",
    );
    expect(extraction.imports.map((entry) => [entry.specifier, entry.bindings])).toEqual([
      ["./dep", [{ local: "dep", imported: "=", typeOnly: false }]],
      ["./other", []],
    ]);
    expect(extraction.references.map((reference) => reference.target).slice(1)).toEqual([
      { type: "module", specifier: "./other", members: ["start"] },
      { type: "import", local: "dep", members: [] },
    ]);
  });
});

describe("triple-slash references and import types", () => {
  it("records path and types references but not lib references", () => {
    const imports = importsOf(
      '/// <reference path="./globals.d.ts" />\n  /// <reference types="node" />\n/// <reference lib="es2020" />\nimport "./x";\n',
    );
    expect(imports.slice(0, 2)).toEqual([
      {
        specifier: "./globals.d.ts",
        literal: true,
        kind: "include",
        mechanism: "triple-slash-reference",
        typeOnly: true,
        bindings: [],
        line: 1,
        column: 1,
      },
      {
        specifier: "node",
        literal: true,
        kind: "include",
        mechanism: "triple-slash-reference",
        typeOnly: true,
        bindings: [],
        line: 2,
        column: 3,
      },
    ]);
    expect(imports).toHaveLength(3);
  });

  it("records import types in type positions", () => {
    const imports = importsOf(
      [
        'export type Settings = import("./config").Settings;',
        "export function load(): typeof import('./loader') { return null!; }",
      ].join("\n"),
    );
    expect(imports).toEqual([
      {
        specifier: "./config",
        literal: true,
        kind: "static",
        mechanism: "type-import",
        typeOnly: true,
        bindings: [],
        line: 1,
        column: 24,
        from: "Settings",
      },
      {
        specifier: "./loader",
        literal: true,
        kind: "static",
        mechanism: "type-import",
        typeOnly: true,
        bindings: [],
        line: 2,
        column: 25,
        from: "load",
      },
    ]);
  });

  it("records import types and @import tags in JSDoc of JavaScript files", () => {
    const imports = importsOf(
      [
        '/** @import { Router } from "express" */',
        "/**",
        ' * @param {import("./store").Store} store',
        " */",
        "function handler(store) {}",
        '/** @typedef {import("./types").Todo} Todo */',
        "module.exports = handler;",
      ].join("\n"),
      "src/handler.js",
    );
    expect(imports).toEqual([
      {
        specifier: "express",
        literal: true,
        kind: "static",
        mechanism: "type-import",
        typeOnly: true,
        bindings: [{ local: "Router", imported: "Router", typeOnly: true }],
        line: 1,
        column: 5,
      },
      {
        specifier: "./store",
        literal: true,
        kind: "static",
        mechanism: "type-import",
        typeOnly: true,
        bindings: [],
        line: 3,
        column: 12,
        from: "handler",
      },
      {
        specifier: "./types",
        literal: true,
        kind: "static",
        mechanism: "type-import",
        typeOnly: true,
        bindings: [],
        line: 6,
        column: 15,
      },
    ]);
  });

  it("ignores JSDoc in TypeScript files", () => {
    expect(
      importsOf('/** @param {import("./x").X} a */\nexport function f(a: unknown) {}\n'),
    ).toEqual([]);
  });
});

describe("ordering and nesting", () => {
  it("lists imports in source order", () => {
    const imports = importsOf(
      [
        '/// <reference types="vite/client" />',
        'import { a } from "./a";',
        "export async function run() {",
        '  await import("./lazy");',
        '  const helper = require("./helper");',
        "}",
        'export { b } from "./b";',
        'type T = import("./t").T;',
      ].join("\n"),
    );
    expect(imports.map((entry) => entry.specifier)).toEqual([
      "vite/client",
      "./a",
      "./lazy",
      "./helper",
      "./b",
      "./t",
    ]);
  });

  it("attributes imports inside ambient module declarations to the module", () => {
    const imports = importsOf(
      'declare module "plugin" {\n  import { Base } from "base";\n  export class P extends Base {}\n}\n',
      "src/plugin.d.ts",
    );
    expect(imports).toEqual([
      {
        specifier: "base",
        literal: true,
        kind: "static",
        mechanism: "import-declaration",
        typeOnly: false,
        bindings: [{ local: "Base", imported: "Base", typeOnly: false }],
        line: 2,
        column: 3,
        from: '"plugin"',
      },
    ]);
  });

  it("keeps imports before a syntax error", () => {
    const extraction = extract(
      'import { a } from "./a";\nimport { b } from "./b";\nexport function f() {\n  const x = a(b;\n}\n',
    );
    expect(extraction.syntaxErrors.length).toBeGreaterThan(0);
    expect(extraction.imports.map((entry) => entry.specifier)).toEqual(["./a", "./b"]);
  });
});
