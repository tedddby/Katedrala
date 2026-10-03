import type {
  ArgumentSummary,
  ExtractedReference,
  FileExtraction,
  ReferenceTarget,
} from "@katedrala/plugin-api";
import { describe, expect, it } from "vitest";
import { detectTypeScriptLanguage } from "../languages.js";
import { resolveTypeScriptAdapterOptions, type TypeScriptAdapterOptions } from "../options.js";
import { extractTypeScriptFile, parseTypeScriptFile } from "./index.js";

function extract(
  text: string,
  path = "src/sample.ts",
  options: TypeScriptAdapterOptions = {},
): FileExtraction {
  const detection = detectTypeScriptLanguage(path);
  if (detection === undefined) throw new Error(`unsupported path ${path}`);
  const parsed = parseTypeScriptFile({ path, text, ...detection });
  return extractTypeScriptFile(parsed, resolveTypeScriptAdapterOptions(options));
}

/** References without positions and arguments, for compact assertions. */
type Compact = Omit<ExtractedReference, "line" | "column" | "arguments">;

function compact(references: readonly ExtractedReference[]): Compact[] {
  return references.map(({ line: _line, column: _column, arguments: _arguments, ...rest }) => rest);
}

function referencesOf(text: string, path?: string, options?: TypeScriptAdapterOptions): Compact[] {
  return compact(extract(text, path, options).references);
}

const imported = (local: string, ...members: string[]) => ({
  type: "import" as const,
  local,
  members,
});
const sym = (localName: string, ...members: string[]) => ({
  type: "symbol" as const,
  localName,
  members,
});
const named = (name: string, ...members: string[]) => ({ type: "name" as const, name, members });

