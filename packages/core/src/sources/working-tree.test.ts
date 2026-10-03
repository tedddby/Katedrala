import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { silentLogger, type Logger } from "@katedrala/plugin-api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SnapshotSourceError } from "./errors.js";
import { WorkingTreeSource } from "./working-tree.js";

const decoder = new TextDecoder();

function gitAvailable(): boolean {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const hasGit = gitAvailable();
let scratch = "";
const savedEnvironment: Record<string, string | undefined> = {};

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), "katedrala-core-wt-"));
  // Isolate git from the user's and the system's configuration (excludes files, autocrlf, signing).
  const emptyConfig = join(scratch, "empty.gitconfig");
  await writeFile(emptyConfig, "");
  for (const [name, value] of Object.entries({
    GIT_CONFIG_GLOBAL: emptyConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.com",
    GIT_AUTHOR_DATE: "2024-05-06T07:08:09+02:00",
    GIT_COMMITTER_DATE: "2024-05-06T07:08:09+02:00",
  })) {
    savedEnvironment[name] = process.env[name];
    process.env[name] = value;
  }
});

afterAll(async () => {
  for (const [name, value] of Object.entries(savedEnvironment)) {
    if (value === undefined) Reflect.deleteProperty(process.env, name);
    else process.env[name] = value;
  }
  await rm(scratch, { recursive: true, force: true });
});

let counter = 0;
async function newDirectory(): Promise<string> {
  const directory = join(scratch, `case-${++counter}`);
  await mkdir(directory, { recursive: true });
  return directory;
}

async function writeTree(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, ...path.split("/"));
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  }
}

function git(cwd: string, ...args: string[]): string {
  // Standard error is piped (and reported only when git fails), keeping warnings such as CRLF ones quiet.
  return execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
}

/** Create a symbolic link; false when the platform does not allow it (e.g. Windows without privileges). */
async function tryLink(target: string, path: string, kind: "file" | "dir"): Promise<boolean> {
  try {
    await symlink(target, path, kind === "dir" && process.platform === "win32" ? "junction" : kind);
    return true;
  } catch {
    return false;
  }
}

function commitAll(root: string, message = "Commit"): void {
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "--no-verify", "-m", message);
}

/** Make git's cached stat data stale, as copying, extracting or checking out files does. */
async function touch(root: string, ...paths: string[]): Promise<void> {
  const later = new Date(Date.now() + 120_000);
  for (const path of paths) await utimes(join(root, ...path.split("/")), later, later);
}

/** The `dirty` flag of a fresh source over `root`. */
async function dirtyOf(root: string): Promise<boolean | undefined> {
  return (await (await WorkingTreeSource.open(root)).revision())?.dirty;
}

/** A logger keeping warnings. */
function warningLogger(): { logger: Logger; warnings: string[] } {
  const warnings: string[] = [];
  return { logger: { ...silentLogger, warn: (message) => warnings.push(message) }, warnings };
}

/** A path usable inside a shell command on every platform (Git for Windows runs commands with `sh`). */
function shellPath(path: string): string {
  return path.split("\\").join("/");
}

const IGNORE_TREE: Record<string, string> = {
  ".gitignore": "*.log\nbuild/\n!keep.log\n/root-only.txt\n",
  "a.ts": "export const a = 1;\n",
  "keep.log": "kept\n",
  "debug.log": "ignored\n",
  "root-only.txt": "ignored at the root\n",
  "build/out.js": "ignored directory\n",
  "docs/build/page.html": "ignored at any depth\n",
  "docs/guide.md": "# Guide\n",
  "src/.gitignore": "generated/\n*.tmp\n!important.log\n",
  "src/index.ts": "export * from './nested/deep/file';\n",
  "src/important.log": "re-included by the deeper .gitignore\n",
  "src/root-only.txt": "not anchored here\n",
  "src/x.tmp": "ignored\n",
  "src/generated/g.ts": "ignored\n",
  "src/nested/deep/file.md": "deep\n",
  "node_modules/pkg/index.js": "always excluded\n",
  "src/node_modules/x.js": "always excluded\n",
  ".katedrala/cache.json": "{}\n",
};

