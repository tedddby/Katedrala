/**
 * File discovery: narrowing the snapshot's files with configuration globs, identifying each file's language
 * (and the adapter that will parse it) and classifying its role.
 */
import { FILE_ROLES, compareStrings, type FileRole, type LanguageId } from "@katedrala/ir";
import type { LanguageAdapter, SourceEntry } from "@katedrala/plugin-api";
import type { EffectiveCoreSettings } from "../config/settings.js";
import { createPathMatcher, type PathMatcher } from "./globs.js";
import { builtinLanguageOf } from "./languages.js";
import { heuristicRole, packageRootsOf } from "./roles.js";

/**
 * Why an adapter-claimed file will not be parsed: it is larger than `max_file_size`, or its role is
 * `generated` or `vendored`.
 */
export type SkipReason = "file-too-large" | "generated" | "vendored";

/** A file selected for analysis, with its language, adapter and role. */
export interface DiscoveredFile extends SourceEntry {
  /** The adapter's language for claimed files, else the built-in language by extension, else `unknown`. */
  readonly language: LanguageId;
  /** Adapter-specific dialect (claimed files only). */
  readonly dialect?: string;
  /** The adapter that claimed the file. */
  readonly adapterId?: string;
  readonly role: FileRole;
  /** Whether the role was forced by configuration or decided by the heuristics. */
  readonly roleSource: "configuration" | "heuristic";
  /** Set when an adapter claimed the file but it will not be parsed. */
  readonly skipReason?: SkipReason;
}

/** The settings discovery uses. */
export type DiscoverySettings = Pick<
  EffectiveCoreSettings,
  "include" | "exclude" | "roles" | "maxFileSize"
>;

/** Throw when two adapters share an id (adapters are looked up by id). */
export function assertUniqueAdapterIds(adapters: readonly LanguageAdapter[]): void {
  const seen = new Set<string>();
  for (const adapter of adapters) {
    if (seen.has(adapter.id))
      throw new TypeError(`Two language adapters share the id "${adapter.id}"`);
    seen.add(adapter.id);
  }
}

/**
 * Select and classify the files to analyze, sorted by path.
 *
 * 1. A file is kept when it matches an `include` glob (an empty list includes everything) and no `exclude`
 *    glob (see `createPathMatcher`: picomatch, dotfiles included, a pattern also matches everything below a
 *    matching directory). Excluded files disappear from the analysis.
 * 2. The language comes from the first adapter (in the given order) whose `detect()` claims the file, else
 *    from the built-in extension table, else it is `unknown`.
 * 3. The role comes from the first configured `roles` entry (in `FILE_ROLES` order) whose globs match, else
 *    from the heuristics (see `heuristicRole`). Package roots for the `bin` rule are derived from the
 *    manifests among all entries.
 * 4. Claimed files larger than `maxFileSize` are skipped (`file-too-large`), as are claimed files whose role
 *    is `generated` or `vendored`.
 *
 * @throws {TypeError} when two adapters share an id or a glob is invalid (see `globPatternProblem`; settings
 *   from a validated configuration have none); whatever an adapter's `detect()` throws (a plugin bug,
 *   surfaced rather than hidden).
 */
export function discoverFiles(
  entries: readonly SourceEntry[],
  settings: DiscoverySettings,
  adapters: readonly LanguageAdapter[],
): DiscoveredFile[] {
  assertUniqueAdapterIds(adapters);
  const included: PathMatcher =
    settings.include.length === 0 ? () => true : createPathMatcher(settings.include);
  const excluded = createPathMatcher(settings.exclude);
  const roleMatchers: Array<[FileRole, PathMatcher]> = FILE_ROLES.filter(
    (role) => settings.roles[role].length > 0,
  ).map((role) => [role, createPathMatcher(settings.roles[role])]);
  const packageRoots = packageRootsOf(entries.map((entry) => entry.path));

  const files: DiscoveredFile[] = [];
  for (const entry of entries) {
    if (!included(entry.path) || excluded(entry.path)) continue;

    let detection: { language: LanguageId; dialect?: string; adapterId?: string } | undefined;
    for (const adapter of adapters) {
      const claim = adapter.detect({ path: entry.path });
      if (claim !== undefined) {
        detection = {
          language: claim.language,
          adapterId: adapter.id,
          ...(claim.dialect === undefined ? {} : { dialect: claim.dialect }),
        };
        break;
      }
    }
    detection ??= { language: builtinLanguageOf(entry.path) ?? "unknown" };
    const claimed = detection.adapterId !== undefined;

    const configured = roleMatchers.find(([, matches]) => matches(entry.path))?.[0];
    const role = configured ?? heuristicRole(entry.path, { claimed, packageRoots });

    let skipReason: SkipReason | undefined;
    if (claimed) {
      if (entry.size > settings.maxFileSize) skipReason = "file-too-large";
      else if (role === "generated" || role === "vendored") skipReason = role;
    }

    files.push({
      path: entry.path,
      size: entry.size,
      ...(entry.objectId === undefined ? {} : { objectId: entry.objectId }),
      ...detection,
      role,
      roleSource: configured === undefined ? "heuristic" : "configuration",
      ...(skipReason === undefined ? {} : { skipReason }),
    });
  }
  return files.sort((a, b) => compareStrings(a.path, b.path));
}