describe("references to imports and local symbols", () => {
  it("records calls of import bindings and namespace members", () => {
    expect(
      referencesOf(`
        import { charge } from "./payments";
        import * as billing from "./billing";
        import Shop from "./shop";
        export function checkout() {
          charge(1);
          billing.Tax.rateFor("DE");
          new Shop();
        }
      `),
    ).toEqual([
      { from: "checkout", kind: "call", target: imported("charge"), typeOnly: false },
      {
        from: "checkout",
        kind: "call",
        target: imported("billing", "Tax", "rateFor"),
        typeOnly: false,
      },
      { from: "checkout", kind: "new", target: imported("Shop"), typeOnly: false },
    ]);
  });

  it("records references to local symbols and resolves namespace and static members", () => {
    expect(
      referencesOf(`
        namespace Tax {
          export const RATE = 0.2;
          export function rateFor() { return RATE; }
        }
        class Counter { static count = 0; static next() { return Counter.count++; } }
        export function total() { return Tax.rateFor() * Counter.next(); }
        total();
      `),
    ).toEqual([
      { from: "Tax.rateFor", kind: "value", target: sym("Tax.RATE"), typeOnly: false },
      { from: "Counter.next", kind: "value", target: sym("Counter.count"), typeOnly: false },
      { from: "total", kind: "call", target: sym("Tax.rateFor"), typeOnly: false },
      { from: "total", kind: "call", target: sym("Counter.next"), typeOnly: false },
      { kind: "call", target: sym("total"), typeOnly: false },
    ]);
  });

  it("prefers the merged declaration that declares the accessed member", () => {
    expect(
      referencesOf(`
        export class Invoice {}
        export namespace Invoice { export function fromOrder() { return new Invoice(); } }
        function legacy() {}
        namespace legacy { export const currency = "EUR"; }
        export function use(format: Invoice.Format) {
          Invoice.fromOrder();
          return legacy.currency;
        }
        export namespace Invoice { export type Format = "text"; }
      `),
    ).toEqual([
      { from: "Invoice.fromOrder", kind: "new", target: sym("Invoice"), typeOnly: false },
      { from: "use", kind: "type", target: sym("Invoice.Format"), typeOnly: true },
      { from: "use", kind: "call", target: sym("Invoice.fromOrder"), typeOnly: false },
      { from: "use", kind: "value", target: sym("legacy.currency"), typeOnly: false },
    ]);
  });

  it("resolves import-equals aliases of namespace members", () => {
    expect(
      referencesOf(`
        namespace Shapes { export namespace Round { export function area() { return 1; } } }
        import Round = Shapes.Round;
        export const value = Round.area();
      `),
    ).toEqual([{ from: "value", kind: "call", target: sym("Shapes.Round.area"), typeOnly: false }]);
  });

  it("records unbound names that are not built-in globals", () => {
    expect(
      referencesOf(`
        export function main() {
          console.log(Math.max(1, 2), JSON.stringify({}), process.argv, new Map());
          return __APP_VERSION__ + describeApp();
        }
      `),
    ).toEqual([
      { from: "main", kind: "value", target: named("__APP_VERSION__"), typeOnly: false },
      { from: "main", kind: "call", target: named("describeApp"), typeOnly: false },
    ]);
  });

  it("records member paths through literal element access only", () => {
    expect(
      referencesOf(`
        import config from "./config";
        export const a = config["server"].port;
        export const b = config[key].port;
      `),
    ).toEqual([
      { from: "a", kind: "value", target: imported("config", "server", "port"), typeOnly: false },
      { from: "b", kind: "value", target: imported("config"), typeOnly: false },
      { from: "b", kind: "value", target: named("key"), typeOnly: false },
    ]);
  });

  it("records require chains as module targets", () => {
    expect(
      referencesOf(
        `function start() {
           require("./server").listen(3000);
           const port = require("./config").port;
         }`,
        "src/start.js",
      ),
    ).toEqual([
      {
        from: "start",
        kind: "call",
        target: { type: "module", specifier: "./server", members: ["listen"] },
        typeOnly: false,
      },
    ]);
  });

  it("maps CommonJS exports.x reads to the exported symbol", () => {
    expect(
      referencesOf(
        "exports.helper = function () {};\nexports.run = function () { return exports.helper() + module.exports.helper(); };\n",
        "src/cjs.js",
      ),
    ).toEqual([
      { from: "run", kind: "call", target: sym("helper"), typeOnly: false },
      { from: "run", kind: "call", target: sym("helper"), typeOnly: false },
    ]);
  });

  it("maps exports.x reads to the binding assigned to the export, resolved where it was assigned", () => {
    expect(
      referencesOf(
        [
          "function a() { return 1; }",
          "exports.a = a;",
          "exports.b = function () { return exports.a() + module.exports.a(); };",
          "const c = () => 2;",
          "module.exports.c = c;",
          "exports.d = function () { return exports.c(); };",
          "function shadowed(a) { return exports.a(a); }",
        ].join("\n"),
        "src/a.js",
      ),
    ).toEqual([
      { from: "b", kind: "call", target: sym("a"), typeOnly: false },
      { from: "b", kind: "call", target: sym("a"), typeOnly: false },
      { from: "d", kind: "call", target: sym("c"), typeOnly: false },
      { from: "shadowed", kind: "call", target: sym("a"), typeOnly: false },
    ]);
    expect(
      referencesOf(
        [
          'const lib = require("./lib");',
          "function load() {}",
          "function save() {}",
          "module.exports = { load, save, helper: lib.helper };",
          "function run() { module.exports.load(); return module.exports.helper(); }",
        ].join("\n"),
        "src/b.js",
      ),
    ).toEqual([
      { from: "run", kind: "call", target: sym("load"), typeOnly: false },
      { from: "run", kind: "call", target: imported("lib", "helper"), typeOnly: false },
    ]);
  });

  it("does not follow cyclic CommonJS export aliases", () => {
    expect(
      referencesOf(
        "exports.a = exports.b;\nexports.b = exports.a;\nfunction run() { return exports.a(); }\n",
        "src/cycle.js",
      ),
    ).toEqual([]);
  });

  it("resolves this members in methods of module.exports objects to the exports", () => {
    expect(
      referencesOf(
        [
          'const db = require("./db");',
          "module.exports = {",
          "  findUser(id) { return db.query(id); },",
          "  getProfile(id) { return this.findUser(id); },",
          "  getAll: function () { return [1].map((id) => this.findUser(id)); },",
          "  detached() { return [1].map(function (id) { return this.findUser(id); }); },",
          "};",
          "const other = { a() {}, b() { return this.a(); } };",
        ].join("\n"),
        "src/svc.js",
      ),
    ).toEqual([
      { from: "findUser", kind: "call", target: imported("db", "query"), typeOnly: false },
      { from: "getProfile", kind: "call", target: sym("findUser"), typeOnly: false },
      { from: "getAll", kind: "call", target: sym("findUser"), typeOnly: false },
    ]);
  });

  it("reads compiled CommonJS: indirect calls and export pre-declarations", () => {
    const references = extract(
      [
        '"use strict";',
        'Object.defineProperty(exports, "__esModule", { value: true });',
        "exports.helper = exports.VERSION = exports.Service = void 0;",
        'const x_1 = require("./x");',
        'exports.VERSION = "1.0";',
        'const helper = () => (0, x_1.baz)("a");',
        "exports.helper = helper;",
        "class Service { run() { return (0, exports.helper)() + (0, helper)(); } }",
        "exports.Service = Service;",
      ].join("\n"),
      "src/lib.js",
    ).references;
    expect(compact(references)).toEqual([
      { from: "helper", kind: "call", target: imported("x_1", "baz"), typeOnly: false },
      { from: "Service.run", kind: "call", target: sym("helper"), typeOnly: false },
      { from: "Service.run", kind: "call", target: sym("helper"), typeOnly: false },
    ]);
    expect(references[0]?.arguments).toEqual([{ type: "string", value: "a" }]);
  });

  it("records tagged templates and new expressions without arguments", () => {
    const references = extract(`
      import { sql, Client } from "./db";
      export const query = sql\`SELECT * FROM \${table}\`;
      export const client = new Client;
    `).references;
    expect(compact(references)).toEqual([
      { from: "query", kind: "tagged-template", target: imported("sql"), typeOnly: false },
      { from: "query", kind: "value", target: named("table"), typeOnly: false },
      { from: "client", kind: "new", target: imported("Client"), typeOnly: false },
    ]);
    expect(references[0]?.arguments).toEqual([
      {
        type: "template",
        text: "SELECT * FROM ${…}",
        substitutions: [{ type: "reference", target: named("table") }],
      },
    ]);
    expect(references[2]?.arguments).toEqual([]);
  });
});