const IGNORE_TREE_LISTING = [
  ".gitignore",
  "a.ts",
  "docs/guide.md",
  "keep.log",
  "src/.gitignore",
  "src/important.log",
  "src/index.ts",
  "src/nested/deep/file.md",
  "src/root-only.txt",
];

describe("WorkingTreeSource.open", () => {
  it("requires an absolute path to a directory", async () => {
    await expect(WorkingTreeSource.open("relative/path")).rejects.toMatchObject({
      code: "invalid-root",
    });
    await expect(WorkingTreeSource.open(join(scratch, "does-not-exist"))).rejects.toBeInstanceOf(
      SnapshotSourceError,
    );
    const file = join(await newDirectory(), "file.txt");
    await writeFile(file, "x");
    await expect(WorkingTreeSource.open(file)).rejects.toMatchObject({ code: "invalid-root" });
  });
});

describe("WorkingTreeSource without git", () => {
  it("walks the tree honouring every .gitignore and never following links", async () => {
    const root = await newDirectory();
    await writeTree(root, { ...IGNORE_TREE, ".git/config": "[core]\n" });
    const fileLink = await tryLink(join(root, "a.ts"), join(root, "link.ts"), "file");
    const directoryLink = await tryLink(join(root, "src"), join(root, "src-link"), "dir");

    const source = await WorkingTreeSource.open(root, { useGit: false });
    expect(source.kind).toBe("working-tree");
    expect(source.usesGit).toBe(false);
    const entries = await source.list();
    expect(entries.map((entry) => entry.path)).toEqual(IGNORE_TREE_LISTING);
    expect(entries.find((entry) => entry.path === "a.ts")?.size).toBe(20);
    const skipped = [...(fileLink ? ["link.ts"] : []), ...(directoryLink ? ["src-link"] : [])];
    expect(await source.skipped()).toEqual(skipped);

    expect(decoder.decode(await source.read("src/index.ts"))).toBe(IGNORE_TREE["src/index.ts"]);
    await expect(source.read("debug.log")).rejects.toMatchObject({ code: "unlisted-path" });
    await expect(source.read("node_modules/pkg/index.js")).rejects.toMatchObject({
      code: "unlisted-path",
    });
    if (fileLink) await expect(source.read("link.ts")).rejects.toBeInstanceOf(SnapshotSourceError);

    expect(await source.revision()).toBeUndefined();
    expect(await source.subdirectory()).toBeUndefined();
    expect(await source.remote()).toBeUndefined();
    expect(await source.readAncestor("a.ts")).toBeUndefined();
    await source.close();
    await source.close();
  });

  it("reports a file deleted after listing as a read failure", async () => {
    const root = await newDirectory();
    await writeTree(root, { "a.ts": "a", "b.ts": "b" });
    const source = await WorkingTreeSource.open(root, { useGit: false });
    expect((await source.list()).map((entry) => entry.path)).toEqual(["a.ts", "b.ts"]);
    await unlink(join(root, "b.ts"));
    await expect(source.read("b.ts")).rejects.toMatchObject({ code: "read-failed", path: "b.ts" });
  });
});

