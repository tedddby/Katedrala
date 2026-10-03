import { describe, expect, it } from "vitest";
import type {
  ModuleResolution,
  NameCandidate,
  ReferenceKind,
  ReferenceTarget,
} from "@katedrala/plugin-api";
import type { LinkResult } from "./types.js";
import {
  ADAPTER,
  exportLocal,
  exportStar,
  extraction,
  fakeProject,
  file,
  findEdge,
  imp,
  instance,
  member,
  reexportImport,
  ref,
  run,
  sid,
  sym,
  typeRef,
  use,
} from "./test-support.js";

const MAIN = sid("src/main.ts", "main");

/** Outgoing edges of `main` as `kind target` strings. */
function fromMain(result: LinkResult): string[] {
  return result.edges
    .filter((edge) => edge.source === MAIN)
    .map((edge) => `${edge.kind} ${edge.target}`);
}

/** The provenance of main's only edge to `target`. */
function provenanceTo(result: LinkResult, target: string) {
  const edges = result.edges.filter((edge) => edge.source === MAIN && edge.target === target);
  expect(edges).toHaveLength(1);
  return edges[0]?.provenance[0];
}

function main(
  imports: ReturnType<typeof imp>[],
  references: Array<[kind: ReferenceKind, target: ReferenceTarget]>,
  extra: ReturnType<typeof sym>[] = [],
) {
  return file(
    "src/main.ts",
    extraction({
      symbols: [sym("main", "function"), ...extra],
      imports,
      references: references.map(([kind, target], index) =>
        use(kind, target, { from: "main", line: index + 1, column: 1 }),
      ),
    }),
  );
}

/** A module declaring the given symbols and exporting the top-level ones. */
function library(
  path: string,
  symbols: ReturnType<typeof sym>[],
  extra: Parameters<typeof extraction>[0] = {},
) {
  return file(
    path,
    extraction({
      symbols,
      exports: symbols
        .filter((symbol) => symbol.parent === undefined)
        .map((symbol) => exportLocal(symbol.name, ref.symbol(symbol.localName))),
      ...extra,
    }),
  );
}

describe("local declarations", () => {
  it("binds symbol references in the same file, from the enclosing symbol", async () => {
    const result = await run([
      file(
        "src/a.ts",
        extraction({
          symbols: [sym("helper", "function"), sym("run", "function"), sym("count", "variable")],
          references: [
            use("call", ref.symbol("helper"), { from: "run", line: 3, column: 5 }),
            use("call", ref.symbol("run"), { from: "run", line: 4 }),
            use("value", ref.symbol("count"), { line: 9 }),
            use("call", ref.symbol("nowhere"), { from: "run", line: 5 }),
            use("call", ref.symbol("helper"), { from: "ghost", line: 6 }),
          ],
        }),
      ),
    ]);
    expect(
      findEdge(result, "calls", sid("src/a.ts", "run"), sid("src/a.ts", "helper"))?.provenance,
    ).toEqual([
      {
        file: "file:src/a.ts",
        line: 3,
        column: 5,
        mechanism: "call-expression",
        resolution: "local-declaration",
        confidence: 1,
      },
    ]);
    // File-scope code (and code in unknown symbols) is attributed to the file.
    expect(findEdge(result, "uses", "file:src/a.ts", sid("src/a.ts", "count"))).toBeDefined();
    expect(
      findEdge(result, "calls", "file:src/a.ts", sid("src/a.ts", "helper"))?.provenance[0]?.line,
    ).toBe(6);
    // Recursion is resolved but produces no self-edge; the unknown local name is unresolved.
    expect(result.edges.some((edge) => edge.source === edge.target)).toBe(false);
    expect(result.stats.unresolvedReferences).toBe(1);
  });

  it("never binds or counts local variables and parameters", async () => {
    const result = await run([
      main(
        [],
        [
          ["call", ref.local("handler")],
          ["call", ref.parameter("app", "get")],
          ["call", instance("call-result", ref.local("factory"), "build")],
        ],
      ),
    ]);
    expect(result.edges).toEqual([]);
    expect(result.stats.unresolvedReferences).toBe(0);
  });
});

