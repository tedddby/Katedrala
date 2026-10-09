import { fileId } from "@katedrala/ir";
import type { FileId } from "@katedrala/ir";
import { describe, expect, it } from "vitest";
import type { ClusteringContext, FileLabel, InferenceSettings } from "../types.js";
import { structuralClasses } from "./classes.js";
import {
  identifyUnits,
  rootUnitName,
  splitPieceName,
  stemUnitName,
  withoutNpmScope,
} from "./identity.js";
import type { IdentifiedUnits } from "./identity.js";
import { priorUnits } from "./prior.js";
import type { PartitionUnit } from "./prior.js";
import { reassign } from "./reassign.js";
import {
  DEFAULT_SETTINGS,
  locationLabels,
  scopePaths,
  testContext,
  testLabel,
  testScope,
  withModuleSettings,
} from "./reference.test-support.js";
import type { TestScopeSpec } from "./reference.test-support.js";
import { splitOversized } from "./split.js";
import { applyStemUnits } from "./stems.js";

interface Identified extends IdentifiedUnits {
  /** Units as `key kind name = final paths`. */
  readonly lines: string[];
}

/** P1–P6 on a test scope, with location labels unless `labels` are given. */
function identify(
  spec: TestScopeSpec,
  options: {
    readonly settings?: InferenceSettings;
    readonly labels?: ReadonlyMap<FileId, FileLabel>;
    readonly repositoryName?: string;
  } = {},
): Identified {
  const settings = options.settings ?? DEFAULT_SETTINGS;
  const scope = testScope(spec);
  const context = testContext({
    settings,
    labels: options.labels ?? locationLabels(scope, settings),
    ...(options.repositoryName === undefined ? {} : { repositoryName: options.repositoryName }),
  });
  const prior = priorUnits(scope, settings);
  const stems = applyStemUnits(scope, prior, settings);
  const classified = structuralClasses(scope, prior.partition, settings, context.entryPoints);
  splitOversized(scope, prior, classified, settings, stems);
  const reassignment = reassign(scope, prior.partition, classified, settings);
  const result = identifyUnits(scope, prior, stems, reassignment, context);
  const paths = scopePaths(scope);
  return {
    ...result,
    lines: result.units.map(
      (unit) =>
        `${unit.key} ${unit.kind} ${unit.name} = ${[...unit.members].map((node) => paths[node]).join(", ")}`,
    ),
  };
}

/** A layer-organized `src` with a connected `payment` stem; `entity` is the model file's name. */
function paymentSpec(entity: string): TestScopeSpec {
  return {
    paths: [
      "src/main.ts",
      "src/controllers/payment.controller.ts",
      "src/services/payment.service.ts",
      `src/models/${entity}`,
    ],
    arcs: [
      ["src/controllers/payment.controller.ts", "src/services/payment.service.ts"],
      ["src/services/payment.service.ts", `src/models/${entity}`],
    ],
  };
}