describe.runIf(hasGit)("WorkingTreeSource with git", () => {
  it("lists exactly what the .gitignore-aware walk lists for untracked files", async () => {
    const root = await newDirectory();
    await writeTree(root, IGNORE_TREE);
    const fileLink = await tryLink(join(root, "a.ts"), join(root, "link.ts"), "file");
    const directoryLink = await tryLink(join(root, "src"), join(root, "src-link"), "dir");
    const walked = await WorkingTreeSource.open(root, { useGit: false });
    git(root, "init", "--quiet");
    const listed = await WorkingTreeSource.open(root);
    expect(listed.usesGit).toBe(true);
    expect(await listed.list()).toEqual(await walked.list());
    expect((await listed.list()).map((entry) => entry.path)).toEqual(IGNORE_TREE_LISTING);
    expect(await listed.skipped()).toEqual(await walked.skipped());
    expect(await listed.skipped()).toEqual([
      ...(fileLink ? ["link.ts"] : []),
      ...(directoryLink ? ["src-link"] : []),
    ]);
    // No commit yet (unborn branch): no revision, but files are listed.
    expect(await listed.revision()).toBeUndefined();
    expect(await listed.subdirectory()).toBe("");
  });

  it("lists tracked and untracked files, drops deleted and ignored ones, reads revision metadata", async () => {
    const root = await newDirectory();
    await writeTree(root, {
      ".gitignore": "*.log\n",
      "README.md": "# Shop\n",
      "src/a.ts": "export const a = 1;\n",
      "src/deleted.ts": "export {};\n",
      "sub/pkg/package.json": '{ "name": "pkg" }\n',
      "sub/pkg/src/x.ts": "export const x = 1;\n",
      "node_modules/lib.js": "committed by mistake\n",
    });
    git(root, "init", "--quiet");
    git(root, "add", "--all", "--force");
    git(root, "commit", "--quiet", "--no-verify", "-m", "Initial commit");
    git(root, "remote", "add", "origin", "git@GitHub.com:Acme/Shop.git");
    const head = git(root, "rev-parse", "HEAD").trim();

    // A clean working tree.
    const clean = await WorkingTreeSource.open(root);
    expect(await clean.revision()).toEqual({
      commit: head,
      committedAt: "2024-05-06T05:08:09.000Z",
      subject: "Initial commit",
      dirty: false,
    });
    expect(await clean.remote()).toBe("github.com/Acme/Shop");
    expect(await clean.subdirectory()).toBe("");

    // Untracked, ignored and deleted files.
    await writeTree(root, { "src/new.ts": "export const n = 1;\n", "debug.log": "ignored\n" });
    await unlink(join(root, "src", "deleted.ts"));
    await mkdir(join(root, "nested-repo"));
    git(join(root, "nested-repo"), "init", "--quiet");
    await writeTree(root, { "nested-repo/inner.ts": "export {};\n" });
    const symlinked = await tryLink(join(root, "README.md"), join(root, "readme-link.md"), "file");

    const source = await WorkingTreeSource.open(root);
    expect((await source.list()).map((entry) => entry.path)).toEqual([
      ".gitignore",
      "README.md",
      "src/a.ts",
      "src/new.ts",
      "sub/pkg/package.json",
      "sub/pkg/src/x.ts",
    ]);
    expect(await source.skipped()).toEqual(symlinked ? ["readme-link.md"] : []);
    expect((await source.revision())?.dirty).toBe(true);
    expect(decoder.decode(await source.read("src/new.ts"))).toBe("export const n = 1;\n");
    await expect(source.read("debug.log")).rejects.toMatchObject({ code: "unlisted-path" });
  });

  it("analyzes a subdirectory relative to it and reads ancestors inside the top level only", async () => {
    const root = await newDirectory();
    await writeTree(root, {
      "tsconfig.base.json": '{ "compilerOptions": {} }\n',
      "sub/pkg/package.json": '{ "name": "pkg" }\n',
      "sub/pkg/src/x.ts": "export const x = 1;\n",
      "sub/other.ts": "export {};\n",
    });
    git(root, "init", "--quiet");
    git(root, "add", "--all");
    git(root, "commit", "--quiet", "--no-verify", "-m", "Add package");
    const outside = join(scratch, `outside-${++counter}.json`);
    await writeFile(outside, "{}");
    const escapes = await tryLink(outside, join(root, "escape.json"), "file");

    const source = await WorkingTreeSource.open(join(root, "sub", "pkg"));
    expect(await source.subdirectory()).toBe("sub/pkg");
    expect((await source.list()).map((entry) => entry.path)).toEqual(["package.json", "src/x.ts"]);
    expect(decoder.decode(await source.readAncestor("tsconfig.base.json"))).toBe(
      '{ "compilerOptions": {} }\n',
    );
    expect(decoder.decode(await source.readAncestor("./sub/other.ts"))).toBe("export {};\n");
    expect(await source.readAncestor("../outside.json")).toBeUndefined();
    expect(await source.readAncestor("sub")).toBeUndefined();
    expect(await source.readAncestor(".git/config")).toBeUndefined();
    expect(await source.readAncestor("missing.json")).toBeUndefined();
    if (escapes) expect(await source.readAncestor("escape.json")).toBeUndefined();
    expect((await source.revision())?.dirty).toBe(false);
  });

  it("does not follow a tracked directory replaced by a link", async () => {
    const root = await newDirectory();
    await writeTree(root, { "lib/a.ts": "export {};\n", "src/b.ts": "export {};\n" });
    git(root, "init", "--quiet");
    git(root, "add", "--all");
    git(root, "commit", "--quiet", "--no-verify", "-m", "Initial");
    await rm(join(root, "lib"), { recursive: true });
    if (!(await tryLink(join(root, "src"), join(root, "lib"), "dir"))) return;
    const source = await WorkingTreeSource.open(root);
    expect((await source.list()).map((entry) => entry.path)).toEqual(["src/b.ts"]);
    expect(await source.skipped()).toEqual(["lib"]);
    await expect(source.read("lib/a.ts")).rejects.toMatchObject({ code: "unlisted-path" });
  });

  it("never modifies the repository", async () => {
    const root = await newDirectory();
    await writeTree(root, { "a.ts": "a\n", "b.ts": "b\n" });
    git(root, "init", "--quiet");
    git(root, "add", "--all");
    git(root, "commit", "--quiet", "--no-verify", "-m", "Initial");
    // Make the index stale: a plain `git status` would refresh (rewrite) it.
    await writeFile(join(root, "a.ts"), "a\n");
    const index = join(root, ".git", "index");
    const before = await readFile(index);
    const source = await WorkingTreeSource.open(root);
    await source.list();
    await source.revision();
    await source.subdirectory();
    await source.remote();
    expect(Buffer.compare(await readFile(index), before)).toBe(0);
  });
});

