/**
 * Module resolution for TypeScript and JavaScript, against the snapshot's file list only.
 *
 * Order, for a specifier written in `fromFile`:
 * 1. `node:<name>` always denotes the Node.js built-in `<name>` (see {@link nodeBuiltinOf}).
 * 2. Relative specifiers (`./`, `../`, `.`, `..`): resolved against the importing file's directory and
 *    probed ({@link probeModulePath}); a `?query` or `#fragment` suffix is ignored when the full name does
 *    not exist. Absolute paths and URLs never resolve.
 * 3. `#imports`: the `imports` field of the nearest `package.json` (subpath patterns and conditions as for
 *    `exports`; relative targets mapped to sources, bare targets resolved as packages). When `imports`
 *    does not resolve the specifier, `paths` and `baseUrl` (steps 4 and 5) are tried, since TypeScript
 *    consults them first and `#/*` aliases occur in tsconfig files.
 * 4. `paths` of the governing tsconfig: an exact key, else the matching pattern with the longest prefix;
 *    each substitution in order. A substitution into `node_modules` denotes the package installed there:
 *    a workspace package of that name is probed in its directory like any other substitution; a
 *    third-party package (never part of a snapshot) is the result for a specific pattern, which names it
 *    on purpose, and only a fallback (step 8) for the catch-all pattern `*`, since TypeScript continues
 *    when nothing is installed there. When a pattern matched but no file exists, resolution continues (as
 *    TypeScript continues to `node_modules`) and ends unresolved with the reason unless a later step
 *    resolves the specifier, or the pattern is a catch-all.
 * 5. `baseUrl` of the governing tsconfig, when a file exists there.
 * 6. Node.js built-ins by bare name: one of `NODE_BUILTIN_MODULES` or `NODE_BUILTIN_SUBPATHS` exactly
 *    (`fs`, `fs/promises`; not `process/browser`). They come after `paths` and `baseUrl`, as in TypeScript:
 *    with `baseUrl: "src"`, `events/bus` is `src/events/bus.ts`. They come before packages looked up by
 *    name, as in Node.js: that lookup considers every manifest of the snapshot, and a test fixture whose
 *    `package.json` is named `path` must not capture every `import "path"` of the repository.
 * 7. Workspace packages by name: the longest package name the specifier starts with, then the subpath
 *    through `exports` (conditions by preference, see {@link CONDITION_PREFERENCE}) or, without `exports`,
 *    `source` / `main` / `module` / `types` / `typings` for the package itself, then `src/index.*` and
 *    `index.*`; deep imports are probed inside the package. Targets are mapped from build output to
 *    sources ({@link OutputMapper}).
 * 8. Any other valid package name is an external npm package (`@scope/name` or `name`). When a catch-all
 *    `paths` substitution pointed into `node_modules`, the package installed there is named instead
 *    (`@types/<name>` stands for `<name>`).
 *
 * Extensions are probed as TypeScript does ({@link PROBE_EXTENSIONS}: a `.json` module must be named with
 * its extension), except for `require()` calls in JavaScript files, which also try `.json` before
 * directories, as the Node.js CommonJS loader does ({@link COMMONJS_PROBE_EXTENSIONS}).
 *
 * Triple-slash directives (kind `include`, mechanism `triple-slash-reference`) arrive as written, for
 * `path=` and `types=` alike: the specifier is first tried relative to the importing file (TypeScript
 * resolves `path=` that way even without `./`); a missing file name with a TypeScript/JavaScript extension
 * stays unresolved; anything else follows the rules for bare specifiers (`types="node"` → package `node`).
 */
