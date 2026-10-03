import type { ExtractedExport, FileExtraction } from "@katedrala/plugin-api";
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

/** Exports without positions, for compact assertions. */
function exportsOf(text: string, path?: string): Array<Omit<ExtractedExport, "line" | "column">> {
  return extract(text, path).exports.map(({ line: _line, column: _column, ...rest }) => rest);
}

const symbolRef = (localName: string) => ({ type: "symbol" as const, localName, members: [] });

describe("ES module exports", () => {
  it("lists exported declarations of every kind", () => {
    expect(
      exportsOf(`
        export function run() {}
        export class Service {}
        export interface Port {}
        export type Id = string;
        export enum Color { Red }
        export const enum Flags { A }
        export namespace Tools {}
        export declare const VERSION: string;
        export const a = 1, b = 2;
        export const { c, d: [e] } = source;
        export abstract class Base {}
      `),
    ).toEqual([
      { name: "run", typeOnly: false, targets: [symbolRef("run")] },
      { name: "Service", typeOnly: false, targets: [symbolRef("Service")] },
      { name: "Port", typeOnly: true, targets: [symbolRef("Port")] },
      { name: "Id", typeOnly: true, targets: [symbolRef("Id")] },
      { name: "Color", typeOnly: false, targets: [symbolRef("Color")] },
      { name: "Flags", typeOnly: false, targets: [symbolRef("Flags")] },
      { name: "Tools", typeOnly: false, targets: [symbolRef("Tools")] },
      { name: "VERSION", typeOnly: false, targets: [symbolRef("VERSION")] },
      { name: "a", typeOnly: false, targets: [symbolRef("a")] },
      { name: "b", typeOnly: false, targets: [symbolRef("b")] },
      { name: "c", typeOnly: false, targets: [symbolRef("c")] },
      { name: "e", typeOnly: false, targets: [symbolRef("e")] },
      { name: "Base", typeOnly: false, targets: [symbolRef("Base")] },
    ]);
  });

  it("merges one name with several declarations into one entry", () => {
    expect(exportsOf("export const User = {};\nexport type User = { id: string };\n")).toEqual([
      { name: "User", typeOnly: false, targets: [symbolRef("User"), symbolRef("User~type-alias")] },
    ]);
    expect(
      exportsOf("export function f(a: string): void;\nexport function f(a: unknown) {}\n"),
    ).toEqual([{ name: "f", typeOnly: false, targets: [symbolRef("f")] }]);
    expect(
      exportsOf(
        "export interface Order { id: string }\nexport interface Order { total: number }\n",
      ),
    ).toEqual([{ name: "Order", typeOnly: true, targets: [symbolRef("Order")] }]);
  });

  it("lists export specifiers with the bindings they denote", () => {
    expect(
      exportsOf(`
        import { imported } from "./imported";
        import type { Shape } from "./shape";
        const value = 1;
        type Value = number;
        interface Model {}
        function helper() {}
        export { value, helper as util, imported, Shape, Model, value as default };
        export type { helper as helperType };
        export { type Model as ModelType };
      `),
    ).toEqual([
      { name: "value", typeOnly: false, targets: [symbolRef("value")] },
      { name: "util", typeOnly: false, targets: [symbolRef("helper")] },
      {
        name: "imported",
        typeOnly: false,
        targets: [{ type: "import", local: "imported", members: [] }],
      },
      { name: "Shape", typeOnly: true, targets: [{ type: "import", local: "Shape", members: [] }] },
      { name: "Model", typeOnly: true, targets: [symbolRef("Model")] },
      { name: "default", typeOnly: false, targets: [symbolRef("value")] },
      { name: "helperType", typeOnly: true, targets: [symbolRef("helper")] },
      { name: "ModelType", typeOnly: true, targets: [symbolRef("Model")] },
    ]);
  });

  it("targets every declaration a specifier names", () => {
    expect(exportsOf("const User = {};\ntype User = { id: string };\nexport { User };\n")).toEqual([
      { name: "User", typeOnly: false, targets: [symbolRef("User"), symbolRef("User~type-alias")] },
    ]);
  });

  it("lists default exports", () => {
    expect(exportsOf("export default class Shop {}")).toEqual([
      { name: "default", typeOnly: false, targets: [symbolRef("Shop")] },
    ]);
    expect(exportsOf("export default function () {}")).toEqual([
      { name: "default", typeOnly: false, targets: [symbolRef("default")] },
    ]);
    expect(exportsOf("const app = 1;\nexport default app;")).toEqual([
      { name: "default", typeOnly: false, targets: [symbolRef("app")] },
    ]);
    expect(exportsOf("export default { port: 1 };")).toEqual([
      { name: "default", typeOnly: false, targets: [symbolRef("default")] },
    ]);
    expect(exportsOf('import config from "./config";\nexport default config.server;')).toEqual([
      {
        name: "default",
        typeOnly: false,
        targets: [{ type: "import", local: "config", members: ["server"] }],
      },
    ]);
    expect(exportsOf("export default interface Props { id: string }")).toEqual([
      { name: "default", typeOnly: true, targets: [symbolRef("Props")] },
    ]);
  });

  it("lists export assignments as =", () => {
    expect(
      exportsOf(
        "function legacy() {}\nnamespace legacy { export const v = 1; }\nexport = legacy;\n",
      ),
    ).toEqual([
      { name: "=", typeOnly: false, targets: [symbolRef("legacy"), symbolRef("legacy~namespace")] },
    ]);
    expect(exportsOf("export = { run() {}, limit: 1 };")).toEqual([
      { name: "run", typeOnly: false, targets: [symbolRef("run")] },
      { name: "limit", typeOnly: false },
      { name: "=", typeOnly: false },
    ]);
  });

  it("lists re-exports with their source and imported names", () => {
    expect(
      exportsOf(`
        export * from "./all";
        export * as billing from "./billing";
        export { a, b as c, default as Shop, default } from "./named";
        export type { T } from "./types";
        export { type U, v } from "./mixed";
        export type * as Types from "./type-namespace";
      `),
    ).toEqual([
      { name: "*", from: "./all", typeOnly: false },
      { name: "billing", from: "./billing", imported: "*", typeOnly: false },
      { name: "a", from: "./named", imported: "a", typeOnly: false },
      { name: "c", from: "./named", imported: "b", typeOnly: false },
      { name: "Shop", from: "./named", imported: "default", typeOnly: false },
      { name: "default", from: "./named", imported: "default", typeOnly: false },
      { name: "T", from: "./types", imported: "T", typeOnly: true },
      { name: "U", from: "./mixed", imported: "U", typeOnly: true },
      { name: "v", from: "./mixed", imported: "v", typeOnly: false },
      { name: "Types", from: "./type-namespace", imported: "*", typeOnly: true },
    ]);
  });

  it("keeps several export * entries separate", () => {
    expect(exportsOf('export * from "./a";\nexport * from "./b";\n')).toEqual([
      { name: "*", from: "./a", typeOnly: false },
      { name: "*", from: "./b", typeOnly: false },
    ]);
  });

  it("does not list namespace members, ambient module members or empty export lists", () => {
    expect(
      exportsOf(`
        namespace N { export const inner = 1; }
        declare module "x" { export function f(): void; }
        declare global { var g: string; }
        export {};
      `),
    ).toEqual([]);
  });

  it("lists exported import aliases", () => {
    expect(
      exportsOf(
        'namespace Shapes { export class Circle {} }\nexport import Circle = Shapes.Circle;\nexport import fs = require("fs");\n',
      ),
    ).toEqual([
      { name: "Circle", typeOnly: false, targets: [symbolRef("Shapes.Circle")] },
      { name: "fs", typeOnly: false, targets: [{ type: "import", local: "fs", members: [] }] },
    ]);
  });

  it("records the position of each export", () => {
    const exports = extract(
      'export const a = 1;\nexport { a as b };\nexport * from "./c";\n',
    ).exports;
    expect(exports.map((entry) => [entry.name, entry.line, entry.column])).toEqual([
      ["a", 1, 14],
      ["b", 2, 10],
      ["*", 3, 1],
    ]);
  });
});

