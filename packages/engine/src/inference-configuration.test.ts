import {
  ConfigurationError,
  parseConfiguration,
  type ConfigurationIssue,
  type ParsedConfiguration,
} from "@katedrala/core";
import {
  DEFAULT_INFERENCE_CONFIGURATION,
  INFERENCE_KEYS,
  resolveInferenceSettings,
  type InferenceConfiguration,
} from "@katedrala/inference";
import { ARCHITECTURAL_ROLES, FILE_ROLES, compareStrings } from "@katedrala/ir";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  INFERENCE_CONFIGURATION_SECTIONS,
  inferenceSectionSchema,
  layersSectionSchema,
  modulesSectionSchema,
} from "./inference-configuration.js";

const FILE = "katedrala.config.yaml";

/** The reserved sections as `analyzeStructure` alone registers them: accepted without validation. */
const UNVALIDATED = { modules: z.unknown(), layers: z.unknown(), inference: z.unknown() };

function parse(text: string, format: "yaml" | "json" = "yaml"): ParsedConfiguration {
  return parseConfiguration(text, {
    format,
    file: FILE,
    sections: INFERENCE_CONFIGURATION_SECTIONS,
  });
}

function parseUnvalidated(text: string, format: "yaml" | "json" = "yaml"): ParsedConfiguration {
  return parseConfiguration(text, { format, file: FILE, sections: UNVALIDATED });
}

/** The issues of a configuration the validators reject. */
function issuesOf(text: string, format: "yaml" | "json" = "yaml"): ConfigurationIssue[] {
  try {
    parse(text, format);
  } catch (error) {
    if (error instanceof ConfigurationError) return [...error.issues];
    throw error;
  }
  throw new Error(`Expected the configuration to be rejected:\n${text}`);
}

const lines = (...rows: string[]): string => `${rows.join("\n")}\n`;

const NOT_ONLY_EXCLUSIONS =
  'Expected at least one pattern that is not an exclusion ("!…"): exclusions alone would match every other file';
const LATTICE =
  "Expected a multiple of 1/1024 between 0 and 1 (for example 0, 0.25, 0.5 or 1), so that weight sums are exact";
const NAME = "Expected a non-empty name without surrounding spaces";
const MODULE_NAME = 'Module names must not contain "#" or "~"';
const VOCABULARY_ENTRY = 'Expected a name, or "!name" to remove a default';
const UNIT = "Expected a number between 0 and 1";

/** The object schema inside optional wrappers. */
function objectKeys(schema: unknown): string[] {
  let current = schema;
  while (current instanceof z.ZodOptional) current = current.unwrap();
  if (!(current instanceof z.ZodObject)) throw new Error("Expected an object schema");
  return Object.keys(current.shape).sort(compareStrings);
}