describe("identifyUnits (P6, §3.10)", () => {
  describe("keys", () => {
    it("writes the analysis root as `.`, also before a stem, and escapes directories (plan 3.5)", () => {
      const result = identify({
        paths: [
          "main.ts",
          "controllers/order.controller.ts",
          "services/order.service.ts",
          "a#b/x.ts",
          "50%/y.ts",
        ],
        arcs: [["controllers/order.controller.ts", "services/order.service.ts"]],
      });
      expect(result.units.map((unit) => unit.key)).toEqual([".", ".#order", "50%25", "a%23b"]);
      expect(result.units[1]?.anchor).toEqual({ directory: "", stem: "order" });
      expect(result.lines[0]).toBe(". root repository = main.ts");
    });

    it("drops empty units, sorts by key and maps every node to its unit", () => {
      const result = identify({
        paths: [
          "src/controllers/order.controller.ts",
          "src/services/order.service.ts",
          "src/a-b/x.ts",
        ],
        arcs: [["src/controllers/order.controller.ts", "src/services/order.service.ts"]],
      });
      // The layer units were emptied by P2; `#` (0x23) sorts before `/` (0x2F).
      expect(result.units.map((unit) => unit.key)).toEqual(["src#order", "src/a-b"]);
      expect([...result.unitOf]).toEqual([1, 0, 0]);
      expect(result.units[0]).toMatchObject({ kind: "stem", group: "src", destination: true });
      expect([...(result.units[0]?.prior ?? [])]).toEqual([1, 2]);
    });
  });

  describe("names", () => {
    it("names directory, layer and shared units by the anchor's last segment", () => {
      const result = identify({
        paths: ["src/main.ts", "src/catalog/a.ts", "src/services/b.ts", "src/utils/c.ts"],
      });
      expect(result.lines).toEqual([
        "src root repository = src/main.ts",
        "src/catalog feature catalog = src/catalog/a.ts",
        "src/services layer services = src/services/b.ts",
        "src/utils shared utils = src/utils/c.ts",
      ]);
    });

    it("names the root unit after the scope package without its npm scope (D-38)", () => {
      const scoped = identify({
        id: "pkg:npm:@acme/api",
        directory: "packages/api",
        packageName: "@acme/api",
        paths: ["packages/api/src/server.ts", "packages/api/src/handlers/orders.ts"],
      });
      expect(scoped.lines[0]).toBe("packages/api/src root api = packages/api/src/server.ts");
      const plain = identify({
        id: "pkg:npm:shop-backend",
        packageName: "shop-backend",
        paths: ["src/main.ts", "src/a/x.ts"],
      });
      expect(plain.units[0]?.name).toBe("shop-backend");
    });

    it("names the root unit after the repository without a package, and after a meaningful source root", () => {
      const repository = identify(
        { paths: ["src/main.ts", "src/a/x.ts"] },
        { repositoryName: "shop" },
      );
      expect(repository.units[0]?.name).toBe("shop");
      const atRoot = identify({ paths: ["main.ts", "a/x.ts"] }, { repositoryName: "shop" });
      expect(atRoot.units[0]?.name).toBe("shop");
      const lib = identify(
        { paths: ["lib/index.ts", "lib/parts/x.ts"] },
        { repositoryName: "shop" },
      );
      expect(lib.lines[0]).toBe("lib root lib = lib/index.ts");
      // A source root below a named package that is not a container keeps its own name.
      const below = identify({
        id: "pkg:npm:tool",
        directory: "tools/x",
        packageName: "tool",
        paths: ["tools/x/engine/run.ts", "tools/x/engine/parts/a.ts"],
      });
      expect(below.units[0]?.name).toBe("engine");
    });

    it("names the root unit of an unnamed manifest after the package directory (D-12, D-38)", () => {
      const nested = identify({
        id: "pkg:npm:packages/tool",
        directory: "packages/tool",
        packageName: "packages/tool",
        paths: ["packages/tool/src/main.ts", "packages/tool/src/a/x.ts"],
      });
      expect(nested.units[0]?.name).toBe("tool");
      const root = identify(
        { id: "pkg:npm:", packageName: ".", paths: ["src/main.ts", "src/a/x.ts"] },
        { repositoryName: "shop" },
      );
      expect(root.units[0]?.name).toBe("shop");
    });

    it("pluralizes the entity a stem names, keeping its case (D-39)", () => {
      expect(identify(paymentSpec("payment.ts")).lines[1]).toBe(
        "src#payment stem payments = src/controllers/payment.controller.ts, src/models/payment.ts, src/services/payment.service.ts",
      );
      expect(identify(paymentSpec("Payment.ts")).units[1]?.name).toBe("Payments");
      // An already plural head is kept as written.
      expect(identify(paymentSpec("payments.ts")).units[1]?.name).toBe("payments");
      // A `category` entity becomes `categories`.
      const category = identify({
        paths: ["src/main.ts", "src/controllers/category.controller.ts", "src/models/category.ts"],
        arcs: [["src/controllers/category.controller.ts", "src/models/category.ts"]],
      });
      expect(category.units[1]?.name).toBe("categories");
    });

    it("needs an entity: a model or domain label, or a data-model role, and a single-token head", () => {
      const spec = paymentSpec("payment.ts");
      const model = fileId("src/models/payment.ts");
      // No labels at all: the most frequent original first token.
      expect(identify(spec, { labels: new Map() }).units[1]?.name).toBe("payment");
      expect(
        identify(spec, { labels: new Map([[model, testLabel(model, "domain")]]) }).units[1]?.name,
      ).toBe("payments");
      expect(
        identify(spec, { labels: new Map([[model, testLabel(model, null, ["data-model"])]]) })
          .units[1]?.name,
      ).toBe("payments");
      expect(
        identify(spec, { labels: new Map([[model, testLabel(model, "service", ["service"])]]) })
          .units[1]?.name,
      ).toBe("payment");
      // A head of two tokens is no entity of the stem.
      const line = identify(paymentSpec("payment-line.ts"));
      expect(line.units[1]?.name).toBe("payment");
    });

    it("keeps mass nouns and gerunds without an entity file (D-39)", () => {
      const result = identify({
        paths: [
          "src/main.ts",
          "src/controllers/billing.controller.ts",
          "src/services/billing.service.ts",
        ],
        arcs: [["src/controllers/billing.controller.ts", "src/services/billing.service.ts"]],
      });
      expect(result.units[1]?.name).toBe("billing");
    });

    it("takes the most frequent original spelling, ties by compareStrings", () => {
      const result = identify({
        paths: [
          "src/main.ts",
          "src/controllers/Order.controller.ts",
          "src/services/order.service.ts",
        ],
        arcs: [["src/controllers/Order.controller.ts", "src/services/order.service.ts"]],
      });
      // `Order` and `order` once each: `Order` sorts first (0x4F < 0x6F).
      expect(result.units[1]?.name).toBe("Order");
      const recurring = identify({
        paths: [
          "src/main.ts",
          "src/controllers/payment/create.ts",
          "src/services/payments/charge.ts",
          "src/repositories/payments/store.ts",
        ],
        arcs: [
          ["src/controllers/payment/create.ts", "src/services/payments/charge.ts"],
          ["src/services/payments/charge.ts", "src/repositories/payments/store.ts"],
        ],
      });
      // A sub-directory stem is named by the sub-directory's spelling (D-28).
      expect(recurring.lines[1]).toBe(
        "src#payment stem payments = src/controllers/payment/create.ts, src/repositories/payments/store.ts, src/services/payments/charge.ts",
      );
    });

    it("names modules from their prior members, so P5 never renames a module", () => {
      // `models/order.ts` is used mostly by `src/billing`, which it depends on: P5 moves it there, but the
      // stem module keeps the plural entity name its prior gave it.
      const result = identify({
        paths: [
          "src/main.ts",
          "src/controllers/order.controller.ts",
          "src/services/order.service.ts",
          "src/models/order.ts",
          "src/billing/a.ts",
          "src/billing/b.ts",
          "src/billing/c.ts",
        ],
        arcs: [
          ["src/controllers/order.controller.ts", "src/services/order.service.ts"],
          ["src/services/order.service.ts", "src/models/order.ts"],
          ["src/billing/a.ts", "src/models/order.ts"],
          ["src/billing/b.ts", "src/models/order.ts"],
          ["src/billing/c.ts", "src/models/order.ts"],
          ["src/models/order.ts", "src/billing/a.ts"],
        ],
      });
      expect(result.lines).toEqual([
        "src root repository = src/main.ts",
        "src#order stem orders = src/controllers/order.controller.ts, src/services/order.service.ts",
        "src/billing feature billing = src/billing/a.ts, src/billing/b.ts, src/billing/c.ts, src/models/order.ts",
      ]);
      expect(result.units[1]?.prior).toHaveLength(3);
    });

    it("names P4 pieces by their stem's spelling, or by the fallback member's file name", () => {
      const settings = withModuleSettings({ maxModuleFiles: 5 });
      const result = identify(
        {
          paths: [
            "src/main.ts",
            "src/lib/Format-a.ts",
            "src/lib/format-b.ts",
            "src/lib/format-c.ts",
            "src/lib/formatDate.ts",
            "src/lib/formatDay.ts",
            "src/lib/formatX.ts",
          ],
          arcs: [
            ["src/lib/Format-a.ts", "src/lib/format-b.ts"],
            ["src/lib/format-b.ts", "src/lib/format-c.ts"],
            ["src/lib/formatDate.ts", "src/lib/formatDay.ts"],
            ["src/lib/formatDay.ts", "src/lib/formatX.ts"],
          ],
        },
        { settings },
      );
      expect(result.lines).toEqual([
        "src root repository = src/main.ts",
        "src/lib#format split format = src/lib/Format-a.ts, src/lib/format-b.ts, src/lib/format-c.ts",
        "src/lib#format-date-ts split formatDate = src/lib/formatDate.ts, src/lib/formatDay.ts, src/lib/formatX.ts",
      ]);
      expect(result.units[1]?.oversized).toEqual({ directory: "src/lib", nodes: 6 });
    });
  });
});

