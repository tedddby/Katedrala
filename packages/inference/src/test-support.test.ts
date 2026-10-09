import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  canonicalizeDocument,
  compareStrings,
  directoryId,
  externalId,
  fileId,
  packageId,
  sha256Hex,
  symbolId,
} from "@katedrala/ir";
import type { ArchitectureDocument, RoleEntry } from "@katedrala/ir";
import { ArchitectureModel } from "@katedrala/model";
import { describe, expect, it } from "vitest";
import {
  PROTOTYPE_EDGE_KINDS,
  prototypeDocument,
  prototypeFixtureNames,
  prototypeGraph,
  prototypeModel,
  prototypeRole,
  shuffledModel,
  syntheticDocument,
  syntheticModel,
} from "./test-support.js";
import type { PrototypeGraph } from "./test-support.js";

const strictSchema = (() => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats.default(ajv);
  const url = new URL("../../ir/schema/architecture.strict.schema.json", import.meta.url);
  return ajv.compile(JSON.parse(readFileSync(url, "utf8")) as object);
})();

function schemaErrors(document: ArchitectureDocument): string[] {
  return strictSchema(document)
    ? []
    : (strictSchema.errors ?? []).map((error) => `${error.instancePath} ${error.message ?? ""}`);
}

const DETECTOR_ROLE: RoleEntry = {
  role: "http-controller",
  confidence: 0.9,
  source: "nestjs",
  evidence: [{ signal: "decorator", description: "Decorated with @Controller." }],
};

