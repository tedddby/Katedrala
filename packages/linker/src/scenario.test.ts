/**
 * An end-to-end scenario modeled on fixtures/typescript-features: hand-written extractions in the shape a
 * TypeScript adapter produces, checked against the call, instantiation and JSX edges the fixture's
 * expected.json documents.
 */
import { describe, expect, it } from "vitest";
import type { ExtractedReference, FileExtraction } from "@katedrala/plugin-api";
import type { LinkFile } from "./types.js";
import {
  exportFrom,
  exportLocal,
  exportStar,
  extraction,
  file,
  imp,
  instance,
  member,
  ref,
  reexportImport,
  run,
  sym,
  typeRef,
  use,
} from "./test-support.js";

function module(path: string, parts: Partial<FileExtraction>): LinkFile {
  return file(path, extraction(parts));
}

function from(local: string, references: ExtractedReference[]): ExtractedReference[] {
  return references.map((reference) => ({ ...reference, from: local }));
}

const shop: LinkFile[] = [
  module("src/utils/money.ts", {
    symbols: [sym("formatMoney", "function"), sym("Money", "type-alias")],
    exports: [
      exportLocal("formatMoney", ref.symbol("formatMoney")),
      exportLocal("Money", ref.symbol("Money"), { typeOnly: true }),
    ],
  }),
  module("src/orders/order.ts", {
    imports: [imp("../utils/money", ["formatMoney"])],
    symbols: [
      sym("Order", "interface"),
      sym("calculateTotal", "function"),
      sym("lineTotal", "function"),
    ],
    exports: [
      exportLocal("Order", ref.symbol("Order"), { typeOnly: true }),
      exportLocal("calculateTotal", ref.symbol("calculateTotal")),
      exportLocal("lineTotal", ref.symbol("lineTotal")),
    ],
    references: from("calculateTotal", [use("call", ref.symbol("lineTotal"))]),
  }),
  module("src/shared/repository.ts", {
    symbols: [
      sym("Repository", "class", { abstract: true }),
      member("Repository", "getOrThrow", "method"),
      member("Repository", "findById", "method"),
    ],
    exports: [exportLocal("Repository", ref.symbol("Repository"))],
  }),
  module("src/orders/order-repository.ts", {
    imports: [
      imp("../shared/repository", ["Repository"]),
      imp("./order", ["Order"], { typeOnly: true }),
    ],
    symbols: [
      sym("OrderRepository", "class"),
      member("OrderRepository", "save", "method"),
      member("OrderRepository", "findBy", "method"),
    ],
    exports: [exportLocal("OrderRepository", ref.symbol("OrderRepository"))],
    references: from("OrderRepository", [use("extends", ref.import("Repository"))]),
  }),
  module("src/orders/order-service.ts", {
    imports: [imp("./order-repository", ["OrderRepository"]), imp("./order", ["calculateTotal"])],
    symbols: [
      sym("OrderService", "class"),
      member("OrderService", "repo", "property", {
        declaredType: typeRef(ref.import("OrderRepository")),
      }),
      member("OrderService", "place", "method"),
      member("OrderService", "cancel", "method"),
      member("OrderService", "history", "method"),
    ],
    exports: [exportLocal("OrderService", ref.symbol("OrderService"))],
    references: [
      ...from("OrderService.place", [
        use("call", instance("declared-type", ref.symbol("OrderService"), "repo", "save")),
        use("call", ref.import("calculateTotal")),
      ]),
      ...from("OrderService.cancel", [
        use("call", instance("declared-type", ref.symbol("OrderService"), "repo", "getOrThrow")),
      ]),
      ...from("OrderService.history", [
        use("call", instance("declared-type", ref.symbol("OrderService"), "repo", "findBy")),
      ]),
    ],
  }),
  module("src/orders/index.ts", {
    imports: ["./order", "./order-repository", "./order-service", "../customers/index"].map(
      (specifier) => reexportImport(specifier, { mechanism: "export-all" }),
    ),
    exports: ["./order", "./order-repository", "./order-service", "../customers/index"].map(
      (specifier) => exportStar(specifier),
    ),
  }),
  module("src/customers/customer.ts", {
    symbols: [sym("Customer", "interface"), sym("customerDisplayName", "function")],
    exports: [
      exportLocal("Customer", ref.symbol("Customer"), { typeOnly: true }),
      exportLocal("customerDisplayName", ref.symbol("customerDisplayName")),
    ],
  }),
  module("src/customers/index.ts", {
    imports: ["./customer", "../orders/index"].map((specifier) =>
      reexportImport(specifier, { mechanism: "export-all" }),
    ),
    exports: [exportStar("./customer"), exportStar("../orders/index")],
  }),
  module("src/billing/tax.ts", {
    symbols: [
      sym("Tax", "namespace"),
      member("Tax", "rateFor", "function"),
      member("Tax", "EU", "namespace"),
      member("Tax.EU", "vatFor", "function"),
    ],
    exports: [exportLocal("Tax", ref.symbol("Tax"))],
    references: from("Tax.rateFor", [use("call", ref.symbol("Tax", "EU", "vatFor"))]),
  }),
  module("src/billing/invoice.ts", {
    imports: [imp("./tax", ["Tax"]), imp("../utils/money", ["formatMoney"])],
    symbols: [
      sym("Invoice", "class"),
      member("Invoice", "render", "method"),
      sym("Invoice~namespace", "namespace"),
      member("Invoice~namespace", "fromOrder", "function"),
    ],
    exports: [exportLocal("Invoice", [ref.symbol("Invoice"), ref.symbol("Invoice~namespace")])],
    references: [
      ...from("Invoice.fromOrder", [
        use("call", ref.import("Tax", "rateFor")),
        use("new", ref.symbol("Invoice")),
      ]),
      ...from("Invoice.render", [use("call", ref.import("formatMoney"))]),
    ],
  }),
  module("src/billing/index.ts", {
    imports: [reexportImport("./invoice"), reexportImport("./tax")],
    exports: [exportFrom("Invoice", "./invoice"), exportFrom("Tax", "./tax")],
  }),
  module("src/legacy.ts", {
    moduleFormat: "commonjs",
    symbols: [
      sym("legacyFormat", "function"),
      sym("legacyFormat~namespace", "namespace"),
      member("legacyFormat~namespace", "parse", "function"),
    ],
    exports: [exportLocal("=", [ref.symbol("legacyFormat"), ref.symbol("legacyFormat~namespace")])],
  }),
  module("src/shop.ts", {
    imports: [
      imp("./billing/invoice", ["Invoice"]),
      imp("./orders/order-service", ["OrderService"]),
      imp("./legacy", [["legacyFormat", "="]], { mechanism: "import-equals" }),
    ],
    symbols: [
      sym("Shop", "class"),
      member("Shop", "service", "property", { declaredType: typeRef(ref.import("OrderService")) }),
      member("Shop", "checkout", "method"),
      member("Shop", "describe", "method"),
      sym("createShop", "function"),
    ],
    exports: [
      exportLocal("default", ref.symbol("Shop")),
      exportLocal("createShop", ref.symbol("createShop")),
    ],
    references: [
      ...from("Shop.checkout", [
        use("call", ref.import("Invoice", "fromOrder")),
        use("call", instance("declared-type", ref.symbol("Shop"), "service", "place")),
      ]),
      ...from("Shop.describe", [use("call", ref.import("legacyFormat"))]),
      ...from("createShop", [use("new", ref.import("OrderService"))]),
    ],
  }),
  module("src/index.ts", {
    imports: [
      reexportImport("./orders/index", { mechanism: "export-all" }),
      reexportImport("./billing/index", { mechanism: "export-all" }),
      reexportImport("./shop"),
    ],
    exports: [
      exportStar("./orders/index"),
      exportFrom("billing", "./billing/index", "*"),
      exportFrom("Shop", "./shop", "default"),
      exportFrom("createShop", "./shop"),
    ],
  }),
  module("src/cli.ts", {
    imports: [imp("./index.js", ["createShop", "billing"])],
    symbols: [sym("main", "function")],
    references: from("main", [
      use("call", ref.import("createShop")),
      use("call", ref.import("billing", "Tax", "rateFor")),
    ]),
  }),
  module("src/ui/OrderList.tsx", {
    symbols: [sym("OrderList", "function"), sym("OrderRow", "function")],
    exports: [exportLocal("OrderList", ref.symbol("OrderList"))],
    references: from("OrderList", [use("jsx", ref.symbol("OrderRow"))]),
  }),
  module("src/ui/App.tsx", {
    imports: [imp("@/customers", ["customerDisplayName"]), imp("./OrderList", ["OrderList"])],
    symbols: [sym("App", "function")],
    exports: [exportLocal("App", ref.symbol("App")), exportLocal("default", ref.symbol("App"))],
    references: from("App", [
      use("call", ref.import("customerDisplayName")),
      use("jsx", ref.import("OrderList")),
    ]),
  }),
];

