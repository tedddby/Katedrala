import { readFileSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigurationError, InMemorySource, sortDiagnostics } from "@katedrala/core";
import {
  resolveInferenceSettings,
  type InferenceInput,
  type InferenceResult,
} from "@katedrala/inference";
import {
  canonicalizeDocument,
  compareStrings,
  componentId,
  declaredModuleKey,
  emptyDocument,
  fileId,
  inferredModuleKey,
  layerId,
  moduleId,
  serializeDocument,
  type ArchitectureDocument,
  type ComponentEntity,
  type Diagnostic,
  type FileEntity,
  type FileId,
  type LayerEntity,
  type ModuleEntity,
  type PackageId,
  type RoleEntry,
} from "@katedrala/ir";
import { toProjectionInfo } from "@katedrala/model";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  analyzeArchitecture,
  analyzeArchitectureWith,
  type ArchitectureSections,
  type InferenceStage,
} from "./architecture.js";
import { resolveDeclarations } from "./declarations.js";
import { metricsProjectionOptions } from "./projection.js";
import {
  ANALYSIS_STAGES,
  analyzeStructure,
  type AnalyzeOptions,
  type StructureDocument,
} from "./structure.js";

// ─── A small repository ───────────────────────────────────────────────────────────────────────────────

const PROJECT: Readonly<Record<string, string>> = {
  "package.json": `${JSON.stringify({ name: "shop", version: "1.0.0" })}\n`,
  "src/main.ts":
    'import { OrderService } from "./orders/order.service";\n\nnew OrderService().place();\n',
  "src/orders/order.service.ts": [
    'import type { Order } from "./order";',
    'import { pay } from "../payments/payment";',
    "",
    "export class OrderService {",
    "  place(): Order {",
    "    pay();",
    '    return { id: "1" };',
    "  }",
    "}",
    "",
  ].join("\n"),
  "src/orders/order.ts": "export interface Order {\n  id: string;\n}\n",
  "src/payments/payment.ts": "export function pay(): number {\n  return 1;\n}\n",
  "src/payments/refund.ts":
    'import { pay } from "./payment";\n\nexport const refund = (): number => -pay();\n',
  "src/payments/payment.test.ts": 'import { pay } from "./payment";\n\npay();\n',
  "src/types/env.d.ts": "declare const VERSION: string;\n",
};

const lines = (...rows: string[]): string => `${rows.join("\n")}\n`;

/**
 * Every inference section, a declared module that loses a file to an overlapping one ("billing" sorts first,
 * D-23), one that matches nothing, and a reserved section no stage evaluates yet (`rules`).
 */
const CONFIGURATION = lines(
  "modules:",
  '  payments: ["src/payments/**"]',
  '  billing: ["src/payments/payment.ts"]',
  '  legacy: ["src/legacy/**"]',
  "layers:",
  "  - name: service",
  '    files: ["src/orders/**"]',
  "inference:",
  "  roles:",
  '    data-model: ["src/orders/order.ts"]',
  "  modules:",
  "    max_module_files: 200",
  "rules:",
  "  - id: no-cycles",
  "    no_cycles: true",
);

const CONFIGURATION_FILE = "katedrala.config.yaml";

/** The configuration sections inference reads (`resolveDeclarations` takes them). */
type InferenceSections = Parameters<typeof resolveDeclarations>[1];

function source(extra: Readonly<Record<string, string>> = {}): InMemorySource {
  return new InMemorySource({ files: { ...PROJECT, ...extra } });
}

const configured = (configuration: string = CONFIGURATION): InMemorySource =>
  source({ [CONFIGURATION_FILE]: configuration });

const BASE_OPTIONS = { cache: false, concurrency: 1 } as const satisfies AnalyzeOptions;

// ─── A stand-in for the inference stage ───────────────────────────────────────────────────────────────

/** What the stand-in stage was called with. */
interface StageCalls {
  readonly inputs: InferenceInput[];
  /** Serialized structure document of each call, taken when the stage was called. */
  readonly structureAtCall: string[];
}

const INFERRED_SOURCES: ReadonlySet<string> = new Set(["naming", "location", "configuration"]);

function compareRoleEntries(a: RoleEntry, b: RoleEntry): number {
  return compareStrings(a.role, b.role) || compareStrings(a.source, b.source);
}

/** Distinct values, sorted. */
function sortedDistinct<T extends string>(values: Iterable<T>): T[] {
  return [...new Set(values)].sort(compareStrings);
}