describe("member walks", () => {
  it("prefers static members on a class and instance members on instances", async () => {
    const result = await run([
      library("src/a.ts", [
        sym("A", "class"),
        member("A", "create", "method", { modifiers: ["static"], disambiguator: "method-static" }),
        member("A", "create", "method"),
      ]),
      main(
        [imp("./a", ["A"])],
        [
          ["call", ref.import("A", "create")],
          ["call", instance("constructor-type", ref.import("A"), "create")],
        ],
      ),
    ]);
    expect(provenanceTo(result, sid("src/a.ts", "A.create~method-static"))).toMatchObject({
      line: 1,
      resolution: "import-binding",
      confidence: 1,
    });
    expect(provenanceTo(result, sid("src/a.ts", "A.create"))).toMatchObject({
      line: 2,
      resolution: "constructor-type",
      confidence: 0.9,
    });
  });

  it("continues in the declared type of a property (declared-type)", async () => {
    const repository = library("src/repo.ts", [
      sym("OrderRepository", "class"),
      member("OrderRepository", "save", "method"),
    ]);
    const service = file(
      "src/service.ts",
      extraction({
        imports: [imp("./repo", ["OrderRepository"])],
        symbols: [
          sym("OrderService", "class"),
          member("OrderService", "repo", "property", {
            declaredType: typeRef(ref.import("OrderRepository")),
          }),
          member("OrderService", "place", "method"),
        ],
        references: [
          use("call", ref.symbol("OrderService.repo", "save"), {
            from: "OrderService.place",
            line: 7,
          }),
          use("call", ref.symbol("OrderService.repo", "drop"), {
            from: "OrderService.place",
            line: 8,
          }),
        ],
      }),
    );
    const result = await run([repository, service]);
    const place = sid("src/service.ts", "OrderService.place");
    expect(
      findEdge(result, "calls", place, sid("src/repo.ts", "OrderRepository.save"))?.provenance[0],
    ).toMatchObject({
      resolution: "declared-type",
      confidence: 0.9,
    });
    // `drop` exists nowhere: the deepest entity reached is the declared type the walk continued in (a call
    // on a container is never an instantiation).
    expect(
      findEdge(result, "calls", place, sid("src/repo.ts", "OrderRepository"))?.provenance[0],
    ).toMatchObject({
      line: 8,
      resolution: "declared-type",
      confidence: 0.7,
      detail: "unresolved member path: drop",
    });
  });

  it("finds members on base types (inherited-member), depth-first through extends", async () => {
    const result = await run([
      library("src/base.ts", [
        sym("Repository", "class"),
        member("Repository", "getOrThrow", "method"),
        sym("Port", "interface"),
        member("Port", "getOrThrow", "method"),
      ]),
      file(
        "src/repo.ts",
        extraction({
          imports: [imp("./base", ["Repository", "Port"])],
          symbols: [sym("OrderRepository", "class"), member("OrderRepository", "save", "method")],
          exports: [exportLocal("OrderRepository", ref.symbol("OrderRepository"))],
          references: [
            use("implements", ref.import("Port"), { from: "OrderRepository", line: 1 }),
            use("extends", ref.import("Repository"), { from: "OrderRepository", line: 2 }),
          ],
        }),
      ),
      main(
        [imp("./repo", ["OrderRepository"])],
        [["call", instance("declared-type", ref.import("OrderRepository"), "getOrThrow")]],
      ),
    ]);
    expect(provenanceTo(result, sid("src/base.ts", "Repository.getOrThrow"))).toMatchObject({
      resolution: "inherited-member",
      confidence: 0.85,
    });
    expect(
      findEdge(
        result,
        "extends",
        sid("src/repo.ts", "OrderRepository"),
        sid("src/base.ts", "Repository"),
      )?.provenance[0],
    ).toMatchObject({ mechanism: "extends-clause", resolution: "import-binding" });
    expect(
      findEdge(
        result,
        "implements",
        sid("src/repo.ts", "OrderRepository"),
        sid("src/base.ts", "Port"),
      )?.provenance[0]?.mechanism,
    ).toBe("implements-clause");
  });

  it("searches at most eight base levels and survives inheritance cycles", async () => {
    const chain = Array.from({ length: 11 }, (_, index) => `C${index}`);
    const symbols = chain.map((name) => sym(name, "class"));
    const references = chain
      .slice(0, -1)
      .map((name, index) =>
        use("extends", ref.symbol(chain[index + 1] ?? name), { from: name, line: index + 1 }),
      );
    const result = await run([
      file(
        "src/chain.ts",
        extraction({
          symbols: [
            ...symbols,
            member("C8", "near", "method"),
            member("C10", "far", "method"),
            sym("Loop1", "class"),
            sym("Loop2", "class"),
            sym("user", "function"),
          ],
          references: [
            ...references,
            use("extends", ref.symbol("Loop2"), { from: "Loop1", line: 20 }),
            use("extends", ref.symbol("Loop1"), { from: "Loop2", line: 21 }),
            use("call", instance("declared-type", ref.symbol("C0"), "near"), {
              from: "user",
              line: 30,
            }),
            use("call", instance("declared-type", ref.symbol("C0"), "far"), {
              from: "user",
              line: 31,
            }),
            use("call", instance("declared-type", ref.symbol("Loop1"), "missing"), {
              from: "user",
              line: 32,
            }),
          ],
        }),
      ),
    ]);
    const user = sid("src/chain.ts", "user");
    expect(
      findEdge(result, "calls", user, sid("src/chain.ts", "C8.near"))?.provenance[0]?.resolution,
    ).toBe("inherited-member");
    // C10 is ten levels up: beyond the search depth, so the member path stays unresolved at C0.
    expect(findEdge(result, "calls", user, sid("src/chain.ts", "C0"))?.provenance[0]).toMatchObject(
      {
        line: 31,
        confidence: 0.7,
        detail: "unresolved member path: far",
      },
    );
    expect(
      findEdge(result, "calls", user, sid("src/chain.ts", "Loop1"))?.provenance[0]?.detail,
    ).toBe("unresolved member path: missing");
  });

  it("resolves call results through declared return types (return-type)", async () => {
    const result = await run([
      library("src/repo.ts", [sym("Repo", "class"), member("Repo", "save", "method")]),
      library(
        "src/factory.ts",
        [
          sym("getRepo", "function", { returnType: typeRef(ref.import("Repo")) }),
          sym("untyped", "function"),
          sym("Service", "class"),
          member("Service", "run", "method"),
        ],
        { imports: [imp("./repo", ["Repo"])] },
      ),
      main(
        [imp("./factory", ["getRepo", "untyped", "Service"])],
        [
          ["call", instance("call-result", ref.import("getRepo"), "save")],
          ["call", instance("call-result", ref.import("untyped"), "save")],
          ["call", instance("call-result", ref.import("Service"), "run")],
        ],
      ),
    ]);
    expect(provenanceTo(result, sid("src/repo.ts", "Repo.save"))).toMatchObject({
      resolution: "return-type",
      confidence: 0.8,
    });
    // Calling a class yields an instance of it.
    expect(provenanceTo(result, sid("src/factory.ts", "Service.run"))).toMatchObject({
      resolution: "constructor-type",
      confidence: 0.9,
    });
    // Without a declared return type the result's type is unknown: untyped, not unresolved.
    expect(result.stats.unresolvedReferences).toBe(0);
    expect(result.stats.untypedReferences).toBe(1);
  });

  it("counts members of untyped values as untyped, and missing bindings as unresolved", async () => {
    const result = await run([
      library("src/factory.ts", [sym("untyped", "function")]),
      main(
        [imp("./factory", ["untyped", "missing"])],
        [
          // untyped().a.b(): the inner value has no known type, so neither has anything reached through it.
          [
            "call",
            instance("call-result", instance("call-result", ref.import("untyped"), "a"), "b"),
          ],
          // missing().run(): `missing` is not exported, so the binding itself fails.
          ["call", instance("call-result", ref.import("missing"), "run")],
          ["call", ref.import("missing")],
        ],
      ),
    ]);
    expect(result.stats.untypedReferences).toBe(1);
    expect(result.stats.unresolvedReferences).toBe(2);
  });

  it("types module-level values by their initializer", async () => {
    const result = await run([
      library("src/db.ts", [sym("Database", "class"), member("Database", "query", "method")]),
      library(
        "src/clients.ts",
        [
          sym("db", "constant", { initializer: { kind: "new", callee: ref.import("Database") } }),
          sym("connect", "function", { returnType: typeRef(ref.import("Database")) }),
          sym("conn", "constant", { initializer: { kind: "call", callee: ref.symbol("connect") } }),
        ],
        { imports: [imp("./db", ["Database"])] },
      ),
      main(
        [imp("./clients", ["db", "conn"])],
        [
          ["call", ref.import("db", "query")],
          ["call", ref.import("conn", "query")],
        ],
      ),
    ]);
    const edge = findEdge(result, "calls", MAIN, sid("src/db.ts", "Database.query"));
    expect(edge?.provenance.map((item) => [item.line, item.resolution, item.confidence])).toEqual([
      [1, "constructor-type", 0.9],
      [2, "return-type", 0.8],
    ]);
  });

  it("finds members of merged declarations (a class and its namespace)", async () => {
    const result = await run([
      library("src/invoice.ts", [
        sym("Invoice", "class"),
        sym("Invoice~namespace", "namespace"),
        member("Invoice~namespace", "fromOrder", "function"),
        member("Invoice~namespace", "Format", "type-alias"),
        member("Invoice", "render", "method"),
      ]),
      main(
        [imp("./invoice", ["Invoice"])],
        [
          ["new", ref.import("Invoice")],
          ["call", ref.import("Invoice", "fromOrder")],
          ["type", ref.import("Invoice", "Format")],
          ["call", instance("constructor-type", ref.import("Invoice"), "render")],
        ],
      ),
    ]);
    expect(fromMain(result)).toEqual([
      `instantiates ${sid("src/invoice.ts", "Invoice")}`,
      `references-type ${sid("src/invoice.ts", "Invoice.Format")}`,
      `calls ${sid("src/invoice.ts", "Invoice.fromOrder")}`,
      `calls ${sid("src/invoice.ts", "Invoice.render")}`,
    ]);
  });

  it("chooses between a value and a type sharing a name by position", async () => {
    const result = await run([
      file(
        "src/user.ts",
        extraction({
          symbols: [sym("User", "constant"), sym("User~type-alias", "type-alias")],
          exports: [exportLocal("User", [ref.symbol("User"), ref.symbol("User~type-alias")])],
        }),
      ),
      main(
        [imp("./user", ["User"])],
        [
          ["type", ref.import("User")],
          ["value", ref.import("User")],
        ],
      ),
    ]);
    expect(fromMain(result)).toEqual([
      `uses ${sid("src/user.ts", "User")}`,
      `references-type ${sid("src/user.ts", "User~type-alias")}`,
    ]);
  });

  it("stops partial member paths at the deepest entity, which is never instantiated", async () => {
    const result = await run([
      library("src/a.ts", [sym("Foo", "class"), member("Foo", "Inner", "class")]),
      main([imp("./a", ["Foo"])], [["call", ref.import("Foo", "Inner", "missing", "deep")]]),
    ]);
    expect(fromMain(result)).toEqual([`calls ${sid("src/a.ts", "Foo.Inner")}`]);
    expect(provenanceTo(result, sid("src/a.ts", "Foo.Inner"))).toMatchObject({
      confidence: 0.7,
      detail: "unresolved member path: missing.deep",
    });
    expect(result.stats.unresolvedReferences).toBe(0);
  });
});