describe("this and super", () => {
  it("resolves this members to member symbols", () => {
    expect(
      referencesOf(`
        import { Repo } from "./repo";
        export class OrderService {
          private cache = new Map();
          constructor(private readonly repo: Repo) {}
          place() {
            this.repo.save(1);
            this.audit();
            const run = () => this.cache.clear();
            function detached(this: unknown) { return this; }
          }
          audit() { return this.missing.call(); }
          static create() { return this.build(); }
          static build() { return this.unknownStatic; }
        }
      `),
    ).toEqual([
      { from: "OrderService.repo", kind: "type", target: imported("Repo"), typeOnly: true },
      {
        from: "OrderService.place",
        kind: "call",
        target: sym("OrderService.repo", "save"),
        typeOnly: false,
      },
      {
        from: "OrderService.place",
        kind: "call",
        target: sym("OrderService.audit"),
        typeOnly: false,
      },
      {
        from: "OrderService.place",
        kind: "call",
        target: sym("OrderService.cache", "clear"),
        typeOnly: false,
      },
      {
        from: "OrderService.audit",
        kind: "call",
        target: {
          type: "instance",
          via: "declared-type",
          of: sym("OrderService"),
          members: ["missing", "call"],
        },
        typeOnly: false,
      },
      {
        from: "OrderService.create",
        kind: "call",
        target: sym("OrderService.build"),
        typeOnly: false,
      },
      {
        from: "OrderService.build",
        kind: "value",
        target: sym("OrderService", "unknownStatic"),
        typeOnly: false,
      },
    ]);
  });

  it("resolves super members through the extends clause", () => {
    expect(
      referencesOf(`
        import { Repository } from "./repository";
        class Local { save() {} static make() {} }
        export class Orders extends Repository {
          constructor() { super(); }
          find() { return super.findById(1); }
        }
        export class Special extends Local {
          save() { super.save(); }
          static make() { super.make(); }
        }
      `),
    ).toEqual([
      { from: "Orders", kind: "extends", target: imported("Repository"), typeOnly: false },
      {
        from: "Orders.find",
        kind: "call",
        target: imported("Repository", "findById"),
        typeOnly: false,
      },
      { from: "Special", kind: "extends", target: sym("Local"), typeOnly: false },
      { from: "Special.save", kind: "call", target: sym("Local.save"), typeOnly: false },
      { from: "Special.make", kind: "call", target: sym("Local.make"), typeOnly: false },
    ]);
  });
});

