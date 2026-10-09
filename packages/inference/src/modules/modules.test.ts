/**
 * Integration tests of the module stage (plan 6.4): `inferModules` chains the declared modules, P0, U3's
 * `clusterScope` (P1–P6), P7, P8 and P9. The phases' own tests run on hand-built clusterings; these run the
 * whole stage on the design prototype's graphs (§3.13, §3.16; plan 6.4 "Done", review #8) and on synthetic
 * models, and check the stage's invariants on random models (plan 7.1).
 */
import {
  canonicalizeDocument,
  compareStrings,
  defaultLimits,
  emptyDocument,
  fileId,
  inferredModuleKey,
  moduleId,
} from "@katedrala/ir";
import type {
  DocumentLimits,
  EdgeKind,
  Evidence,
  FileId,
  FileRole,
  InferenceInfo,
  ModuleEntity,
} from "@katedrala/ir";
import type { ArchitectureModel, ProjectionOptions } from "@katedrala/model";
import { DEFAULT_EDGE_KINDS, DEFAULT_FILE_ROLES } from "@katedrala/model";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { inferRoles } from "../roles.js";
import { resolveInferenceSettings } from "../settings.js";
import {
  prototypeFixtureNames,
  prototypeModel,
  shuffledModel,
  syntheticModel,
} from "../test-support.js";
import type { SyntheticEdgeSpec, SyntheticFileSpec, SyntheticModelSpec } from "../test-support.js";
import type {
  DeclaredModuleSpec,
  InferenceConfiguration,
  InferenceSettings,
  ModuleDraft,
  ModulesResult,
  UnitKind,
} from "../types.js";
import { MODULE_SIGNAL_WEIGHTS } from "./confidence.js";
import { DEPENDENCY_VIOLATIONS_DECLARED } from "./design-clusterings.test-support.js";
import { MODULE_KIND_SIGNALS } from "./explain.js";
import { METRICS_PROJECTION } from "./hand-built.test-support.js";
import { inferModules } from "./modules.js";

// ─── Running the stage ────────────────────────────────────────────────────────────────────────────────

/** What a test changes in the stage's input; everything else is the engine's default. */
interface RunOptions {
  readonly config?: InferenceConfiguration;
  /** `analysis.include_tests_in_metrics` (D-65). */
  readonly includeTestsInMetrics?: boolean;
  readonly declared?: readonly DeclaredModuleSpec[];
  /** Default: the metrics projection of the default core settings. */
  readonly projection?: ProjectionOptions;
  readonly limits?: Partial<DocumentLimits>;
  readonly configurationFile?: FileId;
}

interface Run {
  readonly settings: InferenceSettings;
  readonly result: ModulesResult;
}

/**
 * The module stage as the pipeline runs it: settings resolved from the configuration, the labels of the
 * roles stage (stem names, D-39), the document's limits and repository name.
 */
function run(model: ArchitectureModel, options: RunOptions = {}): Run {
  const settings = resolveInferenceSettings(options.config, {
    includeTestsInMetrics: options.includeTestsInMetrics ?? false,
  });
  const { labels } = inferRoles({ model, settings, configured: [] });
  const result = inferModules({
    model,
    settings,
    declared: options.declared ?? [],
    labels,
    projection: options.projection ?? METRICS_PROJECTION,
    repositoryName: model.document.repository?.name ?? "repository",
    limits: { ...defaultLimits(), ...model.document.limits, ...options.limits },
    ...(options.configurationFile === undefined
      ? {}
      : { configurationFile: options.configurationFile }),
  });
  return { settings, result };
}

/** The module with this identifier; fails the test when there is none. */
function moduleOf(result: ModulesResult, id: string): ModuleDraft {
  const module = result.modules.find((candidate) => candidate.id === id);
  if (module === undefined) throw new Error(`no module ${id} in ${ids(result).join(", ")}`);
  return module;
}

function ids(result: ModulesResult): string[] {
  return result.modules.map((module) => module.id);
}

/** The paths of file identifiers. */
function paths(files: readonly FileId[]): string[] {
  return files.map((file) => file.slice("file:".length));
}

/** Paths relative to `src/`, as file identifiers in canonical order. */
function underSrc(relative: readonly string[]): FileId[] {
  return relative.map((path) => fileId(`src/${path}`)).sort(compareStrings);
}

/** The evidence entries of one signal. */
function entries(module: ModuleDraft, signal: string): Evidence[] {
  return (module.inference?.evidence ?? []).filter((evidence) => evidence.signal === signal);
}

/** The value of a weighted signal. */
function valueOf(module: ModuleDraft, signal: string): number | undefined {
  return entries(module, signal)[0]?.value;
}

const KIND_OF_SIGNAL: ReadonlyMap<string, UnitKind> = new Map(
  (Object.keys(MODULE_KIND_SIGNALS) as UnitKind[]).map((kind) => [MODULE_KIND_SIGNALS[kind], kind]),
);

/** The unit kind a module's kind signal names (D-48), or `declared`. */
function kindOf(module: ModuleDraft): UnitKind | "declared" {
  if (module.origin === "declared") return "declared";
  const kinds = (module.inference?.evidence ?? []).flatMap((evidence) => {
    const kind = KIND_OF_SIGNAL.get(evidence.signal);
    return kind === undefined ? [] : [kind];
  });
  expect(kinds, module.id).toHaveLength(1);
  return kinds[0] ?? "root";
}

/** The declared modules of dependency-violations' configuration (`src/payments/**`, `src/analytics/**`). */
function dependencyViolationsDeclared(model: ArchitectureModel): DeclaredModuleSpec[] {
  return Object.entries(DEPENDENCY_VIOLATIONS_DECLARED).map(([name, prefix]) => ({
    name,
    files: model.document.files
      .filter((file) => file.path.startsWith(prefix))
      .map((file) => file.id)
      .sort(compareStrings),
  }));
}

// ─── Invariants ───────────────────────────────────────────────────────────────────────────────────────

/**
 * The invariants of one inferred module's `InferenceInfo` (plan 4.6, 7.1): the method string, an "Inferred:"
 * reason, the weighted signals of its kind with weights summing to 1, values and confidence in [0, 1],
 * confidence = Σ weight × value of the rounded entries within 1e-8, the total evidence order, one kind
 * signal (D-48), entities sorted and bounded.
 */
