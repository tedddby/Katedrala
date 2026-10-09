import { canonicalJson, compareStrings, sha256Hex } from "@katedrala/ir";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_INFERENCE_CONFIGURATION,
  INFERENCE_KEYS,
  LAYER_INFERENCE_METHOD,
  MODULE_INFERENCE_METHOD,
  normalizeVocabularyName,
  resolveInferenceSettings,
} from "./settings.js";
import type {
  ComponentInferenceConfiguration,
  InferenceConfiguration,
  InferenceSettings,
  LayerInferenceConfiguration,
  ModuleInferenceConfiguration,
} from "./types.js";
import {
  DEFAULT_CONTAINER_DIRECTORIES,
  DEFAULT_DIRECTORY_LAYERS,
  DEFAULT_GENERIC_TOKENS,
  DEFAULT_NAMING_SUFFIXES,
  DEFAULT_SHARED_DIRECTORIES,
} from "./vocabulary.js";

const BARE = { modules: MODULE_INFERENCE_METHOD, layers: LAYER_INFERENCE_METHOD };

/** The `h:` value of D-56 for an effective list or map. */
const hash = (value: unknown): string => `h:${sha256Hex(canonicalJson(value)).slice(0, 8)}`;

/** Every set and map of the settings as arrays, in iteration order. */
function iterationOrders(settings: InferenceSettings): Record<string, unknown[]> {
  const { vocabulary } = settings;
  return {
    componentFileRoles: [...settings.componentFileRoles],
    fileRoles: [...settings.modules.fileRoles],
    containers: [...vocabulary.containers],
    shared: [...vocabulary.shared],
    directoryLayers: [...vocabulary.directoryLayers],
    namingSuffixes: [...vocabulary.namingSuffixes],
    roleLayers: [...vocabulary.roleLayers],
    locationRoles: [...vocabulary.locationRoles],
    genericTokens: [...vocabulary.genericTokens],
    nonStemTokens: [...vocabulary.nonStemTokens],
    tiers: [...vocabulary.tiers],
  };
}

const isSorted = (values: readonly string[]): boolean =>
  values.every((value, index) => index === 0 || compareStrings(values[index - 1]!, value) < 0);

