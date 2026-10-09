import { compareStrings, fileId, inferredModuleKey } from "@katedrala/ir";
import type { FileId } from "@katedrala/ir";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { prototypeModel, shuffledModel } from "../test-support.js";
import type {
  ClusteringContext,
  GroupOrganization,
  Scope,
  ScopeClustering,
  UnitKind,
} from "../types.js";
import { ENTRY_POINT_RULE } from "./classes.js";
import { clusterScope } from "./cluster.js";
import {
  arbitraryScope,
  DEFAULT_SETTINGS,
  entryPointFiles,
  locationLabels,
  modelScopes,
  scopePaths,
  testContext,
  testScope,
  withModuleSettings,
} from "./reference.test-support.js";

/** One scope's clustering with its node paths. */
interface Clustered {
  readonly scope: Scope;
  readonly paths: readonly string[];
  readonly result: ScopeClustering;
}

/**
 * Module clustering of a prototype graph (plan 6.1, review #8), as P0 forms the scopes: source files minus the
 * files of `declared` directories (the prototype's declared modules), location labels for the names (D-39), the
 * document's entry points (D-31).
 */
function clusterPrototype(name: string, declared: readonly string[] = []): Clustered[] {
  const model = prototypeModel(name);
  const excluded = new Set<FileId>(
    model.document.files
      .filter((file) => declared.some((directory) => file.path.startsWith(`${directory}/`)))
      .map((file) => file.id),
  );
  const entryPoints = entryPointFiles(model);
  return modelScopes(model, DEFAULT_SETTINGS, excluded).map((scope) => ({
    scope,
    paths: scopePaths(scope),
    result: clusterScope(scope, {
      settings: DEFAULT_SETTINGS,
      labels: locationLabels(scope),
      entryPoints,
      repositoryName: name,
    }),
  }));
}

/** The only scope of a single-package fixture. */
function onlyScope(clustered: readonly Clustered[]): Clustered {
  expect(clustered).toHaveLength(1);
  const [only] = clustered;
  if (only === undefined) throw new Error("no scope");
  return only;
}

