/**
 * Finding, parsing and validating the configuration file.
 */
import { readFile } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { compareStrings } from "@katedrala/ir";
import type { z } from "zod";
import { decodeText, normalizeLineEndings } from "../text/text.js";
import { canonicalJson } from "../util/canonical-json.js";
import { errorMessage } from "../util/diagnostics.js";
import {
  parseConfigurationDocument,
  type ConfigurationDocument,
  type ConfigurationFormat,
  type ValuePath,
} from "./document.js";
import {
  UNKNOWN_KEY_ISSUE,
  createConfigurationSchema,
  knownKeysAt,
  unknownKeyMessage,
  type KatedralaConfig,
} from "./schema.js";

/** File names searched in the analysis root, in order; the first one found is used. */
export const CONFIGURATION_FILE_NAMES = [
  "katedrala.config.yaml",
  "katedrala.config.yml",
  "katedrala.config.json",
  ".katedrala.yaml",
  ".katedrala.yml",
] as const;

/** One problem found in a configuration file. */
export interface ConfigurationIssue {
  /** Dotted path of the offending key or value (`analysis.max_file_size`, `include.2`); `""` for the whole file. */
  path: string;
  message: string;
  /** 1-based line in the configuration file, when known. */
  line?: number;
}

/** `<dotted.path>: <message> (line N)`; the whole file is written `(root)`. */
export function formatConfigurationIssue(issue: ConfigurationIssue): string {
  const where = issue.path === "" ? "(root)" : issue.path;
  const line = issue.line === undefined ? "" : ` (line ${issue.line})`;
  return `${where}: ${issue.message}${line}`;
}

/**
 * An invalid, unreadable or missing configuration file. The message lists every issue, one per line, as
 * `<dotted.path>: <message> (line N)`.
 */
export class ConfigurationError extends Error {
  /** Stable error code. */
  readonly code = "invalid-configuration";
  /** Every issue, sorted by line, then path. */
  readonly issues: readonly ConfigurationIssue[];
  /** The configuration file, relative to the analysis root (POSIX), when known. */
  readonly file?: string;

  constructor(issues: readonly ConfigurationIssue[], file?: string, options?: { cause?: unknown }) {
    const sorted = [...issues].sort(compareIssues);
    const header = `Invalid Katedrala configuration${file === undefined ? "" : ` (${file})`}:`;
    super(
      [header, ...sorted.map((issue) => `  ${formatConfigurationIssue(issue)}`)].join("\n"),
      options,
    );
    this.name = "ConfigurationError";
    this.issues = sorted;
    if (file !== undefined) this.file = file;
  }
}

function compareIssues(a: ConfigurationIssue, b: ConfigurationIssue): number {
  return (
    (a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER) ||
    compareStrings(a.path, b.path) ||
    compareStrings(a.message, b.message)
  );
}

/** Options of {@link parseConfiguration}. */
export interface ParseConfigurationOptions {
  /** Syntax of the text (default `yaml`; YAML 1.2 also accepts most JSON). */
  format?: ConfigurationFormat;
  /** Name of the file, for error messages. */
  file?: string;
  /** Schemas of additional top-level sections (see `createConfigurationSchema`). */
  sections?: Readonly<Record<string, z.ZodType>>;
}

/** A validated configuration. */
export interface ParsedConfiguration {
  /** The validated configuration (`{}` for an empty document). */
  config: KatedralaConfig;
  /** The validated configuration as JSON with sorted keys and no whitespace, for digests. */
  canonicalJson: string;
}

/** A validated configuration and where it came from. */
export interface LoadedConfiguration extends ParsedConfiguration {
  /**
   * The configuration file relative to the analysis root (POSIX; may start with `../` for an explicit path
   * outside the root). Absent when no configuration file exists.
   */
  path?: string;
}

/** Options of {@link loadConfiguration}. */
export interface LoadConfigurationOptions {
  /** Absolute path of the analysis root. */
  root: string;
  /** A configuration file to use instead of searching the root (absolute, or relative to `root`). */
  explicitPath?: string;
  /** Schemas of additional top-level sections (see `createConfigurationSchema`). */
  sections?: Readonly<Record<string, z.ZodType>>;
}