describe("locals and parameters with known types", () => {
  it("uses declared types of parameters and locals", () => {
    expect(
      referencesOf(`
        import { Repository } from "typeorm";
        import type { User } from "./user";
        export function rename(repo: Repository<User>, id: string | undefined) {
          const user: User = repo.findOne(id);
          user.rename("x");
          return id?.trim();
        }
      `),
    ).toEqual([
      { from: "rename", kind: "type", target: imported("Repository"), typeOnly: true },
      {
        from: "rename",
        kind: "type",
        target: { type: "import", local: "User", members: [] },
        typeOnly: true,
      },
      { from: "rename", kind: "type", target: imported("User"), typeOnly: true },
      {
        from: "rename",
        kind: "call",
        target: {
          type: "instance",
          via: "declared-type",
          of: imported("Repository"),
          typeArguments: [{ ref: imported("User") }],
          receiver: { type: "parameter", owner: "rename", index: 0, name: "repo", members: [] },
          members: ["findOne"],
        },
        typeOnly: false,
      },
      {
        from: "rename",
        kind: "call",
        target: {
          type: "instance",
          via: "declared-type",
          of: imported("User"),
          receiver: {
            type: "local",
            name: "user",
            declaredAt: { line: 5, column: 17 },
            members: [],
          },
          members: ["rename"],
        },
        typeOnly: false,
      },
    ]);
  });

  it("uses constructor types and call results of locals", () => {
    expect(
      referencesOf(`
        import express from "express";
        import { Pool } from "pg";
        export function start() {
          const pool = new Pool();
          pool.query("SELECT 1");
          const app = express();
          app.listen(80);
          const router = express.Router();
          router.get("/", () => {});
          const result = await pool.connect();
          result.release();
        }
      `),
    ).toEqual([
      { from: "start", kind: "new", target: imported("Pool"), typeOnly: false },
      {
        from: "start",
        kind: "call",
        target: {
          type: "instance",
          via: "constructor-type",
          of: imported("Pool"),
          receiver: {
            type: "local",
            name: "pool",
            declaredAt: { line: 5, column: 17 },
            members: [],
          },
          members: ["query"],
        },
        typeOnly: false,
      },
      { from: "start", kind: "call", target: imported("express"), typeOnly: false },
      {
        from: "start",
        kind: "call",
        target: {
          type: "instance",
          via: "call-result",
          of: imported("express"),
          receiver: {
            type: "local",
            name: "app",
            declaredAt: { line: 7, column: 17 },
            members: [],
          },
          members: ["listen"],
        },
        typeOnly: false,
      },
      { from: "start", kind: "call", target: imported("express", "Router"), typeOnly: false },
      {
        from: "start",
        kind: "call",
        target: {
          type: "instance",
          via: "call-result",
          of: imported("express", "Router"),
          receiver: {
            type: "local",
            name: "router",
            declaredAt: { line: 9, column: 17 },
            members: [],
          },
          members: ["get"],
        },
        typeOnly: false,
      },
      {
        from: "start",
        kind: "call",
        target: {
          type: "instance",
          via: "constructor-type",
          of: imported("Pool"),
          receiver: {
            type: "local",
            name: "pool",
            declaredAt: { line: 5, column: 17 },
            members: [],
          },
          members: ["connect"],
        },
        typeOnly: false,
      },
      {
        from: "start",
        kind: "call",
        target: {
          type: "instance",
          via: "call-result",
          of: {
            type: "instance",
            via: "constructor-type",
            of: imported("Pool"),
            receiver: {
              type: "local",
              name: "pool",
              declaredAt: { line: 5, column: 17 },
              members: [],
            },
            members: ["connect"],
          },
          receiver: {
            type: "local",
            name: "result",
            declaredAt: { line: 11, column: 17 },
            members: [],
          },
          members: ["release"],
        },
        typeOnly: false,
      },
    ]);
  });

  it("records type arguments of constructor types", () => {
    const references = referencesOf(`
      import { Store } from "./store";
      import type { Todo } from "./todo";
      export function make() { const store = new Store<Todo>(); store.add(); }
    `);
    expect(references.at(-1)?.target).toEqual({
      type: "instance",
      via: "constructor-type",
      of: imported("Store"),
      typeArguments: [{ ref: imported("Todo") }],
      receiver: { type: "local", name: "store", declaredAt: { line: 4, column: 38 }, members: [] },
      members: ["add"],
    });
  });

  it("does not record bare reads of typed locals or values of non-declaration types", () => {
    expect(
      referencesOf(`
        import { Repo } from "./repo";
        export function use(repo: Repo, label: string, items: number[]) {
          const copy = repo;
          label.toUpperCase();
          items.map((item) => item * 2);
          const list = [1, 2];
          list.push(3);
          const map = new Map<string, number>();
          map.set("a", 1);
        }
      `),
    ).toEqual([{ from: "use", kind: "type", target: imported("Repo"), typeOnly: true }]);
  });
});

