import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CONFIGURATION_FILE_NAMES,
  ConfigurationError,
  formatConfigurationIssue,
  loadConfiguration,
  parseConfiguration,
} from "./load.js";
import { createConfigurationSchema, knownKeysAt, suggestKey } from "./schema.js";
import { resolveCoreSettings } from "./settings.js";

const FULL_YAML = `# A complete configuration
name: shop
include: ["src/**", "packages/*/src/**"]
exclude:
  - "**/*.snap"
roles:
  generated: ["src/api/client/**"]
  test: ["qa/**"]
analysis:
  max_file_size: 2097152
  detail: file
  include_tests_in_metrics: true
  include_type_only: false
  max_provenance_per_edge: null
languages:
  typescript:
    recordUntypedCalls: false
cache:
  enabled: false
  dir: .cache/katedrala
entry_points: ["src/main.ts"]
x-team: payments
`;

function issuesOf(run: () => unknown): ConfigurationError {
  try {
    run();
  } catch (error) {
    if (error instanceof ConfigurationError) return error;
    throw error;
  }
  throw new Error("expected a ConfigurationError");
}

describe("parseConfiguration", () => {
  it("parses and validates every core section", () => {
    const { config, canonicalJson } = parseConfiguration(FULL_YAML);
    expect(config).toEqual({
      name: "shop",
      include: ["src/**", "packages/*/src/**"],
      exclude: ["**/*.snap"],
      roles: { generated: ["src/api/client/**"], test: ["qa/**"] },
      analysis: {
        max_file_size: 2097152,
        detail: "file",
        include_tests_in_metrics: true,
        include_type_only: false,
        max_provenance_per_edge: null,
      },
      languages: { typescript: { recordUntypedCalls: false } },
      cache: { enabled: false, dir: ".cache/katedrala" },
      entry_points: ["src/main.ts"],
      "x-team": "payments",
    });
    expect(
      canonicalJson.startsWith('{"analysis":{"detail":"file","include_tests_in_metrics":true'),
    ).toBe(true);
    expect(JSON.parse(canonicalJson)).toEqual(config);
  });

  it("produces the same canonical JSON whatever the key order or format", () => {
    const yaml = parseConfiguration("cache:\n  dir: c\n  enabled: true\nname: x\n");
    const reordered = parseConfiguration("name: x\ncache: { enabled: true, dir: c }\n");
    const json = parseConfiguration('{ "name": "x", "cache": { "enabled": true, "dir": "c" } }', {
      format: "json",
    });
    expect(yaml.canonicalJson).toBe('{"cache":{"dir":"c","enabled":true},"name":"x"}');
    expect(reordered.canonicalJson).toBe(yaml.canonicalJson);
    expect(json.canonicalJson).toBe(yaml.canonicalJson);
  });

  it("treats an empty document as the empty configuration", () => {
    expect(parseConfiguration("")).toEqual({ config: {}, canonicalJson: "{}" });
    expect(parseConfiguration("# only a comment\n")).toEqual({ config: {}, canonicalJson: "{}" });
    expect(parseConfiguration("{}", { format: "json" })).toEqual({
      config: {},
      canonicalJson: "{}",
    });
  });

  it("reports every invalid value with its dotted path and line", () => {
    const error = issuesOf(() =>
      parseConfiguration(
        [
          "name: shop", // 1
          "analysis:", // 2
          '  max_file_size: "big"', // 3
          "  detail: everything", // 4
          "include:", // 5
          "  - src/**", // 6
          "  - 42", // 7
          "  - ''", // 8
          "cache:", // 9
          "  enabled: yes please", // 10
        ].join("\n"),
        { file: "katedrala.config.yaml" },
      ),
    );
    expect(error.code).toBe("invalid-configuration");
    expect(error.file).toBe("katedrala.config.yaml");
    expect(error.issues.map((issue) => [issue.path, issue.line])).toEqual([
      ["analysis.max_file_size", 3],
      ["analysis.detail", 4],
      ["include.1", 7],
      ["include.2", 8],
      ["cache.enabled", 10],
    ]);
    expect(error.message).toContain("Invalid Katedrala configuration (katedrala.config.yaml):");
    expect(error.message).toContain(
      "analysis.max_file_size: Expected a positive integer (bytes) (line 3)",
    );
    expect(error.message).toContain(
      'analysis.detail: Invalid option: expected one of "symbol"|"file" (line 4)',
    );
    expect(error.message).toContain("include.2: Expected a non-empty glob pattern (line 8)");
  });

  it("rejects globs that name the root, start with / or do not compile, at their key path and line", () => {
    // Each of these used to pass validation, then made discovery throw a bare TypeError or match nothing.
    for (const [yaml, path, line] of [
      ["include: ['./']", "include.0", 1],
      ["exclude: ['/']", "exclude.0", 1],
      ["exclude: ['!']", "exclude.0", 1],
      ["roles:\n  test: ['./']", "roles.test.0", 2],
    ] as const) {
      expect(
        issuesOf(() => parseConfiguration(yaml)).issues.map((issue) => [issue.path, issue.line]),
      ).toEqual([[path, line]]);
    }
    const error = issuesOf(() =>
      parseConfiguration(
        [
          "include: ['./', 'src/**', './lib/']", // 1
          "exclude:", // 2
          "  - /", // 3
          "  - '!'", // 4
          "  - /dist/**", // 5
          "  - '!./'", // 6
          "  - '!/build'", // 7
          "roles:", // 8
          "  test: ['.', 'qa/{a']", // 9
          "entry_points: ['src/main.ts']", // 10
        ].join("\n"),
        { file: "katedrala.config.yaml" },
      ),
    );
    expect(error.issues).toEqual([
      {
        path: "include.0",
        message: '"./" names the analysis root itself; write "**" to match every file',
        line: 1,
      },
      {
        path: "exclude.0",
        message: '"/" names the analysis root itself; write "**" to match every file',
        line: 3,
      },
      {
        path: "exclude.1",
        message: '"!" must be followed by a pattern (e.g. "!dist/**")',
        line: 4,
      },
      {
        path: "exclude.2",
        message:
          '"/dist/**" can never match: patterns are relative to the analysis root, so write "dist/**"',
        line: 5,
      },
      {
        path: "exclude.3",
        message: '"!./" names the analysis root itself; write "!**" to leave out every file',
        line: 6,
      },
      {
        path: "exclude.4",
        message:
          '"!/build" can never match: patterns are relative to the analysis root, so write "!build"',
        line: 7,
      },
      {
        path: "roles.test.0",
        message: '"." names the analysis root itself; write "**" to match every file',
        line: 9,
      },
      {
        path: "roles.test.1",
        message: expect.stringMatching(/^"qa\/\{a" is not a valid glob pattern \(.+\)$/) as string,
        line: 9,
      },
    ]);
    // Patterns that select files are accepted, whatever their spelling.
    expect(
      parseConfiguration("include: ['./src/', 'lib//', '**']\nexclude: ['!(*.md)', '!**/*.snap']")
        .config,
    ).toEqual({ include: ["./src/", "lib//", "**"], exclude: ["!(*.md)", "!**/*.snap"] });
  });

  it("rejects unknown top-level keys with a suggestion, but accepts x- keys", () => {
    const error = issuesOf(() =>
      parseConfiguration(
        "name: shop\nanalyis:\n  detail: file\nfoo: 1\nx-custom:\n  anything: [1, 2]\n",
      ),
    );
    expect(error.issues).toEqual([
      {
        path: "analyis",
        message:
          'Unknown configuration key "analyis" (did you mean "analysis"?); custom keys must start with "x-"',
        line: 2,
      },
      {
        path: "foo",
        message: 'Unknown configuration key "foo"; custom keys must start with "x-"',
        line: 4,
      },
    ]);
    expect(parseConfiguration("x-custom:\n  anything: [1, 2]\n").config).toEqual({
      "x-custom": { anything: [1, 2] },
    });
  });

  it("rejects unknown keys inside core sections, at the key's line", () => {
    const error = issuesOf(() =>
      parseConfiguration("analysis:\n  detail: file\n  max_file_sise: 10\nroles:\n  tests: [a]\n"),
    );
    expect(error.issues).toEqual([
      {
        path: "analysis.max_file_sise",
        message: 'Unknown key "max_file_sise" (did you mean "max_file_size"?)',
        line: 3,
      },
      { path: "roles.tests", message: 'Unknown key "tests" (did you mean "test"?)', line: 5 },
    ]);
  });

  it("reports both unknown keys and invalid values in one pass", () => {
    const error = issuesOf(() => parseConfiguration("rules: []\nanalysis:\n  detail: 3\n"));
    expect(error.issues.map((issue) => issue.path)).toEqual(["rules", "analysis.detail"]);
    expect(error.issues[0]?.message).toBe(
      'Configuration section "rules" is not supported here: no validator is registered for it',
    );
  });

  it("validates registered sections", () => {
    const sections = {
      rules: z.array(
        z.strictObject({ id: z.string(), severity: z.enum(["info", "warning", "error"]) }),
      ),
      groups: z.record(z.string(), z.array(z.string())),
    };
    const { config } = parseConfiguration(
      "groups:\n  ui: [src/ui/**]\nrules:\n  - id: no-cycles\n    severity: error\n",
      { sections },
    );
    expect(config).toEqual({
      groups: { ui: ["src/ui/**"] },
      rules: [{ id: "no-cycles", severity: "error" }],
    });
    const error = issuesOf(() =>
      parseConfiguration("rules:\n  - id: a\n    severity: fatal\n  - id: b\n    sevrity: info\n", {
        sections,
      }),
    );
    expect(error.issues).toEqual([
      {
        path: "rules.0.severity",
        message: 'Invalid option: expected one of "info"|"warning"|"error"',
        line: 3,
      },
      {
        // A missing key is located at its object (the list item starting at line 4).
        path: "rules.1.severity",
        message: 'Invalid option: expected one of "info"|"warning"|"error"',
        line: 4,
      },
      {
        path: "rules.1.sevrity",
        message: 'Unknown key "sevrity" (did you mean "severity"?)',
        line: 5,
      },
    ]);
  });

  it("does not let extra sections redefine core sections", () => {
    expect(() => createConfigurationSchema({ analysis: z.unknown() })).toThrow(TypeError);
  });

  it("reports YAML syntax errors with lines", () => {
    const duplicate = issuesOf(() => parseConfiguration("name: a\nname: b\n"));
    expect(duplicate.issues).toEqual([
      { path: "", message: "YAML syntax error: Map keys must be unique", line: 2 },
    ]);
    const broken = issuesOf(() => parseConfiguration("include: [a, b\nname: x\n"));
    expect(broken.issues[0]?.line).toBeGreaterThanOrEqual(1);
    expect(broken.issues[0]?.message).toMatch(/^YAML syntax error: /);
    expect(formatConfigurationIssue({ path: "", message: "m", line: 3 })).toBe(
      "(root): m (line 3)",
    );
  });

  it("requires a mapping at the top level", () => {
    const error = issuesOf(() => parseConfiguration("- a\n- b\n"));
    expect(error.issues).toEqual([
      { path: "", message: "Expected a mapping of configuration sections", line: 1 },
    ]);
  });

  it("parses JSON with line numbers for syntax and validation errors", () => {
    const syntax = issuesOf(() =>
      parseConfiguration('{\n  "name": "x",\n}\n', {
        format: "json",
        file: "katedrala.config.json",
      }),
    );
    expect(syntax.issues).toEqual([
      {
        path: "",
        message: "JSON syntax error: Expected a double-quoted property name (column 1)",
        line: 3,
      },
    ]);
    const invalid = issuesOf(() =>
      parseConfiguration(
        '{\n  "name": "x",\n  "analysis": {\n    "max_file_size": -1\n  },\n  "nmae": 1\n}',
        {
          format: "json",
        },
      ),
    );
    expect(invalid.issues.map((issue) => [issue.path, issue.line])).toEqual([
      ["analysis.max_file_size", 4],
      ["nmae", 6],
    ]);
  });

  it("strips a byte-order mark and CRLF line endings before parsing", () => {
    const error = issuesOf(() => parseConfiguration("﻿name: x\r\nanalysis:\r\n  detail: 1\r\n"));
    expect(error.issues).toEqual([
      {
        path: "analysis.detail",
        message: 'Invalid option: expected one of "symbol"|"file"',
        line: 3,
      },
    ]);
  });

  it("rejects alias bombs", () => {
    const bomb = [
      "a: &a [x, x, x, x, x, x, x, x, x]",
      "b: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a]",
      "c: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b]",
      "x-d: [*c, *c, *c, *c, *c, *c, *c, *c, *c]",
    ].join("\n");
    expect(() => parseConfiguration(bomb)).toThrow(ConfigurationError);
  });
});