/**
 * A deterministic stand-in for `inferArchitecture`, enough to exercise the engine's wiring: configured roles
 * of source files (D-17) and a naming role for `*.service.ts`; one root component; declared modules (first by
 * name keeps a file, D-23; empty ones warned about) and one inferred module with the remaining source files;
 * declared layers of source files (D-50). Its diagnostics come out of canonical order on purpose.
 */
function standInResult(input: InferenceInput): InferenceResult {
  const { model, settings, declarations, repositoryName } = input;
  const files = model.document.files;
  const fileById = new Map(files.map((file) => [file.id, file]));
  const owns = (file: FileId): boolean => {
    const role = fileById.get(file)?.role;
    return role !== undefined && settings.componentFileRoles.has(role);
  };
  const isSource = (file: FileId): boolean => fileById.get(file)?.role === "source";
  const packagesOf = (members: readonly FileId[]): PackageId[] =>
    sortedDistinct(members.flatMap((file) => fileById.get(file)?.package ?? []));

  const roles = new Map<FileId, RoleEntry[]>();
  const addRole = (file: FileId, entry: RoleEntry): void => {
    roles.set(file, [...(roles.get(file) ?? []), entry].sort(compareRoleEntries));
  };
  for (const spec of declarations.roles) {
    for (const file of spec.files.filter(isSource)) {
      addRole(file, {
        role: spec.role,
        confidence: 1,
        source: "configuration",
        evidence: [
          {
            signal: "configured-glob",
            description: `The file matches inference.roles.${spec.role}.`,
            value: 1,
          },
        ],
      });
    }
  }
  for (const file of files) {
    if (file.role !== "source" || !file.name.endsWith(".service.ts")) continue;
    addRole(file.id, {
      role: "service",
      confidence: 0.8,
      source: "naming",
      evidence: [
        {
          signal: "name-qualifier",
          description: `Naming rule (Katedrala heuristic): the file name ${file.name} has the qualifier service.`,
          value: 0.8,
          entities: [file.id],
        },
      ],
    });
  }

  const diagnostics: Diagnostic[] = [];
  const claimed = new Set<FileId>();
  const modules: ModuleEntity[] = [];
  for (const spec of declarations.modules) {
    const members = spec.files.filter((file) => owns(file) && !claimed.has(file));
    for (const file of members) claimed.add(file);
    if (members.length === 0) {
      diagnostics.push({
        code: "configuration-warning",
        severity: "warning",
        message: `Declared module "${spec.name}" matches no file`,
        ...(declarations.configurationFile === undefined
          ? {}
          : { file: declarations.configurationFile }),
      });
    }
    modules.push({
      id: moduleId(declaredModuleKey(spec.name)),
      name: spec.name,
      origin: "declared",
      packages: packagesOf(members),
      files: members,
      components: members.length === 0 ? [] : [componentId("")],
      entryPoints: (spec.entry ?? []).filter((file) => members.includes(file)),
      publicApi: [],
      dependencies: [],
      dependents: [],
    });
  }
  const rest = files.filter((file) => isSource(file.id) && !claimed.has(file.id));
  if (rest.length > 0) {
    const members = rest.map((file) => file.id);
    modules.push({
      id: moduleId(inferredModuleKey({ directory: "src" })),
      name: "src",
      origin: "inferred",
      anchor: { directory: "src" },
      packages: packagesOf(members),
      files: members,
      components: [componentId("")],
      entryPoints: [],
      publicApi: [],
      inference: {
        confidence: 0.5,
        method: settings.methods.modules,
        reason: "Inferred: the source files no declared module claims (a test stand-in).",
        evidence: [
          {
            signal: "module-size",
            description: `${members.length} member files.`,
            value: 0.5,
            weight: 1,
          },
        ],
      },
      dependencies: [],
      dependents: [],
    });
  }
  modules.sort((a, b) => compareStrings(a.id, b.id));

  const layered = new Set<FileId>();
  const layers: LayerEntity[] = (declarations.layers ?? [])
    .map((spec): LayerEntity => {
      const members = spec.files.filter((file) => isSource(file) && !layered.has(file));
      for (const file of members) layered.add(file);
      return {
        id: layerId(spec.name),
        name: spec.name,
        origin: "declared",
        rank: spec.rank,
        files: members,
        dependencies: [],
        dependents: [],
      };
    })
    .sort((a, b) => a.rank - b.rank || compareStrings(a.id, b.id));

  const owned = files.filter((file) => owns(file.id));
  const component: ComponentEntity = {
    id: componentId(""),
    name: repositoryName,
    kind: "directory",
    path: "",
    packages: [],
    children: [],
    files: owned.map((file) => file.id),
    totals: {
      files: owned.length,
      symbols: owned.reduce((sum, file) => sum + file.symbols.length, 0),
      lines: owned.reduce((sum, file) => sum + (file.lines ?? 0), 0),
    },
    modules: modules.filter((module) => module.files.length > 0).map((module) => module.id),
    dependencies: [],
    dependents: [],
  };

  // Out of canonical order on purpose: a diagnostic without a file sorts first.
  diagnostics.push({
    code: "approximation-used",
    severity: "info",
    message: "A stand-in inference stage produced this document",
  });
  return { roles, components: [component], modules, layers, diagnostics, unitsModel: model };
}