describe("syntheticDocument and syntheticModel", () => {
  const document = syntheticDocument({
    files: [
      "src/orders/order.ts",
      {
        path: "src/orders/orders.controller.ts",
        classes: ["OrdersController"],
        roles: [DETECTOR_ROLE],
      },
      {
        path: "src/orders/order.service.ts",
        symbols: [
          { name: "OrderService", kind: "class" },
          { name: "OrderService.place", kind: "method", parent: "OrderService" },
          { name: "helper", exported: false },
          { name: "suite", role: "test" },
          { name: "Plugin", kind: "x-widget" },
        ],
        lines: 40,
      },
      { path: "test/order.test.ts", role: "test" },
      { path: "packages/web/src/app.tsx", status: "partial" },
      { path: "packages/web/package.json", role: "configuration" },
    ],
    packages: [{ path: "", name: "shop" }, "packages/web"],
    edges: [
      ["src/orders/orders.controller.ts", "src/orders/order.service.ts"],
      { source: "src/orders/orders.controller.ts", target: "src/orders/order.service.ts" },
      {
        source: symbolId("src/orders/order.service.ts", "OrderService.place"),
        target: "src/orders/order.ts",
        kind: "references-type",
        typeOnly: true,
        confidence: 0.6,
        observations: 2,
      },
      {
        source: symbolId("src/orders/order.service.ts", "OrderService.place"),
        target: "src/orders/order.ts",
        kind: "references-type",
        typeOnly: false,
        confidence: 0.4,
      },
      { source: "packages/web/src/app.tsx", target: externalId("npm", "react") },
      {
        source: packageId("npm", "packages/web"),
        target: packageId("npm", ""),
        kind: "depends-on-package",
      },
    ],
    entryPoints: [
      "src/orders/order.ts",
      {
        entity: "packages/web/src/app.tsx",
        kind: "script",
        source: "packages/web/package.json#scripts.dev",
      },
      {
        entity: symbolId("src/orders/order.service.ts", "OrderService"),
        kind: "framework",
        source: "nestjs",
      },
    ],
    repositoryName: "shop-repo",
    limits: { maxEvidenceEntities: 3 },
    detail: { symbols: true, relationships: "symbol", symbolMetrics: false },
  });

  it("is a canonical, schema-valid document", () => {
    expect(schemaErrors(document)).toEqual([]);
    expect(canonicalizeDocument(document)).toEqual(document);
    expect(document.repository.name).toBe("shop-repo");
    expect(document.limits.maxEvidenceEntities).toBe(3);
    expect(document.detail.symbolMetrics).toBe(false);
  });

  it("lists files with roles, packages and the missing manifests", () => {
    expect(document.files.map((file) => [file.path, file.role, file.package ?? "-"])).toEqual([
      ["package.json", "configuration", "pkg:npm:"],
      ["packages/web/package.json", "configuration", "pkg:npm:packages/web"],
      ["packages/web/src/app.tsx", "source", "pkg:npm:packages/web"],
      ["src/orders/order.service.ts", "source", "pkg:npm:"],
      ["src/orders/order.ts", "source", "pkg:npm:"],
      ["src/orders/orders.controller.ts", "source", "pkg:npm:"],
      ["test/order.test.ts", "test", "pkg:npm:"],
    ]);
    expect(document.packages.map((pkg) => [pkg.id, pkg.name, pkg.manifest])).toEqual([
      ["pkg:npm:", "shop", "file:package.json"],
      ["pkg:npm:packages/web", "packages/web", "file:packages/web/package.json"],
    ]);
    const byPath = new Map(document.files.map((file) => [file.path, file]));
    expect(byPath.get("src/orders/order.service.ts")?.lines).toBe(40);
    expect(byPath.get("packages/web/src/app.tsx")?.analysis.status).toBe("partial");
    expect(byPath.get("packages/web/src/app.tsx")?.language).toBe("typescript");
    expect(byPath.get("package.json")?.language).toBe("json");
    expect(byPath.get("src/orders/orders.controller.ts")?.roles).toEqual([DETECTOR_ROLE]);
  });

  it("lists classes and symbols in source order", () => {
    const service = document.files.find((file) => file.path === "src/orders/order.service.ts");
    expect(service?.symbols).toEqual([
      symbolId("src/orders/order.service.ts", "OrderService"),
      symbolId("src/orders/order.service.ts", "OrderService.place"),
      symbolId("src/orders/order.service.ts", "helper"),
      symbolId("src/orders/order.service.ts", "suite"),
      symbolId("src/orders/order.service.ts", "Plugin"),
    ]);
    const symbols = new Map(document.symbols.map((symbol) => [symbol.qualifiedName, symbol]));
    expect(symbols.get("OrdersController")).toMatchObject({
      kind: "class",
      category: "type",
      exported: true,
    });
    expect(symbols.get("OrdersController")).not.toHaveProperty("parent");
    expect(symbols.get("OrderService.place")).toMatchObject({
      name: "place",
      kind: "method",
      category: "callable",
      parent: symbolId("src/orders/order.service.ts", "OrderService"),
    });
    expect(symbols.get("helper")).toMatchObject({ kind: "function", exported: false });
    expect(symbols.get("suite")?.role).toBe("test");
    expect(symbols.get("Plugin")?.category).toBe("value");
  });

  it("merges repeated edges as the linker does and accepts node identifiers", () => {
    expect(
      document.edges.map((edge) => [
        edge.kind,
        edge.source,
        edge.target,
        edge.observations,
        edge.typeOnly,
        edge.confidence,
      ]),
    ).toEqual([
      ["imports", "file:packages/web/src/app.tsx", "ext:npm:react", 1, false, 1],
      [
        "imports",
        "file:src/orders/orders.controller.ts",
        "file:src/orders/order.service.ts",
        2,
        false,
        1,
      ],
      ["depends-on-package", "pkg:npm:packages/web", "pkg:npm:", 1, false, 1],
      [
        "references-type",
        "sym:src/orders/order.service.ts#OrderService.place",
        "file:src/orders/order.ts",
        3,
        false,
        0.6,
      ],
    ]);
  });

  it("lists entry points with their package", () => {
    expect(document.entryPoints).toEqual([
      {
        entity: "file:packages/web/src/app.tsx",
        kind: "script",
        source: "packages/web/package.json#scripts.dev",
        package: "pkg:npm:packages/web",
      },
      { entity: "file:src/orders/order.ts", kind: "main", source: "test", package: "pkg:npm:" },
      {
        entity: "sym:src/orders/order.service.ts#OrderService",
        kind: "framework",
        source: "nestjs",
        package: "pkg:npm:",
      },
    ]);
  });

  it("derives the directories", () => {
    expect(
      document.directories.map((directory) => [
        directory.path,
        directory.name,
        directory.parent ?? "-",
        directory.directories,
        directory.files.length,
      ]),
    ).toEqual([
      ["", "shop-repo", "-", [directoryId("packages"), directoryId("src"), directoryId("test")], 1],
      ["packages", "packages", directoryId(""), [directoryId("packages/web")], 0],
      ["packages/web", "web", directoryId("packages"), [directoryId("packages/web/src")], 1],
      ["packages/web/src", "src", directoryId("packages/web"), [], 1],
      ["src", "src", directoryId(""), [directoryId("src/orders")], 0],
      ["src/orders", "orders", directoryId("src"), [], 3],
      ["test", "test", directoryId(""), [], 1],
    ]);
  });

  it("has defaults: source files, no packages, the root directory, repository `repository`", () => {
    const minimal = syntheticDocument({ files: ["a.ts"] });
    expect(minimal.files[0]).toMatchObject({ path: "a.ts", role: "source", name: "a.ts" });
    expect(minimal.files[0]).not.toHaveProperty("package");
    expect(minimal.directories).toEqual([
      { id: "dir:", path: "", name: "repository", directories: [], files: ["file:a.ts"] },
    ]);
    expect(minimal.repository.name).toBe("repository");
    expect(schemaErrors(minimal)).toEqual([]);
    expect(syntheticDocument({ files: [] }).directories).toHaveLength(1);
  });

  it("assigns files to the nearest package, then the smallest id", () => {
    const nested = syntheticDocument({
      files: ["a/x.ts", "a/b/y.ts", "c.ts"],
      packages: [
        { path: "a" },
        { path: "a/b", ecosystem: "cargo", manifest: "Cargo.toml" },
        { path: "a/b" },
      ],
    });
    expect(nested.files.map((file) => [file.path, file.package ?? "-"])).toEqual([
      ["a/b/Cargo.toml", "pkg:cargo:a/b"],
      ["a/b/package.json", "pkg:cargo:a/b"],
      ["a/b/y.ts", "pkg:cargo:a/b"],
      ["a/package.json", "pkg:npm:a"],
      ["a/x.ts", "pkg:npm:a"],
      ["c.ts", "-"],
    ]);
  });

  it("builds a model over the document", () => {
    const model = syntheticModel({ files: ["a.ts", "b.ts"], edges: [["a.ts", "b.ts"]] });
    expect(model).toBeInstanceOf(ArchitectureModel);
    expect(model.index.dependencies(fileId("a.ts"))).toEqual([fileId("b.ts")]);
  });
});

