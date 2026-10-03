import { describe, expect, it } from "vitest";
import type { LinkResult } from "./types.js";
import {
  exportFrom,
  exportLocal,
  exportStar,
  extraction,
  fid,
  file,
  findEdge,
  imp,
  member,
  ref,
  reexportImport,
  run,
  sid,
  sym,
  use,
} from "./test-support.js";

function exportsOf(result: LinkResult, path: string) {
  return result.files.find((entry) => entry.path === path)?.exports;
}

function exportedOf(result: LinkResult, path: string): Record<string, boolean> {
  return Object.fromEntries(
    result.symbols
      .filter((symbol) => symbol.file === fid(path))
      .map((symbol) => [symbol.id.slice(symbol.id.indexOf("#") + 1), symbol.exported]),
  );
}

/** A caller file `main.ts` with a function `main` that references `targets` (one reference each). */
function caller(
  imports: ReturnType<typeof imp>[],
  references: ReturnType<typeof use>[],
  path = "src/main.ts",
) {
  return file(
    path,
    extraction({
      symbols: [sym("main", "function")],
      imports,
      references: references.map((reference) => ({ ...reference, from: "main" })),
    }),
  );
}

describe("export entries", () => {
  it("lists local exports with the declarations they denote, sorted by name", async () => {
    const result = await run([
      file(
        "src/user.ts",
        extraction({
          symbols: [
            sym("User", "constant"),
            sym("User~type-alias", "type-alias"),
            sym("helper", "function"),
            sym("default", "function"),
          ],
          exports: [
            exportLocal("zed", ref.symbol("helper")),
            exportLocal("User", [ref.symbol("User~type-alias"), ref.symbol("User")]),
            exportLocal("default", ref.symbol("default")),
            exportLocal("T", ref.symbol("User~type-alias"), { typeOnly: true }),
            exportLocal("ghost", ref.symbol("nothing")),
          ],
        }),
      ),
    ]);
    expect(exportsOf(result, "src/user.ts")).toEqual([
      { name: "T", symbols: [sid("src/user.ts", "User~type-alias")], typeOnly: true },
      {
        name: "User",
        symbols: [sid("src/user.ts", "User"), sid("src/user.ts", "User~type-alias")],
        typeOnly: false,
      },
      { name: "default", symbols: [sid("src/user.ts", "default")], typeOnly: false },
      { name: "ghost", typeOnly: false },
      { name: "zed", symbols: [sid("src/user.ts", "helper")], typeOnly: false },
    ]);
  });

  it("lists re-exports with their resolved module", async () => {
    const result = await run([
      file(
        "src/a.ts",
        extraction({
          symbols: [sym("x", "function")],
          exports: [exportLocal("x", ref.symbol("x"))],
        }),
      ),
      file("src/b.ts", extraction()),
      file(
        "src/index.ts",
        extraction({
          imports: [
            reexportImport("./a"),
            reexportImport("./b", { mechanism: "export-all" }),
            reexportImport("lodash", { mechanism: "export-all" }),
            reexportImport("./nowhere"),
          ],
          exports: [
            exportFrom("y", "./a", "x"),
            exportFrom("missing", "./a"),
            exportStar("./b"),
            exportFrom("ns", "./b", "*"),
            exportStar("lodash"),
            exportFrom("z", "./nowhere"),
          ],
        }),
      ),
    ]);
    expect(exportsOf(result, "src/index.ts")).toEqual([
      { name: "*", from: "./b", target: "file:src/b.ts", typeOnly: false },
      { name: "*", from: "lodash", target: "ext:npm:lodash", typeOnly: false },
      { name: "missing", from: "./a", target: "file:src/a.ts", typeOnly: false },
      { name: "ns", from: "./b", target: "file:src/b.ts", typeOnly: false },
      {
        name: "y",
        symbols: [sid("src/a.ts", "x")],
        from: "./a",
        target: "file:src/a.ts",
        typeOnly: false,
      },
      { name: "z", from: "./nowhere", typeOnly: false },
    ]);
  });
});

