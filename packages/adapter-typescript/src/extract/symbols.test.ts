import type { ExtractedSymbol, FileExtraction } from "@katedrala/plugin-api";
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

function symbolsOf(text: string, path?: string): ExtractedSymbol[] {
  return extract(text, path).symbols;
}

function symbol(symbols: readonly ExtractedSymbol[], localName: string): ExtractedSymbol {
  const found = symbols.find((candidate) => candidate.localName === localName);
  if (found === undefined) {
    throw new Error(`no symbol ${localName} in ${symbols.map((s) => s.localName).join(", ")}`);
  }
  return found;
}

function kinds(symbols: readonly ExtractedSymbol[]): Array<[string, string]> {
  return symbols.map((candidate) => [candidate.localName, candidate.kind]);
}

describe("symbol kinds", () => {
  it("extracts every top-level declaration kind", () => {
    const symbols = symbolsOf(`
      function run(): void {}
      class Service {}
      interface Port { send(): void }
      type Id = string | number;
      enum Color { Red, Green }
      namespace Tools { export const version = 1; }
      declare module "legacy-lib" { export function setup(): void; }
      const LIMIT = 10;
      let counter = 0;
      var legacy = true;
      const handler = (request: unknown) => request;
      const compute = function () { return 1; };
      const Model = class {};
    `);
    expect(kinds(symbols)).toEqual([
      ["run", "function"],
      ["Service", "class"],
      ["Port", "interface"],
      ["Id", "type-alias"],
      ["Color", "enum"],
      ["Tools", "namespace"],
      ["Tools.version", "constant"],
      ['"legacy-lib"', "module"],
      ['"legacy-lib".setup', "function"],
      ["LIMIT", "constant"],
      ["counter", "variable"],
      ["legacy", "variable"],
      ["handler", "function"],
      ["compute", "function"],
      ["Model", "class"],
    ]);
    expect(symbol(symbols, '"legacy-lib".setup').parent).toBe('"legacy-lib"');
    expect(symbol(symbols, "Tools.version").parent).toBe("Tools");
  });

  it("extracts one symbol per name bound by destructuring", () => {
    const symbols = symbolsOf(`
      const { a, b: renamed, nested: { c }, ...rest } = source();
      let [first, , third = 3] = list;
    `);
    expect(kinds(symbols)).toEqual([
      ["a", "constant"],
      ["renamed", "constant"],
      ["c", "constant"],
      ["rest", "constant"],
      ["first", "variable"],
      ["third", "variable"],
    ]);
    expect(symbol(symbols, "renamed").signature).toBe("const renamed");
  });

  it("treats ambient constants as constants and ambient vars as variables", () => {
    const symbols = symbolsOf(
      "declare const VERSION: string;\ndeclare var flags: Record<string, boolean>;\n",
      "src/globals.d.ts",
    );
    expect(kinds(symbols)).toEqual([
      ["VERSION", "constant"],
      ["flags", "variable"],
    ]);
    expect(symbol(symbols, "VERSION").modifiers).toEqual(["declare"]);
  });

  it("names nested namespaces with dotted qualified names", () => {
    const symbols = symbolsOf(`
      namespace Tax.EU {
        export function vatFor(country: string): number { return 0.2; }
        export namespace Rates { export const DE = 0.19; }
      }
    `);
    expect(kinds(symbols)).toEqual([
      ["Tax", "namespace"],
      ["Tax.EU", "namespace"],
      ["Tax.EU.vatFor", "function"],
      ["Tax.EU.Rates", "namespace"],
      ["Tax.EU.Rates.DE", "constant"],
    ]);
    expect(symbol(symbols, "Tax.EU").parent).toBe("Tax");
    expect(symbol(symbols, "Tax.EU.vatFor").parent).toBe("Tax.EU");
    expect(symbol(symbols, "Tax").signature).toBe("namespace Tax");
    expect(symbol(symbols, "Tax.EU").signature).toBe("namespace Tax.EU");
  });

  it("states whether namespace and module members are exported from their body", () => {
    const symbols = symbolsOf(`
      export namespace Util {
        export function shown() {}
        function hidden() {}
        export const { a } = {} as { a: number }, b = 1;
        const secret = 2;
        export class Visible { m() {} }
        export namespace Inner { export const deep = 1; let local = 0; }
        namespace Private { export const x = 1; }
      }
      namespace Tax.EU { export const rate = 0.2; function internal() {} }
      declare namespace Ambient { function implicit(): void; const value: number; }
      declare namespace Listed { function local(): void; export function api(): void; export {}; }
      declare module "legacy" { function setup(): void; }
      export function topLevel() {}
    `);
    const exported = (localName: string): boolean | undefined =>
      symbol(symbols, localName).exported;
    expect(exported("Util.shown")).toBe(true);
    expect(exported("Util.hidden")).toBe(false);
    expect([exported("Util.a"), exported("Util.b"), exported("Util.secret")]).toEqual([
      true,
      true,
      false,
    ]);
    expect(exported("Util.Visible")).toBe(true);
    // Class members are not members of a namespace body: the linker decides.
    expect(exported("Util.Visible.m")).toBeUndefined();
    expect([
      exported("Util.Inner"),
      exported("Util.Inner.deep"),
      exported("Util.Inner.local"),
    ]).toEqual([true, true, false]);
    // Exported from its namespace; the linker hides it behind the unexported `Private`.
    expect([exported("Util.Private"), exported("Util.Private.x")]).toEqual([false, true]);
    // The inner namespace of a dotted name is exported from the outer one.
    expect([exported("Tax.EU"), exported("Tax.EU.rate"), exported("Tax.EU.internal")]).toEqual([
      true,
      true,
      false,
    ]);
    // Ambient bodies export every member, unless they declare their exports.
    expect([exported("Ambient.implicit"), exported("Ambient.value")]).toEqual([true, true]);
    expect([exported("Listed.local"), exported("Listed.api")]).toEqual([false, true]);
    expect(exported('"legacy".setup')).toBe(true);
    // File-level declarations are left to the file's exports.
    for (const localName of ["Util", "Tax", "Ambient", "topLevel"]) {
      expect(exported(localName)).toBeUndefined();
    }
  });

  it("merges namespace declarations and keeps members of every block", () => {
    const symbols = symbolsOf(`
      namespace N { export const a = 1; }
      namespace N { export const b = 2; }
    `);
    expect(kinds(symbols)).toEqual([
      ["N", "namespace"],
      ["N.a", "constant"],
      ["N.b", "constant"],
    ]);
    expect(symbol(symbols, "N").declarations).toHaveLength(2);
  });

  it("does not create symbols for declarations inside function bodies", () => {
    const symbols = symbolsOf(`
      function outer() {
        const inner = 1;
        function helper() {}
        class Local {}
        return inner;
      }
      if (ready) { var hoisted = 1; }
    `);
    expect(kinds(symbols)).toEqual([["outer", "function"]]);
  });

  it("does not create symbols for require and dynamic-import bindings", () => {
    const symbols = symbolsOf(
      `const express = require("express");
       const { join } = require("path");
       const helper = require("./helper").helper;
       const app = require("express")();
       module.exports = { app };`,
      "src/server.js",
    );
    expect(kinds(symbols)).toEqual([["app", "constant"]]);
  });
});