describe("externals", () => {
  it("stops at external modules with the remaining member path", async () => {
    const result = await run([
      main(
        [
          imp("node:fs", ["readFile"]),
          imp("fs", [["fs", "*"]]),
          imp("express", [["express", "default"]]),
          imp("missing-module-x", ["y"]),
        ],
        [
          ["call", ref.import("readFile")],
          ["call", ref.import("fs", "promises", "readFile")],
          ["call", ref.import("express")],
          ["call", ref.import("express", "Router")],
        ],
      ),
    ]);
    expect(provenanceTo(result, "ext:node:fs")).toMatchObject({
      resolution: "import-binding",
      detail: "readFile",
    });
    expect(provenanceTo(result, "ext:npm:fs")?.detail).toBe("promises.readFile");
    const express = findEdge(result, "calls", MAIN, "ext:npm:express");
    expect(express?.provenance.map((item) => item.detail)).toEqual([undefined, "Router"]);
  });

  it("stops at external declared types and external base types", async () => {
    const result = await run([
      file(
        "src/main.ts",
        extraction({
          imports: [imp("@angular/common", ["HttpClient"]), imp("react", ["Component"])],
          symbols: [
            sym("main", "function"),
            sym("Api", "class"),
            member("Api", "http", "property", { declaredType: typeRef(ref.import("HttpClient")) }),
            sym("View", "class"),
          ],
          references: [
            use("extends", ref.import("Component"), { from: "View", line: 1 }),
            use("call", ref.symbol("Api.http", "get"), { from: "main", line: 2 }),
            use("call", instance("declared-type", ref.symbol("View"), "setState"), {
              from: "main",
              line: 3,
            }),
          ],
        }),
      ),
    ]);
    expect(provenanceTo(result, "ext:npm:@angular/common")).toMatchObject({
      resolution: "declared-type",
      confidence: 0.9,
      detail: "HttpClient.get",
    });
    expect(provenanceTo(result, "ext:npm:react")).toMatchObject({
      resolution: "inherited-member",
      confidence: 0.85,
      detail: "Component.setState",
    });
  });

  it("follows call results of external functions into the external", async () => {
    const result = await run([
      main(
        [imp("pg", ["createPool"])],
        [["call", instance("call-result", ref.import("createPool"), "query")]],
      ),
    ]);
    expect(provenanceTo(result, "ext:npm:pg")).toMatchObject({
      resolution: "import-binding",
      detail: "createPool.query",
    });
  });
});

