/**
 * Which project configuration governs a file, and the directories a configuration compiles from.
 *
 * The governing configuration of a file is found as an editor would: among the configurations in the
 * file's directory and its ancestors, nearest directory first (within a directory: `tsconfig.json`,
 * `jsconfig.json`, then other `tsconfig*.json` by name), the first whose `files` / `include` / `exclude`
 * select the file. The search continues above the analysis root up to the version-control top level
 * (`tsconfig.json` and `jsconfig.json` only, see `loadProjectConfigs`), so that a subdirectory analyzed on
 * its own keeps the configuration of its repository. A solution-style configuration (`"files": []` with
 * `references`) delegates to the referenced configurations (recursively, in reference order) that select
 * the file. When no configuration selects the file, the nearest configuration is used (a documented
 * fallback: its `paths` and `baseUrl` are the best available guess). File extensions are not checked
 * against `allowJs`.
 */
import { ancestorsOf, baseName, compareStrings, isWithin, parentPath } from "@katedrala/ir";
import type { Locator } from "./locations.js";
import type { SnapshotIndex } from "./snapshot.js";
import type { LoadedConfigs, ProjectConfig } from "./tsconfig.js";

function candidateRank(path: string): number {
  const name = baseName(path);
  return name === "tsconfig.json" ? 0 : name === "jsconfig.json" ? 1 : 2;
}

const TYPESCRIPT_INPUT = /\.(?:ts|tsx|mts|cts)$/;
const JAVASCRIPT_INPUT = /\.(?:js|jsx|mjs|cjs)$/;
const DECLARATION_FILE = /\.d\.(?:[^/]*\.)?[mc]?ts$/;

/** Whether a file is a compilation input that produces output (no declaration files). */
function isEmittingInput(path: string, allowJs: boolean): boolean {
  if (DECLARATION_FILE.test(path)) return false;
  return TYPESCRIPT_INPUT.test(path) || (allowJs && JAVASCRIPT_INPUT.test(path));
}

/** The project configurations of a snapshot, indexed by location. */
export class ConfigSet {
  readonly #configs: ReadonlyMap<string, ProjectConfig>;
  readonly #byDirectory = new Map<string, ProjectConfig[]>();
  readonly #governing = new Map<string, ProjectConfig | null>();
  readonly #commonSourceDirectories = new Map<string, string | null>();

  constructor(
    loaded: LoadedConfigs,
    private readonly snapshot: SnapshotIndex,
    private readonly locator: Locator,
  ) {
    this.#configs = loaded.configs;
    for (const path of loaded.candidates) {
      const config = loaded.configs.get(path);
      if (config === undefined) continue;
      const list = this.#byDirectory.get(config.directory) ?? [];
      list.push(config);
      this.#byDirectory.set(config.directory, list);
    }
    for (const list of this.#byDirectory.values()) {
      list.sort(
        (a, b) => candidateRank(a.path) - candidateRank(b.path) || compareStrings(a.path, b.path),
      );
    }
  }

  /** The configuration loaded from `path` (a canonical loose path). */
  get(path: string): ProjectConfig | undefined {
    return this.#configs.get(path);
  }

  /** Configurations located directly in `directory`, in candidate order. */
  candidates(directory: string): readonly ProjectConfig[] {
    return this.#byDirectory.get(directory) ?? [];
  }

  /** Whether a configuration's `files` / `include` / `exclude` select a file of the snapshot. */
  selects(config: ProjectConfig, file: string): boolean {
    const matchPath = this.locator.matchPath(file);
    if (matchPath === undefined) return false;
    if (config.files.has(matchPath)) return true;
    if (config.include === undefined) return false;
    const key = `/${matchPath}`;
    return config.include.test(key) && config.exclude?.test(key) !== true;
  }