describe("functions and overloads", () => {
  it("merges overloads into one symbol whose range is the implementation", () => {
    const source = [
      "export function format(value: number): string;",
      "export function format(value: string): string;",
      "export function format(value: unknown): string {",
      "  return String(value);",
      "}",
    ].join("\n");
    const symbols = symbolsOf(source);
    expect(symbols).toHaveLength(1);
    const format = symbol(symbols, "format");
    expect(format.range).toEqual({ start: { line: 3, column: 1 }, end: { line: 5, column: 2 } });
    expect(format.declarations).toEqual([
      {
        range: { start: { line: 1, column: 1 }, end: { line: 1, column: 47 } },
        signature: "function format(value: number): string",
      },
      {
        range: { start: { line: 2, column: 1 }, end: { line: 2, column: 47 } },
        signature: "function format(value: string): string",
      },
      {
        range: { start: { line: 3, column: 1 }, end: { line: 5, column: 2 } },
        signature: "function format(value: unknown): string",
      },
    ]);
    expect(format.signature).toBe("function format(value: unknown): string");
  });

  it("uses the first declaration as range when no overload has a body", () => {
    const symbols = symbolsOf(
      "declare function f(a: string): void;\ndeclare function f(a: number): void;\n",
    );
    const f = symbol(symbols, "f");
    expect(f.range.start.line).toBe(1);
    expect(f.declarations).toHaveLength(2);
    expect(f.modifiers).toEqual(["declare"]);
  });

  it("merges method and constructor overloads", () => {
    const symbols = symbolsOf(`
      class Repo {
        constructor(name: string);
        constructor(name: string, size?: number) {}
        find(id: string): Item;
        find(filter: (item: Item) => boolean): Item[];
        find(arg: unknown): unknown { return arg; }
      }
    `);
    expect(kinds(symbols)).toEqual([
      ["Repo", "class"],
      ["Repo.constructor", "constructor"],
      ["Repo.find", "method"],
    ]);
    expect(symbol(symbols, "Repo.constructor").declarations).toHaveLength(2);
    expect(symbol(symbols, "Repo.find").declarations).toHaveLength(3);
  });

  it("records async and generator modifiers", () => {
    const symbols = symbolsOf(`
      export async function load() {}
      function* ids() {}
      const fetchAll = async () => [];
      class S { async *stream() {} }
    `);
    expect(symbol(symbols, "load").modifiers).toEqual(["async"]);
    expect(symbol(symbols, "ids").modifiers).toEqual(["generator"]);
    expect(symbol(symbols, "fetchAll").modifiers).toEqual(["async"]);
    expect(symbol(symbols, "S.stream").modifiers).toEqual(["async", "generator"]);
  });
});