describe("shuffledModel", () => {
  const model = syntheticModel({
    files: [
      ...Array.from({ length: 12 }, (_, index) => `src/m${index % 3}/f${index}.ts`),
      {
        path: "src/m0/roles.ts",
        roles: [
          DETECTOR_ROLE,
          { ...DETECTOR_ROLE, source: "express" },
          { ...DETECTOR_ROLE, role: "service" },
        ],
      },
      { path: "src/m1/symbols.ts", classes: ["A", "B", "C"] },
    ],
    packages: [""],
    edges: Array.from({ length: 12 }, (_, index): [string, string] => [
      `src/m${index % 3}/f${index}.ts`,
      `src/m${(index + 1) % 3}/f${(index + 1) % 12}.ts`,
    ]),
    entryPoints: ["src/m0/f0.ts", "src/m1/f1.ts", "src/m2/f2.ts"],
  });

  it("keeps the content and shuffles the order", () => {
    const shuffled = shuffledModel(model, 7);
    const original = model.document as ArchitectureDocument;
    const copy = shuffled.document as ArchitectureDocument;
    expect(canonicalizeDocument(copy)).toEqual(original);
    expect(copy.files.map((file) => file.id)).not.toEqual(original.files.map((file) => file.id));
    expect(copy.edges.map((edge) => edge.id)).not.toEqual(original.edges.map((edge) => edge.id));
    // Source order is an input and stays.
    const symbols = copy.files.find((file) => file.path === "src/m1/symbols.ts")?.symbols;
    expect(symbols).toEqual(["A", "B", "C"].map((name) => symbolId("src/m1/symbols.ts", name)));
    // The model's own document is not modified.
    expect(canonicalizeDocument(original)).toEqual(original);
  });

  it("shuffles every unordered array for some seed", () => {
    const changed = new Set<string>();
    const original = model.document as ArchitectureDocument;
    for (let seed = 1; seed <= 20; seed++) {
      const copy = shuffledModel(model, seed).document as ArchitectureDocument;
      const differs = (a: unknown, b: unknown): boolean => JSON.stringify(a) !== JSON.stringify(b);
      if (differs(copy.directories, original.directories)) changed.add("directories");
      if (differs(copy.entryPoints, original.entryPoints)) changed.add("entryPoints");
      if (differs(copy.symbols, original.symbols)) changed.add("symbols");
      const roles = (document: ArchitectureDocument) =>
        document.files.find((file) => file.path === "src/m0/roles.ts")?.roles;
      if (differs(roles(copy), roles(original))) changed.add("roles");
    }
    expect([...changed].sort(compareStrings)).toEqual([
      "directories",
      "entryPoints",
      "roles",
      "symbols",
    ]);
  });

  it("is deterministic per seed", () => {
    expect(shuffledModel(model, 3).document).toEqual(shuffledModel(model, 3).document);
  });

  it("shuffles units and their member lists, and accepts partial documents", () => {
    const base = model.document as ArchitectureDocument;
    const withUnits = ArchitectureModel.from({
      ...base,
      modules: [
        { ...emptyModule("a"), files: base.files.slice(0, 6).map((file) => file.id) },
        { ...emptyModule("b"), files: base.files.slice(6, 9).map((file) => file.id) },
      ],
      layers: [
        {
          id: "layer:x",
          name: "x",
          origin: "declared",
          rank: 0,
          files: base.files.slice(0, 5).map((file) => file.id),
          dependencies: [],
          dependents: [],
        },
      ],
      components: [],
    });
    const copy = shuffledModel(withUnits, 11).document;
    expect(canonicalizeDocument(copy as ArchitectureDocument)).toEqual(
      canonicalizeDocument(withUnits.document as ArchitectureDocument),
    );
    const partial = ArchitectureModel.from({
      directories: [],
      packages: [],
      files: base.files,
      symbols: [],
      externals: [],
      edges: base.edges,
    });
    const shuffledPartial = shuffledModel(partial, 5).document;
    expect(shuffledPartial).not.toHaveProperty("entryPoints");
    expect(shuffledPartial).not.toHaveProperty("modules");
    expect(shuffledPartial.files).toHaveLength(base.files.length);
  });
});