describe.runIf(hasGit)("WorkingTreeSource never runs programs chosen by the repository", () => {
  it("runs no filter, textconv, fsmonitor, hook, pager or credential program of .git/config", async () => {
    const root = await newDirectory();
    const marker = join(scratch, `marker-${counter}.txt`);
    await writeTree(root, {
      ".gitattributes": "*.ts filter=evil diff=evil\n*.js filter=evilprocess\n",
      "src/a.ts": "export const a = 1;\n",
      "src/b.js": "exports.b = 2;\n",
      "docs/c.md": "# C\n",
      "packages/api/package.json": "{}\n",
      "packages/api/src/main.ts": "export {};\n",
      "tsconfig.base.json": "{}\n",
    });
    git(root, "init", "--quiet");
    commitAll(root, "Initial");
    // Configuration as found in a downloaded repository: every program appends its name to the marker.
    const record = (name: string): string => `echo ${name} >> "${shellPath(marker)}"`;
    const hooks = join(root, ".git", "evil-hooks");
    await mkdir(hooks);
    for (const hook of [
      "post-index-change",
      "post-checkout",
      "reference-transaction",
      "fsmonitor",
    ]) {
      await writeFile(join(hooks, hook), `#!/bin/sh\n${record(hook)}\n`);
      await chmod(join(hooks, hook), 0o755);
    }
    for (const [key, value] of [
      ["filter.evil.clean", `${record("clean")}; cat`],
      ["filter.evil.smudge", `${record("smudge")}; cat`],
      ["filter.evilprocess.process", record("process")],
      ["diff.evil.textconv", `${record("textconv")}; cat`],
      ["core.hooksPath", shellPath(hooks)],
      ["core.fsmonitor", shellPath(join(hooks, "fsmonitor"))],
      ["core.pager", record("pager")],
      ["credential.helper", `!${record("credential")}`],
      ["core.sshCommand", record("ssh")],
    ] as const) {
      git(root, "config", key, value);
    }
    // The trap is armed: with stale stat data, a plain `git status` runs the clean filter.
    await touch(root, "src/a.ts");
    try {
      execFileSync("git", ["status", "--porcelain"], { cwd: root, stdio: "ignore" });
    } catch {
      // Whatever git reports, the program ran.
    }
    expect(existsSync(marker)).toBe(true);
    await rm(marker);

    await touch(root, "src/a.ts", "src/b.js", "docs/c.md", ".gitattributes");
    const source = await WorkingTreeSource.open(root);
    expect((await source.list()).map((entry) => entry.path)).toEqual([
      ".gitattributes",
      "docs/c.md",
      "packages/api/package.json",
      "packages/api/src/main.ts",
      "src/a.ts",
      "src/b.js",
      "tsconfig.base.json",
    ]);
    expect(await source.skipped()).toEqual([]);
    expect(decoder.decode(await source.read("src/a.ts"))).toBe("export const a = 1;\n");
    expect((await source.revision())?.dirty).toBe(false);
    expect(await source.subdirectory()).toBe("");
    expect(await source.remote()).toBeUndefined();

    // A changed file under a filter driver cannot be compared without running the filter: unknown.
    await writeFile(join(root, "src", "a.ts"), "export const a = 2;\n");
    expect(await dirtyOf(root)).toBeUndefined();
    // A change git would not convert is a difference.
    await writeFile(join(root, "docs", "c.md"), "# Changed\n");
    expect(await dirtyOf(root)).toBe(true);

    const api = await WorkingTreeSource.open(join(root, "packages", "api"));
    expect(await api.subdirectory()).toBe("packages/api");
    expect(decoder.decode(await api.readAncestor("tsconfig.base.json"))).toBe("{}\n");
    expect(decoder.decode(await api.readAncestor("src/a.ts"))).toBe("export const a = 2;\n");
    expect((await api.revision())?.dirty).toBe(false);
    expect(existsSync(marker)).toBe(false);
  });

  it("never fetches the missing objects of a partial clone, so no transport program runs", async () => {
    const origin = await newDirectory();
    await writeTree(origin, { "a.ts": "export const a = 1;\n", "b.ts": "export const b = 1;\n" });
    git(origin, "init", "--quiet");
    commitAll(origin, "Initial");
    git(origin, "config", "uploadpack.allowFilter", "true");
    const clone = join(scratch, `partial-${++counter}`);
    try {
      execFileSync(
        "git",
        ["clone", "--quiet", "--no-local", "--filter=blob:none", "--no-checkout"].concat(
          pathToFileURL(origin).href,
          clone,
        ),
        { stdio: "ignore" },
      );
    } catch {
      return; // This git cannot make partial clones.
    }
    git(clone, "read-tree", "HEAD"); // An index whose blobs were never fetched.
    await writeTree(clone, { "a.ts": "export const a = 1;\n", "b.ts": "export const b = 2;\n" });
    // A promisor remote whose transport runs a program (an `ext::` URL, allowed by the repository).
    const marker = join(scratch, `marker-${counter}.txt`);
    const script = join(scratch, `fetched-${counter}.cjs`);
    await writeFile(script, 'require("node:fs").writeFileSync(process.argv[2], "fetched");\n');
    const escape = (value: string): string => value.replaceAll("%", "%%").replaceAll(" ", "% ");
    git(clone, "config", "protocol.ext.allow", "always");
    git(
      clone,
      "config",
      "remote.origin.url",
      `ext::${[process.execPath, script, marker].map(escape).join(" ")}`,
    );
    // The trap is armed: reading a missing blob with plain git runs the program.
    try {
      execFileSync("git", ["cat-file", "-p", "HEAD:b.ts"], { cwd: clone, stdio: "ignore" });
    } catch {
      // The fetch fails after the program ran.
    }
    expect(existsSync(marker)).toBe(true);
    await rm(marker);

    const source = await WorkingTreeSource.open(clone);
    expect((await source.list()).map((entry) => entry.path)).toEqual(["a.ts", "b.ts"]);
    const revision = await source.revision();
    expect(revision?.commit).toMatch(/^[0-9a-f]{40}$/);
    // The blobs' sizes are unknown without fetching them, so whether b.ts changed is unknown.
    expect(revision?.dirty).toBeUndefined();
    expect(existsSync(marker)).toBe(false);
  });
});