describe("naming precedence and disambiguation", () => {
  it("gives the class the bare name when merged with a namespace", () => {
    const symbols = symbolsOf(`
      export class Invoice { render() {} }
      export namespace Invoice { export function fromOrder() {} }
    `);
    expect(kinds(symbols)).toEqual([
      ["Invoice", "class"],
      ["Invoice.render", "method"],
      ["Invoice~namespace", "namespace"],
      ["Invoice.fromOrder", "function"],
    ]);
    expect(symbol(symbols, "Invoice.fromOrder").parent).toBe("Invoice~namespace");
  });

  it("gives the function the bare name when merged with a namespace", () => {
    const symbols = symbolsOf(`
      function legacy() {}
      namespace legacy { export const version = "1"; }
      export = legacy;
    `);
    expect(kinds(symbols)).toEqual([
      ["legacy", "function"],
      ["legacy~namespace", "namespace"],
      ["legacy.version", "constant"],
    ]);
  });

  it("names a constant and a type of the same name independently of source order", () => {
    const constantFirst = symbolsOf(
      "export const User = {};\nexport type User = { id: string };\n",
    );
    const typeFirst = symbolsOf("export type User = { id: string };\nexport const User = {};\n");
    expect(kinds(constantFirst)).toEqual([
      ["User", "constant"],
      ["User~type-alias", "type-alias"],
    ]);
    expect(kinds(typeFirst)).toEqual([
      ["User~type-alias", "type-alias"],
      ["User", "constant"],
    ]);
  });

  it("separates static and instance members with the same name", () => {
    const symbols = symbolsOf(`
      class Factory {
        static create(): Factory { return new Factory(); }
        create(): void {}
        static count = 0;
        count = 1;
      }
    `);
    expect(kinds(symbols)).toEqual([
      ["Factory", "class"],
      ["Factory.create~method-static", "method"],
      ["Factory.create", "method"],
      ["Factory.count~property-static", "property"],
      ["Factory.count", "property"],
    ]);
    expect(symbol(symbols, "Factory.create~method-static").modifiers).toEqual(["static"]);
  });

  it("disambiguates an interface merged with a class", () => {
    const symbols = symbolsOf(
      "interface Box { size: number }\nclass Box {}\ninterface Box { label: string }\n",
    );
    expect(kinds(symbols)).toEqual([
      ["Box~interface", "interface"],
      ["Box", "class"],
    ]);
    expect(symbol(symbols, "Box~interface").declarations).toHaveLength(2);
  });
});

describe("member names", () => {
  it("escapes computed, string and numeric member names", () => {
    const symbols = symbolsOf(`
      class Names {
        [Symbol.iterator]() {}
        "a.b"() {}
        "x~y" = 1;
        "100%": number;
        42() {}
        ["literal"]() {}
        [key + "suffix"]: string;
        #secret = 0;
        static #counter = 0;
      }
    `);
    expect(
      symbols.map((candidate) => [candidate.name, candidate.qualifiedName, candidate.localName]),
    ).toEqual([
      ["Names", "Names", "Names"],
      ["[Symbol.iterator]", "Names.[Symbol%2Eiterator]", "Names.[Symbol%2Eiterator]"],
      ["a.b", "Names.a%2Eb", "Names.a%2Eb"],
      ["x~y", "Names.x%7Ey", "Names.x%7Ey"],
      ["100%", "Names.100%25", "Names.100%25"],
      ["42", "Names.42", "Names.42"],
      ["literal", "Names.literal", "Names.literal"],
      ['[key + "suffix"]', 'Names.[key + "suffix"]', 'Names.[key + "suffix"]'],
      ["#secret", "Names.#secret", "Names.#secret"],
      ["#counter", "Names.#counter", "Names.#counter"],
    ]);
    expect(symbol(symbols, "Names.#secret").visibility).toBe("private");
    expect(symbol(symbols, "Names.#counter").modifiers).toEqual(["static"]);
  });

  it("names string-named ambient modules with their quoted name", () => {
    const symbols = symbolsOf(
      `declare module "*.svg" { const content: string; export default content; }`,
    );
    expect(symbols.map((candidate) => candidate.qualifiedName)).toEqual([
      '"*%2Esvg"',
      '"*%2Esvg".content',
    ]);
    expect(symbols[0]?.name).toBe('"*.svg"');
    expect(symbols[0]?.signature).toBe('module "*.svg"');
  });
});