describe("re-export chains", () => {
  const library = [
    file(
      "src/a.ts",
      extraction({ symbols: [sym("x", "function")], exports: [exportLocal("x", ref.symbol("x"))] }),
    ),
    file(
      "src/b.ts",
      extraction({ imports: [reexportImport("./a")], exports: [exportFrom("x", "./a")] }),
    ),
    file(
      "src/c.ts",
      extraction({
        imports: [reexportImport("./b", { mechanism: "export-all" })],
        exports: [exportStar("./b")],
      }),
    ),
  ];

  it("follows multi-hop chains and records the files traversed", async () => {
    const result = await run([
      ...library,
      caller([imp("./c", ["x"])], [use("call", ref.import("x"), { line: 5, column: 3 })]),
    ]);
    const edge = findEdge(result, "calls", sid("src/main.ts", "main"), sid("src/a.ts", "x"));
    expect(edge?.provenance).toEqual([
      {
        file: "file:src/main.ts",
        line: 5,
        column: 3,
        mechanism: "call-expression",
        resolution: "re-export-chain",
        confidence: 1,
        via: ["file:src/c.ts", "file:src/b.ts"],
      },
    ]);
    expect(exportsOf(result, "src/b.ts")).toEqual([
      {
        name: "x",
        symbols: [sid("src/a.ts", "x")],
        from: "./a",
        target: "file:src/a.ts",
        typeOnly: false,
      },
    ]);
  });

  it("reports a direct import binding without via", async () => {
    const result = await run([
      ...library,
      caller([imp("./a", ["x"])], [use("call", ref.import("x"))]),
    ]);
    const edge = findEdge(result, "calls", sid("src/main.ts", "main"), sid("src/a.ts", "x"));
    expect(edge?.provenance[0]?.resolution).toBe("import-binding");
    expect(edge?.provenance[0]?.via).toBeUndefined();
  });

  it("follows local exports of import bindings", async () => {
    const result = await run([
      file(
        "src/factory.ts",
        extraction({
          symbols: [sym("create", "function")],
          exports: [exportLocal("create", ref.symbol("create"))],
        }),
      ),
      file(
        "src/shop.ts",
        extraction({
          imports: [imp("./factory", ["create"])],
          exports: [exportLocal("createShop", ref.import("create"))],
        }),
      ),
      caller([imp("./shop", ["createShop"])], [use("call", ref.import("createShop"))]),
    ]);
    const edge = findEdge(
      result,
      "calls",
      sid("src/main.ts", "main"),
      sid("src/factory.ts", "create"),
    );
    expect(edge?.provenance[0]).toMatchObject({
      resolution: "re-export-chain",
      via: ["file:src/shop.ts"],
    });
    expect(exportsOf(result, "src/shop.ts")?.[0]?.symbols).toEqual([
      sid("src/factory.ts", "create"),
    ]);
  });

  it("re-exports default exports under another name", async () => {
    const result = await run([
      file(
        "src/shop.ts",
        extraction({
          symbols: [sym("Shop", "class")],
          exports: [exportLocal("default", ref.symbol("Shop"))],
        }),
      ),
      file(
        "src/index.ts",
        extraction({
          imports: [reexportImport("./shop")],
          exports: [exportFrom("Shop", "./shop", "default")],
        }),
      ),
      caller([imp("./index", ["Shop"])], [use("new", ref.import("Shop"))]),
    ]);
    expect(
      findEdge(result, "instantiates", sid("src/main.ts", "main"), sid("src/shop.ts", "Shop")),
    ).toBeDefined();
  });
});