describe("resolveInferenceSettings: defaults (plan 5.3)", () => {
  const settings = resolveInferenceSettings();

  it("applies every default", () => {
    expect([...settings.componentFileRoles]).toEqual([
      "declaration",
      "generated",
      "script",
      "source",
      "test",
    ]);
    expect(settings.weighting).toEqual({ typeOnlyWeight: 0.5, minEdgeConfidence: 0.5 });
    expect({ ...settings.modules, fileRoles: [...settings.modules.fileRoles] }).toEqual({
      enabled: true,
      whenDeclared: "infer-rest",
      fileRoles: ["source"],
      maxModuleFiles: 120,
      minModuleFiles: 3,
      stemMinCoverage: 0.25,
      utilityMinModules: 3,
      moveMinSupport: 2,
      moveMinWeight: 1,
      maxPasses: 50,
      attachTests: true,
      attachDeclarations: true,
      testsInMetrics: false,
    });
    expect(settings.layers).toEqual({
      enabled: true,
      minLabelScore: 0.5,
      minLayerFiles: 2,
      exactOrderMaxLayers: 12,
    });
    expect(settings.methods).toEqual(BARE);
  });

  it("builds the default vocabulary", () => {
    const { vocabulary } = settings;
    expect([...vocabulary.containers]).toEqual(DEFAULT_CONTAINER_DIRECTORIES);
    expect([...vocabulary.shared]).toEqual(DEFAULT_SHARED_DIRECTORIES);
    expect([...vocabulary.genericTokens]).toEqual(DEFAULT_GENERIC_TOKENS);
    expect(Object.fromEntries(vocabulary.directoryLayers)).toEqual(DEFAULT_DIRECTORY_LAYERS);
    expect(Object.fromEntries(vocabulary.namingSuffixes)).toEqual(DEFAULT_NAMING_SUFFIXES);
    // The cross-cutting roles vote ⊥ by their absence.
    expect(Object.fromEntries(vocabulary.roleLayers)).toEqual({
      "data-model": "model",
      "data-transfer-object": "dto",
      "external-client": "client",
      "http-controller": "controller",
      middleware: "middleware",
      repository: "repository",
      "route-definition": "route",
      service: "service",
      "state-store": "store",
      "ui-component": "component",
      "ui-page": "page",
    });
    expect(vocabulary.tiers.get("route")).toBe(0);
    expect(vocabulary.tiers.get("controller")).toBe(1);
    expect(vocabulary.tiers.get("service")).toBe(2);
    expect(vocabulary.tiers.get("repository")).toBe(3);
    expect(vocabulary.tiers.get("model")).toBe(4);
    expect(vocabulary.tiers.has("infrastructure")).toBe(false);
    expect(vocabulary.tiers.size).toBe(27);
  });

  it("derives the location roles as the unique inverse of the role layers (D-18)", () => {
    expect(Object.fromEntries(settings.vocabulary.locationRoles)).toEqual({
      client: "external-client",
      component: "ui-component",
      controller: "http-controller",
      dto: "data-transfer-object",
      middleware: "middleware",
      model: "data-model",
      page: "ui-page",
      repository: "repository",
      route: "route-definition",
      service: "service",
      store: "state-store",
    });
    for (const layer of ["domain", "application", "infrastructure", "presentation"]) {
      expect(settings.vocabulary.locationRoles.has(layer)).toBe(false);
    }
  });

  it("excludes generic tokens and naming-suffix keys from stems (D-09)", () => {
    const { vocabulary } = settings;
    for (const token of vocabulary.genericTokens)
      expect(vocabulary.nonStemTokens.has(token)).toBe(true);
    for (const key of vocabulary.namingSuffixes.keys())
      expect(vocabulary.nonStemTokens.has(key)).toBe(true);
    // Directory-layer keys can name features (D-09).
    for (const key of ["task", "data", "api", "port"]) {
      expect(vocabulary.directoryLayers.has(key)).toBe(true);
      expect(vocabulary.nonStemTokens.has(key)).toBe(false);
    }
  });

  it("iterates every set and map in sorted order and is frozen", () => {
    for (const [name, values] of Object.entries(iterationOrders(settings))) {
      const keys = values.map((value) => (Array.isArray(value) ? String(value[0]) : String(value)));
      expect(isSorted(keys), name).toBe(true);
    }
    expect(Object.isFrozen(settings)).toBe(true);
    for (const part of [
      settings.modules,
      settings.layers,
      settings.weighting,
      settings.vocabulary,
      settings.methods,
    ]) {
      expect(Object.isFrozen(part)).toBe(true);
    }
  });

  it("reads analysis.include_tests_in_metrics from the core settings (D-65)", () => {
    expect(
      resolveInferenceSettings({}, { includeTestsInMetrics: true }).modules.testsInMetrics,
    ).toBe(true);
    expect(resolveInferenceSettings({}, {}).modules.testsInMetrics).toBe(false);
  });

  it("takes configured scalars and roles as written", () => {
    const custom = resolveInferenceSettings({
      components: { file_roles: ["test", "source"] },
      modules: {
        enabled: false,
        when_declared: "none",
        file_roles: ["test", "source"],
        type_only_weight: 0.25,
        min_edge_confidence: 0.75,
        max_module_files: 200,
        min_module_files: 2,
        stem_min_coverage: 0.3,
        utility_min_modules: 4,
        move_min_support: 3,
        move_min_weight: 1.5,
        max_passes: 10,
        attach_tests: false,
        attach_declarations: false,
      },
      layers: {
        enabled: false,
        min_label_score: 0.6,
        min_layer_files: 1,
        exact_order_max_layers: 8,
      },
    });
    expect([...custom.componentFileRoles]).toEqual(["source", "test"]);
    expect(custom.weighting).toEqual({ typeOnlyWeight: 0.25, minEdgeConfidence: 0.75 });
    expect({ ...custom.modules, fileRoles: [...custom.modules.fileRoles] }).toEqual({
      enabled: false,
      whenDeclared: "none",
      fileRoles: ["source", "test"],
      maxModuleFiles: 200,
      minModuleFiles: 2,
      stemMinCoverage: 0.3,
      utilityMinModules: 4,
      moveMinSupport: 3,
      moveMinWeight: 1.5,
      maxPasses: 10,
      attachTests: false,
      attachDeclarations: false,
      testsInMetrics: false,
    });
    expect(custom.layers).toEqual({
      enabled: false,
      minLabelScore: 0.6,
      minLayerFiles: 1,
      exactOrderMaxLayers: 8,
    });
  });
});

