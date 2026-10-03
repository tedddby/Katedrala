/**
 * TypeScript and JavaScript project configuration (`tsconfig*.json`, `jsconfig.json`): reading, `extends`
 * chains and effective options, following TypeScript 6.0's semantics without a file system:
 *
 * - `extends` is a string or an array (later entries override earlier ones; the configuration itself
 *   overrides all). Relative targets (`./`, `../`) are tried as written, then with `.json` appended. Targets
 *   above the analysis root are read through `ProjectContext.readAncestorText` when the root's position
 *   below the version-control top level is known. Bare targets name packages in `node_modules`: a
 *   workspace package of that name (which is what `node_modules` links to) is searched as TypeScript does
 *   (see {@link packageConfigTargets}); any other package is never part of a snapshot and is ignored
 *   with one `configuration-warning` (info) per specifier. Missing targets and cycles are
 *   `invalid-project-configuration` warnings. A base with syntax errors is ignored (as TypeScript does); a
 *   configuration with syntax errors is used as far as it could be read.
 * - `compilerOptions` merge option by option (the child wins; `paths` is replaced as a whole). Path-valued
 *   options (`baseUrl`, `rootDir`, `outDir`, `declarationDir`) are relative to the configuration that
 *   declares them; `paths` substitutions are relative to `baseUrl`, else to the configuration declaring
 *   `paths`; `${configDir}` denotes the directory of the configuration being evaluated.
 * - `include`, `exclude` and `files` are inherited when the configuration does not set them, relative to
 *   the configuration that declares them. Without `files` and `include`, `include` is `["**\/*"]`; without
 *   `exclude`, the output directories (`outDir`, `declarationDir`) are excluded, and wildcards never match
 *   `node_modules`, `bower_components` or `jspm_packages`.
 * - `references` (a directory means its `tsconfig.json`) are not inherited; referenced projects are read
 *   too, and missing ones are `invalid-project-configuration` warnings.
 * - When a subdirectory of a repository is analyzed, the `tsconfig.json` and `jsconfig.json` of every
 *   directory above the root (up to the version-control top level) are read as well: TypeScript's upward
 *   search finds them for files that no configuration inside the root selects. The `references` of
 *   configurations above the root are followed only where they lead back into the root (the other
 *   referenced projects are siblings of the analyzed directory).
 *
 * Problems are reported once, at the configuration that declares the offending setting.
 */
import { baseName, compareStrings } from "@katedrala/ir";
import type { DiagnosticCollector } from "./diagnostics.js";
import { exportsMap, matchSubpath } from "./exports-field.js";
import {
  invalidWildcardSpecMessage,
  wildcardBaseDirectory,
  wildcardRegExp,
  type WildcardUsage,
} from "./globs.js";
import { isJsonObject, parseConfigJson } from "./json.js";
import type { JsonObject, TextProblem } from "./json.js";
import { isInsideRoot, joinLoose } from "./locations.js";
import type { Locator } from "./locations.js";
import { isInNodeModules } from "./manifests.js";
import type { Manifest } from "./manifests.js";
import type { PackageIndex } from "./packages.js";
import type { SnapshotIndex } from "./snapshot.js";
import { parsePackageSpecifier } from "./specifiers.js";

/** Reads configuration text from the snapshot and from above the analysis root. */
export interface ConfigurationFileReader {
  /** Text of a snapshot file; undefined when unreadable. */
  readFile(path: string): Promise<string | undefined>;
  /** Text of a file relative to the version-control top level; undefined when absent. */
  readAncestor(pathFromTopLevel: string): Promise<string | undefined>;
}

/** One substitution of a `paths` entry, resolved against its base directory. */
export interface PathsSubstitution {
  /** Canonical loose directory the template is relative to. */
  base: string;
  /** The substitution as written (`*` is replaced by the matched text). */
  template: string;
}

/** One key of `compilerOptions.paths`. */
export interface PathsEntry {
  key: string;
  /** Text before `*` (the whole key for exact keys). */
  prefix: string;
  /** Text after `*` ("" for exact keys). */
  suffix: string;
  /** Whether the key contains `*`. */
  wildcard: boolean;
  substitutions: PathsSubstitution[];
}

/** The effective `paths` of a configuration. */
export interface PathsMapping {
  /** Where `paths` was declared (shown in messages). */
  declaredIn: string;
  /** Entries in declaration order. */
  entries: PathsEntry[];
}