function checkInference(
  info: InferenceInfo,
  kind: UnitKind,
  settings: InferenceSettings,
  maxEntities: number,
): void {
  expect(info.method).toBe(settings.methods.modules);
  expect(info.reason.startsWith("Inferred: "), info.reason).toBe(true);
  const weights = MODULE_SIGNAL_WEIGHTS[kind];
  const weighted = info.evidence.filter((evidence) => evidence.weight !== undefined);
  expect(info.evidence.slice(0, weighted.length)).toEqual(weighted);
  expect(weighted.map((evidence) => evidence.signal).sort(compareStrings)).toEqual(
    weights.map((weight) => weight.signal).sort(compareStrings),
  );
  let total = 0;
  let recomputed = 0;
  let previous: Evidence | undefined;
  for (const evidence of weighted) {
    const weight = evidence.weight ?? Number.NaN;
    total += weight;
    const contribution = weight * (evidence.value ?? 0);
    recomputed += contribution;
    if (previous !== undefined) {
      const before = (previous.weight ?? 0) * (previous.value ?? 0);
      expect(contribution).toBeLessThanOrEqual(before);
      if (contribution === before) {
        expect(compareStrings(previous.signal, evidence.signal)).toBeLessThan(0);
      }
    }
    previous = evidence;
    if (evidence.value !== undefined) {
      expect(evidence.value).toBeGreaterThanOrEqual(0);
      expect(evidence.value).toBeLessThanOrEqual(1);
    }
  }
  expect(total).toBeCloseTo(1, 9);
  expect(Math.abs(recomputed - info.confidence)).toBeLessThan(1e-8);
  expect(info.confidence).toBeGreaterThanOrEqual(0);
  expect(info.confidence).toBeLessThanOrEqual(1);
  const context = info.evidence.slice(weighted.length);
  const signals = context.map((evidence) => evidence.signal);
  expect(signals).toEqual([...signals].sort(compareStrings));
  expect(context.filter((evidence) => KIND_OF_SIGNAL.has(evidence.signal))).toEqual(
    entriesOf(info, MODULE_KIND_SIGNALS[kind]),
  );
  expect(entriesOf(info, MODULE_KIND_SIGNALS[kind])).toHaveLength(1);
  for (const evidence of info.evidence) {
    const list = evidence.entities ?? [];
    expect(list).toEqual([...new Set(list)].sort(compareStrings));
    expect(list.length).toBeLessThanOrEqual(maxEntities);
  }
}

function entriesOf(info: InferenceInfo, signal: string): Evidence[] {
  return info.evidence.filter((evidence) => evidence.signal === signal);
}

/** A sorted list without repetitions. */
function expectSorted(list: readonly string[], label: string): void {
  expect(list, label).toEqual([...new Set(list)].sort(compareStrings));
}

/**
 * The invariants of the stage's output (plan 3.1, 4.4, 7.1), checked against a brute-force reading of the
 * input:
 *
 * - drafts in identifier order, identifiers unique, every list sorted, keys in the IR's order;
 * - declared modules: exact membership (matched files with a component role, first name wins, D-22, D-23),
 *   no anchor, no inference;
 * - inferred modules exist exactly when D-21 allows them; every node (a file with a node role that no declared
 *   module owns) is in exactly one of them; their other members are attached tests and declarations of the
 *   same package (D-65); they never span packages; the identifier derives from the anchor (§3.10);
 *   `entryPoints` and `publicApi` are node members (D-63);
 * - every file is in at most one module;
 * - the InferenceInfo invariants of every inferred module.
 */
function checkStage(
  model: ArchitectureModel,
  specs: readonly DeclaredModuleSpec[],
  settings: InferenceSettings,
  result: ModulesResult,
  maxEntities: number,
): void {
  const { modules } = result;
  const moduleIds = ids(result);
  expect(moduleIds).toEqual([...new Set(moduleIds)].sort(compareStrings));
  const roleOf = (file: FileId): FileRole | undefined => model.index.file(file)?.role;
  const packageOf = (file: FileId): string => model.index.file(file)?.package ?? "";

  // Declared membership by brute force (D-22, D-23).
  const declaredFiles = new Set<FileId>();
  const byName = [...specs].sort((a, b) => compareStrings(a.name, b.name));
  const declaredNames = new Set(byName.map((spec) => spec.name));
  for (const spec of byName) {
    const expected = [...new Set(spec.files)].sort(compareStrings).filter((file) => {
      const role = roleOf(file);
      return (
        role !== undefined && settings.componentFileRoles.has(role) && !declaredFiles.has(file)
      );
    });
    for (const file of expected) declaredFiles.add(file);
    const module = moduleOf(result, moduleId(spec.name));
    expect(Object.keys(module)).toEqual([
      "id",
      "name",
      "origin",
      "packages",
      "files",
      "entryPoints",
      "publicApi",
    ]);
    expect(module).toMatchObject({ name: spec.name, origin: "declared", files: expected });
    expect(module.packages).toEqual(
      [...new Set(expected.flatMap((file) => model.index.file(file)?.package ?? []))].sort(
        compareStrings,
      ),
    );
    for (const file of [...module.entryPoints, ...module.publicApi]) {
      expect(expected).toContain(file);
    }
  }
  expect(modules.filter((module) => module.origin === "declared")).toHaveLength(byName.length);

  // Nodes (P0) and whether modules are inferred at all (D-21).
  const nodes = model.document.files
    .filter((file) => settings.modules.fileRoles.has(file.role) && !declaredFiles.has(file.id))
    .map((file) => file.id);
  const inferring =
    settings.modules.enabled && (settings.modules.whenDeclared !== "none" || specs.length === 0);
  const inferred = modules.filter((module) => module.origin === "inferred");
  if (!inferring || nodes.length === 0) expect(inferred).toEqual([]);

  const owner = new Map<FileId, string>();
  for (const module of modules) {
    for (const list of [module.files, module.packages, module.entryPoints, module.publicApi]) {
      expectSorted(list, module.id);
    }
    for (const file of module.files) {
      expect(owner.get(file), `${file} in ${module.id}`).toBeUndefined();
      owner.set(file, module.id);
    }
  }
  if (inferring) {
    for (const node of nodes) expect(owner.get(node), node).toMatch(/^mod:/);
  }
  for (const module of inferred) {
    expect(Object.keys(module)).toEqual([
      "id",
      "name",
      "origin",
      "anchor",
      "packages",
      "files",
      "entryPoints",
      "publicApi",
      "inference",
    ]);
    const anchor = module.anchor;
    if (anchor === undefined || module.inference === undefined) throw new Error(module.id);
    const key = inferredModuleKey(anchor);
    expect(module.id).toBe(moduleId(inferredModuleKey(anchor, declaredNames.has(key))));
    const members = module.files.filter((file) => nodes.includes(file));
    expect(members.length, module.id).toBeGreaterThan(0);
    const scope = packageOf(members[0] ?? "file:");
    for (const file of module.files) {
      expect(packageOf(file), `${file} in ${module.id}`).toBe(scope);
      expect(declaredFiles.has(file)).toBe(false);
      if (!nodes.includes(file)) {
        // D-65: the other members are attached tests and declarations, when their flag is on.
        const role = roleOf(file);
        expect(role === "test" || role === "declaration", file).toBe(true);
        expect(
          role === "test" ? settings.modules.attachTests : settings.modules.attachDeclarations,
        ).toBe(true);
      }
    }
    expect(module.packages).toEqual(scope === "" ? [] : [scope]);
    for (const file of [...module.entryPoints, ...module.publicApi])
      expect(members).toContain(file);
    checkInference(module.inference, kindOf(module) as UnitKind, settings, maxEntities);
  }
}

// ─── The design's replays (§3.13, §3.16) ──────────────────────────────────────────────────────────────

/** A §3.16 row: the kind (D-48), the name, the confidence to 3 decimals, the members relative to `src/`. */
type Row = readonly [
  kind: UnitKind | "declared",
  name: string,
  confidence: number | undefined,
  members: readonly string[],
];

/**
 * §3.16's modules of the five fixtures plan 6.4 names. layered-architecture and ambiguous-boundaries list
 * their members file by file; clean-architecture's modules are its layer directories, tangled-architecture's
 * its feature directories plus `lib`, dependency-violations' the declared modules, three stem modules
 * (customers as §3.14 lists it), `repositories` (`database.ts`) and the root (`main.ts`, `config.ts`).
 */
