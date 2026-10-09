import { compareStrings, fileId, inferredModuleKey, moduleId, roundMetric } from "@katedrala/ir";
import type { Evidence, FileId, InferenceInfo } from "@katedrala/ir";
import type { ArchitectureModel } from "@katedrala/model";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolveInferenceSettings } from "../settings.js";
import { prototypeModel, syntheticModel } from "../test-support.js";
import type {
  ClusterUnit,
  DeclaredModuleSpec,
  InferenceSettings,
  Relocation,
  Scope,
  ScopeClustering,
  UnitKind,
} from "../types.js";
import { MODULE_SIGNAL_WEIGHTS, moduleSignals } from "./confidence.js";
import {
  DEPENDENCY_VIOLATIONS_DECLARED,
  DESIGN_CLUSTERINGS,
} from "./design-clusterings.test-support.js";
import { MODULE_KIND_SIGNALS, explainScope, reassignmentLimitDiagnostic } from "./explain.js";
import {
  METRICS_PROJECTION,
  entryPointFiles,
  handGroup,
  handStage,
} from "./hand-built.test-support.js";
import type { HandClusteringSpec, HandStage } from "./hand-built.test-support.js";
import { moduleScopes } from "./scopes.js";

const METHOD = "katedrala/module-inference@1";

/** The stage on hand-built clusterings and the explanation of every inferred module, by module id. */
interface Explained {
  readonly stage: HandStage;
  readonly infos: ReadonlyMap<string, InferenceInfo>;
}

function explain(
  model: ArchitectureModel,
  cluster: (scope: Scope) => HandClusteringSpec,
  options: {
    readonly settings?: InferenceSettings;
    readonly declared?: readonly DeclaredModuleSpec[];
    readonly maxEntities?: number;
    /** Changes the clusterings before they are explained (classes the hand-built format cannot state). */
    readonly adjust?: (clustering: ScopeClustering) => void;
  } = {},
): Explained {
  const stage = handStage(model, cluster, {
    ...(options.settings === undefined ? {} : { settings: options.settings }),
    ...(options.declared === undefined ? {} : { declared: options.declared }),
  });
  const entryPoints = entryPointFiles(model);
  const infos = new Map<string, InferenceInfo>();
  stage.inferred.forEach((scoped, index) => {
    options.adjust?.(scoped.clustering);
    const explained = explainScope({
      scoped,
      signals: moduleSignals(scoped.clustering, entryPoints),
      attachments: stage.attachments.units[index] ?? [],
      settings: stage.settings,
      entryPoints,
      maxEntities: options.maxEntities ?? 10,
    });
    explained.forEach((info, unit) => infos.set(scoped.ids[unit] ?? "?", info));
  });
  return { stage, infos };
}

/** The InferenceInfo of a module. */
function infoOf(explained: Explained, id: string): InferenceInfo {
  const info = explained.infos.get(id);
  if (info === undefined) throw new Error(`no module ${id}`);
  return info;
}

/** The evidence entries of a signal. */
function entries(info: InferenceInfo, signal: string): Evidence[] {
  return info.evidence.filter((evidence) => evidence.signal === signal);
}

/** The single evidence entry of a signal. */
function entry(info: InferenceInfo, signal: string): Evidence {
  const found = entries(info, signal);
  if (found.length !== 1) throw new Error(`${signal}: ${found.length} entries`);
  return found[0]!;
}

/** The description of the single evidence entry of a signal of a module. */
function text(explained: Explained, id: string, signal: string): string {
  return entry(infoOf(explained, id), signal).description;
}

/**
 * The invariants of every InferenceInfo (plan 4.6, 7.1 "InferenceInfo"): reason "Inferred:", the method,
 * the weighted signals of the kind first (each listed, absent values included, D-45) in the order of 4.6,
 * weights summing to 1, confidence = Σ weight × value of the rounded entries within 1e-8, values in [0, 1],
 * one kind signal (D-48), entities sorted and bounded.
 */
function checkInfo(info: InferenceInfo, kind: UnitKind, maxEntities = 10, method = METHOD): void {
  expect(info.reason.startsWith("Inferred: "), info.reason).toBe(true);
  expect(info.method).toBe(method);
  const weights = MODULE_SIGNAL_WEIGHTS[kind];
  const weighted = info.evidence.slice(0, weights.length);
  expect(weighted.map((evidence) => evidence.signal).sort(compareStrings)).toEqual(
    weights.map((weight) => weight.signal).sort(compareStrings),
  );
  for (const evidence of info.evidence.slice(weights.length))
    expect(evidence.weight).toBeUndefined();
  let total = 0;
  let recomputed = 0;
  let previous = Number.POSITIVE_INFINITY;
  for (const evidence of weighted) {
    const weight = evidence.weight ?? Number.NaN;
    total += weight;
    const contribution = weight * (evidence.value ?? 0);
    recomputed += contribution;
    expect(contribution).toBeLessThanOrEqual(previous);
    previous = contribution;
    if (evidence.value !== undefined) {
      expect(evidence.value).toBeGreaterThanOrEqual(0);
      expect(evidence.value).toBeLessThanOrEqual(1);
    }
  }
  expect(total).toBeCloseTo(1, 12);
  expect(Math.abs(recomputed - info.confidence)).toBeLessThan(1e-8);
  expect(info.confidence).toBeGreaterThanOrEqual(0);
  expect(info.confidence).toBeLessThanOrEqual(1);
  expect(entries(info, MODULE_KIND_SIGNALS[kind])).toHaveLength(1);
  for (const other of Object.values(MODULE_KIND_SIGNALS)) {
    if (other !== MODULE_KIND_SIGNALS[kind]) expect(entries(info, other)).toEqual([]);
  }
  for (const evidence of info.evidence) {
    const list = evidence.entities ?? [];
    expect(list).toEqual([...list].sort(compareStrings));
    expect(list.length).toBeLessThanOrEqual(maxEntities);
  }
}

// ─── Design replays ─────────────────────────────────────────────────────────────────────────────────────

/** The explanations of a design fixture's hand-built clustering on its prototype graph (§3.16). */
function design(name: string): Explained & { readonly kinds: ReadonlyMap<string, UnitKind> } {
  const model = prototypeModel(name);
  const spec = DESIGN_CLUSTERINGS[name];
  if (spec === undefined) throw new Error(`no design clustering for ${name}`);
  const declared: DeclaredModuleSpec[] =
    name === "dependency-violations"
      ? Object.entries(DEPENDENCY_VIOLATIONS_DECLARED).map(([module, prefix]) => ({
          name: module,
          files: model.document.files
            .filter((file) => file.path.startsWith(prefix))
            .map((file) => file.id)
            .sort(compareStrings),
        }))
      : [];
  const explained = explain(model, () => spec, { declared });
  const kinds = new Map<string, UnitKind>();
  for (const { clustering, ids } of explained.stage.inferred) {
    clustering.units.forEach((unit, index) => kinds.set(ids[index] ?? "?", unit.kind));
  }
  return { ...explained, kinds };
}

describe("MODULE_KIND_SIGNALS (D-48)", () => {
  it("names one context signal per unit kind", () => {
    expect(MODULE_KIND_SIGNALS).toEqual({
      feature: "feature-directory",
      layer: "layer-directory",
      shared: "shared-directory",
      root: "root-files",
      stem: "file-stem",
      split: "split-piece",
    });
    expect(Object.isFrozen(MODULE_KIND_SIGNALS)).toBe(true);
  });
});

