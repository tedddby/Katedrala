import { resolve } from "node:path";
import {
  CONFIGURATION_FILE_NAMES,
  ConfigurationError,
  RESERVED_CONFIGURATION_SECTIONS,
  decodeText,
  loadConfiguration,
  parseConfiguration,
  type KatedralaConfig,
  type ParsedConfiguration,
} from "@katedrala/core";
import { fileId, type Diagnostic } from "@katedrala/ir";
import type { SnapshotSource, SourceEntry } from "@katedrala/plugin-api";
import { z } from "zod";

/** The configuration an analysis runs with. */
export interface SnapshotConfiguration {
  readonly config: KatedralaConfig;
  /** Canonical JSON of the effective configuration; part of the analysis digest. */
  readonly canonicalJson: string;
  /**
   * The configuration file relative to the analysis root (POSIX). An explicit configuration file outside
   * the root yields `../` paths, or an absolute path on another drive: such a location depends on the
   * analyzing machine and never appears in the document. Absent when no configuration file was used.
   */
  readonly path?: string;
  /** Whether {@link path} is a file of the snapshot (and therefore a valid `FileId` target). */
  readonly inSnapshot: boolean;
  /** Problems that do not stop the analysis. */
  readonly diagnostics: readonly Diagnostic[];
}

export interface ConfigurationRequest {
  readonly source: SnapshotSource;
  /** The snapshot's file listing. */
  readonly entries: readonly SourceEntry[];
  /** A configuration file to use instead of the snapshot's own, read from disk. */
  readonly explicitPath?: string;
  /** Directory a relative {@link explicitPath} is resolved against (default: the working directory). */
  readonly root?: string;
  /** Validators for configuration sections owned by other packages. */
  readonly sections?: Readonly<Record<string, z.ZodType>>;
}

/**
 * Load the configuration of a snapshot.
 *
 * Without an explicit path, the configuration is the snapshot's own file (the first of
 * `CONFIGURATION_FILE_NAMES` present at its root), read through the snapshot source. A git revision is
 * therefore analyzed with the configuration it contained, and a working tree with its current one.
 *
 * Reserved sections that no package validates yet (for example `rules` before the rules engine exists) are
 * accepted without validation and reported with a `configuration-warning`, so the configuration of a
 * repository written for a later Katedrala still loads; their content is never silently evaluated.
 *
 * @throws ConfigurationError when the file cannot be read or is invalid.
 */
export async function loadSnapshotConfiguration(
  request: ConfigurationRequest,
): Promise<SnapshotConfiguration> {
  const registered = request.sections ?? {};
  const pending = RESERVED_CONFIGURATION_SECTIONS.filter(
    (name) => !Object.hasOwn(registered, name),
  );
  const sections: Record<string, z.ZodType> = { ...registered };
  for (const name of pending) sections[name] = z.unknown();

  let parsed: ParsedConfiguration & { path?: string };
  let inSnapshot = false;
  if (request.explicitPath !== undefined) {
    parsed = await loadConfiguration({
      root: resolve(request.root ?? "."),
      explicitPath: request.explicitPath,
      sections,
    });
  } else {
    parsed = await readSnapshotConfiguration(request.source, request.entries, sections);
    inSnapshot = parsed.path !== undefined;
  }

  const values = parsed.config as Readonly<Record<string, unknown>>;
  const diagnostics: Diagnostic[] = pending
    .filter((name) => values[name] !== undefined)
    .map((name) => ({
      code: "configuration-warning",
      severity: "warning",
      message: `Configuration section "${name}" is not evaluated by this version of Katedrala`,
      ...(inSnapshot && parsed.path !== undefined ? { file: fileId(parsed.path) } : {}),
    }));

  return {
    config: parsed.config,
    canonicalJson: parsed.canonicalJson,
    ...(parsed.path === undefined ? {} : { path: parsed.path }),
    inSnapshot,
    diagnostics,
  };
}

async function readSnapshotConfiguration(
  source: SnapshotSource,
  entries: readonly SourceEntry[],
  sections: Readonly<Record<string, z.ZodType>>,
): Promise<ParsedConfiguration & { path?: string }> {
  const listed = new Set(entries.map((entry) => entry.path));
  const path = CONFIGURATION_FILE_NAMES.find((name) => listed.has(name));
  if (path === undefined) return parseConfiguration("", { sections });

  let bytes: Uint8Array;
  try {
    bytes = await source.read(path);
  } catch (error) {
    throw new ConfigurationError(
      [{ path: "", message: `Cannot read the configuration file: ${errorMessage(error)}` }],
      path,
      { cause: error },
    );
  }
  const decoded = decodeText(bytes);
  if (decoded.binary) {
    throw new ConfigurationError([{ path: "", message: "The file is not text" }], path);
  }
  const format = path.endsWith(".json") ? "json" : "yaml";
  return { ...parseConfiguration(decoded.text, { format, file: path, sections }), path };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
