/**
 * Running git for the working-tree source, and reading its output.
 *
 * Katedrala may analyze a directory whose `.git` came from an untrusted source (an archive, a CI artifact, a
 * downloaded repository), so git must never start a program chosen by the repository's configuration. Git is
 * executed directly (no shell), read-only and non-interactively, and only these subcommands are used:
 * `rev-parse`, `ls-files`, `ls-tree`, `cat-file --batch-check`, `check-attr`, `check-ignore`, `log` (the date
 * and subject of one commit) and `config --get`. None of them reads working-tree content through git's
 * conversions, so filter drivers (`clean`, `smudge`, `process`), `textconv` and external diff drivers never
 * run; none of them runs hooks or writes the index. `git status` and `git diff` are deliberately not used:
 * they re-hash files whose cached stat data is stale, through the filter `.gitattributes` selects.
 *
 * Every invocation also gets:
 * - `--no-optional-locks`: no optional lock and no index refresh;
 * - `-c core.fsmonitor=false`: no file-system monitor hook configured by the repository;
 * - `-c core.virtualFilesystem=`: no virtual-file-system hook (a setting of Microsoft's git fork, ignored by
 *   other builds);
 * - `-c log.showSignature=false`: no signature verification (`gpg.program`);
 * - `-c core.quotepath=off`: paths printed verbatim;
 * - `GIT_NO_LAZY_FETCH=1` and an empty `GIT_ALLOW_PROTOCOL`: a partial clone never fetches a missing object
 *   from its promisor remote, so no transport, remote helper, `core.sshCommand` or credential helper runs
 *   (git before 2.44 ignores the first variable; the second rejects every transport in any version);
 * - `GIT_TERMINAL_PROMPT=0`: no prompt.
 */
import { execFile } from "node:child_process";

/** Upper bound on git's output (`git ls-files` of very large repositories). */
const GIT_MAX_BUFFER = 1024 * 1024 * 1024;

const GIT_GLOBAL_OPTIONS = [
  "--no-optional-locks",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.virtualFilesystem=",
  "-c",
  "log.showSignature=false",
  "-c",
  "core.quotepath=off",
] as const;

const GIT_ENVIRONMENT = {
  GIT_NO_LAZY_FETCH: "1",
  GIT_ALLOW_PROTOCOL: "",
  GIT_TERMINAL_PROMPT: "0",
} as const;

/** Error from a git invocation; `exitCode` is undefined when git could not be started. */
export class GitCommandError extends Error {
  /** Exit code of git, when it ran. */
  readonly exitCode?: number;

  constructor(message: string, exitCode: number | undefined, cause: unknown) {
    super(message, { cause });
    this.name = "GitCommandError";
    if (exitCode !== undefined) this.exitCode = exitCode;
  }
}

/** Options of {@link runGit}. */
export interface RunGitOptions {
  /** Text written to git's standard input (default: none; standard input is closed). */
  input?: string;
}

/**
 * Run `git <args>` in `cwd` and resolve with its standard output (UTF-8). Rejects with a
 * {@link GitCommandError} when git cannot be started or exits with a non-zero code.
 */
export function runGit(
  cwd: string,
  args: readonly string[],
  options: RunGitOptions = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "git",
      [...GIT_GLOBAL_OPTIONS, ...args],
      {
        cwd,
        env: { ...process.env, ...GIT_ENVIRONMENT },
        encoding: "utf8",
        maxBuffer: GIT_MAX_BUFFER,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve(stdout);
          return;
        }
        const exitCode = typeof error.code === "number" ? error.code : undefined;
        const detail = stderr.trim() === "" ? error.message : stderr.trim();
        reject(new GitCommandError(`git ${args.join(" ")} failed: ${detail}`, exitCode, error));
      },
    );
    // Git may exit before reading all of its input (e.g. on an error): never fail on a closed pipe.
    child.stdin?.on("error", () => undefined);
    child.stdin?.end(options.input);
  });
}

// ─── Output parsers ──────────────────────────────────────────────────────────

/** Git's mode of a regular file and of an executable file. */
const REGULAR_FILE_MODES: ReadonlySet<string> = new Set(["100644", "100755"]);

/** Git's mode of a symbolic link. */
export const SYMBOLIC_LINK_MODE = "120000";

/** Git's mode of a gitlink (a submodule's commit). */
export const GITLINK_MODE = "160000";

/** Whether a git mode is a regular (possibly executable) file. */
export function isRegularFileMode(mode: string): boolean {
  return REGULAR_FILE_MODES.has(mode);
}