const SECTION_3_16: Readonly<Record<string, Readonly<Record<string, Row>>>> = {
  "layered-architecture": {
    "mod:src#payment": [
      "stem",
      "payments",
      0.807,
      [
        "controllers/payment.controller.ts",
        "models/payment.ts",
        "repositories/payment.repository.ts",
        "services/payment-gateway.ts",
        "services/payment.service.ts",
      ],
    ],
    "mod:src#order": [
      "stem",
      "orders",
      0.888,
      [
        "controllers/order.controller.ts",
        "models/order.ts",
        "models/order-line.ts",
        "repositories/order.repository.ts",
        "services/order.service.ts",
      ],
    ],
    "mod:src#user": [
      "stem",
      "users",
      0.73,
      [
        "controllers/user.controller.ts",
        "models/user.ts",
        "repositories/user.repository.ts",
        "services/user.service.ts",
      ],
    ],
    "mod:src/shared": [
      "shared",
      "shared",
      0.843,
      [
        "shared/config.ts",
        "shared/database.ts",
        "shared/errors.ts",
        "shared/http.ts",
        "shared/logger.ts",
      ],
    ],
    "mod:src": ["root", "shop-backend", 0.867, ["main.ts"]],
  },
  "ambiguous-boundaries": {
    "mod:src/cart": [
      "feature",
      "cart",
      0.844,
      [
        "cart/cart-rules.ts",
        "cart/cart-service.ts",
        "cart/cart-store.ts",
        "cart/cart-view.ts",
        "cart/cart.ts",
      ],
    ],
    "mod:src/catalog": [
      "feature",
      "catalog",
      0.801,
      [
        "catalog/category-tree.ts",
        "catalog/inventory.ts",
        "catalog/product-repository.ts",
        "catalog/product-view.ts",
        "catalog/product.ts",
        "catalog/search.ts",
        "checkout/stock-availability.ts",
      ],
    ],
    "mod:src/checkout": [
      "feature",
      "checkout",
      0.894,
      [
        "checkout/address.ts",
        "checkout/checkout-service.ts",
        "checkout/delivery.ts",
        "checkout/discounts.ts",
        "checkout/invoice.ts",
        "checkout/order-summary.ts",
        "checkout/payment.ts",
        "checkout/shipping-rates.ts",
        "checkout/tax-rules.ts",
        "cart/shipping-estimator.ts",
        "catalog/price-calculator.ts",
      ],
    ],
    "mod:src/common": [
      "shared",
      "common",
      0.558,
      ["common/format.ts", "common/session.ts", "common/slug.ts", "common/validation.ts"],
    ],
    "mod:src": ["root", "coffee-shop", 0.867, ["server.ts"]],
  },
  "clean-architecture": {
    "mod:src/application": [
      "layer",
      "application",
      0.551,
      [
        "application/borrow-book.ts",
        "application/dto.ts",
        "application/return-book.ts",
        "application/send-overdue-reminders.ts",
      ],
    ],
    "mod:src/domain": [
      "layer",
      "domain",
      0.78,
      [
        "domain/index.ts",
        "domain/model/book.ts",
        "domain/model/errors.ts",
        "domain/model/loan.ts",
        "domain/model/member.ts",
        "domain/ports/book-repository.ts",
        "domain/ports/clock.ts",
        "domain/ports/loan-repository.ts",
        "domain/ports/member-repository.ts",
        "domain/ports/notifier.ts",
      ],
    ],
    "mod:src/infrastructure": [
      "layer",
      "infrastructure",
      0.6,
      [
        "infrastructure/notifications/smtp-notifier.ts",
        "infrastructure/persistence/pool.ts",
        "infrastructure/persistence/sql-book-repository.ts",
        "infrastructure/persistence/sql-loan-repository.ts",
        "infrastructure/persistence/sql-member-repository.ts",
        "infrastructure/system-clock.ts",
      ],
    ],
    "mod:src/presentation": [
      "layer",
      "presentation",
      0.797,
      [
        "presentation/http/error-mapper.ts",
        "presentation/http/http-types.ts",
        "presentation/http/loan-routes.ts",
        "presentation/http/server.ts",
      ],
    ],
    "mod:src": ["root", "library-lending", 0.867, ["main.ts"]],
  },
  "tangled-architecture": {
    "mod:src/cart": [
      "feature",
      "cart",
      0.551,
      [
        "cart/abandonment.ts",
        "cart/cart-repository.ts",
        "cart/cart-service.ts",
        "cart/cart-stats.ts",
        "cart/cart.ts",
      ],
    ],
    "mod:src/catalog": [
      "feature",
      "catalog",
      0.644,
      [
        "catalog/index.ts",
        "catalog/pricing.ts",
        "catalog/product-service.ts",
        "catalog/product.ts",
        "catalog/recommendations.ts",
      ],
    ],
    "mod:src/checkout": [
      "feature",
      "checkout",
      0.548,
      [
        "checkout/checkout-service.ts",
        "checkout/order-history.ts",
        "checkout/order.ts",
        "checkout/payment.ts",
        "checkout/receipts.ts",
      ],
    ],
    "mod:src/customers": [
      "feature",
      "customers",
      0.576,
      [
        "customers/addresses.ts",
        "customers/customer-service.ts",
        "customers/customer.ts",
        "customers/loyalty.ts",
        "customers/segments.ts",
      ],
    ],
    "mod:src/inventory": [
      "feature",
      "inventory",
      0.695,
      [
        "inventory/reservations.ts",
        "inventory/stock-level.ts",
        "inventory/stock-service.ts",
        "inventory/subscribers.ts",
        "inventory/warehouses.ts",
      ],
    ],
    "mod:src/lib": ["shared", "lib", 0.92, ["lib/db.ts", "lib/events.ts", "lib/money.ts"]],
    "mod:src": ["root", "corner-shop", 0.867, ["main.ts"]],
  },
  "dependency-violations": {
    "mod:analytics": [
      "declared",
      "analytics",
      undefined,
      ["analytics/events.ts", "analytics/tracker.ts"],
    ],
    "mod:payments": [
      "declared",
      "payments",
      undefined,
      ["payments/checkout.ts", "payments/payment-gateway.ts", "payments/refunds.ts"],
    ],
    "mod:src#customer": [
      "stem",
      "customers",
      0.751,
      [
        "controllers/customer.controller.ts",
        "domain/customer.ts",
        "repositories/customer.repository.ts",
        "services/customer.service.ts",
      ],
    ],
    "mod:src#order": [
      "stem",
      "orders",
      0.68,
      [
        "controllers/order.controller.ts",
        "domain/order.ts",
        "repositories/order.repository.ts",
        "services/order.service.ts",
      ],
    ],
    "mod:src#refund": [
      "stem",
      "refund",
      0.725,
      ["controllers/refund.controller.ts", "services/refund.service.ts"],
    ],
    "mod:src/repositories": ["layer", "repositories", 0.367, ["repositories/database.ts"]],
    "mod:src": ["root", "order-backend", 0.75, ["config.ts", "main.ts"]],
  },
};

/** The stage on a design fixture's prototype graph, with dependency-violations' declared modules. */
function design(fixture: string): Run & { readonly model: ArchitectureModel } {
  const model = prototypeModel(fixture);
  const declared = fixture === "dependency-violations" ? dependencyViolationsDeclared(model) : [];
  return { model, ...run(model, { declared }) };
}