function emptyModule(name: string) {
  return {
    id: `mod:${name}` as const,
    name,
    origin: "declared" as const,
    packages: [],
    files: [],
    components: [],
    entryPoints: [],
    publicApi: [],
    dependencies: [],
    dependents: [],
  };
}

// ─── Prototype graphs ───────────────────────────────────────────────────────────────────────────────

/** A pair in the format `m5/fixture_graph.py` prints: `source -> target run|type kinds`. */
function pythonLines(graph: PrototypeGraph): string[] {
  return [...graph.pairs]
    .sort((a, b) => compareStrings(a.source, b.source) || compareStrings(a.target, b.target))
    .map(
      (pair) =>
        `${pair.source} -> ${pair.target} ${pair.typeOnly ? "type" : "run"} ${[...pair.kinds.keys()].join("+")}`,
    );
}

/**
 * Pinned from a Python run of `m5/fixture_graph.py` (`load()`, CPython 3.14, 2026-10-08) over the fixtures:
 * the first 16 hex digits of SHA-256 of the sorted pairs, the files with their roles, the entry points and
 * the package names, each block joined by newlines and the blocks by `\n--\n`.
 */
const PYTHON_DIGESTS: Readonly<Record<string, string>> = {
  "ambiguous-boundaries": "bddfa6d8fd624c79",
  "circular-dependencies": "aa4260b5c90b3c54",
  "clean-architecture": "a2e5874a3549a03e",
  "dependency-violations": "0a8eaac385bd203f",
  "express-app": "411de5f5428ab49a",
  "fastify-app": "6a80073562088b54",
  "high-fan-in": "2f55eed6ab1857b6",
  "high-fan-out": "209c82e9a561241c",
  "javascript-commonjs": "0270683fba843027",
  "layered-architecture": "6d4598329f924bb3",
  monorepo: "905c7f8b68c003c5",
  "nestjs-app": "d1e2a2588015ae09",
  "simple-dependencies": "97be6111ba3ec837",
  "tangled-architecture": "5cc3869c24d863e4",
  "typescript-features": "224adcff09e5f4fa",
};