describe("CommonJS exports", () => {
  it("lists module.exports = identifier as =", () => {
    expect(exportsOf("function app() {}\nmodule.exports = app;\n", "src/app.js")).toEqual([
      { name: "=", typeOnly: false, targets: [symbolRef("app")] },
    ]);
  });

  it("lists module.exports object members plus = without targets", () => {
    expect(
      exportsOf(
        `const { validate } = require("./validation");
         function a() {}
         module.exports = {
           a,
           validate,
           b: () => {},
           c: require("./c"),
           d: require("./d").inner,
           e: a,
           f: 42,
           method() {},
           ["computed"]: 1,
         };`,
        "src/api.js",
      ),
    ).toEqual([
      { name: "a", typeOnly: false, targets: [symbolRef("a")] },
      {
        name: "validate",
        typeOnly: false,
        targets: [{ type: "import", local: "validate", members: [] }],
      },
      { name: "b", typeOnly: false, targets: [symbolRef("b")] },
      { name: "c", typeOnly: false, targets: [{ type: "module", specifier: "./c", members: [] }] },
      {
        name: "d",
        typeOnly: false,
        targets: [{ type: "module", specifier: "./d", members: ["inner"] }],
      },
      { name: "e", typeOnly: false, targets: [symbolRef("a")] },
      { name: "f", typeOnly: false },
      { name: "method", typeOnly: false, targets: [symbolRef("method")] },
      { name: "computed", typeOnly: false },
      { name: "=", typeOnly: false },
    ]);
  });

  it("lists exports.x and module.exports.x assignments", () => {
    expect(
      exportsOf(
        `function listTodos() {}
         exports.listTodos = listTodos;
         exports.create = function () {};
         module.exports.remove = async () => {};
         exports.version = "1.0";
         exports.listTodos = listTodos;`,
        "src/todos.js",
      ),
    ).toEqual([
      { name: "listTodos", typeOnly: false, targets: [symbolRef("listTodos")] },
      { name: "create", typeOnly: false, targets: [symbolRef("create")] },
      { name: "remove", typeOnly: false, targets: [symbolRef("remove")] },
      { name: "version", typeOnly: false, targets: [symbolRef("version")] },
    ]);
  });

  it("lists other module.exports values as = with the created symbol", () => {
    expect(exportsOf("module.exports = function (app) {};", "src/plugin.js")).toEqual([
      { name: "=", typeOnly: false, targets: [symbolRef("default")] },
    ]);
    expect(exportsOf('module.exports = require("./impl");', "src/index.js")).toEqual([
      {
        name: "=",
        typeOnly: false,
        targets: [{ type: "module", specifier: "./impl", members: [] }],
      },
    ]);
  });

  it("lists exports = module.exports = value (as in Express) as the export assignment of value", () => {
    const express = extract(
      [
        "'use strict';",
        "var proto = require('./application');",
        "exports = module.exports = createApplication;",
        "function createApplication() { return proto; }",
        "exports.application = proto;",
        "",
      ].join("\n"),
      "lib/express.js",
    );
    expect(express.exports.map(({ line: _line, column: _column, ...rest }) => rest)).toEqual([
      { name: "=", typeOnly: false, targets: [symbolRef("createApplication")] },
      {
        name: "application",
        typeOnly: false,
        targets: [{ type: "import", local: "proto", members: [] }],
      },
    ]);
    // The statement reads nothing: `exports` and `module.exports` are written, the value is exported.
    expect(express.references.filter((reference) => reference.line === 3)).toEqual([]);
    expect(express.symbols.map((symbol) => symbol.localName)).toEqual(["createApplication"]);
    expect(express.moduleFormat).toBe("commonjs");
    // The other order, and a function value.
    expect(
      exportsOf(
        "module.exports = exports = Foo;\nfunction Foo() {}\nexports.bar = 1;\n",
        "lib/f.js",
      ),
    ).toEqual([
      { name: "=", typeOnly: false, targets: [symbolRef("Foo")] },
      { name: "bar", typeOnly: false, targets: [symbolRef("bar")] },
    ]);
    expect(exportsOf("exports = module.exports = function app() {};\n", "lib/app.js")).toEqual([
      { name: "=", typeOnly: false, targets: [symbolRef("default")] },
    ]);
    // Rebinding `exports` alone exports nothing.
    expect(exportsOf("exports = run;\nfunction run() {}\n", "lib/run.js")).toEqual([]);
  });

  it("ignores assignments nested in blocks and to rebound exports", () => {
    expect(exportsOf("if (x) { module.exports = y; }", "src/a.js")).toEqual([]);
    expect(exportsOf("const module = {};\nmodule.exports = 1;", "src/b.js")).toEqual([]);
  });
});