/** A stand-in for `withRoles`: replaces naming, location and configuration entries (D-20), copy-on-write. */
function mergeRoles(
  files: readonly FileEntity[],
  roles: ReadonlyMap<FileId, readonly RoleEntry[]>,
): FileEntity[] {
  return files.map((file) => {
    const inferred = roles.get(file.id);
    if (inferred === undefined) return file;
    const kept = (file.roles ?? []).filter((entry) => !INFERRED_SOURCES.has(entry.source));
    return { ...file, roles: [...kept, ...inferred].sort(compareRoleEntries) };
  });
}

function standInStage(): { stage: InferenceStage; calls: StageCalls } {
  const calls: StageCalls = { inputs: [], structureAtCall: [] };
  const stage: InferenceStage = {
    inferArchitecture: (input) => {
      calls.inputs.push(input);
      calls.structureAtCall.push(serializeDocument(input.model.document));
      return standInResult(input);
    },
    withRoles: mergeRoles,
  };
  return { stage, calls };
}

function analyzeWith(stage: InferenceStage, options: AnalyzeOptions) {
  return analyzeArchitectureWith(stage, { ...BASE_OPTIONS, ...options });
}

function onlyCall(calls: StageCalls): InferenceInput {
  expect(calls.inputs).toHaveLength(1);
  return calls.inputs[0]!;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────────────────────────────

const strictSchema = (() => {
  const url = new URL("../../ir/schema/architecture.strict.schema.json", import.meta.url);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats.default(ajv);
  return ajv.compile(JSON.parse(readFileSync(url, "utf8")) as object);
})();

/** The sections inside an otherwise empty document (plan 3.4: valid once merged with `emptyDocument()`). */
function asDocument(sections: ArchitectureSections): ArchitectureDocument {
  return { ...emptyDocument(), ...sections };
}

const NOT_EVALUATED = (section: string): string =>
  `Configuration section "${section}" is not evaluated by this version of Katedrala`;

/**
 * The structural sections of an architecture analysis, as `analyzeStructure` would produce them: without the
 * architectural sections, the inferred role entries and the inference stage's diagnostics (plan 7.1,
 * "Structural sections unchanged").
 */
function structuralPart(
  document: ArchitectureSections,
  inferenceDiagnostics: readonly Diagnostic[],
): StructureDocument {
  const { components: _components, modules: _modules, layers: _layers, ...structure } = document;
  const fromInference = new Set(
    inferenceDiagnostics.map((diagnostic) => JSON.stringify(diagnostic)),
  );
  return {
    ...structure,
    files: structure.files.map((file) => {
      const kept = (file.roles ?? []).filter((entry) => !INFERRED_SOURCES.has(entry.source));
      const { roles: _roles, ...rest } = file;
      return kept.length === 0 ? rest : { ...rest, roles: kept };
    }),
    diagnostics: structure.diagnostics.filter(
      (diagnostic) => !fromInference.has(JSON.stringify(diagnostic)),
    ),
  };
}

/** `analyzeStructure`'s document without its "not evaluated" warnings for the inference sections. */
function withoutInferenceWarnings(document: StructureDocument): StructureDocument {
  const warnings = new Set(["modules", "layers", "inference"].map(NOT_EVALUATED));
  return {
    ...document,
    diagnostics: document.diagnostics.filter((diagnostic) => !warnings.has(diagnostic.message)),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────────────────────────────

describe("analyzeArchitecture: configuration (plan 2.3, 5.1)", () => {
  it("validates the inference sections, which then get no 'not evaluated' warning", async () => {
    const { stage } = standInStage();
    const { document } = await analyzeWith(stage, { source: configured() });
    const messages = document.diagnostics.map((diagnostic) => diagnostic.message);
    expect(messages).toContain(NOT_EVALUATED("rules"));
    for (const section of ["modules", "layers", "inference"]) {
      expect(messages).not.toContain(NOT_EVALUATED(section));
    }
    // analyzeStructure alone does not evaluate them and says so.
    const structure = await analyzeStructure({ ...BASE_OPTIONS, source: configured() });
    expect(structure.document.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      NOT_EVALUATED("inference"),
      NOT_EVALUATED("layers"),
      NOT_EVALUATED("modules"),
      NOT_EVALUATED("rules"),
    ]);
  });

  it("rejects invalid inference configuration with the validators' messages and lines", async () => {
    const { stage, calls } = standInStage();
    const invalid = lines("inference:", "  modules:", "    type_only_weight: 0.3");
    const result = analyzeWith(stage, { source: configured(invalid) });
    await expect(result).rejects.toBeInstanceOf(ConfigurationError);
    await expect(result).rejects.toMatchObject({
      file: CONFIGURATION_FILE,
      issues: [
        {
          path: "inference.modules.type_only_weight",
          message:
            "Expected a multiple of 1/1024 between 0 and 1 (for example 0, 0.25, 0.5 or 1), so that weight sums are exact",
          line: 3,
        },
      ],
    });
    expect(calls.inputs).toEqual([]);
    // Without the validators, the same configuration loads with the "not evaluated" warning.
    const structure = await analyzeStructure({ ...BASE_OPTIONS, source: configured(invalid) });
    expect(structure.document.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      NOT_EVALUATED("inference"),
    ]);
  });

  it("throws a TypeError when a caller registers an inference section itself", async () => {
    for (const section of ["modules", "layers", "inference"]) {
      const { stage, calls } = standInStage();
      const stages: string[] = [];
      await expect(
        analyzeWith(stage, {
          source: configured(),
          configurationSections: { "x-other": z.unknown(), [section]: z.unknown() },
          onProgress: (progress) => stages.push(progress.stage),
        }),
      ).rejects.toThrow(
        new TypeError(
          `Configuration section "${section}" is registered by analyzeArchitecture (@katedrala/engine)`,
        ),
      );
      expect(stages).toEqual([]);
      expect(calls.inputs).toEqual([]);
    }
    await expect(
      analyzeArchitecture({ ...BASE_OPTIONS, configurationSections: { modules: z.unknown() } }),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it("registers the caller's other configuration sections too", async () => {
    // A caller's validator for a reserved section evaluates it: no "not evaluated" warning.
    const { stage } = standInStage();
    const { document, configuration } = await analyzeWith(stage, {
      source: configured(),
      configurationSections: { rules: z.array(z.unknown()) },
    });
    expect(document.diagnostics.map((diagnostic) => diagnostic.message)).not.toContain(
      NOT_EVALUATED("rules"),
    );
    expect(configuration.config).toMatchObject({
      rules: [{ id: "no-cycles", no_cycles: true }],
      modules: { payments: ["src/payments/**"] },
    });
    // A caller's validator rejects what it does not accept.
    await expect(
      analyzeWith(standInStage().stage, {
        source: configured(lines("x-team: payments")),
        configurationSections: { "x-team": z.enum(["orders"]) },
      }),
    ).rejects.toMatchObject({ issues: [{ path: "x-team", line: 1 }] });
  });
});

describe("analyzeArchitecture: the inference stage (plan 2.3)", () => {
  it("passes the structure model, the resolved settings and declarations and the metrics projection", async () => {
    const { stage, calls } = standInStage();
    const analysis = await analyzeWith(stage, { source: configured() });
    const input = onlyCall(calls);
    const structure = await analyzeStructure({ ...BASE_OPTIONS, source: configured() });

    // The structure as analyzeStructure gives it, except that the inference sections were evaluated.
    expect(serializeDocument(input.model.document)).toBe(
      serializeDocument(withoutInferenceWarnings(structure.document)),
    );
    expect(input.repositoryName).toBe("shop");
    // Validated by the inference validators, so typed as the sections inference reads.
    const sections = structure.configuration.config as InferenceSections;
    // D-65: the attachment policy follows the core setting the metrics projection is built from.
    expect(input.settings).toEqual(
      resolveInferenceSettings(sections.inference, { includeTestsInMetrics: false }),
    );
    expect(input.settings.modules.maxModuleFiles).toBe(200);
    expect(input.projection).toEqual(metricsProjectionOptions(structure.settings));
    expect(input.declarations).toEqual(
      resolveDeclarations(structure.document.files, sections, fileId(CONFIGURATION_FILE)),
    );
    // Modules by name (D-23), every match listed (role filtering is inference's, D-22).
    expect(input.declarations).toEqual({
      modules: [
        { name: "billing", files: [fileId("src/payments/payment.ts")] },
        { name: "legacy", files: [] },
        {
          name: "payments",
          files: [
            fileId("src/payments/payment.test.ts"),
            fileId("src/payments/payment.ts"),
            fileId("src/payments/refund.ts"),
          ],
        },
      ],
      layers: [
        {
          name: "service",
          rank: 0,
          files: [fileId("src/orders/order.service.ts"), fileId("src/orders/order.ts")],
        },
      ],
      roles: [{ role: "data-model", files: [fileId("src/orders/order.ts")] }],
      configurationFile: fileId(CONFIGURATION_FILE),
    });

    expect(analysis.inference).toBe(input.settings);
    expect(analysis.projection).toEqual(toProjectionInfo(input.projection));
    expect(analysis.settings).toEqual(structure.settings);
    expect(analysis.configuration).toEqual({
      ...structure.configuration,
      diagnostics: [
        {
          code: "configuration-warning",
          severity: "warning",
          message: NOT_EVALUATED("rules"),
          file: fileId(CONFIGURATION_FILE),
        },
      ],
    });
  });

  it("assembles canonical sections that validate against the strict schema", async () => {
    const { stage } = standInStage();
    const { document } = await analyzeWith(stage, { source: configured() });
    expect(Object.keys(document)).toEqual([
      "schemaVersion",
      "generator",
      "repository",
      "snapshot",
      "detail",
      "limits",
      "directories",
      "packages",
      "files",
      "symbols",
      "externals",
      "edges",
      "entryPoints",
      "components",
      "modules",
      "layers",
      "diagnostics",
    ]);
    const full = asDocument(document);
    const valid = strictSchema(full);
    expect(strictSchema.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
    // Canonical as produced (plan 4.8).
    expect(canonicalizeDocument(full)).toEqual(full);
    expect(document.modules.map((module) => module.id)).toEqual([
      "mod:billing",
      "mod:legacy",
      "mod:payments",
      "mod:src",
    ]);
    expect(document.layers.map((layer) => [layer.id, layer.files])).toEqual([
      ["layer:service", [fileId("src/orders/order.service.ts"), fileId("src/orders/order.ts")]],
    ]);
  });

  it("merges the inferred roles into files copy-on-write and leaves the structure unchanged", async () => {
    const { stage, calls } = standInStage();
    const { document } = await analyzeWith(stage, { source: configured() });
    const input = onlyCall(calls);

    const rolesOf = (path: string) =>
      document.files.find((file) => file.path === path)?.roles?.map((entry) => entry.role);
    expect(rolesOf("src/orders/order.service.ts")).toEqual(["service"]);
    expect(rolesOf("src/orders/order.ts")).toEqual(["data-model"]);
    expect(rolesOf("src/main.ts")).toBeUndefined();

    // The structure the stage was given was not mutated by assembling the document.
    expect(serializeDocument(input.model.document)).toBe(calls.structureAtCall[0]);

    // Everything else is analyzeStructure's document (plan 7.1, "Structural sections unchanged").
    const structure = await analyzeStructure({ ...BASE_OPTIONS, source: configured() });
    const inferred = standInResult(input).diagnostics;
    expect(serializeDocument(structuralPart(document, inferred))).toBe(
      serializeDocument(withoutInferenceWarnings(structure.document)),
    );
  });

  it("merges the inference diagnostics into canonical order", async () => {
    const { stage } = standInStage();
    const { document } = await analyzeWith(stage, { source: configured() });
    expect(document.diagnostics).toEqual(sortDiagnostics(document.diagnostics));
    expect(document.diagnostics).toEqual([
      {
        code: "approximation-used",
        severity: "info",
        message: "A stand-in inference stage produced this document",
      },
      {
        code: "configuration-warning",
        severity: "warning",
        message: NOT_EVALUATED("rules"),
        file: fileId(CONFIGURATION_FILE),
      },
      {
        code: "configuration-warning",
        severity: "warning",
        message: 'Declared module "legacy" matches no file',
        file: fileId(CONFIGURATION_FILE),
      },
    ]);
  });

  it("has the analysis digest of analyzeStructure, with or without inference sections (D-61)", async () => {
    for (const repository of [source, () => configured()]) {
      const { stage } = standInStage();
      const architecture = await analyzeWith(stage, { source: repository() });
      const structure = await analyzeStructure({ ...BASE_OPTIONS, source: repository() });
      expect(architecture.document.snapshot).toEqual(structure.document.snapshot);
      expect(architecture.configuration.canonicalJson).toBe(structure.configuration.canonicalJson);
    }
  });

  it("reports the inference stage through onProgress and run.timings", async () => {
    const { stage } = standInStage();
    const stages: string[] = [];
    const { run } = await analyzeWith(stage, {
      source: configured(),
      onProgress: (progress) => {
        if (stages.at(-1) !== progress.stage) stages.push(progress.stage);
      },
    });
    expect(stages).toEqual([...ANALYSIS_STAGES]);
    expect(Object.keys(run.timings)).toEqual([...ANALYSIS_STAGES]);
    expect(run.timings.inference).toBeGreaterThanOrEqual(0);
    expect(run.durationMs).toBeGreaterThanOrEqual(0);
    expect(run.workers).toBe(1);
  });

  it("stops before the inference stage when aborted", async () => {
    const { stage, calls } = standInStage();
    const controller = new AbortController();
    const stages: string[] = [];
    await expect(
      analyzeWith(stage, {
        source: configured(),
        signal: controller.signal,
        onProgress: (progress) => {
          stages.push(progress.stage);
          if (progress.stage === "linking") controller.abort();
        },
      }),
    ).rejects.toThrow();
    expect(stages).not.toContain("inference");
    expect(calls.inputs).toEqual([]);
  });

  it("returns a model over the final document (D-60)", async () => {
    const { stage, calls } = standInStage();
    const { document, model } = await analyzeWith(stage, { source: configured() });
    expect(model.document).toBe(document);
    expect(model).not.toBe(onlyCall(calls).model);
    expect(model.unitOf(fileId("src/payments/refund.ts"), "module")).toBe("mod:payments");
    expect(model.unitOf(fileId("src/main.ts"), "module")).toBe("mod:src");
    expect(model.filesIn(layerId("service"))).toEqual([
      fileId("src/orders/order.service.ts"),
      fileId("src/orders/order.ts"),
    ]);
  });
});

describe("analyzeArchitecture: settings that reach inference (D-56, D-65)", () => {
  it("uses the default settings and metrics projection without configuration", async () => {
    const { stage, calls } = standInStage();
    const analysis = await analyzeWith(stage, { source: source() });
    const input = onlyCall(calls);
    expect(input.declarations).toEqual({ modules: [], roles: [] });
    expect(input.settings).toEqual(resolveInferenceSettings());
    expect(analysis.inference.methods).toEqual({
      modules: "katedrala/module-inference@1",
      layers: "katedrala/layer-inference@1",
    });
    expect(analysis.projection.fileRoles).toEqual(["declaration", "source"]);
    expect(analysis.projection.includeTypeOnly).toBe(true);
  });

  it("follows analysis.include_tests_in_metrics in the metrics projection and the module method", async () => {
    const { stage, calls } = standInStage();
    const analysis = await analyzeWith(stage, {
      source: configured(
        lines("analysis:", "  include_tests_in_metrics: true", "  include_type_only: false"),
      ),
    });
    const input = onlyCall(calls);
    expect(analysis.projection).toEqual({
      edgeKinds: analysis.projection.edgeKinds,
      includeTypeOnly: false,
      fileRoles: ["declaration", "source", "test"],
    });
    expect([...(input.projection.fileRoles ?? [])]).toEqual(["declaration", "source", "test"]);
    expect(input.projection.includeTypeOnly).toBe(false);
    expect(input.settings.modules.testsInMetrics).toBe(true);
    expect(analysis.inference.methods).toEqual({
      modules: "katedrala/module-inference@1?analysis.include_tests_in_metrics=true",
      layers: "katedrala/layer-inference@1",
    });
  });
});

/** A fixture as a snapshot: every file except the root README.md and expected.json (as tests/fixtures do). */
function fixtureSource(name: string): InMemorySource {
  const root = fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url));
  const files: Record<string, Uint8Array> = {};
  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(directory, entry.name), path);
      else if (prefix !== "" || (entry.name !== "README.md" && entry.name !== "expected.json")) {
        files[path] = readFileSync(join(directory, entry.name));
      }
    }
  };
  walk(root, "");
  return new InMemorySource({ files });
}