/** One index entry printed by `git ls-files -v -s` (unmerged paths have one entry per stage). */
export interface IndexEntry {
  /** Octal mode: `100644`, `100755`, `120000` (symbolic link) or `160000` (gitlink). */
  readonly mode: string;
  /** The staged blob (or commit, for a gitlink). */
  readonly objectId: string;
  /** 0 when merged; 1, 2 or 3 for the stages of an unmerged path. */
  readonly stage: number;
  /** The entry is outside the sparse checkout (`skip-worktree`): its file is not expected on disk. */
  readonly skipWorktree: boolean;
  /** The entry is marked `assume-unchanged`: git does not look at its file. */
  readonly assumeUnchanged: boolean;
}

/** The output of `git ls-files -z -v -s --cached --others`. */
export interface IndexListing {
  /** Index entries by path (relative to the directory git ran in), in output order. */
  readonly tracked: ReadonlyMap<string, readonly IndexEntry[]>;
  /** Untracked paths, in output order (untracked nested repositories end with `/`). */
  readonly untracked: readonly string[];
}

const INDEX_RECORD = /^([A-Za-z]) ([0-7]{6}) ([0-9a-f]{40}|[0-9a-f]{64}) ([0-3])\t([\s\S]+)$/;

/**
 * Parse the output of `git ls-files -z -v -s --cached --others`: `? <path>` for an untracked path and
 * `<tag> <mode> <object> <stage>\t<path>` for an index entry, where the tag is `H` (cached), `S`
 * (skip-worktree) or `M` (unmerged), in lower case when the entry is marked assume-unchanged.
 *
 * @throws {Error} for a record of any other form.
 */
export function parseIndexListing(output: string): IndexListing {
  const tracked = new Map<string, IndexEntry[]>();
  const untracked: string[] = [];
  for (const record of output.split("\0")) {
    if (record === "") continue;
    if (record.startsWith("? ")) {
      untracked.push(record.slice(2));
      continue;
    }
    const match = INDEX_RECORD.exec(record);
    if (match === null)
      throw new Error(`Unexpected git ls-files record: ${JSON.stringify(record)}`);
    const [, tag = "", mode = "", objectId = "", stage = "", path = ""] = match;
    const entry: IndexEntry = {
      mode,
      objectId,
      stage: Number(stage),
      skipWorktree: tag.toUpperCase() === "S",
      assumeUnchanged: tag !== tag.toUpperCase(),
    };
    const entries = tracked.get(path);
    if (entries === undefined) tracked.set(path, [entry]);
    else entries.push(entry);
  }
  return { tracked, untracked };
}

/** One entry printed by `git ls-tree -r`. */
export interface TreeEntry {
  readonly mode: string;
  /** `blob`, `commit` (a gitlink) or `tree`. */
  readonly type: string;
  readonly objectId: string;
}

const TREE_RECORD = /^([0-7]{6}) ([a-z]+) ([0-9a-f]{40}|[0-9a-f]{64})\t([\s\S]+)$/;

/**
 * Parse the output of `git ls-tree -z [-r] <tree-ish>`: `<mode> <type> <object>\t<path>` per entry.
 *
 * @throws {Error} for a record of any other form.
 */
export function parseTree(output: string): Map<string, TreeEntry> {
  const entries = new Map<string, TreeEntry>();
  for (const record of output.split("\0")) {
    if (record === "") continue;
    const match = TREE_RECORD.exec(record);
    if (match === null) throw new Error(`Unexpected git ls-tree record: ${JSON.stringify(record)}`);
    const [, mode = "", type = "", objectId = "", path = ""] = match;
    entries.set(path, { mode, type, objectId });
  }
  return entries;
}

/**
 * Parse the output of `git cat-file --batch-check='%(objectname) %(objectsize)'`: the size of every object
 * that exists (`<object> missing` lines are left out).
 */
export function parseObjectSizes(output: string): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const line of output.split("\n")) {
    const match = /^([0-9a-f]{40}|[0-9a-f]{64}) (\d+)$/.exec(line.trim());
    if (match?.[1] !== undefined && match[2] !== undefined) sizes.set(match[1], Number(match[2]));
  }
  return sizes;
}

/**
 * Parse the output of `git check-attr -z <attributes...>`: `<path>\0<attribute>\0<value>\0` per path and
 * attribute, where the value is `unspecified`, `unset`, `set` or the attribute's value. Returns, per path,
 * the attributes that are set or have a value.
 */
export function parseAttributes(output: string): Map<string, Map<string, string>> {
  const fields = output.split("\0");
  const attributes = new Map<string, Map<string, string>>();
  for (let index = 0; index + 2 < fields.length; index += 3) {
    const path = fields[index] ?? "";
    const name = fields[index + 1] ?? "";
    const value = fields[index + 2] ?? "unspecified";
    let byName = attributes.get(path);
    if (byName === undefined) {
      byName = new Map();
      attributes.set(path, byName);
    }
    if (value !== "unspecified" && value !== "unset") byName.set(name, value);
  }
  return attributes;
}