describe("class members", () => {
  const source = `
    import { Repository } from "typeorm";
    import { Inject } from "@nestjs/common";
    export abstract class Service<T> extends Base implements Port {
      static readonly version: string = "1";
      private cache?: Map<string, T>;
      protected abstract readonly name: string;
      declare hydrated: boolean;
      accessor counter = 0;
      [key: string]: unknown;
      static { Service.init(); }
      constructor(
        private readonly repo: Repository<T>,
        @Inject("TOKEN") public token: string,
        plain: number,
      ) { super(); }
      get size(): number { return 0; }
      set size(value: number) {}
      override async load(): Promise<void> {}
      abstract save(item: T): void;
      optional?(): void;
    }
  `;
  const symbols = symbolsOf(source);

  it("extracts methods, properties, accessors, constructors and parameter properties", () => {
    expect(kinds(symbols)).toEqual([
      ["Service", "class"],
      ["Service.version", "property"],
      ["Service.cache", "property"],
      ["Service.name", "property"],
      ["Service.hydrated", "property"],
      ["Service.counter", "accessor"],
      ["Service.constructor", "constructor"],
      ["Service.repo", "property"],
      ["Service.token", "property"],
      ["Service.size", "accessor"],
      ["Service.load", "method"],
      ["Service.save", "method"],
      ["Service.optional", "method"],
    ]);
    for (const member of symbols.slice(1)) expect(member.parent).toBe("Service");
  });

  it("records visibility of class members", () => {
    expect(symbol(symbols, "Service.version").visibility).toBe("public");
    expect(symbol(symbols, "Service.cache").visibility).toBe("private");
    expect(symbol(symbols, "Service.name").visibility).toBe("protected");
    expect(symbol(symbols, "Service.repo").visibility).toBe("private");
    expect(symbol(symbols, "Service.token").visibility).toBe("public");
    expect(symbol(symbols, "Service").visibility).toBeUndefined();
  });

  it("records modifiers, sorted", () => {
    expect(symbol(symbols, "Service").modifiers).toEqual(["abstract"]);
    expect(symbol(symbols, "Service.version").modifiers).toEqual(["readonly", "static"]);
    expect(symbol(symbols, "Service.cache").modifiers).toEqual(["optional"]);
    expect(symbol(symbols, "Service.name").modifiers).toEqual(["abstract", "readonly"]);
    expect(symbol(symbols, "Service.hydrated").modifiers).toEqual(["declare"]);
    expect(symbol(symbols, "Service.repo").modifiers).toEqual(["readonly"]);
    expect(symbol(symbols, "Service.load").modifiers).toEqual(["async", "override"]);
    expect(symbol(symbols, "Service.save").modifiers).toEqual(["abstract"]);
    expect(symbol(symbols, "Service.optional").modifiers).toEqual(["optional"]);
    expect(symbol(symbols, "Service.size").modifiers).toBeUndefined();
  });

  it("merges a get/set pair into one accessor symbol", () => {
    const size = symbol(symbols, "Service.size");
    expect(size.declarations?.map((declaration) => declaration.signature)).toEqual([
      "get size(): number",
      "set size(value: number)",
    ]);
  });

  it("marks abstract classes as abstract", () => {
    expect(symbol(symbols, "Service").abstract).toBe(true);
    expect(symbolsOf("class Plain {}")[0]?.abstract).toBeUndefined();
  });

  it("writes declaration heads as signatures", () => {
    expect(symbol(symbols, "Service").signature).toBe(
      "abstract class Service<T> extends Base implements Port",
    );
    expect(symbol(symbols, "Service.version").signature).toBe("static readonly version: string");
    expect(symbol(symbols, "Service.repo").signature).toBe("private readonly repo: Repository<T>");
    expect(symbol(symbols, "Service.token").signature).toBe("public token: string");
    expect(symbol(symbols, "Service.constructor").signature).toBe(
      "constructor(private readonly repo: Repository<T>, public token: string, plain: number)",
    );
    expect(symbol(symbols, "Service.load").signature).toBe("override async load(): Promise<void>");
    expect(symbol(symbols, "Service.save").signature).toBe("abstract save(item: T): void");
  });

  it("puts parameter decorators on the constructor and on parameter properties", () => {
    const constructor = symbol(symbols, "Service.constructor");
    expect(constructor.decorators).toEqual([
      {
        name: "Inject",
        target: { type: "import", local: "Inject", members: [] },
        invoked: true,
        arguments: [{ type: "string", value: "TOKEN" }],
        text: ['"TOKEN"'],
        parameterIndex: 1,
        line: 14,
        column: 9,
      },
    ]);
    expect(symbol(symbols, "Service.token").decorators).toEqual([
      {
        name: "Inject",
        target: { type: "import", local: "Inject", members: [] },
        invoked: true,
        arguments: [{ type: "string", value: "TOKEN" }],
        text: ['"TOKEN"'],
        line: 14,
        column: 9,
      },
    ]);
  });

  it("records declared and return types that name bindings", () => {
    expect(symbol(symbols, "Service.repo").declaredType).toEqual({
      ref: { type: "import", local: "Repository", members: [] },
    });
    expect(symbol(symbols, "Service.cache").declaredType).toBeUndefined();
    expect(symbol(symbols, "Service.size").declaredType).toBeUndefined();
    expect(symbol(symbols, "Service.load").returnType).toBeUndefined();
  });
});