describe.runIf(hasGit)("WorkingTreeSource listing with git", () => {
  it("skips a committed symbolic link however git checked it out (core.symlinks=false)", async () => {
    const root = await newDirectory();
    await writeTree(root, { "a.ts": "export const a = 1;\n" });
    git(root, "init", "--quiet");
    git(root, "config", "core.symlinks", "false");
    const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], {
      cwd: root,
      input: "a.ts",
      encoding: "utf8",
    }).trim();
    // `link.ts -> a.ts` as committed on Linux or macOS (mode 120000).
    git(root, "update-index", "--add", "--cacheinfo", `120000,${blob},link.ts`);
    git(root, "add", "a.ts");
    git(root, "commit", "--quiet", "--no-verify", "-m", "Add a link");
    git(root, "checkout", "--", "link.ts");
    // Git for Windows' default: the link is written as a regular file holding its target.
    expect(await readFile(join(root, "link.ts"), "utf8")).toBe("a.ts");

    const source = await WorkingTreeSource.open(root);
    expect(await source.list()).toEqual([{ path: "a.ts", size: 20 }]);
    expect(await source.skipped()).toEqual(["link.ts"]);
    await expect(source.read("link.ts")).rejects.toMatchObject({ code: "unlisted-path" });
    expect((await source.revision())?.dirty).toBe(false);
  });

  it("drops a submodule path whatever the working tree holds there", async () => {
    const root = await newDirectory();
    await writeTree(root, { "a.ts": "export const a = 1;\n" });
    git(root, "init", "--quiet");
    commitAll(root, "Initial");
    const commit = git(root, "rev-parse", "HEAD").trim();
    git(root, "update-index", "--add", "--cacheinfo", `160000,${commit},vendored`);
    git(root, "commit", "--quiet", "--no-verify", "-m", "Add a submodule");
    await rm(join(root, "vendored"), { recursive: true, force: true });
    await writeFile(join(root, "vendored"), "not the submodule\n");

    const source = await WorkingTreeSource.open(root);
    expect((await source.list()).map((entry) => entry.path)).toEqual(["a.ts"]);
    expect(await source.skipped()).toEqual([]);
    expect((await source.revision())?.dirty).toBe(false);
  });

  it("walks a root that its repository ignores, and says so", async () => {
    const top = await newDirectory();
    await writeTree(top, {
      ".gitignore": "sandbox/\n",
      "README.md": "# Top\n",
      "sandbox/app/.gitignore": "*.log\n",
      "sandbox/app/package.json": "{}\n",
      "sandbox/app/src/index.ts": "export const x = 1;\n",
      "sandbox/app/debug.log": "ignored by the app\n",
    });
    git(top, "init", "--quiet");
    commitAll(top, "Initial");

    const { logger, warnings } = warningLogger();
    const source = await WorkingTreeSource.open(join(top, "sandbox", "app"), { logger });
    expect(source.usesGit).toBe(false);
    expect((await source.list()).map((entry) => entry.path)).toEqual([
      ".gitignore",
      "package.json",
      "src/index.ts",
    ]);
    expect(await source.revision()).toBeUndefined();
    expect(await source.subdirectory()).toBeUndefined();
    expect(await source.readAncestor("README.md")).toBeUndefined();
    expect(warnings).toEqual([expect.stringContaining("ignored by its git repository")]);

    // Roots that are not ignored keep git.
    const quiet = warningLogger();
    expect((await WorkingTreeSource.open(top, { logger: quiet.logger })).usesGit).toBe(true);
    await mkdir(join(top, "lib"));
    expect((await WorkingTreeSource.open(join(top, "lib"), { logger: quiet.logger })).usesGit).toBe(
      true,
    );
    expect(quiet.warnings).toEqual([]);
  });
});