describe("analyzeArchitecture: configurations written before milestone 5 (plan 5.5)", () => {
  it("validates dependency-violations' modules short form unchanged; groups and rules stay unevaluated", async () => {
    const { stage, calls } = standInStage();
    const { document } = await analyzeWith(stage, {
      source: fixtureSource("dependency-violations"),
    });
    expect(document.diagnostics.map((diagnostic) => diagnostic.message)).toEqual(
      expect.arrayContaining([NOT_EVALUATED("groups"), NOT_EVALUATED("rules")]),
    );
    expect(document.diagnostics.map((diagnostic) => diagnostic.message)).not.toContain(
      NOT_EVALUATED("modules"),
    );
    const files = (...paths: string[]) => paths.map(fileId);
    expect(onlyCall(calls).declarations.modules).toEqual([
      { name: "analytics", files: files("src/analytics/events.ts", "src/analytics/tracker.ts") },
      {
        name: "payments",
        files: files(
          "src/payments/checkout.ts",
          "src/payments/payment-gateway.ts",
          "src/payments/refunds.ts",
        ),
      },
    ]);
    // The configuration loads in analyzeStructure too, with the "not evaluated" warning for modules.
    const structure = await analyzeStructure({
      ...BASE_OPTIONS,
      source: fixtureSource("dependency-violations"),
    });
    expect(structure.document.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      NOT_EVALUATED("modules"),
    );
    expect(document.snapshot).toEqual(structure.document.snapshot);
  });
});

