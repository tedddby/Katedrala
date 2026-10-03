/**
 * Glob matching for configuration patterns (include, exclude, roles, entry points).
 */
import picomatch from "picomatch";
import { errorMessage } from "../util/diagnostics.js";

/** A predicate over normalized (POSIX, root-relative) paths. */
export type PathMatcher = (path: string) => boolean;

const PICOMATCH_OPTIONS = {
  // Configuration globs match dotfiles and dot-directories (e.g. `.github/**`).
  dot: true,
  // Paths are POSIX on every platform; never treat backslashes as separators (determinism across OSes).
  windows: false,
  // Negation is handled below, list-wide.
  nonegate: true,
  // Report patterns whose regular expression does not compile (`a{`, `!(`, a trailing `\`) instead of
  // silently matching nothing.
  debug: true,
} as const;

/** A list-wide exclusion: `!pattern`, but not the extglob `!(...)`. */
function isNegated(pattern: string): boolean {
  return pattern.startsWith("!") && !pattern.startsWith("!(");
}

/**
 * The pattern without its list-wide `!`, a leading `./` (which picomatch would otherwise match literally)
 * and trailing slashes (directories match through their ancestors anyway). `.`, the analysis root itself,
 * becomes empty.
 */
function patternBody(pattern: string): string {
  let body = isNegated(pattern) ? pattern.slice(1) : pattern;
  while (body.startsWith("./")) body = body.slice(2);
  body = body.replace(/\/+$/, "");
  return body === "." ? "" : body;
}

type CompiledPattern =
  { readonly negated: boolean; readonly regex: RegExp } | { readonly problem: string };

function compilePattern(pattern: string): CompiledPattern {
  const negated = isNegated(pattern);
  const body = patternBody(pattern);
  const quoted = JSON.stringify(pattern);
  if (body === "") {
    if (pattern === "!") return { problem: '"!" must be followed by a pattern (e.g. "!dist/**")' };
    return {
      problem: negated
        ? `${quoted} names the analysis root itself; write "!**" to leave out every file`
        : `${quoted} names the analysis root itself; write "**" to match every file`,
    };
  }
  if (body.startsWith("/")) {
    const relative = JSON.stringify(`${negated ? "!" : ""}${body.replace(/^\/+/, "")}`);
    return {
      problem: `${quoted} can never match: patterns are relative to the analysis root, so write ${relative}`,
    };
  }
  try {
    return { negated, regex: picomatch.makeRe(body, PICOMATCH_OPTIONS) };
  } catch (error) {
    return { problem: `${quoted} is not a valid glob pattern (${errorMessage(error)})` };
  }
}

/**
 * Why a configuration glob cannot be used, or undefined when it can be: a pattern naming the analysis root
 * itself (`./`, `.`, `/`), a lone `!`, a pattern starting with `/` (patterns are relative to the analysis
 * root, so it could never match), and a pattern picomatch cannot compile (e.g. `a{`, longer than 65536
 * characters). Configuration validation reports these with their key and line.
 */
export function globPatternProblem(pattern: string): string | undefined {
  const compiled = compilePattern(pattern);
  return "problem" in compiled ? compiled.problem : undefined;
}

/**
 * Compile configuration globs (picomatch syntax, dotfiles included) into a path predicate.
 *
 * - A pattern matches a file when it matches the file's path **or the path of one of its ancestor
 *   directories**, as in `.gitignore`: `dist`, `dist/` and `dist/**` all match `dist/a/b.js`.
 * - Patterns starting with `!` are exclusions for the whole list: a path matches when some positive pattern
 *   matches it and no negated pattern does (`["src/**", "!src/generated"]`). A list with only negated
 *   patterns matches every path not excluded. (`!(...)` is an extglob, not an exclusion.)
 * - A leading `./` is ignored. An empty list matches nothing.
 *
 * @throws {TypeError} for a pattern {@link globPatternProblem} rejects (validated configurations have none).
 */
export function createPathMatcher(patterns: readonly string[]): PathMatcher {
  const positive: RegExp[] = [];
  const negative: RegExp[] = [];
  for (const pattern of patterns) {
    const compiled = compilePattern(pattern);
    if ("problem" in compiled) throw new TypeError(`Invalid glob pattern: ${compiled.problem}`);
    (compiled.negated ? negative : positive).push(compiled.regex);
  }
  if (positive.length === 0 && negative.length === 0) return () => false;
  const matchesSelfOrAncestor = (regexes: readonly RegExp[], path: string): boolean => {
    if (regexes.some((regex) => regex.test(path))) return true;
    for (let index = path.lastIndexOf("/"); index > 0; index = path.lastIndexOf("/", index - 1)) {
      const ancestor = path.slice(0, index);
      if (regexes.some((regex) => regex.test(ancestor))) return true;
    }
    return false;
  };
  return (path) =>
    (positive.length === 0 || matchesSelfOrAncestor(positive, path)) &&
    (negative.length === 0 || !matchesSelfOrAncestor(negative, path));
}