describe.runIf(hasGit)("WorkingTreeSource.readAncestor", () => {
  it("matches paths exactly, serves only files git lists outside the root, never .git or node_modules", async () => {
    const root = await newDirectory();
    await writeTree(root, {
      ".gitignore": "local.json\nignored/\nnode_modules/\n",
      "tsconfig.base.json": '{ "base": true }\n',
      "local.json": "machine-specific\n",
      "ignored/x.json": "{}\n",
      "node_modules/pkg/index.js": "module.exports = 1;\n",
      "packages/api/tsconfig.json": '{ "extends": "../../tsconfig.base.json" }\n',
      "packages/api/.gitignore": "local.tsconfig.json\n",
      "packages/api/local.tsconfig.json": "{}\n",
      "packages/api/src/main.ts": "export {};\n",
      "packages/api-client/tsconfig.json": '{ "client": true }\n',
      "packages/other/tsconfig.json": "{}\n",
    });
    git(root, "init", "--quiet");
    git(root, "config", "core.symlinks", "false");
    commitAll(root, "Initial");
    const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], {
      cwd: root,
      input: "tsconfig.base.json",
      encoding: "utf8",
    }).trim();
    git(root, "update-index", "--add", "--cacheinfo", `120000,${blob},linked.json`);
    git(root, "commit", "--quiet", "--no-verify", "-m", "Add a link");
    git(root, "checkout", "--", "linked.json");
    await writeFile(join(root, "untracked.json"), "{}\n");
    const linkedDirectory = await tryLink(
      join(root, "packages", "other"),
      join(root, "other-link"),
      "dir",
    );

    const source = await WorkingTreeSource.open(join(root, "packages", "api"));
    const read = async (path: string): Promise<string | undefined> => {
      const bytes = await source.readAncestor(path);
      return bytes === undefined ? undefined : decoder.decode(bytes);
    };
    expect(await read("tsconfig.base.json")).toBe('{ "base": true }\n');
    expect(await read("packages/other/tsconfig.json")).toBe("{}\n");
    // A sibling whose name extends the root's is outside the root.
    expect(await read("packages/api-client/tsconfig.json")).toBe('{ "client": true }\n');
    expect(await read("untracked.json")).toBe("{}\n");
    // Exact case, whatever the file system (a case-insensitive one would resolve these).
    expect(await read("TSConfig.Base.json")).toBeUndefined();
    expect(await read("tsconfig.BASE.json")).toBeUndefined();
    expect(await read("Packages/other/tsconfig.json")).toBeUndefined();
    // Ignored files, which are not part of any commit.
    expect(await read("local.json")).toBeUndefined();
    expect(await read("ignored/x.json")).toBeUndefined();
    // Files inside the analysis root are read() only, and unlisted ones not at all.
    expect(await read("packages/api/tsconfig.json")).toBeUndefined();
    expect(await read("packages/api/local.tsconfig.json")).toBeUndefined();
    expect(await read("packages/api")).toBeUndefined();
    // A committed symbolic link, checked out as a regular file holding its target.
    expect(await read("linked.json")).toBeUndefined();
    if (linkedDirectory) expect(await read("other-link/tsconfig.json")).toBeUndefined();
    // Git internals and installed packages, in any case.
    for (const path of [
      ".git/config",
      ".GIT/config",
      ".Git/HEAD",
      "node_modules/pkg/index.js",
      "Node_Modules/pkg/index.js",
      "NODE_MODULES/pkg/index.js",
    ]) {
      expect(await read(path)).toBeUndefined();
    }
  });
});