describe("star exports", () => {
  const modules = [
    file(
      "src/a.ts",
      extraction({
        symbols: [sym("x", "function"), sym("shared", "function"), sym("main", "function")],
        exports: [
          exportLocal("x", ref.symbol("x")),
          exportLocal("shared", ref.symbol("shared")),
          exportLocal("default", ref.symbol("main")),
        ],
      }),
    ),
    file(
      "src/b.ts",
      extraction({
        symbols: [sym("x", "function"), sym("y", "function")],
        exports: [exportLocal("x", ref.symbol("x")), exportLocal("y", ref.symbol("y"))],
      }),
    ),
    file(
      "src/c.ts",
      extraction({ imports: [reexportImport("./a")], exports: [exportStar("./a")] }),
    ),
  ];

  it("searches every star module, never re-exports default, and treats conflicts as ambiguous", async () => {
    const result = await run([
      ...modules,
      file(
        "src/barrel.ts",
        extraction({
          imports: [reexportImport("./a"), reexportImport("./b"), reexportImport("./c")],
          exports: [exportStar("./a"), exportStar("./b"), exportStar("./c")],
        }),
      ),
      caller(
        [imp("./barrel", ["x", "y", "shared", ["d", "default"]])],
        [
          use("call", ref.import("x"), { line: 1 }),
          use("call", ref.import("y"), { line: 2 }),
          use("call", ref.import("shared"), { line: 3 }),
          use("call", ref.import("d"), { line: 4 }),
        ],
      ),
    ]);
    const main = sid("src/main.ts", "main");
    // `shared` reaches the same declaration through ./a and ./c: not ambiguous.
    expect(findEdge(result, "calls", main, sid("src/a.ts", "shared"))?.provenance[0]?.via).toEqual([
      "file:src/barrel.ts",
    ]);
    expect(findEdge(result, "calls", main, sid("src/b.ts", "y"))?.provenance[0]?.via).toEqual([
      "file:src/barrel.ts",
    ]);
    // `x` is exported by ./a and ./b (ambiguous); `default` is never provided by `export *`.
    expect(result.edges.filter((edge) => edge.source === main).map((edge) => edge.target)).toEqual([
      sid("src/a.ts", "shared"),
      sid("src/b.ts", "y"),
    ]);
    expect(result.stats.unresolvedReferences).toBe(2);
  });

  it("terminates on export * cycles and resolves names from both sides", async () => {
    const result = await run([
      file(
        "src/orders/order.ts",
        extraction({
          symbols: [sym("Order", "interface")],
          exports: [exportLocal("Order", ref.symbol("Order"))],
        }),
      ),
      file(
        "src/customers/customer.ts",
        extraction({
          symbols: [sym("Customer", "class")],
          exports: [exportLocal("Customer", ref.symbol("Customer"))],
        }),
      ),
      file(
        "src/orders/index.ts",
        extraction({
          imports: [reexportImport("./order"), reexportImport("../customers/index")],
          exports: [exportStar("./order"), exportStar("../customers/index")],
        }),
      ),
      file(
        "src/customers/index.ts",
        extraction({
          imports: [reexportImport("./customer"), reexportImport("../orders/index")],
          exports: [exportStar("./customer"), exportStar("../orders/index")],
        }),
      ),
      caller(
        [imp("./orders/index", ["Customer", "Missing"]), imp("./customers/index", ["Order"])],
        [
          use("new", ref.import("Customer"), { line: 1 }),
          use("type", ref.import("Order"), { line: 2, typeOnly: true }),
          use("call", ref.import("Missing"), { line: 3 }),
        ],
      ),
    ]);
    const main = sid("src/main.ts", "main");
    expect(
      findEdge(result, "instantiates", main, sid("src/customers/customer.ts", "Customer"))
        ?.provenance[0]?.via,
    ).toEqual(["file:src/orders/index.ts", "file:src/customers/index.ts"]);
    expect(
      findEdge(result, "references-type", main, sid("src/orders/order.ts", "Order"))?.provenance[0]
        ?.via,
    ).toEqual(["file:src/customers/index.ts", "file:src/orders/index.ts"]);
    expect(result.stats.unresolvedReferences).toBe(1);
    expect(
      findEdge(result, "re-exports", "file:src/orders/index.ts", "file:src/customers/index.ts"),
    ).toBeDefined();
    expect(
      findEdge(result, "re-exports", "file:src/customers/index.ts", "file:src/orders/index.ts"),
    ).toBeDefined();
  });

  it("terminates on cycles of named re-exports", async () => {
    const result = await run([
      file(
        "src/a.ts",
        extraction({ imports: [reexportImport("./b")], exports: [exportFrom("x", "./b")] }),
      ),
      file(
        "src/b.ts",
        extraction({ imports: [reexportImport("./a")], exports: [exportFrom("x", "./a")] }),
      ),
      caller([imp("./a", ["x"])], [use("call", ref.import("x"))]),
    ]);
    expect(result.stats.unresolvedReferences).toBe(1);
    expect(exportsOf(result, "src/a.ts")).toEqual([
      { name: "x", from: "./b", target: "file:src/b.ts", typeOnly: false },
    ]);
  });

  it("lets a local export shadow star exports even when its declaration is unknown", async () => {
    const result = await run([
      ...modules,
      file(
        "src/d.ts",
        extraction({
          imports: [reexportImport("./b")],
          exports: [exportLocal("y", []), exportStar("./b")],
        }),
      ),
      caller([imp("./d", ["y"])], [use("call", ref.import("y"))]),
    ]);
    expect(result.stats.unresolvedReferences).toBe(1);
  });

  it("resolves names of external star modules when no internal module provides them", async () => {
    const result = await run([
      file(
        "src/b.ts",
        extraction({
          symbols: [sym("y", "function")],
          exports: [exportLocal("y", ref.symbol("y"))],
        }),
      ),
      file(
        "src/utils.ts",
        extraction({
          imports: [reexportImport("lodash"), reexportImport("./b")],
          exports: [exportStar("lodash"), exportStar("./b")],
        }),
      ),
      caller(
        [imp("./utils", ["debounce", "y"])],
        [use("call", ref.import("debounce")), use("call", ref.import("y"))],
      ),
    ]);
    const main = sid("src/main.ts", "main");
    expect(findEdge(result, "calls", main, "ext:npm:lodash")?.provenance[0]).toMatchObject({
      resolution: "re-export-chain",
      via: ["file:src/utils.ts"],
      detail: "debounce",
      confidence: 1,
    });
    expect(findEdge(result, "calls", main, sid("src/b.ts", "y"))).toBeDefined();
  });

  it("binds a name only several external star modules can provide to each of them, splitting the confidence", async () => {
    const result = await run([
      file(
        "src/ui/button.ts",
        extraction({
          symbols: [sym("Button", "function")],
          exports: [exportLocal("Button", ref.symbol("Button"))],
        }),
      ),
      file(
        "src/ui/index.ts",
        extraction({
          imports: [
            reexportImport("@radix-ui/react-dialog", { mechanism: "export-all" }),
            reexportImport("@radix-ui/react-popover", { mechanism: "export-all" }),
            reexportImport("./button", { mechanism: "export-all" }),
          ],
          exports: [
            exportStar("@radix-ui/react-dialog"),
            exportStar("@radix-ui/react-popover"),
            exportStar("./button"),
          ],
        }),
      ),
      caller(
        [imp("./ui/index", [["DialogRoot", "Root"], "Trigger", "Button"])],
        [
          use("jsx", ref.import("DialogRoot"), { line: 1 }),
          use("jsx", ref.import("Trigger"), { line: 2 }),
          use("jsx", ref.import("Button"), { line: 3 }),
        ],
      ),
    ]);
    const main = sid("src/main.ts", "main");
    // Presumably exactly one of the packages provides each name: both are recorded, at 1/2 each.
    for (const external of ["ext:npm:@radix-ui/react-dialog", "ext:npm:@radix-ui/react-popover"]) {
      expect(
        findEdge(result, "uses", main, external)?.provenance.map((item) => [
          item.line,
          item.resolution,
          item.confidence,
          item.detail,
          item.via,
        ]),
        external,
      ).toEqual([
        [1, "re-export-chain", 0.5, "Root", ["file:src/ui/index.ts"]],
        [2, "re-export-chain", 0.5, "Trigger", ["file:src/ui/index.ts"]],
      ]);
    }
    // Internal star modules still take precedence.
    expect(findEdge(result, "uses", main, sid("src/ui/button.ts", "Button"))?.confidence).toBe(1);
    expect(result.stats.unresolvedReferences).toBe(0);
  });

  // A barrel over generated code, which core skips: `export * from "./generated/graphql"`.
  const skipped = (path: string) =>
    file(path, undefined, { language: "typescript", status: "skipped", reason: "generated" });

  it("binds names only code that was not analyzed can provide to that file, like direct imports", async () => {
    const result = await run([
      skipped("src/api/generated/graphql.ts"),
      file("src/api/data.json", undefined, { language: "json" }),
      file(
        "src/api/local.ts",
        extraction({
          symbols: [sym("local", "function")],
          exports: [exportLocal("local", ref.symbol("local"))],
        }),
      ),
      file(
        "src/api/index.ts",
        extraction({
          imports: [
            reexportImport("./generated/graphql", { mechanism: "export-all" }),
            reexportImport("./data.json", { mechanism: "export-all" }),
            reexportImport("./local", { mechanism: "export-all" }),
          ],
          exports: [
            exportStar("./generated/graphql"),
            exportStar("./data.json"),
            exportStar("./local"),
          ],
        }),
      ),
      caller(
        [imp("./api/index", ["useGetUserQuery", "local"]), imp("./api/index", [["api", "*"]])],
        [
          use("call", ref.import("useGetUserQuery"), { line: 1 }),
          use("call", ref.import("api", "useGetUserQuery", "refetch"), { line: 2 }),
          use("call", ref.import("local"), { line: 3 }),
        ],
      ),
    ]);
    const main = sid("src/main.ts", "main");
    expect(
      findEdge(result, "calls", main, "file:src/api/generated/graphql.ts")?.provenance.map(
        (item) => [item.line, item.resolution, item.confidence, item.detail, item.via],
      ),
    ).toEqual([
      [1, "re-export-chain", 1, "useGetUserQuery", ["file:src/api/index.ts"]],
      [2, "re-export-chain", 1, "useGetUserQuery.refetch", ["file:src/api/index.ts"]],
    ]);
    // Analyzed star modules take precedence; data files provide no names.
    expect(result.edges.filter((edge) => edge.source === main).map((edge) => edge.target)).toEqual([
      "file:src/api/generated/graphql.ts",
      sid("src/api/local.ts", "local"),
    ]);
    expect(result.stats.unresolvedReferences).toBe(0);
  });

  it("shares the confidence of names unknown star modules may provide, and binds none it cannot name", async () => {
    const barrel = (path: string, stars: readonly string[]) =>
      file(
        path,
        extraction({
          imports: stars.map((star) => reexportImport(star, { mechanism: "export-all" })),
          exports: stars.map((star) => exportStar(star)),
        }),
      );
    const result = await run(
      [
        skipped("src/gen/a.ts"),
        skipped("src/gen/b.ts"),
        barrel("src/gen/index.ts", ["./a", "./b"]),
        barrel("src/mixed.ts", ["./gen/a", "lodash"]),
        barrel("src/hooks.ts", ["./gen/excluded", "react"]),
        caller(
          [imp("./gen/index", ["fromGen"]), imp("./mixed", ["debounce"]), imp("./hooks", ["useX"])],
          [
            use("call", ref.import("fromGen"), { line: 1 }),
            use("call", ref.import("debounce"), { line: 2 }),
            use("call", ref.import("useX"), { line: 3 }),
          ],
        ),
      ],
      {
        project: {
          modules: {
            // Excluded from the analysis: resolved, but not listed.
            "src/hooks.ts|./gen/excluded": {
              status: "resolved",
              paths: ["src/gen/excluded.ts"],
              method: "relative-path",
            },
          },
        },
      },
    );
    const main = sid("src/main.ts", "main");
    // Either the skipped file or lodash provides `debounce`, and either the excluded file or react `useX`.
    expect(
      result.edges
        .filter((edge) => edge.source === main)
        .map((edge) => [edge.target, edge.provenance[0]?.line, edge.confidence]),
    ).toEqual([
      ["ext:npm:lodash", 2, 0.5],
      ["ext:npm:react", 3, 0.5],
    ]);
    // `fromGen` may be provided by either skipped file: nothing is bound, and nothing is unresolved.
    expect(result.stats.unresolvedReferences).toBe(0);
  });

  it("prefers modules known to provide a name over guesses of enclosed star exports", async () => {
    const result = await run([
      file(
        "src/local.ts",
        extraction({
          symbols: [sym("foo", "function")],
          exports: [exportLocal("foo", ref.symbol("foo"))],
        }),
      ),
      file(
        "src/ui/button.ts",
        extraction({
          symbols: [sym("Button", "function")],
          exports: [exportLocal("Button", ref.symbol("Button"))],
        }),
      ),
      file(
        "src/ui/index.ts",
        extraction({
          imports: [reexportImport("@radix-ui/react-dialog"), reexportImport("./button")],
          exports: [exportStar("@radix-ui/react-dialog"), exportStar("./button")],
        }),
      ),
      file(
        "src/index.ts",
        extraction({
          imports: [reexportImport("./ui/index"), reexportImport("./local")],
          exports: [exportStar("./ui/index"), exportStar("./local")],
        }),
      ),
      caller(
        [imp("./index", ["foo", "Root", "Button"])],
        [
          use("call", ref.import("foo"), { line: 1 }),
          use("jsx", ref.import("Root"), { line: 2 }),
          use("jsx", ref.import("Button"), { line: 3 }),
        ],
      ),
    ]);
    const main = sid("src/main.ts", "main");
    // ./ui/index can only guess that the external provides `foo`; ./local is known to provide it.
    expect(
      result.edges
        .filter((edge) => edge.source === main)
        .map((edge) => [edge.kind, edge.target, edge.confidence, edge.provenance[0]?.via]),
    ).toEqual([
      ["uses", "ext:npm:@radix-ui/react-dialog", 1, ["file:src/index.ts", "file:src/ui/index.ts"]],
      ["calls", sid("src/local.ts", "foo"), 1, ["file:src/index.ts"]],
      ["uses", sid("src/ui/button.ts", "Button"), 1, ["file:src/index.ts", "file:src/ui/index.ts"]],
    ]);
    expect(result.stats.unresolvedReferences).toBe(0);
  });

  it("treats files of a package-level module that were not analyzed as providing unknown names", async () => {
    const result = await run(
      [
        file(
          "util/util.go",
          extraction({
            moduleFormat: "package",
            symbols: [sym("Helper", "function", { exported: true })],
          }),
        ),
        file("util/zz_generated.go", undefined, {
          language: "go",
          status: "skipped",
          reason: "generated",
        }),
        caller(
          [imp("example.com/m/util", [["util", "*"]])],
          [
            use("call", ref.import("util", "Helper"), { line: 1 }),
            use("call", ref.import("util", "DeepCopy"), { line: 2 }),
          ],
          "main.go",
        ),
      ],
      {
        project: { modules: { "example.com/m/util": ["util/util.go", "util/zz_generated.go"] } },
      },
    );
    expect(
      result.edges
        .filter((edge) => edge.source === sid("main.go", "main"))
        .map((edge) => edge.target),
    ).toEqual([sid("util/util.go", "Helper")]);
    expect(result.stats.unresolvedReferences).toBe(0);
  });

  it("resolves names through a large export * barrel in linear time", async () => {
    const size = 4000;
    const icons = Array.from({ length: size }, (_, index) =>
      file(
        `src/icons/Icon${index}.ts`,
        extraction({
          symbols: [sym(`Icon${index}`, "function")],
          exports: [exportLocal(`Icon${index}`, ref.symbol(`Icon${index}`))],
        }),
      ),
    );
    const barrel = file(
      "src/icons/index.ts",
      extraction({
        imports: icons.map((_, index) =>
          reexportImport(`./Icon${index}`, { mechanism: "export-all" }),
        ),
        exports: icons.map((_, index) => exportStar(`./Icon${index}`)),
      }),
    );
    const pages = Array.from({ length: 20 }, (_, page) => {
      const names = Array.from(
        { length: size / 20 },
        (_, index) => `Icon${page * (size / 20) + index}`,
      );
      return file(
        `src/pages/page${page}.ts`,
        extraction({
          imports: [imp("../icons/index", names)],
          references: names.map((name) => use("jsx", ref.import(name))),
        }),
      );
    });
    const started = performance.now();
    const result = await run([...icons, barrel, ...pages]);
    // Quadratic star-export resolution took about 9 s for this barrel.
    expect(performance.now() - started).toBeLessThan(3_000);
    expect(result.edges.filter((edge) => edge.kind === "uses")).toHaveLength(size);
    expect(result.stats.unresolvedReferences).toBe(0);
  });
});

