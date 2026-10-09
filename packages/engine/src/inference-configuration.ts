/**
 * Validators of the `modules`, `layers` and `inference` configuration sections (milestone 5 plan 5.2; inference
 * design §6). The engine registers them when it runs inference (`analyzeArchitecture`). `@katedrala/inference`
 * owns the configuration types, the defaults (`resolveInferenceSettings`), the key lists (`INFERENCE_KEYS`) and
 * the normalization of vocabulary names, and stays free of zod and of core's glob semantics (D-59, ADR-013);
 * the shapes below are checked against its types and key lists.
 *
 * - **No defaults, no rewriting (D-61).** The validators only accept or reject: nothing is defaulted or
 *   transformed, so the canonical configuration JSON, and with it `snapshot.analysisDigest`, is the same
 *   whether or not they are registered. Defaults live only in `resolveInferenceSettings`.
 * - **No key-order semantics (D-23).** Mapping keys are checked in `compareStrings` order, and no rule depends
 *   on the order in which keys are written.
 * - **Globs** use core's semantics and messages (`globListSchema`): picomatch, relative to the analysis root,
 *   dotfiles included, ancestors match, `!pattern` excludes for the whole list. Lists that declare members
 *   need a pattern that is not an exclusion (D-71).
 *
 * Determinism: validation is a pure function of the configuration value; messages contain only the
 * configuration's own text and fixed words.
 */
import { globListSchema, unknownKeyMessage } from "@katedrala/core";
import {
  DEFAULT_INFERENCE_CONFIGURATION,
  normalizeVocabularyName,
  type DeclaredLayerConfiguration,
  type DeclaredModuleConfiguration,
  type InferenceConfiguration,
  type LayersConfiguration,
  type ModulesConfiguration,
} from "@katedrala/inference";
import {
  ARCHITECTURAL_ROLES,
  EXTENSION_VALUE_PATTERN,
  FILE_ROLES,
  compareStrings,
  type ArchitecturalRole,
} from "@katedrala/ir";
import { z } from "zod";

/** A section of `inference`, for the `satisfies` checks of the shapes below (plan 5.2). */
type Section<K extends keyof InferenceConfiguration> = NonNullable<InferenceConfiguration[K]>;