describe("suggestions", () => {
  it("suggests the closest known key within a small edit distance", () => {
    expect(suggestKey("analyis", ["analysis", "name"])).toBe("analysis");
    expect(suggestKey("Include", ["include", "exclude"])).toBe("include");
    expect(suggestKey("xyz", ["analysis", "name"])).toBeUndefined();
    expect(suggestKey("nme", ["name", "nmo"])).toBe("name");
  });

  it("finds the keys of nested object schemas", () => {
    const schema = createConfigurationSchema();
    expect(knownKeysAt(schema, ["analysis"])).toContain("max_file_size");
    expect(knownKeysAt(schema, ["roles"])).toContain("generated");
    expect(knownKeysAt(schema, ["languages", "typescript"])).toEqual([]);
    expect(knownKeysAt(schema, ["name"])).toEqual([]);
  });
});

describe("loadConfiguration", () => {
  let scratch = "";
  let counter = 0;
  const newRoot = async (files: Record<string, string>): Promise<string> => {
    const root = join(scratch, `root-${++counter}`);
    await mkdir(root, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      await mkdir(join(root, name, ".."), { recursive: true });
      await writeFile(join(root, name), content);
    }
    return root;
  };

  beforeAll(async () => {
    scratch = await mkdtemp(join(tmpdir(), "katedrala-core-config-"));
  });

  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it("searches the configuration file names in order", async () => {
    expect(CONFIGURATION_FILE_NAMES[0]).toBe("katedrala.config.yaml");
    const root = await newRoot({
      ".katedrala.yml": "name: last\n",
      "katedrala.config.json": '{ "name": "json" }',
      "katedrala.config.yml": "name: yml\n",
    });
    expect(await loadConfiguration({ root })).toEqual({
      config: { name: "yml" },
      canonicalJson: '{"name":"yml"}',
      path: "katedrala.config.yml",
    });
    const jsonRoot = await newRoot({ "katedrala.config.json": '{ "name": "json" }' });
    expect((await loadConfiguration({ root: jsonRoot })).config).toEqual({ name: "json" });
    const dotRoot = await newRoot({ ".katedrala.yaml": "name: dot\n" });
    expect(await loadConfiguration({ root: dotRoot })).toMatchObject({ path: ".katedrala.yaml" });
  });

  it("returns the empty configuration when there is no file", async () => {
    const root = await newRoot({ "README.md": "# x\n" });
    expect(await loadConfiguration({ root })).toEqual({ config: {}, canonicalJson: "{}" });
  });

  it("uses an explicit path, relative to the root or absolute", async () => {
    const root = await newRoot({ "config/katedrala.json": '{ "name": "explicit" }' });
    expect(await loadConfiguration({ root, explicitPath: "config/katedrala.json" })).toEqual({
      config: { name: "explicit" },
      canonicalJson: '{"name":"explicit"}',
      path: "config/katedrala.json",
    });
    const absolute = join(root, "config", "katedrala.json");
    expect((await loadConfiguration({ root, explicitPath: absolute })).path).toBe(
      "config/katedrala.json",
    );
    await expect(loadConfiguration({ root, explicitPath: "missing.yaml" })).rejects.toMatchObject({
      code: "invalid-configuration",
      file: "missing.yaml",
      issues: [{ path: "", message: "The configuration file does not exist" }],
    });
  });

  it("reports invalid files with their path and lines", async () => {
    const root = await newRoot({
      "katedrala.config.yaml": "name: x\r\nanalysis:\r\n  detail: 5\r\n",
    });
    await expect(loadConfiguration({ root })).rejects.toMatchObject({
      file: "katedrala.config.yaml",
      issues: [{ path: "analysis.detail", line: 3 }],
    });
  });

  it("passes registered sections through", async () => {
    const root = await newRoot({
      "katedrala.config.yaml": "modules:\n  payments: [src/payments/**]\n",
    });
    const sections = { modules: z.record(z.string(), z.array(z.string())) };
    expect((await loadConfiguration({ root, sections })).config).toEqual({
      modules: { payments: ["src/payments/**"] },
    });
    await expect(loadConfiguration({ root })).rejects.toBeInstanceOf(ConfigurationError);
  });
});