describe("DEFAULT_INFERENCE_CONFIGURATION and INFERENCE_KEYS (plan 3.3, 5.2)", () => {
  it("resolves to the defaults, bare method strings included", () => {
    const resolved = resolveInferenceSettings(DEFAULT_INFERENCE_CONFIGURATION);
    expect(resolved).toEqual(resolveInferenceSettings());
    expect(iterationOrders(resolved)).toEqual(iterationOrders(resolveInferenceSettings()));
    expect(resolved.methods).toEqual(BARE);
  });

  it("is frozen plain JSON with sorted keys and sorted lists", () => {
    const text = JSON.stringify(DEFAULT_INFERENCE_CONFIGURATION);
    expect(canonicalJson(DEFAULT_INFERENCE_CONFIGURATION)).toBe(text);
    expect(JSON.parse(text)).toEqual(DEFAULT_INFERENCE_CONFIGURATION);
    const frozen = (value: unknown): boolean =>
      typeof value !== "object" ||
      value === null ||
      (Object.isFrozen(value) && Object.values(value).every(frozen));
    expect(frozen(DEFAULT_INFERENCE_CONFIGURATION)).toBe(true);
    const { modules, components } = DEFAULT_INFERENCE_CONFIGURATION;
    for (const list of [
      modules.container_directories,
      modules.shared_directories,
      modules.generic_tokens,
      modules.file_roles,
      components.file_roles,
    ]) {
      expect(isSorted(list)).toBe(true);
    }
    expect(DEFAULT_INFERENCE_CONFIGURATION.roles).toEqual({});
    expect(DEFAULT_INFERENCE_CONFIGURATION.layers.role_layers).toMatchObject({
      "configuration-provider": null,
      "module-definition": null,
      utility: null,
    });
  });

  it("lists every key of the configuration types", () => {
    // Compile-time completeness: each record must name every key of its type and nothing else.
    const components: Record<keyof ComponentInferenceConfiguration, true> = { file_roles: true };
    const modules: Record<keyof ModuleInferenceConfiguration, true> = {
      enabled: true,
      when_declared: true,
      file_roles: true,
      type_only_weight: true,
      min_edge_confidence: true,
      max_module_files: true,
      min_module_files: true,
      stem_min_coverage: true,
      utility_min_modules: true,
      move_min_support: true,
      move_min_weight: true,
      max_passes: true,
      attach_tests: true,
      attach_declarations: true,
      container_directories: true,
      shared_directories: true,
      generic_tokens: true,
    };
    const layers: Record<keyof LayerInferenceConfiguration, true> = {
      enabled: true,
      directory_layers: true,
      role_layers: true,
      naming_suffixes: true,
      conventional_tiers: true,
      min_label_score: true,
      min_layer_files: true,
      exact_order_max_layers: true,
    };
    const sections: Record<keyof InferenceConfiguration, true> = {
      roles: true,
      components: true,
      modules: true,
      layers: true,
    };
    const sorted = (record: object): string[] => Object.keys(record).sort(compareStrings);
    expect(INFERENCE_KEYS.components).toEqual(sorted(components));
    expect(INFERENCE_KEYS.modules).toEqual(sorted(modules));
    expect(INFERENCE_KEYS.layers).toEqual(sorted(layers));
    expect(INFERENCE_KEYS.sections).toEqual(sorted(sections));
    expect(Object.keys(DEFAULT_INFERENCE_CONFIGURATION.modules)).toEqual(INFERENCE_KEYS.modules);
    expect(Object.keys(DEFAULT_INFERENCE_CONFIGURATION.layers)).toEqual(INFERENCE_KEYS.layers);
    expect(Object.isFrozen(INFERENCE_KEYS)).toBe(true);
    expect(Object.isFrozen(INFERENCE_KEYS.modules)).toBe(true);
  });
});