describe("inferModules on the design prototype's graphs (§3.16; plan 6.4 Done, review #8)", () => {
  for (const [fixture, rows] of Object.entries(SECTION_3_16)) {
    it(`reproduces §3.16 for ${fixture}: ids, kinds, names, member lists and confidences`, () => {
      const { model, settings, result } = design(fixture);
      expect(ids(result)).toEqual(Object.keys(rows).sort(compareStrings));
      for (const module of result.modules) {
        const row = rows[module.id];
        if (row === undefined) throw new Error(`unexpected ${module.id}`);
        const [kind, name, confidence, members] = row;
        expect(kindOf(module), module.id).toBe(kind);
        expect(module.name, module.id).toBe(name);
        expect(module.files, module.id).toEqual(underSrc(members));
        // §3.16 rounds to three decimals.
        expect(module.inference?.confidence.toFixed(3), module.id).toBe(confidence?.toFixed(3));
      }
      expect(result.diagnostics).toEqual([]);
      const declared =
        fixture === "dependency-violations" ? dependencyViolationsDeclared(model) : [];
      checkStage(model, declared, settings, result, 10);
    });
  }

  it("replays §3.13's worked example: mod:src#payment 0.807 (0.750, 0.800, 1.000, 0.714)", () => {
    const payment = moduleOf(design("layered-architecture").result, "mod:src#payment");
    expect(payment).toEqual({
      id: "mod:src#payment",
      name: "payments",
      origin: "inferred",
      anchor: { directory: "src", stem: "payment" },
      packages: ["pkg:npm:"],
      files: underSrc([
        "controllers/payment.controller.ts",
        "models/payment.ts",
        "repositories/payment.repository.ts",
        "services/payment-gateway.ts",
        "services/payment.service.ts",
      ]),
      entryPoints: [],
      // D-63: the members other modules' files import (the composition root, orders and users).
      publicApi: underSrc([
        "controllers/payment.controller.ts",
        "repositories/payment.repository.ts",
        "services/payment-gateway.ts",
        "services/payment.service.ts",
      ]),
      inference: {
        confidence: 0.807142857,
        method: "katedrala/module-inference@1",
        reason:
          "Inferred: files with the name stem `payment` in 4 layer directories of `src` form a connected " +
          "group; 75% of their dependency weight stays inside.",
        evidence: [
          {
            signal: "internal-edge-ratio",
            description:
              "75% of the dependency weight of member files stays inside the module (internal 4.5, " +
              "crossing 3.0).",
            value: 0.75,
            weight: 0.4,
          },
          {
            signal: "membership-margin",
            description:
              "On average, member files are 80 percentage points more connected to this module than to " +
              "any other; 1 of 5 members is contested.",
            value: 0.8,
            weight: 0.25,
            // §3.13: `payment.service.ts` is used by payments 1.0 and orders 1.0, margin 0 (D-47).
            entities: ["file:src/services/payment.service.ts"],
          },
          {
            signal: "prior-agreement",
            description:
              "The members match the file-name stem `payment` across 4 layer directories exactly " +
              "(Jaccard 1.00).",
            value: 1,
            weight: 0.2,
          },
          {
            signal: "module-size",
            description: "The module has 5 member files.",
            value: 0.714285714,
            weight: 0.15,
          },
          {
            signal: "file-stem",
            description:
              "Inferred from the file-name stem `payment`, which recurs across the layer directories of " +
              "`src`.",
            entities: ["dir:src"],
          },
          {
            signal: "organization-style",
            description:
              "Directory classification (Katedrala heuristic, directory vocabulary): `src` has 4 layer " +
              "directories (controllers, models, repositories and services) and 1 shared directory " +
              "(shared), so it is organized by layer; file-name stems order, payment and user recur " +
              "across its layer directories and cover 14 of 14 files.",
            value: 1,
            entities: [
              "dir:src/controllers",
              "dir:src/models",
              "dir:src/repositories",
              "dir:src/services",
              "dir:src/shared",
            ],
          },
        ],
      },
    });
  });

  it("counts every wiring member of layered-architecture's root once: 0.867, not 1.167 (review #10)", () => {
    const { result } = design("layered-architecture");
    const root = moduleOf(result, "mod:src");
    expect(valueOf(root, "wiring-share")).toBe(1);
    expect(root.inference?.confidence).toBe(0.866666667);
    expect(entries(root, "composition-roots")).toEqual([
      {
        signal: "composition-roots",
        description:
          "Treated as a composition root by the orchestrator rules (Katedrala heuristic) and not counted " +
          "as evidence: `src/main.ts` (entry-point rule: a declared entry point that nothing in its " +
          "package depends on).",
        value: 1,
        entities: ["file:src/main.ts"],
      },
    ]);
    // §3.16: `shared` has shared-usage 0.80; its four utilities are pinned and named (D-49).
    const shared = moduleOf(result, "mod:src/shared");
    expect(valueOf(shared, "shared-usage")).toBe(0.8);
    expect(entries(shared, "utility-files")[0]?.entities).toEqual(
      underSrc(["shared/database.ts", "shared/errors.ts", "shared/http.ts", "shared/logger.ts"]),
    );
  });

  it("explains ambiguous-boundaries' three relocations with §3.9's weights and the grab bag", () => {
    const { result } = design("ambiguous-boundaries");
    const checkout = moduleOf(result, "mod:src/checkout");
    expect(entries(checkout, "relocated-files")).toEqual([
      {
        signal: "relocated-files",
        description:
          "Reassigned here by the strict-majority rule (Katedrala heuristic): " +
          "`src/cart/shipping-estimator.ts` has 2 of its 2 dependents (weight 2.0 of 2.0) and all of its " +
          "dependencies (2.0 of 2.0) in this module.",
        value: 1,
        entities: ["file:src/cart/shipping-estimator.ts"],
      },
      {
        signal: "relocated-files",
        description:
          "Reassigned here by the strict-majority rule (Katedrala heuristic): " +
          "`src/catalog/price-calculator.ts` has 3 of its 4 dependents (weight 3.0 of 4.0) and all of its " +
          "dependencies (2.0 of 2.0) in this module.",
        value: 0.75,
        entities: ["file:src/catalog/price-calculator.ts"],
      },
    ]);
    expect(entries(moduleOf(result, "mod:src/catalog"), "relocated-files")).toEqual([
      {
        signal: "relocated-files",
        description:
          "Reassigned here by the strict-majority rule (Katedrala heuristic): " +
          "`src/checkout/stock-availability.ts` has 2 of its 2 dependents (weight 2.0 of 2.0) and all of " +
          "its dependencies (1.5 of 1.5) in this module.",
        value: 1,
        entities: ["file:src/checkout/stock-availability.ts"],
      },
    ]);
    const cart = moduleOf(result, "mod:src/cart");
    expect(entries(cart, "relocated-files")).toEqual([]);
    expect(entries(cart, "prior-agreement")[0]).toMatchObject({
      value: 0.833333333,
      entities: ["file:src/cart/shipping-estimator.ts"],
    });
    // §3.16: "only `format.ts` is genuinely shared".
    const common = moduleOf(result, "mod:src/common");
    expect(entries(common, "shared-usage")[0]).toMatchObject({
      value: 0.25,
      entities: ["file:src/common/format.ts"],
    });
    expect(entries(common, "single-user-files")).toEqual([
      {
        signal: "single-user-files",
        description:
          "3 files are used by only one other module: session (cart), slug (catalog) and validation " +
          "(checkout).",
        value: 3,
        entities: underSrc(["common/session.ts", "common/slug.ts", "common/validation.ts"]),
      },
    ]);
  });

  it("gives clean-architecture's domain its barrel as entry point and an import-based publicApi (D-63)", () => {
    const { result } = design("clean-architecture");
    const domain = moduleOf(result, "mod:src/domain");
    expect(domain.entryPoints).toEqual(["file:src/domain/index.ts"]);
    expect(domain.publicApi).toContain("file:src/domain/index.ts");
    expect(domain.publicApi).not.toContain("file:src/domain/ports/member-repository.ts");
    expect(domain.publicApi).toHaveLength(9);
    expect(entries(domain, "facade-files")[0]?.entities).toEqual(["file:src/domain/index.ts"]);
    // §3.16: the low internal-edge-ratio of `application` (0.235).
    expect(
      valueOf(moduleOf(result, "mod:src/application"), "internal-edge-ratio")?.toFixed(3),
    ).toBe("0.235");
  });

  it("keeps tangled-architecture's feature directories, with §3.16's low cohesion and margins", () => {
    const { result } = design("tangled-architecture");
    const features = result.modules.filter((module) => kindOf(module) === "feature");
    expect(features.map((module) => module.name)).toEqual([
      "cart",
      "catalog",
      "checkout",
      "customers",
      "inventory",
    ]);
    // §3.16: internal-edge-ratio 0.39–0.73 and margins 0.21–0.40 (here to three decimals).
    const ratios = features.map((module) => valueOf(module, "internal-edge-ratio") ?? Number.NaN);
    const margins = features.map((module) => valueOf(module, "membership-margin") ?? Number.NaN);
    expect(Math.min(...ratios).toFixed(3)).toBe("0.385");
    expect(Math.max(...ratios).toFixed(3)).toBe("0.727");
    expect(Math.min(...margins).toFixed(3)).toBe("0.209");
    expect(Math.max(...margins).toFixed(3)).toBe("0.400");
    expect(valueOf(moduleOf(result, "mod:src/lib"), "shared-usage")).toBe(1);
    for (const module of result.modules) expect(entries(module, "relocated-files")).toEqual([]);
  });

  it("keeps dependency-violations' declared modules exact and out of every inferred module (§3.14)", () => {
    const { model, result } = design("dependency-violations");
    const declared = result.modules.filter((module) => module.origin === "declared");
    expect(declared).toEqual([
      {
        id: "mod:analytics",
        name: "analytics",
        origin: "declared",
        packages: ["pkg:npm:"],
        files: underSrc(["analytics/events.ts", "analytics/tracker.ts"]),
        entryPoints: [],
        publicApi: ["file:src/analytics/tracker.ts"],
      },
      {
        id: "mod:payments",
        name: "payments",
        origin: "declared",
        packages: ["pkg:npm:"],
        files: underSrc([
          "payments/checkout.ts",
          "payments/payment-gateway.ts",
          "payments/refunds.ts",
        ]),
        entryPoints: [],
        publicApi: underSrc([
          "payments/checkout.ts",
          "payments/payment-gateway.ts",
          "payments/refunds.ts",
        ]),
      },
    ]);
    const declaredFiles = new Set(declared.flatMap((module) => module.files));
    for (const module of result.modules.filter((candidate) => candidate.origin === "inferred")) {
      for (const file of module.files) expect(declaredFiles.has(file)).toBe(false);
    }
    // Every source file is in exactly one module (18 files: 5 declared, 13 inferred).
    const sources = model.document.files.filter((file) => file.role === "source");
    expect(result.modules.flatMap((module) => module.files).sort(compareStrings)).toEqual(
      sources.map((file) => file.id).sort(compareStrings),
    );
  });
});