/** The deepest nesting of `instance` targets anywhere in an extraction (references, arguments, symbols). */
function maxInstanceDepth(extraction: FileExtraction): number {
  let max = 0;
  const target = (value: ReferenceTarget): void => {
    let depth = 0;
    for (let current = value; current.type === "instance"; current = current.of) depth += 1;
    max = Math.max(max, depth);
  };
  const summary = (value: ArgumentSummary): void => {
    if (value.type === "reference") target(value.target);
    if (value.type === "call") {
      target(value.callee);
      value.arguments.forEach(summary);
    }
  };
  for (const reference of extraction.references) {
    target(reference.target);
    reference.arguments?.forEach(summary);
  }
  for (const symbol of extraction.symbols) {
    if (symbol.initializer !== undefined) {
      target(symbol.initializer.callee);
      symbol.initializer.arguments?.forEach(summary);
    }
  }
  return max;
}

describe("members of constructed values and call results", () => {
  it("records a member call on a new expression together with the construction", () => {
    expect(
      referencesOf(`
        import { OrderService, Clock } from "./orders";
        new OrderService(new Clock()).place();
      `),
    ).toEqual([
      { kind: "new", target: imported("OrderService"), typeOnly: false },
      { kind: "new", target: imported("Clock"), typeOnly: false },
      {
        kind: "call",
        target: {
          type: "instance",
          via: "constructor-type",
          of: imported("OrderService"),
          members: ["place"],
        },
        typeOnly: false,
      },
    ]);
  });

  it("records a member call on a call result together with the call", () => {
    expect(
      referencesOf(`
        import express from "express";
        import { config } from "./config";
        express().listen(config.port);
      `),
    ).toEqual([
      { kind: "call", target: imported("express"), typeOnly: false },
      {
        kind: "call",
        target: {
          type: "instance",
          via: "call-result",
          of: imported("express"),
          members: ["listen"],
        },
        typeOnly: false,
      },
      { kind: "value", target: imported("config", "port"), typeOnly: false },
    ]);
  });

  it("positions members of call results at the member and records deeper links on their own", () => {
    const references = extract(
      [
        'import { db } from "./db";',
        "export async function find(id: string) {",
        "  return db",
        "    .select()",
        '    .from("users")',
        '    .where("id", id);',
        "}",
      ].join("\n"),
    ).references;
    // `db.select()` is positioned at its root like every chain; `.from` (a member of the call result) at its
    // name. `.where` is a member of a member of a call result: its target would nest, so it is not recorded.
    expect(
      references.map(({ line, column, kind, target, arguments: args }) => ({
        line,
        column,
        kind,
        target,
        args,
      })),
    ).toEqual([
      { line: 3, column: 10, kind: "call", target: imported("db", "select"), args: [] },
      {
        line: 5,
        column: 6,
        kind: "call",
        target: {
          type: "instance",
          via: "call-result",
          of: imported("db", "select"),
          members: ["from"],
        },
        args: [{ type: "string", value: "users" }],
      },
    ]);
    expect(
      extract('import { make } from "./m";\nexport const y = make()["k"].run();\n').references.map(
        (reference) => [reference.line, reference.column, reference.target],
      ),
    ).toEqual([
      [2, 18, imported("make")],
      [
        2,
        25,
        { type: "instance", via: "call-result", of: imported("make"), members: ["k", "run"] },
      ],
    ]);
  });

  it("keeps extractions of long call chains linear in the chain's length", () => {
    // 150 links: about the longest chain within the limit for binding (see `nesting.ts`); longer chains are
    // extracted without scopes, so they have no instance targets at all.
    const links = Array.from(
      { length: 150 },
      (_, index) => `\n  .option("--opt${index}", "description ${index}")`,
    ).join("");
    const text = [
      'import { program } from "commander";',
      `program${links}\n  .parse(process.argv);`,
      `export const cli = program${links};`,
      `register(program${links});`,
      `export function run() { return new Command()${links}; }`,
    ].join("\n");
    const extraction = extract(text);
    // Before targets stopped nesting along chains, 200 links produced more than a megabyte (about 170 times
    // the source): every link embedded the targets of all links before it.
    expect(JSON.stringify(extraction).length).toBeLessThan(text.length);
    expect(maxInstanceDepth(extraction)).toBe(1);
  });

  it("does not record members of unresolvable constructions or dynamic imports", () => {
    expect(
      referencesOf(`
        new (globalThis as any).Thing().run();
        import("./lazy").then((m) => m.start());
      `),
    ).toEqual([]);
  });
});

