/**
 * Effective inference settings: the defaults of the `inference` section, the normalization and merging of
 * configured vocabularies (D-69), the key lists the engine's validators are checked against, and the method
 * strings that identify an inference and its non-default parameters (D-56).
 *
 * The engine validates the configuration (ADR-013, D-59) and never injects defaults (D-61); defaults live
 * only here. No result depends on the order of configuration keys (D-23): configured map keys are processed
 * in `compareStrings` order and every list is treated as a set.
 */
import { canonicalJson, compareStrings, sha256Hex } from "@katedrala/ir";
import type { ArchitecturalRole, FileRole } from "@katedrala/ir";
import { asciiLower, sStem } from "./lexical.js";
import type {
  ComponentInferenceConfiguration,
  EdgeWeighting,
  InferenceConfiguration,
  InferenceSettings,
  LayerInferenceConfiguration,
  LayerSettings,
  ModuleInferenceConfiguration,
  ModuleSettings,
  Vocabulary,
} from "./types.js";
import {
  DEFAULT_CONTAINER_DIRECTORIES,
  DEFAULT_CONVENTIONAL_TIERS,
  DEFAULT_DIRECTORY_LAYERS,
  DEFAULT_GENERIC_TOKENS,
  DEFAULT_NAMING_SUFFIXES,
  DEFAULT_ROLE_LAYERS,
  DEFAULT_SHARED_DIRECTORIES,
} from "./vocabulary.js";

/**
 * The identifier of module inference [KATEDRALA HEURISTIC] (`InferenceInfo.method` of inferred modules,
 * D-56). The version is bumped whenever an algorithm change changes outputs at default settings (R-7).
 */
export const MODULE_INFERENCE_METHOD = "katedrala/module-inference@1";

/**
 * The identifier of layer inference [KATEDRALA HEURISTIC] (`InferenceInfo.method` of inferred layers,
 * D-56). Versioned like {@link MODULE_INFERENCE_METHOD}.
 */
export const LAYER_INFERENCE_METHOD = "katedrala/layer-inference@1";

// ─── Defaults (plan 5.3; design §6.3) ─────────────────────────────────────────────────────────────────

const DEFAULT_COMPONENTS: Required<ComponentInferenceConfiguration> = {
  file_roles: ["declaration", "generated", "script", "source", "test"],
};

const DEFAULT_MODULES: Required<ModuleInferenceConfiguration> = {
  attach_declarations: true,
  attach_tests: true,
  container_directories: [...DEFAULT_CONTAINER_DIRECTORIES],
  enabled: true,
  file_roles: ["source"],
  generic_tokens: [...DEFAULT_GENERIC_TOKENS],
  max_module_files: 120,
  max_passes: 50,
  min_edge_confidence: 0.5,
  min_module_files: 3,
  move_min_support: 2,
  move_min_weight: 1,
  shared_directories: [...DEFAULT_SHARED_DIRECTORIES],
  stem_min_coverage: 0.25,
  // D-67: a multiple of 1/1024, so every sum of weights is exact.
  type_only_weight: 0.5,
  utility_min_modules: 3,
  // D-21: declared modules are always produced; the rest is inferred.
  when_declared: "infer-rest",
};

const DEFAULT_LAYERS: Required<LayerInferenceConfiguration> = {
  conventional_tiers: DEFAULT_CONVENTIONAL_TIERS.map((tier) => [...tier]),
  directory_layers: { ...DEFAULT_DIRECTORY_LAYERS },
  enabled: true,
  exact_order_max_layers: 12,
  min_label_score: 0.5,
  min_layer_files: 2,
  naming_suffixes: { ...DEFAULT_NAMING_SUFFIXES },
  role_layers: { ...DEFAULT_ROLE_LAYERS },
};

/** Freeze a JSON-like value and everything it contains. */
function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