// ─── Assembly on synthetic models ─────────────────────────────────────────────────────────────────────

/** Two feature directories with tests and declarations to attach (P7) and imports for the public API (P8). */
const ATTACHING: SyntheticModelSpec = {
  files: [
    "src/orders/order.ts",
    "src/orders/order-service.ts",
    "src/orders/order-repository.ts",
    "src/payments/payment.ts",
    "src/payments/gateway.ts",
    { path: "src/orders/order.spec.ts", role: "test" },
    { path: "src/payments/mixed.test.ts", role: "test" },
    { path: "src/orders/order.d.ts", role: "declaration" },
    { path: "src/types.d.ts", role: "declaration" },
  ],
  packages: [{ path: "", name: "shop" }],
  edges: [
    ["src/orders/order-service.ts", "src/orders/order.ts"],
    ["src/orders/order-repository.ts", "src/orders/order.ts"],
    ["src/orders/order-service.ts", "src/orders/order-repository.ts"],
    ["src/payments/payment.ts", "src/payments/gateway.ts"],
    ["src/payments/payment.ts", "src/orders/order.ts"],
    // A type-only import makes a member public only when the metrics projection counts type-only edges.
    { source: "src/payments/gateway.ts", target: "src/orders/order-repository.ts", typeOnly: true },
    // A call is no import: it does not make `order-service.ts` public (D-63).
    { source: "src/payments/gateway.ts", target: "src/orders/order-service.ts", kind: "calls" },
    // The spec depends on orders only: a strict majority (D-65).
    ["src/orders/order.spec.ts", "src/orders/order.ts"],
    ["src/orders/order.spec.ts", "src/orders/order-service.ts"],
    // One dependency in each module: no majority, so a test falls back on location (D-42).
    ["src/payments/mixed.test.ts", "src/orders/order.ts"],
    ["src/payments/mixed.test.ts", "src/payments/payment.ts"],
    // Two of three dependents in orders: a majority, although payments imports it too.
    { source: "src/orders/order.ts", target: "src/orders/order.d.ts", typeOnly: true },
    { source: "src/orders/order-service.ts", target: "src/orders/order.d.ts", typeOnly: true },
    { source: "src/payments/payment.ts", target: "src/orders/order.d.ts", typeOnly: true },
    // One dependent in each module: no majority, and declarations never fall back on location (D-65).
    { source: "src/orders/order.ts", target: "src/types.d.ts", kind: "uses" },
    { source: "src/payments/payment.ts", target: "src/types.d.ts", kind: "uses" },
  ],
};

/** The file roles of the metrics projection with `analysis.include_tests_in_metrics`. */
const METRICS_ROLES_WITH_TESTS: ReadonlySet<FileRole> = new Set<FileRole>([
  "declaration",
  "source",
  "test",
]);

/** The metrics projection with `analysis.include_tests_in_metrics` (`metricsProjectionOptions`). */
const METRICS_WITH_TESTS: ProjectionOptions = {
  edgeKinds: new Set(DEFAULT_EDGE_KINDS),
  includeTypeOnly: true,
  fileRoles: METRICS_ROLES_WITH_TESTS,
};