/** A problem found by a cross-field rule, at a path relative to the value the rule checks. */
interface Problem {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

/** A zod refinement that reports the problems `rule` finds, each at its own path. */
function reporting<T>(
  rule: (value: T) => readonly Problem[],
): (value: T, context: z.core.$RefinementCtx<T>) => void {
  return (value, context) => {
    for (const problem of rule(value)) {
      context.addIssue({ code: "custom", path: [...problem.path], message: problem.message });
    }
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const quote = (text: string): string => JSON.stringify(text);

// ─── Names, keys and values ───────────────────────────────────────────────────────────────────────────

const NAME_MESSAGE = "Expected a non-empty name without surrounding spaces";

/**
 * Declared module and layer names are the user's names, used as written (D-69): non-empty, without
 * surrounding spaces.
 */
function nameProblem(name: string): string | undefined {
  return name !== "" && name.trim() === name ? undefined : NAME_MESSAGE;
}

/**
 * Declared module names are also identifiers (`mod:<name>`, see `declaredModuleKey`), in which `#` separates a
 * stem and `~` introduces the `~inferred` suffix.
 */
function moduleNameProblem(name: string): string | undefined {
  return (
    nameProblem(name) ??
    (/[#~]/.test(name) ? 'Module names must not contain "#" or "~"' : undefined)
  );
}

const KNOWN_ROLES: ReadonlySet<string> = new Set(ARCHITECTURAL_ROLES);

/** An `ArchitecturalRole`: a known role, or a plugin role (`x-` followed by kebab-case words). */
function roleProblem(role: string): string | undefined {
  if (KNOWN_ROLES.has(role) || EXTENSION_VALUE_PATTERN.test(role)) return undefined;
  if (role.startsWith("x-")) {
    return `Plugin roles are "x-" followed by kebab-case words (for example "x-acme-event"), not ${quote(role)}`;
  }
  return `${unknownKeyMessage(role, ARCHITECTURAL_ROLES, "architectural role")}; plugin roles start with "x-"`;
}

/** Vocabulary map keys are directory names and name suffixes, normalized by inference (D-69). */
function vocabularyKeyProblem(key: string): string | undefined {
  return key === "" ? "Expected a non-empty name" : undefined;
}

const PROTO_KEY_MESSAGE = '"__proto__" cannot be used as a name here';

/**
 * `schema`, after rejecting a `__proto__` key. YAML and JSON mappings can contain one as an ordinary own key,
 * but zod's records skip it: the entry would vanish from the validated configuration, and the canonical
 * configuration JSON would depend on whether these validators ran (D-61). Rejecting it keeps validation an
 * accept-or-reject decision. A rejected key stops the check of that mapping, so its other problems are
 * reported once the key is gone.
 */
function withoutProtoKey<T extends z.ZodType>(schema: T) {
  return z
    .unknown()
    .superRefine((value, context) => {
      if (isPlainRecord(value) && Object.hasOwn(value, "__proto__")) {
        context.addIssue({ code: "custom", path: ["__proto__"], message: PROTO_KEY_MESSAGE });
      }
    })
    .pipe(schema);
}

/**
 * A mapping with string keys checked by `keyProblem`. zod reports a key that fails a key schema only as
 * "Invalid key in record", with the reason nested where configuration errors do not show it, so keys are
 * checked here and each problem is reported at the key's path with its own message. Keys are visited in
 * `compareStrings` order (D-23); the check also runs when values are invalid, so that one pass reports both.
 * The key schema stays `z.string()`, which keeps role-keyed maps partial: zod 4 makes a record whose key
 * schema has a finite set of values exhaustive (plan 5.2).
 */
function keyedRecord<V extends z.ZodType>(
  value: V,
  keyProblem: (key: string) => string | undefined,
  error: string,
) {
  return withoutProtoKey(
    z.record(z.string(), value, { error }).check(
      z.superRefine(
        reporting((record: Record<string, unknown>) =>
          Object.keys(record)
            .sort(compareStrings)
            .flatMap((key): Problem[] => {
              const message = keyProblem(key);
              return message === undefined ? [] : [{ path: [key], message }];
            }),
        ),
        { when: (payload) => isPlainRecord(payload.value) },
      ),
    ),
  );
}

const name = z.string().refine((value) => nameProblem(value) === undefined, NAME_MESSAGE);

/** Layer names of the vocabularies are kebab-case and used as written, like the default layer names (D-69). */
const kebab = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected a kebab-case layer name");

const role = z
  .string()
  .refine((value): value is ArchitecturalRole => roleProblem(value) === undefined, {
    error: (issue) => roleProblem(String(issue.input)) ?? "Expected an architectural role",
  });

const unit = z
  .number({ error: "Expected a number between 0 and 1" })
  .min(0, "Expected a number between 0 and 1")
  .max(1, "Expected a number between 0 and 1");

// D-67: edge weights are 1 and `type_only_weight`, so a multiple of 1/1024 makes every weight sum, comparison
// and tie of the algorithm exact (multiplying by a power of two is exact in binary floating point). Values
// outside [0, 1] are reported by the range checks alone.
const lattice = unit.refine(
  (weight) => weight < 0 || weight > 1 || Number.isInteger(weight * 1024),
  "Expected a multiple of 1/1024 between 0 and 1 (for example 0, 0.25, 0.5 or 1), so that weight sums are exact",
);

/** An integer of at least `minimum` (and at most `maximum`), with one message for every way to miss it. */
function integer(minimum: number, maximum?: number) {
  const message =
    maximum === undefined
      ? `Expected an integer of at least ${minimum}`
      : `Expected an integer from ${minimum} to ${maximum}`;
  const atLeast = z.number({ error: message }).int(message).min(minimum, message);
  return maximum === undefined ? atLeast : atLeast.max(maximum, message);
}

/** Smallest valid `max_module_files` and `min_module_files` (design §6.3). */
const MAX_MODULE_FILES_MINIMUM = 2;
const MIN_MODULE_FILES_MINIMUM = 1;

const fileRoles = z.array(z.enum(FILE_ROLES)).min(1, "Expected at least one file role");

/** An entry of a vocabulary list: a name, or `!name` to remove a default (D-69). */
const VOCABULARY_ENTRY = /^!?[^!\s][^\s]*$/;
const vocabularyEntry = z
  .string()
  .regex(VOCABULARY_ENTRY, 'Expected a name, or "!name" to remove a default');

/** A pattern that is not a list-wide exclusion: core treats `!pattern` (not the extglob `!(...)`) as one. */
function isPositivePattern(glob: string): boolean {
  return !glob.startsWith("!") || glob.startsWith("!(");
}

const AT_LEAST_ONE_GLOB = "Expected at least one glob pattern";

// D-71: core's lists treat `!pattern` as a list-wide exclusion, and a list of exclusions alone matches every
// path not excluded. That is right for `exclude`, not for membership: `payments: ["!src/legacy/**"]` would
// claim the whole repository. Module, layer and role globs therefore need a pattern that is not an exclusion.
const memberGlobs = globListSchema
  .min(1, AT_LEAST_ONE_GLOB)
  .refine(
    (globs) => globs.length === 0 || globs.some(isPositivePattern),
    'Expected at least one pattern that is not an exclusion ("!…"): exclusions alone would match every other file',
  );

// ─── Cross-field rules ────────────────────────────────────────────────────────────────────────────────

/** Declared layer names are unique: a name is one `layer:<name>` identifier. */
function duplicateLayerNames(layers: readonly { readonly name: unknown }[]): Problem[] {
  const first = new Map<string, number>();
  const problems: Problem[] = [];
  layers.forEach((layer, index) => {
    if (typeof layer.name !== "string") return;
    const earlier = first.get(layer.name);
    if (earlier === undefined) first.set(layer.name, index);
    else {
      problems.push({
        path: [index, "name"],
        message: `Duplicate layer name ${quote(layer.name)}: layers.${earlier} has it too`,
      });
    }
  });
  return problems;
}

/**
 * Each layer appears in one conventional tier, once: only the relative order of tiers has meaning (D-52,
 * D-53), and a layer in two tiers would have two.
 */
function repeatedTierLayers(tiers: readonly (readonly string[])[]): Problem[] {
  const tierOf = new Map<string, number>();
  const problems: Problem[] = [];
  tiers.forEach((tier, tierIndex) => {
    tier.forEach((layer, index) => {
      const earlier = tierOf.get(layer);
      if (earlier === undefined) tierOf.set(layer, tierIndex);
      else {
        problems.push({
          path: [tierIndex, index],
          message:
            earlier === tierIndex
              ? `The layer ${quote(layer)} is listed twice in this tier`
              : `The layer ${quote(layer)} is already in tier ${earlier}; each layer belongs to one tier`,
        });
      }
    });
  });
  return problems;
}

/**
 * `min_module_files ≤ max_module_files`, with the defaults applied for the comparison (plan 5.2). A value
 * outside its own range is reported by its range check alone.
 */
function minAboveMax(modules: {
  readonly min_module_files?: number | undefined;
  readonly max_module_files?: number | undefined;
}): Problem[] {
  const defaults = DEFAULT_INFERENCE_CONFIGURATION.modules;
  const min = modules.min_module_files ?? defaults.min_module_files;
  const max = modules.max_module_files ?? defaults.max_module_files;
  const valid =
    Number.isInteger(min) &&
    min >= MIN_MODULE_FILES_MINIMUM &&
    Number.isInteger(max) &&
    max >= MAX_MODULE_FILES_MINIMUM;
  if (!valid || min <= max) return [];
  const written = (value: number, configured: boolean): string =>
    configured ? String(value) : `${value}, the default`;
  const minConfigured = modules.min_module_files !== undefined;
  return [
    {
      path: [minConfigured ? "min_module_files" : "max_module_files"],
      message: `min_module_files (${written(min, minConfigured)}) must not exceed max_module_files (${written(max, modules.max_module_files !== undefined)})`,
    },
  ];
}

/** Why two vocabulary names are the same name for inference (D-69); `normalized` is the shared name. */
function sameNameMessage(earlier: string, later: string, normalized: string): string {
  if (earlier === later) return `${quote(later)} is listed twice`;
  if (earlier.startsWith("!") !== later.startsWith("!")) {
    return `${quote(earlier)} and ${quote(later)} both name ${quote(normalized)}, which cannot be both added and removed; list one of them`;
  }
  return `${quote(earlier)} and ${quote(later)} both normalize to ${quote(normalized)}; list one of them`;
}

/** The vocabulary lists of `inference.modules` with their normalization (D-69). */
const VOCABULARY_LISTS = [
  ["container_directories", "containers"],
  ["shared_directories", "shared"],
  ["generic_tokens", "generic"],
] as const;

/**
 * D-69: no two entries of one vocabulary list name the same normalized name (`Helpers` and `helper`). This
 * includes an addition and a removal of one name (`helpers` and `!helper`), which would leave it unclear
 * whether the name is in the vocabulary. Entries that are not names are reported by the entry check alone.
 */
function sameNormalizedNames(modules: {
  readonly [K in (typeof VOCABULARY_LISTS)[number][0]]?: readonly string[] | undefined;
}): Problem[] {
  const problems: Problem[] = [];
  for (const [key, list] of VOCABULARY_LISTS) {
    const firstOf = new Map<string, string>();
    (modules[key] ?? []).forEach((entry, index) => {
      if (!VOCABULARY_ENTRY.test(entry)) return;
      // `normalizeVocabularyName` keeps a leading "!" (a removal); the name is what follows it.
      const normalized = normalizeVocabularyName(list, entry).replace(/^!/, "");
      const earlier = firstOf.get(normalized);
      if (earlier === undefined) firstOf.set(normalized, entry);
      else
        problems.push({ path: [key, index], message: sameNameMessage(earlier, entry, normalized) });
    });
  }
  return problems;
}

/** The vocabulary maps of `inference.layers` whose keys inference normalizes (D-69). */
const VOCABULARY_MAPS = [
  ["directory_layers", "directory-layers"],
  ["naming_suffixes", "naming-suffixes"],
] as const;

/**
 * D-69: no two keys of one vocabulary map normalize to the same key (`Services` and `services`). Keys are
 * compared in `compareStrings` order, so the key reported does not depend on how the mapping is written
 * (D-23).
 */
function sameNormalizedKeys(layers: {
  readonly [K in (typeof VOCABULARY_MAPS)[number][0]]?:
    Readonly<Record<string, unknown>> | undefined;
}): Problem[] {
  const problems: Problem[] = [];
  for (const [key, list] of VOCABULARY_MAPS) {
    const firstOf = new Map<string, string>();
    for (const written of Object.keys(layers[key] ?? {}).sort(compareStrings)) {
      const normalized = normalizeVocabularyName(list, written);
      const earlier = firstOf.get(normalized);
      if (earlier === undefined) firstOf.set(normalized, written);
      else {
        problems.push({
          path: [key, written],
          message: sameNameMessage(earlier, written, normalized),
        });
      }
    }
  }
  return problems;
}

// ─── Sections ─────────────────────────────────────────────────────────────────────────────────────────

const declaredModuleShape = {
  files: memberGlobs,
  entry: globListSchema.min(1, AT_LEAST_ONE_GLOB).optional(),
} satisfies Record<keyof Exclude<DeclaredModuleConfiguration, string[]>, z.ZodType>;

// When neither form fits and zod cannot tell which was meant (a wrong type inside), it reports the union.
const declaredModule = z.union([memberGlobs, z.strictObject(declaredModuleShape)], {
  error:
    'Expected a list of glob patterns, or a mapping with "files" (a list of glob patterns) and optionally "entry"',
});

/**
 * Validator of the `modules` section [DERIVED: declared membership is exact glob membership, §3.14]: module
 * name → a glob list (short form) or `{ files, entry }` (long form). Names are non-empty, without surrounding
 * spaces, `#` or `~` (they become `mod:<name>`). Every glob list is non-empty, and `files` needs a pattern that
 * is not an exclusion (D-71). Overlaps are not an error: inference resolves them by name, with a warning
 * (D-23). Accepts without transforming (D-61).
 *
 * Complexity: O(size of the section · glob compilation). Determinism: keys checked in `compareStrings` order.
 * References: plan 5.2, 5.4; design §3.14, §6.2.
 */
export const modulesSectionSchema = keyedRecord(
  declaredModule,
  moduleNameProblem,
  "Expected a mapping of module names to glob lists",
);

const declaredLayerShape = {
  name,
  files: memberGlobs,
  rank: integer(0).optional(),
} satisfies Record<keyof DeclaredLayerConfiguration, z.ZodType>;

/**
 * Validator of the `layers` section [DERIVED: declared layers are exact, §4.3, D-50]: a non-empty list of
 * `{ name, files, rank }`, outermost layer first. Names are the user's names (non-empty, without surrounding
 * spaces) and unique; `files` needs a pattern that is not an exclusion (D-71); `rank` is an integer ≥ 0 (by
 * default the position, which `resolveDeclarations` applies, never this validator: D-61).
 *
 * Complexity: O(size of the section · glob compilation). Determinism: list order is the declared order.
 * References: plan 5.2, 5.4; design §6.3.
 */
export const layersSectionSchema = z
  .array(z.strictObject(declaredLayerShape), {
    error: 'Expected a list of layers, each a mapping with "name" and "files"',
  })
  .min(1, "Expected at least one layer; leave the section out to infer layers")
  .superRefine(reporting(duplicateLayerNames));

const componentsShape = {
  file_roles: fileRoles.optional(),
} satisfies Record<keyof Section<"components">, z.ZodType>;

const modulesShape = {
  enabled: z.boolean().optional(),
  when_declared: z.enum(["infer-rest", "none"]).optional(),
  file_roles: fileRoles.optional(),
  type_only_weight: lattice.optional(),
  min_edge_confidence: unit.optional(),
  max_module_files: integer(MAX_MODULE_FILES_MINIMUM).optional(),
  min_module_files: integer(MIN_MODULE_FILES_MINIMUM).optional(),
  stem_min_coverage: unit.optional(),
  utility_min_modules: integer(2).optional(),
  move_min_support: integer(1).optional(),
  move_min_weight: z
    .number({ error: "Expected a number greater than 0" })
    .gt(0, "Expected a number greater than 0")
    .optional(),
  max_passes: integer(1).optional(),
  attach_tests: z.boolean().optional(),
  attach_declarations: z.boolean().optional(),
  container_directories: z.array(vocabularyEntry).optional(),
  shared_directories: z.array(vocabularyEntry).optional(),
  generic_tokens: z.array(vocabularyEntry).optional(),
} satisfies Record<keyof Section<"modules">, z.ZodType>;

const layersShape = {
  enabled: z.boolean().optional(),
  directory_layers: keyedRecord(
    kebab.nullable(),
    vocabularyKeyProblem,
    "Expected a mapping of directory names to layer names (or null)",
  ).optional(),
  role_layers: keyedRecord(
    kebab.nullable(),
    roleProblem,
    "Expected a mapping of architectural roles to layer names (or null)",
  ).optional(),
  naming_suffixes: keyedRecord(
    role.nullable(),
    vocabularyKeyProblem,
    "Expected a mapping of name suffixes to architectural roles (or null)",
  ).optional(),
  conventional_tiers: z
    .array(z.array(kebab).min(1, "Expected at least one layer name"), {
      error: "Expected a list of tiers, each a list of layer names",
    })
    .superRefine(reporting(repeatedTierLayers))
    .optional(),
  min_label_score: unit.optional(),
  min_layer_files: integer(1).optional(),
  exact_order_max_layers: integer(2, 16).optional(),
} satisfies Record<keyof Section<"layers">, z.ZodType>;

const inferenceShape = {
  roles: keyedRecord(
    memberGlobs,
    roleProblem,
    "Expected a mapping of architectural roles to glob lists",
  ).optional(),
  components: z
    .strictObject(componentsShape, { error: "Expected a mapping of component settings" })
    .optional(),
  modules: z
    .strictObject(modulesShape, { error: "Expected a mapping of module inference settings" })
    .superRefine(reporting(minAboveMax))
    .superRefine(reporting(sameNormalizedNames))
    .optional(),
  layers: z
    .strictObject(layersShape, { error: "Expected a mapping of layer inference settings" })
    .superRefine(reporting(sameNormalizedKeys))
    .optional(),
} satisfies Record<keyof InferenceConfiguration, z.ZodType>;

/**
 * Validator of the `inference` section [DERIVED: validation only; the parameters it checks are KATEDRALA
 * HEURISTIC]: `roles` (role → member globs, D-71), `components`, `modules` and `layers`, with the ranges of
 * plan 5.2 and these cross-field rules:
 *
 * - `type_only_weight` is a multiple of 1/1024 in [0, 1], so every weight sum is exact (D-67);
 * - `min_module_files ≤ max_module_files`, with defaults applied for the comparison;
 * - no two entries of a vocabulary list, and no two keys of `directory_layers` or `naming_suffixes`, normalize
 *   to the same name (D-69, `normalizeVocabularyName`);
 * - each layer appears in one conventional tier, once.
 *
 * Unknown keys are errors (reported with a suggestion by core). Partial `roles` and `role_layers` maps are
 * valid. Accepts without transforming (D-61); defaults are `resolveInferenceSettings`'s.
 *
 * Complexity: O(size of the section · glob compilation). Determinism: mapping keys checked in
 * `compareStrings` order (D-23). References: plan 5.2, 5.3; design §6.3; docs/ALGORITHMS.md, "Configuration
 * reference".
 */
export const inferenceSectionSchema = z.strictObject(inferenceShape, {
  error: "Expected a mapping of inference settings",
});

/**
 * The validators `analyzeArchitecture` registers for the `modules`, `layers` and `inference` sections
 * [DERIVED: validation only], exported so that tools can validate a configuration without analyzing
 * (`parseConfiguration(text, { sections: INFERENCE_CONFIGURATION_SECTIONS })`). `analyzeStructure` alone does
 * not evaluate these sections and reports them as not evaluated.
 *
 * Zod infers optional properties as `T | undefined`, which `exactOptionalPropertyTypes` distinguishes from
 * absent properties; validated values never contain explicit `undefined` (zod keeps absent keys absent).
 * Core's `createConfigurationSchema` casts for the same reason. The cast cannot check the types; the
 * `satisfies` clauses of the shapes check the keys, and tests compare them with `INFERENCE_KEYS` and validate
 * `DEFAULT_INFERENCE_CONFIGURATION` (plan 5.2).
 *
 * Complexity and determinism: see {@link modulesSectionSchema}, {@link layersSectionSchema} and
 * {@link inferenceSectionSchema}. References: plan 3.4, 5.1, 5.2; ADR-013.
 */
export const INFERENCE_CONFIGURATION_SECTIONS: {
  readonly modules: z.ZodType<ModulesConfiguration>;
  readonly layers: z.ZodType<LayersConfiguration>;
  readonly inference: z.ZodType<InferenceConfiguration>;
} = Object.freeze({
  modules: modulesSectionSchema as unknown as z.ZodType<ModulesConfiguration>,
  layers: layersSectionSchema as unknown as z.ZodType<LayersConfiguration>,
  inference: inferenceSectionSchema as unknown as z.ZodType<InferenceConfiguration>,
});
