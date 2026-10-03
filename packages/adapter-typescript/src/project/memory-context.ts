/**
 * An in-memory {@link ProjectContext}, for tests and programmatic analyses of files that are not on disk.
 */
import { compareStrings } from "@katedrala/ir";
import type { Diagnostic } from "@katedrala/ir";
import type { ProjectContext, SourceEntry } from "@katedrala/plugin-api";

/** Options of {@link createMemoryProjectContext}. */
export interface MemoryProjectContextOptions {
  /** The analysis root relative to the version-control top level; enables reads above the root. */
  subdirectory?: string;
  /** Files above the analysis root, by path relative to the top level. */
  ancestors?: Readonly<Record<string, string>>;
  /** Listed files whose reads fail (`readText` resolves to undefined). */
  unreadable?: readonly string[];
}

/** An in-memory project context and what was observed through it. */
export interface MemoryProjectContext {
  context: ProjectContext;
  /** Diagnostics reported through the context, in report order. */
  diagnostics: Diagnostic[];
  /** Paths read with `readText`, in call order. */
  reads: string[];
  /** Paths requested with `readAncestorText`, in call order. */
  ancestorReads: string[];
}

const encoder = new TextEncoder();

/**
 * Create a project context over in-memory files (path → normalized text). Files are listed in path order;
 * lookups are exact and case-sensitive.
 */
export function createMemoryProjectContext(
  files: Readonly<Record<string, string>>,
  options: MemoryProjectContextOptions = {},
): MemoryProjectContext {
  const contents = new Map(Object.entries(files));
  const unreadable = new Set(options.unreadable ?? []);
  const ancestors = new Map(Object.entries(options.ancestors ?? {}));
  const diagnostics: Diagnostic[] = [];
  const reads: string[] = [];
  const ancestorReads: string[] = [];
  const entries: SourceEntry[] = [...contents.keys()]
    .sort(compareStrings)
    .map((path) => ({ path, size: encoder.encode(contents.get(path) ?? "").length }));
  const context: ProjectContext = {
    files: entries,
    hasFile: (path) => contents.has(path),
    readText: (path) => {
      reads.push(path);
      return Promise.resolve(unreadable.has(path) ? undefined : contents.get(path));
    },
    readAncestorText: (pathFromTopLevel) => {
      ancestorReads.push(pathFromTopLevel);
      return Promise.resolve(
        options.subdirectory === undefined ? undefined : ancestors.get(pathFromTopLevel),
      );
    },
    report: (diagnostic) => {
      diagnostics.push(diagnostic);
    },
  };
  if (options.subdirectory !== undefined) {
    return {
      context: { ...context, subdirectory: options.subdirectory },
      diagnostics,
      reads,
      ancestorReads,
    };
  }
  return { context, diagnostics, reads, ancestorReads };
}