  #select(config: ProjectConfig, file: string, visited: Set<string>): ProjectConfig | undefined {
    if (visited.has(config.path)) return undefined;
    visited.add(config.path);
    if (!config.solution) return this.selects(config, file) ? config : undefined;
    for (const reference of config.references) {
      const referenced = this.#configs.get(reference);
      const selected =
        referenced === undefined ? undefined : this.#select(referenced, file, visited);
      if (selected !== undefined) return selected;
    }
    return undefined;
  }

  /**
   * The directories whose configurations may apply to `path` (a root-relative path), nearest first: its
   * directory, the directories above it up to the analysis root, then the directories above the root.
   */
  #searchDirectories(path: string): string[] {
    const start = parentPath(path);
    return [start, ...ancestorsOf(start), ...this.locator.ancestorDirectories()];
  }

  /** The configuration governing a file (see the module documentation); undefined without any. */
  governing(file: string): ProjectConfig | undefined {
    const cached = this.#governing.get(file);
    if (cached !== undefined) return cached ?? undefined;
    const directories = this.#searchDirectories(file);
    let result: ProjectConfig | undefined;
    search: for (const directory of directories) {
      for (const config of this.candidates(directory)) {
        result = this.#select(config, file, new Set());
        if (result !== undefined) break search;
      }
    }
    if (result === undefined) {
      for (const directory of directories) {
        result = this.candidates(directory)[0];
        if (result !== undefined) break;
      }
    }
    this.#governing.set(file, result ?? null);
    return result;
  }

  /**
   * Configurations whose output directory contains `output` (a root-relative path), nearest first: the
   * candidates of the output's directory and its ancestors (above the root too) whose `outDir` (or, for
   * declaration outputs, `declarationDir`) contains it.
   */
  outputConfigs(output: string): Array<{ config: ProjectConfig; outputDirectory: string }> {
    const declaration = /\.d\.[mc]?ts$/.test(output);
    const result: Array<{ config: ProjectConfig; outputDirectory: string }> = [];
    for (const directory of this.#searchDirectories(output)) {
      for (const config of this.candidates(directory)) {
        const outputDirectories = declaration
          ? [config.declarationDir, config.outDir]
          : [config.outDir];
        for (const outputDirectory of outputDirectories) {
          if (outputDirectory === undefined || outputDirectory === output) continue;
          if (isWithin(output, outputDirectory)) result.push({ config, outputDirectory });
        }
      }
    }
    return result;
  }

  /**
   * Root directories a configuration's outputs may be relative to: `rootDir` when set; the configuration
   * directory for `composite` projects; otherwise the common directory of its emitting inputs (TypeScript
   * 5.x) followed by the configuration directory (TypeScript 6.0's default).
   */
  rootDirectories(config: ProjectConfig): string[] {
    if (config.rootDir !== undefined) return [config.rootDir];
    if (config.composite) return [config.directory];
    const common = this.#commonSourceDirectory(config);
    return common === undefined || common === config.directory
      ? [config.directory]
      : [common, config.directory];
  }

  #commonSourceDirectory(config: ProjectConfig): string | undefined {
    const cached = this.#commonSourceDirectories.get(config.path);
    if (cached !== undefined) return cached ?? undefined;
    const inputs = new Set<string>();
    const consider = (file: string): void => {
      if (isEmittingInput(file, config.allowJs) && this.selects(config, file)) inputs.add(file);
    };
    for (const matchPath of config.files) {
      const file = this.locator.rootPathOfMatchPath(matchPath);
      if (file !== undefined && this.snapshot.hasFile(file)) consider(file);
    }
    for (const base of new Set(config.includeBases)) {
      const directory = this.locator.rootDirectoryOfMatchPath(base);
      if (directory === undefined) continue;
      for (const file of this.snapshot.filesUnder(directory)) consider(file);
    }
    let common: string | undefined;
    for (const file of inputs) {
      let directory = parentPath(file);
      if (common === undefined) {
        common = directory;
        continue;
      }
      while (!isWithin(common, directory)) directory = parentPath(directory);
      common = directory;
    }
    this.#commonSourceDirectories.set(config.path, common ?? null);
    return common;
  }
}