function toValuePath(path: readonly PropertyKey[]): (string | number)[] {
  return path.map((segment) => (typeof segment === "number" ? segment : String(segment)));
}

function dotted(path: ValuePath): string {
  return path.map(String).join(".");
}

function toIssues(
  zodIssues: readonly z.core.$ZodIssue[],
  document: ConfigurationDocument,
  schema: z.ZodType,
): ConfigurationIssue[] {
  const issues: ConfigurationIssue[] = [];
  const add = (path: ValuePath, message: string, key: boolean): void => {
    const line = document.locate(path, key);
    issues.push(
      line === undefined ? { path: dotted(path), message } : { path: dotted(path), message, line },
    );
  };
  for (const issue of zodIssues) {
    const path = toValuePath(issue.path);
    if (issue.code === "unrecognized_keys") {
      const known = knownKeysAt(schema, path);
      for (const key of issue.keys) add([...path, key], unknownKeyMessage(key, known), true);
    } else {
      const unknownKey = issue.code === "custom" && issue.params?.[UNKNOWN_KEY_ISSUE] === true;
      add(path, issue.message, unknownKey);
    }
  }
  return issues;
}

/**
 * Parse and validate configuration text.
 *
 * @throws {ConfigurationError} for syntax errors and validation issues (every issue is reported).
 */
export function parseConfiguration(
  text: string,
  options: ParseConfigurationOptions = {},
): ParsedConfiguration {
  const normalized = normalizeLineEndings(text.startsWith("﻿") ? text.slice(1) : text);
  const parsed = parseConfigurationDocument(normalized, options.format ?? "yaml");
  if (!parsed.ok) {
    throw new ConfigurationError(
      parsed.problems.map((problem) =>
        problem.line === undefined
          ? { path: "", message: problem.message }
          : { path: "", message: problem.message, line: problem.line },
      ),
      options.file,
    );
  }
  const value = parsed.document.value ?? {};
  const schema = createConfigurationSchema(options.sections);
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ConfigurationError(
      toIssues(result.error.issues, parsed.document, schema),
      options.file,
    );
  }
  return { config: result.data, canonicalJson: canonicalJson(result.data) };
}

function formatOf(file: string): ConfigurationFormat {
  return extname(file).toLowerCase() === ".json" ? "json" : "yaml";
}

function relativeToRoot(root: string, file: string): string {
  return relative(root, file).split(sep).join("/");
}

/**
 * Load the configuration of an analysis root: `explicitPath` when given, otherwise the first of
 * {@link CONFIGURATION_FILE_NAMES} that exists in `root`. Files ending in `.json` are parsed as JSON, all
 * others as YAML (with line positions for error messages). Without a configuration file the result is the
 * empty configuration `{}` (validated, so registered sections may contribute defaults).
 *
 * @throws {ConfigurationError} when the file is invalid, when it cannot be read, or when `explicitPath` does
 *   not exist.
 */
export async function loadConfiguration(
  options: LoadConfigurationOptions,
): Promise<LoadedConfiguration> {
  const root = resolve(options.root);
  const candidates =
    options.explicitPath === undefined
      ? CONFIGURATION_FILE_NAMES.map((name) => resolve(root, name))
      : [resolve(root, options.explicitPath)];
  for (const candidate of candidates) {
    const path = relativeToRoot(root, candidate);
    let bytes: Uint8Array;
    try {
      bytes = await readFile(candidate);
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
      if (missing && options.explicitPath === undefined) continue;
      const message = missing
        ? "The configuration file does not exist"
        : `Cannot read the configuration file: ${errorMessage(error)}`;
      throw new ConfigurationError([{ path: "", message }], path, { cause: error });
    }
    const decoded = decodeText(bytes);
    if (decoded.binary) {
      throw new ConfigurationError([{ path: "", message: "The file is not text" }], path);
    }
    const parsed = parseConfiguration(decoded.text, {
      format: formatOf(candidate),
      file: path,
      ...(options.sections === undefined ? {} : { sections: options.sections }),
    });
    return { ...parsed, path };
  }
  return parseConfiguration(
    "",
    options.sections === undefined ? {} : { sections: options.sections },
  );
}
