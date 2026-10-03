/**
 * Project preparation: giving each adapter a view of the snapshot so it can read manifests and project
 * configuration (e.g. `package.json`, `tsconfig.json`) and build its module resolver.
 */
import { compareStrings, normalizePath, type Diagnostic } from "@katedrala/ir";
import {
  silentLogger,
  type AdapterProject,
  type LanguageAdapter,
  type Logger,
  type ProjectContext,
  type SnapshotSource,
  type SourceEntry,
} from "@katedrala/plugin-api";
import { initializeAdapter } from "../extraction/adapters.js";
import { contentHash, decodeText, digestOf } from "../text/text.js";
import { errorMessage, sortDiagnostics } from "../util/diagnostics.js";

/** The project an adapter prepared. */
export interface PreparedProject {
  adapterId: string;
  project: AdapterProject;
}

/** The result of {@link prepareProjects}. */
export interface PreparedProjects {
  /** One entry per adapter that has `createProject` and succeeded, in adapter order. */
  projects: PreparedProject[];
  /**
   * Diagnostics reported by adapters through `ProjectContext.report`, plus a `plugin-error` for each adapter
   * whose `init` or `createProject` failed; in canonical order.
   */
  diagnostics: Diagnostic[];
  /**
   * `sha256:<hex>` over the project configuration adapters read: the sorted lines `<path>\t<hash or ->` of
   * every file in the projects' `configurationFiles` and `/<path>\t<hash or ->` of every ancestor file read
   * through `readAncestorText` (path relative to the top level), joined by `"\n"`. A file that is absent or
   * unreadable has the hash `-`. Equals `EMPTY_DIGEST` when nothing was read.
   */
  projectConfigurationDigest: string;
}

/** Options of {@link prepareProjects}. */
export interface PrepareProjectsOptions {
  /** Receives debug information about failed reads (default: silent). */
  logger?: Logger;
}

/**
 * Prepare the project of every adapter that has `createProject`: awaits `init()` (once per adapter instance,
 * shared with extraction), then `createProject` with a {@link ProjectContext} over the given entries:
 * `files` (sorted), `hasFile`, `readText` (normalized text of listed files; undefined for unlisted,
 * unreadable or binary files), `subdirectory` (from the source), `readAncestorText` (through
 * `source.readAncestor`) and `report` (collected as diagnostics). Reads are shared between adapters. A
 * failing adapter is reported as a `plugin-error` diagnostic and has no project; the others are unaffected.
 */
export async function prepareProjects(
  source: SnapshotSource,
  entries: readonly SourceEntry[],
  adapters: readonly LanguageAdapter[],
  options: PrepareProjectsOptions = {},
): Promise<PreparedProjects> {
  const logger = options.logger ?? silentLogger;
  const files: readonly SourceEntry[] = Object.freeze(
    [...entries]
      .sort((a, b) => compareStrings(a.path, b.path))
      .map((entry) =>
        Object.freeze(
          entry.objectId === undefined
            ? { path: entry.path, size: entry.size }
            : { path: entry.path, size: entry.size, objectId: entry.objectId },
        ),
      ),
  );
  const listed = new Set(files.map((entry) => entry.path));
  const texts = new Map<string, Promise<string | undefined>>();
  const ancestorTexts = new Map<string, Promise<string | undefined>>();
  const diagnostics: Diagnostic[] = [];
  const subdirectory = await source.subdirectory();

  const readText = (path: string): Promise<string | undefined> => {
    if (!listed.has(path)) return Promise.resolve(undefined);
    let text = texts.get(path);
    if (text === undefined) {
      text = source.read(path).then(
        (bytes) => {
          const decoded = decodeText(bytes);
          return decoded.binary ? undefined : decoded.text;
        },
        (error: unknown) => {
          logger.debug("Cannot read a project file", { path, error: errorMessage(error) });
          return undefined;
        },
      );
      texts.set(path, text);
    }
    return text;
  };

  const readAncestorText = (pathFromTopLevel: string): Promise<string | undefined> => {
    let path: string;
    try {
      path = normalizePath(pathFromTopLevel);
    } catch {
      return Promise.resolve(undefined);
    }
    if (path === "") return Promise.resolve(undefined);
    let text = ancestorTexts.get(path);
    if (text === undefined) {
      text = source.readAncestor(path).then(
        (bytes) => {
          if (bytes === undefined) return undefined;
          const decoded = decodeText(bytes);
          return decoded.binary ? undefined : decoded.text;
        },
        (error: unknown) => {
          logger.debug("Cannot read an ancestor file", { path, error: errorMessage(error) });
          return undefined;
        },
      );
      ancestorTexts.set(path, text);
    }
    return text;
  };

  const context: ProjectContext = {
    files,
    hasFile: (path) => listed.has(path),
    readText,
    ...(subdirectory === undefined ? {} : { subdirectory }),
    readAncestorText,
    report: (diagnostic) => {
      diagnostics.push({ ...diagnostic });
    },
  };

  const projects: PreparedProject[] = [];
  for (const adapter of adapters) {
    if (adapter.createProject === undefined) continue;
    try {
      await initializeAdapter(adapter);
    } catch (error) {
      diagnostics.push({
        code: "plugin-error",
        severity: "error",
        message: `Adapter "${adapter.id}" could not be initialized: ${errorMessage(error)}`,
      });
      continue;
    }
    try {
      projects.push({ adapterId: adapter.id, project: await adapter.createProject(context) });
    } catch (error) {
      diagnostics.push({
        code: "plugin-error",
        severity: "error",
        message: `Adapter "${adapter.id}" could not prepare its project: ${errorMessage(error)}`,
      });
    }
  }

  const lines: string[] = [];
  const configurationFiles = new Set<string>();
  for (const { project } of projects) {
    for (const path of project.configurationFiles) {
      try {
        const normalized = normalizePath(path);
        if (normalized !== "") configurationFiles.add(normalized);
      } catch {
        logger.debug("Ignoring a configuration file outside the analysis root", { path });
      }
    }
  }
  for (const path of configurationFiles) {
    const text = await readText(path);
    lines.push(`${path}\t${text === undefined ? "-" : contentHash(text)}`);
  }
  for (const [path, read] of ancestorTexts) {
    const text = await read;
    lines.push(`/${path}\t${text === undefined ? "-" : contentHash(text)}`);
  }
  lines.sort(compareStrings);

  return {
    projects,
    diagnostics: sortDiagnostics(diagnostics),
    projectConfigurationDigest: digestOf(lines),
  };
}
