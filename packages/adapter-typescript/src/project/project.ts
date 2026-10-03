/**
 * Project setup of the TypeScript/JavaScript adapter: reads the snapshot's package manifests, workspace
 * declarations and tsconfig/jsconfig files once, and prepares packages, entry points and a synchronous
 * module resolver that matches paths exactly against the snapshot's file list.
 */
import { baseName, compareStrings, parentPath } from "@katedrala/ir";
import type {
  AdapterProject,
  ModuleRequest,
  ModuleResolution,
  ProjectContext,
} from "@katedrala/plugin-api";
import type { ResolvedTypeScriptAdapterOptions } from "../options.js";
import { ConfigSet } from "./config-set.js";
import { DiagnosticCollector } from "./diagnostics.js";
import { collectEntryPoints } from "./entry-points.js";
import { isJsonObject, parseStrictJson } from "./json.js";
import { Locator, TOP_LEVEL_PREFIX } from "./locations.js";
import {
  describePackage,
  isInNodeModules,
  isManifestPath,
  parseManifests,
  reportDuplicateNames,
} from "./manifests.js";
import type { ManifestSet } from "./manifests.js";
import { OutputMapper } from "./output-mapping.js";
import { PackageIndex } from "./packages.js";
import { ModuleResolver } from "./resolver.js";
import { SnapshotIndex } from "./snapshot.js";
import { loadProjectConfigs } from "./tsconfig.js";
import type { ConfigurationFileReader } from "./tsconfig.js";
import {
  WorkspaceIndex,
  lernaPackagePatterns,
  manifestWorkspacePatterns,
  parsePnpmWorkspacePackages,
} from "./workspaces.js";
import type { WorkspaceRoot } from "./workspaces.js";

/** Reads configuration through the project context and remembers what was read. */
class ConfigurationReader implements ConfigurationFileReader {
  readonly #read = new Set<string>();

  constructor(private readonly context: ProjectContext) {}

  async readFile(path: string): Promise<string | undefined> {
    this.#read.add(path);
    try {
      return await this.context.readText(path);
    } catch {
      return undefined;
    }
  }

  async readAncestor(pathFromTopLevel: string): Promise<string | undefined> {
    let text: string | undefined;
    try {
      text = await this.context.readAncestorText(pathFromTopLevel);
    } catch {
      text = undefined;
    }
    if (text !== undefined) this.#read.add(`${TOP_LEVEL_PREFIX}${pathFromTopLevel}`);
    return text;
  }

  async readAll(paths: readonly string[]): Promise<Map<string, string | undefined>> {
    const texts = await Promise.all(paths.map((path) => this.readFile(path)));
    return new Map(paths.map((path, index) => [path, texts[index]]));
  }

  /** Every configuration file read, sorted. */
  files(): string[] {
    return [...this.#read].sort(compareStrings);
  }
}

function isWorkspaceFile(path: string, name: string): boolean {
  return baseName(path) === name && !isInNodeModules(path);
}

function workspaceRoots(
  manifests: ManifestSet,
  pnpmWorkspaces: ReadonlyMap<string, string | undefined>,
  lernaFiles: ReadonlyMap<string, string | undefined>,
  diagnostics: DiagnosticCollector,
): WorkspaceRoot[] {
  const roots: WorkspaceRoot[] = [];
  for (const manifest of manifests.manifests) {
    const patterns = manifestWorkspacePatterns(manifest.json);
    if (patterns !== undefined) roots.push({ directory: manifest.directory, patterns });
  }
  for (const [path, text] of pnpmWorkspaces) {
    roots.push({
      directory: parentPath(path),
      patterns: text === undefined ? [] : parsePnpmWorkspacePackages(text),
    });
  }
  for (const [path, text] of lernaFiles) {
    let patterns: string[] = [];
    if (text !== undefined) {
      const parsed = parseStrictJson(text, path);
      if (parsed.ok && isJsonObject(parsed.value)) {
        patterns = lernaPackagePatterns(parsed.value);
      } else {
        const problem = parsed.ok
          ? { message: "the root value must be a JSON object" }
          : parsed.problem;
        diagnostics.addForFile(
          "invalid-project-configuration",
          "warning",
          `Invalid lerna.json: ${problem.message}`,
          path,
          problem,
        );
      }
    }
    roots.push({ directory: parentPath(path), patterns });
  }
  return roots;
}

/**
 * Prepare the project-level knowledge of the TypeScript/JavaScript adapter for one snapshot.
 *
 * - `packages`: one descriptor per `package.json` outside `node_modules` (duplicate names are kept and
 *   reported once per name as `duplicate-package-name`; malformed manifests are `invalid-manifest`).
 * - `entryPoints`: entry points declared by manifests, mapped from build output to sources.
 * - `configurationFiles`: every manifest, workspace file (`pnpm-workspace.yaml`, `lerna.json`) and
 *   tsconfig/jsconfig read, sorted; files read from above the analysis root through
 *   `ProjectContext.readAncestorText` (bases, and the `tsconfig.json` / `jsconfig.json` of the directories
 *   above a subdirectory root) are listed as `<top-level>/<path from the top level>` when they exist.
 * - `resolve`: synchronous, pure module resolution (see `ModuleResolver`).
 *
 * Problems are reported through `context.report` in canonical order before the promise resolves.
 *
 * @param _options - adapter options; none of them affects project setup.
 */
export async function createTypeScriptProject(
  context: ProjectContext,
  _options: ResolvedTypeScriptAdapterOptions,
): Promise<AdapterProject> {
  const diagnostics = new DiagnosticCollector();
  const snapshot = new SnapshotIndex(context.files.map((entry) => entry.path));
  const locator = new Locator(context.subdirectory);
  const reader = new ConfigurationReader(context);

  const [manifestTexts, pnpmTexts, lernaTexts] = await Promise.all([
    reader.readAll(snapshot.paths.filter(isManifestPath)),
    reader.readAll(snapshot.paths.filter((path) => isWorkspaceFile(path, "pnpm-workspace.yaml"))),
    reader.readAll(snapshot.paths.filter((path) => isWorkspaceFile(path, "lerna.json"))),
  ]);
  const manifests = parseManifests(manifestTexts, diagnostics);
  const workspaces = new WorkspaceIndex(
    workspaceRoots(manifests, pnpmTexts, lernaTexts, diagnostics),
  );
  const packageIndex = new PackageIndex(manifests, workspaces);
  const configs = new ConfigSet(
    await loadProjectConfigs(reader, snapshot, locator, diagnostics, packageIndex),
    snapshot,
    locator,
  );

  const mapper = new OutputMapper(snapshot, configs);
  const resolver = new ModuleResolver(snapshot, packageIndex, configs, mapper, locator);

  reportDuplicateNames(manifests.manifests, diagnostics);
  const packages = manifests.manifests.map((manifest) => describePackage(manifest, workspaces));
  const entryPoints = collectEntryPoints(manifests.manifests, mapper, locator);
  for (const diagnostic of diagnostics.sorted()) context.report(diagnostic);

  return Object.freeze({
    packages: Object.freeze(packages),
    entryPoints: Object.freeze(entryPoints),
    configurationFiles: Object.freeze(reader.files()),
    resolve: (request: ModuleRequest): ModuleResolution => resolver.resolve(request),
  });
}