describe("namespace re-exports", () => {
  it("walks members of `export * as ns` through every re-exporting file", async () => {
    const result = await run([
      file(
        "src/billing/tax.ts",
        extraction({
          symbols: [
            sym("Tax", "namespace"),
            member("Tax", "rateFor", "function"),
            member("Tax", "EU", "namespace"),
            member("Tax.EU", "vatFor", "function"),
          ],
          exports: [exportLocal("Tax", ref.symbol("Tax"))],
        }),
      ),
      file(
        "src/billing/index.ts",
        extraction({ imports: [reexportImport("./tax")], exports: [exportFrom("Tax", "./tax")] }),
      ),
      file(
        "src/index.ts",
        extraction({
          imports: [reexportImport("./billing/index", { mechanism: "export-all" })],
          exports: [exportFrom("billing", "./billing/index", "*")],
        }),
      ),
      caller(
        [imp("./index", ["billing"])],
        [
          use("call", ref.import("billing", "Tax", "rateFor"), { line: 1 }),
          use("call", ref.import("billing", "Tax", "EU", "vatFor"), { line: 2 }),
          use("value", ref.import("billing"), { line: 3 }),
        ],
        "src/cli.ts",
      ),
    ]);
    const main = sid("src/cli.ts", "main");
    expect(
      findEdge(result, "calls", main, sid("src/billing/tax.ts", "Tax.rateFor"))?.provenance[0],
    ).toMatchObject({
      resolution: "re-export-chain",
      via: ["file:src/index.ts", "file:src/billing/index.ts"],
      confidence: 1,
    });
    expect(
      findEdge(result, "calls", main, sid("src/billing/tax.ts", "Tax.EU.vatFor")),
    ).toBeDefined();
    // The namespace itself is the re-exported module.
    expect(findEdge(result, "uses", main, "file:src/billing/index.ts")?.provenance[0]?.via).toEqual(
      ["file:src/index.ts"],
    );
    expect(exportedOf(result, "src/billing/tax.ts")).toEqual({
      Tax: true,
      "Tax.EU": true,
      "Tax.EU.vatFor": true,
      "Tax.rateFor": true,
    });
  });

  it("counts a member a namespace does not export as unresolved", async () => {
    const result = await run([
      file(
        "src/a.ts",
        extraction({
          symbols: [sym("foo", "function")],
          exports: [exportLocal("foo", ref.symbol("foo"))],
        }),
      ),
      caller(
        [imp("./a", [["ns", "*"]])],
        [use("call", ref.import("ns", "foo")), use("call", ref.import("ns", "bar"))],
      ),
    ]);
    expect(
      findEdge(result, "calls", sid("src/main.ts", "main"), sid("src/a.ts", "foo"))?.provenance[0]
        ?.resolution,
    ).toBe("namespace-member");
    expect(result.stats.unresolvedReferences).toBe(1);
  });

  it("records member accesses on namespace imports and namespace declarations as namespace-member", async () => {
    const result = await run([
      file(
        "src/util.ts",
        extraction({
          symbols: [
            sym("helper", "function"),
            sym("NS", "namespace"),
            member("NS", "inner", "function"),
            sym("Config", "class"),
            member("Config", "load", "method", { modifiers: ["static"] }),
          ],
          exports: [
            exportLocal("helper", ref.symbol("helper")),
            exportLocal("NS", ref.symbol("NS")),
            exportLocal("Config", ref.symbol("Config")),
          ],
        }),
      ),
      caller(
        [imp("./util", [["u", "*"]]), imp("./util", ["NS", "Config"])],
        [
          use("call", ref.import("u", "helper"), { line: 1 }),
          use("call", ref.import("NS", "inner"), { line: 2 }),
          use("call", ref.import("Config", "load"), { line: 3 }),
        ],
      ),
    ]);
    const main = sid("src/main.ts", "main");
    const resolution = (target: string) =>
      findEdge(result, "calls", main, target)?.provenance[0]?.resolution;
    expect(resolution(sid("src/util.ts", "helper"))).toBe("namespace-member");
    expect(resolution(sid("src/util.ts", "NS.inner"))).toBe("namespace-member");
    // A static member of a class is not a namespace member.
    expect(resolution(sid("src/util.ts", "Config.load"))).toBe("import-binding");
  });

  it("records barrels traversed by members of namespace imports", async () => {
    const result = await run([
      file(
        "src/impl.ts",
        extraction({
          symbols: [sym("foo", "function")],
          exports: [exportLocal("foo", ref.symbol("foo"))],
        }),
      ),
      file(
        "src/barrel.ts",
        extraction({ imports: [reexportImport("./impl")], exports: [exportStar("./impl")] }),
      ),
      caller([imp("./barrel", [["ns", "*"]])], [use("call", ref.import("ns", "foo"))]),
    ]);
    expect(
      findEdge(result, "calls", sid("src/main.ts", "main"), sid("src/impl.ts", "foo"))
        ?.provenance[0],
    ).toMatchObject({ resolution: "re-export-chain", via: ["file:src/barrel.ts"] });
  });

  it("propagates ambiguity through nested star exports", async () => {
    const declares = (path: string) =>
      file(
        path,
        extraction({
          symbols: [sym("x", "function")],
          exports: [exportLocal("x", ref.symbol("x"))],
        }),
      );
    const result = await run([
      declares("src/a.ts"),
      declares("src/b.ts"),
      declares("src/c.ts"),
      file(
        "src/ab.ts",
        extraction({
          imports: [reexportImport("./a"), reexportImport("./b")],
          exports: [exportStar("./a"), exportStar("./b")],
        }),
      ),
      // The ambiguity of ./ab is not hidden by ./c providing the name as well.
      file(
        "src/top.ts",
        extraction({
          imports: [reexportImport("./ab"), reexportImport("./c")],
          exports: [exportStar("./ab"), exportStar("./c")],
        }),
      ),
      caller([imp("./top", ["x"])], [use("call", ref.import("x"))]),
    ]);
    expect(result.edges.filter((edge) => edge.kind === "calls")).toEqual([]);
    expect(result.stats.unresolvedReferences).toBe(1);
  });
});