describe("unbound names", () => {
  it("resolves names declared in the global scope (one observation per declaration)", async () => {
    const result = await run([
      file(
        "src/globals.d.ts",
        extraction({
          moduleFormat: "script",
          globals: ["__APP_VERSION__", "ShopGlobals", "dup"],
          symbols: [
            sym("__APP_VERSION__", "constant"),
            sym("ShopGlobals", "namespace"),
            member("ShopGlobals", "BuildInfo", "interface"),
            sym("dup", "function"),
          ],
        }),
      ),
      file(
        "src/polyfills.ts",
        extraction({ moduleFormat: "script", globals: ["dup"], symbols: [sym("dup", "function")] }),
      ),
      main(
        [],
        [
          ["value", ref.name("__APP_VERSION__")],
          ["type", ref.name("ShopGlobals", "BuildInfo")],
          ["call", ref.name("dup")],
          ["call", ref.name("undefinedThing")],
        ],
      ),
    ]);
    expect(fromMain(result)).toEqual([
      `references-type ${sid("src/globals.d.ts", "ShopGlobals.BuildInfo")}`,
      `uses ${sid("src/globals.d.ts", "__APP_VERSION__")}`,
      `calls ${sid("src/globals.d.ts", "dup")}`,
      `calls ${sid("src/polyfills.ts", "dup")}`,
    ]);
    expect(provenanceTo(result, sid("src/polyfills.ts", "dup"))).toMatchObject({
      resolution: "global-scope",
      confidence: 0.8,
    });
    expect(result.stats.unresolvedReferences).toBe(1);
  });

  it("uses the project's name resolver once, with its candidates' methods and confidences", async () => {
    const lookups: Array<{ name: string; fromFile: string; from?: string }> = [];
    const project = fakeProject({
      files: ["pkg/a.go", "pkg/b.go", "pkg/c.go"],
      link: (view) => ({
        lookup(request): NameCandidate[] {
          lookups.push(request);
          if (request.name === "Helper") {
            return [
              { path: "pkg/b.go", localName: "Helper", method: "package-scope", confidence: 1 },
              { path: "pkg/c.go", localName: "Helper", method: "package-scope", confidence: 0.5 },
              { path: "pkg/b.go", localName: "Helper", method: "package-scope", confidence: 0.4 },
              { path: "gone.go", localName: "Helper", method: "package-scope", confidence: 1 },
            ];
          }
          return view.files.includes("pkg/b.go") ? [] : [];
        },
      }),
    });
    const result = await run(
      [
        file(
          "pkg/a.go",
          extraction({
            moduleFormat: "package",
            symbols: [sym("Run", "function")],
            references: [
              use("call", ref.name("Helper"), { from: "Run", line: 3 }),
              use("call", ref.name("Unknown"), { from: "Run", line: 4 }),
            ],
          }),
        ),
        file(
          "pkg/b.go",
          extraction({
            moduleFormat: "package",
            globals: ["Unknown"],
            symbols: [sym("Helper", "function"), sym("Unknown", "function")],
          }),
        ),
        file(
          "pkg/c.go",
          extraction({ moduleFormat: "package", symbols: [sym("Helper", "function")] }),
        ),
      ],
      { projects: [{ adapterId: ADAPTER, project }] },
    );
    const run_ = sid("pkg/a.go", "Run");
    expect(findEdge(result, "calls", run_, sid("pkg/b.go", "Helper"))?.provenance[0]).toMatchObject(
      {
        resolution: "package-scope",
        confidence: 1,
      },
    );
    expect(
      findEdge(result, "calls", run_, sid("pkg/c.go", "Helper"))?.provenance[0]?.confidence,
    ).toBe(0.5);
    // With a name resolver the global scope is not consulted.
    expect(result.stats.unresolvedReferences).toBe(1);
    expect(project.linkViews).toHaveLength(1);
    expect(project.linkViews[0]?.files).toEqual(["pkg/a.go", "pkg/b.go", "pkg/c.go"]);
    expect(project.linkViews[0]?.extraction("pkg/c.go")?.symbols[0]?.localName).toBe("Helper");
    expect(lookups).toEqual([
      { name: "Helper", fromFile: "pkg/a.go", from: "Run" },
      { name: "Unknown", fromFile: "pkg/a.go", from: "Run" },
    ]);
  });

  it("falls back to the global scope when the link phase fails, and reports failures once", async () => {
    const failingLink = fakeProject({
      link: () => Promise.reject(new Error("no go.mod")),
    });
    const result = await run(
      [
        file("lib.d.ts", extraction({ globals: ["G"], symbols: [sym("G", "function")] })),
        main([], [["call", ref.name("G")]]),
      ],
      { projects: [{ adapterId: ADAPTER, project: failingLink }] },
    );
    expect(fromMain(result)).toEqual([`calls ${sid("lib.d.ts", "G")}`]);
    expect(result.diagnostics).toEqual([
      {
        code: "plugin-error",
        severity: "error",
        message:
          'Adapter "fake" failed to prepare name lookup: no go.mod; unbound names of its files are looked up in the global scope',
      },
    ]);

    const failingLookup = fakeProject({
      link: () => ({
        lookup: () => {
          throw new Error("index corrupt");
        },
      }),
    });
    const second = await run(
      [
        main(
          [],
          [
            ["call", ref.name("a")],
            ["call", ref.name("b")],
          ],
        ),
      ],
      {
        projects: [{ adapterId: ADAPTER, project: failingLookup }],
      },
    );
    expect(second.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      'The name resolver of adapter "fake" failed: index corrupt',
    ]);
    expect(second.stats.unresolvedReferences).toBe(2);
  });

  it("does not call link() for adapters without analyzed files", async () => {
    const other = fakeProject({ link: () => ({ lookup: () => [] }) });
    await run([main([], [])], {
      projects: [
        { adapterId: ADAPTER, project: fakeProject() },
        { adapterId: "other", project: other },
      ],
    });
    expect(other.linkViews).toEqual([]);
  });
});