describe("INFERENCE_CONFIGURATION_SECTIONS: accepted configurations (plan 5.2)", () => {
  it("accepts the design's §6.1 example unchanged, with the canonical JSON of no validation (D-61)", () => {
    const text = lines(
      "modules:",
      '  payments: ["src/payments/**"]',
      "  analytics:",
      '    files: ["src/analytics/**"]',
      '    entry: ["src/analytics/index.ts"]',
      "layers:",
      "  - name: controller",
      '    files: ["src/controllers/**"]',
      "  - name: service",
      '    files: ["src/services/**"]',
      "  - name: repository",
      '    files: ["src/repositories/**"]',
      "    rank: 2",
      "inference:",
      "  roles:",
      '    http-controller: ["src/**/*.handler.ts"]',
      "  components:",
      "    file_roles: [declaration, generated, script, source, test]",
      "  modules:",
      "    max_module_files: 200",
      '    shared_directories: ["platform", "!core"]',
      "  layers:",
      "    directory_layers: { endpoints: controller, usecases: application }",
    );
    const parsed = parse(text);
    expect(parsed.config).toEqual({
      modules: {
        payments: ["src/payments/**"],
        analytics: { files: ["src/analytics/**"], entry: ["src/analytics/index.ts"] },
      },
      layers: [
        { name: "controller", files: ["src/controllers/**"] },
        { name: "service", files: ["src/services/**"] },
        { name: "repository", files: ["src/repositories/**"], rank: 2 },
      ],
      inference: {
        roles: { "http-controller": ["src/**/*.handler.ts"] },
        components: { file_roles: ["declaration", "generated", "script", "source", "test"] },
        modules: { max_module_files: 200, shared_directories: ["platform", "!core"] },
        layers: { directory_layers: { endpoints: "controller", usecases: "application" } },
      },
    });
    expect(parsed.canonicalJson).toBe(parseUnvalidated(text).canonicalJson);
  });

  it("accepts partial roles and role_layers maps, plugin roles and null removals", () => {
    const parsed = parse(
      lines(
        "inference:",
        "  roles:",
        "    service: [src/services/**]",
        "    x-acme-event: [src/events/**]",
        "  layers:",
        "    role_layers: { service: business, utility: null, x-acme-event: messaging }",
        "    naming_suffixes: { handler: http-controller, event: x-acme-event, dto: null }",
        "    directory_layers: { endpoints: controller, db: null }",
        "    conventional_tiers: [[controller], [business, messaging]]",
      ),
    );
    expect(parsed.config.inference).toEqual({
      roles: { service: ["src/services/**"], "x-acme-event": ["src/events/**"] },
      layers: {
        role_layers: { service: "business", utility: null, "x-acme-event": "messaging" },
        naming_suffixes: { handler: "http-controller", event: "x-acme-event", dto: null },
        directory_layers: { endpoints: "controller", db: null },
        conventional_tiers: [["controller"], ["business", "messaging"]],
      },
    });
  });

  it("accepts empty sections, extglob member patterns and every boundary value", () => {
    const parsed = parse(
      lines(
        "modules: {}",
        "layers:",
        '  - { name: "Domain Model", files: ["!(test)/**"], rank: 0 }',
        "inference:",
        "  modules:",
        "    type_only_weight: 0.0009765625",
        "    min_edge_confidence: 1",
        "    max_module_files: 2",
        "    min_module_files: 1",
        "    stem_min_coverage: 0",
        "    utility_min_modules: 2",
        "    move_min_support: 1",
        "    move_min_weight: 0.001",
        "    max_passes: 1",
        "    container_directories: [Workspaces, '!src']",
        "    generic_tokens: []",
        "  layers:",
        "    conventional_tiers: []",
        "    min_label_score: 0",
        "    min_layer_files: 1",
        "    exact_order_max_layers: 16",
      ),
    );
    expect(parsed.config.modules).toEqual({});
    expect(parsed.config.inference).toMatchObject({
      modules: { type_only_weight: 1 / 1024, max_module_files: 2, min_module_files: 1 },
      layers: { exact_order_max_layers: 16, conventional_tiers: [] },
    });
  });

  it("validates DEFAULT_INFERENCE_CONFIGURATION, which resolves to the default settings (plan 5.2)", () => {
    const text = JSON.stringify({ inference: DEFAULT_INFERENCE_CONFIGURATION });
    const parsed = parse(text, "json");
    expect(parsed.config.inference).toEqual(DEFAULT_INFERENCE_CONFIGURATION);
    expect(parsed.canonicalJson).toBe(parseUnvalidated(text, "json").canonicalJson);
    const settings = resolveInferenceSettings(parsed.config.inference as InferenceConfiguration);
    expect(settings).toEqual(resolveInferenceSettings());
    expect(settings.methods).toEqual({
      modules: "katedrala/module-inference@1",
      layers: "katedrala/layer-inference@1",
    });
  });

  it("has exactly the keys of INFERENCE_KEYS in every section shape", () => {
    expect(objectKeys(inferenceSectionSchema)).toEqual([...INFERENCE_KEYS.sections]);
    const { components, modules, layers } = inferenceSectionSchema.shape;
    expect(objectKeys(components)).toEqual([...INFERENCE_KEYS.components]);
    expect(objectKeys(modules)).toEqual([...INFERENCE_KEYS.modules]);
    expect(objectKeys(layers)).toEqual([...INFERENCE_KEYS.layers]);
    expect(Object.keys(INFERENCE_CONFIGURATION_SECTIONS).sort(compareStrings)).toEqual([
      "inference",
      "layers",
      "modules",
    ]);
    expect(Object.isFrozen(INFERENCE_CONFIGURATION_SECTIONS)).toBe(true);
  });

  it("registers the exported section schemas", () => {
    expect(INFERENCE_CONFIGURATION_SECTIONS.modules).toBe(modulesSectionSchema);
    expect(INFERENCE_CONFIGURATION_SECTIONS.layers).toBe(layersSectionSchema);
    expect(INFERENCE_CONFIGURATION_SECTIONS.inference).toBe(inferenceSectionSchema);
  });
});