describe("abstractness of interfaces", () => {
  it("is abstract only for interfaces declaring behaviour", () => {
    const symbols = symbolsOf(`
      interface Data { id: string; handler: () => void }
      interface Behaviour { run(): void }
      interface Callable { (input: string): number }
      interface Constructible { new (): object }
      interface Merged { id: string }
      interface Merged { start(): void }
    `);
    expect(symbol(symbols, "Data").abstract).toBeUndefined();
    expect(symbol(symbols, "Behaviour").abstract).toBe(true);
    expect(symbol(symbols, "Callable").abstract).toBe(true);
    expect(symbol(symbols, "Constructible").abstract).toBe(true);
    expect(symbol(symbols, "Merged").abstract).toBe(true);
  });
});

describe("modifiers of other declarations", () => {
  it("records const enums, defaults and declare", () => {
    const symbols = symbolsOf(`
      export const enum Priority { Low, High }
      export default class Shop {}
      declare namespace Globals { const x: number; }
    `);
    expect(symbol(symbols, "Priority").modifiers).toEqual(["const"]);
    expect(symbol(symbols, "Shop").modifiers).toEqual(["default"]);
    expect(symbol(symbols, "Globals").modifiers).toEqual(["declare"]);
    expect(symbol(symbols, "Shop").signature).toBe("class Shop");
    expect(symbol(symbols, "Priority").signature).toBe("const enum Priority");
  });

  it("names anonymous default exports default", () => {
    expect(kinds(symbolsOf("export default function () {}"))).toEqual([["default", "function"]]);
    expect(kinds(symbolsOf("export default class { run() {} }"))).toEqual([
      ["default", "class"],
      ["default.run", "method"],
    ]);
    expect(kinds(symbolsOf("export default () => 1;"))).toEqual([["default", "function"]]);
    expect(kinds(symbolsOf("export default { port: 3000 };"))).toEqual([["default", "constant"]]);
    expect(kinds(symbolsOf("export default defineConfig({});"))).toEqual([["default", "constant"]]);
    expect(kinds(symbolsOf("const value = 1;\nexport default value;"))).toEqual([
      ["value", "constant"],
    ]);
    expect(symbolsOf("export default { port: 3000 };")[0]?.modifiers).toEqual(["default"]);
  });
});

describe("signatures", () => {
  it("writes single-line heads without bodies, decorators and export keywords", () => {
    const symbols = symbolsOf(`
      /** Docs are not part of signatures. */
      @Component({ selector: "app" })
      export class OrderService extends Base implements IOrders {
        @Get(":id")
        async charge(
          amount: number, // in cents
          @Param("id") id: string,
        ): Promise<Receipt> {
          return receipt;
        }
      }
      export type Id =
        | string
        | number;
      export const PORT: number = 3000;
      export const handler = async (event: Event): Promise<void> => {};
      export interface Repo<T> extends Base<T> { find(): T }
      enum Color { Red }
    `);
    expect(symbol(symbols, "OrderService").signature).toBe(
      "class OrderService extends Base implements IOrders",
    );
    expect(symbol(symbols, "OrderService.charge").signature).toBe(
      "async charge(amount: number, id: string): Promise<Receipt>",
    );
    expect(symbol(symbols, "Id").signature).toBe("type Id = | string | number");
    expect(symbol(symbols, "PORT").signature).toBe("const PORT: number");
    expect(symbol(symbols, "handler").signature).toBe(
      "const handler = async (event: Event): Promise<void>",
    );
    expect(symbol(symbols, "Repo").signature).toBe("interface Repo<T> extends Base<T>");
    expect(symbol(symbols, "Color").signature).toBe("enum Color");
  });

  it("bounds signatures to 200 characters", () => {
    const parameters = Array.from({ length: 40 }, (_, index) => `parameter${index}: string`).join(
      ", ",
    );
    const signature = symbolsOf(`function long(${parameters}) {}`)[0]?.signature ?? "";
    expect(signature).toHaveLength(200);
    expect(signature.endsWith("…")).toBe(true);
    expect(signature.startsWith("function long(parameter0: string")).toBe(true);
  });
});

