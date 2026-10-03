/**
 * Packages: the manifests reported by adapter projects, their declared dependencies (and the
 * `depends-on-package` observations they imply), ownership of files, and the `declared` flag of external
 * packages.
 */
import {
  InvalidIdentifierError,
  PathOutsideRootError,
  compareStrings,
  fileId,
  isWithin,
  normalizePath,
  packageId,
  parentPath,
} from "@katedrala/ir";
import type { PackageDependency, PackageEntity, PackageId } from "@katedrala/ir";
import type { PackageDescriptor } from "@katedrala/plugin-api";
import type { DiagnosticSink } from "./diagnostics.js";
import { errorMessage } from "./diagnostics.js";
import type { ExternalRegistry } from "./externals.js";
import { namespaceOfEcosystem } from "./externals.js";
import type { Observation } from "./model.js";
import { comparePackageDependencies } from "./order.js";
import type { LinkProject } from "./types.js";

/** A package entity together with the descriptor and adapter it came from. */
export interface PackageRecord {
  readonly entity: PackageEntity;
  readonly descriptor: PackageDescriptor;
  readonly adapterId: string;
  /** Names of the declared dependencies. */
  readonly dependencyNames: ReadonlySet<string>;
}

/**
 * The DefinitelyTyped package providing the types of an npm package: `@types/<name>`, and
 * `@types/<scope>__<name>` for a scoped `@<scope>/<name>`; undefined for `@types/*` packages themselves and
 * names that are not package names.
 */
export function typesPackageOf(name: string): string | undefined {
  if (name.startsWith("@types/")) return undefined;
  if (!name.startsWith("@")) return name === "" ? undefined : `@types/${name}`;
  const slash = name.indexOf("/");
  if (slash <= 1 || slash === name.length - 1) return undefined;
  return `@types/${name.slice(1, slash)}__${name.slice(slash + 1)}`;
}

/** Packages of the snapshot with ownership and workspace lookups. */
export class PackageIndex {
  readonly #records: readonly PackageRecord[];
  readonly #byDirectory = new Map<string, PackageRecord[]>();

  /** @param records - package records sorted by id. */
  constructor(records: readonly PackageRecord[]) {
    this.#records = records;
    for (const record of records) {
      const list = this.#byDirectory.get(record.entity.path);
      if (list === undefined) this.#byDirectory.set(record.entity.path, [record]);
      else list.push(record);
    }
  }

  /** Package entities sorted by id. */
  entities(): PackageEntity[] {
    return this.#records.map((record) => record.entity);
  }