describe("inferModules: assembly of the module drafts", () => {
  it("returns declared and inferred drafts in identifier order, canonical as produced", () => {
    const { model, settings, result } = design("dependency-violations");
    expect(ids(result)).toEqual([
      "mod:analytics",
      "mod:payments",
      "mod:src",
      "mod:src#customer",
      "mod:src#order",
      "mod:src#refund",
      "mod:src/repositories",
    ]);
    checkStage(model, dependencyViolationsDeclared(model), settings, result, 10);
    // Plan 4.8: canonicalizing the drafts as entities changes nothing.
    const entities: ModuleEntity[] = result.modules.map((module) => ({
      ...module,
      components: [],
      dependencies: [],
      dependents: [],
    }));
    expect(canonicalizeDocument({ ...emptyDocument(), modules: entities }).modules).toEqual(
      entities,
    );
  });

  it("appends ~inferred to an inferred module whose key is a declared module's name (§3.10)", () => {
    const model = syntheticModel({
      files: ["legacy/a.ts", "legacy/b.ts", "src/old/x.ts", "src/new/y.ts"],
      edges: [["legacy/a.ts", "legacy/b.ts"]],
    });
    const declared = [{ name: "legacy", files: [fileId("src/old/x.ts")] }];
    const { settings, result } = run(model, { declared });
    expect(
      result.modules.map((module) => [module.id, module.anchor?.directory, paths(module.files)]),
    ).toEqual([
      ["mod:legacy", undefined, ["src/old/x.ts"]],
      ["mod:legacy~inferred", "legacy", ["legacy/a.ts", "legacy/b.ts"]],
      ["mod:src/new", "src/new", ["src/new/y.ts"]],
    ]);
    checkStage(model, declared, settings, result, 10);
  });

  it("produces declared modules only when module inference is off (D-21)", () => {
    const model = prototypeModel("layered-architecture");
    const declared = [{ name: "config", files: [fileId("src/shared/config.ts")] }];
    const onlyDeclared = ["mod:config"];
    // `enabled: false` disables inferred modules even when modules are declared.
    expect(ids(run(model, { config: { modules: { enabled: false } } }).result)).toEqual([]);
    expect(ids(run(model, { config: { modules: { enabled: false } }, declared }).result)).toEqual(
      onlyDeclared,
    );
    // `when_declared: none` applies only when a module is declared.
    const none: InferenceConfiguration = { modules: { when_declared: "none" } };
    expect(ids(run(model, { config: none, declared }).result)).toEqual(onlyDeclared);
    const everything = run(model, { config: none }).result;
    expect(everything.modules.map((module) => [module.id, module.files])).toEqual(
      run(model).result.modules.map((module) => [module.id, module.files]),
    );
    // D-56: the parameter is part of the module method.
    expect(everything.modules[0]?.inference?.method).toBe(
      "katedrala/module-inference@1?when_declared=none",
    );
    // `infer-rest` infers the other files' modules.
    const rest = run(model, { declared });
    expect(ids(rest.result)).toEqual([
      "mod:config",
      "mod:src",
      "mod:src#order",
      "mod:src#payment",
      "mod:src#user",
      "mod:src/shared",
    ]);
    expect(moduleOf(rest.result, "mod:src/shared").files).not.toContain(
      "file:src/shared/config.ts",
    );
    checkStage(model, declared, rest.settings, rest.result, 10);
  });

  it("returns no module for a repository without files to group", () => {
    const model = syntheticModel({ files: [{ path: "README.md", role: "documentation" }] });
    expect(run(model).result).toEqual({ modules: [], diagnostics: [] });
    // A declared module is kept without files, with its warning (D-71).
    const { result } = run(model, { declared: [{ name: "docs", files: [fileId("README.md")] }] });
    expect(result.modules).toEqual([
      {
        id: "mod:docs",
        name: "docs",
        origin: "declared",
        packages: [],
        files: [],
        entryPoints: [],
        publicApi: [],
      },
    ]);
    expect(result.diagnostics).toHaveLength(1);
  });

  it("passes the declared modules' warnings through, located at the configuration file (D-23, D-24, D-71)", () => {
    const model = syntheticModel({
      files: ["src/a/one.ts", "src/a/two.ts", "src/b/three.ts", "src/c/four.ts"],
    });
    const configurationFile = fileId("katedrala.config.yaml");
    // Specs in any order: the first by name keeps the overlap (D-23).
    const declared: DeclaredModuleSpec[] = [
      { name: "zeta", files: [fileId("src/a/one.ts"), fileId("src/a/two.ts")] },
      {
        name: "alpha",
        files: [fileId("src/a/one.ts"), fileId("src/a/two.ts"), fileId("src/b/three.ts")],
      },
      { name: "empty", files: [] },
    ];
    const { settings, result } = run(model, {
      declared,
      configurationFile,
      limits: { maxEvidenceEntities: 1 },
    });
    expect(result.diagnostics).toEqual([
      {
        code: "configuration-warning",
        severity: "warning",
        message: 'Declared module "empty" matches no file; it is kept without member files',
        file: "file:katedrala.config.yaml",
      },
      {
        code: "configuration-warning",
        severity: "warning",
        message:
          'Files match several declared modules: 2 files match both "alpha" and "zeta", and the first by ' +
          'name ("alpha") keeps them: src/a/one.ts and 1 more',
        file: "file:katedrala.config.yaml",
      },
    ]);
    expect(result.modules.map((module) => [module.id, paths(module.files)])).toEqual([
      ["mod:alpha", ["src/a/one.ts", "src/a/two.ts", "src/b/three.ts"]],
      ["mod:empty", []],
      ["mod:src/c", ["src/c/four.ts"]],
      ["mod:zeta", []],
    ]);
    checkStage(model, declared, settings, result, 1);
  });

  it("reports limit-reached for a scope whose reassignment stopped at max_passes (D-37)", () => {
    // Every link is used by `b/u1` and `b/u2` and uses the next link: one link follows per pass.
    const links = ["src/a/l0.ts", "src/a/l1.ts", "src/a/l2.ts", "src/a/l3.ts"];
    const users = ["src/b/u1.ts", "src/b/u2.ts"];
    const model = syntheticModel({
      files: [...links, ...users],
      packages: [{ path: "", name: "chain" }],
      edges: links.flatMap((link, index): SyntheticEdgeSpec[] => [
        ...users.map((user) => ({ source: user, target: link })),
        ...(index + 1 < links.length ? [{ source: link, target: links[index + 1] ?? "" }] : []),
      ]),
    });
    const converged = run(model);
    expect(converged.result.diagnostics).toEqual([]);
    expect(moduleOf(converged.result, "mod:src/b").files).toEqual(
      [...links, ...users].map(fileId).sort(compareStrings),
    );
    const limited = run(model, { config: { modules: { max_passes: 3 } } });
    expect(limited.result.diagnostics).toEqual([
      {
        code: "limit-reached",
        severity: "info",
        message:
          "Module reassignment in package chain stopped after 3 passes with moves pending; memberships " +
          "may depend on the pass limit (inference.modules.max_passes)",
      },
    ]);
    // Three links followed; the first is still in `src/a`.
    const rest = moduleOf(limited.result, "mod:src/a");
    expect(paths(rest.files)).toEqual(["src/a/l0.ts"]);
    expect(rest.inference?.method).toBe("katedrala/module-inference@1?max_passes=3");
    checkStage(model, [], limited.settings, limited.result, 10);
  });

  it("lists attached tests and declarations as members for navigation only (D-63, D-64, D-65)", () => {
    const model = syntheticModel(ATTACHING);
    const { settings, result } = run(model);
    expect(ids(result)).toEqual(["mod:src/orders", "mod:src/payments"]);
    const orders = moduleOf(result, "mod:src/orders");
    const payments = moduleOf(result, "mod:src/payments");
    expect(orders.files).toEqual(
      underSrc([
        "orders/order.ts",
        "orders/order-service.ts",
        "orders/order-repository.ts",
        "orders/order.spec.ts",
        "orders/order.d.ts",
      ]),
    );
    expect(payments.files).toEqual(
      underSrc(["payments/payment.ts", "payments/gateway.ts", "payments/mixed.test.ts"]),
    );
    // `src/types.d.ts` has one dependent in each module: unassigned (D-65).
    expect(result.modules.flatMap((module) => module.files)).not.toContain("file:src/types.d.ts");
    expect(entries(orders, "attached-files")).toEqual([
      {
        signal: "attached-files",
        description:
          "Attached for navigation (Katedrala heuristic): 1 test file and 1 declaration file; 2 by a " +
          "strict majority of the modules they depend on (tests) or that depend on them (declarations), 0 " +
          "by location.",
        value: 2,
        entities: underSrc(["orders/order.d.ts", "orders/order.spec.ts"]),
      },
    ]);
    expect(entries(payments, "attached-files")).toEqual([
      {
        signal: "attached-files",
        description:
          "Attached for navigation (Katedrala heuristic): 1 test file and 0 declaration files; 0 by a " +
          "strict majority of the modules they depend on, 1 by location in `src/payments`.",
        value: 1,
        entities: ["file:src/payments/mixed.test.ts"],
      },
    ]);
    // Attached files count in no measurement (§3.11) and are never public (D-63): `order.d.ts` is imported
    // by `payment.ts`, `order-service.ts` only called.
    expect(entries(orders, "module-size")[0]?.description).toBe(
      "The module has 3 member files, not counting 2 attached files.",
    );
    expect(orders.publicApi).toEqual(underSrc(["orders/order.ts", "orders/order-repository.ts"]));
    expect(payments.publicApi).toEqual([]);
    expect(orders.packages).toEqual(["pkg:npm:"]);
    checkStage(model, [], settings, result, 10);
  });

  it("attaches tests counted in metrics by strict majority only (D-65)", () => {
    const model = syntheticModel(ATTACHING);
    const { settings, result } = run(model, {
      includeTestsInMetrics: true,
      projection: METRICS_WITH_TESTS,
    });
    expect(paths(moduleOf(result, "mod:src/orders").files)).toContain("src/orders/order.spec.ts");
    expect(paths(moduleOf(result, "mod:src/payments").files)).toEqual([
      "src/payments/gateway.ts",
      "src/payments/payment.ts",
    ]);
    expect(moduleOf(result, "mod:src/orders").inference?.method).toBe(
      "katedrala/module-inference@1?analysis.include_tests_in_metrics=true",
    );
    checkStage(model, [], settings, result, 10);
  });

  it("follows the attachment flags", () => {
    const model = syntheticModel(ATTACHING);
    const files = (config: InferenceConfiguration): string[] =>
      run(model, { config }).result.modules.flatMap((module) => paths(module.files));
    expect(files({ modules: { attach_tests: false } })).not.toContain("src/orders/order.spec.ts");
    expect(files({ modules: { attach_tests: false } })).toContain("src/orders/order.d.ts");
    expect(files({ modules: { attach_declarations: false } })).toContain(
      "src/orders/order.spec.ts",
    );
    expect(files({ modules: { attach_declarations: false } })).not.toContain(
      "src/orders/order.d.ts",
    );
  });

  it("computes publicApi under the metrics projection's type-only setting (D-63)", () => {
    const model = syntheticModel(ATTACHING);
    const { result } = run(model, {
      projection: { ...METRICS_PROJECTION, includeTypeOnly: false },
    });
    // The type-only import of `order-repository.ts` no longer counts; memberships do not change (D-02).
    expect(moduleOf(result, "mod:src/orders").publicApi).toEqual(["file:src/orders/order.ts"]);
    expect(result.modules.map((module) => module.files)).toEqual(
      run(model).result.modules.map((module) => module.files),
    );
  });

  it("bounds evidence entities and relocations by limits.maxEvidenceEntities (D-72)", () => {
    const model = prototypeModel("ambiguous-boundaries");
    const { settings, result } = run(model, { limits: { maxEvidenceEntities: 1 } });
    const checkout = moduleOf(result, "mod:src/checkout");
    expect(entries(checkout, "relocated-files").map((evidence) => evidence.entities)).toEqual([
      ["file:src/cart/shipping-estimator.ts"],
    ]);
    expect(entries(checkout, "relocated-files-omitted")).toEqual([
      {
        signal: "relocated-files-omitted",
        description:
          "1 further file was reassigned here; entries are limited by limits.maxEvidenceEntities.",
        value: 1,
      },
    ]);
    checkStage(model, [], settings, result, 1);
  });

  it("keeps inferred modules inside one package and lets declared modules span packages (§3.4, D-65)", () => {
    const model = prototypeModel("monorepo");
    const declared = [
      {
        name: "money",
        files: [
          fileId("packages/core/src/orders/order.ts"),
          fileId("packages/shared/src/money.ts"),
        ],
      },
    ];
    const { settings, result } = run(model, { declared });
    expect(moduleOf(result, "mod:money").packages).toEqual([
      "pkg:npm:packages/core",
      "pkg:npm:packages/shared",
    ]);
    for (const module of result.modules.filter((candidate) => candidate.origin === "inferred")) {
      expect(module.packages, module.id).toHaveLength(1);
    }
    checkStage(model, declared, settings, result, 10);
    // Without declarations: §3.16's modules per package, each anchored inside its package.
    expect(ids(run(model).result)).toEqual([
      "mod:packages/api/src",
      "mod:packages/api/src/handlers",
      "mod:packages/core/src",
      "mod:packages/core/src/catalog",
      "mod:packages/core/src/orders",
      "mod:packages/shared/src",
      "mod:packages/web/src",
      "mod:packages/web/src/components",
    ]);
  });

  it("attaches nestjs-app's spec by location and says so (D-64)", () => {
    const { result } = run(prototypeModel("nestjs-app"));
    const orders = moduleOf(result, "mod:src/orders");
    expect(orders.files).toContain("file:src/orders/orders.service.spec.ts");
    expect(entries(orders, "attached-files")[0]?.description).toBe(
      "Attached for navigation (Katedrala heuristic): 1 test file and 0 declaration files; 0 by a strict " +
        "majority of the modules they depend on, 1 by location in `src/orders`.",
    );
    expect(orders.publicApi).not.toContain("file:src/orders/orders.service.spec.ts");
  });
});