const EXPECTED = {
  calls: [
    ["src/billing/invoice.ts#Invoice.fromOrder", "src/billing/tax.ts#Tax.rateFor"],
    ["src/billing/invoice.ts#Invoice.render", "src/utils/money.ts#formatMoney"],
    ["src/billing/tax.ts#Tax.rateFor", "src/billing/tax.ts#Tax.EU.vatFor"],
    ["src/cli.ts#main", "src/billing/tax.ts#Tax.rateFor"],
    ["src/cli.ts#main", "src/shop.ts#createShop"],
    [
      "src/orders/order-service.ts#OrderService.cancel",
      "src/shared/repository.ts#Repository.getOrThrow",
    ],
    [
      "src/orders/order-service.ts#OrderService.history",
      "src/orders/order-repository.ts#OrderRepository.findBy",
    ],
    [
      "src/orders/order-service.ts#OrderService.place",
      "src/orders/order-repository.ts#OrderRepository.save",
    ],
    ["src/orders/order-service.ts#OrderService.place", "src/orders/order.ts#calculateTotal"],
    ["src/orders/order.ts#calculateTotal", "src/orders/order.ts#lineTotal"],
    ["src/shop.ts#Shop.checkout", "src/billing/invoice.ts#Invoice.fromOrder"],
    ["src/shop.ts#Shop.checkout", "src/orders/order-service.ts#OrderService.place"],
    ["src/shop.ts#Shop.describe", "src/legacy.ts#legacyFormat"],
    ["src/ui/App.tsx#App", "src/customers/customer.ts#customerDisplayName"],
  ],
  instantiates: [
    ["src/billing/invoice.ts#Invoice.fromOrder", "src/billing/invoice.ts#Invoice"],
    ["src/shop.ts#createShop", "src/orders/order-service.ts#OrderService"],
  ],
  uses: [
    ["src/ui/App.tsx#App", "src/ui/OrderList.tsx#OrderList"],
    ["src/ui/OrderList.tsx#OrderList", "src/ui/OrderList.tsx#OrderRow"],
  ],
};