/** `fixture_graph.py` on layered-architecture (pinned from the Python run). */
const LAYERED_PAIRS = [
  "src/controllers/order.controller.ts -> src/services/order.service.ts run imports",
  "src/controllers/order.controller.ts -> src/shared/http.ts run imports",
  "src/controllers/payment.controller.ts -> src/services/payment.service.ts run imports",
  "src/controllers/payment.controller.ts -> src/shared/http.ts run imports",
  "src/controllers/user.controller.ts -> src/services/user.service.ts run imports",
  "src/controllers/user.controller.ts -> src/shared/http.ts run imports",
  "src/main.ts -> src/controllers/order.controller.ts run imports",
  "src/main.ts -> src/controllers/payment.controller.ts run imports",
  "src/main.ts -> src/controllers/user.controller.ts run imports",
  "src/main.ts -> src/repositories/order.repository.ts run imports",
  "src/main.ts -> src/repositories/payment.repository.ts run imports",
  "src/main.ts -> src/repositories/user.repository.ts run imports",
  "src/main.ts -> src/services/order.service.ts run imports",
  "src/main.ts -> src/services/payment-gateway.ts run imports",
  "src/main.ts -> src/services/payment.service.ts run imports",
  "src/main.ts -> src/services/user.service.ts run imports",
  "src/main.ts -> src/shared/config.ts run imports",
  "src/main.ts -> src/shared/database.ts run imports",
  "src/main.ts -> src/shared/http.ts run imports",
  "src/main.ts -> src/shared/logger.ts run imports",
  "src/models/order.ts -> src/models/order-line.ts run imports",
  "src/models/order.ts -> src/models/user.ts type imports",
  "src/models/payment.ts -> src/models/user.ts type imports",
  "src/repositories/order.repository.ts -> src/models/order-line.ts type imports",
  "src/repositories/order.repository.ts -> src/models/order.ts type imports",
  "src/repositories/order.repository.ts -> src/shared/database.ts type imports",
  "src/repositories/payment.repository.ts -> src/models/payment.ts type imports",
  "src/repositories/payment.repository.ts -> src/shared/database.ts type imports",
  "src/repositories/user.repository.ts -> src/models/user.ts type imports",
  "src/repositories/user.repository.ts -> src/shared/database.ts type imports",
  "src/services/order.service.ts -> src/models/order-line.ts run imports",
  "src/services/order.service.ts -> src/models/order.ts run imports",
  "src/services/order.service.ts -> src/repositories/order.repository.ts run imports",
  "src/services/order.service.ts -> src/services/payment.service.ts run imports",
  "src/services/order.service.ts -> src/services/user.service.ts run imports",
  "src/services/order.service.ts -> src/shared/errors.ts run imports",
  "src/services/payment-gateway.ts -> src/shared/config.ts type imports",
  "src/services/payment-gateway.ts -> src/shared/errors.ts run imports",
  "src/services/payment.service.ts -> src/models/payment.ts run imports",
  "src/services/payment.service.ts -> src/repositories/payment.repository.ts run imports",
  "src/services/payment.service.ts -> src/services/payment-gateway.ts run imports",
  "src/services/payment.service.ts -> src/services/user.service.ts run imports",
  "src/services/payment.service.ts -> src/shared/errors.ts run imports",
  "src/services/payment.service.ts -> src/shared/logger.ts type imports",
  "src/services/user.service.ts -> src/models/user.ts run imports",
  "src/services/user.service.ts -> src/repositories/user.repository.ts run imports",
  "src/services/user.service.ts -> src/shared/errors.ts run imports",
  "src/services/user.service.ts -> src/shared/logger.ts type imports",
  "src/shared/http.ts -> src/shared/errors.ts run imports",
  "src/shared/http.ts -> src/shared/logger.ts type imports",
  "src/shared/logger.ts -> src/shared/config.ts type imports",
];