/**
 * Every key of the `inference` section at its default [KATEDRALA HEURISTIC parameters], vocabularies
 * included, as frozen plain JSON: arrays and object keys sorted by `compareStrings` (the order of
 * `conventional_tiers` is the tier order), `roles` empty, and the cross-cutting roles listed in
 * `role_layers` with `null`. It feeds the configuration reference of docs/ALGORITHMS.md and the validators'
 * round-trip test: it validates, and `resolveInferenceSettings(DEFAULT_INFERENCE_CONFIGURATION)` equals
 * `resolveInferenceSettings()`, bare method strings included (plan 5.2).
 *
 * Determinism: frozen (deeply) and canonical, so `JSON.stringify` and `canonicalJson` give the same text.
 * The validators never inject these defaults (D-61), so the canonical configuration JSON and the analysis
 * digest describe exactly what was written.
 */
export const DEFAULT_INFERENCE_CONFIGURATION: Readonly<Required<InferenceConfiguration>> & {
  readonly components: Required<ComponentInferenceConfiguration>;
  readonly modules: Required<ModuleInferenceConfiguration>;
  readonly layers: Required<LayerInferenceConfiguration>;
} = deepFreeze({
  components: DEFAULT_COMPONENTS,
  layers: DEFAULT_LAYERS,
  modules: DEFAULT_MODULES,
  roles: {},
});

/** The keys of one section as an array, sorted by `compareStrings` (no integer-like keys occur). */
function keysOf<T extends object>(section: T): readonly (keyof T)[] {
  return Object.freeze((Object.keys(section) as (keyof T & string)[]).sort(compareStrings));
}

/**
 * Every key of the `inference` section and of its `components`, `modules` and `layers` sections [DERIVED],
 * sorted by `compareStrings` and frozen. The engine's validators are checked against these lists (plan 5.2),
 * and docs/ALGORITHMS.md's configuration reference lists them. Derived from
 * `DEFAULT_INFERENCE_CONFIGURATION`, whose sections are typed `Required<…>`, so a key added to a
 * configuration type without a default fails to compile.
 */
export const INFERENCE_KEYS: {
  readonly components: readonly (keyof ComponentInferenceConfiguration)[];
  readonly modules: readonly (keyof ModuleInferenceConfiguration)[];
  readonly layers: readonly (keyof LayerInferenceConfiguration)[];
  readonly sections: readonly (keyof InferenceConfiguration)[];
} = Object.freeze({
  components: keysOf(DEFAULT_COMPONENTS),
  modules: keysOf(DEFAULT_MODULES),
  layers: keysOf(DEFAULT_LAYERS),
  sections: keysOf(DEFAULT_INFERENCE_CONFIGURATION),
});

// ─── Vocabulary normalization (D-69) ──────────────────────────────────────────────────────────────────

/**
 * Normalize a configured vocabulary name the way names are matched (D-69) [KATEDRALA HEURISTIC]:
 *
 * - every name is ASCII-lower-cased (D-05);
 * - entries of `shared` and `generic` (`shared_directories`, `generic_tokens`) and keys of
 *   `directory-layers` and `naming-suffixes` are then S-stemmed, because they are matched against stemmed
 *   names (`Services` → `service`);
 * - entries of `containers` (`container_directories`) are not stemmed: containers match exactly (D-07);
 * - in the three lists, a leading `!` (an entry that removes a default) is kept and the rest normalized
 *   (`!Helpers` → `!helper`); map keys are names as written, so a `!` there is an ordinary character.
 *
 * The engine's validator reports two names of one list or map that normalize to the same name (plan 5.2).
 *
 * Complexity: O(length). Determinism: ASCII-only (D-05).
 */
export function normalizeVocabularyName(
  list: "containers" | "shared" | "generic" | "directory-layers" | "naming-suffixes",
  name: string,
): string {
  if (list === "directory-layers" || list === "naming-suffixes") return sStem(name);
  if (name.startsWith("!")) return `!${normalizeListEntry(list, name.slice(1))}`;
  return normalizeListEntry(list, name);
}

function normalizeListEntry(list: "containers" | "shared" | "generic", name: string): string {
  // D-07: containers match on the exact lower-cased name; the others match stemmed names.
  return list === "containers" ? asciiLower(name) : sStem(name);
}

