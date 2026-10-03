/**
 * Node.js built-in modules, recognized without consulting the file system.
 */

/**
 * Built-in modules that Node.js loads for a bare specifier (`fs`) as well as with the `node:` prefix
 * (`node:fs`). Only the subpaths in {@link NODE_BUILTIN_SUBPATHS} are built-ins too.
 */
export const NODE_BUILTIN_MODULES: readonly string[] = Object.freeze([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "sys",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
]);

/**
 * Built-in modules that exist only with the `node:` prefix. Node.js resolves the bare names (`test`,
 * `sqlite`, `sea`) to npm packages, so they are external packages unless written `node:test`.
 */
export const NODE_PREFIX_ONLY_BUILTIN_MODULES: readonly string[] = Object.freeze([
  "sea",
  "sqlite",
  "test",
]);

/**
 * The subpaths Node.js exposes as built-in modules (`require("module").builtinModules`, Node.js 22-25).
 * Node.js resolves any other subpath of a built-in name (`process/browser`, `util/util.js`) as a file of
 * the npm package with that name.
 */
export const NODE_BUILTIN_SUBPATHS: readonly string[] = Object.freeze([
  "assert/strict",
  "dns/promises",
  "fs/promises",
  "inspector/promises",
  "path/posix",
  "path/win32",
  "readline/promises",
  "stream/consumers",
  "stream/promises",
  "stream/web",
  "timers/promises",
  "util/types",
]);

const BARE_BUILTINS: ReadonlySet<string> = new Set([
  ...NODE_BUILTIN_MODULES,
  ...NODE_BUILTIN_SUBPATHS,
]);

/**
 * The built-in module a specifier denotes (its first segment without `node:`), or undefined when the
 * specifier is not a Node.js built-in.
 *
 * - `node:<name>[/<subpath>]` always denotes a built-in (`node:fs/promises` → `fs`).
 * - A bare specifier denotes a built-in when it is one of {@link NODE_BUILTIN_MODULES} or
 *   {@link NODE_BUILTIN_SUBPATHS} exactly (`fs/promises` → `fs`). Other subpaths (`process/browser`) and
 *   names with a trailing slash (`punycode/`) are npm packages, as in Node.js.
 *
 * Whether a bare specifier is a built-in is a matter of the name only: module resolution consults the
 * project's `paths` and `baseUrl` first, as TypeScript does.
 *
 * @example nodeBuiltinOf("node:fs/promises") === "fs"
 */
export function nodeBuiltinOf(specifier: string): string | undefined {
  if (specifier.startsWith("node:")) {
    const name = firstSegment(specifier.slice("node:".length));
    return name === "" ? undefined : name;
  }
  return BARE_BUILTINS.has(specifier) ? firstSegment(specifier) : undefined;
}

function firstSegment(specifier: string): string {
  const slash = specifier.indexOf("/");
  return slash === -1 ? specifier : specifier.slice(0, slash);
}