/** `fixture_graph.py` on clean-architecture (pinned from the Python run), barrel resolutions included. */
const CLEAN_PAIRS = [
  "src/application/borrow-book.ts -> src/application/dto.ts run imports",
  "src/application/borrow-book.ts -> src/domain/index.ts run imports",
  "src/application/borrow-book.ts -> src/domain/model/errors.ts run via-re-export",
  "src/application/borrow-book.ts -> src/domain/ports/book-repository.ts type via-re-export",
  "src/application/borrow-book.ts -> src/domain/ports/clock.ts type via-re-export",
  "src/application/borrow-book.ts -> src/domain/ports/loan-repository.ts type via-re-export",
  "src/application/borrow-book.ts -> src/domain/ports/member-repository.ts type via-re-export",
  "src/application/borrow-book.ts -> src/domain/ports/notifier.ts type via-re-export",
  "src/application/dto.ts -> src/domain/index.ts type imports",
  "src/application/return-book.ts -> src/application/dto.ts run imports",
  "src/application/return-book.ts -> src/domain/index.ts run imports",
  "src/application/return-book.ts -> src/domain/model/errors.ts run via-re-export",
  "src/application/return-book.ts -> src/domain/ports/book-repository.ts type via-re-export",
  "src/application/return-book.ts -> src/domain/ports/clock.ts type via-re-export",
  "src/application/return-book.ts -> src/domain/ports/loan-repository.ts type via-re-export",
  "src/application/send-overdue-reminders.ts -> src/domain/index.ts type imports",
  "src/application/send-overdue-reminders.ts -> src/domain/ports/clock.ts type via-re-export",
  "src/application/send-overdue-reminders.ts -> src/domain/ports/loan-repository.ts type via-re-export",
  "src/application/send-overdue-reminders.ts -> src/domain/ports/member-repository.ts type via-re-export",
  "src/application/send-overdue-reminders.ts -> src/domain/ports/notifier.ts type via-re-export",
  "src/domain/index.ts -> src/domain/model/book.ts run re-exports",
  "src/domain/index.ts -> src/domain/model/errors.ts run re-exports",
  "src/domain/index.ts -> src/domain/model/loan.ts run re-exports",
  "src/domain/index.ts -> src/domain/model/member.ts run re-exports",
  "src/domain/index.ts -> src/domain/ports/book-repository.ts run re-exports",
  "src/domain/index.ts -> src/domain/ports/clock.ts run re-exports",
  "src/domain/index.ts -> src/domain/ports/loan-repository.ts run re-exports",
  "src/domain/index.ts -> src/domain/ports/member-repository.ts run re-exports",
  "src/domain/index.ts -> src/domain/ports/notifier.ts run re-exports",
  "src/domain/model/book.ts -> src/domain/model/errors.ts run imports",
  "src/domain/model/loan.ts -> src/domain/model/book.ts type imports",
  "src/domain/model/loan.ts -> src/domain/model/errors.ts run imports",
  "src/domain/model/loan.ts -> src/domain/model/member.ts type imports",
  "src/domain/model/member.ts -> src/domain/model/errors.ts run imports",
  "src/domain/ports/book-repository.ts -> src/domain/model/book.ts type imports",
  "src/domain/ports/loan-repository.ts -> src/domain/model/loan.ts type imports",
  "src/domain/ports/loan-repository.ts -> src/domain/model/member.ts type imports",
  "src/domain/ports/member-repository.ts -> src/domain/model/member.ts type imports",
  "src/domain/ports/notifier.ts -> src/domain/model/loan.ts type imports",
  "src/domain/ports/notifier.ts -> src/domain/model/member.ts type imports",
  "src/infrastructure/notifications/smtp-notifier.ts -> src/domain/model/loan.ts type imports",
  "src/infrastructure/notifications/smtp-notifier.ts -> src/domain/model/member.ts type imports",
  "src/infrastructure/notifications/smtp-notifier.ts -> src/domain/ports/notifier.ts type imports",
  "src/infrastructure/persistence/sql-book-repository.ts -> src/domain/model/book.ts run imports",
  "src/infrastructure/persistence/sql-book-repository.ts -> src/domain/ports/book-repository.ts type imports",
  "src/infrastructure/persistence/sql-book-repository.ts -> src/infrastructure/persistence/pool.ts type imports",
  "src/infrastructure/persistence/sql-loan-repository.ts -> src/domain/model/loan.ts run imports",
  "src/infrastructure/persistence/sql-loan-repository.ts -> src/domain/model/member.ts type imports",
  "src/infrastructure/persistence/sql-loan-repository.ts -> src/domain/ports/loan-repository.ts type imports",
  "src/infrastructure/persistence/sql-loan-repository.ts -> src/infrastructure/persistence/pool.ts type imports",
  "src/infrastructure/persistence/sql-member-repository.ts -> src/domain/index.ts run imports",
  "src/infrastructure/persistence/sql-member-repository.ts -> src/domain/ports/member-repository.ts type via-re-export",
  "src/infrastructure/persistence/sql-member-repository.ts -> src/infrastructure/persistence/pool.ts type imports",
  "src/infrastructure/system-clock.ts -> src/domain/ports/clock.ts type imports",
  "src/main.ts -> src/application/borrow-book.ts run imports",
  "src/main.ts -> src/application/return-book.ts run imports",
  "src/main.ts -> src/application/send-overdue-reminders.ts run imports",
  "src/main.ts -> src/infrastructure/notifications/smtp-notifier.ts run imports",
  "src/main.ts -> src/infrastructure/persistence/pool.ts run imports",
  "src/main.ts -> src/infrastructure/persistence/sql-book-repository.ts run imports",
  "src/main.ts -> src/infrastructure/persistence/sql-loan-repository.ts run imports",
  "src/main.ts -> src/infrastructure/persistence/sql-member-repository.ts run imports",
  "src/main.ts -> src/infrastructure/system-clock.ts run imports",
  "src/main.ts -> src/presentation/http/loan-routes.ts run imports",
  "src/main.ts -> src/presentation/http/server.ts run imports",
  "src/presentation/http/error-mapper.ts -> src/domain/model/errors.ts run imports",
  "src/presentation/http/error-mapper.ts -> src/presentation/http/http-types.ts run imports",
  "src/presentation/http/loan-routes.ts -> src/application/borrow-book.ts run imports",
  "src/presentation/http/loan-routes.ts -> src/application/return-book.ts run imports",
  "src/presentation/http/loan-routes.ts -> src/presentation/http/error-mapper.ts run imports",
  "src/presentation/http/loan-routes.ts -> src/presentation/http/http-types.ts run imports",
  "src/presentation/http/server.ts -> src/presentation/http/http-types.ts run imports",
];