  /**
   * The nearest package at or above `directory` that satisfies `accept`; among packages declared in the same
   * directory (several ecosystems), the one with the smallest id.
   */
  #nearest(
    directory: string,
    accept: (record: PackageRecord) => boolean,
  ): PackageRecord | undefined {
    let current: string | undefined = directory;
    while (current !== undefined) {
      const found = this.#byDirectory.get(current)?.find(accept);
      if (found !== undefined) return found;
      current = current === "" ? undefined : parentPath(current);
    }
    return undefined;
  }

  /**
   * The package owning a file: one declared in the nearest ancestor-or-self directory of the file with a
   * manifest. When manifests of several ecosystems share that directory (e.g. `package.json` beside
   * `Cargo.toml`), a manifest belongs to its own package and other files to the package reported by the
   * adapter that processed them; otherwise the smallest id wins.
   *
   * @param adapterId - the adapter that processed the file, if any.
   */
  ownerOf(filePath: string, adapterId: string | undefined): PackageId | undefined {
    let current: string | undefined = parentPath(filePath);
    while (current !== undefined) {
      const records = this.#byDirectory.get(current);
      if (records !== undefined) {
        const owner =
          records.find((record) => record.descriptor.manifest === filePath) ??
          (adapterId === undefined
            ? undefined
            : records.find((record) => record.adapterId === adapterId)) ??
          records[0];
        if (owner !== undefined) return owner.entity.id;
      }
      current = current === "" ? undefined : parentPath(current);
    }
    return undefined;
  }

  /** The nearest package of a file among packages whose ecosystem publishes into `namespace`. */
  ownerInNamespace(filePath: string, namespace: string): PackageRecord | undefined {
    return this.#nearest(
      parentPath(filePath),
      (record) => namespaceOfEcosystem(record.entity.ecosystem) === namespace,
    );
  }

  /** The nearest strict-ancestor package of the same ecosystem that declares a workspace. */
  workspaceRootOf(record: PackageRecord): PackageRecord | undefined {
    if (record.entity.path === "") return undefined;
    return this.#nearest(
      parentPath(record.entity.path),
      (candidate) =>
        candidate.entity.workspaceRoot === true &&
        candidate.entity.ecosystem === record.entity.ecosystem,
    );
  }

  /** Whether a package declares `name` in its own manifest or in its workspace root's. */
  declaresWithWorkspace(record: PackageRecord, name: string): boolean {
    if (record.dependencyNames.has(name)) return true;
    return this.workspaceRootOf(record)?.dependencyNames.has(name) ?? false;
  }

  /**
   * Whether a package declares what code of it needs from the external package `name` of `namespace`: the
   * package itself, or, for imports used only in type positions, its DefinitelyTyped package (npm
   * `@types/<name>`, `@types/<scope>__<name>` for `@<scope>/<name>`).
   */
  satisfies(record: PackageRecord, namespace: string, name: string, typeOnly: boolean): boolean {
    if (this.declaresWithWorkspace(record, name)) return true;
    if (!typeOnly || namespace !== "npm") return false;
    const types = typesPackageOf(name);
    return types !== undefined && this.declaresWithWorkspace(record, types);
  }

  /**
   * The package declared in `directory`, preferring packages reported by `adapterId`; the smallest id among
   * equals.
   */
  packageAt(directory: string, adapterId: string): PackageId | undefined {
    const records = this.#byDirectory.get(directory);
    if (records === undefined) return undefined;
    return (records.find((record) => record.adapterId === adapterId) ?? records[0])?.entity.id;
  }
}

/** Result of {@link buildPackages}. */
export interface PackageBuild {
  readonly index: PackageIndex;
  /** `depends-on-package` observations, one per declared dependency (self-dependencies excluded). */
  readonly observations: readonly Observation[];
}

interface Candidate {
  readonly descriptor: PackageDescriptor;
  readonly adapterId: string;
  readonly id: PackageId;
  readonly path: string;
}

function collectCandidates(
  projects: readonly LinkProject[],
  listed: ReadonlySet<string>,
  diagnostics: DiagnosticSink,
): Candidate[] {
  const candidates = new Map<PackageId, Candidate>();
  for (const { adapterId, project } of projects) {
    for (const descriptor of project.packages) {
      if (!listed.has(descriptor.manifest)) continue;
      let id: PackageId;
      let path: string;
      try {
        path = normalizePath(descriptor.path);
        id = packageId(descriptor.ecosystem, path);
      } catch (error) {
        if (
          !(error instanceof InvalidIdentifierError) &&
          !(error instanceof PathOutsideRootError)
        ) {
          throw error;
        }
        diagnostics.add({
          code: "plugin-error",
          severity: "warning",
          message: `Adapter "${adapterId}" reported an invalid package (${errorMessage(error)}); it was ignored`,
          file: fileId(descriptor.manifest),
        });
        continue;
      }
      // The first adapter (in id order) reporting a manifest location defines the package.
      if (!candidates.has(id)) candidates.set(id, { descriptor, adapterId, id, path });
    }
  }
  return [...candidates.values()].sort((a, b) => compareStrings(a.id, b.id));
}

function isWorkspaceMember(candidate: Candidate, all: readonly Candidate[]): boolean {
  return all.some(
    (other) =>
      other.descriptor.workspaceRoot === true &&
      other.descriptor.ecosystem === candidate.descriptor.ecosystem &&
      other.path !== candidate.path &&
      isWithin(candidate.path, other.path),
  );
}

/**
 * Choose the internal package a dependency name refers to: workspace members first, then the shortest
 * manifest directory, then the smallest id. Reports a `duplicate-package-name` diagnostic once per name
 * declared by several manifests of one ecosystem.
 */