describe("name helpers", () => {
  it("removes an npm scope only when a name follows it", () => {
    expect(withoutNpmScope("@acme/api")).toBe("api");
    expect(withoutNpmScope("@acme/web/sub")).toBe("web/sub");
    expect(withoutNpmScope("@acme")).toBe("@acme");
    expect(withoutNpmScope("@acme/")).toBe("@acme/");
    expect(withoutNpmScope("plain")).toBe("plain");
  });

  it("falls back to the stem when no member carries a spelling", () => {
    const scope = testScope({ paths: ["src/a.ts"] });
    expect(
      stemUnitName("order", Int32Array.from([0]), scope, ["src/a.ts"], [undefined], new Map()),
    ).toBe("order");
    const piece: PartitionUnit = {
      key: "src#x",
      anchor: { directory: "src", stem: "x" },
      kind: "split",
      destination: true,
    };
    expect(
      splitPieceName(piece, Int32Array.from([0]), ["src/a.ts"], { settings: DEFAULT_SETTINGS }),
    ).toBe("x");
  });

  it("reads the root unit's name rules directly", () => {
    const context: Pick<ClusteringContext, "settings" | "repositoryName"> = {
      settings: DEFAULT_SETTINGS,
      repositoryName: "repo",
    };
    const scope = testScope({ paths: [], directory: "packages/api", packageName: "@acme/api" });
    expect(rootUnitName(scope, "packages/api/src", context)).toBe("api");
    expect(rootUnitName(scope, "packages/api", context)).toBe("api");
    expect(rootUnitName(scope, "packages/api/lib", context)).toBe("lib");
  });
});
