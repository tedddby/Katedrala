/**
 * End-to-end checks of the inference stage on every fixture (milestone 5 plan 7.1, 7.3, 7.4):
 *
 * - the per-fixture requirements and assertions of plan 7.3, taken from the linker-graph replay
 *   (`handoff/probe2/replay.out.txt`) and corrected where U1's re-run found the plan text wrong;
 * - golden architecture sections (`golden/<fixture>.json`: components, modules, layers and the roles of the
 *   files that have some), rewritten by `KATEDRALA_UPDATE_GOLDEN=1 pnpm test tests/fixtures`; any other
 *   difference fails with a diff, and a golden change must be explained (CONTRIBUTING.md, "Fixtures");
 * - strict-schema validity, identical output over two runs, and the structural sections exactly as
 *   `analyzeStructure` gives them (plan 7.1);
 * - bounded perturbation (plan 7.1, review #28): three seeded kinds of edge perturbation, each followed by
 *   inference on a rebuilt model; no case may change the module of more than two files. With
 *   `KATEDRALA_REPORT=1` the measurements, and unconstrained Louvain through the same harness, are written to
 *   standard output (docs/ALGORITHMS.md publishes them).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  analyzeStructure,
  metricsProjectionOptions,
  resolveDeclarations,
  type ArchitectureAnalysis,
  type ArchitectureSections,
  type StructureDocument,
} from "@katedrala/engine";
import { UndirectedGraph, createRandom, louvain } from "@katedrala/graph";
import { inferArchitecture, type InferenceInput } from "@katedrala/inference";
import {
  canonicalizeDocument,
  compareEdges,
  compareStrings,
  edgeId,
  emptyDocument,
  fileId,
  serializeDocument,
  type Diagnostic,
  type EdgeEntity,
  type EntityId,
  type Evidence,
  type LayerEntity,
  type ModuleEntity,
  type RoleEntry,
} from "@katedrala/ir";
import { ArchitectureModel } from "@katedrala/model";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FIXTURE_NAMES, analyzeFixture, fixtureSource } from "./support.js";

const UPDATE_GOLDEN = process.env.KATEDRALA_UPDATE_GOLDEN === "1";
const REPORT = process.env.KATEDRALA_REPORT === "1";
const GOLDEN = join(import.meta.dirname, "golden");

// ─── Reading the architecture sections ────────────────────────────────────────────────────────────────

/** A path from a file identifier. */
const pathOf = (id: string): string => id.replace(/^file:/, "");
const paths = (ids: readonly string[]): string[] => ids.map(pathOf);

/** The kind signals of inferred modules (D-48). */
const KIND_SIGNALS: ReadonlySet<string> = new Set([
  "feature-directory",
  "layer-directory",
  "shared-directory",
  "root-files",
  "file-stem",
  "split-piece",
]);

function moduleWithId(document: ArchitectureSections, id: string): ModuleEntity {
  const module = document.modules.find((candidate) => candidate.id === id);
  if (module === undefined) throw new Error(`No module ${id}`);
  return module;
}

function layerWithName(document: ArchitectureSections, name: string): LayerEntity {
  const layer = document.layers.find((candidate) => candidate.name === name);
  if (layer === undefined) throw new Error(`No layer ${name}`);
  return layer;
}

/** The D-48 kind signal of an inferred module, `declared` for a declared one. */
function kindOf(module: ModuleEntity): string {
  if (module.origin === "declared") return "declared";
  const kinds = (module.inference?.evidence ?? [])
    .map((evidence) => evidence.signal)
    .filter((signal) => KIND_SIGNALS.has(signal));
  expect(kinds, module.id).toHaveLength(1);
  return kinds[0]!;
}

/** `[id, kind]` of every module, in id order. */
const moduleKinds = (document: ArchitectureSections): [string, string][] =>
  document.modules.map((module) => [module.id, kindOf(module)]);

function evidenceOf(module: ModuleEntity | LayerEntity, signal: string): Evidence[] {
  return (module.inference?.evidence ?? []).filter((evidence) => evidence.signal === signal);
}

function weightedValue(module: ModuleEntity | LayerEntity, signal: string): number | undefined {
  const [evidence] = evidenceOf(module, signal);
  expect(evidence?.weight, `${module.id} ${signal} is a weighted signal`).toBeDefined();
  return evidence?.value;
}

/** The files of a structural class over all modules (D-49), sorted. */
function classMembers(
  document: ArchitectureSections,
  signal: "composition-roots" | "utility-files" | "facade-files",
): string[] {
  return [
    ...new Set(
      document.modules.flatMap((module) =>
        evidenceOf(module, signal).flatMap((evidence) => paths(evidence.entities ?? [])),
      ),
    ),
  ].sort(compareStrings);
}

/** The clause a class description gives a file: "`src/app.ts` (shape rule: ...)" → "shape rule: ...". */
function classClause(
  document: ArchitectureSections,
  signal: "composition-roots" | "utility-files" | "facade-files",
  path: string,
): string | undefined {
  for (const module of document.modules) {
    for (const evidence of evidenceOf(module, signal)) {
      const start = evidence.description.indexOf(`\`${path}\` (`);
      if (start < 0) continue;
      const from = start + path.length + 4;
      return evidence.description.slice(from, evidence.description.indexOf(")", from));
    }
  }
  return undefined;
}

const STYLES: readonly [string, string][] = [
  ["organized by layer and by feature (mixed)", "mixed"],
  ["organized neither by feature nor by layer", "none"],
  ["organized by layer", "layer"],
  ["organized by feature", "feature"],
];

/** The organization style P2 found for a split directory (`organization-style` evidence, D-26). */
function styleOf(
  document: ArchitectureSections,
  directory: string,
): { style: string; coverage: number | undefined; description: string } {
  for (const module of document.modules) {
    for (const evidence of evidenceOf(module, "organization-style")) {
      if (!evidence.description.includes(`\`${directory}\` has`)) continue;
      const style = STYLES.find(([phrase]) => evidence.description.includes(`so it is ${phrase}`));
      expect(style, evidence.description).toBeDefined();
      return { style: style![1], coverage: evidence.value, description: evidence.description };
    }
  }
  throw new Error(`No organization-style evidence for ${directory}`);
}

/** Every relocation: the file, the module it was reassigned to and the evidence (D-36). */
function relocationsOf(
  document: ArchitectureSections,
): { file: string; to: string; description: string; value: number | undefined }[] {
  return document.modules
    .flatMap((module) =>
      evidenceOf(module, "relocated-files").flatMap((evidence) =>
        paths(evidence.entities ?? []).map((file) => ({
          file,
          to: module.id,
          description: evidence.description,
          value: evidence.value,
        })),
      ),
    )
    .sort((a, b) => compareStrings(a.file, b.file));
}