describe("export assignment and default interop", () => {
  const legacy = file(
    "src/legacy.ts",
    extraction({
      moduleFormat: "commonjs",
      symbols: [
        sym("legacyFormat", "function"),
        sym("legacyFormat~namespace", "namespace"),
        member("legacyFormat~namespace", "parse", "function"),
      ],
      exports: [
        exportLocal("=", [ref.symbol("legacyFormat"), ref.symbol("legacyFormat~namespace")]),
      ],
    }),
  );

  it("binds import-equals to the export assignment, including merged namespace members", async () => {
    const result = await run([
      legacy,
      caller(
        [imp("./legacy", [["legacyFormat", "="]], { mechanism: "import-equals" })],
        [
          use("call", ref.import("legacyFormat"), { line: 1 }),
          use("call", ref.import("legacyFormat", "parse"), { line: 2 }),
        ],
      ),
    ]);
    const main = sid("src/main.ts", "main");
    expect(findEdge(result, "calls", main, sid("src/legacy.ts", "legacyFormat"))).toBeDefined();
    expect(
      findEdge(result, "calls", main, sid("src/legacy.ts", "legacyFormat.parse")),
    ).toBeDefined();
    expect(exportsOf(result, "src/legacy.ts")).toEqual([
      {
        name: "=",
        symbols: [
          sid("src/legacy.ts", "legacyFormat"),
          sid("src/legacy.ts", "legacyFormat~namespace"),
        ],
        typeOnly: false,
      },
    ]);
    expect(exportedOf(result, "src/legacy.ts")).toEqual({
      legacyFormat: true,
      "legacyFormat.parse": true,
      "legacyFormat~namespace": true,
    });
  });

  it("binds a default import of a module with only an export assignment to the assignment", async () => {
    const result = await run([
      file(
        "src/store.ts",
        extraction({
          moduleFormat: "commonjs",
          symbols: [sym("MemoryStore", "class")],
          exports: [exportLocal("=", ref.symbol("MemoryStore"))],
        }),
      ),
      caller([imp("./store", [["Store", "default"]])], [use("new", ref.import("Store"))]),
    ]);
    expect(
      findEdge(
        result,
        "instantiates",
        sid("src/main.ts", "main"),
        sid("src/store.ts", "MemoryStore"),
      ),
    ).toBeDefined();
  });

  it("binds `=` imports of modules without an export assignment to the module namespace", async () => {
    const result = await run([
      file(
        "src/esm.ts",
        extraction({
          symbols: [sym("foo", "function")],
          exports: [exportLocal("foo", ref.symbol("foo"))],
        }),
      ),
      caller(
        [imp("./esm", [["m", "="]], { mechanism: "require-call" })],
        [
          use("call", ref.import("m", "foo"), { line: 1 }),
          use("value", ref.import("m"), { line: 2 }),
        ],
      ),
    ]);
    const main = sid("src/main.ts", "main");
    expect(findEdge(result, "calls", main, sid("src/esm.ts", "foo"))).toBeDefined();
    expect(findEdge(result, "uses", main, "file:src/esm.ts")).toBeDefined();
  });

  it("binds default imports of CommonJS modules without assignment to their namespace", async () => {
    const result = await run([
      file(
        "src/html.ts",
        extraction({
          moduleFormat: "commonjs",
          symbols: [sym("h", "function")],
          exports: [exportLocal("h", ref.symbol("h"))],
        }),
      ),
      file(
        "src/esm.ts",
        extraction({
          symbols: [sym("x", "function")],
          exports: [exportLocal("x", ref.symbol("x"))],
        }),
      ),
      caller(
        [imp("./html", [["html", "default"]]), imp("./esm", [["esm", "default"]])],
        [
          use("call", ref.import("html", "h"), { line: 1 }),
          use("call", ref.import("esm", "x"), { line: 2 }),
        ],
      ),
    ]);
    expect(
      findEdge(result, "calls", sid("src/main.ts", "main"), sid("src/html.ts", "h")),
    ).toBeDefined();
    // An ES module without a default export provides no default binding.
    expect(result.stats.unresolvedReferences).toBe(1);
  });

  // `module.exports = { a, b }` and `export = { ta }`: adapters report each property as a named export,
  // plus `=` without targets.
  it("binds every import of an object-literal export assignment to the module namespace", async () => {
    const result = await run([
      file(
        "src/lib.js",
        extraction({
          moduleFormat: "commonjs",
          symbols: [sym("a", "function"), sym("b", "function")],
          exports: [
            exportLocal("a", ref.symbol("a")),
            exportLocal("b", ref.symbol("b")),
            exportLocal("=", []),
          ],
        }),
      ),
      file(
        "src/tsobj.ts",
        extraction({
          moduleFormat: "commonjs",
          symbols: [sym("ta", "function")],
          exports: [exportLocal("ta", ref.symbol("ta")), exportLocal("=", [])],
        }),
      ),
      caller(
        [
          imp("./lib.js", [["lib", "="]], { mechanism: "require-call" }),
          imp("./tsobj", [["tsobj", "="]], { mechanism: "import-equals" }),
          imp("./lib.js", [["obj", "default"]]),
        ],
        [
          use("call", ref.import("lib", "a"), { line: 1 }),
          use("call", ref.import("tsobj", "ta"), { line: 2 }),
          use("call", ref.import("obj", "b"), { line: 3 }),
          use("value", ref.import("lib"), { line: 4 }),
        ],
      ),
    ]);
    const main = sid("src/main.ts", "main");
    expect(result.edges.filter((edge) => edge.source === main).map((edge) => edge.target)).toEqual([
      "file:src/lib.js",
      sid("src/lib.js", "a"),
      sid("src/lib.js", "b"),
      sid("src/tsobj.ts", "ta"),
    ]);
    expect(findEdge(result, "calls", main, sid("src/lib.js", "a"))?.provenance[0]).toMatchObject({
      line: 1,
      resolution: "namespace-member",
      confidence: 1,
    });
    expect(result.stats.unresolvedReferences).toBe(0);
  });

  // service.js: `module.exports = Service; module.exports.helper = function helper() {}`.
  const service = file(
    "src/service.js",
    extraction({
      moduleFormat: "commonjs",
      symbols: [
        sym("Service", "class"),
        member("Service", "create", "method", { modifiers: ["static"] }),
        member("Service", "run", "method"),
        sym("helper", "function"),
      ],
      exports: [
        exportLocal("=", ref.symbol("Service")),
        exportLocal("helper", ref.symbol("helper")),
      ],
    }),
  );

  it("binds inline requires to the export assignment, like bound requires", async () => {
    const result = await run([
      service,
      // module.exports = function setup() {}
      file(
        "src/fn.js",
        extraction({
          moduleFormat: "commonjs",
          symbols: [sym("default", "function")],
          exports: [exportLocal("=", ref.symbol("default"))],
        }),
      ),
      // module.exports = new Config()
      file(
        "src/config.js",
        extraction({
          moduleFormat: "commonjs",
          symbols: [
            sym("Config", "class"),
            member("Config", "get", "method"),
            sym("default", "constant", {
              initializer: { kind: "new", callee: ref.symbol("Config") },
            }),
          ],
          exports: [exportLocal("=", ref.symbol("default"))],
        }),
      ),
      caller(
        [
          imp("./service.js", [], { mechanism: "require-call" }),
          imp("./fn.js", [], { mechanism: "require-call" }),
          imp("./config.js", [], { mechanism: "require-call" }),
          imp("./fn.js", [["setup", "="]], { mechanism: "require-call" }),
        ],
        [
          // require("./service.js").create(), require("./fn.js")(), require("./config.js").get("port")
          use("call", ref.module("./service.js", "create"), { line: 1 }),
          use("call", ref.module("./fn.js"), { line: 2 }),
          use("call", ref.module("./config.js", "get"), { line: 3 }),
          use("call", ref.import("setup"), { line: 4 }),
        ],
      ),
    ]);
    const main = sid("src/main.ts", "main");
    expect(
      result.edges
        .filter((edge) => edge.source === main && edge.kind === "calls")
        .map((edge) => [edge.target, edge.provenance.map((item) => item.line)]),
    ).toEqual([
      [sid("src/config.js", "Config.get"), [3]],
      [sid("src/fn.js", "default"), [2, 4]],
      [sid("src/service.js", "Service.create"), [1]],
    ]);
    expect(result.stats.unresolvedReferences).toBe(0);
  });

  it("looks up members of an assigned value among the module's named exports first", async () => {
    const result = await run([
      service,
      // module.exports = require("./service.js")
      file(
        "src/reexport.js",
        extraction({
          moduleFormat: "commonjs",
          imports: [imp("./service.js", [], { mechanism: "require-call" })],
          exports: [exportLocal("=", ref.module("./service.js"))],
        }),
      ),
      caller(
        [
          imp("./service.js", [["S", "="]], { mechanism: "require-call" }),
          // const { create, helper, missing } = require("./service.js")
          imp("./service.js", ["create", "helper", "missing"], { mechanism: "require-call" }),
          imp("./reexport.js", [["R", "="]], { mechanism: "require-call" }),
        ],
        [
          use("call", ref.module("./service.js", "helper"), { line: 1 }),
          use("call", ref.import("S", "helper"), { line: 2 }),
          use("call", ref.import("S", "create"), { line: 3 }),
          use("call", ref.import("create"), { line: 4 }),
          use("call", ref.import("helper"), { line: 5 }),
          use("call", ref.import("R", "create"), { line: 6 }),
          use("call", ref.import("missing"), { line: 7 }),
        ],
      ),
    ]);
    const main = sid("src/main.ts", "main");
    const lines = (target: string) =>
      findEdge(result, "calls", main, target)?.provenance.map((item) => [
        item.line,
        item.resolution,
      ]);
    expect(lines(sid("src/service.js", "helper"))).toEqual([
      [1, "namespace-member"],
      [2, "namespace-member"],
      [5, "import-binding"],
    ]);
    expect(lines(sid("src/service.js", "Service.create"))).toEqual([
      [3, "import-binding"],
      [4, "import-binding"],
      [6, "re-export-chain"],
    ]);
    expect(exportsOf(result, "src/reexport.js")).toEqual([
      { name: "=", symbols: [sid("src/service.js", "Service")], typeOnly: false },
    ]);
    // Neither a named export nor a member of the assigned class.
    expect(result.stats.unresolvedReferences).toBe(1);
  });
});