describe("explainScope on the design's prototype graphs (§3.13, §3.16, §5.2)", () => {
  it("replays §3.13's worked example: mod:src#payment 0.807 (0.750, 0.800, 1.000, 0.714)", () => {
    expect(infoOf(design("layered-architecture"), "mod:src#payment")).toEqual({
      confidence: 0.807142857,
      method: METHOD,
      reason:
        "Inferred: files with the name stem `payment` in 4 layer directories of `src` form a connected " +
        "group; 75% of their dependency weight stays inside.",
      evidence: [
        {
          signal: "internal-edge-ratio",
          weight: 0.4,
          value: 0.75,
          description:
            "75% of the dependency weight of member files stays inside the module (internal 4.5, " +
            "crossing 3.0).",
        },
        {
          signal: "membership-margin",
          weight: 0.25,
          value: 0.8,
          description:
            "On average, member files are 80 percentage points more connected to this module than to " +
            "any other; 1 of 5 members is contested.",
          entities: ["file:src/services/payment.service.ts"],
        },
        {
          signal: "prior-agreement",
          weight: 0.2,
          value: 1,
          description:
            "The members match the file-name stem `payment` across 4 layer directories exactly " +
            "(Jaccard 1.00).",
        },
        {
          signal: "module-size",
          weight: 0.15,
          value: 0.714285714,
          description: "The module has 5 member files.",
        },
        {
          signal: "file-stem",
          description:
            "Inferred from the file-name stem `payment`, which recurs across the layer directories of `src`.",
          entities: ["dir:src"],
        },
        {
          signal: "organization-style",
          value: 1,
          description:
            "Directory classification (Katedrala heuristic, directory vocabulary): `src` has 4 layer " +
            "directories (controllers, models, repositories and services) and 1 shared directory " +
            "(shared), so it is organized by layer; file-name stems order, payment and user recur " +
            "across its layer directories and cover 14 of 14 files.",
          entities: [
            "dir:src/controllers",
            "dir:src/models",
            "dir:src/repositories",
            "dir:src/services",
            "dir:src/shared",
          ],
        },
      ],
    });
  });

  const expected: Record<string, Record<string, number>> = {
    "layered-architecture": {
      "mod:src#payment": 0.807,
      "mod:src#order": 0.888,
      "mod:src#user": 0.73,
      "mod:src/shared": 0.843,
      "mod:src": 0.867,
    },
    "ambiguous-boundaries": {
      "mod:src/cart": 0.844,
      "mod:src/catalog": 0.801,
      "mod:src/checkout": 0.894,
      "mod:src/common": 0.558,
      "mod:src": 0.867,
    },
    "clean-architecture": {
      "mod:src/application": 0.551,
      "mod:src/domain": 0.78,
      "mod:src/infrastructure": 0.6,
      "mod:src/presentation": 0.797,
      "mod:src": 0.867,
    },
    "tangled-architecture": {
      "mod:src/cart": 0.551,
      "mod:src/catalog": 0.644,
      "mod:src/checkout": 0.548,
      "mod:src/customers": 0.576,
      "mod:src/inventory": 0.695,
      "mod:src/lib": 0.92,
      "mod:src": 0.867,
    },
    "dependency-violations": {
      "mod:src#customer": 0.751,
      "mod:src#order": 0.68,
      "mod:src#refund": 0.725,
      "mod:src/repositories": 0.367,
      "mod:src": 0.75,
    },
  };

  for (const [fixture, modules] of Object.entries(expected)) {
    it(`publishes §3.16's confidences of ${fixture}, with every invariant of 4.6`, () => {
      const replay = design(fixture);
      expect([...replay.infos.keys()].sort(compareStrings)).toEqual(
        Object.keys(modules).sort(compareStrings),
      );
      for (const [id, confidence] of Object.entries(modules)) {
        const info = infoOf(replay, id);
        expect(Number(info.confidence.toFixed(3)), id).toBe(confidence);
        checkInfo(info, replay.kinds.get(id) ?? "feature");
      }
    });
  }

  it("words layered-architecture's root, utilities and shared usage as §5.2 and D-66 ask", () => {
    const layered = design("layered-architecture");
    const root = infoOf(layered, "mod:src");
    expect(root.reason).toBe(
      "Inferred: the top-level files of `src` (1 file); it is treated as a composition root, barrel or " +
        "declared entry point.",
    );
    expect(entry(root, "wiring-share")).toEqual({
      signal: "wiring-share",
      weight: 0.3,
      value: 1,
      description: "Its only member file is a composition root, barrel or declared entry point.",
      entities: ["file:src/main.ts"],
    });
    expect(entry(root, "composition-roots")).toEqual({
      signal: "composition-roots",
      value: 1,
      description:
        "Treated as a composition root by the orchestrator rules (Katedrala heuristic) and not counted " +
        "as evidence: `src/main.ts` (entry-point rule: a declared entry point that nothing in its " +
        "package depends on).",
      entities: ["file:src/main.ts"],
    });
    expect(text(layered, "mod:src", "root-files")).toBe(
      "Inferred from the top-level files of `src`.",
    );
    const shared = infoOf(layered, "mod:src/shared");
    expect(shared.reason).toBe(
      "Inferred: shared directory `src/shared`; 4 of 5 files are used by two or more other modules.",
    );
    expect(entry(shared, "shared-usage")).toEqual({
      signal: "shared-usage",
      weight: 0.5,
      value: 0.8,
      description:
        "4 of 5 files are used by two or more other modules (composition roots do not count as users).",
      entities: [
        "file:src/shared/database.ts",
        "file:src/shared/errors.ts",
        "file:src/shared/http.ts",
        "file:src/shared/logger.ts",
      ],
    });
    expect(entry(shared, "utility-files")).toEqual({
      signal: "utility-files",
      value: 4,
      description:
        "Treated as shared utilities by the utility rule (Katedrala heuristic), pinned and not counted " +
        "as evidence: `src/shared/database.ts` (its dependents lie in 3 other units); " +
        "`src/shared/errors.ts` (its dependents lie in 3 other units); `src/shared/http.ts` (its " +
        "dependents lie in 3 other units); `src/shared/logger.ts` (its dependents lie in 2 other units).",
      entities: [
        "file:src/shared/database.ts",
        "file:src/shared/errors.ts",
        "file:src/shared/http.ts",
        "file:src/shared/logger.ts",
      ],
    });
    expect(text(layered, "mod:src/shared", "shared-directory")).toBe(
      "Inferred from the shared directory `src/shared`.",
    );
    // §3.16: shared is a classified child of the layer-organized `src`.
    expect(entry(shared, "organization-style").value).toBe(1);
  });

  it("explains ambiguous-boundaries' relocations and grab bag (§3.9, §3.16)", () => {
    const ambiguous = design("ambiguous-boundaries");
    const checkout = infoOf(ambiguous, "mod:src/checkout");
    expect(entries(checkout, "relocated-files")).toEqual([
      {
        signal: "relocated-files",
        value: 1,
        description:
          "Reassigned here by the strict-majority rule (Katedrala heuristic): " +
          "`src/cart/shipping-estimator.ts` has 2 of its 2 dependents (weight 2.0 of 2.0) and all of " +
          "its dependencies (2.0 of 2.0) in this module.",
        entities: ["file:src/cart/shipping-estimator.ts"],
      },
      {
        signal: "relocated-files",
        value: 0.75,
        description:
          "Reassigned here by the strict-majority rule (Katedrala heuristic): " +
          "`src/catalog/price-calculator.ts` has 3 of its 4 dependents (weight 3.0 of 4.0) and all of " +
          "its dependencies (2.0 of 2.0) in this module.",
        entities: ["file:src/catalog/price-calculator.ts"],
      },
    ]);
    expect(checkout.reason).toMatch(
      /^Inferred: directory `src\/checkout` with 2 files reassigned in and 1 out; \d+% of the dependency weight stays inside\.$/,
    );
    expect(text(ambiguous, "mod:src/checkout", "prior-agreement")).toBe(
      "The members match directory `src/checkout` except 3 relocated files (Jaccard 0.75).",
    );
    expect(entry(checkout, "prior-agreement").entities).toEqual([
      "file:src/cart/shipping-estimator.ts",
      "file:src/catalog/price-calculator.ts",
      "file:src/checkout/stock-availability.ts",
    ]);
    expect(text(ambiguous, "mod:src/catalog", "relocated-files")).toBe(
      "Reassigned here by the strict-majority rule (Katedrala heuristic): " +
        "`src/checkout/stock-availability.ts` has 2 of its 2 dependents (weight 2.0 of 2.0) and all of " +
        "its dependencies (1.5 of 1.5) in this module.",
    );
    expect(infoOf(ambiguous, "mod:src/cart").reason).toMatch(
      /^Inferred: directory `src\/cart` with 1 file reassigned out; \d+% of the dependency weight stays inside\.$/,
    );
    const common = infoOf(ambiguous, "mod:src/common");
    expect(common.reason).toBe(
      "Inferred: shared directory `src/common`; 1 of 4 files is used by two or more other modules.",
    );
    expect(entry(common, "single-user-files")).toEqual({
      signal: "single-user-files",
      value: 3,
      description:
        "3 files are used by only one other module: session (cart), slug (catalog) and validation " +
        "(checkout).",
      entities: [
        "file:src/common/session.ts",
        "file:src/common/slug.ts",
        "file:src/common/validation.ts",
      ],
    });
    expect(entry(common, "shared-usage")).toMatchObject({
      value: 0.25,
      description:
        "1 of 4 files is used by two or more other modules (composition roots do not count as users).",
      entities: ["file:src/common/format.ts"],
    });
    expect(text(ambiguous, "mod:src/cart", "organization-style")).toBe(
      "Directory classification (Katedrala heuristic, directory vocabulary): `src` has 3 feature " +
        "directories (cart, catalog and checkout) and 1 shared directory (common), so it is organized " +
        "by feature.",
    );
    expect(entry(infoOf(ambiguous, "mod:src/cart"), "organization-style").value).toBeUndefined();
    expect(text(ambiguous, "mod:src/cart", "feature-directory")).toBe(
      "Inferred from the feature directory `src/cart`.",
    );
  });

  it("explains clean-architecture's layer directories and barrel (§3.16, D-49)", () => {
    const clean = design("clean-architecture");
    const domain = infoOf(clean, "mod:src/domain");
    expect(domain.reason).toBe(
      "Inferred: layer directory `src/domain` in a layer-organized source tree; no file-name stem " +
        "recurs across its layers.",
    );
    expect(text(clean, "mod:src/domain", "layer-directory")).toBe(
      "Inferred from the layer directory `src/domain`.",
    );
    expect(entry(domain, "organization-style")).toEqual({
      signal: "organization-style",
      value: 0,
      description:
        "Directory classification (Katedrala heuristic, directory vocabulary): `src` has 4 layer " +
        "directories (application, domain, infrastructure and presentation), so it is organized by " +
        "layer; no file-name stem recurs across its layer directories in connected files, so the layer " +
        "directories stay modules.",
      entities: [
        "dir:src/application",
        "dir:src/domain",
        "dir:src/infrastructure",
        "dir:src/presentation",
      ],
    });
    expect(entry(domain, "facade-files")).toEqual({
      signal: "facade-files",
      value: 1,
      description:
        "Treated as a barrel by the facade rule (Katedrala heuristic) and pinned to its directory: " +
        "`src/domain/index.ts` (9 of its 9 dependencies are re-exports).",
      entities: ["file:src/domain/index.ts"],
    });
    // 4 layer weights: internal-edge-ratio 0.50, prior-agreement 0.30, module-size 0.20.
    expect(domain.evidence.slice(0, 3).map((evidence) => evidence.weight)).toEqual([0.5, 0.3, 0.2]);
  });

  it("explains tangled-architecture's utilities inside feature modules (§3.16, D-66)", () => {
    const tangled = design("tangled-architecture");
    expect(text(tangled, "mod:src/customers", "utility-files")).toBe(
      "Treated as a shared utility by the utility rule (Katedrala heuristic), pinned and not counted as " +
        "evidence: `src/customers/loyalty.ts` (its dependents lie in 3 other units).",
    );
    expect(text(tangled, "mod:src/lib", "utility-files")).toBe(
      "Treated as shared utilities by the utility rule (Katedrala heuristic), pinned and not counted as " +
        "evidence: `src/lib/db.ts` (its dependents lie in 5 other units); `src/lib/events.ts` (its " +
        "dependents lie in 2 other units); `src/lib/money.ts` (its dependents lie in 3 other units).",
    );
    expect(infoOf(tangled, "mod:src/catalog").reason).toMatch(
      /^Inferred: directory `src\/catalog`; \d+% of the dependency weight stays inside\.$/,
    );
  });

  it("explains dependency-violations' stem and layer modules next to declared ones (§3.14)", () => {
    const violations = design("dependency-violations");
    expect(infoOf(violations, "mod:src#refund").reason).toMatch(
      /^Inferred: files with the name stem `refund` in 2 layer directories of `src` form a connected group; \d+% of their dependency weight stays inside\.$/,
    );
    expect(infoOf(violations, "mod:src/repositories").reason).toBe(
      "Inferred: layer directory `src/repositories` in a layer-organized source tree; the files left in " +
        "it share no recurring file-name stem.",
    );
    expect(text(violations, "mod:src#customer", "organization-style")).toBe(
      "Directory classification (Katedrala heuristic, directory vocabulary): `src` has 4 layer " +
        "directories (controllers, domain, repositories and services), so it is organized by layer; " +
        "file-name stems customer, order and refund recur across its layer directories and cover 10 of " +
        "11 files.",
    );
    expect(violations.infos.has("mod:payments")).toBe(false);
  });
});

// ─── Synthetic scenarios: every description and reason variant (D-66 wording) ──────────────────────