describe("untyped locals and parameters", () => {
  const source = `
    export function register(app, options, { prefix }) {
      app.get("/users", listUsers);
      app.use(\`/\${prefix}\`, () => {});
      app.post({ path: "/x" });
      app.set(prefix);
      app.listen(80);
      app.locals.title = "x";
      options.logger.info(options.level);
      const router = app.router;
      router.route(handler);
      [1, 2].forEach((item) => item.print("x"));
    }
    function listUsers() {}
    function handler() {}
  `;

  it("records only calls whose arguments look like registrations", () => {
    expect(referencesOf(source, "src/routes.js")).toEqual([
      {
        from: "register",
        kind: "call",
        target: { type: "parameter", owner: "register", index: 0, name: "app", members: ["get"] },
        typeOnly: false,
      },
      { from: "register", kind: "value", target: sym("listUsers"), typeOnly: false },
      {
        from: "register",
        kind: "call",
        target: { type: "parameter", owner: "register", index: 0, name: "app", members: ["use"] },
        typeOnly: false,
      },
      {
        from: "register",
        kind: "call",
        target: { type: "parameter", owner: "register", index: 0, name: "app", members: ["post"] },
        typeOnly: false,
      },
      {
        from: "register",
        kind: "call",
        target: {
          type: "local",
          name: "router",
          declaredAt: { line: 10, column: 13 },
          members: ["route"],
        },
        typeOnly: false,
      },
      { from: "register", kind: "value", target: sym("handler"), typeOnly: false },
      {
        from: "register",
        kind: "call",
        target: { type: "parameter", index: 0, name: "item", members: ["print"] },
        typeOnly: false,
      },
    ]);
  });

  it("records the registration arguments", () => {
    const references = extract(source, "src/routes.js").references;
    expect(references[0]?.arguments).toEqual([
      { type: "string", value: "/users" },
      { type: "reference", target: sym("listUsers") },
    ]);
  });

  it("records nothing on untyped receivers when the option is off", () => {
    expect(referencesOf(source, "src/routes.js", { recordUntypedCalls: false })).toEqual([
      { from: "register", kind: "value", target: sym("listUsers"), typeOnly: false },
      { from: "register", kind: "value", target: sym("handler"), typeOnly: false },
    ]);
  });
});

describe("shadowing", () => {
  it("never records import references for parameters or locals named like an import", () => {
    expect(
      referencesOf(`
        import { charge, Order, logger } from "./deps";
        export function a(charge) { charge(1); }
        export function b() { const charge = make(); charge(2); }
        export function c() { try {} catch (logger) { logger.error("x"); } }
        export function d() { { let charge = 1; charge++; } charge(3); }
        export function e(Order: number): Order { return Order; }
        export function f() { for (const charge of list) charge(); }
        export function g() { function logger() {} logger(); }
      `),
    ).toEqual([
      { from: "b", kind: "call", target: named("make"), typeOnly: false },
      {
        from: "c",
        kind: "call",
        target: {
          type: "local",
          name: "logger",
          declaredAt: { line: 5, column: 45 },
          members: ["error"],
        },
        typeOnly: false,
      },
      { from: "d", kind: "call", target: imported("charge"), typeOnly: false },
      { from: "e", kind: "type", target: imported("Order"), typeOnly: true },
      { from: "f", kind: "value", target: named("list"), typeOnly: false },
    ]);
  });

  it("resolves decorators outside the decorated method", () => {
    expect(
      referencesOf(`
        import { Body } from "@nestjs/common";
        export class C { handle(@Body() Body: unknown) { return Body; } }
      `),
    ).toEqual([{ from: "C.handle", kind: "decorator", target: imported("Body"), typeOnly: false }]);
  });

  it("keeps parameters out of scope of the function's own default values for outer names", () => {
    expect(
      referencesOf(`
        import { config } from "./config";
        export function load(options = config, config2 = options) { return config2; }
      `),
    ).toEqual([{ from: "load", kind: "value", target: imported("config"), typeOnly: false }]);
  });
});

describe("JSX", () => {
  it("records capitalized and member tag names once per element", () => {
    expect(
      referencesOf(
        `
        import { Layout } from "./layout";
        import * as ui from "./ui";
        export function Page({ items }) {
          return (
            <Layout title="x">
              <ui.Button onClick={() => select(items)} />
              <div className="list"><Row /></div>
              <my-element />
            </Layout>
          );
        }
        function Row() { return <span />; }
      `,
        "src/page.tsx",
      ),
    ).toEqual([
      { from: "Page", kind: "jsx", target: imported("Layout"), typeOnly: false },
      { from: "Page", kind: "jsx", target: imported("ui", "Button"), typeOnly: false },
      { from: "Page", kind: "call", target: named("select"), typeOnly: false },
      { from: "Page", kind: "jsx", target: sym("Row"), typeOnly: false },
    ]);
  });

  it("parses JSX in .js files", () => {
    expect(
      referencesOf(
        'const { Layout } = require("./layout");\nexports.page = () => <Layout />;\n',
        "src/page.js",
      ),
    ).toEqual([{ from: "page", kind: "jsx", target: imported("Layout"), typeOnly: false }]);
  });
});

