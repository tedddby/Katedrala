/**
 * Workspace declarations: which directories are monorepo roots and which packages belong to them.
 *
 * Sources: the `workspaces` field of `package.json` (npm, Yarn, Bun; an array or `{ packages: [...] }`),
 * `pnpm-workspace.yaml` (`packages:` list) and `lerna.json` (`packages`, default `["packages/*"]`).
 */
import { compareStrings, isWithin } from "@katedrala/ir";
import { WorkspaceGlob } from "./globs.js";
import { isJsonObject } from "./json.js";
import type { JsonObject } from "./json.js";

/** Default package locations of Lerna when `lerna.json` lists none. */
export const LERNA_DEFAULT_PACKAGES: readonly string[] = Object.freeze(["packages/*"]);

/** A directory declaring a workspace, with its package patterns (relative to the directory). */
export interface WorkspaceRoot {
  directory: string;
  patterns: readonly string[];
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * The workspace patterns of a `package.json` (`workspaces` as an array, or `{ packages: [...] }`);
 * undefined when the manifest declares no workspace.
 */
export function manifestWorkspacePatterns(manifest: JsonObject): string[] | undefined {
  const workspaces = manifest.workspaces;
  const direct = stringArray(workspaces);
  if (direct !== undefined) return direct;
  if (isJsonObject(workspaces)) return stringArray(workspaces.packages);
  return undefined;
}

/** The package patterns of a parsed `lerna.json` (Lerna's default when it lists none). */
export function lernaPackagePatterns(lerna: JsonObject): string[] {
  return stringArray(lerna.packages) ?? [...LERNA_DEFAULT_PACKAGES];
}

function stripComment(text: string): string {
  // A YAML comment starts with `#` at the start of the text or after whitespace.
  const match = /(?:^|\s)#/.exec(text);
  return (match === null ? text : text.slice(0, match.index)).trim();
}

function unquote(text: string): string | undefined {
  const value = text.trim();
  if (value.startsWith('"')) {
    let result = "";
    for (let index = 1; index < value.length; index++) {
      const character = value[index] ?? "";
      if (character === "\\") {
        const next = value[index + 1] ?? "";
        result += next === "n" ? "\n" : next === "t" ? "\t" : next;
        index++;
      } else if (character === '"') {
        return result;
      } else {
        result += character;
      }
    }
    return undefined;
  }
  if (value.startsWith("'")) {
    let result = "";
    for (let index = 1; index < value.length; index++) {
      const character = value[index] ?? "";
      if (character === "'") {
        if (value[index + 1] === "'") {
          result += "'";
          index++;
        } else {
          return result;
        }
      } else {
        result += character;
      }
    }
    return undefined;
  }
  const plain = stripComment(value);
  return plain === "" ? undefined : plain;
}

function splitFlowSequence(body: string): string[] {
  const items: string[] = [];
  let current = "";
  let quote: string | undefined;
  for (const character of body) {
    if (quote !== undefined) {
      current += character;
      if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") {
      quote = character;
      current += character;
    } else if (character === ",") {
      items.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  items.push(current);
  return items;
}

/**
 * Extract the `packages:` list of a `pnpm-workspace.yaml` with a small line-based parser. Supported YAML
 * subset:
 *
 * - a top-level `packages:` key at the start of a line;
 * - followed by a block sequence: lines `- item` (any indentation, including none), where blank lines and
 *   comment lines may appear in between, ending at the first other non-blank line;
 * - or a single-line flow sequence: `packages: [a, 'b', "c"]`;
 * - items are plain, single-quoted (`''` escapes `'`) or double-quoted (backslash escapes) scalars; `#`
 *   comments after whitespace are ignored; negated patterns (`!**\/test/**`) are returned as written.
 *
 * Anchors, aliases, tags, multi-line scalars and multi-line flow sequences are not supported (such items
 * are skipped). Returns `[]` when there is no `packages:` key.
 */
export function parsePnpmWorkspacePackages(text: string): string[] {
  const lines = text.split(/\r?\n|\r/);
  const keyIndex = lines.findIndex((line) => /^packages\s*:/.test(line));
  if (keyIndex === -1) return [];
  const keyLine = lines[keyIndex] ?? "";
  const inline = stripComment(keyLine.slice(keyLine.indexOf(":") + 1));
  if (inline !== "") {
    if (!inline.startsWith("[") || !inline.endsWith("]")) return [];
    return splitFlowSequence(inline.slice(1, -1))
      .map(unquote)
      .filter((item): item is string => item !== undefined && item !== "");
  }
  const items: string[] = [];
  for (const line of lines.slice(keyIndex + 1)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const item = /^\s*-(?:\s+(.*))?$/.exec(line);
    if (item === null) break;
    const value = item[1] === undefined ? undefined : unquote(item[1]);
    if (value !== undefined && value !== "") items.push(value);
  }
  return items;
}

interface CompiledRoot {
  directory: string;
  depth: number;
  include: WorkspaceGlob[];
  exclude: WorkspaceGlob[];
}

/** Workspace roots and their package patterns; answers which workspace a package belongs to. */
export class WorkspaceIndex {
  readonly #roots: readonly CompiledRoot[];

  /** @param roots - workspace roots; several entries for one directory are merged. */
  constructor(roots: readonly WorkspaceRoot[]) {
    const patternsByDirectory = new Map<string, string[]>();
    for (const root of roots) {
      const patterns = patternsByDirectory.get(root.directory) ?? [];
      patterns.push(...root.patterns);
      patternsByDirectory.set(root.directory, patterns);
    }
    this.#roots = [...patternsByDirectory.entries()]
      .sort(([a], [b]) => compareStrings(a, b))
      .map(([directory, patterns]) => {
        const include: WorkspaceGlob[] = [];
        const exclude: WorkspaceGlob[] = [];
        for (const raw of patterns) {
          const negated = raw.startsWith("!");
          const pattern = (negated ? raw.slice(1) : raw).replace(/^\.\//, "").replace(/\/+$/, "");
          (negated ? exclude : include).push(new WorkspaceGlob(pattern));
        }
        return {
          directory,
          depth: directory === "" ? 0 : directory.split("/").length,
          include,
          exclude,
        };
      });
  }

  /** Directories that declare a workspace, sorted. */
  get rootDirectories(): string[] {
    return this.#roots.map((root) => root.directory);
  }

  /** Whether `directory` declares a workspace. */
  isRoot(directory: string): boolean {
    return this.#roots.some((root) => root.directory === directory);
  }

  /**
   * How closely a package belongs to the workspace of an importing directory: the depth of the deepest
   * workspace root that contains `fromDirectory` and has `packageDirectory` as its own directory or as a
   * member; -1 when there is none.
   */
  affinity(packageDirectory: string, fromDirectory: string): number {
    let best = -1;
    for (const root of this.#roots) {
      if (root.depth <= best || !isWithin(fromDirectory, root.directory)) continue;
      if (this.#isMember(root, packageDirectory)) best = root.depth;
    }
    return best;
  }

  #isMember(root: CompiledRoot, packageDirectory: string): boolean {
    if (packageDirectory === root.directory) return true;
    if (!isWithin(packageDirectory, root.directory)) return false;
    const relative =
      root.directory === "" ? packageDirectory : packageDirectory.slice(root.directory.length + 1);
    return (
      root.include.some((glob) => glob.matches(relative)) &&
      !root.exclude.some((glob) => glob.matches(relative))
    );
  }
}