import { PathOutsideRootError, joinPath, parentPath } from "@katedrala/ir";
import type { ModuleRequest, ModuleResolution } from "@katedrala/plugin-api";
import type { ResolutionMethod } from "@katedrala/ir";
import { nodeBuiltinOf } from "./builtins.js";
import type { ConfigSet } from "./config-set.js";
import { exportsMap, matchSubpath } from "./exports-field.js";
import { isJsonObject } from "./json.js";
import { isInsideRoot, joinLoose } from "./locations.js";
import type { Locator } from "./locations.js";
import { isInNodeModules } from "./manifests.js";
import type { Manifest } from "./manifests.js";
import type { OutputMapper } from "./output-mapping.js";
import type { PackageIndex } from "./packages.js";
import { COMMONJS_PROBE_EXTENSIONS, PROBE_EXTENSIONS, probeFile, probeIndex } from "./probing.js";
import type { SnapshotIndex } from "./snapshot.js";
import {
  installedLocationOf,
  isAbsoluteOrUrlSpecifier,
  isRelativeSpecifier,
  packageNameCandidates,
  parsePackageSpecifier,
  runtimePackageName,
} from "./specifiers.js";
import type { PathsMapping } from "./tsconfig.js";

/** Names of TypeScript/JavaScript files (a triple-slash reference to such a name is a path). */
const CODE_FILE = /\.[cm]?[jt]sx?$/;

/** JavaScript files, whose `require()` calls follow the Node.js CommonJS loader. */
const JAVASCRIPT_FILE = /\.[cm]?jsx?$/;

/** Manifest fields naming a directory's module, in order, for directories with a `package.json`. */
const DIRECTORY_ENTRY_FIELDS = ["types", "typings", "main", "module"] as const;

/** Manifest fields naming a package's own entry module, in order, for packages without `exports`. */
const PACKAGE_ENTRY_FIELDS = ["source", "main", "module", "types", "typings"] as const;

type Outcome = { path: string } | { reason: string };

/** Where a `paths` substitution points: a location the snapshot may contain, or an installed package. */
type PathsTarget = { kind: "path"; path: string } | { kind: "installed"; packageName: string };

interface PathsMatch {
  key: string;
  /** The substitutions of the matching pattern, in order. */
  targets: PathsTarget[];
  /** Whether the pattern is the catch-all `*`. */
  catchAll: boolean;
}

/** What `paths` and `baseUrl` contribute to the resolution of a bare specifier. */
interface ConfiguredResolution {
  /** The resolution, when `paths` or `baseUrl` decided it. */
  resolution?: ModuleResolution;
  /** Why a matching specific `paths` pattern failed, if one did. */
  pathsFailure?: string;
  /** The package a catch-all `paths` substitution found in `node_modules`, as a fallback. */
  installedPackage?: string;
}

function resolved(path: string, method: ResolutionMethod): ModuleResolution {
  return { status: "resolved", paths: [path], method };
}

function unresolved(reason: string): ModuleResolution {
  return { status: "unresolved", reason };
}

function external(packageName: string): ModuleResolution {
  return { status: "external", namespace: "npm", packageName, method: "external-package" };
}

function builtinModule(moduleName: string): ModuleResolution {
  return { status: "builtin", namespace: "node", moduleName };
}

/** The extensions probed for a request (see the module documentation). */
function probeExtensionsFor(request: ModuleRequest): readonly string[] {
  return request.mechanism === "require-call" && JAVASCRIPT_FILE.test(request.fromFile)
    ? COMMONJS_PROBE_EXTENSIONS
    : PROBE_EXTENSIONS;
}

/** Resolves module specifiers against one snapshot. Synchronous, pure and deterministic. */
export class ModuleResolver {
  constructor(
    private readonly snapshot: SnapshotIndex,
    private readonly packages: PackageIndex,
    private readonly configs: ConfigSet,
    private readonly mapper: OutputMapper,
    private readonly locator: Locator,
  ) {}