describe.runIf(hasGit)("WorkingTreeSource dirty state", () => {
  it("compares tracked files' content with the index and the index with HEAD", async () => {
    const root = await newDirectory();
    await writeTree(root, {
      "a.ts": "export const a = 1;\n",
      "b.ts": "export const b = 2;\n",
      "docs/c.md": "# C\n",
    });
    git(root, "init", "--quiet");
    commitAll(root, "Initial");
    expect(await dirtyOf(root)).toBe(false);

    // Line endings alone are not a difference (Katedrala normalizes them); untracked files do not count.
    await writeFile(join(root, "a.ts"), "export const a = 1;\r\n");
    await writeFile(join(root, "new.ts"), "export {};\n");
    await touch(root, "b.ts");
    expect(await dirtyOf(root)).toBe(false);

    // A changed file, also when its size does not change.
    await writeFile(join(root, "b.ts"), "export const b = 3;\n");
    expect(await dirtyOf(root)).toBe(true);
    git(root, "checkout", "--", "b.ts");
    expect(await dirtyOf(root)).toBe(false);

    // A deleted file.
    await unlink(join(root, "docs", "c.md"));
    expect(await dirtyOf(root)).toBe(true);
    git(root, "checkout", "--", "docs/c.md");

    // A staged change whose working-tree file was restored: the index differs from HEAD.
    await writeFile(join(root, "b.ts"), "export const b = 4;\n");
    git(root, "add", "b.ts");
    await writeFile(join(root, "b.ts"), "export const b = 2;\n");
    expect(await dirtyOf(root)).toBe(true);
    git(root, "reset", "--quiet", "--", "b.ts");
    expect(await dirtyOf(root)).toBe(false);

    // Files git is told not to look at.
    git(root, "update-index", "--assume-unchanged", "b.ts");
    await writeFile(join(root, "b.ts"), "export const b = 5;\n");
    git(root, "update-index", "--skip-worktree", "docs/c.md");
    await unlink(join(root, "docs", "c.md"));
    expect(await dirtyOf(root)).toBe(false);
  });

  it("matches files checked out with CRLF line endings (core.autocrlf=true)", async () => {
    const root = await newDirectory();
    git(root, "init", "--quiet");
    git(root, "config", "core.autocrlf", "true");
    // Lines as long as the hashing buffer put CRLF pairs across read boundaries.
    const line = `${"x".repeat(64 * 1024 - 1)}\n`;
    await writeTree(root, {
      "a.ts": "export const a = 1;\nexport {};\n",
      "long.txt": line.repeat(3),
    });
    commitAll(root, "Initial");
    await rm(join(root, "a.ts"));
    await rm(join(root, "long.txt"));
    git(root, "checkout", "--", ".");
    expect(await readFile(join(root, "a.ts"), "utf8")).toBe(
      "export const a = 1;\r\nexport {};\r\n",
    );
    expect(await dirtyOf(root)).toBe(false);
    await writeFile(join(root, "long.txt"), `${line.repeat(2)}${"y".repeat(64 * 1024 - 1)}\r\n`);
    expect(await dirtyOf(root)).toBe(true);
  });

  it("is unknown when only files under a filter driver differ (e.g. Git LFS pointers)", async () => {
    const root = await newDirectory();
    const pointer = `version https://git-lfs.github.com/spec/v1\noid sha256:${"0".repeat(64)}\nsize 2048\n`;
    await writeTree(root, {
      ".gitattributes": "*.png filter=lfs diff=lfs merge=lfs -text\n",
      "logo.png": pointer,
      "a.ts": "export const a = 1;\n",
    });
    git(root, "init", "--quiet");
    commitAll(root, "Initial");
    expect(await dirtyOf(root)).toBe(false);
    // What Git LFS writes on checkout: the real content, not the committed pointer.
    await writeFile(join(root, "logo.png"), Buffer.alloc(2048, 7));
    expect(await dirtyOf(root)).toBeUndefined();
    await writeFile(join(root, "a.ts"), "export const a = 2;\n");
    expect(await dirtyOf(root)).toBe(true);
  });

  it("reports unmerged paths as dirty", async () => {
    const root = await newDirectory();
    await writeTree(root, { "a.ts": "export const a = 1;\n" });
    git(root, "init", "--quiet");
    commitAll(root, "Initial");
    git(root, "checkout", "--quiet", "-b", "other");
    await writeFile(join(root, "a.ts"), "export const a = 2;\n");
    commitAll(root, "Other");
    git(root, "checkout", "--quiet", "-");
    await writeFile(join(root, "a.ts"), "export const a = 3;\n");
    commitAll(root, "Mine");
    try {
      execFileSync("git", ["merge", "--quiet", "other"], { cwd: root, stdio: "ignore" });
    } catch {
      // A conflict.
    }
    expect(git(root, "ls-files", "--unmerged")).not.toBe("");
    expect(await dirtyOf(root)).toBe(true);
  });

  it("supports SHA-256 repositories", async () => {
    const root = await newDirectory();
    try {
      execFileSync("git", ["init", "--quiet", "--object-format=sha256"], {
        cwd: root,
        stdio: "ignore",
      });
    } catch {
      return; // This git has no SHA-256 support.
    }
    await writeTree(root, { "a.ts": "export const a = 1;\n" });
    commitAll(root, "Initial");
    const revision = await (await WorkingTreeSource.open(root)).revision();
    expect(revision?.commit).toMatch(/^[0-9a-f]{64}$/);
    expect(revision?.dirty).toBe(false);
    await writeFile(join(root, "a.ts"), "export const a = 2;\n");
    expect(await dirtyOf(root)).toBe(true);
  });
});