// ─── Resolution ───────────────────────────────────────────────────────────────────────────────────────

/** A set of the distinct values, iterating in `compareStrings` order. */
function sortedSet<T extends string>(values: Iterable<T>): ReadonlySet<T> {
  return new Set([...values].sort(compareStrings));
}

/** A copy of a map, iterating in `compareStrings` order of its keys. */
function sortedMap<K extends string, V>(map: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  return new Map([...map].sort(([a], [b]) => compareStrings(a, b)));
}

/**
 * A vocabulary list: the defaults minus the entries `!name` removes, plus the added entries, all normalized
 * (D-69). A removal applies to the default whose normalized form equals the normalized name.
 */
function resolveList(
  list: "containers" | "shared" | "generic",
  defaults: readonly string[],
  configured: readonly string[] | undefined,
): ReadonlySet<string> {
  const removed = new Set<string>();
  const added: string[] = [];
  for (const entry of configured ?? []) {
    if (entry.startsWith("!")) removed.add(normalizeListEntry(list, entry.slice(1)));
    else added.push(normalizeListEntry(list, entry));
  }
  return sortedSet([...defaults.filter((name) => !removed.has(name)), ...added]);
}

/**
 * A vocabulary map merged over its defaults: configured keys are normalized (D-69) and processed in
 * `compareStrings` order (D-23); `null` removes an entry.
 */
function resolveMap<V extends string>(
  list: "directory-layers" | "naming-suffixes",
  defaults: Readonly<Record<string, V>>,
  configured: Readonly<Record<string, V | null>> | undefined,
): ReadonlyMap<string, V> {
  const merged = new Map<string, V>(Object.entries(defaults));
  if (configured !== undefined) {
    for (const key of Object.keys(configured).sort(compareStrings)) {
      const value = configured[key];
      if (value === undefined) continue;
      const normalized = normalizeVocabularyName(list, key);
      if (value === null) merged.delete(normalized);
      else merged.set(normalized, value);
    }
  }
  return sortedMap(merged);
}

/**
 * Role → layer: the defaults merged with `role_layers` (keys are roles, used as written). `null` means "no
 * layer" (⊥), which is what an absent role means too, so the effective map keeps only roles with a layer.
 */
function resolveRoleLayers(
  configured: Readonly<Record<string, string | null>> | undefined,
): ReadonlyMap<ArchitecturalRole, string> {
  const merged = new Map<ArchitecturalRole, string>();
  const apply = (layers: Readonly<Record<string, string | null>>): void => {
    for (const role of Object.keys(layers).sort(compareStrings)) {
      const layer = layers[role];
      if (layer === undefined) continue;
      if (layer === null) merged.delete(role as ArchitecturalRole);
      else merged.set(role as ArchitecturalRole, layer);
    }
  };
  apply(DEFAULT_ROLE_LAYERS);
  if (configured !== undefined) apply(configured);
  return sortedMap(merged);
}

/**
 * Layer → the role a location vote produces: the inverse of `roleLayers`, restricted to layers that exactly
 * one role maps to (D-18). `domain`, `application` or `infrastructure` have no role and give layer votes only.
 */
function locationRolesOf(
  roleLayers: ReadonlyMap<ArchitecturalRole, string>,
): ReadonlyMap<string, ArchitecturalRole> {
  const rolesOf = new Map<string, ArchitecturalRole[]>();
  for (const [role, layer] of roleLayers) {
    const roles = rolesOf.get(layer);
    if (roles === undefined) rolesOf.set(layer, [role]);
    else roles.push(role);
  }
  const inverse = new Map<string, ArchitecturalRole>();
  for (const [layer, roles] of rolesOf) {
    const [role] = roles;
    if (roles.length === 1 && role !== undefined) inverse.set(layer, role);
  }
  return sortedMap(inverse);
}

/**
 * Layer → tier, outermost tier 0. Tiers are numbered consecutively over the tiers that contribute a layer,
 * and a layer listed twice keeps its first tier (the validator rejects both cases, plan 5.2): only the
 * relative order of tiers is used (D-52, D-53), so this is the canonical form of any tier list.
 */