describe("declared types, return types, initializers and values", () => {
  it("resolves type references to imports, local symbols and inline imports", () => {
    const symbols = symbolsOf(`
      import type { User } from "./user";
      import * as models from "./models";
      interface Local {}
      export let current: User | undefined;
      export const local: Local = {};
      export const qualified: models.Order = load();
      export const inline: import("./config").Settings = read();
      export const generic: Map<string, User> = new Map();
      export const wrapped: Repository<User, number, Local> = make();
      export function find(): User { return current!; }
      export function list(): Promise<User[]> { return Promise.resolve([]); }
      export const arrow = (): Local => ({});
    `);
    expect(symbol(symbols, "current").declaredType).toEqual({
      ref: { type: "import", local: "User", members: [] },
    });
    expect(symbol(symbols, "local").declaredType).toEqual({
      ref: { type: "symbol", localName: "Local", members: [] },
    });
    expect(symbol(symbols, "qualified").declaredType).toEqual({
      ref: { type: "import", local: "models", members: ["Order"] },
    });
    expect(symbol(symbols, "inline").declaredType).toEqual({
      ref: { type: "module", specifier: "./config", members: ["Settings"] },
    });
    expect(symbol(symbols, "generic").declaredType).toBeUndefined();
    expect(symbol(symbols, "wrapped").declaredType).toEqual({
      ref: { type: "name", name: "Repository", members: [] },
      arguments: [
        { ref: { type: "import", local: "User", members: [] } },
        { ref: { type: "symbol", localName: "Local", members: [] } },
      ],
    });
    expect(symbol(symbols, "find").returnType).toEqual({
      ref: { type: "import", local: "User", members: [] },
    });
    expect(symbol(symbols, "list").returnType).toBeUndefined();
    expect(symbol(symbols, "arrow").returnType).toEqual({
      ref: { type: "symbol", localName: "Local", members: [] },
    });
  });

  it("records new and call initializers with argument summaries", () => {
    const symbols = symbolsOf(`
      import express from "express";
      import { Pool } from "pg";
      export const app = express();
      export const router = express.Router({ strict: true });
      export const pool = new Pool({ max: 10 });
      export const late = await createLater();
      export const plain = compute;
      export const unknown = (factory as any)();
    `);
    expect(symbol(symbols, "app").initializer).toEqual({
      kind: "call",
      callee: { type: "import", local: "express", members: [] },
      arguments: [],
    });
    expect(symbol(symbols, "router").initializer).toEqual({
      kind: "call",
      callee: { type: "import", local: "express", members: ["Router"] },
      arguments: [
        {
          type: "object",
          properties: [{ key: "strict", value: { type: "boolean", value: true } }],
        },
      ],
    });
    expect(symbol(symbols, "pool").initializer).toEqual({
      kind: "new",
      callee: { type: "import", local: "Pool", members: [] },
      arguments: [
        { type: "object", properties: [{ key: "max", value: { type: "number", value: 10 } }] },
      ],
    });
    expect(symbol(symbols, "late").initializer).toEqual({
      kind: "call",
      callee: { type: "name", name: "createLater", members: [] },
      arguments: [],
    });
    expect(symbol(symbols, "plain").initializer).toBeUndefined();
    expect(symbol(symbols, "unknown").initializer).toBeUndefined();
  });

  it("summarizes literal values of constants only", () => {
    const symbols = symbolsOf(`
      export const PATH = "/api/orders";
      export const RETRIES = -3;
      export const ENABLED = true;
      export const ROUTES = { list: "/", item: \`/\${"id"}\` } as const;
      export const METHODS = ["GET", "POST"];
      export let mutable = "x";
      export const computed = PATH + "/x";
    `);
    expect(symbol(symbols, "PATH").value).toEqual({ type: "string", value: "/api/orders" });
    expect(symbol(symbols, "RETRIES").value).toEqual({ type: "number", value: -3 });
    expect(symbol(symbols, "ENABLED").value).toEqual({ type: "boolean", value: true });
    expect(symbol(symbols, "ROUTES").value).toEqual({
      type: "object",
      properties: [
        { key: "list", value: { type: "string", value: "/" } },
        {
          key: "item",
          value: {
            type: "template",
            text: "/${…}",
            substitutions: [{ type: "string", value: "id" }],
          },
        },
      ],
    });
    expect(symbol(symbols, "METHODS").value).toEqual({
      type: "array",
      length: 2,
      elements: [
        { type: "string", value: "GET" },
        { type: "string", value: "POST" },
      ],
    });
    expect(symbol(symbols, "mutable").value).toBeUndefined();
    expect(symbol(symbols, "computed").value).toBeUndefined();
  });

  it("reads JSDoc types in JavaScript files", () => {
    const symbols = symbolsOf(
      `/** @type {import("./store").Store} */
       export let store;
       /** @returns {Order} */
       export function load() { return null; }
       /** @typedef {{ id: string }} Order */`,
      "src/state.js",
    );
    expect(symbol(symbols, "store").declaredType).toEqual({
      ref: { type: "module", specifier: "./store", members: ["Store"] },
    });
    expect(symbol(symbols, "load").returnType).toBeUndefined();
  });
});

