import {
  compareStrings,
  fileId,
  inferredModuleKey,
  moduleId,
  serializeDocument,
  symbolId,
  type ComponentEntity,
  type Evidence,
  type FileId,
  type FileRole,
  type InferenceInfo,
  type LayerEntity,
  type ModuleEntity,
} from "@katedrala/ir";
import {
  ArchitectureModel,
  DEFAULT_EDGE_KINDS,
  DEFAULT_FILE_ROLES,
  type AggregationLevel,
  type ProjectionOptions,
} from "@katedrala/model";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { inferArchitecture } from "./infer.js";
import { withRoles } from "./roles.js";
import { INFERENCE_KEYS, resolveInferenceSettings } from "./settings.js";
import {
  shuffledModel,
  syntheticModel,
  type SyntheticEdgeSpec,
  type SyntheticFileSpec,
  type SyntheticModelSpec,
} from "./test-support.js";
import type {
  ConfiguredRoleSpec,
  DeclaredLayerSpec,
  DeclaredModuleSpec,
  Declarations,
  InferenceConfiguration,
  InferenceInput,
  InferenceResult,
} from "./types.js";

// ─── Running the pipeline ─────────────────────────────────────────────────────────────────────────────

interface RunOptions {
  readonly config?: InferenceConfiguration;
  readonly includeTestsInMetrics?: boolean;
  readonly includeTypeOnly?: boolean;
  readonly modules?: readonly DeclaredModuleSpec[];
  readonly layers?: readonly DeclaredLayerSpec[];
  readonly roles?: readonly ConfiguredRoleSpec[];
}

/** The metrics projection the engine passes (plan 3.4), for the two core settings it reads. */
function metricsProjection(options: RunOptions): ProjectionOptions {
  const roles = new Set<FileRole>(DEFAULT_FILE_ROLES);
  if (options.includeTestsInMetrics === true) roles.add("test");
  return {
    edgeKinds: new Set(DEFAULT_EDGE_KINDS),
    includeTypeOnly: options.includeTypeOnly ?? true,
    fileRoles: roles,
  };
}

function inputFor(model: ArchitectureModel, options: RunOptions = {}): InferenceInput {
  const declarations: Declarations = {
    modules: options.modules ?? [],
    roles: options.roles ?? [],
    ...(options.layers === undefined ? {} : { layers: options.layers }),
  };
  return {
    model,
    settings: resolveInferenceSettings(options.config, {
      includeTestsInMetrics: options.includeTestsInMetrics ?? false,
    }),
    declarations,
    projection: metricsProjection(options),
    repositoryName: model.document.repository?.name ?? "repository",
  };
}

function run(model: ArchitectureModel, options: RunOptions = {}): InferenceResult {
  return inferArchitecture(inputFor(model, options));
}

/** Every output of the pipeline as text: the sections, the roles and the diagnostics. */
function serialized(result: InferenceResult): string {
  return serializeDocument({
    components: result.components,
    modules: result.modules,
    layers: result.layers,
    roles: [...result.roles],
    diagnostics: result.diagnostics,
  });
}

const paths = (files: readonly string[]): string[] =>
  files.map((file) => file.slice("file:".length));

function moduleWithId(result: InferenceResult, id: string): ModuleEntity {
  const module = result.modules.find((candidate) => candidate.id === id);
  if (module === undefined) throw new Error(`No module ${id}`);
  return module;
}

function componentWithId(result: InferenceResult, id: string): ComponentEntity {
  const component = result.components.find((candidate) => candidate.id === id);
  if (component === undefined) throw new Error(`No component ${id}`);
  return component;
}

const entitiesOf = (dependencies: readonly { entity: string }[]): string[] =>
  dependencies.map((dependency) => dependency.entity);

// ─── A small layered repository ───────────────────────────────────────────────────────────────────────

/**
 * Features `order` and `payment` across three layer directories, a shared directory, a composition root, a
 * declaration attached by majority and a test attached by majority.
 */
const SHOP: SyntheticModelSpec = {
  repositoryName: "shop",
  packages: [{ path: "", name: "shop" }],
  files: [
    { path: "src/main.ts", lines: 10 },
    { path: "src/controllers/order.controller.ts", classes: ["OrderController"], lines: 20 },
    { path: "src/controllers/payment.controller.ts", classes: ["PaymentController"], lines: 20 },
    { path: "src/services/order.service.ts", classes: ["OrderService"], lines: 30 },
    { path: "src/services/payment.service.ts", classes: ["PaymentService"], lines: 30 },
    { path: "src/models/order.ts", lines: 5 },
    { path: "src/models/payment.ts", lines: 5 },
    { path: "src/shared/logger.ts", lines: 8 },
    { path: "src/shared/clock.ts", lines: 4 },
    { path: "src/types/order-events.d.ts", role: "declaration", lines: 3 },
    { path: "test/order.service.test.ts", role: "test", lines: 12 },
  ],
  edges: [
    ["src/main.ts", "src/controllers/order.controller.ts"],
    ["src/main.ts", "src/controllers/payment.controller.ts"],
    ["src/controllers/order.controller.ts", "src/services/order.service.ts"],
    ["src/controllers/payment.controller.ts", "src/services/payment.service.ts"],
    ["src/services/order.service.ts", "src/models/order.ts"],
    ["src/services/order.service.ts", "src/services/payment.service.ts"],
    { source: "src/services/order.service.ts", target: "src/models/payment.ts", typeOnly: true },
    ["src/services/payment.service.ts", "src/models/payment.ts"],
    ["src/controllers/order.controller.ts", "src/shared/logger.ts"],
    ["src/controllers/payment.controller.ts", "src/shared/logger.ts"],
    ["src/services/order.service.ts", "src/shared/logger.ts"],
    ["src/services/payment.service.ts", "src/shared/logger.ts"],
    ["src/services/payment.service.ts", "src/shared/clock.ts"],
    // Two of the declaration's three dependents are order files (D-65: attached by strict majority).
    {
      source: "src/services/order.service.ts",
      target: "src/types/order-events.d.ts",
      typeOnly: true,
    },
    {
      source: "src/controllers/order.controller.ts",
      target: "src/types/order-events.d.ts",
      typeOnly: true,
    },
    {
      source: "src/services/payment.service.ts",
      target: "src/types/order-events.d.ts",
      typeOnly: true,
    },
    ["test/order.service.test.ts", "src/services/order.service.ts"],
    ["test/order.service.test.ts", "src/models/order.ts"],
  ],
  entryPoints: ["src/main.ts"],
};