// ─── Properties ───────────────────────────────────────────────────────────────────────────────────────

const DIRECTORIES = [
  "src",
  "src/orders",
  "src/orders/sub",
  "src/payments",
  "src/controllers",
  "src/services",
  "src/models",
  "src/shared",
  "test",
  "pkgs/a/src",
  "pkgs/a/src/util",
  "pkgs/a/src/controllers",
  "pkgs/a/src/services",
  "pkgs/b",
  "pkgs/b/lib",
] as const;
const NAMES = [
  "order.ts",
  "order.service.ts",
  "order.controller.ts",
  "payment.ts",
  "payment.service.ts",
  "payment.controller.ts",
  "user.model.ts",
  "index.ts",
  "util.ts",
  "a.ts",
  "b.ts",
] as const;
const ROLES: readonly FileRole[] = [
  "source",
  "source",
  "source",
  "source",
  "source",
  "test",
  "declaration",
  "configuration",
  "generated",
];
const KINDS: readonly EdgeKind[] = [
  "imports",
  "imports",
  "re-exports",
  "uses",
  "calls",
  "references-type",
];

/** A random model with packages, roles, edges and entry points, random declarations and settings. */
const arbitraryCase = fc
  .record({
    files: fc.uniqueArray(
      fc.record({
        directory: fc.constantFrom(...DIRECTORIES),
        name: fc.constantFrom(...NAMES),
        role: fc.constantFrom(...ROLES),
      }),
      {
        minLength: 4,
        maxLength: 28,
        size: "medium",
        selector: (file) => `${file.directory}/${file.name}`,
      },
    ),
    packages: fc.subarray(["", "pkgs/a", "pkgs/b"]),
    edges: fc.array(
      fc.record({
        source: fc.nat(),
        target: fc.nat(),
        kind: fc.constantFrom(...KINDS),
        typeOnly: fc.boolean(),
        confidence: fc.constantFrom(1, 1, 0.7, 0.3),
      }),
      { maxLength: 70, size: "medium" },
    ),
    entryPoints: fc.array(fc.nat(), { maxLength: 3 }),
    declared: fc.uniqueArray(
      fc.record({
        name: fc.constantFrom("alpha", "beta", "src", "src/orders", "pkgs/a/src"),
        files: fc.array(fc.nat(), { maxLength: 6 }),
      }),
      { maxLength: 3, selector: (spec) => spec.name },
    ),
    config: fc.record({
      enabled: fc.constantFrom(true, true, true, false),
      when_declared: fc.constantFrom<"infer-rest" | "none">("infer-rest", "infer-rest", "none"),
      file_roles: fc.constantFrom<FileRole[][]>(["source"], ["source"], ["source", "test"]),
      type_only_weight: fc.constantFrom(0, 0.25, 0.5, 1),
      max_module_files: fc.integer({ min: 2, max: 8 }),
      min_module_files: fc.integer({ min: 1, max: 2 }),
      max_passes: fc.integer({ min: 1, max: 4 }),
      attach_tests: fc.boolean(),
      attach_declarations: fc.boolean(),
    }),
    includeTestsInMetrics: fc.boolean(),
    includeTypeOnly: fc.boolean(),
    maxEvidenceEntities: fc.integer({ min: 0, max: 4 }),
  })
  .map((drawn) => {
    const files: SyntheticFileSpec[] = drawn.files.map((file) => ({
      path: `${file.directory}/${file.name}`,
      role: file.role,
    }));
    const pathAt = (index: number): string => files[index % Math.max(1, files.length)]?.path ?? "";
    const edges: SyntheticEdgeSpec[] =
      files.length === 0
        ? []
        : drawn.edges
            .map((edge) => ({ ...edge, source: pathAt(edge.source), target: pathAt(edge.target) }))
            .filter((edge) => edge.source !== edge.target);
    const spec: SyntheticModelSpec = {
      files,
      packages: drawn.packages.map((path) => ({ path, name: path === "" ? "root" : `@x/${path}` })),
      edges,
      entryPoints: files.length === 0 ? [] : [...new Set(drawn.entryPoints.map(pathAt))],
    };
    const declared: DeclaredModuleSpec[] = drawn.declared.map((entry) => ({
      name: entry.name,
      files:
        files.length === 0
          ? []
          : [...new Set(entry.files.map((index) => fileId(pathAt(index))))].sort(compareStrings),
    }));
    return { drawn, spec, declared };
  });