function resolveTiers(tiers: readonly (readonly string[])[]): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  let next = 0;
  for (const tier of tiers) {
    let contributed = false;
    for (const layer of tier) {
      if (result.has(layer)) continue;
      result.set(layer, next);
      contributed = true;
    }
    if (contributed) next++;
  }
  return sortedMap(result);
}

function resolveVocabulary(
  modules: ModuleInferenceConfiguration,
  layers: LayerInferenceConfiguration,
): Vocabulary {
  const genericTokens = resolveList("generic", DEFAULT_GENERIC_TOKENS, modules.generic_tokens);
  const namingSuffixes = resolveMap(
    "naming-suffixes",
    DEFAULT_NAMING_SUFFIXES,
    layers.naming_suffixes,
  );
  const roleLayers = resolveRoleLayers(layers.role_layers);
  return Object.freeze({
    containers: resolveList(
      "containers",
      DEFAULT_CONTAINER_DIRECTORIES,
      modules.container_directories,
    ),
    shared: resolveList("shared", DEFAULT_SHARED_DIRECTORIES, modules.shared_directories),
    directoryLayers: resolveMap(
      "directory-layers",
      DEFAULT_DIRECTORY_LAYERS,
      layers.directory_layers,
    ),
    namingSuffixes,
    roleLayers,
    locationRoles: locationRolesOf(roleLayers),
    genericTokens,
    // D-09: generic tokens and role tokens (the naming-suffix keys, not the directory-layer keys).
    nonStemTokens: sortedSet([...genericTokens, ...namingSuffixes.keys()]),
    tiers: resolveTiers(layers.conventional_tiers ?? DEFAULT_CONVENTIONAL_TIERS),
  });
}

/** Everything `resolveInferenceSettings` returns except the method strings. */
type ResolvedSettings = Omit<InferenceSettings, "methods">;

function resolveParts(
  config: InferenceConfiguration,
  core: { readonly includeTestsInMetrics?: boolean },
): ResolvedSettings {
  const components = config.components ?? {};
  const modules = config.modules ?? {};
  const layers = config.layers ?? {};
  const defaults = DEFAULT_MODULES;
  const weighting: EdgeWeighting = Object.freeze({
    typeOnlyWeight: modules.type_only_weight ?? defaults.type_only_weight,
    minEdgeConfidence: modules.min_edge_confidence ?? defaults.min_edge_confidence,
  });
  const moduleSettings: ModuleSettings = Object.freeze({
    enabled: modules.enabled ?? defaults.enabled,
    whenDeclared: modules.when_declared ?? defaults.when_declared,
    fileRoles: sortedSet<FileRole>(modules.file_roles ?? defaults.file_roles),
    maxModuleFiles: modules.max_module_files ?? defaults.max_module_files,
    minModuleFiles: modules.min_module_files ?? defaults.min_module_files,
    stemMinCoverage: modules.stem_min_coverage ?? defaults.stem_min_coverage,
    utilityMinModules: modules.utility_min_modules ?? defaults.utility_min_modules,
    moveMinSupport: modules.move_min_support ?? defaults.move_min_support,
    moveMinWeight: modules.move_min_weight ?? defaults.move_min_weight,
    maxPasses: modules.max_passes ?? defaults.max_passes,
    attachTests: modules.attach_tests ?? defaults.attach_tests,
    attachDeclarations: modules.attach_declarations ?? defaults.attach_declarations,
    // D-65: with tests in the metrics projection, tests are attached by strict majority only.
    testsInMetrics: core.includeTestsInMetrics ?? false,
  });
  const layerSettings: LayerSettings = Object.freeze({
    enabled: layers.enabled ?? DEFAULT_LAYERS.enabled,
    minLabelScore: layers.min_label_score ?? DEFAULT_LAYERS.min_label_score,
    minLayerFiles: layers.min_layer_files ?? DEFAULT_LAYERS.min_layer_files,
    exactOrderMaxLayers: layers.exact_order_max_layers ?? DEFAULT_LAYERS.exact_order_max_layers,
  });
  return {
    componentFileRoles: sortedSet<FileRole>(components.file_roles ?? DEFAULT_COMPONENTS.file_roles),
    weighting,
    modules: moduleSettings,
    layers: layerSettings,
    vocabulary: resolveVocabulary(modules, layers),
  };
}