/** The module of every file that belongs to one. */
function moduleOfFile(modules: readonly ModuleEntity[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const module of modules) for (const file of module.files) result.set(file, module.id);
  return result;
}

const ranksOf = (document: ArchitectureSections): Record<string, number> =>
  Object.fromEntries(document.layers.map((layer) => [layer.name, layer.rank]));

/** Conventional arcs `[outer, inner]` from the `conventional-order` evidence of the inner layers (D-53). */
function conventionalArcs(document: ArchitectureSections): [string, string][] {
  const arcs: [string, string][] = [];
  for (const layer of document.layers) {
    for (const evidence of evidenceOf(layer, "conventional-order")) {
      const after = /^Placed after `([^`]+)`/.exec(evidence.description);
      if (after !== null) arcs.push([after[1]!, layer.name]);
    }
  }
  return arcs.sort((a, b) => compareStrings(a[0], b[0]) || compareStrings(a[1], b[1]));
}

const dependencyIds = (unit: ModuleEntity | LayerEntity): string[] =>
  unit.dependencies.map((dependency) => dependency.entity);

/** Role entries of a file as `[role, source]`. */
function rolesOf(document: ArchitectureSections, path: string): [string, string][] {
  const file = document.files.find((candidate) => candidate.path === path);
  return (file?.roles ?? []).map((entry) => [entry.role, entry.source]);
}

const round3 = (value: number | undefined): number | undefined =>
  value === undefined ? undefined : Math.round(value * 1000) / 1000;

const confidenceOf = (unit: ModuleEntity | LayerEntity): number | undefined =>
  round3(unit.inference?.confidence);

// ─── Plan 7.3: requirements and assertions per fixture ────────────────────────────────────────────────

type Requirement = (document: ArchitectureSections, analysis: ArchitectureAnalysis) => void;

const REQUIREMENTS: Readonly<Record<string, Requirement>> = {
  "simple-dependencies": (document) => {
    // D-26: one layer child and no feature child.
    expect(styleOf(document, "src").style).toBe("none");
    expect(moduleKinds(document)).toEqual([
      ["mod:src", "root-files"],
      ["mod:src/services", "layer-directory"],
      ["mod:src/utils", "shared-directory"],
    ]);
    expect(paths(moduleWithId(document, "mod:src").files)).toEqual(["src/app.ts", "src/index.ts"]);
    expect(classClause(document, "composition-roots", "src/app.ts")).toMatch(/^shape rule: /);
    expect(classClause(document, "composition-roots", "src/index.ts")).toMatch(/^entry-point rule: /);
    // Only `service` survives pruning, and one layer is no layering.
    expect(document.layers).toEqual([]);
  },

  "circular-dependencies": (document) => {
    // `api` is the only layer child.
    expect(styleOf(document, "src").style).toBe("feature");
    // D-66: the package barrel is worded as a declared entry point and barrel, not as wiring code.
    expect(classClause(document, "composition-roots", "src/index.ts")).toBe(
      "entry-point rule: a declared entry point and barrel that nothing in its package depends on",
    );
    expect(classClause(document, "composition-roots", "src/demo/seed.ts")).toMatch(/^shape rule: /);
    expect(classMembers(document, "utility-files")).toContain("src/shared/id.ts");
    expect(relocationsOf(document)).toEqual([]);
    expect(document.layers).toEqual([]);
  },

  "layered-architecture": (document) => {
    expect(document.modules.map((module) => module.id)).toEqual([
      "mod:src",
      "mod:src#order",
      "mod:src#payment",
      "mod:src#user",
      "mod:src/shared",
    ]);
    // The file-name stems cover 14 of 14 files below the layer directories.
    const style = styleOf(document, "src");
    expect(style.style).toBe("layer");
    expect(style.coverage).toBe(1);
    expect(style.description).toContain("cover 14 of 14 files");
    expect(classMembers(document, "composition-roots")).toEqual(["src/main.ts"]);
    expect(classClause(document, "composition-roots", "src/main.ts")).toMatch(
      /^entry-point rule: /,
    );
    expect(classMembers(document, "utility-files")).toEqual([
      "src/shared/database.ts",
      "src/shared/errors.ts",
      "src/shared/http.ts",
      "src/shared/logger.ts",
    ]);
    expect(relocationsOf(document)).toEqual([]);
    // §4.6, reproduced by the replay on the linker graph.
    expect(
      document.layers.map((layer) => [layer.name, layer.rank, confidenceOf(layer)]),
    ).toEqual([
      ["controller", 0, 0.939],
      ["service", 1, 0.925],
      ["repository", 2, 0.939],
      ["model", 3, 0.862],
    ]);
    for (const layer of document.layers) expect(evidenceOf(layer, "upward-dependencies")).toEqual([]);
    const layered = new Set(document.layers.flatMap((layer) => paths(layer.files)));
    for (const path of ["src/main.ts", "src/shared/config.ts", "src/shared/logger.ts"]) {
      expect(layered.has(path), path).toBe(false);
    }
  },

  "clean-architecture": (document) => {
    // No stem is kept: `loan` stays two components (the design's connectivity example).
    const style = styleOf(document, "src");
    expect(style.style).toBe("layer");
    expect(style.coverage).toBe(0);
    expect(moduleKinds(document)).toEqual([
      ["mod:src", "root-files"],
      ["mod:src/application", "layer-directory"],
      ["mod:src/domain", "layer-directory"],
      ["mod:src/infrastructure", "layer-directory"],
      ["mod:src/presentation", "layer-directory"],
    ]);
    expect(moduleWithId(document, "mod:src").name).toBe("library-lending");
    const domain = moduleWithId(document, "mod:src/domain");
    expect(paths(domain.entryPoints)).toEqual(["src/domain/index.ts"]);
    // D-63: the public API is import-based; the port behind the barrel is reached through it only.
    expect(paths(domain.publicApi)).toContain("src/domain/index.ts");
    expect(paths(domain.publicApi)).not.toContain("src/domain/ports/member-repository.ts");
    expect(
      document.layers.map((layer) => [layer.name, layer.rank, confidenceOf(layer)]),
    ).toEqual([
      ["infrastructure", 0, 0.737],
      ["presentation", 0, 0.795],
      ["application", 1, 0.795],
      ["domain", 2, 0.878],
    ]);
    expect(layerWithName(document, "infrastructure").files).toHaveLength(6);
    // Review #26: no upward arc.
    for (const layer of document.layers) expect(evidenceOf(layer, "upward-dependencies")).toEqual([]);
    // §2.4: the component tree, with the collapsed chain named `presentation/http`.
    expect(
      document.components.map((component) => [
        component.id,
        component.name,
        component.files.length,
        component.totals.files,
      ]),
    ).toEqual([
      ["cmp:", "library-lending", 0, 25],
      ["cmp:src", "src", 1, 25],
      ["cmp:src/application", "application", 4, 4],
      ["cmp:src/domain", "domain", 1, 10],
      ["cmp:src/domain/model", "model", 4, 4],
      ["cmp:src/domain/ports", "ports", 5, 5],
      ["cmp:src/infrastructure", "infrastructure", 1, 6],
      ["cmp:src/infrastructure/notifications", "notifications", 1, 1],
      ["cmp:src/infrastructure/persistence", "persistence", 4, 4],
      ["cmp:src/presentation/http", "presentation/http", 4, 4],
    ]);
  },

  monorepo: (document) => {
    // §2.4, exactly: ids, kinds, names, direct and total file counts.
    expect(
      document.components.map((component) => [
        component.id,
        component.kind,
        component.name,
        component.files.length,
        component.totals.files,
      ]),
    ).toEqual([
      ["cmp:", "package", "acme-monorepo", 0, 17],
      ["cmp:packages", "directory", "packages", 0, 17],
      ["cmp:packages/api", "package", "@acme/api", 0, 4],
      ["cmp:packages/api/src", "directory", "src", 2, 4],
      ["cmp:packages/api/src/handlers", "directory", "handlers", 2, 2],
      ["cmp:packages/core", "package", "@acme/core", 0, 5],
      ["cmp:packages/core/src", "directory", "src", 1, 5],
      ["cmp:packages/core/src/catalog", "directory", "catalog", 2, 2],
      ["cmp:packages/core/src/orders", "directory", "orders", 2, 2],
      ["cmp:packages/shared", "package", "@acme/shared", 0, 4],
      ["cmp:packages/shared/src", "directory", "src", 4, 4],
      ["cmp:packages/web", "package", "@acme/web", 0, 4],
      ["cmp:packages/web/src", "directory", "src", 2, 4],
      ["cmp:packages/web/src/components", "directory", "components", 2, 2],
    ]);
    expect(
      document.modules.map((module) => [module.id, module.name, paths(module.files)]),
    ).toEqual([
      ["mod:packages/api/src", "api", ["packages/api/src/routes.ts", "packages/api/src/server.ts"]],
      [
        "mod:packages/api/src/handlers",
        "handlers",
        ["packages/api/src/handlers/orders.ts", "packages/api/src/handlers/products.ts"],
      ],
      ["mod:packages/core/src", "core", ["packages/core/src/index.ts"]],
      // D-74: `catalog/product.ts` follows 2 of its 3 dependents, then `catalog/catalog.ts`, left alone.
      [
        "mod:packages/core/src/orders",
        "orders",
        [
          "packages/core/src/catalog/catalog.ts",
          "packages/core/src/catalog/product.ts",
          "packages/core/src/orders/order-service.ts",
          "packages/core/src/orders/order.ts",
        ],
      ],
      [
        "mod:packages/shared/src",
        "shared",
        [
          "packages/shared/src/index.ts",
          "packages/shared/src/money.ts",
          "packages/shared/src/result.ts",
          "packages/shared/src/strings.ts",
        ],
      ],
      ["mod:packages/web/src", "web", ["packages/web/src/App.tsx", "packages/web/src/main.tsx"]],
      [
        "mod:packages/web/src/components",
        "components",
        ["packages/web/src/components/PriceTag.tsx", "packages/web/src/components/ProductCard.tsx"],
      ],
    ]);
    // The group `packages/api/src` has one layer child.
    expect(styleOf(document, "packages/api/src").style).toBe("none");
    // README: "inferred modules never span packages".
    for (const module of document.modules) expect(module.packages, module.id).toHaveLength(1);
    // D-55: two layers in different packages, unordered, with low confidence.
    expect(document.layers.map((layer) => [layer.name, layer.rank])).toEqual([
      ["component", 0],
      ["handler", 0],
    ]);
    for (const layer of document.layers) expect(layer.inference?.confidence).toBeLessThan(0.4);
  },

  "tangled-architecture": (document) => {
    expect(moduleKinds(document)).toEqual([
      ["mod:src", "root-files"],
      ["mod:src/cart", "feature-directory"],
      ["mod:src/catalog", "feature-directory"],
      ["mod:src/checkout", "feature-directory"],
      ["mod:src/customers", "feature-directory"],
      ["mod:src/inventory", "feature-directory"],
      ["mod:src/lib", "shared-directory"],
    ]);
    expect(relocationsOf(document)).toEqual([]);
    // (v): the linker's `calls` and `uses` edges add dependents in other features.
    expect(classMembers(document, "utility-files")).toEqual([
      "src/catalog/product-service.ts",
      "src/checkout/order-history.ts",
      "src/customers/customer.ts",
      "src/customers/loyalty.ts",
      "src/lib/db.ts",
      "src/lib/events.ts",
      "src/lib/money.ts",
    ]);
    expect(classMembers(document, "facade-files")).toEqual(["src/catalog/index.ts"]);
    // README: "infer no clean layering"; the tangle shows in the confidence.
    for (const module of document.modules.filter((m) => kindOf(m) === "feature-directory")) {
      expect(module.inference?.confidence, module.id).toBeLessThan(0.75);
    }
    expect(document.layers).toEqual([]);
  },

  "dependency-violations": (document) => {
    expect(
      document.modules
        .filter((module) => module.origin === "declared")
        .map((module) => [module.id, paths(module.files)]),
    ).toEqual([
      ["mod:analytics", ["src/analytics/events.ts", "src/analytics/tracker.ts"]],
      [
        "mod:payments",
        ["src/payments/checkout.ts", "src/payments/payment-gateway.ts", "src/payments/refunds.ts"],
      ],
    ]);
    const inferred = document.modules.filter((module) => module.origin === "inferred");
    expect(inferred.map((module) => [module.id, module.name])).toEqual([
      ["mod:src", "order-backend"],
      ["mod:src#customer", "customers"],
      ["mod:src#order", "orders"],
      ["mod:src#refund", "refund"],
      ["mod:src/repositories", "repositories"],
    ]);
    expect(paths(moduleWithId(document, "mod:src/repositories").files)).toEqual([
      "src/repositories/database.ts",
    ]);
    expect(paths(moduleWithId(document, "mod:src").files)).toEqual(["src/config.ts", "src/main.ts"]);
    expect(styleOf(document, "src").description).toContain("cover 10 of 11 files");
    // §3.14: no inferred module holds a declared file.
    const declared = new Set(
      document.modules.filter((m) => m.origin === "declared").flatMap((m) => m.files),
    );
    for (const module of inferred) {
      for (const file of module.files) expect(declared.has(file), file).toBe(false);
    }
    // The inferred `customers ↔ orders` cycle exists by design; rules target declared modules (M8, D-62).
    expect(dependencyIds(moduleWithId(document, "mod:src#customer"))).toContain("mod:src#order");
    expect(dependencyIds(moduleWithId(document, "mod:src#order"))).toContain("mod:src#customer");
    expect(document.layers.map((layer) => [layer.name, layer.rank])).toEqual([
      ["controller", 0],
      ["service", 1],
      ["repository", 2],
      ["domain", 3],
    ]);
    // Layers are orthogonal to modules: a declared module's file is in `service` by its class name.
    expect(paths(layerWithName(document, "service").files)).toContain("src/payments/checkout.ts");
  },

  "high-fan-in": (document) => {
    const style = styleOf(document, "src");
    expect(style.style).toBe("layer");
    expect(style.coverage).toBe(0.5);
    expect(style.description).toContain("stems email, inventory, order and user");
    expect(style.description).toContain("cover 10 of 20 files");
    const core = moduleWithId(document, "mod:src/core");
    expect(
      evidenceOf(core, "utility-files").flatMap((evidence) => paths(evidence.entities ?? [])),
    ).toEqual(["src/core/errors.ts", "src/core/logger.ts"]);
    // D-74: a singleton prior unit is absorbed by the module it serves.
    expect(relocationsOf(document).map(({ file, to }) => [file, to])).toEqual([
      ["src/services/payment.service.ts", "mod:src#order"],
    ]);
    // Golden-pinned ranks; `job` is below `route` through the conventional arc route → job.
    expect(ranksOf(document)).toEqual({
      api: 0,
      route: 1,
      job: 2,
      service: 3,
      store: 4,
      storage: 5,
    });
  },

  "high-fan-out": (document) => {
    // R-3: both are composition roots; the orchestrator's dependencies split exactly 50/50 (v).
    expect(classMembers(document, "composition-roots")).toEqual([
      "src/main.ts",
      "src/orchestrator.ts",
    ]);
    expect(classClause(document, "composition-roots", "src/main.ts")).toMatch(
      /^entry-point rule: /,
    );
    expect(classClause(document, "composition-roots", "src/orchestrator.ts")).toBe(
      "shape rule: nothing outside its unit depends on it; its dependencies spread over 2 other units, none above 50%",
    );
    const style = styleOf(document, "src");
    expect(style.style).toBe("layer");
    expect(style.coverage).toBe(0);
    expect(document.layers.map((layer) => [layer.name, layer.rank])).toEqual([
      ["service", 0],
      ["adapter", 1],
    ]);
  },

  "ambiguous-boundaries": (document) => {
    // §3.9's relocations and weights; `stock-availability.ts` depends on catalog with weight 2.0 on the
    // linker graph (a runtime `uses` edge behind `import type { Product }`), not §3.9's 1.5 (U1 PR 2).
    expect(relocationsOf(document).map(({ file, to, description }) => [file, to, description])).toEqual(
      [
        [
          "src/cart/shipping-estimator.ts",
          "mod:src/checkout",
          "Reassigned here by the strict-majority rule (Katedrala heuristic): `src/cart/shipping-estimator.ts` has 2 of its 2 dependents (weight 2.0 of 2.0) and all of its dependencies (2.0 of 2.0) in this module.",
        ],
        [
          "src/catalog/price-calculator.ts",
          "mod:src/checkout",
          "Reassigned here by the strict-majority rule (Katedrala heuristic): `src/catalog/price-calculator.ts` has 3 of its 4 dependents (weight 3.0 of 4.0) and all of its dependencies (2.0 of 2.0) in this module.",
        ],
        [
          "src/checkout/stock-availability.ts",
          "mod:src/catalog",
          "Reassigned here by the strict-majority rule (Katedrala heuristic): `src/checkout/stock-availability.ts` has 2 of its 2 dependents (weight 2.0 of 2.0) and all of its dependencies (2.0 of 2.0) in this module.",
        ],
      ],
    );
    const common = moduleWithId(document, "mod:src/common");
    expect(weightedValue(common, "shared-usage")).toBe(0.25);
    expect(
      evidenceOf(common, "single-user-files").flatMap((evidence) => paths(evidence.entities ?? [])),
    ).toEqual(["src/common/session.ts", "src/common/slug.ts", "src/common/validation.ts"]);
    expect(classMembers(document, "composition-roots")).toEqual(["src/server.ts"]);
    expect(classMembers(document, "utility-files")).toEqual(["src/common/format.ts"]);
    expect(document.layers).toEqual([]);
  },

  "javascript-commonjs": (document) => {
    // `plugins` is a feature child and `lib` a shared one; no stem recurs (`todo` stays two components).
    const style = styleOf(document, "src");
    expect(style.style).toBe("mixed");
    expect(style.coverage).toBe(0);
    const plugins = moduleWithId(document, "mod:src/plugins");
    expect(kindOf(plugins)).toBe("feature-directory");
    // No member has dependency evidence: the signal is listed without a value (D-45).
    expect(weightedValue(plugins, "internal-edge-ratio")).toBeUndefined();
    expect(plugins.inference?.confidence).toBeLessThan(0.4);
    expect(confidenceOf(plugins)).toBe(0.275);
    expect(kindOf(moduleWithId(document, "mod:src/lib"))).toBe("shared-directory");
    expect(classClause(document, "composition-roots", "src/routes/index.js")).toMatch(
      /^shape rule: /,
    );
    expect(classClause(document, "composition-roots", "src/server.js")).toMatch(
      /^entry-point rule: /,
    );
    expect(ranksOf(document)).toEqual({ route: 0, view: 1, service: 2, store: 2 });
  },

  "typescript-features": (document) => {
    expect(moduleKinds(document)).toEqual([
      ["mod:src", "root-files"],
      ["mod:src/billing", "feature-directory"],
      ["mod:src/customers", "feature-directory"],
      ["mod:src/orders", "feature-directory"],
      ["mod:src/shared", "shared-directory"],
      ["mod:src/ui", "layer-directory"],
      ["mod:src/utils", "shared-directory"],
    ]);
    expect(moduleWithId(document, "mod:src").files).toHaveLength(9);
    expect(classMembers(document, "composition-roots")).toEqual(["src/cli.ts", "src/index.ts"]);
    expect(classClause(document, "composition-roots", "src/cli.ts")).toMatch(/^entry-point rule: /);
    // D-66: the package barrel says what it is before the rule.
    expect(classClause(document, "composition-roots", "src/index.ts")).toMatch(
      /^entry-point rule: a declared entry point and barrel /,
    );
    expect(classMembers(document, "facade-files")).toEqual([
      "src/billing/index.ts",
      "src/customers/index.ts",
      "src/index.ts",
      "src/orders/index.ts",
    ]);
    expect(classMembers(document, "utility-files")).toEqual([
      "src/orders/order.ts",
      "src/utils/money.ts",
    ]);
    // D-65: one dependent in each of two modules, and no location fallback for declarations.
    expect(moduleOfFile(document.modules).has(fileId("src/globals.d.ts"))).toBe(false);
    expect(dependencyIds(moduleWithId(document, "mod:src/ui"))).not.toContain("mod:src");
    // Only `presentation` survives pruning.
    expect(document.layers).toEqual([]);
  },

  "express-app": (document) => {
    const style = styleOf(document, "src");
    expect(style.style).toBe("layer");
    expect(style.description).toContain("cover 10 of 18 files");
    for (const id of ["mod:src#order", "mod:src#user"]) {
      const module = moduleWithId(document, id);
      expect(kindOf(module)).toBe("file-stem");
      // Each stem group is connected (D-27: no union of components).
      expect(module.inference?.reason).toContain("form a connected group");
    }
    expect(classMembers(document, "utility-files")).toEqual([
      "src/config.ts",
      "src/container.ts",
      "src/errors.ts",
      "src/logger.ts",
    ]);
    expect(classMembers(document, "composition-roots")).toEqual([
      "src/app.ts",
      "src/routes/index.ts",
      "src/server.ts",
    ]);
    expect(classClause(document, "composition-roots", "src/app.ts")).toMatch(/^shape rule: /);
    expect(classClause(document, "composition-roots", "src/routes/index.ts")).toMatch(
      /^shape rule: /,
    );
    expect(classClause(document, "composition-roots", "src/server.ts")).toMatch(
      /^entry-point rule: /,
    );
    expect(classMembers(document, "facade-files")).toEqual(["src/controllers/index.ts"]);
    expect(relocationsOf(document).map(({ file, to }) => [file, to])).toEqual([
      ["src/clients/stripe.client.ts", "mod:src#order"],
    ]);
    // D-65: no dependent, so no attachment.
    expect(moduleOfFile(document.modules).has(fileId("src/types/express.d.ts"))).toBe(false);
    expect(ranksOf(document)).toEqual({
      route: 0,
      controller: 1,
      middleware: 1,
      service: 2,
      client: 3,
      repository: 3,
      database: 4,
      model: 4,
    });
    // (v): controller → service is observed (`calls` through container.ts), not conventional.
    expect(conventionalArcs(document)).toEqual([
      ["client", "database"],
      ["client", "model"],
      ["middleware", "database"],
      ["middleware", "service"],
      ["repository", "database"],
      ["service", "database"],
    ]);
  },

  "nestjs-app": (document) => {
    expect(
      document.modules.map((module) => [module.id, kindOf(module), module.name]),
    ).toEqual([
      ["mod:src", "root-files", "payments-service"],
      ["mod:src/common", "shared-directory", "common"],
      ["mod:src/config", "shared-directory", "config"],
      ["mod:src/orders", "feature-directory", "orders"],
      ["mod:src/payments", "feature-directory", "payments"],
    ]);
    expect(paths(moduleWithId(document, "mod:src").files)).toEqual([
      "src/app.controller.ts",
      "src/app.module.ts",
      "src/main.ts",
    ]);
    // D-64: the spec depends on two orders and two payments files, so it is attached by location.
    const orders = moduleWithId(document, "mod:src/orders");
    expect(paths(orders.files)).toContain("src/orders/orders.service.spec.ts");
    expect(evidenceOf(orders, "attached-files").map((evidence) => evidence.description)).toEqual([
      "Attached for navigation (Katedrala heuristic): 1 test file and 0 declaration files; 0 by a strict majority of the modules they depend on, 1 by location in `src/orders`.",
    ]);
    expect(document.layers.map((layer) => [layer.name, layer.rank])).toEqual([
      ["controller", 0],
      ["middleware", 1],
      ["service", 2],
      ["dto", 3],
      ["model", 3],
    ]);
    // Review #26: the naming roles.
    const naming = (path: string) =>
      rolesOf(document, path).filter(([, source]) => source === "naming").map(([role]) => role);
    for (const path of [
      "src/app.controller.ts",
      "src/orders/orders.controller.ts",
      "src/payments/payments.controller.ts",
    ]) {
      expect(naming(path), path).toEqual(["http-controller"]);
    }
    for (const path of [
      "src/orders/orders.service.ts",
      "src/payments/payments.service.ts",
      "src/config/config.service.ts",
    ]) {
      expect(naming(path), path).toEqual(["service"]);
    }
    for (const path of [
      "src/common/guards/api-key.guard.ts",
      "src/common/interceptors/logging.interceptor.ts",
    ]) {
      expect(rolesOf(document, path), path).toEqual([
        ["middleware", "location"],
        ["middleware", "naming"],
      ]);
    }
    expect(naming("src/payments/stripe.client.ts")).toEqual(["external-client"]);
    for (const path of [
      "src/orders/dto/create-order.dto.ts",
      "src/orders/dto/pay-order.dto.ts",
      "src/payments/dto/create-payment.dto.ts",
    ]) {
      expect(naming(path), path).toEqual(["data-transfer-object"]);
    }
    for (const path of ["src/orders/entities/order.entity.ts", "src/payments/entities/payment.entity.ts"]) {
      expect(naming(path), path).toEqual(["data-model"]);
    }
    for (const path of [
      "src/app.module.ts",
      "src/config/config.module.ts",
      "src/orders/orders.module.ts",
      "src/payments/payments.module.ts",
    ]) {
      expect(naming(path), path).toEqual(["module-definition"]);
    }
    // A single naming-only vote is pruned.
    const layered = new Set(document.layers.flatMap((layer) => paths(layer.files)));
    expect(layered.has("src/payments/stripe.client.ts")).toBe(false);
  },

  "fastify-app": (document) => {
    const style = styleOf(document, "src");
    expect(style.style).toBe("mixed");
    expect(style.coverage).toBe(0.5);
    expect(style.description).toContain("the file-name stem order recurs");
    expect(style.description).toContain("covers 4 of 8 files");
    // D-74: three singleton prior units absorbed.
    expect(relocationsOf(document).map(({ file, to }) => [file, to])).toEqual([
      ["src/clients/shipping.client.ts", "mod:src#order"],
      ["src/hooks/auth.ts", "mod:src/plugins"],
      ["src/services/pricing.ts", "mod:src#order"],
    ]);
    // D-65: the test is attached by a strict majority (1 of 1).
    const root = moduleWithId(document, "mod:src");
    expect(paths(root.files)).toContain("test/orders.test.ts");
    expect(evidenceOf(root, "attached-files").map((evidence) => evidence.description)).toEqual([
      "Attached for navigation (Katedrala heuristic): 1 test file and 0 declaration files; 1 by a strict majority of the modules they depend on, 0 by location.",
    ]);
  },
};

// ─── Plan 7.1: invariants that hold on every fixture ──────────────────────────────────────────────────

const strictSchema = (() => {
  const url = new URL("../../packages/ir/schema/architecture.strict.schema.json", import.meta.url);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats.default(ajv);
  return ajv.compile(JSON.parse(readFileSync(url, "utf8")) as object);
})();

/** The golden sections of a document (plan 7.4). */
function goldenText(document: ArchitectureSections): string {
  const roles: Record<string, RoleEntry[]> = {};
  for (const file of document.files) {
    if (file.roles !== undefined && file.roles.length > 0) roles[file.path] = file.roles;
  }
  return serializeDocument({
    components: document.components,
    modules: document.modules,
    layers: document.layers,
    roles,
  });
}

const INFERRED_SOURCES: ReadonlySet<string> = new Set(["naming", "location", "configuration"]);

const NOT_EVALUATED = (section: string): string =>
  `Configuration section "${section}" is not evaluated by this version of Katedrala`;

/** The inputs the engine passes to inference, rebuilt from an analysis (for the stage's own output). */
function inferenceInputs(analysis: ArchitectureAnalysis): Omit<InferenceInput, "model"> {
  const { configuration, document } = analysis;
  return {
    settings: analysis.inference,
    declarations: resolveDeclarations(
      document.files,
      configuration.config as Parameters<typeof resolveDeclarations>[1],
      configuration.inSnapshot && configuration.path !== undefined
        ? fileId(configuration.path)
        : undefined,
    ),
    projection: metricsProjectionOptions(analysis.settings),
    repositoryName: document.repository.name,
  };
}

/**
 * The structural part of an architecture document: without components, modules and layers, without the
 * inferred role entries and without the inference stage's diagnostics (plan 7.1).
 */
function structuralPart(
  document: ArchitectureSections,
  inferenceDiagnostics: readonly Diagnostic[],
): StructureDocument {
  const { components: _components, modules: _modules, layers: _layers, ...structure } = document;
  const fromInference = inferenceDiagnostics.map((diagnostic) => JSON.stringify(diagnostic));
  return {
    ...structure,
    files: structure.files.map((file) => {
      const kept = (file.roles ?? []).filter((entry) => !INFERRED_SOURCES.has(entry.source));
      const { roles: _roles, ...rest } = file;
      return kept.length === 0 ? rest : { ...rest, roles: kept };
    }),
    diagnostics: structure.diagnostics.filter((diagnostic) => {
      // Each of the stage's diagnostics accounts for one entry of the merged list.
      const index = fromInference.indexOf(JSON.stringify(diagnostic));
      if (index < 0) return true;
      fromInference.splice(index, 1);
      return false;
    }),
  };
}

// ─── Plan 7.1: bounded perturbation ───────────────────────────────────────────────────────────────────

/** The file of a file or symbol identifier; undefined for other entities. */
function fileOfNode(id: EntityId): string | undefined {
  if (id.startsWith("file:")) return id;
  if (!id.startsWith("sym:")) return undefined;
  return `file:${id.slice("sym:".length).split("#")[0]!}`;
}

/** A source-file pair of an edge, as `from\nto`; undefined unless both ends are distinct source files. */
function sourcePair(edge: EdgeEntity, sources: ReadonlySet<string>): string | undefined {
  const from = fileOfNode(edge.source);
  const to = fileOfNode(edge.target);
  if (from === undefined || to === undefined || from === to) return undefined;
  return sources.has(from) && sources.has(to) ? `${from}\n${to}` : undefined;
}

/** `from -> to` with paths, for a pair written `file:from\nfile:to`. */
const pairLabel = (pair: string): string =>
  pair
    .split("\n")
    .map((id) => pathOf(id))
    .join(" -> ");

/** A seeded shuffle (Fisher–Yates with mulberry32). */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  const random = createRandom(seed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

const PERTURBATION_KINDS = ["removal", "addition", "internal addition"] as const;
type PerturbationKind = (typeof PERTURBATION_KINDS)[number];
/** Plan 7.1: the design's experiment sampled 40 pairs. */
const SAMPLED_PAIRS = 40;
/** Plan 7.1: no single perturbation may change the module of more than this many files. */
const CHANGE_BOUND = 2;

/**
 * The cases above the bound, each analysed in docs/ALGORITHMS.md ("Stability under perturbation"), with the
 * number of files they change. In each, the perturbation connects or disconnects a stem group of two files,
 * which changes those two files by construction (P2 keeps only connected stem components spanning two
 * layer directories, D-27), and the layer-directory unit the pair leaves or joins then holds a different
 * number of files, so condition 4's lone-file exception (D-74) absorbs or releases one more file. Q-11 keeps
 * D-74; the bound stays 2 for every other case, and an unlisted case above it fails.
 */
const ANALYSED_ABOVE_BOUND: Readonly<Record<string, number>> = {
  "high-fan-in / removal / src/jobs/email-digest.job.ts -> src/services/email.service.ts": 3,
  "high-fan-in / removal / src/jobs/inventory-sync.job.ts -> src/services/inventory.service.ts": 3,
  "javascript-commonjs / addition / src/views/todo-page.js -> src/services/todo-service.js": 3,
};

/** Files per cluster label: the module id (inference) or a community (Louvain). */
type Partition = ReadonlyMap<string, string>;

/** Files whose module differs, or whose module vanished (plan 7.1); ids are compared as they are. */
function changedById(base: Partition, perturbed: Partition, files: readonly string[]): number {
  return files.filter((file) => base.get(file) !== perturbed.get(file)).length;
}

/**
 * Files not in their matched cluster after a greedy maximum-overlap matching of the clusters (the design
 * prototype's MoJo-like count, `m5/stability_exp.py`), over the files both partitions assign. Used for the
 * comparison with Louvain, whose community labels carry no identity.
 */
function changedByMatching(base: Partition, perturbed: Partition): number {
  const common = [...base.keys()].filter((file) => perturbed.has(file));
  const overlaps = new Map<string, number>();
  for (const file of common) {
    const key = `${base.get(file)!}\n${perturbed.get(file)!}`;
    overlaps.set(key, (overlaps.get(key) ?? 0) + 1);
  }
  const pairs = [...overlaps]
    .map(([key, overlap]) => ({ key, overlap, x: key.split("\n")[0]!, y: key.split("\n")[1]! }))
    .sort((a, b) => b.overlap - a.overlap || compareStrings(a.key, b.key));
  const usedX = new Set<string>();
  const usedY = new Set<string>();
  let kept = 0;
  for (const { overlap, x, y } of pairs) {
    if (usedX.has(x) || usedY.has(y)) continue;
    usedX.add(x);
    usedY.add(y);
    kept += overlap;
  }
  return common.length - kept;
}

interface PerturbationStats {
  readonly fixture: string;
  readonly kind: PerturbationKind;
  readonly cases: number;
  /** Plan 7.1's count (module ids), asserted. */
  readonly changed: readonly number[];
  /** The matching-based count of inference and of Louvain (with KATEDRALA_REPORT=1). */
  readonly matched?: readonly number[];
  readonly louvain?: readonly number[];
}

const PERTURBATIONS: PerturbationStats[] = [];

/** One perturbation experiment on a fixture's analysis. */
class PerturbationHarness {
  readonly #input: Omit<InferenceInput, "model">;
  readonly #document: StructureDocument;
  readonly #files: readonly string[];
  readonly #sources: ReadonlySet<string>;
  readonly #pairs: ReadonlySet<string>;
  readonly #base: Partition;
  readonly #baseNodes: Partition;
  readonly #pinned: ReadonlySet<string>;
  #louvainBase: Partition | undefined;

  constructor(analysis: ArchitectureAnalysis) {
    const { document } = analysis;
    const { components: _c, modules, layers: _l, ...structure } = document;
    this.#document = structure;
    this.#input = inferenceInputs(analysis);
    this.#files = document.files.map((file) => file.id);
    this.#sources = new Set(
      document.files.filter((file) => file.role === "source").map((file) => file.id),
    );
    this.#pairs = new Set(
      document.edges.flatMap((edge) => sourcePair(edge, this.#sources) ?? []),
    );
    this.#base = moduleOfFile(modules);
    this.#baseNodes = new Map([...this.#base].filter(([file]) => this.#sources.has(file)));
    // Louvain runs without the composition roots and utilities of the baseline (plan 7.1).
    this.#pinned = new Set(
      modules.flatMap((module) =>
        [...evidenceOf(module, "composition-roots"), ...evidenceOf(module, "utility-files")].flatMap(
          (evidence) => evidence.entities ?? [],
        ),
      ),
    );
  }

  /** The cases of a kind: a label (the file pair) and the edge list to infer on. */
  cases(kind: PerturbationKind, seed: number): { label: string; edges: EdgeEntity[] }[] {
    const edges = this.#document.edges;
    switch (kind) {
      case "removal":
        // Every source-file pair with edges loses all IR edges of that pair.
        return [...this.#pairs].sort(compareStrings).map((pair) => ({
          label: pairLabel(pair),
          edges: edges.filter((edge) => sourcePair(edge, this.#sources) !== pair),
        }));
      case "addition": {
        const sources = [...this.#sources].sort(compareStrings);
        const candidates = sources.flatMap((from) =>
          sources
            .filter((to) => to !== from && !this.#pairs.has(`${from}\n${to}`))
            .map((to): [string, string] => [from, to]),
        );
        return shuffled(candidates, seed)
          .slice(0, SAMPLED_PAIRS)
          .map(([from, to]) => ({
            label: pairLabel(`${from}\n${to}`),
            edges: this.#withImport(from, to),
          }));
      }
      case "internal addition": {
        const byModule = new Map<string, string[]>();
        for (const [file, module] of [...this.#baseNodes].sort((a, b) => compareStrings(a[0], b[0]))) {
          byModule.set(module, [...(byModule.get(module) ?? []), file]);
        }
        const candidates = [...byModule.values()].flatMap((members) =>
          members.flatMap((from) =>
            members
              .filter((to) => to !== from && !this.#pairs.has(`${from}\n${to}`))
              .map((to): [string, string] => [from, to]),
          ),
        );
        return shuffled(candidates, seed)
          .slice(0, SAMPLED_PAIRS)
          .map(([from, to]) => ({
            label: pairLabel(`${from}\n${to}`),
            edges: this.#withImport(from, to),
          }));
      }
    }
  }

  #withImport(from: string, to: string): EdgeEntity[] {
    const source = from as EdgeEntity["source"];
    const target = to as EdgeEntity["target"];
    const edge: EdgeEntity = {
      id: edgeId("imports", source, target),
      kind: "imports",
      source,
      target,
      observations: 1,
      typeOnly: false,
      confidence: 1,
      provenance: [],
    };
    return [...this.#document.edges, edge].sort(compareEdges);
  }

  /** Plan 7.1's count for one case: files whose module id differs or vanished. */
  measure(edges: EdgeEntity[]): { changed: number; partition: Partition } {
    const model = ArchitectureModel.from({ ...this.#document, edges });
    const { modules } = inferArchitecture({ ...this.#input, model });
    const partition = moduleOfFile(modules);
    return { changed: changedById(this.#base, partition, this.#files), partition };
  }

  /** The matching-based count of inference for one case's partition. */
  matched(partition: Partition): number {
    const nodes = new Map([...partition].filter(([file]) => this.#sources.has(file)));
    return changedByMatching(this.#baseNodes, nodes);
  }

  /** Unconstrained Louvain (γ = 1, from singletons) over the source files minus pinned classes. */
  louvain(edges: readonly EdgeEntity[]): number {
    this.#louvainBase ??= this.#louvainPartition(this.#document.edges);
    return changedByMatching(this.#louvainBase, this.#louvainPartition(edges));
  }

  #louvainPartition(edges: readonly EdgeEntity[]): Partition {
    const nodes = [...this.#sources].filter((file) => !this.#pinned.has(file)).sort(compareStrings);
    const index = new Map(nodes.map((file, i) => [file, i]));
    const weights = new Map<string, number>();
    const runtime = new Set<string>();
    for (const edge of edges) {
      if (edge.kind === "depends-on-package" || edge.confidence < 0.5) continue;
      const from = fileOfNode(edge.source);
      const to = fileOfNode(edge.target);
      if (from === undefined || to === undefined || from === to) continue;
      if (!index.has(from) || !index.has(to)) continue;
      const key = `${from}\n${to}`;
      weights.set(key, 0);
      if (!edge.typeOnly) runtime.add(key);
    }
    const sources: number[] = [];
    const targets: number[] = [];
    const values: number[] = [];
    for (const key of [...weights.keys()].sort(compareStrings)) {
      const [from, to] = key.split("\n") as [string, string];
      sources.push(index.get(from)!);
      targets.push(index.get(to)!);
      values.push(runtime.has(key) ? 1 : 0.5);
    }
    const { communities } = louvain(UndirectedGraph.fromEdges(nodes.length, sources, targets, values), {
      resolution: 1,
    });
    return new Map(nodes.map((file, i) => [file, String(communities[i])]));
  }
}

// ─── The tests ────────────────────────────────────────────────────────────────────────────────────────

describe.each(FIXTURE_NAMES)("inference on fixture %s", (name) => {
  let analysis: ArchitectureAnalysis;
  let document: ArchitectureSections;

  beforeAll(async () => {
    analysis = await analyzeFixture(name);
    document = analysis.document;
  });

  const requirement = REQUIREMENTS[name];
  if (requirement !== undefined) {
    it("meets the plan's requirements and assertions (plan 7.3)", () => {
      requirement(document, analysis);
    });
  }

  it("matches the golden sections (plan 7.4)", () => {
    const file = join(GOLDEN, `${name}.json`);
    const actual = goldenText(document);
    if (UPDATE_GOLDEN) {
      mkdirSync(GOLDEN, { recursive: true });
      writeFileSync(file, actual);
      return;
    }
    expect(existsSync(file), `${file} exists (KATEDRALA_UPDATE_GOLDEN=1 writes it)`).toBe(true);
    expect(actual).toBe(readFileSync(file, "utf8"));
  });

  it("produces a canonical document that validates against the strict schema", () => {
    const full = { ...emptyDocument(), ...document };
    const valid = strictSchema(full);
    expect(strictSchema.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
    // Plan 4.8: canonical as produced.
    expect(canonicalizeDocument(full)).toEqual(full);
  });

  it("keeps the invariants of every inferred conclusion (plan 7.1)", () => {
    for (const unit of [...document.modules, ...document.layers]) {
      const { inference } = unit;
      if (inference === undefined) continue;
      expect(inference.reason, unit.id).toMatch(/^Inferred: /);
      const weighted = inference.evidence.filter((evidence) => evidence.weight !== undefined);
      const total = weighted.reduce((sum, evidence) => sum + evidence.weight!, 0);
      expect(total, unit.id).toBeCloseTo(1, 9);
      const recomputed = weighted.reduce(
        (sum, evidence) => sum + evidence.weight! * (evidence.value ?? 0),
        0,
      );
      expect(Math.abs(recomputed - inference.confidence), unit.id).toBeLessThan(1e-8);
      expect(inference.confidence).toBeGreaterThanOrEqual(0);
      expect(inference.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("gives identical output when run twice", async () => {
    const again = await analyzeFixture(name);
    expect(serializeDocument(again.document)).toBe(serializeDocument(document));
  });

  it("does not depend on the order of the document's arrays (plan 7.1)", () => {
    const { components: _c, modules: _m, layers: _l, ...structure } = document;
    const input = inferenceInputs(analysis);
    const sections = (result: ReturnType<typeof inferArchitecture>): string =>
      serializeDocument({
        components: result.components,
        modules: result.modules,
        layers: result.layers,
        roles: [...result.roles],
        diagnostics: result.diagnostics,
      });
    const expected = sections(
      inferArchitecture({ ...input, model: ArchitectureModel.from(structure) }),
    );
    for (const seed of [1, 2, 3]) {
      const shuffledDocument = {
        ...structure,
        directories: shuffled(structure.directories, seed),
        packages: shuffled(structure.packages, seed),
        files: shuffled(structure.files, seed),
        symbols: shuffled(structure.symbols, seed),
        externals: shuffled(structure.externals, seed),
        edges: shuffled(structure.edges, seed),
        entryPoints: shuffled(structure.entryPoints, seed),
      };
      const result = inferArchitecture({
        ...input,
        model: ArchitectureModel.from(shuffledDocument),
      });
      expect(sections(result), `seed ${seed}`).toBe(expected);
    }
  });

  it("leaves the structural sections as analyzeStructure gives them (plan 7.1)", async () => {
    const structure = await analyzeStructure({
      source: fixtureSource(name),
      cache: false,
      concurrency: 1,
    });
    const own = inferArchitecture({ ...inferenceInputs(analysis), model: structure.model });
    const warnings = new Set(["modules", "layers", "inference"].map(NOT_EVALUATED));
    const expected = {
      ...structure.document,
      diagnostics: structure.document.diagnostics.filter(
        (diagnostic) => !warnings.has(diagnostic.message),
      ),
    };
    expect(serializeDocument(structuralPart(document, own.diagnostics))).toBe(
      serializeDocument(expected),
    );
  });

  describe("bounded perturbation (plan 7.1)", () => {
    let harness: PerturbationHarness;

    beforeAll(() => {
      harness = new PerturbationHarness(analysis);
    });

    it.each(PERTURBATION_KINDS.map((kind, index) => [kind, 42 + index] as const))(
      "changes the module of at most two files per case: %s",
      (kind, seed) => {
        const changed: number[] = [];
        const matched: number[] = [];
        const louvainCounts: number[] = [];
        const analysed: string[] = [];
        for (const { label, edges } of harness.cases(kind, seed)) {
          const result = harness.measure(edges);
          changed.push(result.changed);
          if (REPORT) {
            matched.push(harness.matched(result.partition));
            louvainCounts.push(harness.louvain(edges));
          }
          const key = `${name} / ${kind} / ${label}`;
          const known = ANALYSED_ABOVE_BOUND[key];
          if (known === undefined) {
            expect(result.changed, key).toBeLessThanOrEqual(CHANGE_BOUND);
          } else {
            expect(result.changed, key).toBe(known);
            analysed.push(key);
          }
        }
        PERTURBATIONS.push({
          fixture: name,
          kind,
          cases: changed.length,
          changed,
          ...(REPORT ? { matched, louvain: louvainCounts } : {}),
        });
        // The list of analysed cases cannot go stale.
        expect(analysed).toEqual(
          Object.keys(ANALYSED_ABOVE_BOUND).filter((key) => key.startsWith(`${name} / ${kind} / `)),
        );
      },
      120_000,
    );
  });
});

afterAll(() => {
  if (!REPORT) return;
  const summary = (counts: readonly number[]): string => {
    if (counts.length === 0) return "–";
    const mean = counts.reduce((sum, count) => sum + count, 0) / counts.length;
    const unchanged = counts.filter((count) => count === 0).length / counts.length;
    return `${mean.toFixed(2)} / ${Math.max(...counts)} / ${Math.round(unchanged * 100)}%`;
  };
  const rows = [...PERTURBATIONS]
    .sort(
      (a, b) =>
        compareStrings(a.fixture, b.fixture) ||
        PERTURBATION_KINDS.indexOf(a.kind) - PERTURBATION_KINDS.indexOf(b.kind),
    )
    .map(
      (row) =>
        `| ${row.fixture} | ${row.kind} | ${row.cases} | ${summary(row.changed)} | ` +
        `${summary(row.matched ?? [])} | ${summary(row.louvain ?? [])} |`,
    );
  process.stdout.write(
    [
      "",
      "| fixture | perturbation | cases | Katedrala, module ids (mean / max / unchanged) | Katedrala, matched | Louvain γ = 1, matched |",
      "| --- | --- | --- | --- | --- | --- |",
      ...rows,
      "",
    ].join("\n"),
  );
});