describe("files outside packages, no evidence, entry-point rule (D-45, D-66)", () => {
  const model = syntheticModel({
    files: ["main.ts", "cli.ts", "lib/a.ts", "lib/b.ts"],
    edges: [
      ["main.ts", "lib/a.ts"],
      ["main.ts", "cli.ts"],
    ],
    entryPoints: ["main.ts", "cli.ts"],
  });
  const explained = explain(model, () => ({
    units: [
      { anchor: { directory: "" }, kind: "root", members: ["main.ts", "cli.ts"] },
      { anchor: { directory: "lib" }, kind: "feature", members: ["lib/a.ts", "lib/b.ts"] },
    ],
    orchestrators: { "main.ts": [1, 1], "cli.ts": [1, 0] },
  }));

  it("lists absent signals with their weight and why they are absent (D-45)", () => {
    expect(infoOf(explained, "mod:lib")).toEqual({
      confidence: 0.275,
      method: METHOD,
      reason:
        "Inferred: directory `lib`; no member has dependency evidence among the files outside packages.",
      evidence: [
        {
          signal: "prior-agreement",
          weight: 0.2,
          value: 1,
          description: "The members match directory `lib` exactly (Jaccard 1.00).",
        },
        {
          signal: "module-size",
          weight: 0.15,
          value: 0.5,
          description: "The module has 2 member files.",
        },
        {
          signal: "internal-edge-ratio",
          weight: 0.4,
          description:
            "No member file has a dependency or dependent among the files outside packages that counts " +
            "as evidence (those of composition roots and utilities do not), so cohesion is not measured " +
            "and the signal contributes 0.",
        },
        {
          signal: "membership-margin",
          weight: 0.25,
          description:
            "No member file has dependents or dependencies among the files outside packages that count " +
            "as evidence (those of composition roots and utilities do not), so the margin is not " +
            "measured and the signal contributes 0.",
        },
        {
          signal: "feature-directory",
          description: "Inferred from the feature directory `lib`.",
          entities: ["dir:lib"],
        },
      ],
    });
  });

  it("words the entry-point rule outside packages and the root at the analysis root", () => {
    expect(infoOf(explained, "mod:.")).toEqual({
      confidence: 0.9,
      method: METHOD,
      reason:
        "Inferred: the top-level files of `.` (2 files); 2 are treated as composition roots, barrels or " +
        "declared entry points.",
      evidence: [
        {
          signal: "prior-agreement",
          weight: 0.5,
          value: 1,
          description: "The members match the top-level files of `.` exactly (Jaccard 1.00).",
        },
        {
          signal: "wiring-share",
          weight: 0.3,
          value: 1,
          description: "2 of 2 files are composition roots, barrels or declared entry points.",
          entities: ["file:cli.ts", "file:main.ts"],
        },
        {
          signal: "module-size",
          weight: 0.2,
          value: 0.5,
          description: "The module has 2 member files.",
        },
        {
          signal: "composition-roots",
          value: 2,
          description:
            "Treated as composition roots by the orchestrator rules (Katedrala heuristic) and not " +
            "counted as evidence: `cli.ts` (entry-point rule: a declared entry point that only " +
            "composition roots outside packages depend on); `main.ts` (entry-point rule: a declared " +
            "entry point that no file outside packages depends on).",
          entities: ["file:cli.ts", "file:main.ts"],
        },
        {
          signal: "root-files",
          description: "Inferred from the top-level files of `.`.",
          entities: ["dir:"],
        },
      ],
    });
  });
});

describe("composition roots, barrels and root modules in packages (D-49, D-66)", () => {
  const model = syntheticModel({
    files: [
      "app/main.ts",
      "app/index.ts",
      "app/wire.ts",
      "app/boot.ts",
      "app/start.ts",
      "app/facade.ts",
      "app/helper.ts",
      "app/jobs/runner.ts",
      "app/jobs/task.ts",
      "app/x/x.ts",
      "app/y/y.ts",
      "b/src/one.ts",
      "c/src/x.ts",
      "c/src/y.ts",
      "c/src/z.ts",
      "d/src/x.ts",
      "d/src/y.ts",
    ],
    packages: [{ path: "app", name: "@acme/app" }, "b", "c", "d"],
    entryPoints: ["app/main.ts", "app/index.ts", "app/boot.ts", "app/start.ts", "d/src/x.ts"],
    edges: [
      ["app/main.ts", "app/index.ts"],
      ["app/helper.ts", "app/wire.ts"],
      ["app/jobs/runner.ts", "app/boot.ts"],
      { source: "app/boot.ts", target: "app/x/x.ts", kind: "re-exports" },
      { source: "app/facade.ts", target: "app/x/x.ts", kind: "re-exports" },
      ["app/facade.ts", "app/y/y.ts"],
      { source: "app/index.ts", target: "app/x/x.ts", kind: "re-exports" },
      { source: "app/index.ts", target: "app/y/y.ts", kind: "re-exports" },
      ["app/jobs/task.ts", "app/x/x.ts"],
    ],
  });
  const cluster = (scope: Scope): HandClusteringSpec => {
    switch (scope.directory) {
      case "app":
        return {
          units: [
            {
              anchor: { directory: "app" },
              kind: "root",
              members: [
                "app/main.ts",
                "app/index.ts",
                "app/wire.ts",
                "app/boot.ts",
                "app/start.ts",
                "app/facade.ts",
                "app/helper.ts",
              ],
            },
            {
              anchor: { directory: "app/jobs" },
              kind: "feature",
              members: ["app/jobs/runner.ts", "app/jobs/task.ts"],
            },
            { anchor: { directory: "app/x" }, kind: "feature", members: ["app/x/x.ts"] },
            { anchor: { directory: "app/y" }, kind: "feature", members: ["app/y/y.ts"] },
          ],
          orchestrators: {
            "app/main.ts": [1, 1],
            "app/index.ts": [1, 2],
            "app/wire.ts": [2, 3],
            "app/boot.ts": [2, 2],
            "app/start.ts": [2, 4],
            "app/facade.ts": [2, 2],
            "app/jobs/runner.ts": [2, 2],
          },
          facades: ["app/index.ts", "app/boot.ts", "app/facade.ts"],
        };
      case "b":
        return {
          units: [{ anchor: { directory: "b/src" }, kind: "root", members: ["b/src/one.ts"] }],
        };
      case "c":
        return {
          units: [
            {
              anchor: { directory: "c/src" },
              kind: "root",
              members: ["c/src/x.ts", "c/src/y.ts", "c/src/z.ts"],
            },
          ],
        };
      default:
        return {
          units: [
            { anchor: { directory: "d/src" }, kind: "root", members: ["d/src/x.ts", "d/src/y.ts"] },
          ],
        };
    }
  };
  const explained = explain(model, cluster);

  it("says which composition roots are declared entry points or barrels, before their rule", () => {
    const app = infoOf(explained, "mod:app");
    expect(entry(app, "composition-roots")).toEqual({
      signal: "composition-roots",
      value: 6,
      description:
        "Treated as composition roots by the orchestrator rules (Katedrala heuristic) and not counted " +
        "as evidence: " +
        "`app/boot.ts` (a declared entry point and barrel; shape rule: only composition roots outside " +
        "its unit depend on it; its dependencies spread over 2 other units, none above 50%); " +
        "`app/facade.ts` (a barrel; shape rule: nothing outside its unit depends on it; its " +
        "dependencies spread over 2 other units, none above 50%); " +
        "`app/index.ts` (entry-point rule: a declared entry point and barrel that only composition " +
        "roots in its package depend on); " +
        "`app/main.ts` (entry-point rule: a declared entry point that nothing in its package depends " +
        "on); " +
        "`app/start.ts` (a declared entry point; shape rule: nothing outside its unit depends on it; " +
        "its dependencies spread over 4 other units, none above 50%); " +
        "`app/wire.ts` (shape rule: nothing outside its unit depends on it; its dependencies spread " +
        "over 3 other units, none above 50%).",
      entities: [
        "file:app/boot.ts",
        "file:app/facade.ts",
        "file:app/index.ts",
        "file:app/main.ts",
        "file:app/start.ts",
        "file:app/wire.ts",
      ],
    });
    expect(text(explained, "mod:app/jobs", "composition-roots")).toBe(
      "Treated as a composition root by the orchestrator rules (Katedrala heuristic) and not counted as " +
        "evidence: `app/jobs/runner.ts` (shape rule: nothing outside its unit depends on it; its " +
        "dependencies spread over 2 other units, none above 50%).",
    );
  });

  it("names the share of re-exports of every barrel", () => {
    expect(entry(infoOf(explained, "mod:app"), "facade-files")).toEqual({
      signal: "facade-files",
      value: 3,
      description:
        "Treated as barrels by the facade rule (Katedrala heuristic) and pinned to their directory: " +
        "`app/boot.ts` (1 of its 1 dependency is a re-export); `app/facade.ts` (1 of its 2 " +
        "dependencies is a re-export); `app/index.ts` (2 of its 2 dependencies are re-exports).",
      entities: ["file:app/boot.ts", "file:app/facade.ts", "file:app/index.ts"],
    });
  });

  it("counts every wiring member once and words root modules by their wiring share (review #10)", () => {
    const app = infoOf(explained, "mod:app");
    expect(app.reason).toBe(
      "Inferred: the top-level files of `app` (7 files); 6 are treated as composition roots, barrels or " +
        "declared entry points.",
    );
    expect(entry(app, "wiring-share")).toMatchObject({
      value: 0.857142857,
      description: "6 of 7 files are composition roots, barrels or declared entry points.",
    });
    expect(app.confidence).toBe(roundMetric(0.3 * (6 / 7) + 0.5 + 0.2 * (7 / 9)));
    const b = infoOf(explained, "mod:b/src");
    expect(b.reason).toBe(
      "Inferred: the top-level files of `b/src` (1 file); it is not treated as a composition root, " +
        "barrel or declared entry point.",
    );
    expect(entry(b, "wiring-share")).toEqual({
      signal: "wiring-share",
      weight: 0.3,
      value: 0,
      description:
        "Its only member file is not a composition root, barrel or declared entry point.",
    });
    expect(infoOf(explained, "mod:c/src").reason).toBe(
      "Inferred: the top-level files of `c/src` (3 files); none is treated as a composition root, " +
        "barrel or declared entry point.",
    );
    expect(text(explained, "mod:c/src", "wiring-share")).toBe(
      "0 of 3 files are composition roots, barrels or declared entry points.",
    );
    expect(infoOf(explained, "mod:d/src").reason).toBe(
      "Inferred: the top-level files of `d/src` (2 files); 1 is treated as a composition root, barrel or " +
        "declared entry point.",
    );
    expect(entry(infoOf(explained, "mod:d/src"), "wiring-share")).toMatchObject({
      value: 0.5,
      description: "1 of 2 files is a composition root, barrel or declared entry point.",
      entities: ["file:d/src/x.ts"],
    });
    for (const [id, info] of explained.infos)
      checkInfo(
        info,
        id === "mod:app/jobs" || id === "mod:app/x" || id === "mod:app/y" ? "feature" : "root",
      );
  });

  it("bounds the per-file clauses and the entities by limits.maxEvidenceEntities", () => {
    const bounded = explain(model, cluster, { maxEntities: 4 });
    const app = infoOf(bounded, "mod:app");
    const roots = entry(app, "composition-roots");
    expect(roots.description).toMatch(
      /^Treated as composition roots .*: `app\/boot\.ts` \(.*\); `app\/facade\.ts` \(.*\); `app\/index\.ts` \(.*\); `app\/main\.ts` \(.*\); and 2 more\.$/,
    );
    expect(roots.value).toBe(6);
    expect(roots.entities).toEqual([
      "file:app/boot.ts",
      "file:app/facade.ts",
      "file:app/index.ts",
      "file:app/main.ts",
    ]);
    expect(entry(app, "wiring-share").entities).toHaveLength(4);
    for (const [id, info] of bounded.infos) {
      checkInfo(
        info,
        id === "mod:app/jobs" || id === "mod:app/x" || id === "mod:app/y" ? "feature" : "root",
        4,
      );
    }
    // With no clause allowed, only the count remains.
    const none = explain(model, cluster, { maxEntities: 0 });
    expect(text(none, "mod:app", "composition-roots")).toBe(
      "Treated as composition roots by the orchestrator rules (Katedrala heuristic) and not counted as " +
        "evidence: 6 files.",
    );
    expect(entry(infoOf(none, "mod:app"), "composition-roots").entities).toBeUndefined();
  });

  it("falls back to naming the orchestrator rules when the trigger is unknown", () => {
    const unknown = explain(model, cluster, {
      adjust: (clustering) => {
        const node = clustering.scope.graph.indexOf(fileId("app/wire.ts"));
        if (node !== -1) clustering.classes.orchestratorRule[node] = 0;
      },
    });
    expect(text(unknown, "mod:app", "composition-roots")).toContain(
      "`app/wire.ts` (orchestrator rules).",
    );
  });
});