describe("typescript-features scenario", () => {
  it("binds the documented calls, instantiations and JSX uses", async () => {
    const result = await run(shop, {
      project: { modules: { "@/customers": "src/customers/index.ts" } },
    });
    for (const kind of ["calls", "instantiates", "uses"] as const) {
      const actual = result.edges
        .filter((edge) => edge.kind === kind)
        .map((edge) => [edge.source.slice(4), edge.target.slice(4)]);
      expect(actual, kind).toEqual(EXPECTED[kind]);
    }
    expect(result.stats.unresolvedReferences).toBe(0);
    expect(result.stats.unresolvedImports).toBe(0);
  });

  it("explains how each documented edge was resolved", async () => {
    const result = await run(shop, {
      project: { modules: { "@/customers": "src/customers/index.ts" } },
    });
    const explain = (source: string, target: string) => {
      const edge = result.edges.find(
        (item) => item.source === `sym:${source}` && item.target === `sym:${target}`,
      );
      const provenance = edge?.provenance[0];
      return [provenance?.resolution, provenance?.confidence, provenance?.via ?? []];
    };
    expect(explain("src/cli.ts#main", "src/shop.ts#createShop")).toEqual([
      "re-export-chain",
      1,
      ["file:src/index.ts"],
    ]);
    expect(explain("src/cli.ts#main", "src/billing/tax.ts#Tax.rateFor")).toEqual([
      "re-export-chain",
      1,
      ["file:src/index.ts", "file:src/billing/index.ts"],
    ]);
    expect(explain("src/ui/App.tsx#App", "src/customers/customer.ts#customerDisplayName")).toEqual([
      "re-export-chain",
      1,
      ["file:src/customers/index.ts"],
    ]);
    expect(
      explain(
        "src/orders/order-service.ts#OrderService.cancel",
        "src/shared/repository.ts#Repository.getOrThrow",
      ),
    ).toEqual(["inherited-member", 0.85, []]);
    expect(
      explain("src/shop.ts#Shop.checkout", "src/orders/order-service.ts#OrderService.place"),
    ).toEqual(["declared-type", 0.9, []]);
    expect(explain("src/shop.ts#Shop.describe", "src/legacy.ts#legacyFormat")).toEqual([
      "import-binding",
      1,
      [],
    ]);
    const barrels = Object.fromEntries(
      result.files
        .filter((entry) => entry.path.endsWith("index.ts"))
        .map((entry) => [entry.path, entry.exports.map((item) => item.name)]),
    );
    expect(barrels).toEqual({
      "src/billing/index.ts": ["Invoice", "Tax"],
      "src/customers/index.ts": ["*", "*"],
      "src/index.ts": ["*", "Shop", "billing", "createShop"],
      "src/orders/index.ts": ["*", "*", "*", "*"],
    });
  });
});