/** Units as `key → "kind name: members"`, members by path relative to `src/`. */
function memberships(clustered: Clustered): Record<string, string> {
  const relative = (path: string): string => path.replace(/^src\//, "");
  return Object.fromEntries(
    clustered.result.units.map((unit) => [
      unit.key,
      `${unit.kind} ${unit.name}: ${[...unit.members]
        .map((node) => relative(clustered.paths[node] ?? "?"))
        .join(", ")}`,
    ]),
  );
}

/** The paths of the nodes whose entry in `mask` is 1. */
function marked(clustered: Clustered, mask: Uint8Array): string[] {
  return clustered.paths.filter((_, node) => mask[node] === 1);
}

/**
 * The P3 classes with what triggered each (D-66): composition roots with their rule and the number of other
 * units their dependencies reach, utilities with the number of other units among their dependents, facades.
 */
function triggers(clustered: Clustered): {
  orchestrators: Record<string, string>;
  utilities: Record<string, number>;
  facades: string[];
} {
  const { classes } = clustered.result;
  const orchestrators: Record<string, string> = {};
  const utilities: Record<string, number> = {};
  clustered.paths.forEach((path, node) => {
    if (classes.orchestrators[node] === 1) {
      const rule = classes.orchestratorRule[node] === ENTRY_POINT_RULE ? "entry-point" : "shape";
      orchestrators[path] = `${rule} rule, ${String(classes.dependencyUnits[node])} units`;
    }
    if (classes.utilities[node] === 1) utilities[path] = classes.dependentUnits[node] ?? -1;
  });
  return { orchestrators, utilities, facades: marked(clustered, classes.facades) };
}

/** The §3.6 columns of a group: layer children (names), recurrent stems, coverage, style, applied. */
function styleRow(group: GroupOrganization | undefined): string {
  if (group === undefined) return "missing";
  const names = group.layerChildren.map((child) => child.slice(child.lastIndexOf("/") + 1));
  return `${group.directory}: ${names.join(" ")} | ${group.recurrentStems.join(" ") || "-"} | ${String(
    group.coveredFiles,
  )}/${String(group.layerFiles)} | ${group.style}${group.stemsApplied ? " +stems" : ""}`;
}

describe("clusterScope (P1–P6)", () => {
  it("runs the phases in order and returns every part of the clustering", () => {
    const scope = testScope({
      paths: [
        "src/main.ts",
        "src/controllers/order.controller.ts",
        "src/services/order.service.ts",
        "src/catalog/a.ts",
        "src/catalog/b.ts",
        "src/catalog/c.ts",
        "src/catalog/d.ts",
        "src/shared/log.ts",
      ],
      arcs: [
        ["src/main.ts", "src/controllers/order.controller.ts"],
        ["src/main.ts", "src/catalog/a.ts"],
        ["src/controllers/order.controller.ts", "src/services/order.service.ts"],
        ["src/controllers/order.controller.ts", "src/catalog/c.ts"],
        ["src/services/order.service.ts", "src/catalog/c.ts"],
        ["src/catalog/a.ts", "src/catalog/b.ts"],
        ["src/catalog/b.ts", "src/shared/log.ts"],
        ["src/services/order.service.ts", "src/shared/log.ts"],
      ],
    });
    const result = clusterScope(
      scope,
      testContext({ entryPoints: new Set([fileId("src/main.ts")]) }),
    );
    const paths = scopePaths(scope);
    const clustered: Clustered = { scope, paths, result };
    expect(result.scope).toBe(scope);
    expect(result.sourceRoot).toBe("src");
    expect(memberships(clustered)).toEqual({
      src: "root repository: main.ts",
      "src#order":
        "stem order: catalog/c.ts, controllers/order.controller.ts, services/order.service.ts",
      "src/catalog": "feature catalog: catalog/a.ts, catalog/b.ts, catalog/d.ts",
      "src/shared": "shared shared: shared/log.ts",
    });
    expect([...result.unitOf]).toEqual(
      paths.map((path) =>
        result.units.findIndex((unit) => [...unit.members].some((node) => paths[node] === path)),
      ),
    );
    expect(marked(clustered, result.classes.orchestrators)).toEqual(["src/main.ts"]);
    expect(result.classes.orchestratorRule[paths.indexOf("src/main.ts")]).toBe(ENTRY_POINT_RULE);
    expect(result.groups.map(styleRow)).toEqual([
      "src: controllers services | order | 2/2 | mixed +stems",
    ]);
    expect(
      result.relocations.map((move) => `${paths[move.node] ?? "?"}: ${move.from} -> ${move.to}`),
    ).toEqual(["src/catalog/c.ts: src/catalog -> src#order"]);
    expect(marked(clustered, result.classes.utilities)).toEqual(["src/shared/log.ts"]);
    expect(result).toMatchObject({ passes: 2, converged: true });
  });

  it("splits oversized flat directories (P4) and reports pass limits (D-37)", () => {
    const scope = testScope({
      paths: [
        "src/main.ts",
        ...["a", "b", "c"].map((x) => `src/lib/alpha-${x}.ts`),
        ...["a", "b", "c"].map((x) => `src/lib/beta-${x}.ts`),
      ],
      arcs: [
        ["src/lib/alpha-a.ts", "src/lib/alpha-b.ts"],
        ["src/lib/alpha-b.ts", "src/lib/alpha-c.ts"],
        ["src/lib/beta-a.ts", "src/lib/beta-b.ts"],
        ["src/lib/beta-b.ts", "src/lib/beta-c.ts"],
      ],
    });
    const result = clusterScope(
      scope,
      testContext({ settings: withModuleSettings({ maxModuleFiles: 5 }) }),
    );
    expect(result.units.map((unit) => `${unit.key} ${unit.kind} ${unit.name}`)).toEqual([
      "src root repository",
      "src/lib#alpha split alpha",
      "src/lib#beta split beta",
    ]);
    expect(result.units[1]?.oversized).toEqual({ directory: "src/lib", nodes: 6 });
  });

  it("is a pure function of its inputs, and its units satisfy the identity rules (property, plan 7.1)", () => {
    const kinds: readonly UnitKind[] = ["root", "feature", "layer", "shared", "stem", "split"];
    fc.assert(
      fc.property(
        fc.boolean().chain((flat) => arbitraryScope({ maxFiles: 30, maxArcs: 90, flat })),
        fc.integer({ min: 2, max: 12 }),
        fc.integer({ min: 1, max: 3 }),
        ({ scope, paths }, maxModuleFiles, maxPasses) => {
          const context: ClusteringContext = testContext({
            settings: withModuleSettings({ maxModuleFiles, maxPasses }),
            labels: locationLabels(scope),
          });
          const result = clusterScope(scope, context);
          expect(clusterScope(scope, context)).toEqual(result);
          const n = paths.length;
          expect(result.units.length).toBeGreaterThan(0);
          const keys = result.units.map((unit) => unit.key);
          expect(new Set(keys).size).toBe(keys.length);
          expect([...keys].sort(compareStrings)).toEqual(keys);
          const seen = new Int32Array(n);
          result.units.forEach((unit, index) => {
            expect(unit.key).toBe(inferredModuleKey(unit.anchor));
            // Every id belongs to a prior unit: P5 creates no unit and fills no unit that was empty.
            expect(unit.prior.length).toBeGreaterThan(0);
            expect(kinds).toContain(unit.kind);
            expect(unit.destination).toBe(
              unit.kind === "feature" || unit.kind === "stem" || unit.kind === "split",
            );
            expect(unit.name).not.toBe("");
            expect(unit.members.length).toBeGreaterThan(0);
            for (let i = 1; i < unit.members.length; i++) {
              expect(unit.members[i]).toBeGreaterThan(unit.members[i - 1] ?? -1);
            }
            for (let i = 1; i < unit.prior.length; i++) {
              expect(unit.prior[i]).toBeGreaterThan(unit.prior[i - 1] ?? -1);
            }
            for (const node of unit.members) {
              expect(result.unitOf[node]).toBe(index);
              seen[node] = (seen[node] ?? 0) + 1;
            }
            if (unit.kind === "stem") expect(unit.group).toBe(unit.anchor.directory);
          });
          // Every node is in exactly one unit.
          expect([...seen].every((count) => count === 1)).toBe(true);
          // Relocated nodes are exactly the nodes outside their unit's prior.
          const relocated = new Map(result.relocations.map((move) => [move.node, move]));
          for (let node = 0; node < n; node++) {
            const unit = result.units[result.unitOf[node] ?? -1];
            const move = relocated.get(node);
            if (move === undefined) expect([...(unit?.prior ?? [])]).toContain(node);
            else {
              expect([...(unit?.prior ?? [])]).not.toContain(node);
              expect(move.to).toBe(unit?.key);
              expect(move.from).not.toBe(move.to);
            }
          }
          expect(result.passes).toBeGreaterThanOrEqual(1);
          expect(result.passes).toBeLessThanOrEqual(maxPasses);
          // Groups are the split directories, sorted.
          const directories = result.groups.map((group) => group.directory);
          expect([...directories].sort(compareStrings)).toEqual(directories);
        },
      ),
      { seed: 20261008, numRuns: 300 },
    );
  });
});

describe("design replays on prototype graphs (plan 6.3 Done, review #8)", () => {
  it("reproduces the eight rows of the §3.6 organization table", () => {
    const row = (name: string, declared: readonly string[] = []): string =>
      styleRow(
        onlyScope(clusterPrototype(name, declared)).result.groups.find(
          (group) => group.directory === "src",
        ),
      );
    expect(row("layered-architecture")).toBe(
      "src: controllers models repositories services | order payment user | 14/14 | layer +stems",
    );
    expect(row("dependency-violations", ["src/payments", "src/analytics"])).toBe(
      "src: controllers domain repositories services | customer order refund | 10/11 | layer +stems",
    );
    expect(row("high-fan-in")).toBe(
      "src: api jobs services storage | email inventory order user | 10/20 | layer +stems",
    );
    expect(row("express-app")).toBe(
      "src: clients controllers db middleware models repositories routes services | order user | 10/18 | layer +stems",
    );
    expect(row("fastify-app")).toBe(
      "src: clients handlers hooks repositories routes schemas services | order | 4/8 | mixed +stems",
    );
    expect(row("clean-architecture")).toBe(
      "src: application domain infrastructure presentation | - | 0/24 | layer",
    );
    expect(row("high-fan-out")).toBe("src: adapters services | - | 0/21 | layer");
    expect(row("javascript-commonjs")).toBe("src: routes services store views | - | 0/6 | mixed");
  });

  it("reproduces §3.16 for layered-architecture", () => {
    const clustered = onlyScope(clusterPrototype("layered-architecture"));
    expect(memberships(clustered)).toEqual({
      src: "root shop-backend: main.ts",
      "src#order":
        "stem orders: controllers/order.controller.ts, models/order-line.ts, models/order.ts, repositories/order.repository.ts, services/order.service.ts",
      "src#payment":
        "stem payments: controllers/payment.controller.ts, models/payment.ts, repositories/payment.repository.ts, services/payment-gateway.ts, services/payment.service.ts",
      "src#user":
        "stem users: controllers/user.controller.ts, models/user.ts, repositories/user.repository.ts, services/user.service.ts",
      "src/shared":
        "shared shared: shared/config.ts, shared/database.ts, shared/errors.ts, shared/http.ts, shared/logger.ts",
    });
    // §3.13: `main.ts` is the composition root, `shared/{database,errors,http,logger}.ts` the utilities.
    expect(triggers(clustered)).toEqual({
      orchestrators: { "src/main.ts": "entry-point rule, 3 units" },
      utilities: {
        "src/shared/database.ts": 3,
        "src/shared/errors.ts": 3,
        "src/shared/http.ts": 3,
        "src/shared/logger.ts": 2,
      },
      facades: [],
    });
    expect(clustered.result.relocations).toEqual([]);
    expect(clustered.result).toMatchObject({ passes: 1, converged: true });
  });

  it("reproduces §3.16 for ambiguous-boundaries, with §3.9's three relocations and their weights", () => {
    const clustered = onlyScope(clusterPrototype("ambiguous-boundaries"));
    expect(memberships(clustered)).toEqual({
      src: "root coffee-shop: server.ts",
      "src/cart":
        "feature cart: cart/cart-rules.ts, cart/cart-service.ts, cart/cart-store.ts, cart/cart-view.ts, cart/cart.ts",
      "src/catalog":
        "feature catalog: catalog/category-tree.ts, catalog/inventory.ts, catalog/product-repository.ts, catalog/product-view.ts, catalog/product.ts, catalog/search.ts, checkout/stock-availability.ts",
      "src/checkout":
        "feature checkout: cart/shipping-estimator.ts, catalog/price-calculator.ts, checkout/address.ts, checkout/checkout-service.ts, checkout/delivery.ts, checkout/discounts.ts, checkout/invoice.ts, checkout/order-summary.ts, checkout/payment.ts, checkout/shipping-rates.ts, checkout/tax-rules.ts",
      "src/common":
        "shared common: common/format.ts, common/session.ts, common/slug.ts, common/validation.ts",
    });
    const moves = clustered.result.relocations.map((move) => ({
      file: clustered.paths[move.node],
      from: move.from,
      to: move.to,
      dependents: Object.fromEntries(move.dependents),
      dependencies: Object.fromEntries(move.dependencies),
    }));
    expect(moves).toEqual([
      {
        file: "src/cart/shipping-estimator.ts",
        from: "src/cart",
        to: "src/checkout",
        dependents: { "src/checkout": { weight: 2, files: 2 } },
        dependencies: { "src/checkout": 2 },
      },
      {
        file: "src/catalog/price-calculator.ts",
        from: "src/catalog",
        to: "src/checkout",
        dependents: {
          "src/catalog": { weight: 1, files: 1 },
          "src/checkout": { weight: 3, files: 3 },
        },
        dependencies: { "src/checkout": 2 },
      },
      {
        file: "src/checkout/stock-availability.ts",
        from: "src/checkout",
        to: "src/catalog",
        dependents: { "src/catalog": { weight: 2, files: 2 } },
        dependencies: { "src/catalog": 1.5 },
      },
    ]);
    // §3.9: `server.ts` is an orchestrator and `common/format.ts` a utility, so neither votes.
    expect(triggers(clustered)).toEqual({
      orchestrators: { "src/server.ts": "entry-point rule, 3 units" },
      utilities: { "src/common/format.ts": 3 },
      facades: [],
    });
    // The prior keeps the files that moved (P6 names and P9 agreement read it).
    const priorOf = (key: string): string[] => {
      const unit = clustered.result.units.find((candidate) => candidate.key === key);
      return [...(unit?.prior ?? [])].map((node) => clustered.paths[node] ?? "?");
    };
    expect(priorOf("src/cart")).toContain("src/cart/shipping-estimator.ts");
    expect(priorOf("src/catalog")).toContain("src/catalog/price-calculator.ts");
    expect(priorOf("src/checkout")).toContain("src/checkout/stock-availability.ts");
    expect(clustered.result).toMatchObject({ passes: 2, converged: true });
  });

  it("reproduces §3.16 for clean-architecture: layer modules, no stem", () => {
    const clustered = onlyScope(clusterPrototype("clean-architecture"));
    expect(memberships(clustered)).toEqual({
      src: "root library-lending: main.ts",
      "src/application":
        "layer application: application/borrow-book.ts, application/dto.ts, application/return-book.ts, application/send-overdue-reminders.ts",
      "src/domain":
        "layer domain: domain/index.ts, domain/model/book.ts, domain/model/errors.ts, domain/model/loan.ts, domain/model/member.ts, domain/ports/book-repository.ts, domain/ports/clock.ts, domain/ports/loan-repository.ts, domain/ports/member-repository.ts, domain/ports/notifier.ts",
      "src/infrastructure":
        "layer infrastructure: infrastructure/notifications/smtp-notifier.ts, infrastructure/persistence/pool.ts, infrastructure/persistence/sql-book-repository.ts, infrastructure/persistence/sql-loan-repository.ts, infrastructure/persistence/sql-member-repository.ts, infrastructure/system-clock.ts",
      "src/presentation":
        "layer presentation: presentation/http/error-mapper.ts, presentation/http/http-types.ts, presentation/http/loan-routes.ts, presentation/http/server.ts",
    });
    expect(triggers(clustered)).toEqual({
      orchestrators: { "src/main.ts": "entry-point rule, 3 units" },
      utilities: {},
      facades: ["src/domain/index.ts"],
    });
    expect(clustered.result.relocations).toEqual([]);
  });

  it("reproduces §3.16 for tangled-architecture: the feature directories stay", () => {
    const clustered = onlyScope(clusterPrototype("tangled-architecture"));
    const directory = (name: string, files: readonly string[]): string =>
      `feature ${name}: ${files.map((file) => `${name}/${file}.ts`).join(", ")}`;
    expect(memberships(clustered)).toEqual({
      src: "root corner-shop: main.ts",
      "src/cart": directory("cart", [
        "abandonment",
        "cart-repository",
        "cart-service",
        "cart-stats",
        "cart",
      ]),
      "src/catalog": directory("catalog", [
        "index",
        "pricing",
        "product-service",
        "product",
        "recommendations",
      ]),
      "src/checkout": directory("checkout", [
        "checkout-service",
        "order-history",
        "order",
        "payment",
        "receipts",
      ]),
      "src/customers": directory("customers", [
        "addresses",
        "customer-service",
        "customer",
        "loyalty",
        "segments",
      ]),
      "src/inventory": directory("inventory", [
        "reservations",
        "stock-level",
        "stock-service",
        "subscribers",
        "warehouses",
      ]),
      "src/lib": "shared lib: lib/db.ts, lib/events.ts, lib/money.ts",
    });
    expect(clustered.result.relocations).toEqual([]);
    // §3.16: `lib` holds 3 utilities; with the prototype's barrel resolution, three feature files used by
    // three other features are utilities too (the linker graph adds a seventh, plan 7.3).
    expect(triggers(clustered)).toEqual({
      orchestrators: { "src/main.ts": "entry-point rule, 4 units" },
      utilities: {
        "src/catalog/product-service.ts": 3,
        "src/checkout/order-history.ts": 3,
        "src/customers/loyalty.ts": 3,
        "src/lib/db.ts": 5,
        "src/lib/events.ts": 2,
        "src/lib/money.ts": 3,
      },
      facades: ["src/catalog/index.ts"],
    });
  });

  it("reproduces §3.16 for dependency-violations, with its declared modules excluded", () => {
    const clustered = onlyScope(
      clusterPrototype("dependency-violations", ["src/payments", "src/analytics"]),
    );
    expect(memberships(clustered)).toEqual({
      src: "root order-backend: config.ts, main.ts",
      "src#customer":
        "stem customers: controllers/customer.controller.ts, domain/customer.ts, repositories/customer.repository.ts, services/customer.service.ts",
      "src#order":
        "stem orders: controllers/order.controller.ts, domain/order.ts, repositories/order.repository.ts, services/order.service.ts",
      "src#refund": "stem refund: controllers/refund.controller.ts, services/refund.service.ts",
      "src/repositories": "layer repositories: repositories/database.ts",
    });
    expect(clustered.paths.some((path) => path.startsWith("src/payments/"))).toBe(false);
    expect(triggers(clustered)).toEqual({
      orchestrators: { "src/main.ts": "entry-point rule, 3 units" },
      utilities: {},
      facades: [],
    });
    expect(clustered.result.relocations).toEqual([]);
  });

  it("gives identical results on shuffled documents (determinism)", () => {
    for (const name of ["layered-architecture", "ambiguous-boundaries", "monorepo"]) {
      const model = prototypeModel(name);
      const describeAll = (scopes: readonly Scope[], entryPoints: ReadonlySet<FileId>): string[] =>
        scopes.flatMap((scope) => {
          const paths = scopePaths(scope);
          const result = clusterScope(scope, {
            settings: DEFAULT_SETTINGS,
            labels: locationLabels(scope),
            entryPoints,
            repositoryName: name,
          });
          return [
            ...result.units.map(
              (unit) =>
                `${unit.key} ${unit.name} ${[...unit.members].map((node) => paths[node]).join(",")}`,
            ),
            ...result.relocations.map(
              (move) => `${paths[move.node] ?? "?"} ${move.from} ${move.to}`,
            ),
          ];
        });
      const expected = describeAll(modelScopes(model), entryPointFiles(model));
      for (const seed of [1, 2, 3]) {
        const shuffled = shuffledModel(model, seed);
        expect(describeAll(modelScopes(shuffled), entryPointFiles(shuffled))).toEqual(expected);
      }
    }
  });

  it("keeps the monorepo's packages apart and names roots by package (D-38)", () => {
    const clustered = clusterPrototype("monorepo");
    expect(
      clustered.map((scope) => scope.result.units.map((unit) => `${unit.key} ${unit.name}`)),
    ).toEqual([
      ["packages/api/src api", "packages/api/src/handlers handlers"],
      [
        "packages/core/src core",
        "packages/core/src/catalog catalog",
        "packages/core/src/orders orders",
      ],
      ["packages/shared/src shared"],
      ["packages/web/src web", "packages/web/src/components components"],
    ]);
    for (const { result, paths } of clustered) {
      for (const unit of result.units) {
        for (const node of unit.members)
          expect(paths[node]?.startsWith(`${result.scope.directory}/`)).toBe(true);
      }
    }
    const api = clustered[0];
    expect(api === undefined ? undefined : marked(api, api.result.classes.orchestrators)).toEqual([
      "packages/api/src/server.ts",
    ]);
  });
});
