/**
 * Module resolution: the adapters' resolvers applied to the specifiers written in each file, restricted to
 * listed files, with externals registered and results memoized.
 */
import { sortedUnique } from "@katedrala/ir";
import type { EdgeMechanism, ImportKind } from "@katedrala/ir";
import type { ModuleResolution } from "@katedrala/plugin-api";
import type { DiagnosticSink } from "./diagnostics.js";
import { errorMessage } from "./diagnostics.js";
import type { ExternalRegistry } from "./externals.js";
import { externalNamespace } from "./externals.js";
import type { FileRecord, ModuleTarget } from "./model.js";

/** A module request as passed to `AdapterProject.resolve`, minus the importing file. */
export interface SpecifierRequest {
  readonly specifier: string;
  readonly kind: ImportKind;
  readonly mechanism: EdgeMechanism;
}

/** Why a specifier is resolved outside of an import entry. */
export type SpecifierPurpose = "re-export" | "inline";

const FALLBACK_REQUESTS: Readonly<Record<SpecifierPurpose, Omit<SpecifierRequest, "specifier">>> = {
  "re-export": { kind: "re-export", mechanism: "export-from" },
  inline: { kind: "static", mechanism: "import-declaration" },
};

/** Clamp a confidence reported by a plugin into [0, 1] (NaN counts as no support). */
export function clampConfidence(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Resolves module specifiers through the projects of the adapters that extracted the files. */
export class ModuleResolver {
  readonly #files: ReadonlyMap<string, FileRecord>;
  readonly #externals: ExternalRegistry;
  readonly #diagnostics: DiagnosticSink;
  readonly #memo = new Map<string, ModuleTarget>();
  readonly #importsBySpecifier = new Map<FileRecord, Map<string, number[]>>();

  /**
   * @param files - every listed file by path.
   * @param externals - registry receiving the externals resolutions refer to.
   * @param diagnostics - receives one `plugin-error` per adapter whose resolver throws.
   */
  constructor(
    files: ReadonlyMap<string, FileRecord>,
    externals: ExternalRegistry,
    diagnostics: DiagnosticSink,
  ) {
    this.#files = files;
    this.#externals = externals;
    this.#diagnostics = diagnostics;
  }

  /** Resolve a specifier written in `file` with the project of the adapter that extracted the file. */
  resolve(file: FileRecord, request: SpecifierRequest): ModuleTarget {
    const key = `${file.path}\u0000${request.specifier}\u0000${request.kind}\u0000${request.mechanism}`;
    const memo = this.#memo.get(key);
    if (memo !== undefined) return memo;
    const target = this.#resolveUncached(file, request);
    this.#memo.set(key, target);
    return target;
  }

  #resolveUncached(file: FileRecord, request: SpecifierRequest): ModuleTarget {
    const project = file.project;
    if (project === undefined) {
      return {
        status: "unresolved",
        reason: `no project for adapter ${file.adapterId ?? "(none)"}`,
      };
    }
    let resolution: ModuleResolution;
    try {
      resolution = project.resolve({
        specifier: request.specifier,
        fromFile: file.path,
        kind: request.kind,
        mechanism: request.mechanism,
      });
    } catch (error) {
      this.#diagnostics.pluginError(
        `resolve\u0000${file.adapterId ?? ""}`,
        `The module resolver of adapter "${file.adapterId ?? "(none)"}" failed: ${errorMessage(error)}`,
      );
      return { status: "unresolved", reason: `resolver failed: ${errorMessage(error)}` };
    }
    return this.convert(resolution);
  }

  /**
   * The module a specifier written in `file` outside of an import entry denotes (a re-export's `from`, an
   * inline `import("./x")` type): the resolution of an import of the file with the same specifier when there
   * is one (preferring imports of the matching kind), else a fresh resolution.
   */
  specifier(file: FileRecord, specifier: string, purpose: SpecifierPurpose): ModuleTarget {
    const fallback = FALLBACK_REQUESTS[purpose];
    const indices = this.#importIndices(file).get(specifier) ?? [];
    const imports = file.extraction?.imports ?? [];
    const preferred = indices.find((index) => imports[index]?.kind === fallback.kind) ?? indices[0];
    const known = preferred === undefined ? undefined : file.moduleTargets[preferred];
    if (known !== undefined) return known;
    return this.resolve(file, { specifier, ...fallback });
  }

  #importIndices(file: FileRecord): Map<string, number[]> {
    let indices = this.#importsBySpecifier.get(file);
    if (indices === undefined) {
      indices = new Map();
      for (const [index, extracted] of (file.extraction?.imports ?? []).entries()) {
        if (!extracted.literal) continue;
        const list = indices.get(extracted.specifier);
        if (list === undefined) indices.set(extracted.specifier, [index]);
        else list.push(index);
      }
      this.#importsBySpecifier.set(file, indices);
    }
    return indices;
  }

  /**
   * A child module of a module file (`AdapterProject.resolveMember`, e.g. a Python submodule); undefined when
   * the project has none or it does not resolve (a child module excluded from the analysis is `excluded`).
   */
  member(moduleFile: FileRecord, name: string): ModuleTarget | undefined {
    const project = moduleFile.project;
    if (project === undefined) return undefined;
    let resolution: ModuleResolution | undefined;
    try {
      resolution = project.resolveMember?.(moduleFile.path, name);
    } catch (error) {
      this.#diagnostics.pluginError(
        `resolveMember\u0000${moduleFile.adapterId ?? ""}`,
        `The member resolver of adapter "${moduleFile.adapterId ?? "(none)"}" failed: ${errorMessage(error)}`,
      );
      return undefined;
    }
    if (resolution === undefined) return undefined;
    const target = this.convert(resolution);
    return target.status === "unresolved" ? undefined : target;
  }

  /**
   * Convert a resolver result: keep listed files only and register externals. A resolution to files that
   * are all unlisted is `excluded`: resolvers match the snapshot's files, so those files exist but are not
   * part of the analysis.
   */
  convert(resolution: ModuleResolution): ModuleTarget {
    switch (resolution.status) {
      case "resolved": {
        const paths = sortedUnique(resolution.paths);
        if (paths.length === 0) {
          return {
            status: "unresolved",
            reason: "the resolver reported no files",
            method: resolution.method,
          };
        }
        const files = paths
          .map((path) => this.#files.get(path))
          .filter((file): file is FileRecord => file !== undefined);
        if (files.length === 0) {
          return {
            status: "excluded",
            paths,
            method: resolution.method,
            ...(resolution.unit === undefined ? {} : { unit: resolution.unit }),
          };
        }
        return {
          status: "resolved",
          files,
          method: resolution.method,
          confidence: clampConfidence(resolution.confidence ?? 1),
          ...(resolution.unit === undefined ? {} : { unit: resolution.unit }),
          ...(resolution.members === undefined || resolution.members.length === 0
            ? {}
            : { members: [...resolution.members] }),
        };
      }
      case "external": {
        const external = this.#externals.register(
          "package",
          externalNamespace(resolution.namespace),
          resolution.packageName,
        );
        if (external === undefined) {
          return {
            status: "unresolved",
            reason: "the resolver reported an external package without a name",
            method: resolution.method,
          };
        }
        return {
          status: "external",
          external,
          method: resolution.method,
          confidence: clampConfidence(resolution.confidence ?? 1),
        };
      }
      case "builtin": {
        const external = this.#externals.register(
          "builtin",
          externalNamespace(resolution.namespace),
          resolution.moduleName,
        );
        if (external === undefined) {
          return {
            status: "unresolved",
            reason: "the resolver reported a built-in module without a name",
          };
        }
        return { status: "builtin", external };
      }
      case "unresolved":
        return { status: "unresolved", reason: resolution.reason };
    }
  }
}