/** The effective configuration of one `tsconfig.json` / `jsconfig.json`. */
export interface ProjectConfig {
  /** Canonical loose path of the configuration file. */
  readonly path: string;
  /** Canonical loose directory of the configuration file. */
  readonly directory: string;
  /** The path as shown in messages (`<top-level>/...` above the analysis root). */
  readonly display: string;
  /** Canonical loose `baseUrl`. */
  readonly baseUrl?: string;
  readonly paths?: PathsMapping;
  /** Canonical loose `rootDir`. */
  readonly rootDir?: string;
  /** Canonical loose `outDir`. */
  readonly outDir?: string;
  /** Canonical loose `declarationDir`. */
  readonly declarationDir?: string;
  readonly composite: boolean;
  readonly allowJs: boolean;
  /** `files` entries in match coordinates (see {@link Locator.matchPath}). */
  readonly files: ReadonlySet<string>;
  /** `include` over `/`-prefixed match-coordinate paths. */
  readonly include?: RegExp;
  /** `exclude` over `/`-prefixed match-coordinate paths. */
  readonly exclude?: RegExp;
  /** Directories (match coordinates) below which every `include` match lies. */
  readonly includeBases: readonly string[];
  /** Canonical loose paths of referenced configuration files, in order. */
  readonly references: readonly string[];
  /** A solution-style configuration: it selects no file itself (`"files": []`) and has references. */
  readonly solution: boolean;
}

/** The result of loading every project configuration of a snapshot. */
export interface LoadedConfigs {
  /** Effective configurations by canonical loose path, for every readable configuration. */
  readonly configs: ReadonlyMap<string, ProjectConfig>;
  /**
   * Configurations that may govern files, sorted: the snapshot's `tsconfig*.json` / `jsconfig.json` files
   * and the `tsconfig.json` / `jsconfig.json` files found in the directories above a subdirectory root.
   */
  readonly candidates: readonly string[];
}

const CONFIG_DIR_TEMPLATE = "${configDir}";

/** Names TypeScript's upward search looks for in each directory. */
const SEARCHED_CONFIG_NAMES = ["tsconfig.json", "jsconfig.json"] as const;

/**
 * The conditions TypeScript matches in a package's `exports` when it looks up an `extends` target (in key
 * order; observed with TypeScript 6.0).
 */
const EXTENDS_CONDITIONS: ReadonlySet<string> = new Set(["node", "require", "types", "default"]);

/** Whether a snapshot path is a project configuration file (`tsconfig*.json`, `jsconfig.json`). */
export function isProjectConfigPath(path: string): boolean {
  const name = baseName(path);
  return (/^tsconfig.*\.json$/.test(name) || name === "jsconfig.json") && !isInNodeModules(path);
}

function isRooted(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:\//.test(path);
}

/** The part of a `${configDir}`-prefixed value after the template, as a relative path (`./rest`). */
function afterConfigDir(value: string): string {
  return `./${value.slice(CONFIG_DIR_TEMPLATE.length).replace(/^\/+/, "")}`;
}

function startsWithConfigDir(value: string): boolean {
  return (
    value.slice(0, CONFIG_DIR_TEMPLATE.length).toLowerCase() === CONFIG_DIR_TEMPLATE.toLowerCase()
  );
}

