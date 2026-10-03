/**
 * Wildcard patterns of project configuration.
 *
 * - tsconfig `include` / `exclude` use TypeScript's own wildcard semantics, ported from TypeScript 6.0
 *   (`getSubPatternFromSpec`): `*` and `?` match within one path segment and never match a leading `.`;
 *   `**` matches any number of directories except dot-directories and `node_modules`, `bower_components`
 *   and `jspm_packages`; `*` in `include` does not match `.min.js` files; a last segment without `.`, `*` or
 *   `?` denotes a directory (`src` means `src/**` + `/*`); exclusions also exclude everything below a
 *   matched path. Matching is always case-sensitive.
 * - Workspace package patterns (`pnpm-workspace.yaml`, `workspaces`, `lerna.json`) use plain glob
 *   semantics on directory paths: `*` and `?` within a segment, `**` for any number of segments.
 */

/** How a tsconfig wildcard specification is used. */
export type WildcardUsage = "files" | "exclude";

const COMMON_PACKAGE_FOLDERS = ["node_modules", "bower_components", "jspm_packages"];
const IMPLICIT_EXCLUDE = `(?!(?:${COMMON_PACKAGE_FOLDERS.join("|")})(?:/|$))`;
const RESERVED_CHARACTERS = /[^\w\s/]/g;

interface WildcardMatcher {
  singleAsterisk: string;
  doubleAsterisk: string;
}

const FILES_MATCHER: WildcardMatcher = {
  singleAsterisk: "(?:[^./]|(?:\\.(?!min\\.js$))?)*",
  doubleAsterisk: `(?:/${IMPLICIT_EXCLUDE}[^/.][^/]*)*?`,
};

const EXCLUDE_MATCHER: WildcardMatcher = {
  singleAsterisk: "[^/]*",
  doubleAsterisk: "(?:/.+?)?",
};

function replaceReserved(component: string, matcher: WildcardMatcher): string {
  return component.replace(RESERVED_CHARACTERS, (match) =>
    match === "*" ? matcher.singleAsterisk : match === "?" ? "[^/]" : `\\${match}`,
  );
}

/** Whether a last path component denotes a directory to be matched recursively (no `.`, `*` or `?`). */
export function isImplicitGlob(lastComponent: string): boolean {
  return !/[.*?]/.test(lastComponent);
}

/**
 * Validate a raw `include` / `exclude` specification as TypeScript does; returns TypeScript's message for
 * an invalid specification, undefined for a valid one.
 */
export function invalidWildcardSpecMessage(spec: string, usage: WildcardUsage): string | undefined {
  if (usage === "files" && /(?:^|\/)\*\*\/?$/.test(spec)) {
    return `File specification cannot end in a recursive directory wildcard ('**'): ${spec}`;
  }
  const wildcardIndex = spec.startsWith("**/") ? 0 : spec.indexOf("/**/");
  if (wildcardIndex !== -1) {
    const lastDotIndex = spec.endsWith("/..") ? spec.length : spec.lastIndexOf("/../");
    if (lastDotIndex > wildcardIndex) {
      return `File specification cannot contain a parent directory ('..') that appears after a recursive directory wildcard ('**'): ${spec}`;
    }
  }
  return undefined;
}

/**
 * The regular expression source matching one resolved specification, for paths written with a leading
 * `/` (`/<path in match coordinates>`), or undefined when TypeScript ignores the specification.
 *
 * @param specPath - the specification resolved against its configuration directory, in match coordinates
 *   ("" for the root itself), possibly containing `*`, `?` and `**` segments.
 */