  /** Resolve one module request (see the module documentation for the order of rules). */
  resolve(request: ModuleRequest): ModuleResolution {
    const { specifier, fromFile } = request;
    if (specifier === "") return unresolved("empty module specifier");
    if (specifier.startsWith("node:")) {
      const builtin = nodeBuiltinOf(specifier);
      return builtin === undefined
        ? unresolved(`${specifier} is not a valid built-in module specifier`)
        : builtinModule(builtin);
    }
    const extensions = probeExtensionsFor(request);
    if (isRelativeSpecifier(specifier)) {
      return this.#resolveRelative(specifier, fromFile, extensions);
    }
    if (isAbsoluteOrUrlSpecifier(specifier)) {
      return unresolved(
        `${specifier} is an absolute path or URL, which never denotes a file of the snapshot`,
      );
    }
    if (specifier.startsWith("#")) {
      const imported = this.#resolvePackageImport(specifier, fromFile, extensions);
      if (imported.status !== "unresolved") return imported;
      // TypeScript consults `paths` before `imports`; `#/*` aliases exist in tsconfig files.
      const configured = this.#resolveConfigured(specifier, fromFile, extensions);
      if (configured.resolution !== undefined) return configured.resolution;
      if (configured.installedPackage !== undefined) return external(configured.installedPackage);
      return configured.pathsFailure === undefined ? imported : unresolved(configured.pathsFailure);
    }
    if (request.kind === "include" && request.mechanism === "triple-slash-reference") {
      // `/// <reference path="x" />` is relative to the file even without `./`; `types="x"` is a package.
      const found = this.#probeRelative(parentPath(fromFile), specifier, extensions);
      if (found !== undefined) return resolved(found, "relative-path");
      if (CODE_FILE.test(specifier)) return unresolved(`no file matches ${specifier}`);
    }
    return this.#resolveBare(specifier, fromFile, extensions);
  }

  /**
   * Probe a root-relative module path: files first, then the directory.
   *
   * @param extensions - extensions to append (default {@link PROBE_EXTENSIONS}).
   */
  probeModulePath(
    candidate: string,
    extensions: readonly string[] = PROBE_EXTENSIONS,
  ): string | undefined {
    return (
      probeFile(this.snapshot, candidate, extensions) ?? this.#probeDirectory(candidate, extensions)
    );
  }