describe("attached tests and declarations (D-64, D-65)", () => {
  const model = syntheticModel({
    files: [
      "src/orders/order.ts",
      "src/orders/service.ts",
      "src/orders/deep/line.ts",
      "src/payments/payment.ts",
      "src/shared/util.ts",
      { path: "test/orders.test.ts", role: "test" },
      { path: "src/orders/deep/x.test.ts", role: "test" },
      { path: "src/orders/y.test.ts", role: "test" },
      { path: "src/payments/p.test.ts", role: "test" },
      { path: "src/orders/types.d.ts", role: "declaration" },
      { path: "src/shared/util.d.ts", role: "declaration" },
    ],
    packages: [{ path: "", name: "shop" }],
    edges: [
      ["test/orders.test.ts", "src/orders/order.ts"],
      ["test/orders.test.ts", "src/orders/service.ts"],
      ["src/payments/p.test.ts", "src/payments/payment.ts"],
      { source: "src/orders/order.ts", target: "src/orders/types.d.ts", typeOnly: true },
      { source: "src/orders/service.ts", target: "src/orders/types.d.ts", typeOnly: true },
      { source: "src/shared/util.ts", target: "src/shared/util.d.ts", typeOnly: true },
      ["src/orders/service.ts", "src/orders/order.ts"],
    ],
  });
  const explained = explain(model, () => ({
    units: [
      {
        anchor: { directory: "src/orders" },
        kind: "feature",
        members: ["src/orders/order.ts", "src/orders/service.ts", "src/orders/deep/line.ts"],
      },
      {
        anchor: { directory: "src/payments" },
        kind: "feature",
        members: ["src/payments/payment.ts"],
      },
      { anchor: { directory: "src/shared" }, kind: "shared", members: ["src/shared/util.ts"] },
    ],
  }));

  it("explains both rules and both roles, and keeps attached files out of the size", () => {
    const orders = infoOf(explained, "mod:src/orders");
    expect(entry(orders, "attached-files")).toEqual({
      signal: "attached-files",
      value: 4,
      description:
        "Attached for navigation (Katedrala heuristic): 3 test files and 1 declaration file; 2 by a " +
        "strict majority of the modules they depend on (tests) or that depend on them (declarations), " +
        "2 by location in `src/orders` and `src/orders/deep`.",
      entities: [
        "file:src/orders/deep/x.test.ts",
        "file:src/orders/types.d.ts",
        "file:src/orders/y.test.ts",
        "file:test/orders.test.ts",
      ],
    });
    expect(text(explained, "mod:src/orders", "module-size")).toBe(
      "The module has 3 member files, not counting 4 attached files.",
    );
    expect(entry(orders, "module-size").value).toBe(0.6);
    expect(text(explained, "mod:src/payments", "attached-files")).toBe(
      "Attached for navigation (Katedrala heuristic): 1 test file and 0 declaration files; 1 by a strict " +
        "majority of the modules they depend on, 0 by location.",
    );
    expect(text(explained, "mod:src/payments", "module-size")).toBe(
      "The module has 1 member file, not counting 1 attached file.",
    );
    expect(text(explained, "mod:src/shared", "attached-files")).toBe(
      "Attached for navigation (Katedrala heuristic): 0 test files and 1 declaration file; 1 by a strict " +
        "majority of the modules that depend on them, 0 by location.",
    );
  });

  it("gives no attached-files entry to modules without attachments", () => {
    const bare = explain(
      model,
      () => ({
        units: [
          {
            anchor: { directory: "src" },
            kind: "feature",
            members: [
              "src/orders/order.ts",
              "src/orders/service.ts",
              "src/orders/deep/line.ts",
              "src/payments/payment.ts",
              "src/shared/util.ts",
            ],
          },
        ],
      }),
      {
        settings: resolveInferenceSettings({
          modules: { attach_tests: false, attach_declarations: false },
        }),
      },
    );
    expect(entries(infoOf(bare, "mod:src"), "attached-files")).toEqual([]);
    expect(text(bare, "mod:src", "module-size")).toBe("The module has 5 member files.");
  });
});