describe("edge kinds", () => {
  const targets = library("src/t.ts", [
    sym("fn", "function"),
    sym("Klass", "class"),
    sym("Point", "struct"),
    sym("Rec", "record"),
    sym("Iface", "interface"),
    sym("Shape", "type-alias"),
    sym("value", "constant"),
    sym("decorate", "function"),
    sym("Component", "function"),
    sym("macro_rules", "macro"),
  ]);

  it("follows the reference kind and the kind of the resolved target", async () => {
    const cases: Array<[ReferenceKind, string, string, string]> = [
      ["call", "fn", "calls", "call-expression"],
      ["call", "Klass", "instantiates", "call-expression"],
      ["call", "Point", "instantiates", "call-expression"],
      ["call", "Rec", "instantiates", "call-expression"],
      ["new", "Klass", "instantiates", "new-expression"],
      ["construct", "Point", "instantiates", "new-expression"],
      ["tagged-template", "fn", "calls", "tagged-template"],
      ["macro", "macro_rules", "calls", "call-expression"],
      ["extends", "Klass", "extends", "extends-clause"],
      ["embed", "Point", "extends", "extends-clause"],
      ["implements", "Iface", "implements", "implements-clause"],
      ["derive", "Iface", "implements", "implements-clause"],
      ["type", "Shape", "references-type", "type-annotation"],
      ["decorator", "decorate", "decorated-by", "decorator"],
      ["jsx", "Component", "uses", "jsx-element"],
      ["value", "value", "uses", "value-reference"],
    ];
    for (const [kind, target, edgeKind, mechanism] of cases) {
      const result = await run([
        targets,
        main([imp("./t", [target])], [[kind, ref.import(target)]]),
      ]);
      const edges = result.edges.filter((edge) => edge.source === MAIN);
      expect(
        edges.map((edge) => [edge.kind, edge.target]),
        `${kind} ${target}`,
      ).toEqual([[edgeKind, sid("src/t.ts", target)]]);
      expect(edges[0]?.provenance[0]?.mechanism, `${kind} ${target}`).toBe(mechanism);
    }
  });

  it("records type-only references", async () => {
    const result = await run([
      targets,
      file(
        "src/main.ts",
        extraction({
          symbols: [sym("main", "function")],
          imports: [imp("./t", ["Shape"], { typeOnly: true })],
          references: [use("type", ref.import("Shape"), { from: "main", typeOnly: true })],
        }),
      ),
    ]);
    const edge = findEdge(result, "references-type", MAIN, sid("src/t.ts", "Shape"));
    expect(edge?.typeOnly).toBe(true);
    expect(edge?.provenance[0]?.typeOnly).toBe(true);
  });
});