function internalTargets(
  candidates: readonly Candidate[],
  diagnostics: DiagnosticSink,
): Map<string, PackageId> {
  const byName = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const name = candidate.descriptor.name;
    if (name === undefined || name === "") continue;
    const key = `${candidate.descriptor.ecosystem}\u0000${name}`;
    const list = byName.get(key);
    if (list === undefined) byName.set(key, [candidate]);
    else list.push(candidate);
  }
  const targets = new Map<string, PackageId>();
  for (const [key, list] of byName) {
    const ranked = list
      .map((candidate) => ({ candidate, member: isWorkspaceMember(candidate, candidates) }))
      .sort(
        (a, b) =>
          Number(b.member) - Number(a.member) ||
          a.candidate.path.length - b.candidate.path.length ||
          compareStrings(a.candidate.id, b.candidate.id),
      );
    const chosen = ranked[0]?.candidate;
    if (chosen === undefined) continue;
    targets.set(key, chosen.id);
    if (list.length > 1) {
      const manifests = list
        .map((candidate) => candidate.descriptor.manifest)
        .sort(compareStrings)
        .join(", ");
      diagnostics.add({
        code: "duplicate-package-name",
        severity: "info",
        message:
          `Package name "${chosen.descriptor.name ?? ""}" is declared by ${list.length} ` +
          `${chosen.descriptor.ecosystem} manifests (${manifests}); dependencies on it refer to ` +
          chosen.descriptor.manifest,
      });
    }
  }
  return targets;
}

/**
 * Build the package entities of the snapshot from every project's package descriptors.
 *
 * @param projects - projects sorted by adapter id (the first adapter reporting a manifest location wins).
 * @param listed - paths of the listed files; packages whose manifest is not listed are skipped.
 */
export function buildPackages(
  projects: readonly LinkProject[],
  listed: ReadonlySet<string>,
  externals: ExternalRegistry,
  diagnostics: DiagnosticSink,
): PackageBuild {
  const candidates = collectCandidates(projects, listed, diagnostics);
  const internal = internalTargets(candidates, diagnostics);
  const records: PackageRecord[] = [];
  const observations: Observation[] = [];
  for (const candidate of candidates) {
    const { descriptor, id, path } = candidate;
    const manifest = fileId(descriptor.manifest);
    const namespace = namespaceOfEcosystem(descriptor.ecosystem);
    const declaredDependencies: PackageDependency[] = [];
    for (const dependency of descriptor.dependencies) {
      const internalTarget = internal.get(`${descriptor.ecosystem}\u0000${dependency.name}`);
      const target =
        internalTarget ?? externals.register("package", namespace, dependency.name)?.id;
      if (target === undefined) continue;
      declaredDependencies.push({
        name: dependency.name,
        versionRange: dependency.versionRange,
        scope: dependency.scope,
        target,
      });
      if (target === id) continue;
      observations.push({
        kind: "depends-on-package",
        source: id,
        target,
        provenance: {
          file: manifest,
          line: 1,
          column: 1,
          mechanism: "manifest-dependency",
          resolution: "manifest",
          confidence: 1,
        },
      });
    }
    declaredDependencies.sort(comparePackageDependencies);
    const name =
      descriptor.name !== undefined && descriptor.name !== ""
        ? descriptor.name
        : path === ""
          ? "."
          : path;
    const entity: PackageEntity = {
      id,
      name,
      ecosystem: descriptor.ecosystem,
      path,
      manifest,
      ...(descriptor.version === undefined ? {} : { version: descriptor.version }),
      ...(descriptor.private === undefined ? {} : { private: descriptor.private }),
      ...(descriptor.workspaceRoot === undefined
        ? {}
        : { workspaceRoot: descriptor.workspaceRoot }),
      declaredDependencies,
      dependencies: [],
      dependents: [],
    };
    records.push({
      entity,
      descriptor,
      adapterId: candidate.adapterId,
      dependencyNames: new Set(descriptor.dependencies.map((dependency) => dependency.name)),
    });
  }
  return { index: new PackageIndex(records), observations };
}