describe("prototypeRole (classify)", () => {
  it("classifies as the prototype does", () => {
    const cases: [string, string][] = [
      ["package.json", "configuration"],
      ["packages/api/tsconfig.json", "configuration"],
      [".gitignore", "configuration"],
      ["katedrala.config.yaml", "configuration"],
      ["pnpm-workspace.yaml", "configuration"],
      ["x.config.json", "configuration"],
      ["src/globals.d.ts", "declaration"],
      ["src/data.json", "data"],
      ["README.md", "other"],
      ["src/a.test.ts", "test"],
      ["src/a.spec.mjs", "test"],
      ["src/a.test.tsx", "test"],
      ["test/orders.ts", "test"],
      ["packages/x/test/a.ts", "test"],
      ["src/__tests__/a.js", "test"],
      ["src/a.ts", "source"],
      ["src/lib/html.cjs", "source"],
      ["src/views/layout.jsx", "source"],
      ["src/testing/a.ts", "source"],
      ["vite.config.ts", "source"],
    ];
    for (const [path, role] of cases) expect(prototypeRole(path), path).toBe(role);
  });
});

describe("prototypeGraph: a faithful port of m5/fixture_graph.py (review #8)", () => {
  it("lists the fixtures", () => {
    expect(prototypeFixtureNames()).toEqual(Object.keys(PYTHON_DIGESTS).sort(compareStrings));
  });

  it("reproduces the prototype's pairs and entry points on layered-architecture", () => {
    const graph = prototypeGraph("layered-architecture");
    expect(pythonLines(graph)).toEqual(LAYERED_PAIRS);
    expect(graph.entryPoints).toEqual(["src/main.ts"]);
    expect(graph.packageNames).toEqual(new Map([["", "shop-backend"]]));
  });

  it("reproduces the prototype's pairs and entry points on clean-architecture, barrels resolved", () => {
    const graph = prototypeGraph("clean-architecture");
    expect(pythonLines(graph)).toEqual(CLEAN_PAIRS);
    expect(graph.entryPoints).toEqual(["src/main.ts"]);
  });

  it("reproduces the prototype on every fixture", () => {
    for (const name of prototypeFixtureNames()) {
      const graph = prototypeGraph(name);
      const text = [
        pythonLines(graph).join("\n"),
        [...graph.files].map(([path, role]) => `${path} ${role}`).join("\n"),
        graph.entryPoints.join("\n"),
        [...graph.packageNames]
          .sort(([a], [b]) => compareStrings(a, b))
          .map(([path, packageName]) => `${path}=${packageName}`)
          .join("\n"),
      ].join("\n--\n");
      expect(sha256Hex(text).slice(0, 16), name).toBe(PYTHON_DIGESTS[name]);
    }
  });

  it("derives entry points from main, bin and scripts with the dist and extension mapping", () => {
    expect(prototypeGraph("monorepo").entryPoints).toEqual([
      "packages/api/src/server.ts",
      "packages/core/src/index.ts",
      "packages/shared/src/index.ts",
    ]);
    expect(prototypeGraph("typescript-features").entryPoints).toEqual([
      "src/cli.ts",
      "src/index.ts",
    ]);
    // `node dist/main` has no extension, so the prototype finds no entry point.
    expect(prototypeGraph("nestjs-app").entryPoints).toEqual([]);
    expect(prototypeGraph("javascript-commonjs").entryPoints).toEqual(["src/server.js"]);
    const entries = prototypeGraph("typescript-features").entryPointEntries;
    expect(entries).toContainEqual({
      entity: "file:src/cli.ts",
      kind: "bin",
      source: "package.json#bin.shop-core",
      package: "pkg:npm:",
      mappedFrom: "./dist/cli.js",
    });
    expect(entries).toContainEqual({
      entity: "file:src/index.ts",
      kind: "script",
      source: "package.json#scripts.build",
      package: "pkg:npm:",
    });
  });

  it("names packages from their manifests", () => {
    expect([...prototypeGraph("monorepo").packageNames]).toEqual([
      ["", "acme-monorepo"],
      ["packages/api", "@acme/api"],
      ["packages/core", "@acme/core"],
      ["packages/shared", "@acme/shared"],
      ["packages/web", "@acme/web"],
    ]);
  });

  it("is memoized per fixture and fails for an unknown fixture", () => {
    expect(prototypeGraph("monorepo")).toBe(prototypeGraph("monorepo"));
    expect(() => prototypeGraph("no-such-fixture")).toThrow();
  });
});