describe("decorators", () => {
  it("records name, target, invocation, arguments, text and position", () => {
    const source = [
      'import * as nest from "@nestjs/common";',
      'import { Entity } from "typeorm";',
      "@nest.Controller({ path: 'orders' })",
      "@Entity",
      "export class Orders {",
      "  @nest.Get(`:id`, OPTIONS)",
      "  find() {}",
      "}",
    ].join("\n");
    const symbols = symbolsOf(source);
    expect(symbol(symbols, "Orders").decorators).toEqual([
      {
        name: "nest.Controller",
        target: { type: "import", local: "nest", members: ["Controller"] },
        invoked: true,
        arguments: [
          {
            type: "object",
            properties: [{ key: "path", value: { type: "string", value: "orders" } }],
          },
        ],
        text: ["{ path: 'orders' }"],
        line: 3,
        column: 1,
      },
      {
        name: "Entity",
        target: { type: "import", local: "Entity", members: [] },
        invoked: false,
        arguments: [],
        text: [],
        line: 4,
        column: 1,
      },
    ]);
    expect(symbol(symbols, "Orders.find").decorators).toEqual([
      {
        name: "nest.Get",
        target: { type: "import", local: "nest", members: ["Get"] },
        invoked: true,
        arguments: [
          { type: "string", value: ":id" },
          { type: "reference", target: { type: "name", name: "OPTIONS", members: [] } },
        ],
        text: ["`:id`", "OPTIONS"],
        line: 6,
        column: 3,
      },
    ]);
  });

  it("truncates argument text to 200 characters and normalizes line endings", () => {
    const long = "x".repeat(300);
    const symbols = symbolsOf(`@Tag("${long}", {\r\n  a: 1 })\nclass Tagged {}`);
    const decorator = symbol(symbols, "Tagged").decorators?.[0];
    expect(decorator?.text[0]).toHaveLength(200);
    expect(decorator?.text[1]).toBe("{\n  a: 1 }");
    expect(decorator?.target).toEqual({ type: "name", name: "Tag", members: [] });
  });
});

describe("CommonJS symbols", () => {
  it("creates symbols for exports.x and module.exports.x values", () => {
    const symbols = symbolsOf(
      `exports.liveness = function liveness(req, res) {};
       exports.Store = class Store { get() {} };
       module.exports.limit = 10;
       exports.alias = existing;
       function existing() {}
       exports.existing = existing;
       exports.helper = require("./helper");`,
      "src/health.js",
    );
    expect(kinds(symbols)).toEqual([
      ["liveness", "function"],
      ["Store", "class"],
      ["Store.get", "method"],
      ["limit", "constant"],
      ["existing", "function"],
    ]);
    expect(symbol(symbols, "liveness").signature).toBe(
      "exports.liveness = function liveness(req, res)",
    );
    expect(symbol(symbols, "limit").signature).toBe("module.exports.limit");
    expect(symbol(symbols, "limit").value).toEqual({ type: "number", value: 10 });
  });

  it("creates symbols from assigned values, not from void 0 pre-declarations of compiled modules", () => {
    const extraction = extract(
      [
        '"use strict";',
        "exports.LIMIT = exports.NAME = void 0;",
        "exports.LIMIT = 10;",
        'exports.NAME = "x";',
        "exports.EMPTY = void 0;",
      ].join("\n"),
      "src/compiled.js",
    );
    expect(kinds(extraction.symbols)).toEqual([
      ["LIMIT", "constant"],
      ["NAME", "constant"],
    ]);
    expect(symbol(extraction.symbols, "LIMIT").value).toEqual({ type: "number", value: 10 });
    expect(symbol(extraction.symbols, "LIMIT").range.start.line).toBe(3);
    expect(extraction.exports.map((entry) => [entry.name, entry.targets])).toEqual([
      ["LIMIT", [{ type: "symbol", localName: "LIMIT", members: [] }]],
      ["NAME", [{ type: "symbol", localName: "NAME", members: [] }]],
      ["EMPTY", undefined],
    ]);
  });

  it("does not create a symbol when the name is declared at the top level", () => {
    const symbols = symbolsOf("function run() {}\nexports.run = function () {};\n", "src/run.js");
    expect(kinds(symbols)).toEqual([["run", "function"]]);
  });

  it("creates symbols for inline functions and classes of module.exports objects", () => {
    const symbols = symbolsOf(
      `function shared() {}
       module.exports = {
         shared,
         create: () => {},
         remove(id) {},
         Model: class {},
         count: 1,
         nested: { deep() {} },
       };`,
      "src/api.js",
    );
    expect(kinds(symbols)).toEqual([
      ["shared", "function"],
      ["create", "function"],
      ["remove", "function"],
      ["Model", "class"],
    ]);
    expect(symbol(symbols, "remove").signature).toBe("remove(id)");
  });

  it("creates a default symbol for other module.exports values", () => {
    expect(kinds(symbolsOf("module.exports = function (app) {};", "src/plugin.js"))).toEqual([
      ["default", "function"],
    ]);
    expect(kinds(symbolsOf("module.exports = class extends Base {};", "src/model.js"))).toEqual([
      ["default", "class"],
    ]);
    expect(kinds(symbolsOf("module.exports = createRouter();", "src/routes.js"))).toEqual([
      ["default", "constant"],
    ]);
    expect(kinds(symbolsOf("function app() {}\nmodule.exports = app;", "src/app.js"))).toEqual([
      ["app", "function"],
    ]);
    expect(
      symbolsOf("module.exports = function (app) {};", "src/plugin.js")[0]?.modifiers,
    ).toBeUndefined();
  });

  it("ignores exports assignments when exports is a local name", () => {
    expect(
      symbolsOf("const exports = {};\nexports.x = function () {};", "src/local.js").map(
        (s) => s.localName,
      ),
    ).toEqual(["exports"]);
  });
});