// ─── Method strings (D-56) ────────────────────────────────────────────────────────────────────────────

/** A parameter value: a scalar, or a list or map (a JSON array or object). */
type ParameterValue = string | number | boolean | object;

/** One method parameter: `canonical` decides whether it differs from the default, `written` is shown. */
interface Parameter {
  readonly key: string;
  readonly canonical: string;
  readonly written: string;
}

/**
 * Scalars are written with `String(v)`; lists and maps as `h:` plus the first 8 hex digits of
 * `sha256Hex(canonicalJson(value))`, after sets became sorted arrays and maps objects (D-56). Whether a
 * value differs from its default is decided on the full canonical JSON, not on the abbreviated hash.
 */
function parameter(key: string, value: ParameterValue): Parameter {
  if (typeof value === "object") {
    const json = canonicalJson(value);
    return { key, canonical: json, written: `h:${sha256Hex(json).slice(0, 8)}` };
  }
  const text = String(value);
  return { key, canonical: text, written: text };
}

/** A map as a plain object (own properties only, so a key such as `__proto__` stays a key). */
function objectOf(map: ReadonlyMap<string, unknown>): object {
  return Object.fromEntries(map);
}

/** The effective `inference.roles`: per role, its distinct globs sorted (glob lists are sets). */
function effectiveRoles(roles: InferenceConfiguration["roles"]): object {
  const entries: [string, string[]][] = [];
  if (roles !== undefined) {
    for (const role of Object.keys(roles).sort(compareStrings)) {
      const globs = roles[role as ArchitecturalRole];
      if (globs === undefined || globs.length === 0) continue;
      entries.push([role, [...new Set(globs)].sort(compareStrings)]);
    }
  }
  return Object.fromEntries(entries);
}

/**
 * The parameters of the module method: `inference.modules.*` (bare keys), the layer vocabularies that
 * decide directory kinds and file stems, the roles components own (D-22) and
 * `analysis.include_tests_in_metrics` (D-65). `roles`, `role_layers` and `min_label_score` reach modules
 * only through stem names (D-39) and enter no module method.
 */
function moduleParameters(settings: ResolvedSettings): Parameter[] {
  const { modules, weighting, vocabulary } = settings;
  const own = {
    attach_declarations: modules.attachDeclarations,
    attach_tests: modules.attachTests,
    container_directories: [...vocabulary.containers],
    enabled: modules.enabled,
    file_roles: [...modules.fileRoles],
    generic_tokens: [...vocabulary.genericTokens],
    max_module_files: modules.maxModuleFiles,
    max_passes: modules.maxPasses,
    min_edge_confidence: weighting.minEdgeConfidence,
    min_module_files: modules.minModuleFiles,
    move_min_support: modules.moveMinSupport,
    move_min_weight: modules.moveMinWeight,
    shared_directories: [...vocabulary.shared],
    stem_min_coverage: modules.stemMinCoverage,
    type_only_weight: weighting.typeOnlyWeight,
    utility_min_modules: modules.utilityMinModules,
    when_declared: modules.whenDeclared,
  } satisfies Record<keyof ModuleInferenceConfiguration, ParameterValue>;
  return [
    ...Object.entries(own).map(([key, value]) => parameter(key, value)),
    parameter("layers.directory_layers", objectOf(vocabulary.directoryLayers)),
    parameter("layers.naming_suffixes", objectOf(vocabulary.namingSuffixes)),
    parameter("components.file_roles", [...settings.componentFileRoles]),
    parameter("analysis.include_tests_in_metrics", modules.testsInMetrics),
  ];
}

/**
 * The parameters of the layer method: `inference.layers.*` (bare keys), `roles`, the weighting shared with
 * modules (D-51) and the containers, which decide location votes (D-18).
 */