describe("prototypeDocument and prototypeModel", () => {
  it("are canonical, schema-valid documents without symbols", () => {
    for (const name of prototypeFixtureNames()) {
      const document = prototypeDocument(name);
      expect(schemaErrors(document), name).toEqual([]);
      expect(canonicalizeDocument(document), name).toEqual(document);
      expect(document.symbols).toEqual([]);
      expect(document.detail).toEqual({
        symbols: false,
        relationships: "file",
        symbolMetrics: false,
      });
      expect(document.repository.name).toBe(name);
    }
  });

  it("make one IR edge per pair and kind, barrel resolutions as `uses`", () => {
    expect(PROTOTYPE_EDGE_KINDS).toEqual({
      imports: "imports",
      "re-exports": "re-exports",
      "via-re-export": "uses",
    });
    for (const name of prototypeFixtureNames()) {
      const graph = prototypeGraph(name);
      const expected = graph.pairs
        .flatMap((pair) =>
          [...pair.kinds].map(
            ([kind, typeOnly]) =>
              `${PROTOTYPE_EDGE_KINDS[kind]} ${pair.source} ${pair.target} ${typeOnly}`,
          ),
        )
        .sort(compareStrings);
      const edges = prototypeDocument(name).edges.map(
        (edge) => `${edge.kind} ${edge.source.slice(5)} ${edge.target.slice(5)} ${edge.typeOnly}`,
      );
      expect(edges.sort(compareStrings), name).toEqual(expected);
    }
    const clean = prototypeDocument("clean-architecture").edges;
    expect(clean.every((edge) => edge.confidence === 1 && edge.observations === 1)).toBe(true);
    expect(clean.filter((edge) => edge.kind === "uses")).toHaveLength(15);
  });

  it("keep per-kind type-only flags of pairs formed by several kinds", () => {
    const pairs = prototypeGraph("circular-dependencies").pairs.filter(
      (pair) => pair.kinds.size > 1,
    );
    expect(pairs.length).toBeGreaterThan(0);
    const edges = prototypeDocument("circular-dependencies").edges;
    for (const pair of pairs) {
      for (const [kind, typeOnly] of pair.kinds) {
        const edge = edges.find(
          (candidate) =>
            candidate.kind === PROTOTYPE_EDGE_KINDS[kind] &&
            candidate.source === fileId(pair.source) &&
            candidate.target === fileId(pair.target),
        );
        expect(edge?.typeOnly).toBe(typeOnly);
      }
      expect(pair.typeOnly).toBe([...pair.kinds.values()].every(Boolean));
    }
  });

  it("assign files to packages and list the entry points", () => {
    const document = prototypeDocument("monorepo");
    const packageOf = new Map(document.files.map((file) => [file.path, file.package]));
    expect(packageOf.get("packages/api/src/routes.ts")).toBe("pkg:npm:packages/api");
    expect(packageOf.get("tsconfig.base.json")).toBe("pkg:npm:");
    expect(document.packages.map((pkg) => pkg.name)).toEqual([
      "acme-monorepo",
      "@acme/api",
      "@acme/core",
      "@acme/shared",
      "@acme/web",
    ]);
    expect([...new Set(document.entryPoints.map((entry) => entry.entity))]).toEqual([
      fileId("packages/api/src/server.ts"),
      fileId("packages/core/src/index.ts"),
      fileId("packages/shared/src/index.ts"),
    ]);
    expect(
      document.entryPoints.find((entry) => entry.entity === fileId("packages/core/src/index.ts"))
        ?.package,
    ).toBe(packageId("npm", "packages/core"));
  });

  it("build a new model per call over the same graph", () => {
    const first = prototypeModel("layered-architecture");
    const second = prototypeModel("layered-architecture");
    expect(first).not.toBe(second);
    expect(first.document).toEqual(second.document);
    expect(first.index.file(fileId("src/main.ts"))?.role).toBe("source");
  });
});