describe("resolveCoreSettings", () => {
  it("applies every default", () => {
    expect(resolveCoreSettings({})).toEqual({
      include: ["**"],
      exclude: [],
      roles: {
        source: [],
        test: [],
        declaration: [],
        configuration: [],
        script: [],
        generated: [],
        vendored: [],
        documentation: [],
        asset: [],
        data: [],
        other: [],
      },
      maxFileSize: 1048576,
      detail: "symbol",
      includeTestsInMetrics: false,
      includeTypeOnly: true,
      maxProvenancePerEdge: 20,
      languages: {},
      cache: { enabled: true },
      entryPoints: [],
    });
  });

  it("maps a complete configuration", () => {
    const settings = resolveCoreSettings(parseConfiguration(FULL_YAML).config);
    expect(settings).toMatchObject({
      name: "shop",
      include: ["src/**", "packages/*/src/**"],
      exclude: ["**/*.snap"],
      maxFileSize: 2097152,
      detail: "file",
      includeTestsInMetrics: true,
      includeTypeOnly: false,
      maxProvenancePerEdge: null,
      languages: { typescript: { recordUntypedCalls: false } },
      cache: { enabled: false, dir: ".cache/katedrala" },
      entryPoints: ["src/main.ts"],
    });
    expect(settings.roles.generated).toEqual(["src/api/client/**"]);
    expect(settings.roles.source).toEqual([]);
  });

  it("treats an empty include list as everything and sorts adapter ids", () => {
    const settings = resolveCoreSettings({ include: [], languages: { b: {}, a: { x: 1 } } });
    expect(settings.include).toEqual(["**"]);
    expect(Object.keys(settings.languages)).toEqual(["a", "b"]);
  });

  it("does not share arrays with the configuration", () => {
    const config = { exclude: ["a"], roles: { test: ["t"] } };
    const settings = resolveCoreSettings(config);
    (settings.exclude as string[]).push("b");
    (settings.roles.test as string[]).push("u");
    expect(config).toEqual({ exclude: ["a"], roles: { test: ["t"] } });
  });
});