describe("normalizeVocabularyName (D-69)", () => {
  it("lower-cases every name and stems all but containers", () => {
    expect(normalizeVocabularyName("containers", "Services")).toBe("services");
    expect(normalizeVocabularyName("containers", "Domains")).toBe("domains");
    expect(normalizeVocabularyName("shared", "Helpers")).toBe("helper");
    expect(normalizeVocabularyName("generic", "UTILITIES")).toBe("utility");
    expect(normalizeVocabularyName("directory-layers", "Use-Cases")).toBe("use-case");
    expect(normalizeVocabularyName("naming-suffixes", "Handlers")).toBe("handler");
    expect(normalizeVocabularyName("shared", "Été")).toBe("Été");
  });

  it("keeps the '!' of list removals, and treats it as a character in map keys", () => {
    expect(normalizeVocabularyName("shared", "!Helpers")).toBe("!helper");
    expect(normalizeVocabularyName("containers", "!SRC")).toBe("!src");
    expect(normalizeVocabularyName("generic", "!bus")).toBe("!bus");
    expect(normalizeVocabularyName("directory-layers", "!views")).toBe("!view");
  });

  it("gives the same name for case and plural variants", () => {
    expect(normalizeVocabularyName("directory-layers", "Services")).toBe(
      normalizeVocabularyName("directory-layers", "services"),
    );
    expect(normalizeVocabularyName("shared", "helpers")).toBe(
      normalizeVocabularyName("shared", "Helper"),
    );
    expect(normalizeVocabularyName("containers", "libs")).not.toBe(
      normalizeVocabularyName("containers", "lib"),
    );
  });
});