describe("decorators", () => {
  it("records one decorator reference per decorator, and value references in arguments", () => {
    const extraction = extract(`
      import { Controller, Get, Inject, Injectable } from "@nestjs/common";
      import { TOKEN } from "./tokens";
      @Injectable()
      @Controller("orders")
      export class OrdersController {
        constructor(@Inject(TOKEN) private readonly clock: Clock) {}
        @Get(":id")
        find() {}
      }
    `);
    expect(compact(extraction.references)).toEqual([
      {
        from: "OrdersController",
        kind: "decorator",
        target: imported("Injectable"),
        typeOnly: false,
      },
      {
        from: "OrdersController",
        kind: "decorator",
        target: imported("Controller"),
        typeOnly: false,
      },
      {
        from: "OrdersController.clock",
        kind: "decorator",
        target: imported("Inject"),
        typeOnly: false,
      },
      { from: "OrdersController.clock", kind: "value", target: imported("TOKEN"), typeOnly: false },
      { from: "OrdersController.clock", kind: "type", target: named("Clock"), typeOnly: true },
      {
        from: "OrdersController.find",
        kind: "decorator",
        target: imported("Get"),
        typeOnly: false,
      },
    ]);
    expect(extraction.references.map((reference) => reference.arguments)).toEqual([
      [],
      [{ type: "string", value: "orders" }],
      [{ type: "reference", target: imported("TOKEN") }],
      undefined,
      undefined,
      [{ type: "string", value: ":id" }],
    ]);
  });
});

describe("type positions", () => {
  it("records type references, type queries, heritage and satisfies as type-only", () => {
    expect(
      referencesOf(`
        import type { Base, Port, Config } from "./types";
        import { defaults } from "./defaults";
        import { Model } from "./model";
        export interface Repo extends Base<Model> { items: Model[] }
        export class Impl extends Model implements Port {
          config: typeof defaults = defaults satisfies Config;
        }
        export type Keys = keyof typeof defaults;
      `),
    ).toEqual([
      { from: "Repo", kind: "extends", target: imported("Base"), typeOnly: true },
      { from: "Repo", kind: "type", target: imported("Model"), typeOnly: true },
      { from: "Repo", kind: "type", target: imported("Model"), typeOnly: true },
      { from: "Impl", kind: "extends", target: imported("Model"), typeOnly: false },
      { from: "Impl", kind: "implements", target: imported("Port"), typeOnly: true },
      { from: "Impl.config", kind: "type", target: imported("defaults"), typeOnly: true },
      { from: "Impl.config", kind: "value", target: imported("defaults"), typeOnly: false },
      { from: "Impl.config", kind: "type", target: imported("Config"), typeOnly: true },
      { from: "Keys", kind: "type", target: imported("defaults"), typeOnly: true },
    ]);
  });

  it("marks uses of type-only imports as type-only and ignores type parameters and built-in types", () => {
    expect(
      referencesOf(`
        import type { Shape } from "./shape";
        export function f<T extends Shape>(value: T, list: Array<Promise<T>>): Record<string, T> {
          return Shape.normalize(value);
        }
      `),
    ).toEqual([
      { from: "f", kind: "type", target: imported("Shape"), typeOnly: true },
      { from: "f", kind: "call", target: imported("Shape", "normalize"), typeOnly: true },
    ]);
  });

  it("resolves this in type queries", () => {
    expect(
      referencesOf(
        "export class C { x = 1; y: typeof this.x = 1; z: typeof this; m(): typeof this.x { return 1; } }",
      ),
    ).toEqual([
      { from: "C.y", kind: "type", target: sym("C.x"), typeOnly: true },
      { from: "C.m", kind: "type", target: sym("C.x"), typeOnly: true },
    ]);
  });

  it("records the types of satisfies, as and type assertions on exported bindings", () => {
    expect(
      referencesOf(
        'import type { Config } from "./cfg";\nconst config = { a: 1 };\nexport default config satisfies Config;\n',
      ),
    ).toEqual([{ kind: "type", target: imported("Config"), typeOnly: true }]);
    expect(
      referencesOf(
        'import type { Handler } from "./handler";\nconst handler = () => {};\nexport = handler as unknown as Handler;\n',
      ),
    ).toEqual([{ kind: "type", target: imported("Handler"), typeOnly: true }]);
    expect(
      referencesOf(
        [
          'import type { Handler, Other } from "./handler";',
          "const handler = () => {};",
          "exports.a = exports.b = handler as Handler;",
          "module.exports = { c: <Other>handler, d: handler satisfies Handler };",
        ].join("\n"),
      ),
    ).toEqual([
      { kind: "type", target: imported("Handler"), typeOnly: true },
      { kind: "type", target: imported("Other"), typeOnly: true },
      { kind: "type", target: imported("Handler"), typeOnly: true },
    ]);
  });

  it("records import types as module references", () => {
    expect(referencesOf('export let settings: import("./config").Settings;')).toEqual([
      {
        from: "settings",
        kind: "type",
        target: { type: "module", specifier: "./config", members: ["Settings"] },
        typeOnly: true,
      },
    ]);
  });

  it("records JSDoc type references in JavaScript files", () => {
    expect(
      referencesOf(
        `const { Store } = require("./store");
         /** @param {Store} store */
         function save(store) {}
         module.exports = save;`,
        "src/save.js",
      ),
    ).toEqual([{ from: "save", kind: "type", target: imported("Store"), typeOnly: true }]);
  });
});