describe("globals and ambient declarations", () => {
  it("collects declarations of declare global without a parent", () => {
    const extraction = extract(`
      import type { User } from "./user";
      declare global {
        namespace Express { interface Request { user?: User } }
        var __VERSION__: string;
      }
      export {};
    `);
    expect(kinds(extraction.symbols)).toEqual([
      ["Express", "namespace"],
      ["Express.Request", "interface"],
      ["__VERSION__", "variable"],
    ]);
    expect(extraction.symbols[0]?.parent).toBeUndefined();
    expect(extraction.globals).toEqual(["Express", "__VERSION__"]);
  });

  it("keeps declare global declarations apart from module declarations of the same name", () => {
    const declareFirst = extract(
      [
        "declare global { var cache: Map<string, string> | undefined; }",
        "export let cache = new Map<string, string>();",
        "globalThis.cache = cache;",
      ].join("\n"),
    );
    const moduleFirst = extract(
      [
        "export let cache = new Map<string, string>();",
        "declare global { var cache: Map<string, string> | undefined; }",
        "globalThis.cache = cache;",
      ].join("\n"),
    );
    for (const extraction of [declareFirst, moduleFirst]) {
      // The module's variable keeps the bare name whatever the order; the global one is keyed `global`.
      expect(kinds(extraction.symbols).sort()).toEqual([
        ["cache", "variable"],
        ["cache~variable-global", "variable"],
      ]);
      expect(extraction.symbols.every((candidate) => candidate.declarations === undefined)).toBe(
        true,
      );
      expect(extraction.globals).toEqual(["cache~variable-global"]);
      expect(extraction.exports.map((entry) => [entry.name, entry.targets])).toEqual([
        ["cache", [{ type: "symbol", localName: "cache", members: [] }]],
      ]);
    }
    const functions = extract(
      "export function helper(): void {}\ndeclare global { function helper(): void; interface Window { helper: typeof helper } }\n",
    );
    expect(kinds(functions.symbols)).toEqual([
      ["helper", "function"],
      ["helper~function-global", "function"],
      ["Window", "interface"],
    ]);
    expect(functions.globals).toEqual(["helper~function-global", "Window"]);
    expect(functions.exports.map((entry) => entry.targets)).toEqual([
      [{ type: "symbol", localName: "helper", members: [] }],
    ]);
  });
});

describe("source order", () => {
  it("lists parents before their members and keeps source order otherwise", () => {
    const symbols = symbolsOf(`
      class A { m() {} }
      function b() {}
      namespace C { export class D { n() {} } }
    `);
    expect(symbols.map((candidate) => candidate.localName)).toEqual([
      "A",
      "A.m",
      "b",
      "C",
      "C.D",
      "C.D.n",
    ]);
    const index = new Map(symbols.map((candidate, position) => [candidate.localName, position]));
    for (const candidate of symbols) {
      if (candidate.parent !== undefined) {
        expect(index.get(candidate.parent)).toBeLessThan(index.get(candidate.localName) ?? -1);
      }
    }
  });
});
