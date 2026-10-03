/**
 * npm package manifests (`package.json`): package descriptors, ownership of files and lookup by name.
 */
import { baseName, compareStrings, parentPath } from "@katedrala/ir";
import type { DependencyScope } from "@katedrala/ir";
import type { PackageDescriptor } from "@katedrala/plugin-api";
import type { DiagnosticCollector } from "./diagnostics.js";
import { isJsonObject, parseStrictJson } from "./json.js";
import type { JsonObject } from "./json.js";
import type { WorkspaceIndex } from "./workspaces.js";

/** A `package.json` that parsed as a JSON object. */
export interface Manifest {
  /** Path of the manifest file. */
  readonly path: string;
  /** Directory of the manifest ("" for the analysis root). */
  readonly directory: string;
  readonly json: JsonObject;
  /** The declared `name`, when it is a non-empty string. */
  readonly name?: string;
}

/** Every `package.json` of a snapshot, valid or not. */
export interface ManifestSet {
  /** Valid manifests, sorted by path. */
  readonly manifests: readonly Manifest[];
  /** Directories whose `package.json` could not be read or parsed. */
  readonly invalidDirectories: ReadonlySet<string>;
}

/** Whether a path has a `node_modules` segment (third-party code, never project configuration). */
export function isInNodeModules(path: string): boolean {
  return path.split("/").includes("node_modules");
}

/** Whether a snapshot path is a package manifest the adapter reads. */
export function isManifestPath(path: string): boolean {
  return baseName(path) === "package.json" && !isInNodeModules(path);
}

/**
 * Parse manifests read from the snapshot. Unreadable, malformed and non-object manifests are reported as
 * `invalid-manifest` warnings.
 *
 * @param texts - manifest path → text (undefined when unreadable), for every manifest path.
 */
export function parseManifests(
  texts: ReadonlyMap<string, string | undefined>,
  diagnostics: DiagnosticCollector,
): ManifestSet {
  const manifests: Manifest[] = [];
  const invalidDirectories = new Set<string>();
  for (const path of [...texts.keys()].sort(compareStrings)) {
    const text = texts.get(path);
    const directory = parentPath(path);
    if (text === undefined) {
      diagnostics.addForFile("invalid-manifest", "warning", "package.json could not be read", path);
      invalidDirectories.add(directory);
      continue;
    }
    const parsed = parseStrictJson(text, path);
    if (!parsed.ok) {
      diagnostics.addForFile(
        "invalid-manifest",
        "warning",
        `Invalid package.json: ${parsed.problem.message}`,
        path,
        parsed.problem,
      );
      invalidDirectories.add(directory);
      continue;
    }
    if (!isJsonObject(parsed.value)) {
      diagnostics.addForFile(
        "invalid-manifest",
        "warning",
        "Invalid package.json: the root value must be a JSON object",
        path,
      );
      invalidDirectories.add(directory);
      continue;
    }
    const json = parsed.value;
    const name = typeof json.name === "string" && json.name !== "" ? json.name : undefined;
    manifests.push(
      name === undefined ? { path, directory, json } : { path, directory, json, name },
    );
  }
  return { manifests, invalidDirectories };
}

const DEPENDENCY_FIELDS: ReadonlyArray<readonly [field: string, scope: DependencyScope]> = [
  ["dependencies", "production"],
  ["devDependencies", "development"],
  ["peerDependencies", "peer"],
  ["optionalDependencies", "optional"],
];

/** Canonical scope order of the IR (`PackageEntity.declaredDependencies`). */
const SCOPE_ORDER: Readonly<Record<string, number>> = {
  production: 0,
  peer: 1,
  optional: 2,
  build: 3,
  provided: 4,
  development: 5,
};

type DeclaredDependency = PackageDescriptor["dependencies"][number];

function compareDependencies(a: DeclaredDependency, b: DeclaredDependency): number {
  return (
    compareStrings(a.name, b.name) ||
    (SCOPE_ORDER[a.scope] ?? 9) - (SCOPE_ORDER[b.scope] ?? 9) ||
    compareStrings(a.scope, b.scope) ||
    compareStrings(a.versionRange, b.versionRange)
  );
}

/**
 * The dependencies a manifest declares in `dependencies`, `devDependencies`, `peerDependencies` and
 * `optionalDependencies` (scopes `production`, `development`, `peer`, `optional`), sorted by name, then
 * scope in the IR's canonical scope order, then version range. Entries whose version is not a string
 * are ignored.
 */
export function declaredDependencies(json: JsonObject): DeclaredDependency[] {
  const result: DeclaredDependency[] = [];
  for (const [field, scope] of DEPENDENCY_FIELDS) {
    const entries = json[field];
    if (!isJsonObject(entries)) continue;
    for (const [name, versionRange] of Object.entries(entries)) {
      if (typeof versionRange === "string") result.push({ name, versionRange, scope });
    }
  }
  return result.sort(compareDependencies);
}

/** The package descriptor of a manifest. */
export function describePackage(manifest: Manifest, workspaces: WorkspaceIndex): PackageDescriptor {
  const descriptor: PackageDescriptor = {
    ecosystem: "npm",
    path: manifest.directory,
    manifest: manifest.path,
    dependencies: declaredDependencies(manifest.json),
  };
  if (manifest.name !== undefined) descriptor.name = manifest.name;
  if (typeof manifest.json.version === "string") descriptor.version = manifest.json.version;
  if (typeof manifest.json.private === "boolean") descriptor.private = manifest.json.private;
  if (workspaces.isRoot(manifest.directory)) descriptor.workspaceRoot = true;
  return descriptor;
}

/**
 * Report every package name declared by more than one manifest, once per name (`duplicate-package-name`,
 * info), attached to the first manifest in path order. All packages are kept.
 */
export function reportDuplicateNames(
  manifests: readonly Manifest[],
  diagnostics: DiagnosticCollector,
): void {
  const byName = new Map<string, string[]>();
  for (const manifest of manifests) {
    if (manifest.name === undefined) continue;
    const paths = byName.get(manifest.name) ?? [];
    paths.push(manifest.path);
    byName.set(manifest.name, paths);
  }
  for (const [name, paths] of byName) {
    if (paths.length < 2) continue;
    const sorted = [...paths].sort(compareStrings);
    diagnostics.addForFile(
      "duplicate-package-name",
      "info",
      `Package name "${name}" is declared by ${sorted.length} manifests: ${sorted.join(", ")}`,
      sorted[0],
    );
  }
}
