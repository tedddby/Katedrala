/**
 * The `exports` and `imports` fields of `package.json` (Node.js package entry points), evaluated
 * statically: subpath keys and `*` patterns as specified by Node.js, and conditions by a fixed preference
 * instead of a runtime condition set.
 */
import { isJsonObject } from "./json.js";
import type { JsonObject } from "./json.js";

/**
 * Conditions in order of preference. Conditions not listed are tried afterwards, in key order. The
 * preference favours conditions that point at sources (`source`, `development`) and implementations over
 * type declarations (`types`).
 */
export const CONDITION_PREFERENCE: readonly string[] = Object.freeze([
  "source",
  "development",
  "import",
  "module",
  "node",
  "require",
  "default",
  "types",
]);

const CONDITION_RANK = new Map(CONDITION_PREFERENCE.map((condition, index) => [condition, index]));

/** A subpath key matched in an `exports` or `imports` map. */
export interface SubpathMatch {
  /** The key that matched (e.g. `./*` or `#internal/*`). */
  key: string;
  /** The candidate targets in preference order, with `*` already substituted. */
  targets: string[];
}

function orderedConditions(conditions: JsonObject): string[] {
  const keys = Object.keys(conditions);
  const known = keys
    .filter((key) => CONDITION_RANK.has(key))
    .sort((a, b) => (CONDITION_RANK.get(a) ?? 0) - (CONDITION_RANK.get(b) ?? 0));
  const others = keys.filter((key) => !CONDITION_RANK.has(key));
  return [...known, ...others];
}

/**
 * Flatten a target value (a string, a fallback array or a conditions object, nested) into the strings
 * it may resolve to, in preference order. `null` targets (exclusions) contribute nothing; keys starting
 * with `.` inside conditions are invalid and ignored.
 *
 * @param conditions - when given, the active conditions of a runtime that matches conditions in key
 *   order, as Node.js and TypeScript do: only these keys count, in the order the object lists them.
 *   Without it, conditions are ranked by {@link CONDITION_PREFERENCE}.
 */
export function targetStrings(value: unknown, conditions?: ReadonlySet<string>): string[] {
  const result: string[] = [];
  const visit = (target: unknown, depth: number): void => {
    if (depth > 32) return;
    if (typeof target === "string") {
      result.push(target);
    } else if (Array.isArray(target)) {
      for (const item of target) visit(item, depth + 1);
    } else if (isJsonObject(target)) {
      const keys =
        conditions === undefined
          ? orderedConditions(target)
          : Object.keys(target).filter((key) => conditions.has(key));
      for (const condition of keys) {
        if (!condition.startsWith(".")) visit(target[condition], depth + 1);
      }
    }
  };
  visit(value, 0);
  return [...new Set(result)];
}

function patternBaseLength(key: string): number {
  const star = key.indexOf("*");
  return star === -1 ? key.length : star + 1;
}

/** Node.js `PATTERN_KEY_COMPARE`: longer prefix before `*` first, then longer key. */
function comparePatternKeys(a: string, b: string): number {
  return patternBaseLength(b) - patternBaseLength(a) || b.length - a.length;
}

/**
 * Match a key (`./sub`, `#x`) against a subpath map as Node.js does: an exact key without `*` first, then
 * keys with a single `*` by decreasing specificity; `*` matches at least one character and is substituted
 * into every `*` of the targets.
 *
 * @param conditions - active conditions matched in key order (see {@link targetStrings}).
 */
export function matchSubpath(
  map: JsonObject,
  key: string,
  conditions?: ReadonlySet<string>,
): SubpathMatch | undefined {
  if (!key.includes("*") && Object.hasOwn(map, key)) {
    return { key, targets: targetStrings(map[key], conditions) };
  }
  const patterns = Object.keys(map)
    .filter(
      (candidate) =>
        candidate.indexOf("*") !== -1 && candidate.indexOf("*") === candidate.lastIndexOf("*"),
    )
    .sort(comparePatternKeys);
  for (const pattern of patterns) {
    const star = pattern.indexOf("*");
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (!key.startsWith(prefix) || key === prefix) continue;
    if (suffix !== "" && (!key.endsWith(suffix) || key.length < pattern.length)) continue;
    const matched = key.slice(prefix.length, key.length - suffix.length);
    return {
      key: pattern,
      targets: targetStrings(map[pattern], conditions).map((target) =>
        target.split("*").join(matched),
      ),
    };
  }
  return undefined;
}

/**
 * The `exports` field as a subpath map: a string, an array or a conditions object (no key starting with
 * `.`) is sugar for `{ ".": value }`; in a map that mixes subpaths and conditions only the subpaths count.
 * Undefined when the package declares no exports (`exports` absent or `null`).
 */
export function exportsMap(exportsField: unknown): JsonObject | undefined {
  if (exportsField === undefined || exportsField === null) return undefined;
  if (typeof exportsField === "string" || Array.isArray(exportsField)) return { ".": exportsField };
  if (!isJsonObject(exportsField)) return {};
  const keys = Object.keys(exportsField);
  if (!keys.some((key) => key.startsWith("."))) return { ".": exportsField };
  return Object.fromEntries(
    keys.filter((key) => key.startsWith(".")).map((key) => [key, exportsField[key]]),
  );
}