describe("resolveInferenceSettings: vocabularies (D-69)", () => {
  it("adds normalized list entries", () => {
    const { vocabulary } = resolveInferenceSettings({
      modules: {
        container_directories: ["Areas"],
        shared_directories: ["Platforms"],
        generic_tokens: ["Widgets"],
      },
    });
    expect(vocabulary.containers.has("areas")).toBe(true);
    expect(vocabulary.containers.has("area")).toBe(false);
    expect(vocabulary.shared.has("platform")).toBe(true);
    expect(vocabulary.genericTokens.has("widget")).toBe(true);
    expect(vocabulary.nonStemTokens.has("widget")).toBe(true);
  });

  it("removes defaults with '!name', matching normalized names", () => {
    const { vocabulary } = resolveInferenceSettings({
      modules: {
        container_directories: ["!SRC", "!nonexistent"],
        shared_directories: ["!helpers", "!Utils"],
        generic_tokens: ["!Index"],
      },
    });
    expect(vocabulary.containers.has("src")).toBe(false);
    expect(vocabulary.containers.size).toBe(DEFAULT_CONTAINER_DIRECTORIES.length - 1);
    expect(vocabulary.shared.has("helper")).toBe(false);
    expect(vocabulary.shared.has("util")).toBe(false);
    expect(vocabulary.genericTokens.has("index")).toBe(false);
    expect(vocabulary.nonStemTokens.has("index")).toBe(false);
  });

  it("removes defaults only: an entry added and removed in one list stays", () => {
    const { vocabulary } = resolveInferenceSettings({
      modules: { shared_directories: ["platform", "!platform"] },
    });
    expect(vocabulary.shared.has("platform")).toBe(true);
  });

  it("does not stem containers (D-07)", () => {
    const { vocabulary } = resolveInferenceSettings({
      modules: { container_directories: ["!domains"] },
    });
    expect(vocabulary.containers.has("domains")).toBe(false);
    expect(vocabulary.directoryLayers.get("domain")).toBe("domain");
    const { vocabulary: unchanged } = resolveInferenceSettings({
      modules: { container_directories: ["!domain"] },
    });
    expect(unchanged.containers.has("domains")).toBe(true);
  });

  it("merges maps over the defaults; null removes an entry", () => {
    const { vocabulary } = resolveInferenceSettings({
      layers: {
        directory_layers: { Endpoints: "controller", UseCases: "application", dao: null },
        naming_suffixes: { Handlers: "http-controller", repo: null },
        role_layers: { service: null, "x-acme-gateway": "gateway" },
      },
    });
    expect(vocabulary.directoryLayers.get("endpoint")).toBe("controller");
    expect(vocabulary.directoryLayers.get("usecase")).toBe("application");
    expect(vocabulary.directoryLayers.has("dao")).toBe(false);
    expect(vocabulary.namingSuffixes.get("handler")).toBe("http-controller");
    expect(vocabulary.namingSuffixes.has("repo")).toBe(false);
    expect(vocabulary.nonStemTokens.has("handler")).toBe(true);
    // `repo` stays a generic token: removing a naming suffix does not make it a feature name.
    expect(vocabulary.nonStemTokens.has("repo")).toBe(true);
    expect(vocabulary.roleLayers.has("service")).toBe(false);
    expect(vocabulary.roleLayers.get("x-acme-gateway")).toBe("gateway");
    expect(vocabulary.locationRoles.has("service")).toBe(false);
    expect(vocabulary.locationRoles.get("gateway")).toBe("x-acme-gateway");
  });

  it("keeps only layers that exactly one role maps to as location roles (D-18)", () => {
    const { vocabulary } = resolveInferenceSettings({
      layers: { role_layers: { "x-acme-handler": "controller" } },
    });
    expect(vocabulary.roleLayers.get("x-acme-handler")).toBe("controller");
    expect(vocabulary.locationRoles.has("controller")).toBe(false);
    expect(vocabulary.locationRoles.get("service")).toBe("service");
  });

  it("replaces the conventional tiers", () => {
    const { vocabulary } = resolveInferenceSettings({
      layers: { conventional_tiers: [["controller"], ["service", "domain"], ["repository"]] },
    });
    expect(Object.fromEntries(vocabulary.tiers)).toEqual({
      controller: 0,
      domain: 1,
      repository: 2,
      service: 1,
    });
  });

  it("numbers tiers by relative order: empty tiers and repeated layers do not count", () => {
    const { vocabulary } = resolveInferenceSettings({
      layers: { conventional_tiers: [["a"], [], ["a"], ["b", "a"], ["c"]] },
    });
    expect(Object.fromEntries(vocabulary.tiers)).toEqual({ a: 0, b: 1, c: 2 });
  });

  it("never depends on the order of configured keys (D-23)", () => {
    const forward = resolveInferenceSettings({
      layers: { directory_layers: { Services: "api", services: null, zones: "domain" } },
    });
    const backward = resolveInferenceSettings({
      layers: { directory_layers: { zones: "domain", services: null, Services: "api" } },
    });
    expect(forward).toEqual(backward);
    expect(iterationOrders(forward)).toEqual(iterationOrders(backward));
    // "Services" sorts before "services", so the later null wins (the validator rejects such keys).
    expect(forward.vocabulary.directoryLayers.has("service")).toBe(false);
  });

  it("keeps a configured __proto__ key as an ordinary key", () => {
    const configuration = JSON.parse(
      '{"layers":{"directory_layers":{"__proto__":"domain"}}}',
    ) as InferenceConfiguration;
    const settings = resolveInferenceSettings(configuration);
    expect(settings.vocabulary.directoryLayers.get("__proto__")).toBe("domain");
    expect(settings.methods.layers).toContain("directory_layers=h:");
  });

  it("treats undefined values and empty role lists (unvalidated input) as absent", () => {
    const configuration = {
      roles: { service: undefined, repository: [] },
      layers: {
        directory_layers: { dao: undefined },
        naming_suffixes: { repo: undefined },
        role_layers: { service: undefined },
      },
    } as unknown as InferenceConfiguration;
    expect(resolveInferenceSettings(configuration)).toEqual(resolveInferenceSettings());
  });
});