describe("INFERENCE_CONFIGURATION_SECTIONS: messages and lines", () => {
  it("reports unknown keys with suggestions at the key's line", () => {
    expect(
      issuesOf(
        lines(
          "inference:",
          "  module: {}",
          "  layers:",
          "    min_label_scor: 0.5",
          "layers:",
          "  - name: service",
          "    files: [src/services/**]",
          "    ranks: 1",
          "modules:",
          "  payments:",
          "    files: [src/payments/**]",
          "    entri: [src/payments/index.ts]",
        ),
      ),
    ).toEqual([
      {
        path: "inference.module",
        message: 'Unknown key "module" (did you mean "modules"?)',
        line: 2,
      },
      {
        path: "inference.layers.min_label_scor",
        message: 'Unknown key "min_label_scor" (did you mean "min_label_score"?)',
        line: 4,
      },
      { path: "layers.0.ranks", message: 'Unknown key "ranks" (did you mean "rank"?)', line: 8 },
      // Union branches give no suggestions (plan 5.2).
      { path: "modules.payments.entri", message: 'Unknown key "entri"', line: 12 },
    ]);
  });

  it("reports values out of range", () => {
    expect(
      issuesOf(
        lines(
          "inference:",
          "  components:",
          "    file_roles: []",
          "  modules:",
          "    min_edge_confidence: -0.1",
          "    max_module_files: 1",
          "    max_passes: 2.5",
          "    move_min_weight: 0",
          "    utility_min_modules: 1",
          "    when_declared: always",
          "  layers:",
          "    min_label_score: 1.5",
          "    exact_order_max_layers: 17",
          "    min_layer_files: 0",
          "layers:",
          "  - name: service",
          "    files: [src/**]",
          "    rank: -1",
        ),
      ),
    ).toEqual([
      {
        path: "inference.components.file_roles",
        message: "Expected at least one file role",
        line: 3,
      },
      { path: "inference.modules.min_edge_confidence", message: UNIT, line: 5 },
      // The cross-field rule min ≤ max does not repeat a range problem.
      {
        path: "inference.modules.max_module_files",
        message: "Expected an integer of at least 2",
        line: 6,
      },
      {
        path: "inference.modules.max_passes",
        message: "Expected an integer of at least 1",
        line: 7,
      },
      {
        path: "inference.modules.move_min_weight",
        message: "Expected a number greater than 0",
        line: 8,
      },
      {
        path: "inference.modules.utility_min_modules",
        message: "Expected an integer of at least 2",
        line: 9,
      },
      {
        path: "inference.modules.when_declared",
        message: 'Invalid option: expected one of "infer-rest"|"none"',
        line: 10,
      },
      { path: "inference.layers.min_label_score", message: UNIT, line: 12 },
      {
        path: "inference.layers.exact_order_max_layers",
        message: "Expected an integer from 2 to 16",
        line: 13,
      },
      {
        path: "inference.layers.min_layer_files",
        message: "Expected an integer of at least 1",
        line: 14,
      },
      { path: "layers.0.rank", message: "Expected an integer of at least 0", line: 18 },
    ]);
  });

  it("reports wrong types with the expected shape", () => {
    expect(
      issuesOf(
        lines(
          "modules:",
          "  payments: src/payments/**",
          "  analytics: { files: src/analytics/** }",
          "layers: {}",
          "inference:",
          "  modules: 3",
          "  layers:",
          "    directory_layers: [controllers]",
          "    conventional_tiers: controller",
          "  roles: []",
        ),
      ),
    ).toEqual([
      {
        path: "modules.payments",
        message:
          'Expected a list of glob patterns, or a mapping with "files" (a list of glob patterns) and optionally "entry"',
        line: 2,
      },
      {
        path: "modules.analytics",
        message:
          'Expected a list of glob patterns, or a mapping with "files" (a list of glob patterns) and optionally "entry"',
        line: 3,
      },
      {
        path: "layers",
        message: 'Expected a list of layers, each a mapping with "name" and "files"',
        line: 4,
      },
      {
        path: "inference.modules",
        message: "Expected a mapping of module inference settings",
        line: 6,
      },
      {
        path: "inference.layers.directory_layers",
        message: "Expected a mapping of directory names to layer names (or null)",
        line: 8,
      },
      {
        path: "inference.layers.conventional_tiers",
        message: "Expected a list of tiers, each a list of layer names",
        line: 9,
      },
      {
        path: "inference.roles",
        message: "Expected a mapping of architectural roles to glob lists",
        line: 10,
      },
    ]);
    expect(issuesOf("modules: [payments]\n")).toEqual([
      { path: "modules", message: "Expected a mapping of module names to glob lists", line: 1 },
    ]);
    expect(issuesOf("inference: []\n")).toEqual([
      { path: "inference", message: "Expected a mapping of inference settings", line: 1 },
    ]);
    expect(issuesOf("layers: []\n")).toEqual([
      {
        path: "layers",
        message: "Expected at least one layer; leave the section out to infer layers",
        line: 1,
      },
    ]);
  });

  it("rejects module names with # or ~ and names with surrounding spaces", () => {
    expect(
      issuesOf(
        lines(
          "modules:",
          '  "a#b": [src/a/**]',
          '  "c~d": [src/c/**]',
          '  " padded": [src/p/**]',
          '  "": [src/e/**]',
          "layers:",
          '  - { name: "service ", files: [src/s/**] }',
          '  - { name: "", files: [src/t/**] }',
        ),
      ),
    ).toEqual([
      { path: "modules.a#b", message: MODULE_NAME, line: 2 },
      { path: "modules.c~d", message: MODULE_NAME, line: 3 },
      { path: "modules. padded", message: NAME, line: 4 },
      { path: "modules.", message: NAME, line: 5 },
      { path: "layers.0.name", message: NAME, line: 7 },
      { path: "layers.1.name", message: NAME, line: 8 },
    ]);
  });

  it("rejects duplicate declared layer names", () => {
    expect(
      issuesOf(
        lines(
          "layers:",
          "  - name: service",
          "    files: [src/services/**]",
          "  - name: repository",
          "    files: [src/repositories/**]",
          "  - name: service",
          "    files: [src/other/**]",
        ),
      ),
    ).toEqual([
      {
        path: "layers.2.name",
        message: 'Duplicate layer name "service": layers.0 has it too',
        line: 6,
      },
    ]);
  });

  it("rejects a layer listed in two conventional tiers or twice in one", () => {
    expect(
      issuesOf(
        lines(
          "inference:",
          "  layers:",
          "    conventional_tiers:",
          "      - [route, controller]",
          "      - [service, controller]",
          "      - [domain, domain]",
          "      - []",
          "      - [Bad_Name]",
        ),
      ),
    ).toEqual([
      {
        path: "inference.layers.conventional_tiers.1.1",
        message: 'The layer "controller" is already in tier 0; each layer belongs to one tier',
        line: 5,
      },
      {
        path: "inference.layers.conventional_tiers.2.1",
        message: 'The layer "domain" is listed twice in this tier',
        line: 6,
      },
      {
        path: "inference.layers.conventional_tiers.3",
        message: "Expected at least one layer name",
        line: 7,
      },
      {
        path: "inference.layers.conventional_tiers.4.0",
        message: "Expected a kebab-case layer name",
        line: 8,
      },
    ]);
  });

  it("rejects member glob lists that are empty or only exclude (D-71)", () => {
    expect(
      issuesOf(
        lines(
          "modules:",
          '  legacy: ["!src/legacy/**"]',
          "  empty: []",
          "  analytics:",
          '    files: ["!src/a/**", "!**/*.test.ts"]',
          "    entry: []",
          "layers:",
          '  - { name: service, files: ["!src/services/**"] }',
          "inference:",
          "  roles:",
          '    service: ["!src/**/*.ts"]',
          "    repository: []",
        ),
      ),
    ).toEqual([
      { path: "modules.legacy", message: NOT_ONLY_EXCLUSIONS, line: 2 },
      { path: "modules.empty", message: "Expected at least one glob pattern", line: 3 },
      { path: "modules.analytics.files", message: NOT_ONLY_EXCLUSIONS, line: 5 },
      { path: "modules.analytics.entry", message: "Expected at least one glob pattern", line: 6 },
      { path: "layers.0.files", message: NOT_ONLY_EXCLUSIONS, line: 8 },
      { path: "inference.roles.service", message: NOT_ONLY_EXCLUSIONS, line: 11 },
      {
        path: "inference.roles.repository",
        message: "Expected at least one glob pattern",
        line: 12,
      },
    ]);
  });

  it("reports glob problems with core's messages", () => {
    expect(
      issuesOf(
        lines(
          "modules:",
          '  payments: ["/src/payments/**"]',
          "layers:",
          '  - { name: service, files: ["src/{a"] }',
          "inference:",
          "  roles:",
          '    service: ["./"]',
        ),
      ),
    ).toEqual([
      {
        path: "modules.payments.0",
        message:
          '"/src/payments/**" can never match: patterns are relative to the analysis root, so write "src/payments/**"',
        line: 2,
      },
      {
        path: "layers.0.files.0",
        message: expect.stringContaining('"src/{a" is not a valid glob pattern') as string,
        line: 4,
      },
      {
        path: "inference.roles.service.0",
        message: '"./" names the analysis root itself; write "**" to match every file',
        line: 7,
      },
    ]);
  });

  it("accepts type_only_weight only on the 1/1024 lattice (D-67)", () => {
    expect(issuesOf("inference:\n  modules:\n    type_only_weight: 0.3\n")).toEqual([
      { path: "inference.modules.type_only_weight", message: LATTICE, line: 3 },
    ]);
    // Out of range: the range message alone.
    expect(issuesOf("inference:\n  modules:\n    type_only_weight: 1.5\n")).toEqual([
      { path: "inference.modules.type_only_weight", message: UNIT, line: 3 },
    ]);
    for (const weight of [0, 0.25, 0.5, 0.75, 1, 3 / 1024]) {
      const parsed = parse(`inference:\n  modules:\n    type_only_weight: ${weight}\n`);
      expect(parsed.config.inference).toEqual({ modules: { type_only_weight: weight } });
    }
  });

  it("rejects min_module_files above max_module_files, with defaults applied", () => {
    expect(issuesOf("inference:\n  modules:\n    max_module_files: 2\n")).toEqual([
      {
        path: "inference.modules.max_module_files",
        message: "min_module_files (3, the default) must not exceed max_module_files (2)",
        line: 3,
      },
    ]);
    expect(issuesOf("inference:\n  modules:\n    min_module_files: 200\n")).toEqual([
      {
        path: "inference.modules.min_module_files",
        message: "min_module_files (200) must not exceed max_module_files (120, the default)",
        line: 3,
      },
    ]);
    expect(
      issuesOf("inference:\n  modules:\n    max_module_files: 5\n    min_module_files: 10\n"),
    ).toEqual([
      {
        path: "inference.modules.min_module_files",
        message: "min_module_files (10) must not exceed max_module_files (5)",
        line: 4,
      },
    ]);
    // Equal values are valid; an out-of-range minimum is reported by its range check alone.
    expect(parse("inference:\n  modules:\n    max_module_files: 7\n    min_module_files: 7\n"));
    expect(issuesOf("inference:\n  modules:\n    min_module_files: 0\n")).toEqual([
      {
        path: "inference.modules.min_module_files",
        message: "Expected an integer of at least 1",
        line: 3,
      },
    ]);
  });

  it("rejects names that normalize alike in one vocabulary list or map (D-69)", () => {
    expect(
      issuesOf(
        lines(
          "inference:",
          "  modules:",
          "    shared_directories: [Helpers, helper, platform]",
          "    generic_tokens: [widget, widget, '!mappers', mapper]",
          "    container_directories: [Src, src, apps, app]",
          "  layers:",
          "    directory_layers:",
          "      services: service",
          "      Services: service",
          "      endpoint: controller",
          "    naming_suffixes: { Controllers: http-controller, controller: http-controller }",
        ),
      ),
    ).toEqual([
      {
        path: "inference.modules.shared_directories.1",
        message: '"Helpers" and "helper" both normalize to "helper"; list one of them',
        line: 3,
      },
      {
        path: "inference.modules.generic_tokens.1",
        message: '"widget" is listed twice',
        line: 4,
      },
      {
        path: "inference.modules.generic_tokens.3",
        message:
          '"!mappers" and "mapper" both name "mapper", which cannot be both added and removed; list one of them',
        line: 4,
      },
      // Containers match exactly (D-07): "apps" and "app" are different names.
      {
        path: "inference.modules.container_directories.1",
        message: '"Src" and "src" both normalize to "src"; list one of them',
        line: 5,
      },
      // Keys are compared in compareStrings order (D-23): "Services" sorts before "services".
      {
        path: "inference.layers.directory_layers.services",
        message: '"Services" and "services" both normalize to "service"; list one of them',
        line: 8,
      },
      {
        path: "inference.layers.naming_suffixes.controller",
        message: '"Controllers" and "controller" both normalize to "controller"; list one of them',
        line: 11,
      },
    ]);
  });

  it("rejects vocabulary entries that are not names", () => {
    expect(
      issuesOf(
        lines(
          "inference:",
          "  modules:",
          "    generic_tokens: ['two words', '!', '!!x', '']",
          "  layers:",
          "    directory_layers: { '': controller, endpoints: Controllers }",
        ),
      ),
    ).toEqual([
      { path: "inference.modules.generic_tokens.0", message: VOCABULARY_ENTRY, line: 3 },
      { path: "inference.modules.generic_tokens.1", message: VOCABULARY_ENTRY, line: 3 },
      { path: "inference.modules.generic_tokens.2", message: VOCABULARY_ENTRY, line: 3 },
      { path: "inference.modules.generic_tokens.3", message: VOCABULARY_ENTRY, line: 3 },
      { path: "inference.layers.directory_layers.", message: "Expected a non-empty name", line: 5 },
      {
        path: "inference.layers.directory_layers.endpoints",
        message: "Expected a kebab-case layer name",
        line: 5,
      },
    ]);
  });

  it("rejects unknown roles with a suggestion, and malformed plugin roles", () => {
    expect(
      issuesOf(
        lines(
          "inference:",
          "  roles:",
          "    servce: [src/services/**]",
          "  layers:",
          "    role_layers: { x-Acme: service, repository: data-access }",
          "    naming_suffixes: { handler: controler, event: x-acme_event }",
        ),
      ),
    ).toEqual([
      {
        path: "inference.roles.servce",
        message:
          'Unknown architectural role "servce" (did you mean "service"?); plugin roles start with "x-"',
        line: 3,
      },
      {
        path: "inference.layers.role_layers.x-Acme",
        message:
          'Plugin roles are "x-" followed by kebab-case words (for example "x-acme-event"), not "x-Acme"',
        line: 5,
      },
      {
        path: "inference.layers.naming_suffixes.event",
        message:
          'Plugin roles are "x-" followed by kebab-case words (for example "x-acme-event"), not "x-acme_event"',
        line: 6,
      },
      {
        path: "inference.layers.naming_suffixes.handler",
        message: 'Unknown architectural role "controler"; plugin roles start with "x-"',
        line: 6,
      },
    ]);
  });

  it("rejects __proto__ keys, which would otherwise vanish from the configuration (D-61)", () => {
    const text = lines(
      "modules:",
      "  __proto__: [src/**]",
      "inference:",
      "  roles:",
      "    __proto__: [src/**]",
      "  layers:",
      "    directory_layers: { __proto__: controller }",
      "    naming_suffixes: { __proto__: service }",
      "    role_layers: { __proto__: service }",
    );
    const message = '"__proto__" cannot be used as a name here';
    expect(issuesOf(text)).toEqual([
      { path: "modules.__proto__", message, line: 2 },
      { path: "inference.roles.__proto__", message, line: 5 },
      { path: "inference.layers.directory_layers.__proto__", message, line: 7 },
      { path: "inference.layers.naming_suffixes.__proto__", message, line: 8 },
      { path: "inference.layers.role_layers.__proto__", message, line: 9 },
    ]);
    // Without the validators, the key is kept as written.
    expect(parseUnvalidated(text).canonicalJson).toContain('"__proto__":["src/**"]');
    // A key such as "constructor" is an ordinary name.
    expect(parse("modules:\n  constructor: [src/**]\n").config.modules).toEqual({
      constructor: ["src/**"],
    });
  });

  it("reports every problem of every section in one pass, in line order", () => {
    const issues = issuesOf(
      lines(
        "modules:",
        '  "a#b": ["!src/**"]',
        "layers:",
        "  - { name: service, files: [src/**] }",
        "  - { name: service, files: [src/**] }",
        "inference:",
        "  modules:",
        "    type_only_weight: 0.1",
      ),
    );
    expect(issues.map((issue) => [issue.line, issue.path])).toEqual([
      [2, "modules.a#b"],
      [2, "modules.a#b"],
      [5, "layers.1.name"],
      [8, "inference.modules.type_only_weight"],
    ]);
  });
});