describe("modules referenced inline and resolver extras", () => {
  it("binds inline module references (import types, require member access)", async () => {
    const result = await run([
      library("src/x.ts", [sym("Foo", "interface"), sym("bar", "function")]),
      main(
        [imp("./x", [], { kind: "dynamic", mechanism: "dynamic-import" })],
        [
          ["type", ref.module("./x", "Foo")],
          ["call", ref.module("./x", "bar")],
          ["value", ref.module("./x")],
          ["call", ref.module("lodash", "chunk")],
        ],
      ),
    ]);
    expect(fromMain(result)).toEqual([
      "calls ext:npm:lodash",
      "uses file:src/x.ts",
      `references-type ${sid("src/x.ts", "Foo")}`,
      `calls ${sid("src/x.ts", "bar")}`,
    ]);
  });

  it("walks trailing members of resolutions (e.g. Java imports of nested types)", async () => {
    const result = await run(
      [
        library("com/acme/Order.java", [sym("Order", "class"), member("Order", "Status", "enum")]),
        main([imp("com.acme.Order.Status", ["Status"])], [["type", ref.import("Status")]]),
      ],
      {
        project: {
          modules: {
            "com.acme.Order.Status": {
              status: "resolved",
              paths: ["com/acme/Order.java"],
              method: "package-scope",
              members: ["Order", "Status"],
            },
          },
        },
      },
    );
    expect(fromMain(result)).toEqual([
      `references-type ${sid("com/acme/Order.java", "Order.Status")}`,
    ]);
  });

  it("asks the project for child modules a namespace does not export", async () => {
    const result = await run(
      [
        file("pkg/__init__.py", extraction({ moduleFormat: "x-python" })),
        library("pkg/sub.py", [sym("run", "function")]),
        main([imp("pkg", [["pkg", "*"]])], [["call", ref.import("pkg", "sub", "run")]]),
      ],
      {
        project: {
          modules: { pkg: "pkg/__init__.py" },
          members: { "pkg/__init__.py|sub": "pkg/sub.py" },
        },
      },
    );
    expect(fromMain(result)).toEqual([`calls ${sid("pkg/sub.py", "run")}`]);
  });

  it("reports a failing member resolver once and treats the member as unresolved", async () => {
    const result = await run(
      [
        file("pkg/__init__.py", extraction({ moduleFormat: "x-python" })),
        main(
          [imp("pkg", [["pkg", "*"]])],
          [
            ["call", ref.import("pkg", "sub", "run")],
            ["call", ref.import("pkg", "other")],
          ],
        ),
      ],
      { project: { modules: { pkg: "pkg/__init__.py" }, failResolveMember: true } },
    );
    expect(result.edges.filter((edge) => edge.source === MAIN)).toEqual([]);
    expect(result.stats.unresolvedReferences).toBe(2);
    expect(result.diagnostics).toEqual([
      {
        code: "plugin-error",
        severity: "error",
        message: 'The member resolver of adapter "fake" failed: member resolver exploded',
      },
    ]);
  });

  it("ignores references of kinds outside the plugin contract", async () => {
    const result = await run([
      library("src/t.ts", [sym("fn", "function")]),
      main([imp("./t", ["fn"])], [["x-acme-ref" as ReferenceKind, ref.import("fn")]]),
    ]);
    expect(result.edges.filter((edge) => edge.source === MAIN)).toEqual([]);
    expect(result.stats.unresolvedReferences).toBe(0);
  });

  it("binds imports of files without an extraction to the file, keeping the member path", async () => {
    const result = await run([
      file("src/data.json", undefined, { language: "json" }),
      file("src/api.generated.ts", undefined, {
        language: "typescript",
        status: "skipped",
        reason: "file-too-large",
      }),
      main(
        [
          imp("./data.json", [["data", "default"]]),
          imp("./data.json", ["items"]),
          imp("./api.generated", ["api"]),
        ],
        [
          ["value", ref.import("data")],
          ["value", ref.import("data", "items")],
          // data.items.map(...): what is invoked is read from the data file.
          ["call", ref.import("data", "items", "map")],
          ["call", ref.import("items", "map")],
          // Code that was not parsed is still code.
          ["call", ref.import("api", "getUser")],
        ],
      ),
    ]);
    expect(fromMain(result)).toEqual([
      "calls file:src/api.generated.ts",
      "uses file:src/data.json",
    ]);
    expect(
      findEdge(result, "uses", MAIN, "file:src/data.json")?.provenance.map((item) => [
        item.line,
        item.mechanism,
        item.resolution,
        item.confidence,
        item.detail,
      ]),
    ).toEqual([
      [1, "value-reference", "import-binding", 1, undefined],
      [2, "value-reference", "import-binding", 1, "items"],
      [3, "call-expression", "import-binding", 1, "items.map"],
      [4, "call-expression", "import-binding", 1, "items.map"],
    ]);
    // The path inside the module starts with the imported name, as for externals.
    expect(provenanceTo(result, "file:src/api.generated.ts")).toMatchObject({
      line: 5,
      confidence: 1,
      detail: "api.getUser",
    });
    expect(result.stats.unresolvedReferences).toBe(0);
  });

  it("does not count references through files excluded from the analysis", async () => {
    // Resolvers match the snapshot's files: these paths exist but are not listed.
    const excluded = (path: string): ModuleResolution => ({
      status: "resolved",
      paths: [path],
      method: "relative-path",
    });
    const result = await run(
      [
        file(
          "src/gen/index.ts",
          extraction({
            imports: [reexportImport("./api.generated", { mechanism: "export-all" })],
            exports: [exportStar("./api.generated")],
          }),
        ),
        main(
          [
            imp("./gen/api.generated", ["call"]),
            imp("./gen/api.generated", [["api", "*"]]),
            imp("./gen/index", ["fromBarrel"]),
            imp("./gen/index", [["gen", "*"]]),
          ],
          [
            ["call", ref.import("call")],
            ["call", ref.import("api", "call")],
            ["call", instance("call-result", ref.import("call"), "then")],
            ["call", ref.import("fromBarrel")],
            ["call", ref.import("gen", "fromBarrel")],
            ["call", ref.module("./gen/api.generated", "call")],
            ["call", ref.import("notImported")],
          ],
        ),
      ],
      {
        project: {
          modules: {
            "src/main.ts|./gen/api.generated": excluded("src/gen/api.generated.ts"),
            "src/gen/index.ts|./api.generated": excluded("src/gen/api.generated.ts"),
          },
        },
      },
    );
    expect(result.edges.filter((edge) => edge.source === MAIN)).toEqual([]);
    // Only the name nothing imports is unresolved.
    expect(result.stats.unresolvedReferences).toBe(1);
    expect(result.stats.untypedReferences).toBe(0);
    expect(result.stats.unresolvedImports).toBe(0);
  });

  it("counts references through unresolved imports as unresolved", async () => {
    const result = await run([
      main(
        [imp("./missing", ["a"]), imp("dyn", [["b", "default"]], { literal: false })],
        [
          ["call", ref.import("a")],
          ["call", ref.import("b")],
          ["call", ref.import("notImported")],
        ],
      ),
    ]);
    expect(result.edges).toEqual([]);
    expect(result.stats.unresolvedReferences).toBe(3);
  });
});