describe("resolveInferenceSettings: method strings (D-56)", () => {
  it("writes changed scalars with String(v), keys sorted, own keys bare", () => {
    const settings = resolveInferenceSettings({
      modules: { type_only_weight: 0.25, max_module_files: 200, attach_tests: false },
      layers: { min_layer_files: 3 },
    });
    expect(settings.methods.modules).toBe(
      `${MODULE_INFERENCE_METHOD}?attach_tests=false&max_module_files=200&type_only_weight=0.25`,
    );
    expect(settings.methods.layers).toBe(
      `${LAYER_INFERENCE_METHOD}?min_layer_files=3&modules.type_only_weight=0.25`,
    );
  });

  it("omits parameters written at their default value", () => {
    const settings = resolveInferenceSettings({
      modules: { type_only_weight: 0.5, max_module_files: 120, shared_directories: ["utils"] },
      layers: {
        role_layers: { utility: null, service: "service" },
        directory_layers: { db: "database" },
      },
    });
    expect(settings.methods).toEqual(BARE);
  });

  it("hashes lists and maps from their effective value", () => {
    const settings = resolveInferenceSettings({ modules: { shared_directories: ["platform"] } });
    const effective = [...DEFAULT_SHARED_DIRECTORIES, "platform"].sort(compareStrings);
    expect(settings.methods.modules).toBe(
      `${MODULE_INFERENCE_METHOD}?shared_directories=${hash(effective)}`,
    );
    expect(settings.methods.layers).toBe(LAYER_INFERENCE_METHOD);
    expect(settings.methods.modules).toMatch(/\?shared_directories=h:[0-9a-f]{8}$/);
  });

  it("gives equal strings for equal effective vocabularies however they were written", () => {
    const variants: InferenceConfiguration[] = [
      { modules: { shared_directories: ["platform"] } },
      { modules: { shared_directories: ["Platforms", "util"] } },
      { modules: { shared_directories: ["PLATFORM", "platform", "helpers"] } },
    ];
    const methods = variants.map((config) => resolveInferenceSettings(config).methods);
    expect(methods[1]).toEqual(methods[0]);
    expect(methods[2]).toEqual(methods[0]);
    expect(
      resolveInferenceSettings({ layers: { directory_layers: { Endpoints: "controller" } } })
        .methods,
    ).toEqual(
      resolveInferenceSettings({ layers: { directory_layers: { endpoint: "controller" } } })
        .methods,
    );
    expect(
      resolveInferenceSettings({ layers: { conventional_tiers: [["route", "page"], ["service"]] } })
        .methods,
    ).toEqual(
      resolveInferenceSettings({ layers: { conventional_tiers: [["page", "route"], ["service"]] } })
        .methods,
    );
    expect(
      resolveInferenceSettings({ roles: { service: ["src/b/**", "src/a/**", "src/a/**"] } })
        .methods,
    ).toEqual(resolveInferenceSettings({ roles: { service: ["src/a/**", "src/b/**"] } }).methods);
  });

  it("gives different hashes for different vocabularies", () => {
    const a = resolveInferenceSettings({ modules: { shared_directories: ["platform"] } });
    const b = resolveInferenceSettings({ modules: { shared_directories: ["platforms2"] } });
    const c = resolveInferenceSettings({ modules: { shared_directories: ["!util"] } });
    const written = [a, b, c].map((settings) => settings.methods.modules);
    expect(new Set(written).size).toBe(3);
  });

  it("changes both methods when directory_layers changes (directory kinds and location votes)", () => {
    const settings = resolveInferenceSettings({
      layers: { directory_layers: { endpoints: "controller" } },
    });
    expect(settings.methods.modules).toMatch(/\?layers\.directory_layers=h:[0-9a-f]{8}$/);
    expect(settings.methods.layers).toMatch(/\?directory_layers=h:[0-9a-f]{8}$/);
  });

  it("changes only the module method for analysis.include_tests_in_metrics (D-65)", () => {
    const settings = resolveInferenceSettings({}, { includeTestsInMetrics: true });
    expect(settings.methods.modules).toBe(
      `${MODULE_INFERENCE_METHOD}?analysis.include_tests_in_metrics=true`,
    );
    expect(settings.methods.layers).toBe(LAYER_INFERENCE_METHOD);
  });

  it("covers each parameter in the methods it can change", () => {
    const cases: [InferenceConfiguration, RegExp | null, RegExp | null][] = [
      // [configuration, module method parameter, layer method parameter]
      [{ components: { file_roles: ["source"] } }, /\?components\.file_roles=h:/, null],
      [{ modules: { enabled: false } }, /\?enabled=false$/, null],
      [{ modules: { when_declared: "none" } }, /\?when_declared=none$/, null],
      [{ modules: { file_roles: ["source", "test"] } }, /\?file_roles=h:/, null],
      [
        { modules: { min_edge_confidence: 0.75 } },
        /\?min_edge_confidence=0\.75$/,
        /\?modules\.min_edge_confidence=0\.75$/,
      ],
      [{ modules: { min_module_files: 2 } }, /\?min_module_files=2$/, null],
      [{ modules: { stem_min_coverage: 0.3 } }, /\?stem_min_coverage=0\.3$/, null],
      [{ modules: { utility_min_modules: 4 } }, /\?utility_min_modules=4$/, null],
      [{ modules: { move_min_support: 3 } }, /\?move_min_support=3$/, null],
      [{ modules: { move_min_weight: 1.5 } }, /\?move_min_weight=1\.5$/, null],
      [{ modules: { max_passes: 10 } }, /\?max_passes=10$/, null],
      [{ modules: { attach_declarations: false } }, /\?attach_declarations=false$/, null],
      [
        { modules: { container_directories: ["areas"] } },
        /\?container_directories=h:/,
        /\?modules\.container_directories=h:/,
      ],
      [{ modules: { generic_tokens: ["widget"] } }, /\?generic_tokens=h:/, null],
      [
        { layers: { naming_suffixes: { facade: "x-facade" } } },
        /\?layers\.naming_suffixes=h:/,
        /\?naming_suffixes=h:/,
      ],
      [{ layers: { enabled: false } }, null, /\?enabled=false$/],
      [{ layers: { role_layers: { service: "domain" } } }, null, /\?role_layers=h:/],
      [
        { layers: { conventional_tiers: [["controller"], ["service"]] } },
        null,
        /\?conventional_tiers=h:/,
      ],
      [{ layers: { min_label_score: 0.6 } }, null, /\?min_label_score=0\.6$/],
      [{ layers: { exact_order_max_layers: 8 } }, null, /\?exact_order_max_layers=8$/],
      [{ roles: { service: ["src/**/*.svc.ts"] } }, null, /\?roles=h:/],
    ];
    for (const [config, modulePattern, layerPattern] of cases) {
      const { methods } = resolveInferenceSettings(config);
      const label = JSON.stringify(config);
      if (modulePattern === null) expect(methods.modules, label).toBe(MODULE_INFERENCE_METHOD);
      else expect(methods.modules, label).toMatch(modulePattern);
      if (layerPattern === null) expect(methods.layers, label).toBe(LAYER_INFERENCE_METHOD);
      else expect(methods.layers, label).toMatch(layerPattern);
    }
  });

  it("is invariant under rewriting a configuration's vocabulary entries (property)", () => {
    const sharedName = fc.constantFrom("platform", "kernel", "gadget", "helper", "toolbox");
    const layerKey = fc.constantFrom("endpoint", "usecase", "persistence", "zone", "warehouse");
    const layerName = fc.constantFrom("api", "domain", "repository", "zone");
    // Writing variants that normalize alike (D-69): an upper-case first letter (the names start with an
    // ASCII lower-case letter), a plural "s".
    const rewrite = (name: string, upper: boolean, plural: boolean): string => {
      const cased = upper
        ? `${String.fromCharCode(name.charCodeAt(0) - 32)}${name.slice(1)}`
        : name;
      return plural && !name.endsWith("s") && !name.endsWith("x") ? `${cased}s` : cased;
    };
    fc.assert(
      fc.property(
        fc.uniqueArray(sharedName, { maxLength: 4 }),
        fc.uniqueArray(fc.tuple(layerKey, layerName), { maxLength: 4, selector: ([key]) => key }),
        fc.array(fc.tuple(fc.boolean(), fc.boolean()), { minLength: 8, maxLength: 8 }),
        (shared, layers, styles) => {
          const plain: InferenceConfiguration = {
            modules: { shared_directories: shared },
            layers: { directory_layers: Object.fromEntries(layers) },
          };
          const written: InferenceConfiguration = {
            modules: {
              shared_directories: [...shared]
                .reverse()
                .map((name, i) => rewrite(name, styles[i]![0], styles[i]![1])),
            },
            layers: {
              directory_layers: Object.fromEntries(
                [...layers]
                  .reverse()
                  .map(([key, layer], i) => [
                    rewrite(key, styles[i + 4]![0], styles[i + 4]![1]),
                    layer,
                  ]),
              ),
            },
          };
          const a = resolveInferenceSettings(plain);
          const b = resolveInferenceSettings(written);
          expect(b.methods).toEqual(a.methods);
          expect(iterationOrders(b)).toEqual(iterationOrders(a));
        },
      ),
      { seed: 20261007, numRuns: 200 },
    );
  });
});