export function wildcardSubPattern(specPath: string, usage: WildcardUsage): string | undefined {
  const matcher = usage === "files" ? FILES_MATCHER : EXCLUDE_MATCHER;
  const components = ["", ...(specPath === "" ? [] : specPath.split("/"))];
  const lastComponent = components[components.length - 1] ?? "";
  if (usage !== "exclude" && lastComponent === "**") return undefined;
  if (isImplicitGlob(lastComponent)) components.push("**", "*");
  let pattern = "";
  let hasWrittenComponent = false;
  for (const original of components) {
    if (original === "**") {
      pattern += matcher.doubleAsterisk;
    } else {
      if (hasWrittenComponent) pattern += "/";
      if (usage === "exclude") {
        pattern += replaceReserved(original, matcher);
      } else {
        let component = original;
        let componentPattern = "";
        if (component.startsWith("*")) {
          componentPattern += `(?:[^./]${matcher.singleAsterisk})?`;
          component = component.slice(1);
        } else if (component.startsWith("?")) {
          componentPattern += "[^./]";
          component = component.slice(1);
        }
        componentPattern += replaceReserved(component, matcher);
        if (componentPattern !== component) pattern += IMPLICIT_EXCLUDE;
        pattern += componentPattern;
      }
    }
    hasWrittenComponent = true;
  }
  return pattern;
}

/**
 * Compile resolved specifications into one regular expression over `/`-prefixed match-coordinate paths;
 * undefined when no specification is usable. Case-sensitive.
 */
export function wildcardRegExp(
  specPaths: readonly string[],
  usage: WildcardUsage,
): RegExp | undefined {
  const patterns = specPaths
    .map((specPath) => wildcardSubPattern(specPath, usage))
    .filter((pattern): pattern is string => pattern !== undefined);
  if (patterns.length === 0) return undefined;
  const terminator = usage === "exclude" ? "(?:$|/)" : "$";
  return new RegExp(`^(?:${patterns.map((pattern) => `(?:${pattern})`).join("|")})${terminator}`);
}

/**
 * The directory below which every match of a resolved specification lies (the segments before the first
 * wildcard; the parent directory for a single file), in match coordinates.
 */
export function wildcardBaseDirectory(specPath: string): string {
  const segments = specPath === "" ? [] : specPath.split("/");
  const wildcard = segments.findIndex((segment) => /[*?]/.test(segment));
  if (wildcard !== -1) return segments.slice(0, wildcard).join("/");
  const last = segments[segments.length - 1];
  if (last !== undefined && !isImplicitGlob(last)) return segments.slice(0, -1).join("/");
  return segments.join("/");
}

// ─── Workspace globs ────────────────────────────────────────────────────────

function segmentRegExp(segment: string): RegExp {
  const source = segment.replace(/[^\w\s]/g, (match) =>
    match === "*" ? "[^/]*" : match === "?" ? "[^/]" : `\\${match}`,
  );
  return new RegExp(`^${source}$`);
}

/** A compiled workspace package pattern (`packages/*`, `apps/**`, `tools/cli`). */
export class WorkspaceGlob {
  readonly #segments: ReadonlyArray<RegExp | "**">;

  /** @param pattern - a glob relative to the workspace root, without a leading `!`. */
  constructor(readonly pattern: string) {
    this.#segments = pattern
      .split("/")
      .filter((segment) => segment !== "" && segment !== ".")
      .map((segment) => (segment === "**" ? "**" : segmentRegExp(segment)));
  }

  /** Whether a directory path relative to the workspace root matches the pattern. */
  matches(directory: string): boolean {
    const segments = directory === "" ? [] : directory.split("/");
    return this.#match(0, segments, 0);
  }

  #match(patternIndex: number, segments: readonly string[], segmentIndex: number): boolean {
    if (patternIndex === this.#segments.length) return segmentIndex === segments.length;
    const part = this.#segments[patternIndex];
    if (part === undefined) return false;
    if (part === "**") {
      for (let next = segmentIndex; next <= segments.length; next++) {
        if (this.#match(patternIndex + 1, segments, next)) return true;
      }
      return false;
    }
    const segment = segments[segmentIndex];
    return (
      segment !== undefined &&
      part.test(segment) &&
      this.#match(patternIndex + 1, segments, segmentIndex + 1)
    );
  }
}