describe("relocations, anchor drift and their bounds (D-36, D-72, D-74)", () => {
  const model = syntheticModel({
    files: [
      "src/a/a1.ts",
      "src/a/a2.ts",
      "src/a#b/odd.ts",
      "src/b/b1.ts",
      "src/b/y.ts",
      "src/c/c1.ts",
      "src/c/c2.ts",
      "src/clients/stripe.client.ts",
      "src/services/x.service.ts",
      "top.ts",
    ],
    edges: [
      ["src/a/a2.ts", "src/a/a1.ts"],
      ["src/b/y.ts", "src/a/a1.ts"],
      ["src/b/b1.ts", "src/a/a2.ts"],
    ],
  });
  const cluster = (): HandClusteringSpec => ({
    units: [
      {
        anchor: { directory: "src/a" },
        kind: "feature",
        members: [
          "src/a/a1.ts",
          "src/a/a2.ts",
          "src/a#b/odd.ts",
          "src/b/y.ts",
          "src/clients/stripe.client.ts",
          "src/services/x.service.ts",
          "top.ts",
        ],
        prior: ["src/a/a1.ts", "src/a/a2.ts"],
      },
      {
        anchor: { directory: "src/b" },
        kind: "feature",
        members: ["src/b/b1.ts", "src/c/c2.ts"],
        prior: ["src/b/b1.ts", "src/b/y.ts"],
      },
      {
        anchor: { directory: "src/c" },
        kind: "feature",
        members: ["src/c/c1.ts"],
        prior: ["src/c/c1.ts", "src/c/c2.ts"],
      },
    ],
    relocations: [
      {
        path: "src/a#b/odd.ts",
        from: inferredModuleKey({ directory: "src/a#b" }),
        to: "src/a",
        dependents: { "src/a": { weight: 1, files: 1 } },
      },
      {
        path: "src/b/y.ts",
        from: "src/b",
        to: "src/a",
        dependents: { "src/a": { weight: 3, files: 3 }, "src/b": { weight: 1, files: 1 } },
        dependencies: { "src/a": 1.5, "src/b": 0.5 },
      },
      {
        path: "src/clients/stripe.client.ts",
        from: "src/clients",
        to: "src/a",
        dependents: { "src/a": { weight: 1, files: 1 } },
        dependencies: { "src/a": 1 },
      },
      {
        path: "src/services/x.service.ts",
        from: "src#x",
        to: "src/a",
        dependents: { "src/a": { weight: 1, files: 1 } },
      },
      {
        path: "top.ts",
        from: ".",
        to: "src/a",
        dependents: { "src/a": { weight: 1, files: 1 } },
        dependencies: { "src/a": 1, "src/b": 0.5 },
      },
      {
        path: "src/c/c2.ts",
        from: "src/c",
        to: "src/b",
        dependents: { "src/b": { weight: 2, files: 2 } },
        dependencies: { "src/b": 1 },
      },
    ],
  });
  const explained = explain(model, cluster);
  const prefix = "Reassigned here by the strict-majority rule (Katedrala heuristic): ";

  it("explains every file moved in, with the lone-file exception of condition 4 when it applied", () => {
    const a = infoOf(explained, "mod:src/a");
    expect(entries(a, "relocated-files")).toEqual([
      {
        signal: "relocated-files",
        value: 1,
        description:
          `${prefix}\`src/a#b/odd.ts\` has 1 of its 1 dependent (weight 1.0 of 1.0) in this module and ` +
          "no dependencies; it was the only file left in `src/a#b`, so one dependent suffices.",
        entities: ["file:src/a#b/odd.ts"],
      },
      {
        signal: "relocated-files",
        value: 0.75,
        description:
          `${prefix}\`src/b/y.ts\` has 3 of its 4 dependents (weight 3.0 of 4.0) and most of its ` +
          "dependency weight (1.5 of 2.0) in this module.",
        entities: ["file:src/b/y.ts"],
      },
      {
        signal: "relocated-files",
        value: 1,
        description:
          `${prefix}\`src/clients/stripe.client.ts\` has 1 of its 1 dependent (weight 1.0 of 1.0) and ` +
          "all of its dependencies (1.0 of 1.0) in this module; it was the only file left in " +
          "`src/clients`, so one dependent suffices.",
        entities: ["file:src/clients/stripe.client.ts"],
      },
      {
        signal: "relocated-files",
        value: 1,
        description:
          `${prefix}\`src/services/x.service.ts\` has 1 of its 1 dependent (weight 1.0 of 1.0) in this ` +
          "module and no dependencies; it was the only file left in the stem group `x` of `src`, so one " +
          "dependent suffices.",
        entities: ["file:src/services/x.service.ts"],
      },
      {
        signal: "relocated-files",
        value: 1,
        description:
          `${prefix}\`top.ts\` has 1 of its 1 dependent (weight 1.0 of 1.0) and most of its dependency ` +
          "weight (1.0 of 1.5) in this module; it was the only file left in `.`, so one dependent " +
          "suffices.",
        entities: ["file:top.ts"],
      },
    ]);
    expect(text(explained, "mod:src/b", "relocated-files")).toBe(
      `${prefix}\`src/c/c2.ts\` has 2 of its 2 dependents (weight 2.0 of 2.0) and all of its ` +
        "dependencies (1.0 of 1.0) in this module.",
    );
    expect(entries(infoOf(explained, "mod:src/c"), "relocated-files")).toEqual([]);
  });

  it("words directory reasons by the files reassigned in and out", () => {
    expect(infoOf(explained, "mod:src/a").reason).toBe(
      "Inferred: directory `src/a` with 5 files reassigned in; 80% of the dependency weight stays inside.",
    );
    expect(infoOf(explained, "mod:src/b").reason).toBe(
      "Inferred: directory `src/b` with 1 file reassigned in and 1 out; 0% of the dependency weight " +
        "stays inside.",
    );
    expect(infoOf(explained, "mod:src/c").reason).toBe(
      "Inferred: directory `src/c` with 1 file reassigned out; no member has dependency evidence among " +
        "the files outside packages.",
    );
  });

  it("names the relocated files in prior agreement", () => {
    expect(entry(infoOf(explained, "mod:src/a"), "prior-agreement")).toEqual({
      signal: "prior-agreement",
      weight: 0.2,
      value: 0.285714286,
      description: "The members match directory `src/a` except 5 relocated files (Jaccard 0.29).",
      entities: [
        "file:src/a#b/odd.ts",
        "file:src/b/y.ts",
        "file:src/clients/stripe.client.ts",
        "file:src/services/x.service.ts",
        "file:top.ts",
      ],
    });
    expect(text(explained, "mod:src/b", "prior-agreement")).toBe(
      "The members match directory `src/b` except 2 relocated files (Jaccard 0.33).",
    );
    expect(text(explained, "mod:src/c", "prior-agreement")).toBe(
      "The members match directory `src/c` except 1 relocated file (Jaccard 0.50).",
    );
  });

  it("reports anchor drift only below one half (§5.2)", () => {
    expect(entry(infoOf(explained, "mod:src/a"), "anchor-drift")).toEqual({
      signal: "anchor-drift",
      value: 0.285714286,
      description: "Only 29% of member files lie under the anchor directory `src/a`.",
    });
    // `src/b` keeps exactly one half of its members under its anchor.
    expect(entries(infoOf(explained, "mod:src/b"), "anchor-drift")).toEqual([]);
    expect(entries(infoOf(explained, "mod:src/c"), "anchor-drift")).toEqual([]);
  });

  it("keeps the entries of the smallest file ids and counts the rest (D-72)", () => {
    const two = infoOf(explain(model, cluster, { maxEntities: 2 }), "mod:src/a");
    expect(entries(two, "relocated-files").map((evidence) => evidence.entities)).toEqual([
      ["file:src/a#b/odd.ts"],
      ["file:src/b/y.ts"],
    ]);
    expect(entry(two, "relocated-files-omitted")).toEqual({
      signal: "relocated-files-omitted",
      value: 3,
      description:
        "3 further files were reassigned here; entries are limited by limits.maxEvidenceEntities.",
    });
    expect(entry(two, "prior-agreement").entities).toEqual([
      "file:src/a#b/odd.ts",
      "file:src/b/y.ts",
    ]);
    checkInfo(two, "feature", 2);
    const four = infoOf(explain(model, cluster, { maxEntities: 4 }), "mod:src/a");
    expect(entries(four, "relocated-files")).toHaveLength(4);
    expect(entry(four, "relocated-files-omitted")).toEqual({
      signal: "relocated-files-omitted",
      value: 1,
      description:
        "1 further file was reassigned here; entries are limited by limits.maxEvidenceEntities.",
    });
    const none = infoOf(explain(model, cluster, { maxEntities: 0 }), "mod:src/a");
    expect(entries(none, "relocated-files")).toEqual([]);
    expect(entry(none, "relocated-files-omitted").value).toBe(5);
  });
});