// ─── Properties ───────────────────────────────────────────────────────────────────────────────────────

const POSITIVE_GLOBS = ["src/**", "src/a/**", "lib/*.ts", "!(test)/**", ".github/**"];
const EXCLUSIONS = ["!src/a/legacy/**", "!**/*.test.ts"];

const globList = fc
  .tuple(fc.subarray(POSITIVE_GLOBS, { minLength: 1 }), fc.subarray(EXCLUSIONS))
  .map(([positive, negative]) => [...positive, ...negative]);

const declaredModule = fc.oneof(
  globList,
  fc.record(
    { files: globList, entry: fc.subarray(POSITIVE_GLOBS, { minLength: 1 }) },
    { requiredKeys: ["files"] },
  ),
);

const PLUGIN_ROLES = ["x-acme-event", "x-b2b"];
const roleArbitrary = fc.constantFrom(...ARCHITECTURAL_ROLES, ...PLUGIN_ROLES);
const layerName = fc.constantFrom("controller", "service", "business-logic", "a2", "use-case");
const unitArbitrary = fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true });

/** Valid configurations of the three sections (min ≤ max holds whichever keys are present). */
const validConfiguration = fc.record(
  {
    modules: fc.dictionary(
      fc.constantFrom("payments", "analytics", "core", "billing api", "2024", "a.b", "constructor"),
      declaredModule,
    ),
    layers: fc.uniqueArray(
      fc.record(
        {
          name: fc.constantFrom("controller", "service", "Domain Model", "data access"),
          files: globList,
          rank: fc.nat(5),
        },
        { requiredKeys: ["name", "files"] },
      ),
      { minLength: 1, maxLength: 4, selector: (layer) => layer.name },
    ),
    inference: fc.record(
      {
        roles: fc.dictionary(roleArbitrary, globList),
        components: fc.record(
          { file_roles: fc.subarray([...FILE_ROLES], { minLength: 1 }) },
          { requiredKeys: [] },
        ),
        modules: fc.record(
          {
            enabled: fc.boolean(),
            when_declared: fc.constantFrom("infer-rest", "none"),
            file_roles: fc.subarray([...FILE_ROLES], { minLength: 1 }),
            type_only_weight: fc.integer({ min: 0, max: 1024 }).map((n) => n / 1024),
            min_edge_confidence: unitArbitrary,
            max_module_files: fc.integer({ min: 3, max: 500 }),
            min_module_files: fc.integer({ min: 1, max: 3 }),
            stem_min_coverage: unitArbitrary,
            utility_min_modules: fc.integer({ min: 2, max: 9 }),
            move_min_support: fc.integer({ min: 1, max: 9 }),
            move_min_weight: fc.double({ min: 0.001, max: 100, noNaN: true }),
            max_passes: fc.integer({ min: 1, max: 99 }),
            attach_tests: fc.boolean(),
            attach_declarations: fc.boolean(),
            container_directories: fc.subarray(["platform", "!src", "Workspaces"]),
            shared_directories: fc.subarray(["platform", "!core", "Kit"]),
            generic_tokens: fc.subarray(["widget", "!mapper", "Gizmo"]),
          },
          { requiredKeys: [] },
        ),
        layers: fc.record(
          {
            enabled: fc.boolean(),
            directory_layers: fc.dictionary(
              fc.constantFrom("endpoints", "usecases", "Gateways"),
              fc.option(layerName, { nil: null }),
            ),
            role_layers: fc.dictionary(roleArbitrary, fc.option(layerName, { nil: null })),
            naming_suffixes: fc.dictionary(
              fc.constantFrom("handler", "Endpoint", "presenter"),
              fc.option(roleArbitrary, { nil: null }),
            ),
            conventional_tiers: fc.constantFrom(
              [],
              [["route"], ["controller", "service"]],
              [["a2"], ["use-case"], ["business-logic"]],
            ),
            min_label_score: unitArbitrary,
            min_layer_files: fc.integer({ min: 1, max: 9 }),
            exact_order_max_layers: fc.integer({ min: 2, max: 16 }),
          },
          { requiredKeys: [] },
        ),
      },
      { requiredKeys: [] },
    ),
  },
  { requiredKeys: [] },
);