function stringsOf(value: readonly unknown[]): string[] {
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * Where TypeScript looks for an `extends` target inside a package (here: the workspace package that
 * `node_modules/<name>` links to), as canonical loose paths in order. With `exports`: the targets of the
 * matching subpath (conditions `node`, `require`, `types` and `default`, in key order); an unexported
 * subpath has none. Without `exports`: for the package itself, its `tsconfig` field, then `tsconfig.json`;
 * for a subpath, the file as written, with `.json` appended, then the directory's `tsconfig.json`.
 *
 * @param subpath - `.` or `./<rest>` (see `parsePackageSpecifier`).
 */
export function packageConfigTargets(
  manifest: Manifest,
  subpath: string,
  locator: Locator,
): string[] {
  const relative: string[] = [];
  const exports = exportsMap(manifest.json.exports);
  if (exports !== undefined) {
    const match = matchSubpath(exports, subpath, EXTENDS_CONDITIONS);
    for (const target of match?.targets ?? []) if (target.startsWith("./")) relative.push(target);
  } else if (subpath === ".") {
    const field = manifest.json.tsconfig;
    if (typeof field === "string" && field !== "" && !isRooted(field.replace(/\\/g, "/"))) {
      relative.push(field.replace(/\\/g, "/"));
    }
    relative.push("tsconfig.json");
  } else {
    relative.push(subpath);
    if (!subpath.endsWith(".json")) relative.push(`${subpath}.json`);
    relative.push(`${subpath}/tsconfig.json`);
  }
  const targets: string[] = [];
  for (const path of relative) {
    const target = locator.resolve(manifest.directory, path);
    if (target !== undefined && !targets.includes(target)) targets.push(target);
  }
  return targets;
}

interface ConfigSource {
  path: string;
  directory: string;
  display: string;
  json: JsonObject;
  problem?: TextProblem;
}

type ExtendsLink =
  | { kind: "file"; target: string }
  | { kind: "package"; specifier: string }
  | { kind: "missing"; message: string };

interface ConfigNode {
  source: ConfigSource;
  links: ExtendsLink[];
  references: string[];
}

interface OptionValue<T> {
  value: T;
  /** Directory of the declaring configuration. */
  base: string;
}

/** Where an inherited setting was declared, for messages about it. */
interface Declaration {
  /** Loose path of the declaring configuration. */
  declaredAt: string;
  /** The declaring configuration as shown in messages. */
  declaredIn: string;
}

interface SpecList extends Declaration {
  specs: readonly unknown[];
  /** Directory the specifications are relative to. */
  base: string;
}

interface MergedOptions {
  baseUrl?: OptionValue<string>;
  paths?: OptionValue<JsonObject> & Declaration;
  rootDir?: OptionValue<string>;
  outDir?: OptionValue<string>;
  declarationDir?: OptionValue<string>;
  composite?: boolean;
  allowJs?: boolean;
}

interface MergedConfig {
  options: MergedOptions;
  include?: SpecList;
  exclude?: SpecList;
  files?: SpecList;
}

const SPEC_PROPERTIES = ["include", "exclude", "files"] as const;

/** Loads, links and evaluates the project configurations of one snapshot. */
class ConfigLoader {
  readonly #sources = new Map<string, Promise<ConfigSource | undefined>>();
  readonly #nodes = new Map<string, ConfigNode | undefined>();
  readonly #packageExtends = new Map<string, string[]>();

  constructor(
    private readonly reader: ConfigurationFileReader,
    private readonly snapshot: SnapshotIndex,
    private readonly locator: Locator,
    private readonly diagnostics: DiagnosticCollector,
    private readonly packages: PackageIndex | undefined,
  ) {}

  /** Read and parse one configuration file (memoized). */
  #load(path: string): Promise<ConfigSource | undefined> {
    let pending = this.#sources.get(path);
    if (pending === undefined) {
      pending = this.#read(path);
      this.#sources.set(path, pending);
    }
    return pending;
  }

  async #read(path: string): Promise<ConfigSource | undefined> {
    const display = this.locator.display(path);
    let text: string | undefined;
    if (isInsideRoot(path)) {
      if (!this.snapshot.hasFile(path)) return undefined;
      text = await this.reader.readFile(path);
      if (text === undefined) {
        this.diagnostics.addForFile(
          "invalid-project-configuration",
          "warning",
          `${display} could not be read`,
          path,
        );
        return undefined;
      }
    } else {
      const topLevel = this.locator.topLevelPath(path);
      if (topLevel === undefined) return undefined;
      text = await this.reader.readAncestor(topLevel);
      if (text === undefined) return undefined;
    }
    const parsed = parseConfigJson(text, display);
    const directory = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const source: ConfigSource = { path, directory, display, json: parsed.value };
    if (parsed.problem !== undefined) {
      source.problem = parsed.problem;
      this.diagnostics.addForFile(
        "invalid-project-configuration",
        "warning",
        `Invalid ${display}: ${parsed.problem.message}`,
        path,
        parsed.problem,
      );
    }
    return source;
  }

  async #exists(path: string): Promise<boolean> {
    if (isInsideRoot(path)) return this.snapshot.hasFile(path);
    return (await this.#load(path)) !== undefined;
  }

  async #resolveExtends(source: ConfigSource, specifier: string): Promise<ExtendsLink> {
    const spec = specifier.replace(/\\/g, "/");
    if (spec === "") {
      return {
        kind: "missing",
        message: `"extends" of ${source.display} must not be an empty string`,
      };
    }
    if (isRooted(spec)) {
      return {
        kind: "missing",
        message: `"extends" target "${specifier}" of ${source.display} is an absolute path, which cannot be read`,
      };
    }
    if (!spec.startsWith("./") && !spec.startsWith("../")) {
      return this.#resolvePackageExtends(source, specifier, spec);
    }
    const candidate = this.locator.resolve(source.directory, spec);
    if (candidate !== undefined) {
      if (await this.#exists(candidate)) return { kind: "file", target: candidate };
      if (!candidate.endsWith(".json") && (await this.#exists(`${candidate}.json`))) {
        return { kind: "file", target: `${candidate}.json` };
      }
    }
    const outside =
      candidate === undefined ||
      (!isInsideRoot(candidate) && this.locator.subdirectory === undefined);
    return {
      kind: "missing",
      message: outside
        ? `"extends" target "${specifier}" of ${source.display} lies outside the analysis root and cannot be read`
        : `"extends" target "${specifier}" of ${source.display} was not found`,
    };
  }

  /** A bare `extends` target: a file of the workspace package of that name, else an ignored package. */
  async #resolvePackageExtends(
    source: ConfigSource,
    specifier: string,
    spec: string,
  ): Promise<ExtendsLink> {
    const parsed = parsePackageSpecifier(spec);
    // Workspace packages lie inside the root; a configuration above it looks them up from the root.
    const from = isInsideRoot(source.path) ? source.path : "";
    const manifest =
      parsed === undefined ? undefined : this.packages?.lookup(parsed.packageName, from);
    if (parsed === undefined || manifest === undefined) return { kind: "package", specifier };
    for (const target of packageConfigTargets(manifest, parsed.subpath, this.locator)) {
      if (await this.#exists(target)) return { kind: "file", target };
    }
    return {
      kind: "missing",
      message: `"extends" target "${specifier}" of ${source.display} was not found in workspace package ${parsed.packageName} (${manifest.path})`,
    };
  }

  async #links(source: ConfigSource): Promise<ExtendsLink[]> {
    const value = source.json.extends;
    if (value === undefined || value === null) return [];
    const specifiers: unknown[] =
      typeof value === "string" ? [value] : Array.isArray(value) ? value : [value];
    const links: ExtendsLink[] = [];
    for (const specifier of specifiers) {
      if (typeof specifier !== "string") {
        links.push({
          kind: "missing",
          message: `"extends" of ${source.display} must be a string or an array of strings`,
        });
        continue;
      }
      links.push(await this.#resolveExtends(source, specifier));
    }
    return links;
  }

  #references(source: ConfigSource): string[] {
    const value = source.json.references;
    if (value === undefined || value === null) return [];
    const invalid = (): void => {
      this.diagnostics.addForFile(
        "invalid-project-configuration",
        "warning",
        `"references" of ${source.display} must be an array of objects with a string "path"`,
        source.path,
      );
    };
    if (!Array.isArray(value)) {
      invalid();
      return [];
    }
    const references: string[] = [];
    for (const reference of value) {
      if (!isJsonObject(reference) || typeof reference.path !== "string") {
        invalid();
        continue;
      }
      const path = reference.path.replace(/\\/g, "/");
      if (isRooted(path)) continue;
      const target = this.locator.resolve(source.directory, path);
      if (target === undefined) continue;
      references.push(
        target.endsWith(".json")
          ? target
          : (this.locator.resolve(target, "tsconfig.json") ?? target),
      );
    }
    return references;
  }

  /** Load the given configurations and, transitively, everything they extend or reference. */
  async loadClosure(initial: readonly string[]): Promise<void> {
    let frontier = [...new Set(initial)].sort(compareStrings);
    while (frontier.length > 0) {
      const sources = await Promise.all(frontier.map((path) => this.#load(path)));
      const next: string[] = [];
      for (const [index, path] of frontier.entries()) {
        const source = sources[index];
        if (source === undefined) {
          this.#nodes.set(path, undefined);
          continue;
        }
        const links = await this.#links(source);
        const references = this.#references(source);
        this.#nodes.set(path, { source, links, references });
        for (const link of links) if (link.kind === "file") next.push(link.target);
        // A configuration above the root (a repository's solution-style `tsconfig.json`) references the
        // sibling projects of the analyzed directory, which select none of its files: only references
        // that lead back into the root are followed.
        next.push(
          ...(isInsideRoot(path)
            ? references
            : references.filter((reference) => isInsideRoot(reference))),
        );
      }
      frontier = [...new Set(next)].filter((path) => !this.#nodes.has(path)).sort(compareStrings);
    }
  }

  #reportCycle(cycle: readonly string[]): void {
    // Rotate the cycle to start at its smallest member, so that every entry point reports the same text.
    const members = cycle.slice(0, -1);
    let start = 0;
    for (const [index, member] of members.entries()) {
      if (compareStrings(member, members[start] ?? member) < 0) start = index;
    }
    const rotated = [...members.slice(start), ...members.slice(0, start)];
    const first = rotated[0] ?? "";
    const text = [...rotated, first].map((path) => this.locator.display(path)).join(" -> ");
    this.diagnostics.addForFile(
      "invalid-project-configuration",
      "warning",
      `Circular "extends" chain: ${text}`,
      first,
    );
  }

  #ownOptions(source: ConfigSource): MergedOptions {
    const options: MergedOptions = {};
    if (baseName(source.path) === "jsconfig.json") options.allowJs = true;
    const compilerOptions = source.json.compilerOptions;
    if (compilerOptions === undefined || compilerOptions === null) return options;
    if (!isJsonObject(compilerOptions)) {
      this.diagnostics.addForFile(
        "invalid-project-configuration",
        "warning",
        `"compilerOptions" of ${source.display} must be an object`,
        source.path,
      );
      return options;
    }
    const base = source.directory;
    const pathOption = (name: string): OptionValue<string> | undefined => {
      const value = compilerOptions[name];
      return typeof value === "string" ? { value, base } : undefined;
    };
    const baseUrl = pathOption("baseUrl");
    if (baseUrl !== undefined) options.baseUrl = baseUrl;
    const rootDir = pathOption("rootDir");
    if (rootDir !== undefined) options.rootDir = rootDir;
    const outDir = pathOption("outDir");
    if (outDir !== undefined) options.outDir = outDir;
    const declarationDir = pathOption("declarationDir");
    if (declarationDir !== undefined) options.declarationDir = declarationDir;
    if (typeof compilerOptions.composite === "boolean")
      options.composite = compilerOptions.composite;
    if (typeof compilerOptions.allowJs === "boolean") options.allowJs = compilerOptions.allowJs;
    const paths = compilerOptions.paths;
    if (isJsonObject(paths)) {
      options.paths = { value: paths, base, declaredAt: source.path, declaredIn: source.display };
    } else if (paths !== undefined && paths !== null) {
      this.diagnostics.addForFile(
        "invalid-project-configuration",
        "warning",
        `"paths" of ${source.display} must be an object`,
        source.path,
      );
    }
    return options;
  }

  #merge(path: string, stack: readonly string[]): MergedConfig | undefined {
    const node = this.#nodes.get(path);
    if (node === undefined) return undefined;
    if (stack.includes(path)) {
      this.#reportCycle([...stack.slice(stack.indexOf(path)), path]);
      return undefined;
    }
    const own = node.source.json;
    const result: MergedConfig = { options: {} };
    for (const link of node.links) {
      if (link.kind === "missing") {
        this.diagnostics.addForFile("invalid-project-configuration", "warning", link.message, path);
        continue;
      }
      if (link.kind === "package") {
        const referrers = this.#packageExtends.get(link.specifier) ?? [];
        referrers.push(path);
        this.#packageExtends.set(link.specifier, referrers);
        continue;
      }
      const baseNode = this.#nodes.get(link.target);
      if (baseNode === undefined || baseNode.source.problem !== undefined) continue;
      const base = this.#merge(link.target, [...stack, path]);
      if (base === undefined) continue;
      for (const property of SPEC_PROPERTIES) {
        const inherited = base[property];
        if (!own[property] && inherited !== undefined) result[property] = inherited;
      }
      Object.assign(result.options, base.options);
    }
    Object.assign(result.options, this.#ownOptions(node.source));
    for (const property of SPEC_PROPERTIES) {
      const value = own[property];
      if (Array.isArray(value)) {
        result[property] = {
          specs: value as readonly unknown[],
          base: node.source.directory,
          declaredAt: path,
          declaredIn: node.source.display,
        };
      } else if (value !== undefined && value !== null) {
        this.diagnostics.addForFile(
          "invalid-project-configuration",
          "warning",
          `"${property}" of ${node.source.display} must be an array of strings`,
          path,
        );
      }
    }
    return result;
  }

  /** Resolve a path-valued option; undefined for absolute paths and paths above the top level. */
  #resolvePathValue(value: string, base: string, configDirectory: string): string | undefined {
    const normalized = value.replace(/\\/g, "/");
    if (startsWithConfigDir(normalized)) {
      return this.locator.resolve(configDirectory, afterConfigDir(normalized));
    }
    if (isRooted(normalized)) return undefined;
    return this.locator.resolve(base, normalized);
  }

  #paths(
    merged: MergedConfig,
    baseUrl: string | undefined,
    source: ConfigSource,
  ): PathsMapping | undefined {
    const option = merged.options.paths;
    if (option === undefined) return undefined;
    const pathsBase = baseUrl ?? option.base;
    const entries: PathsEntry[] = [];
    for (const [key, value] of Object.entries(option.value)) {
      if (!Array.isArray(value)) {
        this.diagnostics.addForFile(
          "invalid-project-configuration",
          "warning",
          `Substitutions for pattern "${key}" in "paths" of ${option.declaredIn} must be an array of strings`,
          option.declaredAt,
        );
        continue;
      }
      const star = key.indexOf("*");
      if (star !== key.lastIndexOf("*")) {
        this.diagnostics.addForFile(
          "invalid-project-configuration",
          "warning",
          `Pattern "${key}" in "paths" of ${option.declaredIn} can have at most one "*" character`,
          option.declaredAt,
        );
        continue;
      }
      const substitutions: PathsSubstitution[] = [];
      for (const raw of stringsOf(value as readonly unknown[])) {
        const template = raw.replace(/\\/g, "/");
        if (startsWithConfigDir(template)) {
          substitutions.push({
            base: source.directory,
            template: afterConfigDir(template),
          });
        } else if (!isRooted(template)) {
          substitutions.push({ base: pathsBase, template });
        }
      }
      entries.push(
        star === -1
          ? { key, prefix: key, suffix: "", wildcard: false, substitutions }
          : {
              key,
              prefix: key.slice(0, star),
              suffix: key.slice(star + 1),
              wildcard: true,
              substitutions,
            },
      );
    }
    return { declaredIn: option.declaredIn, entries };
  }

  /** Resolve wildcard specifications to match coordinates (invalid ones are reported and skipped). */
  #specPaths(list: SpecList, usage: WildcardUsage, source: ConfigSource): string[] {
    const result: string[] = [];
    for (const spec of list.specs) {
      if (typeof spec !== "string") continue;
      const message = invalidWildcardSpecMessage(spec, usage);
      if (message !== undefined) {
        this.diagnostics.addForFile(
          "invalid-project-configuration",
          "warning",
          `${message} (in ${list.declaredIn})`,
          list.declaredAt,
        );
        continue;
      }
      const matchPath = this.#matchPathOf(spec, list.base, source.directory);
      if (matchPath !== undefined) result.push(matchPath);
    }
    return result;
  }

  #matchPathOf(spec: string, base: string, configDirectory: string): string | undefined {
    let path = spec.replace(/\\/g, "/");
    let directory = base;
    if (startsWithConfigDir(path)) {
      path = afterConfigDir(path);
      directory = configDirectory;
    }
    if (isRooted(path)) return undefined;
    return this.locator.matchPath(joinLoose(directory, path));
  }

  #finalize(path: string): ProjectConfig | undefined {
    const node = this.#nodes.get(path);
    if (node === undefined) return undefined;
    const merged = this.#merge(path, []);
    if (merged === undefined) return undefined;
    const { source } = node;
    const directory = source.directory;
    const pathOption = (option: OptionValue<string> | undefined): string | undefined =>
      option === undefined
        ? undefined
        : this.#resolvePathValue(option.value, option.base, directory);
    const baseUrl = pathOption(merged.options.baseUrl);
    const paths = this.#paths(merged, baseUrl, source);
    const rootDir = pathOption(merged.options.rootDir);
    const outDir = pathOption(merged.options.outDir);
    const declarationDir = pathOption(merged.options.declarationDir);

    const files = new Set<string>();
    for (const spec of merged.files?.specs ?? []) {
      if (typeof spec !== "string") continue;
      const matchPath = this.#matchPathOf(spec, merged.files?.base ?? directory, directory);
      if (matchPath !== undefined) files.add(matchPath);
    }
    const includeList: SpecList | undefined =
      merged.include ??
      (merged.files === undefined
        ? { specs: ["**/*"], base: directory, declaredAt: path, declaredIn: source.display }
        : undefined);
    const includePaths =
      includeList === undefined ? [] : this.#specPaths(includeList, "files", source);
    let excludePaths: string[];
    if (merged.exclude !== undefined) {
      excludePaths = this.#specPaths(merged.exclude, "exclude", source);
    } else {
      excludePaths = [outDir, declarationDir]
        .filter((output): output is string => output !== undefined)
        .map((output) => this.locator.matchPath(output))
        .filter((output): output is string => output !== undefined);
    }
    const include = wildcardRegExp(includePaths, "files");
    const exclude = wildcardRegExp(excludePaths, "exclude");

    const fileCount = merged.files?.specs.length ?? 0;
    const selectsNothing =
      fileCount === 0 &&
      (merged.include === undefined
        ? merged.files !== undefined
        : merged.include.specs.length === 0);

    const config: {
      -readonly [K in keyof ProjectConfig]: ProjectConfig[K];
    } = {
      path,
      directory,
      display: source.display,
      composite: merged.options.composite ?? false,
      allowJs: merged.options.allowJs ?? false,
      files,
      includeBases: includePaths.map(wildcardBaseDirectory),
      references: node.references,
      solution: node.references.length > 0 && selectsNothing,
    };
    if (baseUrl !== undefined) config.baseUrl = baseUrl;
    if (paths !== undefined) config.paths = paths;
    if (rootDir !== undefined) config.rootDir = rootDir;
    if (outDir !== undefined) config.outDir = outDir;
    if (declarationDir !== undefined) config.declarationDir = declarationDir;
    if (include !== undefined) config.include = include;
    if (exclude !== undefined) config.exclude = exclude;
    return config;
  }

  /** Evaluate every loaded configuration and report what was collected along the way. */
  finalizeAll(): Map<string, ProjectConfig> {
    const configs = new Map<string, ProjectConfig>();
    for (const path of [...this.#nodes.keys()].sort(compareStrings)) {
      const config = this.#finalize(path);
      if (config === undefined) continue;
      configs.set(path, config);
      for (const reference of config.references) {
        // Present, or deliberately not followed (see `loadClosure`).
        if (this.#nodes.get(reference) !== undefined || !this.#nodes.has(reference)) continue;
        this.diagnostics.addForFile(
          "invalid-project-configuration",
          "warning",
          `Referenced project ${this.locator.display(reference)} of ${config.display} was not found`,
          path,
        );
      }
    }
    for (const [specifier, referrers] of this.#packageExtends) {
      const first = [...referrers].sort(compareStrings)[0];
      this.diagnostics.addForFile(
        "configuration-warning",
        "info",
        `"extends": "${specifier}" names a package in node_modules, which is not part of the snapshot; its settings are ignored`,
        first,
      );
    }
    return configs;
  }
}

/**
 * Read every `tsconfig*.json` and `jsconfig.json` of the snapshot (outside `node_modules`), the
 * `tsconfig.json` and `jsconfig.json` of the directories above a subdirectory root (see
 * {@link Locator.ancestorDirectories}), and the configurations they extend or reference, and evaluate
 * their effective settings.
 *
 * @param packages - the snapshot's packages, for `extends` targets that name a workspace package; without
 *   it every bare `extends` target is ignored.
 */
export async function loadProjectConfigs(
  reader: ConfigurationFileReader,
  snapshot: SnapshotIndex,
  locator: Locator,
  diagnostics: DiagnosticCollector,
  packages?: PackageIndex,
): Promise<LoadedConfigs> {
  const inRoot = snapshot.paths.filter(isProjectConfigPath);
  const above = locator
    .ancestorDirectories()
    .flatMap((directory) => SEARCHED_CONFIG_NAMES.map((name) => joinLoose(directory, name)));
  const loader = new ConfigLoader(reader, snapshot, locator, diagnostics, packages);
  await loader.loadClosure([...inRoot, ...above]);
  const configs = loader.finalizeAll();
  const candidates = [...inRoot, ...above.filter((path) => configs.has(path))].sort(compareStrings);
  return { configs, candidates };
}