describe("directory classification and the reasons it gives (§3.6, D-26, D-27, D-70)", () => {
  const model = syntheticModel({
    files: [
      // m: mixed, stems applied; a feature child holds the files of its stem (D-70).
      "m/src/main.ts",
      "m/src/controllers/user.controller.ts",
      "m/src/controllers/order.controller.ts",
      "m/src/controllers/health.controller.ts",
      "m/src/services/user.service.ts",
      "m/src/services/order.service.ts",
      "m/src/services/mail.service.ts",
      "m/src/orders/order.ts",
      "m/src/utils/format.ts",
      // n: stems that cover too few files.
      "n/src/controllers/a.controller.ts",
      "n/src/controllers/b.controller.ts",
      "n/src/services/a.service.ts",
      "n/src/services/b.service.ts",
      // o: one stem applied.
      "o/src/controllers/user.controller.ts",
      "o/src/controllers/x.controller.ts",
      "o/src/services/user.service.ts",
      "o/src/services/y.service.ts",
      // q: one stem that covers too few files.
      "q/src/controllers/c.ts",
      "q/src/services/s.ts",
      // r: one layer directory, style none.
      "r/src/index.ts",
      "r/src/services/s.ts",
      "r/src/utils/u.ts",
      // s: no recurring stem; a container with loose files and a feature directory.
      "s/src/controllers/c.ts",
      "s/src/services/v.ts",
      "s/src/features/loose.ts",
      "s/src/features/f1/f.ts",
      // t: units without a classifying group, a stem union, pieces without `oversized`.
      "t/lib/services/svc.ts",
      "t/lib/a/pay.ts",
      "t/lib/b/pay.ts",
      "t/lib/c/pay.ts",
      "t/lib/d/pay.ts",
      "t/lib/a/solo.ts",
      "t/lib/b/solo.ts",
      "t/lib/a/cart/add.ts",
      "t/lib/b/cart/total.ts",
      "t/x/piece.ts",
      "t/big/one.ts",
      "t/big/two.ts",
      "t/big/two-b.ts",
    ],
    packages: ["m", "n", "o", "q", "r", "s", "t"],
    entryPoints: ["m/src/main.ts"],
    edges: [
      ["m/src/controllers/user.controller.ts", "m/src/services/user.service.ts"],
      ["m/src/controllers/order.controller.ts", "m/src/services/order.service.ts"],
      ["m/src/services/order.service.ts", "m/src/orders/order.ts"],
      ["m/src/controllers/health.controller.ts", "m/src/services/mail.service.ts"],
      ["m/src/services/mail.service.ts", "m/src/utils/format.ts"],
      ["m/src/main.ts", "m/src/controllers/user.controller.ts"],
      ["m/src/main.ts", "m/src/controllers/order.controller.ts"],
      ["m/src/main.ts", "m/src/controllers/health.controller.ts"],
      ["o/src/controllers/user.controller.ts", "o/src/services/user.service.ts"],
      ["t/lib/a/pay.ts", "t/lib/b/pay.ts"],
      ["t/lib/c/pay.ts", "t/lib/d/pay.ts"],
    ],
  });
  const layers = (directory: string): string[] => [
    `${directory}/controllers`,
    `${directory}/services`,
  ];
  const cluster = (scope: Scope): HandClusteringSpec => {
    const d = scope.directory;
    switch (d) {
      case "m":
        return {
          units: [
            { anchor: { directory: "m/src" }, kind: "root", members: ["m/src/main.ts"] },
            {
              anchor: { directory: "m/src", stem: "user" },
              kind: "stem",
              group: "m/src",
              members: ["m/src/controllers/user.controller.ts", "m/src/services/user.service.ts"],
            },
            {
              anchor: { directory: "m/src/orders" },
              kind: "feature",
              members: [
                "m/src/orders/order.ts",
                "m/src/controllers/order.controller.ts",
                "m/src/services/order.service.ts",
              ],
            },
            {
              anchor: { directory: "m/src/controllers" },
              kind: "layer",
              members: ["m/src/controllers/health.controller.ts"],
            },
            {
              anchor: { directory: "m/src/services" },
              kind: "layer",
              members: ["m/src/services/mail.service.ts"],
            },
            {
              anchor: { directory: "m/src/utils" },
              kind: "shared",
              members: ["m/src/utils/format.ts"],
            },
          ],
          orchestrators: { "m/src/main.ts": [1, 3] },
          groups: [
            handGroup({
              directory: "m/src",
              layerChildren: layers("m/src"),
              featureChildren: ["m/src/orders"],
              sharedChildren: ["m/src/utils"],
              recurrentStems: ["order", "user"],
              coveredFiles: 4,
              layerFiles: 6,
              stemsApplied: true,
            }),
          ],
        };
      case "n":
        return {
          units: [
            {
              anchor: { directory: "n/src/controllers" },
              kind: "layer",
              members: ["n/src/controllers/a.controller.ts", "n/src/controllers/b.controller.ts"],
            },
            {
              anchor: { directory: "n/src/services" },
              kind: "layer",
              members: ["n/src/services/a.service.ts", "n/src/services/b.service.ts"],
            },
          ],
          groups: [
            handGroup({
              directory: "n/src",
              layerChildren: layers("n/src"),
              recurrentStems: ["item", "order"],
              coveredFiles: 4,
              layerFiles: 20,
            }),
          ],
        };
      case "o":
        return {
          units: [
            {
              anchor: { directory: "o/src", stem: "user" },
              kind: "stem",
              group: "o/src",
              members: ["o/src/controllers/user.controller.ts", "o/src/services/user.service.ts"],
            },
            {
              anchor: { directory: "o/src/controllers" },
              kind: "layer",
              members: ["o/src/controllers/x.controller.ts"],
            },
            {
              anchor: { directory: "o/src/services" },
              kind: "layer",
              members: ["o/src/services/y.service.ts"],
            },
          ],
          groups: [
            handGroup({
              directory: "o/src",
              layerChildren: layers("o/src"),
              recurrentStems: ["user"],
              coveredFiles: 2,
              layerFiles: 4,
              stemsApplied: true,
            }),
          ],
        };
      case "q":
        return {
          units: [
            {
              anchor: { directory: "q/src/controllers" },
              kind: "layer",
              members: ["q/src/controllers/c.ts"],
            },
            {
              anchor: { directory: "q/src/services" },
              kind: "layer",
              members: ["q/src/services/s.ts"],
            },
          ],
          groups: [
            handGroup({
              directory: "q/src",
              layerChildren: layers("q/src"),
              recurrentStems: ["order"],
              coveredFiles: 2,
              layerFiles: 10,
            }),
          ],
        };
      case "r":
        return {
          units: [
            { anchor: { directory: "r/src" }, kind: "root", members: ["r/src/index.ts"] },
            {
              anchor: { directory: "r/src/services" },
              kind: "layer",
              members: ["r/src/services/s.ts"],
            },
            { anchor: { directory: "r/src/utils" }, kind: "shared", members: ["r/src/utils/u.ts"] },
          ],
          groups: [
            handGroup({
              directory: "r/src",
              layerChildren: ["r/src/services"],
              sharedChildren: ["r/src/utils"],
            }),
          ],
        };
      case "s":
        return {
          units: [
            {
              anchor: { directory: "s/src/controllers" },
              kind: "layer",
              members: ["s/src/controllers/c.ts"],
            },
            {
              anchor: { directory: "s/src/services" },
              kind: "layer",
              members: ["s/src/services/v.ts"],
            },
            {
              anchor: { directory: "s/src/features" },
              kind: "shared",
              members: ["s/src/features/loose.ts"],
            },
            {
              anchor: { directory: "s/src/features/f1" },
              kind: "feature",
              members: ["s/src/features/f1/f.ts"],
            },
          ],
          groups: [
            handGroup({ directory: "s/src", layerChildren: layers("s/src"), layerFiles: 2 }),
            handGroup({ directory: "s/src/features", featureChildren: ["s/src/features/f1"] }),
          ],
        };
      default:
        return {
          units: [
            {
              anchor: { directory: "t/lib/services" },
              kind: "layer",
              members: ["t/lib/services/svc.ts"],
            },
            {
              anchor: { directory: "t/lib", stem: "pay" },
              kind: "stem",
              group: "t/lib",
              members: ["t/lib/a/pay.ts", "t/lib/b/pay.ts", "t/lib/c/pay.ts", "t/lib/d/pay.ts"],
            },
            {
              anchor: { directory: "t/lib", stem: "solo" },
              kind: "stem",
              group: "t/lib",
              members: ["t/lib/a/solo.ts", "t/lib/b/solo.ts"],
            },
            {
              // D-28: the stem of a sub-directory that recurs below the layer directories.
              anchor: { directory: "t/lib", stem: "cart" },
              kind: "stem",
              group: "t/lib",
              members: ["t/lib/a/cart/add.ts", "t/lib/b/cart/total.ts"],
            },
            {
              anchor: { directory: "t/x", stem: "piece" },
              kind: "split",
              members: ["t/x/piece.ts"],
            },
            {
              anchor: { directory: "t/big" },
              kind: "feature",
              members: ["t/big/one.ts"],
              oversized: { directory: "t/big", nodes: 121 },
            },
            {
              anchor: { directory: "t/big", stem: "two" },
              kind: "split",
              members: ["t/big/two.ts", "t/big/two-b.ts"],
              oversized: { directory: "t/big", nodes: 121 },
            },
          ],
        };
    }
  };
  const explained = explain(model, cluster);
  const heading = "Directory classification (Katedrala heuristic, directory vocabulary): ";

  it("words a mixed group with stems on every module it classifies, with the coverage as value", () => {
    const style = {
      signal: "organization-style",
      value: 0.666666667,
      description:
        `${heading}\`m/src\` has 2 layer directories (controllers and services), 1 feature directory ` +
        "(orders) and 1 shared directory (utils), so it is organized by layer and by feature (mixed); " +
        "file-name stems order and user recur across its layer directories and cover 4 of 6 files.",
      entities: [
        "dir:m/src/controllers",
        "dir:m/src/orders",
        "dir:m/src/services",
        "dir:m/src/utils",
      ],
    };
    for (const id of [
      "mod:m/src#user",
      "mod:m/src/orders",
      "mod:m/src/controllers",
      "mod:m/src/services",
      "mod:m/src/utils",
    ]) {
      expect(entry(infoOf(explained, id), "organization-style"), id).toEqual(style);
    }
    // The root unit is the group itself, not one of its classified children.
    expect(entries(infoOf(explained, "mod:m/src"), "organization-style")).toEqual([]);
  });

  it("words stem modules, D-70 feature children and layer directories left by stems", () => {
    const user = infoOf(explained, "mod:m/src#user");
    expect(user.reason).toBe(
      "Inferred: files with the name stem `user` in 2 layer directories of `m/src` form a connected " +
        "group; 100% of their dependency weight stays inside.",
    );
    expect(text(explained, "mod:m/src#user", "prior-agreement")).toBe(
      "The members match the file-name stem `user` across 2 layer directories exactly (Jaccard 1.00).",
    );
    expect(entry(user, "file-stem")).toEqual({
      signal: "file-stem",
      description:
        "Inferred from the file-name stem `user`, which recurs across the layer directories of `m/src`.",
      entities: ["dir:m/src"],
    });
    expect(text(explained, "mod:m/src/orders", "prior-agreement")).toBe(
      "The members match directory `m/src/orders` together with 2 files from layer directories that " +
        "share its stem exactly (Jaccard 1.00).",
    );
    expect(infoOf(explained, "mod:m/src/orders").reason).toBe(
      "Inferred: directory `m/src/orders`; 100% of the dependency weight stays inside.",
    );
    expect(infoOf(explained, "mod:m/src/controllers").reason).toBe(
      "Inferred: layer directory `m/src/controllers` in a layer-organized source tree; the files left " +
        "in it share no recurring file-name stem.",
    );
    expect(text(explained, "mod:m/src/controllers", "layer-directory")).toBe(
      "Inferred from the layer directory `m/src/controllers`.",
    );
  });

  it("words shared directories used by one other module (D-46)", () => {
    const utils = infoOf(explained, "mod:m/src/utils");
    expect(utils.reason).toBe(
      "Inferred: shared directory `m/src/utils`; its only file is not used by two or more other modules.",
    );
    expect(entry(utils, "shared-usage")).toEqual({
      signal: "shared-usage",
      weight: 0.5,
      value: 0,
      description:
        "Its only file is not used by two or more other modules (composition roots do not count as users).",
    });
    expect(entry(utils, "single-user-files")).toEqual({
      signal: "single-user-files",
      value: 1,
      description: "1 file is used by only one other module: format (services).",
      entities: ["file:m/src/utils/format.ts"],
    });
  });

  it("words stems that cover too few files, one or several", () => {
    expect(text(explained, "mod:n/src/controllers", "organization-style")).toBe(
      `${heading}\`n/src\` has 2 layer directories (controllers and services), so it is organized by ` +
        "layer; file-name stems item and order recur across its layer directories but cover only 4 of " +
        "20 files, less than 25%, so the layer directories stay modules.",
    );
    expect(entry(infoOf(explained, "mod:n/src/controllers"), "organization-style").value).toBe(0.2);
    expect(infoOf(explained, "mod:n/src/controllers").reason).toBe(
      "Inferred: layer directory `n/src/controllers` in a layer-organized source tree; recurring " +
        "file-name stems cover too few files to form modules.",
    );
    expect(text(explained, "mod:q/src/services", "organization-style")).toBe(
      `${heading}\`q/src\` has 2 layer directories (controllers and services), so it is organized by ` +
        "layer; file-name stem order recurs across its layer directories but covers only 2 of 10 files, " +
        "less than 25%, so the layer directories stay modules.",
    );
  });

  it("words a single stem applied", () => {
    expect(text(explained, "mod:o/src#user", "organization-style")).toBe(
      `${heading}\`o/src\` has 2 layer directories (controllers and services), so it is organized by ` +
        "layer; the file-name stem user recurs across its layer directories and covers 2 of 4 files.",
    );
  });

  it("words the style none and a lone layer directory (D-26)", () => {
    expect(entry(infoOf(explained, "mod:r/src/services"), "organization-style")).toEqual({
      signal: "organization-style",
      description:
        `${heading}\`r/src\` has 1 layer directory (services) and 1 shared directory (utils), so it is ` +
        "organized neither by feature nor by layer.",
      entities: ["dir:r/src/services", "dir:r/src/utils"],
    });
    expect(infoOf(explained, "mod:r/src/services").reason).toBe(
      "Inferred: layer directory `r/src/services`, the only layer directory in `r/src`.",
    );
  });

  it("words layer directories without recurring stems, containers and feature groups", () => {
    expect(infoOf(explained, "mod:s/src/controllers").reason).toBe(
      "Inferred: layer directory `s/src/controllers` in a layer-organized source tree; no file-name " +
        "stem recurs across its layers.",
    );
    const container = infoOf(explained, "mod:s/src/features");
    expect(container.reason).toBe(
      "Inferred: the loose files of the container directory `s/src/features`; its only file is not used " +
        "by two or more other modules.",
    );
    expect(entry(container, "shared-directory")).toEqual({
      signal: "shared-directory",
      description: "Inferred from the loose files of the container directory `s/src/features`.",
      entities: ["dir:s/src/features"],
    });
    expect(text(explained, "mod:s/src/features", "prior-agreement")).toBe(
      "The members match the files directly in `s/src/features` exactly (Jaccard 1.00).",
    );
    // Containers are classified as none of a group's children (D-26).
    expect(entries(container, "organization-style")).toEqual([]);
    expect(entry(infoOf(explained, "mod:s/src/features/f1"), "organization-style")).toEqual({
      signal: "organization-style",
      description: `${heading}\`s/src/features\` has 1 feature directory (f1), so it is organized by feature.`,
      entities: ["dir:s/src/features/f1"],
    });
  });

  it("words units no group classifies, stem unions (D-27) and pieces without a size", () => {
    expect(infoOf(explained, "mod:t/lib/services").reason).toBe(
      "Inferred: layer directory `t/lib/services`.",
    );
    expect(entries(infoOf(explained, "mod:t/lib/services"), "organization-style")).toEqual([]);
    expect(infoOf(explained, "mod:t/lib#pay").reason).toBe(
      "Inferred: files with the name stem `pay` in the layer directories of `t/lib` form 2 connected " +
        "groups; 100% of their dependency weight stays inside.",
    );
    expect(text(explained, "mod:t/lib#pay", "prior-agreement")).toBe(
      "The members match the file-name stem `pay` below `t/lib` exactly (Jaccard 1.00).",
    );
    // D-28: a stem that no member's file name gives came from recurring sub-directories.
    expect(text(explained, "mod:t/lib#cart", "file-stem")).toBe(
      "Inferred from the name stem `cart` (of file or sub-directory names), which recurs across the " +
        "layer directories of `t/lib`.",
    );
    expect(text(explained, "mod:t/lib#cart", "prior-agreement")).toBe(
      "The members match the name stem `cart` (of file or sub-directory names) below `t/lib` exactly " +
        "(Jaccard 1.00).",
    );
    expect(infoOf(explained, "mod:t/lib#solo").reason).toBe(
      "Inferred: files with the name stem `solo` in the layer directories of `t/lib` form 2 connected " +
        "groups; no member has dependency evidence in its package.",
    );
    expect(text(explained, "mod:t/lib#solo", "internal-edge-ratio")).toBe(
      "No member file has a dependency or dependent in its package that counts as evidence (those of " +
        "composition roots and utilities do not), so cohesion is not measured and the signal " +
        "contributes 0.",
    );
    expect(infoOf(explained, "mod:t/x#piece").reason).toBe(
      "Inferred: part of the oversized directory `t/x`, grouped by dependencies around the stem `piece`.",
    );
    expect(entries(infoOf(explained, "mod:t/x#piece"), "oversized-directory")).toEqual([]);
    expect(infoOf(explained, "mod:t/big").reason).toBe(
      "Inferred: directory `t/big` (oversized: 121 files, grouped into 1 piece by dependencies); the 1 " +
        "file that joined no piece stays here.",
    );
  });

  it("bounds the directory and stem lists by limits.maxEvidenceEntities", () => {
    const bounded = explain(model, cluster, { maxEntities: 1 });
    expect(text(bounded, "mod:m/src#user", "organization-style")).toBe(
      `${heading}\`m/src\` has 2 layer directories (controllers and 1 more), 1 feature directory ` +
        "(orders) and 1 shared directory (utils), so it is organized by layer and by feature (mixed); " +
        "file-name stems order and 1 more recur across its layer directories and cover 4 of 6 files.",
    );
    expect(entry(infoOf(bounded, "mod:m/src#user"), "organization-style").entities).toEqual([
      "dir:m/src/controllers",
    ]);
  });

  it("satisfies the InferenceInfo invariants on every module", () => {
    for (const { clustering, ids } of explained.stage.inferred) {
      clustering.units.forEach((unit, index) => {
        checkInfo(infoOf(explained, ids[index] ?? "?"), unit.kind);
      });
    }
  });
});