/** Configurations that may break the cross-field rules and name rules as well. */
const anyConfiguration = fc.record(
  {
    modules: fc.dictionary(fc.constantFrom("payments", "a#b", " padded", "core"), declaredModule),
    layers: fc.array(
      fc.record({ name: fc.constantFrom("service", "service", "controller"), files: globList }),
      { minLength: 1, maxLength: 3 },
    ),
    inference: fc.record(
      {
        roles: fc.dictionary(fc.constantFrom("service", "servce", "x-Bad", "x-ok"), globList),
        modules: fc.record(
          {
            type_only_weight: fc.constantFrom(0.3, 0.5, 2),
            max_module_files: fc.integer({ min: 0, max: 6 }),
            min_module_files: fc.integer({ min: 0, max: 6 }),
            shared_directories: fc.subarray(["Helpers", "helper", "!helper", "platform"]),
          },
          { requiredKeys: [] },
        ),
        layers: fc.record(
          {
            directory_layers: fc.dictionary(
              fc.constantFrom("services", "Services", "service", "views"),
              fc.constantFrom("service", "Bad"),
            ),
            conventional_tiers: fc.constantFrom([["a"], ["a"]], [["a", "b"]], [[]]),
          },
          { requiredKeys: [] },
        ),
      },
      { requiredKeys: [] },
    ),
  },
  { requiredKeys: [] },
);