describe("inferModules: properties (plan 7.1)", () => {
  it("keeps the partition, identity and InferenceInfo invariants on random models (property)", () => {
    /** How often the generator reached each module kind, relocations and attachments. */
    const reached = new Map<string, number>();
    const count = (what: string, times = 1): void => {
      reached.set(what, (reached.get(what) ?? 0) + times);
    };
    fc.assert(
      fc.property(arbitraryCase, ({ drawn, spec, declared }) => {
        const model = syntheticModel(spec);
        const projection: ProjectionOptions = {
          edgeKinds: new Set(DEFAULT_EDGE_KINDS),
          includeTypeOnly: drawn.includeTypeOnly,
          fileRoles: drawn.includeTestsInMetrics
            ? METRICS_ROLES_WITH_TESTS
            : new Set<FileRole>(DEFAULT_FILE_ROLES),
        };
        const { settings, result } = run(model, {
          config: { modules: drawn.config },
          includeTestsInMetrics: drawn.includeTestsInMetrics,
          declared,
          projection,
          limits: { maxEvidenceEntities: drawn.maxEvidenceEntities },
        });
        checkStage(model, declared, settings, result, drawn.maxEvidenceEntities);
        for (const diagnostic of result.diagnostics) {
          expect(["configuration-warning", "limit-reached"]).toContain(diagnostic.code);
        }
        for (const module of result.modules) {
          count(kindOf(module));
          if (entries(module, "relocated-files").length > 0) count("relocated");
          count("attached", valueOf(module, "attached-files") ?? 0);
        }
      }),
      { seed: 20261009, numRuns: 150 },
    );
    // The generator reaches every kind of module, relocations and attachments.
    for (const what of ["declared", "root", "feature", "layer", "shared", "stem", "split"]) {
      expect(reached.get(what) ?? 0, what).toBeGreaterThan(0);
    }
    expect(reached.get("relocated") ?? 0).toBeGreaterThan(0);
    expect(reached.get("attached") ?? 0).toBeGreaterThan(10);
  });

  it("does not depend on the order of the document's arrays or of the declarations (property)", () => {
    const fixtures = prototypeFixtureNames();
    const expected = new Map(
      fixtures.map((fixture) => {
        const model = prototypeModel(fixture);
        const declared =
          fixture === "dependency-violations" ? dependencyViolationsDeclared(model) : [];
        return [
          fixture,
          { model, declared, result: JSON.stringify(run(model, { declared }).result) },
        ];
      }),
    );
    fc.assert(
      fc.property(
        fc.constantFrom(...fixtures),
        fc.integer({ min: 1, max: 2 ** 31 - 1 }),
        (fixture, seed) => {
          const entry = expected.get(fixture);
          if (entry === undefined) throw new Error(`no expectation for ${fixture}`);
          // D-23: neither the order of the declarations nor that of their files carries meaning.
          const reversed = [...entry.declared]
            .reverse()
            .map((spec) => ({ ...spec, files: [...spec.files].reverse() }));
          expect(
            JSON.stringify(run(shuffledModel(entry.model, seed), { declared: reversed }).result),
          ).toBe(entry.result);
        },
      ),
      { seed: 20261009, numRuns: 30 },
    );
    fc.assert(
      fc.property(
        arbitraryCase,
        fc.integer({ min: 1, max: 2 ** 31 - 1 }),
        ({ drawn, spec, declared }, seed) => {
          const model = syntheticModel(spec);
          const options: RunOptions = {
            config: { modules: drawn.config },
            includeTestsInMetrics: drawn.includeTestsInMetrics,
            declared,
            limits: { maxEvidenceEntities: drawn.maxEvidenceEntities },
          };
          const reversed: RunOptions = { ...options, declared: [...declared].reverse() };
          expect(JSON.stringify(run(shuffledModel(model, seed), reversed).result)).toBe(
            JSON.stringify(run(model, options).result),
          );
        },
      ),
      { seed: 20261010, numRuns: 60 },
    );
  });
});