describe("oversized directories (P4, D-32, D-34)", () => {
  const model = syntheticModel({
    files: [
      "src/main.ts",
      "src/lib/format-date.ts",
      "src/lib/format-money.ts",
      "src/lib/parseUrl.ts",
      "src/lib/parseQuery.ts",
      "src/lib/registry.ts",
      "src/lib/lone.ts",
    ],
    entryPoints: ["src/main.ts"],
    edges: [
      ["src/lib/format-date.ts", "src/lib/registry.ts"],
      ["src/lib/registry.ts", "src/lib/format-money.ts"],
      ["src/lib/registry.ts", "src/lib/parseUrl.ts"],
      ["src/lib/format-money.ts", "src/lib/format-date.ts"],
      ["src/lib/parseQuery.ts", "src/lib/parseUrl.ts"],
      ["src/main.ts", "src/lib/format-money.ts"],
    ],
  });
  const oversized = { directory: "src/lib", nodes: 130 };
  const explained = explain(model, () => ({
    units: [
      { anchor: { directory: "src" }, kind: "root", members: ["src/main.ts"] },
      {
        anchor: { directory: "src/lib", stem: "format" },
        kind: "split",
        members: ["src/lib/format-date.ts", "src/lib/format-money.ts"],
        oversized,
      },
      {
        anchor: { directory: "src/lib", stem: "parse-url-ts" },
        kind: "split",
        members: ["src/lib/parseUrl.ts", "src/lib/parseQuery.ts"],
        oversized,
      },
      {
        anchor: { directory: "src/lib" },
        kind: "feature",
        members: ["src/lib/registry.ts", "src/lib/lone.ts"],
        oversized,
      },
    ],
    orchestrators: { "src/main.ts": [1, 2], "src/lib/registry.ts": [2, 2] },
  }));

  it("words pieces keyed by a stem and by the fallback of D-34", () => {
    const format = infoOf(explained, "mod:src/lib#format");
    expect(format.reason).toBe(
      "Inferred: part of the oversized directory `src/lib` (130 files), grouped by dependencies around " +
        "the stem `format`.",
    );
    expect(entry(format, "split-piece")).toEqual({
      signal: "split-piece",
      description: "Inferred from a piece of the oversized directory `src/lib`.",
      entities: ["dir:src/lib"],
    });
    expect(entry(format, "oversized-directory")).toEqual({
      signal: "oversized-directory",
      value: 130,
      description:
        "Part of the oversized directory `src/lib` (130 files), grouped by dependencies.",
      entities: ["dir:src/lib"],
    });
    expect(text(explained, "mod:src/lib#format", "prior-agreement")).toBe(
      "The members match the piece of the oversized directory `src/lib` around the stem `format` " +
        "exactly (Jaccard 1.00).",
    );
    expect(infoOf(explained, "mod:src/lib#parse-url-ts").reason).toBe(
      "Inferred: part of the oversized directory `src/lib` (130 files), grouped by dependencies without " +
        "a free common file-name stem, so it is keyed `parse-url-ts`.",
    );
    expect(text(explained, "mod:src/lib#parse-url-ts", "prior-agreement")).toBe(
      "The members match the piece of the oversized directory `src/lib` keyed `parse-url-ts` exactly " +
        "(Jaccard 1.00).",
    );
  });

  it("words the remainder, whose composition root P3 classified with the whole directory", () => {
    const remainder = infoOf(explained, "mod:src/lib");
    expect(remainder.reason).toBe(
      "Inferred: directory `src/lib` (oversized: 130 files, grouped into 2 pieces by dependencies); the " +
        "2 files that joined no piece stay here.",
    );
    expect(text(explained, "mod:src/lib", "oversized-directory")).toBe(
      "The rest of the oversized directory `src/lib` (130 files) after it was grouped by dependencies.",
    );
    expect(text(explained, "mod:src/lib", "prior-agreement")).toBe(
      "The members match the files of the oversized directory `src/lib` that joined no piece exactly " +
        "(Jaccard 1.00).",
    );
    // `format-date.ts` lies in a piece now, but in the registry's unit when P3 classified it.
    expect(text(explained, "mod:src/lib", "composition-roots")).toBe(
      "Treated as a composition root by the orchestrator rules (Katedrala heuristic) and not counted as " +
        "evidence: `src/lib/registry.ts` (shape rule: nothing outside its unit depends on it; its " +
        "dependencies spread over 2 other units, none above 50%).",
    );
    for (const { clustering, ids } of explained.stage.inferred) {
      clustering.units.forEach((unit, index) => {
        checkInfo(infoOf(explained, ids[index] ?? "?"), unit.kind);
      });
    }
  });
});

describe("membership margins, shared usage and utilities (D-46, D-47)", () => {
  const model = syntheticModel({
    files: [
      "x/x1.ts",
      "x/x2.ts",
      "x/u.ts",
      "y/y1.ts",
      "s/s.ts",
      "k/k1.ts",
      "k/k2.ts",
      "k/k3.ts",
      "z/z1.ts",
      "z/z2.ts",
      "z/zu.ts",
    ],
    edges: [
      ["x/x2.ts", "x/x1.ts"],
      ["x/x2.ts", "s/s.ts"],
      ["x/x1.ts", "x/u.ts"],
      ["y/y1.ts", "k/k1.ts"],
      ["y/y1.ts", "k/k2.ts"],
      ["y/y1.ts", "s/s.ts"],
      ["k/k1.ts", "k/k3.ts"],
      ["z/z2.ts", "z/z1.ts"],
      ["z/z1.ts", "z/zu.ts"],
    ],
  });
  const explained = explain(model, () => ({
    units: [
      { anchor: { directory: "x" }, kind: "feature", members: ["x/x1.ts", "x/x2.ts", "x/u.ts"] },
      { anchor: { directory: "y" }, kind: "feature", members: ["y/y1.ts"] },
      { anchor: { directory: "s" }, kind: "shared", members: ["s/s.ts"] },
      { anchor: { directory: "k" }, kind: "feature", members: ["k/k1.ts", "k/k2.ts", "k/k3.ts"] },
      { anchor: { directory: "z" }, kind: "feature", members: ["z/z1.ts", "z/z2.ts", "z/zu.ts"] },
    ],
    utilities: { "x/u.ts": 3, "z/zu.ts": 2 },
  }));
  const intro = "On average, member files are ";

  it("words every margin variant and names the contested members (D-47)", () => {
    expect(entry(infoOf(explained, "mod:x"), "membership-margin")).toEqual({
      signal: "membership-margin",
      weight: 0.25,
      value: 0.5,
      description:
        `${intro}50 percentage points more connected to this module than to any other; 1 of the 2 ` +
        "members with dependency evidence is contested.",
      entities: ["file:x/x2.ts"],
    });
    expect(text(explained, "mod:z", "membership-margin")).toBe(
      `${intro}100 percentage points more connected to this module than to any other; none of the 2 ` +
        "members with dependency evidence is contested.",
    );
    expect(entry(infoOf(explained, "mod:k"), "membership-margin")).toEqual({
      signal: "membership-margin",
      weight: 0.25,
      value: 0.333333333,
      description:
        `${intro}33 percentage points more connected to this module than to any other; 2 of 3 members ` +
        "are contested.",
      entities: ["file:k/k1.ts", "file:k/k2.ts"],
    });
    expect(text(explained, "mod:y", "membership-margin")).toBe(
      `${intro}0 percentage points more connected to this module than to any other; 1 of 1 member is ` +
        "contested.",
    );
  });

  it("words a one-file shared module used by two others", () => {
    const shared = infoOf(explained, "mod:s");
    expect(shared.reason).toBe(
      "Inferred: shared directory `s`; its only file is used by two or more other modules.",
    );
    expect(entry(shared, "shared-usage")).toEqual({
      signal: "shared-usage",
      weight: 0.5,
      value: 1,
      description:
        "Its only file is used by two or more other modules (composition roots do not count as users).",
      entities: ["file:s/s.ts"],
    });
    expect(entries(shared, "single-user-files")).toEqual([]);
  });

  it("words one utility of a feature module", () => {
    expect(entry(infoOf(explained, "mod:x"), "utility-files")).toEqual({
      signal: "utility-files",
      value: 1,
      description:
        "Treated as a shared utility by the utility rule (Katedrala heuristic), pinned and not counted " +
        "as evidence: `x/u.ts` (its dependents lie in 3 other units).",
      entities: ["file:x/u.ts"],
    });
    expect(text(explained, "mod:z", "utility-files")).toBe(
      "Treated as a shared utility by the utility rule (Katedrala heuristic), pinned and not counted as " +
        "evidence: `z/zu.ts` (its dependents lie in 2 other units).",
    );
  });

  it("bounds the single-user list", () => {
    const ambiguous = prototypeModel("ambiguous-boundaries");
    const spec = DESIGN_CLUSTERINGS["ambiguous-boundaries"];
    if (spec === undefined) throw new Error("missing design clustering");
    const bounded = explain(ambiguous, () => spec, { maxEntities: 1 });
    expect(entry(infoOf(bounded, "mod:src/common"), "single-user-files")).toEqual({
      signal: "single-user-files",
      value: 3,
      description: "3 files are used by only one other module: session (cart) and 2 more.",
      entities: ["file:src/common/session.ts"],
    });
  });
});