describe("analyzeArchitecture: an explicit configuration file", () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), "katedrala-architecture-"));
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  async function analyzeWithFile(directory: string, configuration: string) {
    await mkdir(join(scratch, directory), { recursive: true });
    const configPath = join(scratch, directory, CONFIGURATION_FILE);
    await writeFile(configPath, configuration);
    const { stage, calls } = standInStage();
    const analysis = await analyzeWith(stage, {
      root: join(scratch, "root"),
      source: source(),
      configPath,
    });
    return { analysis, input: onlyCall(calls) };
  }

  it("gives byte-identical documents and digests when overlapping modules are reordered (D-23)", async () => {
    const a = await analyzeWithFile(
      "a",
      lines(
        "modules:",
        '  payments: ["src/payments/**"]',
        '  billing: ["src/payments/payment.ts"]',
      ),
    );
    const b = await analyzeWithFile(
      "b",
      lines(
        "modules:",
        '  billing: ["src/payments/payment.ts"]',
        '  payments: ["src/payments/**"]',
      ),
    );
    expect(b.input.declarations).toEqual(a.input.declarations);
    expect(a.input.declarations.modules.map((module) => module.name)).toEqual([
      "billing",
      "payments",
    ]);
    expect(b.analysis.document.snapshot.analysisDigest).toBe(
      a.analysis.document.snapshot.analysisDigest,
    );
    expect(serializeDocument(b.analysis.document)).toBe(serializeDocument(a.analysis.document));
    // A configuration outside the snapshot is no location for configuration warnings.
    expect("configurationFile" in a.input.declarations).toBe(false);
    expect(
      a.analysis.document.diagnostics.filter((diagnostic) => diagnostic.file !== undefined),
    ).toEqual([]);
  });
});

describe("analyzeArchitecture", () => {
  it("rejects with inference-unavailable until @katedrala/inference provides inferArchitecture", async () => {
    const result = analyzeArchitecture({ ...BASE_OPTIONS, source: configured() });
    await expect(result).rejects.toMatchObject({
      name: "InferenceUnavailableError",
      code: "inference-unavailable",
    });
    // analyzeStructure is unaffected.
    const structure = await analyzeStructure({ ...BASE_OPTIONS, source: configured() });
    expect(structure.document.files.length).toBeGreaterThan(0);
  });
});