describe("inferArchitecture: assembly (plan 2.3, 3.1)", () => {
  const model = syntheticModel(SHOP);
  const result = run(model);

  it("runs every stage: components, roles, modules and layers", () => {
    expect(result.components.map((component) => component.id)).toEqual([
      "cmp:",
      "cmp:src",
      "cmp:src/controllers",
      "cmp:src/models",
      "cmp:src/services",
      "cmp:src/shared",
      "cmp:src/types",
      "cmp:test",
    ]);
    expect(result.modules.map((module) => [module.id, module.name])).toEqual([
      ["mod:src", "shop"],
      ["mod:src#order", "orders"],
      ["mod:src#payment", "payments"],
      ["mod:src/shared", "shared"],
    ]);
    expect(result.layers.map((layer) => [layer.id, layer.rank])).toEqual([
      ["layer:controller", 0],
      ["layer:service", 1],
      ["layer:model", 2],
    ]);
    expect([...result.roles.keys()].map((file) => file.slice("file:".length))).toEqual([
      "src/controllers/order.controller.ts",
      "src/controllers/payment.controller.ts",
      "src/models/order.ts",
      "src/models/payment.ts",
      "src/services/order.service.ts",
      "src/services/payment.service.ts",
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it("writes every entity with the keys of the IR's interfaces, in their order", () => {
    expect(Object.keys(componentWithId(result, "cmp:src"))).toEqual([
      "id",
      "name",
      "kind",
      "path",
      "packages",
      "parent",
      "children",
      "files",
      "totals",
      "modules",
      "dependencies",
      "dependents",
    ]);
    expect(Object.keys(componentWithId(result, "cmp:"))).not.toContain("parent");
    expect(Object.keys(moduleWithId(result, "mod:src#order"))).toEqual([
      "id",
      "name",
      "origin",
      "anchor",
      "packages",
      "files",
      "components",
      "entryPoints",
      "publicApi",
      "inference",
      "dependencies",
      "dependents",
    ]);
    expect(Object.keys(result.layers[0]!)).toEqual([
      "id",
      "name",
      "origin",
      "rank",
      "files",
      "inference",
      "dependencies",
      "dependents",
    ]);
  });

  it("cross-references components and modules", () => {
    const order = moduleWithId(result, "mod:src#order");
    // The attached declaration and test are members; their components are listed.
    expect(paths(order.files)).toEqual([
      "src/controllers/order.controller.ts",
      "src/models/order.ts",
      "src/services/order.service.ts",
      "src/types/order-events.d.ts",
      "test/order.service.test.ts",
    ]);
    expect(order.components).toEqual([
      "cmp:src/controllers",
      "cmp:src/models",
      "cmp:src/services",
      "cmp:src/types",
      "cmp:test",
    ]);
    // A component lists the modules of its whole subtree.
    expect(componentWithId(result, "cmp:src/services").modules).toEqual([
      "mod:src#order",
      "mod:src#payment",
    ]);
    expect(componentWithId(result, "cmp:src").modules).toEqual([
      "mod:src",
      "mod:src#order",
      "mod:src#payment",
      "mod:src/shared",
    ]);
    expect(componentWithId(result, "cmp:").modules).toEqual(
      componentWithId(result, "cmp:src").modules,
    );
    expect(componentWithId(result, "cmp:test").modules).toEqual(["mod:src#order"]);
  });

  it("aggregates dependencies on the metrics projection, mirrored as dependents", () => {
    const order = moduleWithId(result, "mod:src#order");
    const payment = moduleWithId(result, "mod:src#payment");
    expect(entitiesOf(order.dependencies)).toEqual(["mod:src#payment", "mod:src/shared"]);
    const toPayment = order.dependencies[0]!;
    // order.service → payment.service (runtime), order.service → models/payment (type-only).
    expect(toPayment).toMatchObject({ edgeCount: 2, runtimeEdgeCount: 1, observations: 2 });
    expect(toPayment.kindCounts).toEqual({ imports: 2 });
    expect(toPayment.examples).toHaveLength(2);
    // D-65: the attached declaration takes part in module dependencies.
    expect(entitiesOf(payment.dependencies)).toEqual(["mod:src#order", "mod:src/shared"]);
    expect(payment.dependencies[0]).toMatchObject({ edgeCount: 1, runtimeEdgeCount: 0 });
    expect(entitiesOf(payment.dependents)).toEqual(["mod:src", "mod:src#order"]);
    // Components: directly owned files only.
    expect(entitiesOf(componentWithId(result, "cmp:src/services").dependencies)).toEqual([
      "cmp:src/models",
      "cmp:src/shared",
      "cmp:src/types",
    ]);
    expect(entitiesOf(result.layers[0]!.dependencies)).toEqual(["layer:service"]);
    expect(entitiesOf(result.layers[0]!.dependents)).toEqual([]);
  });

  it("follows the metrics projection's type-only setting and file roles", () => {
    const runtime = run(model, { includeTypeOnly: false, includeTestsInMetrics: true });
    const order = moduleWithId(runtime, "mod:src#order");
    expect(order.dependencies[0]).toMatchObject({
      entity: "mod:src#payment",
      edgeCount: 1,
      runtimeEdgeCount: 1,
    });
    // The declaration's dependents are type-only, so payment no longer depends on order.
    expect(entitiesOf(moduleWithId(runtime, "mod:src#payment").dependencies)).toEqual([
      "mod:src/shared",
    ]);
    // Tests in metrics: the test is still attached by majority, and its edges stay inside its module.
    expect(paths(order.files)).toContain("test/order.service.test.ts");
    expect(entitiesOf(componentWithId(runtime, "cmp:test").dependencies)).toEqual([
      "cmp:src/models",
      "cmp:src/services",
    ]);
    expect(entitiesOf(componentWithId(result, "cmp:test").dependencies)).toEqual([]);
  });

  it("returns a model over the structure and the units, with empty dependency lists (D-60)", () => {
    const { unitsModel } = result;
    expect(unitsModel).not.toBe(model);
    const { document } = unitsModel;
    expect(document.modules?.map((module) => module.id)).toEqual(
      result.modules.map((module) => module.id),
    );
    for (const unit of [
      ...(document.components ?? []),
      ...(document.modules ?? []),
      ...(document.layers ?? []),
    ]) {
      expect(unit.dependencies).toEqual([]);
      expect(unit.dependents).toEqual([]);
    }
    expect(unitsModel.unitOf(fileId("src/services/order.service.ts"), "module")).toBe(
      "mod:src#order",
    );
    expect(unitsModel.unitOf(fileId("src/services/order.service.ts"), "layer")).toBe(
      "layer:service",
    );
    // The inferred roles are merged into its files.
    expect(document.files).toEqual(withRoles(model.document.files, result.roles));
    // The input model is a view of an unchanged document.
    expect(model.document.components).toEqual([]);
  });

  it("passes declared modules, layers and roles through, with their warnings in canonical order", () => {
    const configured = run(model, {
      modules: [
        { name: "billing", files: [fileId("src/services/payment.service.ts")] },
        { name: "legacy", files: [] },
        {
          name: "payments",
          files: [
            fileId("src/controllers/payment.controller.ts"),
            fileId("src/services/payment.service.ts"),
          ],
        },
      ],
      layers: [
        { name: "web", rank: 0, files: [fileId("src/controllers/order.controller.ts")] },
        { name: "empty", rank: 1, files: [] },
      ],
      roles: [{ role: "utility", files: [fileId("src/shared/clock.ts")] }],
    });
    expect(configured.modules.filter((module) => module.origin === "declared")).toMatchObject([
      { id: "mod:billing", files: [fileId("src/services/payment.service.ts")] },
      { id: "mod:legacy", files: [] },
      { id: "mod:payments", files: [fileId("src/controllers/payment.controller.ts")] },
    ]);
    expect(configured.layers.map((layer) => [layer.id, layer.origin, layer.files.length])).toEqual([
      ["layer:web", "declared", 1],
      ["layer:empty", "declared", 0],
    ]);
    expect(configured.roles.get(fileId("src/shared/clock.ts"))).toMatchObject([
      { role: "utility", source: "configuration" },
    ]);
    expect(configured.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "configuration-warning",
      "configuration-warning",
      "configuration-warning",
    ]);
    const messages = configured.diagnostics.map((diagnostic) => diagnostic.message);
    expect([...messages].sort(compareStrings)).toEqual(messages);
  });
});

// ─── Random repositories ──────────────────────────────────────────────────────────────────────────────

const DIRECTORIES = [
  "",
  "controllers",
  "services",
  "src",
  "src/controllers",
  "src/services",
  "src/repositories",
  "src/models",
  "src/orders",
  "src/payments",
  "src/shared",
  "src/utils",
  "lib",
  "test",
  "pkgs/a/src",
  "pkgs/a/src/controllers",
  "pkgs/a/src/services",
  "pkgs/a/src/util",
  "pkgs/b",
  "pkgs/b/src/domain",
  "pkgs/b/src/infrastructure",
] as const;
const NAMES = [
  "order.ts",
  "order.service.ts",
  "order.controller.ts",
  "order.repository.ts",
  "payment.ts",
  "payment.service.ts",
  "payment.controller.ts",
  "user.model.ts",
  "user.service.ts",
  "index.ts",
  "util.ts",
  "a.ts",
  "b.test.ts",
  "events.d.ts",
] as const;
const ROLES: readonly FileRole[] = [
  "source",
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
const KINDS = [
  "imports",
  "imports",
  "imports",
  "re-exports",
  "uses",
  "calls",
  "references-type",
  "instantiates",
  "implements",
] as const;

/** A path in a directory ("" for the analysis root). */
const joined = (directory: string, name: string): string =>
  directory === "" ? name : `${directory}/${name}`;

interface RandomCase {
  readonly spec: SyntheticModelSpec;
  readonly options: RunOptions;
}

/** Sorted, distinct file identifiers of the files at the drawn positions. */
function filesAt(files: readonly SyntheticFileSpec[], positions: readonly number[]): FileId[] {
  if (files.length === 0) return [];
  return [...new Set(positions.map((index) => fileId(files[index % files.length]!.path)))].sort(
    compareStrings,
  );
}

/** Random repositories with packages, roles, classes, file and symbol edges, declarations and settings. */
const arbitraryCase: fc.Arbitrary<RandomCase> = fc
  .record({
    files: fc.uniqueArray(
      fc.record({
        directory: fc.constantFrom(...DIRECTORIES),
        name: fc.constantFrom(...NAMES),
        role: fc.constantFrom(...ROLES),
        withClass: fc.boolean(),
      }),
      { minLength: 3, maxLength: 30, size: "medium", selector: (f) => joined(f.directory, f.name) },
    ),
    packages: fc.subarray(["", "pkgs/a", "pkgs/b"]),
    edges: fc.array(
      fc.record({
        source: fc.nat(),
        target: fc.nat(),
        kind: fc.constantFrom(...KINDS),
        typeOnly: fc.boolean(),
        confidence: fc.constantFrom(1, 1, 0.7, 0.3),
        fromSymbol: fc.boolean(),
      }),
      { maxLength: 80, size: "medium" },
    ),
    entryPoints: fc.array(fc.nat(), { maxLength: 3 }),
    modules: fc.uniqueArray(
      fc.record({
        name: fc.constantFrom("alpha", "beta", "src", "pkgs/a/src"),
        files: fc.array(fc.nat(), { maxLength: 6 }),
      }),
      { maxLength: 2, selector: (spec) => spec.name },
    ),
    layers: fc.option(
      fc.array(fc.array(fc.nat(), { maxLength: 5 }), { minLength: 1, maxLength: 3 }),
      { freq: 4 },
    ),
    roles: fc.array(fc.nat(), { maxLength: 3 }),
    modulesConfig: fc.record(
      {
        enabled: fc.constantFrom(true, true, true, false),
        when_declared: fc.constantFrom<"infer-rest" | "none">("infer-rest", "infer-rest", "none"),
        type_only_weight: fc.constantFrom(0, 0.25, 0.5, 1),
        max_module_files: fc.integer({ min: 2, max: 8 }),
        min_module_files: fc.integer({ min: 1, max: 2 }),
        max_passes: fc.integer({ min: 1, max: 4 }),
        attach_tests: fc.boolean(),
        attach_declarations: fc.boolean(),
      },
      { requiredKeys: [] },
    ),
    layersConfig: fc.record(
      {
        enabled: fc.constantFrom(true, true, false),
        min_layer_files: fc.integer({ min: 1, max: 3 }),
        exact_order_max_layers: fc.integer({ min: 2, max: 4 }),
      },
      { requiredKeys: [] },
    ),
    includeTestsInMetrics: fc.boolean(),
    includeTypeOnly: fc.boolean(),
    maxEvidenceEntities: fc.integer({ min: 0, max: 4 }),
    maxExamples: fc.integer({ min: 0, max: 3 }),
  })
  .map((drawn): RandomCase => {
    const files: SyntheticFileSpec[] = drawn.files.map((file) => ({
      path: joined(file.directory, file.name),
      role: file.role,
      lines: file.name.length,
      ...(file.withClass ? { classes: [`${file.name.split(".")[0]!.toUpperCase()}Thing`] } : {}),
    }));
    const pathAt = (index: number): SyntheticFileSpec => files[index % files.length]!;
    const edges: SyntheticEdgeSpec[] = drawn.edges.flatMap((edge) => {
      const source = pathAt(edge.source);
      const target = pathAt(edge.target);
      if (source.path === target.path) return [];
      // Some relationships start at a class, as the linker records member calls.
      const from =
        edge.fromSymbol && source.classes !== undefined
          ? symbolId(source.path, source.classes[0]!)
          : source.path;
      return [
        {
          source: from,
          target: target.path,
          kind: edge.kind,
          typeOnly: edge.typeOnly,
          confidence: edge.confidence,
        },
      ];
    });
    const spec: SyntheticModelSpec = {
      files,
      packages: drawn.packages.map((path) => ({ path, name: path === "" ? "root" : `@x/${path}` })),
      edges,
      entryPoints: [...new Set(drawn.entryPoints.map((index) => pathAt(index).path))],
      limits: {
        maxEvidenceEntities: drawn.maxEvidenceEntities,
        maxExamplesPerDependency: drawn.maxExamples,
      },
    };
    const options: RunOptions = {
      config: { modules: drawn.modulesConfig, layers: drawn.layersConfig },
      includeTestsInMetrics: drawn.includeTestsInMetrics,
      includeTypeOnly: drawn.includeTypeOnly,
      modules: [...drawn.modules]
        .sort((a, b) => compareStrings(a.name, b.name))
        .map((module) => ({ name: module.name, files: filesAt(files, module.files) })),
      ...(drawn.layers === null
        ? {}
        : {
            layers: drawn.layers.map((members, rank) => ({
              name: `tier ${rank}`,
              rank,
              files: filesAt(files, members),
            })),
          }),
      roles:
        drawn.roles.length === 0
          ? []
          : [{ role: "repository", files: filesAt(files, drawn.roles) }],
    };
    return { spec, options };
  });

const PROPERTY_RUNS = { seed: 20261009, numRuns: 120 } as const;

// ─── Invariants ───────────────────────────────────────────────────────────────────────────────────────

/** Plan 7.1 "Partition invariants" and "Identity", on one result. */
function checkPartitions(model: ArchitectureModel, input: InferenceInput, result: InferenceResult) {
  const { settings, declarations } = input;
  const files = model.document.files;
  const roleOf = new Map(files.map((file) => [file.id, file.role]));
  const packageOf = new Map(files.map((file) => [file.id, file.package ?? ""]));
  const owned = files.filter((file) => settings.componentFileRoles.has(file.role));

  // Components: every owned file in exactly one component, the one of its own directory.
  const componentFiles = result.components.flatMap((component) => component.files);
  expect([...componentFiles].sort(compareStrings)).toEqual(owned.map((file) => file.id));
  const byId = new Map(result.components.map((component) => [component.id, component]));
  for (const component of result.components) {
    for (const file of component.files) {
      expect(paths([file])[0]!.startsWith(component.path === "" ? "" : `${component.path}/`)).toBe(
        true,
      );
    }
    if (component.parent === undefined) expect(component.path).toBe("");
    else expect(byId.get(component.parent)?.children).toContain(component.id);
    const children = component.children.map((child) => byId.get(child)!);
    for (const child of children) expect(child.parent).toBe(component.id);
    // Totals are subtree sums.
    const own = component.files.map((file) => model.index.file(file)!);
    expect(component.totals).toEqual({
      files: own.length + children.reduce((sum, child) => sum + child.totals.files, 0),
      symbols:
        own.reduce((sum, file) => sum + file.symbols.length, 0) +
        children.reduce((sum, child) => sum + child.totals.symbols, 0),
      lines:
        own.reduce((sum, file) => sum + (file.lines ?? 0), 0) +
        children.reduce((sum, child) => sum + child.totals.lines, 0),
    });
  }

  // Modules: every file in at most one module; declared membership is exact (D-22, D-23).
  const moduleOf = new Map<FileId, string>();
  for (const module of result.modules) {
    for (const file of module.files) {
      expect(moduleOf.has(file), `${file} in one module`).toBe(false);
      moduleOf.set(file, module.id);
    }
  }
  const claimed = new Set<FileId>();
  for (const spec of declarations.modules) {
    const expected = spec.files.filter(
      (file) => settings.componentFileRoles.has(roleOf.get(file) ?? "other") && !claimed.has(file),
    );
    for (const file of expected) claimed.add(file);
    expect(moduleWithId(result, `mod:${spec.name}`).files).toEqual(expected);
  }
  const inferenceRuns =
    settings.modules.enabled &&
    !(settings.modules.whenDeclared === "none" && declarations.modules.length > 0);
  const inferred = result.modules.filter((module) => module.origin === "inferred");
  if (!inferenceRuns) expect(inferred).toEqual([]);
  for (const file of files) {
    const isNode = settings.modules.fileRoles.has(file.role) && !claimed.has(file.id);
    if (inferenceRuns && isNode) {
      expect(moduleWithId(result, moduleOf.get(file.id) ?? "?").origin).toBe("inferred");
    }
  }
  for (const module of inferred) {
    // No inferred module holds a declared file; none spans packages, attached files included.
    for (const file of module.files) expect(claimed.has(file)).toBe(false);
    expect(new Set(module.files.map((file) => packageOf.get(file))).size).toBe(1);
    expect(module.packages.length).toBeLessThanOrEqual(1);
    // Identity: the id derives from the anchor (§3.10), with `~inferred` on a collision.
    const key = inferredModuleKey(module.anchor!);
    expect([moduleId(key), moduleId(`${key}~inferred`)]).toContain(module.id);
  }
  expect(new Set(result.modules.map((module) => module.id)).size).toBe(result.modules.length);

  // Cross-references agree with the memberships.
  const componentOf = new Map<FileId, string>();
  for (const component of result.components) {
    for (const file of component.files) componentOf.set(file, component.id);
  }
  for (const module of result.modules) {
    const expected = new Set(module.files.flatMap((file) => componentOf.get(file) ?? []));
    expect(module.components).toEqual([...expected].sort(compareStrings));
  }
  for (const component of result.components) {
    const subtree = (id: ComponentEntity["id"]): FileId[] => {
      const entity = byId.get(id)!;
      return [...entity.files, ...entity.children.flatMap(subtree)];
    };
    const expected = new Set(subtree(component.id).flatMap((file) => moduleOf.get(file) ?? []));
    expect(component.modules).toEqual([...expected].sort(compareStrings));
  }

  // Layers: each file in at most one layer; tests and declarations in none (D-50).
  const layered = new Set<FileId>();
  for (const layer of result.layers) {
    for (const file of layer.files) {
      expect(layered.has(file)).toBe(false);
      layered.add(file);
      expect(roleOf.get(file)).toBe("source");
    }
  }
}

/** Plan 7.1 "InferenceInfo", with plan 4.6's evidence order. */
function checkInference(unit: ModuleEntity | LayerEntity, info: InferenceInfo): void {
  expect(info.reason, unit.id).toMatch(/^Inferred: /);
  expect(info.confidence).toBeGreaterThanOrEqual(0);
  expect(info.confidence).toBeLessThanOrEqual(1);
  const weighted = info.evidence.filter((evidence) => evidence.weight !== undefined);
  const context = info.evidence.filter((evidence) => evidence.weight === undefined);
  // Weighted observations first.
  expect(info.evidence).toEqual([...weighted, ...context]);
  // Every weighted value is a measurement in [0, 1]; context signals may carry counts (U4).
  for (const evidence of weighted) {
    if (evidence.value === undefined) continue;
    expect(evidence.value).toBeGreaterThanOrEqual(0);
    expect(evidence.value).toBeLessThanOrEqual(1);
  }
  const weights = weighted.reduce((sum, evidence) => sum + evidence.weight!, 0);
  expect(Math.abs(weights - 1), unit.id).toBeLessThan(1e-9);
  const recomputed = weighted.reduce(
    (sum, evidence) => sum + evidence.weight! * (evidence.value ?? 0),
    0,
  );
  expect(Math.abs(recomputed - info.confidence), unit.id).toBeLessThan(1e-8);
  const contribution = (evidence: Evidence): number => evidence.weight! * (evidence.value ?? 0);
  for (let i = 1; i < weighted.length; i++) {
    const a = weighted[i - 1]!;
    const b = weighted[i]!;
    expect(
      contribution(a) > contribution(b) ||
        (contribution(a) === contribution(b) && compareStrings(a.signal, b.signal) <= 0),
      `${unit.id}: ${a.signal} before ${b.signal}`,
    ).toBe(true);
  }
  const compareContext = (a: Evidence, b: Evidence): number =>
    compareStrings(a.signal, b.signal) ||
    compareStrings(a.description, b.description) ||
    (a.value === undefined ? -1 : 0) - (b.value === undefined ? -1 : 0) ||
    (a.value ?? 0) - (b.value ?? 0) ||
    compareStrings((a.entities ?? []).join("\n"), (b.entities ?? []).join("\n"));
  for (let i = 1; i < context.length; i++) {
    expect(compareContext(context[i - 1]!, context[i]!), unit.id).toBeLessThanOrEqual(0);
  }
}

/**
 * Plan 6.5 "aggregation": per level, Σ edgeCount over the dependency lists equals the number of underlying
 * IR edges of the metrics projection that cross two units, and dependencies and dependents mirror each other.
 */
function checkAggregation(input: InferenceInput, result: InferenceResult): void {
  const { unitsModel, projection } = {
    unitsModel: result.unitsModel,
    projection: input.projection,
  };
  const edgeKinds = projection.edgeKinds ?? new Set(DEFAULT_EDGE_KINDS);
  const fileRoles = projection.fileRoles ?? new Set(DEFAULT_FILE_ROLES);
  const levels: [AggregationLevel, readonly (ComponentEntity | ModuleEntity | LayerEntity)[]][] = [
    ["component", result.components],
    ["module", result.modules],
    ["layer", result.layers],
  ];
  for (const [level, units] of levels) {
    let crossing = 0;
    for (const edge of unitsModel.document.edges) {
      if (!edgeKinds.has(edge.kind)) continue;
      if (projection.includeTypeOnly === false && edge.typeOnly) continue;
      const admitted = [edge.source, edge.target].every((node) => {
        const file = unitsModel.fileOf(node);
        const role = file === undefined ? undefined : unitsModel.index.file(file)?.role;
        return role !== undefined && fileRoles.has(role) && fileRoles.has(unitsModel.roleOf(node)!);
      });
      if (!admitted) continue;
      const from = unitsModel.unitOf(edge.source, level);
      const to = unitsModel.unitOf(edge.target, level);
      if (from !== undefined && to !== undefined && from !== to) crossing += 1;
    }
    const counted = units.reduce(
      (sum, unit) =>
        sum + unit.dependencies.reduce((total, dependency) => total + dependency.edgeCount, 0),
      0,
    );
    expect(counted, level).toBe(crossing);
    const byId = new Map(units.map((unit) => [unit.id as string, unit]));
    for (const unit of units) {
      for (const dependency of unit.dependencies) {
        const mirror = byId
          .get(dependency.entity)
          ?.dependents.find((dependent) => dependent.entity === unit.id);
        expect(mirror, `${unit.id} → ${dependency.entity}`).toEqual({
          ...dependency,
          entity: unit.id,
        });
        expect(dependency.examples.length).toBeLessThanOrEqual(
          unitsModel.document.limits?.maxExamplesPerDependency ?? 5,
        );
      }
      const dependents = unit.dependents.reduce((sum, dependent) => sum + dependent.edgeCount, 0);
      const mirrored = units.reduce(
        (sum, other) =>
          sum +
          other.dependencies
            .filter((dependency) => dependency.entity === unit.id)
            .reduce((total, dependency) => total + dependency.edgeCount, 0),
        0,
      );
      expect(dependents).toBe(mirrored);
    }
  }
}

const prefixed = (path: string): string => `x/${path}`;

/** A module id after every path got the prefix `x/`: `.` becomes `x`, `.#stem` becomes `x#stem`. */
function prefixedModuleId(id: string): string {
  const key = id.slice("mod:".length);
  if (key === ".") return "mod:x";
  if (key.startsWith(".#")) return `mod:x${key.slice(1)}`;
  return `mod:x/${key}`;
}

/** The same repository with every path, package path included, below `x/`. */
function prefixedSpec(spec: SyntheticModelSpec): SyntheticModelSpec {
  const move = (node: string): string =>
    node.startsWith("sym:") ? `sym:x/${node.slice("sym:".length)}` : prefixed(node);
  return {
    ...spec,
    files: spec.files.map((file) =>
      typeof file === "string" ? prefixed(file) : { ...file, path: prefixed(file.path) },
    ),
    packages: (spec.packages ?? []).map((entry) =>
      typeof entry === "string"
        ? prefixed(entry)
        : { ...entry, path: entry.path === "" ? "x" : prefixed(entry.path) },
    ),
    edges: (spec.edges ?? []).map((edge) => {
      const description = "source" in edge ? edge : { source: edge[0], target: edge[1] };
      return { ...description, source: move(description.source), target: move(description.target) };
    }),
    entryPoints: (spec.entryPoints ?? []).map((entry) =>
      typeof entry === "string" ? prefixed(entry) : { ...entry, entity: prefixed(entry.entity) },
    ),
  };
}

/**
 * Plan 7.1 "Path invariance": prefixing every path with `x/` changes module ids only by the prefix and leaves
 * memberships unchanged.
 */
function expectPrefixInvariance(spec: SyntheticModelSpec, options: RunOptions): void {
  const files = (list: readonly FileId[]): FileId[] =>
    list.map((file) => fileId(prefixed(file.slice("file:".length))));
  const original = run(syntheticModel(spec), options);
  const moved = run(syntheticModel(prefixedSpec(spec)), {
    ...options,
    ...(options.layers === undefined
      ? {}
      : { layers: options.layers.map((layer) => ({ ...layer, files: files(layer.files) })) }),
    roles: (options.roles ?? []).map((role) => ({ ...role, files: files(role.files) })),
  });
  const view = (modules: readonly ModuleEntity[], id: (id: string) => string): string[][] =>
    modules
      .map((module) => [id(module.id), ...module.files])
      .sort((a, b) => compareStrings(a[0]!, b[0]!));
  expect(view(moved.modules, (id) => id)).toEqual(
    view(original.modules, prefixedModuleId).map(([id, ...members]) => [
      id!,
      ...files(members as FileId[]),
    ]),
  );
}

describe("inferArchitecture: properties (plan 7.1, 6.5)", () => {
  it("keeps the partition, identity, cross-reference and InferenceInfo invariants (property)", () => {
    const reached = new Map<string, number>();
    const count = (what: string): void => {
      reached.set(what, (reached.get(what) ?? 0) + 1);
    };
    fc.assert(
      fc.property(arbitraryCase, ({ spec, options }) => {
        const model = syntheticModel(spec);
        const input = inputFor(model, options);
        const result = inferArchitecture(input);
        checkPartitions(model, input, result);
        for (const unit of [...result.modules, ...result.layers]) {
          if (unit.inference !== undefined) checkInference(unit, unit.inference);
          count(`${unit.id.split(":")[0]!}-${unit.origin}`);
        }
        if (result.layers.some((layer) => layer.dependencies.length > 0)) count("layer-dependency");
        if (result.modules.some((module) => module.dependencies.length > 0))
          count("module-dependency");
      }),
      PROPERTY_RUNS,
    );
    for (const what of [
      "mod-inferred",
      "mod-declared",
      "layer-inferred",
      "layer-declared",
      "layer-dependency",
      "module-dependency",
    ]) {
      expect(reached.get(what) ?? 0, what).toBeGreaterThan(0);
    }
  });

  it("aggregates every cross-unit relationship of the metrics projection exactly once (property)", () => {
    fc.assert(
      fc.property(arbitraryCase, ({ spec, options }) => {
        const input = inputFor(syntheticModel(spec), options);
        checkAggregation(input, inferArchitecture(input));
      }),
      PROPERTY_RUNS,
    );
  });

  it("gives byte-identical sections for shuffled input arrays (property)", () => {
    fc.assert(
      fc.property(
        arbitraryCase,
        fc.integer({ min: 1, max: 2 ** 31 - 1 }),
        ({ spec, options }, seed) => {
          const model = syntheticModel(spec);
          expect(serialized(run(shuffledModel(model, seed), options))).toBe(
            serialized(run(model, options)),
          );
        },
      ),
      PROPERTY_RUNS,
    );
  });

  it("gives the same sections when run on its own output (D-20) (property)", () => {
    fc.assert(
      fc.property(arbitraryCase, ({ spec, options }) => {
        const model = syntheticModel(spec);
        const first = run(model, options);
        const merged = ArchitectureModel.from({
          ...model.document,
          files: withRoles(model.document.files, first.roles),
          components: first.components,
          modules: first.modules,
          layers: first.layers,
        });
        expect(serialized(run(merged, options))).toBe(serialized(first));
      }),
      PROPERTY_RUNS,
    );
  });

  it("reproduces the memberships when the inferred modules are declared (property)", () => {
    fc.assert(
      fc.property(arbitraryCase, ({ spec, options }) => {
        const model = syntheticModel(spec);
        const first = run(model, { ...options, modules: [] });
        const inferred = first.modules.filter((module) => module.origin === "inferred");
        const modules = inferred
          .map((module, index) => ({
            name: `m${String(index).padStart(3, "0")}`,
            files: module.files,
          }))
          .sort((a, b) => compareStrings(a.name, b.name));
        const declared = run(model, { ...options, modules });
        const memberships = (list: readonly ModuleEntity[]): string[] =>
          list.map((module) => module.files.join(" ")).sort(compareStrings);
        expect(
          memberships(declared.modules.filter((module) => module.origin === "declared")),
        ).toEqual(memberships(inferred));
      }),
      PROPERTY_RUNS,
    );
  });

  it("changes module ids only by a path prefix and keeps memberships (property)", () => {
    fc.assert(
      fc.property(arbitraryCase, ({ spec, options }) => {
        // Declared modules keep their names; they are not inferred.
        expectPrefixInvariance(spec, { ...options, modules: [] });
      }),
      PROPERTY_RUNS,
    );
  });

  it("moves the analysis root's modules, stem modules included, under the prefix", () => {
    const spec: SyntheticModelSpec = {
      files: [
        "main.ts",
        "controllers/order.controller.ts",
        "controllers/user.controller.ts",
        "services/order.service.ts",
        "services/user.service.ts",
      ],
      edges: [
        ["main.ts", "controllers/order.controller.ts"],
        ["main.ts", "controllers/user.controller.ts"],
        ["controllers/order.controller.ts", "services/order.service.ts"],
        ["controllers/user.controller.ts", "services/user.service.ts"],
      ],
      entryPoints: ["main.ts"],
    };
    expect(run(syntheticModel(spec)).modules.map((module) => module.id)).toEqual([
      "mod:.",
      "mod:.#order",
      "mod:.#user",
    ]);
    expectPrefixInvariance(spec, {});
  });

  it("keeps the other packages' modules when a package is added (locality, property)", () => {
    fc.assert(
      fc.property(
        arbitraryCase,
        fc.array(fc.record({ name: fc.constantFrom(...NAMES), target: fc.nat() }), {
          minLength: 1,
          maxLength: 8,
        }),
        ({ spec, options }, added) => {
          const base = { ...options, modules: [] };
          const existing = spec.files.map((file) => (typeof file === "string" ? file : file.path));
          const newFiles = [...new Set(added.map((file) => `pkgs/new/src/${file.name}`))];
          const extended: SyntheticModelSpec = {
            ...spec,
            files: [...spec.files, ...newFiles],
            packages: [...(spec.packages ?? []), { path: "pkgs/new", name: "@x/new" }],
            edges: [
              ...(spec.edges ?? []),
              ...added.map((file): SyntheticEdgeSpec => ({
                source: `pkgs/new/src/${file.name}`,
                target: existing[file.target % existing.length]!,
              })),
            ],
          };
          const before = run(syntheticModel(spec), base);
          const after = run(syntheticModel(extended), base);
          // Node members (attachments may change, D-65) of every module outside the new package.
          const nodes = (result: InferenceResult, settingsRoles: ReadonlySet<FileRole>) => {
            const roleOf = new Map(
              syntheticModel(extended).document.files.map((file) => [file.id, file.role]),
            );
            return result.modules
              .filter((module) => !module.packages.includes("pkg:npm:pkgs/new"))
              .map((module) => [
                module.id,
                module.files.filter((file) => settingsRoles.has(roleOf.get(file) ?? "other")),
              ]);
          };
          const roles = inputFor(syntheticModel(spec), base).settings.modules.fileRoles;
          expect(nodes(after, roles)).toEqual(nodes(before, roles));
        },
      ),
      { seed: 20261011, numRuns: 80 },
    );
  });

  it("keeps the other modules when an unconnected feature directory is renamed (locality)", () => {
    const feature = (directory: string): SyntheticModelSpec => ({
      ...SHOP,
      files: [
        ...SHOP.files,
        `src/${directory}/zone.ts`,
        `src/${directory}/zone-map.ts`,
        `src/${directory}/rules.ts`,
      ],
      edges: [
        ...(SHOP.edges ?? []),
        [`src/${directory}/zone-map.ts`, `src/${directory}/zone.ts`],
        [`src/${directory}/rules.ts`, `src/${directory}/zone.ts`],
      ],
    });
    const before = run(syntheticModel(feature("zeta")));
    const after = run(syntheticModel(feature("omega")));
    const others = (result: InferenceResult, directory: string) =>
      result.modules
        .filter((module) => module.anchor?.directory !== `src/${directory}`)
        .map((module) => [module.id, module.files, module.inference?.confidence]);
    expect(moduleWithId(before, "mod:src/zeta").files).toHaveLength(3);
    expect(moduleWithId(after, "mod:src/omega").files).toHaveLength(3);
    expect(others(after, "omega")).toEqual(others(before, "zeta"));
  });
});

// ─── D-56: method coverage ────────────────────────────────────────────────────────────────────────────

/**
 * A repository rich enough for most parameters to change the outcome: layer directories with recurring
 * stems and an unconnected layer, feature directories with misplaced files, a shared directory, a flat
 * directory, a barrel, type-only and low-confidence relationships, tests, a declaration and a declared module
 * with a test.
 */
function richSpec(): SyntheticModelSpec {
  const flat = Array.from({ length: 6 }, (_, i) => `src/reports/report-${String(i)}.ts`);
  return {
    repositoryName: "rich",
    packages: [{ path: "", name: "rich" }],
    files: [
      "src/main.ts",
      { path: "src/controllers/order.controller.ts", classes: ["OrderController"] },
      { path: "src/controllers/user.controller.ts", classes: ["UserController"] },
      "src/controllers/health.controller.ts",
      { path: "src/services/order.service.ts", classes: ["OrderService"] },
      { path: "src/services/user.service.ts", classes: ["UserService"] },
      "src/services/mailer.ts",
      "src/models/order.ts",
      "src/models/user.ts",
      "src/catalog/product.ts",
      "src/catalog/price.ts",
      "src/catalog/index.ts",
      "src/catalog/cart-total.ts",
      "src/cart/cart.ts",
      "src/cart/cart-view.ts",
      "src/cart/coupon.ts",
      "src/repositories/audit.repository.ts",
      "src/shared/logger.ts",
      "src/shared/format.ts",
      ...flat,
      { path: "src/types.d.ts", role: "declaration" },
      { path: "test/order.test.ts", role: "test" },
      { path: "test/cart.test.ts", role: "test" },
      { path: "src/legacy/old.ts" },
      { path: "src/legacy/old.test.ts", role: "test" },
    ],
    edges: [
      ["src/main.ts", "src/controllers/order.controller.ts"],
      ["src/main.ts", "src/controllers/user.controller.ts"],
      ["src/main.ts", "src/catalog/index.ts"],
      ["src/main.ts", "src/cart/cart.ts"],
      ["src/controllers/order.controller.ts", "src/services/order.service.ts"],
      ["src/controllers/user.controller.ts", "src/services/user.service.ts"],
      ["src/controllers/health.controller.ts", "src/services/mailer.ts"],
      ["src/services/order.service.ts", "src/models/order.ts"],
      { source: "src/services/order.service.ts", target: "src/models/user.ts", typeOnly: true },
      ["src/services/user.service.ts", "src/models/user.ts"],
      ["src/services/order.service.ts", "src/services/mailer.ts"],
      { source: "src/services/user.service.ts", target: "src/services/mailer.ts", confidence: 0.3 },
      { source: "src/catalog/index.ts", target: "src/catalog/product.ts", kind: "re-exports" },
      { source: "src/catalog/index.ts", target: "src/catalog/price.ts", kind: "re-exports" },
      ["src/catalog/price.ts", "src/catalog/product.ts"],
      ["src/cart/cart.ts", "src/catalog/cart-total.ts"],
      ["src/cart/cart-view.ts", "src/catalog/cart-total.ts"],
      ["src/catalog/cart-total.ts", "src/cart/cart.ts"],
      { source: "src/catalog/cart-total.ts", target: "src/catalog/price.ts", typeOnly: true },
      ["src/cart/cart-view.ts", "src/cart/cart.ts"],
      // One dependent elsewhere: it moves only with move_min_support 1.
      ["src/catalog/price.ts", "src/cart/coupon.ts"],
      ["src/cart/cart.ts", "src/shared/logger.ts"],
      ["src/catalog/product.ts", "src/shared/logger.ts"],
      ["src/services/order.service.ts", "src/shared/logger.ts"],
      ["src/services/user.service.ts", "src/shared/format.ts"],
      ["src/cart/cart-view.ts", "src/shared/format.ts"],
      ...flat.slice(1).map((file): [string, string] => [file, flat[0]!]),
      ["src/main.ts", flat[0]!],
      { source: "src/services/order.service.ts", target: "src/types.d.ts", typeOnly: true },
      { source: "src/models/order.ts", target: "src/types.d.ts", typeOnly: true },
      ["test/order.test.ts", "src/services/order.service.ts"],
      ["test/order.test.ts", "src/cart/cart.ts"],
      ["test/cart.test.ts", "src/cart/cart.ts"],
      ["src/legacy/old.test.ts", "src/legacy/old.ts"],
      ["src/legacy/old.ts", "src/shared/format.ts"],
    ],
    entryPoints: ["src/main.ts"],
  };
}

/** Non-default values of every inference key (INFERENCE_KEYS), as configuration. */
const NON_DEFAULTS: Readonly<Record<string, InferenceConfiguration>> = {
  "components.file_roles": { components: { file_roles: ["source", "declaration"] } },
  "modules.enabled": { modules: { enabled: false } },
  "modules.when_declared": { modules: { when_declared: "none" } },
  "modules.file_roles": { modules: { file_roles: ["source", "test"] } },
  "modules.type_only_weight": { modules: { type_only_weight: 0 } },
  "modules.min_edge_confidence": { modules: { min_edge_confidence: 0.2 } },
  "modules.max_module_files": { modules: { max_module_files: 5 } },
  "modules.min_module_files": { modules: { min_module_files: 1 } },
  "modules.stem_min_coverage": { modules: { stem_min_coverage: 0.9 } },
  "modules.utility_min_modules": { modules: { utility_min_modules: 2 } },
  "modules.move_min_support": { modules: { move_min_support: 1 } },
  "modules.move_min_weight": { modules: { move_min_weight: 3 } },
  "modules.max_passes": { modules: { max_passes: 1 } },
  "modules.attach_tests": { modules: { attach_tests: false } },
  "modules.attach_declarations": { modules: { attach_declarations: false } },
  "modules.container_directories": { modules: { container_directories: ["catalog"] } },
  "modules.shared_directories": { modules: { shared_directories: ["!shared"] } },
  "modules.generic_tokens": { modules: { generic_tokens: ["order"] } },
  "layers.enabled": { layers: { enabled: false } },
  "layers.directory_layers": { layers: { directory_layers: { services: null } } },
  "layers.role_layers": { layers: { role_layers: { service: null } } },
  "layers.naming_suffixes": { layers: { naming_suffixes: { controller: null } } },
  "layers.conventional_tiers": { layers: { conventional_tiers: [["model"], ["controller"]] } },
  "layers.min_label_score": { layers: { min_label_score: 0.95 } },
  "layers.min_layer_files": { layers: { min_layer_files: 3 } },
  "layers.exact_order_max_layers": { layers: { exact_order_max_layers: 2 } },
  roles: { roles: { repository: ["src/services/mailer.ts"] } },
};

describe("inferArchitecture: method strings cover every parameter that changes the result (D-56)", () => {
  const model = syntheticModel(richSpec());
  const declared: DeclaredModuleSpec[] = [
    { name: "legacy", files: [fileId("src/legacy/old.test.ts"), fileId("src/legacy/old.ts")] },
  ];
  /** The configured role globs of `roles`, resolved as the engine would (literal paths). */
  const rolesOf = (config: InferenceConfiguration): ConfiguredRoleSpec[] =>
    Object.entries(config.roles ?? {}).map(([role, globs]) => ({
      role: role as ConfiguredRoleSpec["role"],
      files: (globs ?? []).map(fileId).sort(compareStrings),
    }));
  const outcome = (config: InferenceConfiguration, includeTestsInMetrics = false) => {
    const result = run(model, {
      config,
      includeTestsInMetrics,
      modules: declared,
      roles: rolesOf(config),
    });
    const settings = resolveInferenceSettings(config, { includeTestsInMetrics });
    return {
      methods: settings.methods,
      // Ids, memberships and confidences of modules; ids, memberships, ranks and confidences of layers.
      modules: JSON.stringify(
        result.modules.map((module) => [module.id, module.files, module.inference?.confidence]),
      ),
      layers: JSON.stringify(
        result.layers.map((layer) => [
          layer.id,
          layer.files,
          layer.rank,
          layer.inference?.confidence,
        ]),
      ),
    };
  };
  const defaults = outcome({});

  it("lists a non-default value for every key of INFERENCE_KEYS", () => {
    const keys = [
      ...INFERENCE_KEYS.components.map((key) => `components.${key}`),
      ...INFERENCE_KEYS.modules.map((key) => `modules.${key}`),
      ...INFERENCE_KEYS.layers.map((key) => `layers.${key}`),
      ...INFERENCE_KEYS.sections.filter((key) => key === "roles"),
    ];
    expect(Object.keys(NON_DEFAULTS).sort(compareStrings)).toEqual(keys.sort(compareStrings));
  });

  it.each(Object.entries(NON_DEFAULTS))("%s", (_key, config) => {
    const changed = outcome(config);
    if (changed.modules !== defaults.modules) {
      expect(changed.methods.modules).not.toBe(defaults.methods.modules);
    }
    if (changed.layers !== defaults.layers) {
      expect(changed.methods.layers).not.toBe(defaults.methods.layers);
    }
  });

  it("analysis.include_tests_in_metrics", () => {
    const changed = outcome({}, true);
    if (changed.modules !== defaults.modules) {
      expect(changed.methods.modules).not.toBe(defaults.methods.modules);
    }
    if (changed.layers !== defaults.layers) {
      expect(changed.methods.layers).not.toBe(defaults.methods.layers);
    }
  });

  it("is exercised: most parameters change the outcome on this repository", () => {
    const changing = Object.entries(NON_DEFAULTS).filter(([, config]) => {
      const changed = outcome(config);
      return changed.modules !== defaults.modules || changed.layers !== defaults.layers;
    });
    // 23 of the 27 keys; min_module_files, max_passes, min_layer_files and exact_order_max_layers need
    // oversized directories, reassignment chains, naming-only layers and layer cycles.
    expect(changing.length).toBeGreaterThanOrEqual(Object.keys(NON_DEFAULTS).length * 0.8);
  });
});