describe("explainScope settings and errors", () => {
  const model = syntheticModel({
    files: ["src/a.ts", "src/b.ts"],
    edges: [["src/a.ts", "src/b.ts"]],
  });
  const cluster = (): HandClusteringSpec => ({
    units: [{ anchor: { directory: "src" }, kind: "feature", members: ["src/a.ts", "src/b.ts"] }],
  });

  it("uses the configured method string (D-56)", () => {
    const settings = resolveInferenceSettings({ modules: { max_module_files: 200 } });
    const info = infoOf(explain(model, cluster, { settings }), "mod:src");
    expect(info.method).toBe(settings.methods.modules);
    expect(info.method).toBe("katedrala/module-inference@1?max_module_files=200");
    checkInfo(info, "feature", 10, settings.methods.modules);
  });

  it("rejects missing measurements and invalid entity limits", () => {
    const stage = handStage(model, cluster);
    const [scoped] = stage.inferred;
    if (scoped === undefined) throw new Error("no scope");
    const input = {
      scoped,
      signals: moduleSignals(scoped.clustering, new Set<FileId>()),
      attachments: [],
      settings: stage.settings,
      entryPoints: new Set<FileId>(),
      maxEntities: 10,
    };
    expect(explainScope(input)).toHaveLength(1);
    expect(() => explainScope({ ...input, signals: [] })).toThrow(RangeError);
    expect(() => explainScope({ ...input, maxEntities: -1 })).toThrow(RangeError);
  });
});

describe("reassignmentLimitDiagnostic (D-37)", () => {
  const model = syntheticModel({
    files: ["a.ts", "pkg/b.ts", "unnamed/c.ts"],
    packages: [{ path: "pkg", name: "@acme/pkg" }, "unnamed"],
  });
  const settings = resolveInferenceSettings();
  const { scopes } = moduleScopes({
    model,
    settings,
    projection: METRICS_PROJECTION,
    declaredFiles: new Set(),
  });
  const clusteringOf = (scope: Scope, converged: boolean, passes: number): ScopeClustering => ({
    scope,
    sourceRoot: scope.directory,
    units: [],
    unitOf: new Int32Array(scope.graph.nodes.length),
    classes: {
      orchestrators: new Uint8Array(0),
      orchestratorRule: new Uint8Array(0),
      dependencyUnits: new Int32Array(0),
      utilities: new Uint8Array(0),
      dependentUnits: new Int32Array(0),
      facades: new Uint8Array(0),
    },
    groups: [],
    relocations: [],
    passes,
    converged,
  });

  it("names the scope when P5 stopped at the pass limit, and nothing when it converged", () => {
    const [outside, pkg, unnamed] = scopes;
    if (outside === undefined || pkg === undefined || unnamed === undefined)
      throw new Error("scopes");
    expect(reassignmentLimitDiagnostic(clusteringOf(pkg, true, 3))).toBeUndefined();
    expect(reassignmentLimitDiagnostic(clusteringOf(outside, false, 50))).toEqual({
      code: "limit-reached",
      severity: "info",
      message:
        "Module reassignment in the files outside packages stopped after 50 passes with moves pending; " +
        "memberships may depend on the pass limit (inference.modules.max_passes)",
    });
    expect(reassignmentLimitDiagnostic(clusteringOf(pkg, false, 1))?.message).toBe(
      "Module reassignment in package @acme/pkg stopped after 1 pass with moves pending; memberships " +
        "may depend on the pass limit (inference.modules.max_passes)",
    );
    expect(reassignmentLimitDiagnostic(clusteringOf(unnamed, false, 2))?.message).toMatch(
      /^Module reassignment in package unnamed stopped after 2 passes/,
    );
  });
});

// ─── Property ───────────────────────────────────────────────────────────────────────────────────────

describe("explainScope on random clusterings (property)", () => {
  const paths = Array.from({ length: 10 }, (_, index) => `d${index % 4}/f${index}.ts`);
  const KINDS: readonly UnitKind[] = ["feature", "stem", "split", "layer", "shared", "root"];

  /** Units by label, with kinds, priors, classes and relocations drawn from the arrays. */
  function randomClustering(
    scope: Scope,
    labels: readonly number[],
    priors: readonly number[],
    kinds: readonly number[],
    bits: readonly number[],
  ): ScopeClustering {
    const nodes = scope.graph.nodes;
    const used = [...new Set(labels)].sort((a, b) => a - b);
    const units: ClusterUnit[] = used
      .map((label): ClusterUnit => {
        const kind = KINDS[kinds[label] ?? 0] ?? "feature";
        const anchor =
          kind === "stem" || kind === "split"
            ? { directory: "d0", stem: `s${label}` }
            : { directory: `u${label}` };
        return {
          key: inferredModuleKey(anchor),
          anchor,
          kind,
          name: `u${label}`,
          members: Int32Array.from(
            nodes.map((_, node) => node).filter((node) => labels[node] === label),
          ),
          prior: Int32Array.from(
            nodes.map((_, node) => node).filter((node) => priors[node] === label),
          ),
          ...(kind === "stem" ? { group: "d0" } : {}),
          ...(kind === "split" ? { oversized: { directory: "d0", nodes: 150 } } : {}),
          destination: kind === "feature" || kind === "stem" || kind === "split",
        };
      })
      .sort((a, b) => compareStrings(a.key, b.key));
    const indexOf = new Map(units.map((unit, index) => [unit.key, index] as const));
    const keyOf = (label: number): string | undefined =>
      units.find((unit) => unit.name === `u${label}`)?.key;
    const unitOf = Int32Array.from(
      nodes.map((_, node) => indexOf.get(keyOf(labels[node] ?? -1) ?? "") ?? -1),
    );
    const relocations: Relocation[] = [];
    nodes.forEach((_, node) => {
      const from = keyOf(priors[node] ?? -1);
      const to = keyOf(labels[node] ?? -1);
      if (from === undefined || to === undefined || from === to) return;
      relocations.push({
        node,
        from,
        to,
        dependents: new Map([[to, { weight: 1, files: (bits[node] ?? 0) % 3 }]]),
        dependencies: new Map((bits[node] ?? 0) >= 4 ? [[to, 1]] : []),
      });
    });
    const mask = (bit: number): Uint8Array =>
      Uint8Array.from(nodes.map((_, node) => (((bits[node] ?? 0) & bit) !== 0 ? 1 : 0)));
    return {
      scope,
      sourceRoot: "",
      units,
      unitOf,
      classes: {
        orchestrators: mask(1),
        orchestratorRule: Uint8Array.from(
          nodes.map((_, node) => ((bits[node] ?? 0) & 1) * (1 + ((bits[node] ?? 0) >> 3))),
        ),
        dependencyUnits: Int32Array.from(nodes.map((_, node) => (bits[node] ?? 0) % 5)),
        utilities: mask(2),
        dependentUnits: Int32Array.from(nodes.map((_, node) => 2 + ((bits[node] ?? 0) % 3))),
        facades: mask(4),
      },
      groups: [
        handGroup({
          directory: "d0",
          layerChildren: ["d0/a", "d0/b"],
          recurrentStems: ["s1"],
          coveredFiles: 2,
          layerFiles: 4,
          stemsApplied: true,
        }),
      ],
      relocations,
      passes: 1,
      converged: true,
    };
  }

  it("keeps every invariant of 4.6 whatever the clustering", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            source: fc.nat(paths.length - 1),
            target: fc.nat(paths.length - 1),
            typeOnly: fc.boolean(),
            reexport: fc.boolean(),
          }),
          { maxLength: 30 },
        ),
        fc.array(fc.nat(4), { minLength: paths.length, maxLength: paths.length }),
        fc.array(fc.nat(5), { minLength: paths.length, maxLength: paths.length }),
        fc.array(fc.nat(KINDS.length - 1), { minLength: 5, maxLength: 5 }),
        fc.array(fc.nat(15), { minLength: paths.length, maxLength: paths.length }),
        fc.integer({ min: 0, max: 4 }),
        (randomEdges, labels, priors, kinds, bits, maxEntities) => {
          const model = syntheticModel({
            files: paths,
            entryPoints: paths.filter((_, index) => (bits[index] ?? 0) >= 12),
            edges: randomEdges
              .filter((edge) => edge.source !== edge.target)
              .map((edge) => ({
                source: paths[edge.source] ?? "",
                target: paths[edge.target] ?? "",
                typeOnly: edge.typeOnly,
                ...(edge.reexport ? { kind: "re-exports" as const } : {}),
              })),
          });
          const settings = resolveInferenceSettings();
          const [scope] = moduleScopes({
            model,
            settings,
            projection: METRICS_PROJECTION,
            declaredFiles: new Set(),
          }).scopes;
          if (scope === undefined) throw new Error("no scope");
          const clustering = randomClustering(scope, labels, priors, kinds, bits);
          const entryPoints = entryPointFiles(model);
          const infos = explainScope({
            scoped: { clustering, ids: clustering.units.map((unit) => moduleId(unit.key)) },
            signals: moduleSignals(clustering, entryPoints),
            attachments: [],
            settings,
            entryPoints,
            maxEntities,
          });
          expect(infos).toHaveLength(clustering.units.length);
          infos.forEach((info, index) => {
            checkInfo(info, clustering.units[index]?.kind ?? "feature", maxEntities);
            const relocated = entries(info, "relocated-files").length;
            expect(relocated).toBeLessThanOrEqual(maxEntities);
          });
        },
      ),
      { seed: 20261009, numRuns: 300 },
    );
  });
});