/** The same value with the keys of every mapping in reverse order. */
function reversedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reversedKeys);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, nested]) => [key, reversedKeys(nested)]),
    );
  }
  return value;
}

/** What validation concluded: the canonical JSON, or the issues (one line: the text is compact JSON). */
function outcome(text: string): string {
  try {
    return parse(text, "json").canonicalJson;
  } catch (error) {
    if (!(error instanceof ConfigurationError)) throw error;
    return JSON.stringify(error.issues);
  }
}

describe("INFERENCE_CONFIGURATION_SECTIONS: properties", () => {
  it("accept valid configurations without changing them (D-61)", () => {
    fc.assert(
      fc.property(validConfiguration, (configuration) => {
        const text = JSON.stringify(configuration);
        const parsed = parse(text, "json");
        expect(parsed.config).toEqual(JSON.parse(text));
        expect(parsed.canonicalJson).toBe(parseUnvalidated(text, "json").canonicalJson);
      }),
      { seed: 20261008, numRuns: 300 },
    );
  });

  it("conclude the same whatever the order of mapping keys (D-23)", () => {
    fc.assert(
      fc.property(fc.oneof(validConfiguration, anyConfiguration), (configuration) => {
        const text = JSON.stringify(configuration);
        expect(outcome(JSON.stringify(reversedKeys(configuration)))).toBe(outcome(text));
      }),
      { seed: 20261009, numRuns: 300 },
    );
  });
});