describe("from attribution", () => {
  it("attributes references to the innermost enclosing symbol", () => {
    expect(
      referencesOf(`
        import { a, b, c, d, e, f, g, h } from "./deps";
        @a()
        export class Widget extends b {
          size = c();
          get area() { return d(); }
          render() { return [1].map(() => e()); }
        }
        export const total = f();
        const { x, y } = g();
        h();
      `),
    ).toEqual([
      { from: "Widget", kind: "decorator", target: imported("a"), typeOnly: false },
      { from: "Widget", kind: "extends", target: imported("b"), typeOnly: false },
      { from: "Widget.size", kind: "call", target: imported("c"), typeOnly: false },
      { from: "Widget.area", kind: "call", target: imported("d"), typeOnly: false },
      { from: "Widget.render", kind: "call", target: imported("e"), typeOnly: false },
      { from: "total", kind: "call", target: imported("f"), typeOnly: false },
      { kind: "call", target: imported("g"), typeOnly: false },
      { kind: "call", target: imported("h"), typeOnly: false },
    ]);
  });

  it("attributes CommonJS export values to their symbols", () => {
    expect(
      referencesOf(
        `const { log } = require("./log");
         exports.run = function () { log(); };
         module.exports.stop = () => log();
         module.exports = { pause() { log(); }, resume: function () { log(); } };`,
        "src/control.js",
      ),
    ).toEqual([
      { from: "run", kind: "call", target: imported("log"), typeOnly: false },
      { from: "stop", kind: "call", target: imported("log"), typeOnly: false },
      { from: "pause", kind: "call", target: imported("log"), typeOnly: false },
      { from: "resume", kind: "call", target: imported("log"), typeOnly: false },
    ]);
  });
});

describe("source order and positions", () => {
  it("lists references in source order with 1-based positions of the referenced name", () => {
    const references = extract(
      'import { a, b } from "./x";\nexport const v =\n  a(b);\n',
    ).references;
    expect(
      references.map((reference) => [reference.kind, reference.line, reference.column]),
    ).toEqual([
      ["call", 3, 3],
      ["value", 3, 5],
    ]);
  });

  it("counts lines by \\n only: U+2028 and U+2029 do not start lines", () => {
    const extraction = extract(
      'import { a } from "./a";\nconst SEP = "x\u2028y\u2029z";\nexport function f() {\n  return a();\n}\nconst x = (1;\n',
    );
    expect(extraction.symbols.find((symbol) => symbol.localName === "f")?.range).toEqual({
      start: { line: 3, column: 1 },
      end: { line: 5, column: 2 },
    });
    expect(
      extraction.references.map((reference) => [reference.kind, reference.line, reference.column]),
    ).toEqual([["call", 4, 10]]);
    expect(extraction.syntaxErrors).toEqual([{ message: "')' expected.", line: 6, column: 13 }]);
    // A line separator ends a `//` comment (JavaScript treats it as a line terminator) without starting a line.
    expect(
      extract('import { a } from "./a";\n// note\u2028a();\n').references.map((reference) => [
        reference.line,
        reference.column,
      ]),
    ).toEqual([[2, 9]]);
  });
});