function layerParameters(settings: ResolvedSettings, roles: object): Parameter[] {
  const { layers, weighting, vocabulary } = settings;
  const own = {
    conventional_tiers: objectOf(vocabulary.tiers),
    directory_layers: objectOf(vocabulary.directoryLayers),
    enabled: layers.enabled,
    exact_order_max_layers: layers.exactOrderMaxLayers,
    min_label_score: layers.minLabelScore,
    min_layer_files: layers.minLayerFiles,
    naming_suffixes: objectOf(vocabulary.namingSuffixes),
    role_layers: objectOf(vocabulary.roleLayers),
  } satisfies Record<keyof LayerInferenceConfiguration, ParameterValue>;
  return [
    ...Object.entries(own).map(([key, value]) => parameter(key, value)),
    parameter("roles", roles),
    parameter("modules.type_only_weight", weighting.typeOnlyWeight),
    parameter("modules.min_edge_confidence", weighting.minEdgeConfidence),
    parameter("modules.container_directories", [...vocabulary.containers]),
  ];
}

/** Parameter key → canonical value. */
function canonicalValues(parameters: readonly Parameter[]): ReadonlyMap<string, string> {
  return new Map(parameters.map((p) => [p.key, p.canonical]));
}

/** The defaults the method parameters are compared with: computed once, from the defaults alone. */
const DEFAULT_PARAMETERS: {
  readonly modules: ReadonlyMap<string, string>;
  readonly layers: ReadonlyMap<string, string>;
} = (() => {
  const settings = resolveParts({}, {});
  return Object.freeze({
    modules: canonicalValues(moduleParameters(settings)),
    layers: canonicalValues(layerParameters(settings, effectiveRoles(undefined))),
  });
})();

/**
 * `base`, followed by `?k=v&k=v` for the parameters whose effective value differs from the default, keys
 * sorted by `compareStrings` (D-56). Equal effective values give equal strings however they were written.
 */
function methodString(
  base: string,
  parameters: readonly Parameter[],
  defaults: ReadonlyMap<string, string>,
): string {
  const changed = parameters
    .filter((p) => defaults.get(p.key) !== p.canonical)
    .sort((a, b) => compareStrings(a.key, b.key));
  if (changed.length === 0) return base;
  return `${base}?${changed.map((p) => `${p.key}=${p.written}`).join("&")}`;
}

/**
 * Resolve the effective inference settings [KATEDRALA HEURISTIC]: defaults applied (plan 5.3), vocabularies
 * normalized and merged (D-69), and the method strings of modules and layers computed (D-56).
 *
 * - `config` is a validated `inference` section (the engine validates it; values are not range-checked
 *   here). Lists add to the default vocabularies and `!name` removes a default; maps merge over the
 *   defaults and `null` removes an entry; `conventional_tiers` replaces the defaults.
 * - `core.includeTestsInMetrics` is the `EffectiveCoreSettings` field the engine also builds the metrics
 *   projection from (`analysis.include_tests_in_metrics`, D-65).
 *
 * The result is frozen plain data whose sets and maps iterate in sorted order, so it never depends on the
 * order of configuration keys (D-23); equal effective configurations give deep-equal settings.
 *
 * Complexity: O(V log V) for V vocabulary entries. Determinism: no locale, ASCII-only normalization (D-05),
 * canonical JSON for the parameter hashes.
 */
export function resolveInferenceSettings(
  config: InferenceConfiguration = {},
  core: { readonly includeTestsInMetrics?: boolean } = {},
): InferenceSettings {
  const settings = resolveParts(config, core);
  const methods = Object.freeze({
    modules: methodString(
      MODULE_INFERENCE_METHOD,
      moduleParameters(settings),
      DEFAULT_PARAMETERS.modules,
    ),
    layers: methodString(
      LAYER_INFERENCE_METHOD,
      layerParameters(settings, effectiveRoles(config.roles)),
      DEFAULT_PARAMETERS.layers,
    ),
  });
  return Object.freeze({ ...settings, methods });
}