describe("exported flags", () => {
  it("derives exported from local exports and exported namespaces unless the adapter states it", async () => {
    const result = await run([
      file(
        "src/a.ts",
        extraction({
          symbols: [
            sym("api", "function"),
            sym("helper", "function"),
            sym("C", "class"),
            member("C", "m", "method"),
            sym("NS", "namespace"),
            member("NS", "inner", "function"),
            member("NS", "Deep", "namespace"),
            member("NS.Deep", "leaf", "constant"),
            sym("Hidden", "namespace"),
            member("Hidden", "x", "function"),
            sym("default", "class"),
            sym("explicit", "function", { exported: false }),
            sym("Exported", "function", { exported: true }),
          ],
          exports: [
            exportLocal("api", ref.symbol("api")),
            exportLocal("C", ref.symbol("C")),
            exportLocal("NS", ref.symbol("NS")),
            exportLocal("default", ref.symbol("default")),
            exportLocal("explicit", ref.symbol("explicit")),
          ],
        }),
      ),
    ]);
    expect(exportedOf(result, "src/a.ts")).toEqual({
      C: true,
      "C.m": false,
      Exported: true,
      Hidden: false,
      "Hidden.x": false,
      NS: true,
      "NS.Deep": true,
      "NS.Deep.leaf": true,
      "NS.inner": true,
      api: true,
      default: true,
      explicit: false,
      helper: false,
    });
  });

  it("exports a namespace member only if its namespace is exported and the adapter does not deny it", async () => {
    const result = await run([
      file(
        "src/config.ts",
        extraction({
          symbols: [
            // export namespace Util { function hidden() {} export function visible() {} ... }
            sym("Util", "namespace"),
            member("Util", "hidden", "function", { exported: false }),
            member("Util", "visible", "function", { exported: true }),
            member("Util", "Inner", "namespace", { exported: true }),
            member("Util.Inner", "deep", "function", { exported: true }),
            member("Util.Inner", "secret", "function", { exported: false }),
            // namespace Internal { export function f() {} }
            sym("Internal", "namespace"),
            member("Internal", "f", "function", { exported: true }),
          ],
          exports: [exportLocal("Util", ref.symbol("Util"))],
        }),
      ),
    ]);
    expect(exportedOf(result, "src/config.ts")).toEqual({
      Internal: false,
      "Internal.f": false,
      Util: true,
      "Util.Inner": true,
      "Util.Inner.deep": true,
      "Util.Inner.secret": false,
      "Util.hidden": false,
      "Util.visible": true,
    });
  });

  it("looks up top-level symbols the adapter marked exported in files without export lists", async () => {
    const result = await run(
      [
        file(
          "util/util.go",
          extraction({
            moduleFormat: "package",
            symbols: [
              sym("Helper", "function", { exported: true }),
              sym("helper", "function", { exported: false }),
            ],
          }),
        ),
        caller(
          [imp("example.com/m/util", [["util", "*"]])],
          [
            use("call", ref.import("util", "Helper"), { line: 1 }),
            use("call", ref.import("util", "helper"), { line: 2 }),
          ],
          "main.go",
        ),
      ],
      { project: { modules: { "example.com/m/util": ["util/util.go"] } } },
    );
    expect(
      findEdge(result, "calls", sid("main.go", "main"), sid("util/util.go", "Helper")),
    ).toBeDefined();
    expect(result.stats.unresolvedReferences).toBe(1);
  });
});