describe("owners and partial types", () => {
  it("resolves receivers to owners and finds owned members through the owner", async () => {
    const project = fakeProject({
      files: ["srv/server.go", "srv/start.go", "main.go"],
      modules: { "example.com/srv": ["srv/server.go", "srv/start.go"] },
      link: () => ({
        lookup: (request) =>
          request.name === "Server" && request.fromFile.startsWith("srv/")
            ? [
                {
                  path: "srv/server.go",
                  localName: "Server",
                  method: "package-scope",
                  confidence: 1,
                },
              ]
            : [],
      }),
    });
    const result = await run(
      [
        file(
          "srv/server.go",
          extraction({
            moduleFormat: "package",
            symbols: [sym("Server", "struct", { exported: true })],
          }),
        ),
        file(
          "srv/start.go",
          extraction({
            moduleFormat: "package",
            symbols: [
              sym("Server.Start", "method", {
                exported: true,
                receiver: { type: typeRef(ref.name("Server")), relation: "member" },
              }),
              sym("String", "method", {
                receiver: {
                  type: typeRef(ref.import("strings", "Builder")),
                  relation: "extension",
                },
              }),
            ],
            imports: [imp("strings", ["strings"])],
          }),
        ),
        file(
          "main.go",
          extraction({
            moduleFormat: "package",
            symbols: [sym("main", "function")],
            imports: [imp("example.com/srv", [["srv", "*"]])],
            references: [
              use("call", instance("constructor-type", ref.import("srv", "Server"), "Start"), {
                from: "main",
              }),
            ],
          }),
        ),
      ],
      { projects: [{ adapterId: ADAPTER, project }] },
    );
    const start = result.symbols.find(
      (symbol) => symbol.id === sid("srv/start.go", "Server.Start"),
    );
    expect(start?.owner).toBe(sid("srv/server.go", "Server"));
    expect(start?.parent).toBeUndefined();
    expect(
      result.symbols.find((symbol) => symbol.id === sid("srv/start.go", "String"))?.owner,
    ).toBe("ext:npm:strings");
    expect(
      findEdge(result, "calls", sid("main.go", "main"), sid("srv/start.go", "Server.Start"))
        ?.provenance[0]?.resolution,
    ).toBe("constructor-type");
  });

  it("links partial declarations across files and finds members of every part", async () => {
    const result = await run([
      file(
        "src/A.Part1.cs",
        extraction({
          moduleFormat: "namespace",
          namespaces: ["Acme"],
          symbols: [sym("A", "class", { partial: true }), member("A", "first", "method")],
          references: [use("call", ref.symbol("A", "second"), { from: "A.first" })],
        }),
      ),
      file(
        "src/A.Part2.cs",
        extraction({
          moduleFormat: "namespace",
          namespaces: ["Acme"],
          symbols: [sym("A", "class", { partial: true }), member("A", "second", "method")],
        }),
      ),
      file(
        "src/Other.cs",
        extraction({
          moduleFormat: "namespace",
          namespaces: ["Other"],
          symbols: [sym("A", "class", { partial: true })],
        }),
      ),
    ]);
    const partOf = Object.fromEntries(result.symbols.map((symbol) => [symbol.id, symbol.partOf]));
    expect(partOf[sid("src/A.Part2.cs", "A")]).toBe(sid("src/A.Part1.cs", "A"));
    expect(partOf[sid("src/A.Part1.cs", "A")]).toBeUndefined();
    expect(partOf[sid("src/Other.cs", "A")]).toBeUndefined();
    expect(
      findEdge(
        result,
        "calls",
        sid("src/A.Part1.cs", "A.first"),
        sid("src/A.Part2.cs", "A.second"),
      ),
    ).toBeDefined();
  });
});