  #probeDirectory(directory: string, extensions: readonly string[]): string | undefined {
    if (!this.snapshot.hasDirectory(directory)) return undefined;
    const manifest = this.packages.manifestAt(directory);
    if (manifest !== undefined) {
      for (const field of DIRECTORY_ENTRY_FIELDS) {
        const source = this.#mapManifestTarget(manifest, manifest.json[field]);
        if (source !== undefined) return source;
      }
    }
    return probeIndex(this.snapshot, directory, extensions);
  }

  #mapManifestTarget(manifest: Manifest, target: unknown): string | undefined {
    if (typeof target !== "string" || target === "") return undefined;
    const declared = this.locator.resolve(manifest.directory, target);
    if (declared === undefined || !isInsideRoot(declared)) return undefined;
    return this.mapper.toSource(declared, manifest.directory);
  }

  #probeRelative(
    directory: string,
    specifier: string,
    extensions: readonly string[],
  ): string | undefined {
    let candidate: string;
    try {
      candidate = joinPath(directory, specifier);
    } catch (error) {
      if (error instanceof PathOutsideRootError) return undefined;
      throw error;
    }
    const directoryOnly = /(?:^|\/)\.{0,2}$/.test(specifier);
    return directoryOnly
      ? this.#probeDirectory(candidate, extensions)
      : this.probeModulePath(candidate, extensions);
  }

  #resolveRelative(
    specifier: string,
    fromFile: string,
    extensions: readonly string[],
  ): ModuleResolution {
    const directory = parentPath(fromFile);
    let escapes = false;
    try {
      joinPath(directory, specifier);
    } catch (error) {
      if (!(error instanceof PathOutsideRootError)) throw error;
      escapes = true;
    }
    if (escapes) return unresolved(`${specifier} points outside the analysis root`);
    const found = this.#probeRelative(directory, specifier, extensions);
    if (found !== undefined) return resolved(found, "relative-path");
    const suffix = /[?#]/.exec(specifier);
    if (suffix !== null && suffix.index > 0) {
      const stripped = this.#probeRelative(directory, specifier.slice(0, suffix.index), extensions);
      if (stripped !== undefined) return resolved(stripped, "relative-path");
    }
    return unresolved(`no file matches ${specifier}`);
  }

  #resolvePackageImport(
    specifier: string,
    fromFile: string,
    extensions: readonly string[],
  ): ModuleResolution {
    const nearest = this.packages.nearest(fromFile);
    if (nearest.status === "none")
      return unresolved(`no package.json declares imports for ${specifier}`);
    if (nearest.status === "invalid") {
      return unresolved(`the package.json governing ${specifier} (${nearest.path}) is not valid`);
    }
    const { manifest } = nearest;
    const imports = manifest.json.imports;
    if (!isJsonObject(imports)) return unresolved(`${manifest.path} declares no "imports"`);
    const match = matchSubpath(imports, specifier);
    if (match === undefined)
      return unresolved(`${specifier} is not defined in the "imports" of ${manifest.path}`);
    for (const target of match.targets) {
      if (target.startsWith("./")) {
        const source = this.#mapManifestTarget(manifest, target);
        if (source !== undefined) return resolved(source, "package-imports");
        continue;
      }
      const builtin = nodeBuiltinOf(target);
      if (builtin !== undefined) return builtinModule(builtin);
      if (target.startsWith("#") || isRelativeSpecifier(target) || isAbsoluteOrUrlSpecifier(target))
        continue;
      const workspace = this.#resolveWorkspacePackage(target, fromFile, extensions);
      if (workspace !== undefined) return workspace;
      const parsed = parsePackageSpecifier(target);
      if (parsed !== undefined) return external(parsed.packageName);
    }
    return unresolved(
      `no file matches the target of ${specifier} in the "imports" of ${manifest.path}`,
    );
  }

  /** Where a substituted `paths` location points (undefined: nowhere the analysis can see). */
  #pathsTarget(location: string, fromFile: string): PathsTarget | undefined {
    if (!isInNodeModules(location)) {
      return isInsideRoot(location) ? { kind: "path", path: location } : undefined;
    }
    const installed = installedLocationOf(location);
    if (installed === undefined) return undefined;
    // In a workspace, `node_modules/<name>` links to the workspace package of that name.
    const manifest = this.packages.lookup(installed.packageName, fromFile);
    if (manifest !== undefined) {
      return { kind: "path", path: joinLoose(manifest.directory, installed.path) };
    }
    return { kind: "installed", packageName: runtimePackageName(installed.packageName) };
  }

  #matchPaths(paths: PathsMapping, specifier: string, fromFile: string): PathsMatch | undefined {
    let best: (typeof paths.entries)[number] | undefined;
    for (const entry of paths.entries) {
      if (!entry.wildcard) {
        if (entry.key === specifier) {
          best = entry;
          break;
        }
        continue;
      }
      const matches =
        specifier.length >= entry.prefix.length + entry.suffix.length &&
        specifier.startsWith(entry.prefix) &&
        specifier.endsWith(entry.suffix);
      if (matches && (best === undefined || entry.prefix.length > best.prefix.length)) best = entry;
    }
    if (best === undefined) return undefined;
    const matched = best.wildcard
      ? specifier.slice(best.prefix.length, specifier.length - best.suffix.length)
      : undefined;
    const targets: PathsTarget[] = [];
    for (const substitution of best.substitutions) {
      const star = substitution.template.indexOf("*");
      const template =
        matched === undefined || star === -1
          ? substitution.template
          : substitution.template.slice(0, star) + matched + substitution.template.slice(star + 1);
      const location = this.locator.resolve(substitution.base, template);
      const target = location === undefined ? undefined : this.#pathsTarget(location, fromFile);
      if (target !== undefined) targets.push(target);
    }
    return { key: best.key, targets, catchAll: best.wildcard && best.prefix === "" };
  }

  /**
   * `paths`, then `baseUrl` of the configuration governing `fromFile` (see steps 4 and 5 of the module
   * documentation).
   */
  #resolveConfigured(
    specifier: string,
    fromFile: string,
    extensions: readonly string[],
  ): ConfiguredResolution {
    const config = this.configs.governing(fromFile);
    let pathsFailure: string | undefined;
    let installedPackage: string | undefined;
    if (config?.paths !== undefined) {
      const match = this.#matchPaths(config.paths, specifier, fromFile);
      if (match !== undefined) {
        for (const target of match.targets) {
          if (target.kind === "installed") {
            // A specific pattern names the installed package on purpose; for the catch-all pattern,
            // TypeScript moves on when nothing is installed there, which only a file system could tell.
            if (!match.catchAll) return { resolution: external(target.packageName) };
            installedPackage ??= target.packageName;
            continue;
          }
          const found = this.probeModulePath(target.path, extensions);
          if (found !== undefined) return { resolution: resolved(found, "tsconfig-paths") };
        }
        if (!match.catchAll) {
          pathsFailure = `${specifier} matches "${match.key}" in the "paths" of ${config.paths.declaredIn}, but no file exists there`;
        }
      }
    }
    if (config?.baseUrl !== undefined) {
      const candidate = this.locator.resolve(config.baseUrl, specifier);
      if (candidate !== undefined && isInsideRoot(candidate)) {
        const found = this.probeModulePath(candidate, extensions);
        if (found !== undefined) return { resolution: resolved(found, "base-url") };
      }
    }
    const result: ConfiguredResolution = {};
    if (pathsFailure !== undefined) result.pathsFailure = pathsFailure;
    if (installedPackage !== undefined) result.installedPackage = installedPackage;
    return result;
  }

  #resolveBare(
    specifier: string,
    fromFile: string,
    extensions: readonly string[],
  ): ModuleResolution {
    const configured = this.#resolveConfigured(specifier, fromFile, extensions);
    if (configured.resolution !== undefined) return configured.resolution;
    const builtin = nodeBuiltinOf(specifier);
    if (builtin !== undefined) return builtinModule(builtin);
    const workspace = this.#resolveWorkspacePackage(specifier, fromFile, extensions);
    if (workspace !== undefined) return workspace;
    if (configured.pathsFailure !== undefined) return unresolved(configured.pathsFailure);
    if (configured.installedPackage !== undefined) return external(configured.installedPackage);
    const parsed = parsePackageSpecifier(specifier);
    if (parsed === undefined) return unresolved(`${specifier} is not a valid package name`);
    return external(parsed.packageName);
  }

  #resolveWorkspacePackage(
    specifier: string,
    fromFile: string,
    extensions: readonly string[],
  ): ModuleResolution | undefined {
    for (const { packageName, subpath } of packageNameCandidates(specifier)) {
      const manifest = this.packages.lookup(packageName, fromFile);
      if (manifest === undefined) continue;
      const method: ResolutionMethod =
        this.packages.owner(fromFile) === manifest ? "package-self-reference" : "workspace-package";
      const outcome = this.#resolvePackageSubpath(manifest, packageName, subpath, extensions);
      return "path" in outcome ? resolved(outcome.path, method) : unresolved(outcome.reason);
    }
    return undefined;
  }

  #resolvePackageSubpath(
    manifest: Manifest,
    packageName: string,
    subpath: string,
    extensions: readonly string[],
  ): Outcome {
    const where = `workspace package ${packageName} (${manifest.path})`;
    const exports = exportsMap(manifest.json.exports);
    if (exports !== undefined) {
      const match = matchSubpath(exports, subpath);
      if (match === undefined || match.targets.length === 0) {
        return { reason: `${subpath} is not exported by ${where}` };
      }
      for (const target of match.targets) {
        if (!target.startsWith("./")) continue;
        const source = this.#mapManifestTarget(manifest, target);
        if (source !== undefined) return { path: source };
      }
      return { reason: `no source file found for the export ${match.key} of ${where}` };
    }
    if (subpath === ".") {
      for (const field of PACKAGE_ENTRY_FIELDS) {
        const source = this.#mapManifestTarget(manifest, manifest.json[field]);
        if (source !== undefined) return { path: source };
      }
      const prefix = manifest.directory === "" ? "" : `${manifest.directory}/`;
      const fallback =
        probeFile(this.snapshot, `${prefix}src/index`, extensions) ??
        probeFile(this.snapshot, `${prefix}index`, extensions);
      return fallback === undefined
        ? { reason: `no entry file found for ${where}` }
        : { path: fallback };
    }
    const candidate = this.locator.resolve(manifest.directory, subpath);
    if (candidate !== undefined && isInsideRoot(candidate)) {
      const found =
        this.probeModulePath(candidate, extensions) ??
        this.mapper.toSource(candidate, manifest.directory);
      if (found !== undefined) return { path: found };
    }
    return { reason: `no file matches ${subpath} in ${where}` };
  }
}
