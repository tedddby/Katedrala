/**
 * Mapping of declared build outputs (`main`, `exports`, `bin`, script arguments) back to the source files
 * of the snapshot. Build output is usually not committed (`dist/index.js` does not exist), but the source
 * it is compiled from (`src/index.ts`) is, and that is the file an architecture analysis must point at.
 *
 * For a declared path `P` (relative to the analysis root):
 * 1. `P` itself when the snapshot lists it.
 * 2. Without a known output extension, `P` is probed as a module path (`P.ts`, ..., `P/index.*`), then
 *    treated as the outputs `P.js` and `P/index.js`.
 * 3. Output → source through the project configuration: a `tsconfig.json` (in `P`'s directory or above)
 *    whose `outDir` (`declarationDir` for declarations) contains `P` maps `<outDir>/<rest>` to
 *    `<rootDir>/<rest>` with a source extension (see {@link rootDirectories} for the root directories).
 * 4. Heuristics relative to the package directory: the same path with source extensions; then one or two
 *    leading build directories (`dist`, `lib`, `build`, `out`, `esm`, `cjs`) replaced by `src/`, or
 *    removed.
 *
 * Source extensions per output extension: `.js` → `.ts`, `.tsx`, `.js`, `.jsx`; `.jsx` → `.tsx`, `.jsx`;
 * `.d.ts` → `.ts`, `.tsx`; `.json` → `.json`. The module-format extensions first map as `tsc` emits them,
 * then from any TypeScript/JavaScript source, because bundlers (tsup, tsdown, unbuild, pkgroll) compile
 * `src/index.ts` to `dist/index.mjs`, `dist/index.cjs`, `dist/index.d.mts` and `dist/index.d.cts`:
 * `.mjs` → `.mts`, `.mjs`, `.ts`, `.tsx`, `.cts`, `.js`, `.jsx`; `.cjs` → `.cts`, `.cjs`, `.ts`, `.tsx`,
 * `.mts`, `.js`, `.jsx`; `.d.mts` → `.mts`, `.ts`, `.tsx`; `.d.cts` → `.cts`, `.ts`, `.tsx`.
 */
import { isWithin } from "@katedrala/ir";
import type { ConfigSet } from "./config-set.js";
import { isInsideRoot, joinLoose } from "./locations.js";
import { probeFile, probeIndex } from "./probing.js";
import type { SnapshotIndex } from "./snapshot.js";

/** Leading directory names that hold build output (for the heuristic step). */
export const OUTPUT_DIRECTORY_NAMES: ReadonlySet<string> = new Set([
  "dist",
  "lib",
  "build",
  "out",
  "esm",
  "cjs",
]);

const SOURCE_EXTENSIONS: ReadonlyArray<readonly [output: string, sources: readonly string[]]> = [
  [".d.mts", [".mts", ".ts", ".tsx"]],
  [".d.cts", [".cts", ".ts", ".tsx"]],
  [".d.ts", [".ts", ".tsx"]],
  [".mjs", [".mts", ".mjs", ".ts", ".tsx", ".cts", ".js", ".jsx"]],
  [".cjs", [".cts", ".cjs", ".ts", ".tsx", ".mts", ".js", ".jsx"]],
  [".jsx", [".tsx", ".jsx"]],
  [".js", [".ts", ".tsx", ".js", ".jsx"]],
  [".json", [".json"]],
];

const SOURCE_FILE = /\.(?:ts|tsx|mts|cts)$/;

/** The output extension of a path and the source extensions it may come from. */
export function outputExtensionOf(
  path: string,
): { extension: string; sources: readonly string[] } | undefined {
  for (const [extension, sources] of SOURCE_EXTENSIONS) {
    if (path.endsWith(extension)) return { extension, sources };
  }
  return undefined;
}

/** A source file a declared path was mapped to. */
export interface MappedSource {
  path: string;
  /** The declared path when it differs from `path`. */
  mappedFrom?: string;
}

/** Maps declared (build output) paths to source files of the snapshot. */
export class OutputMapper {
  readonly #cache = new Map<string, string | null>();

  constructor(
    private readonly snapshot: SnapshotIndex,
    private readonly configs: ConfigSet,
  ) {}

  /**
   * The source file for a declared path (root-relative, normalized), or undefined when none can be found.
   *
   * @param packageDirectory - directory of the declaring package, for the heuristic step.
   */
  toSource(declared: string, packageDirectory: string): string | undefined {
    const key = `${packageDirectory}\n${declared}`;
    const cached = this.#cache.get(key);
    if (cached !== undefined) return cached ?? undefined;
    const result = this.#map(declared, packageDirectory);
    this.#cache.set(key, result ?? null);
    return result;
  }

  /** Like {@link toSource}, recording the declared path when it differs from the source. */
  map(declared: string, packageDirectory: string): MappedSource | undefined {
    const path = this.toSource(declared, packageDirectory);
    if (path === undefined) return undefined;
    return path === declared ? { path } : { path, mappedFrom: declared };
  }

  #map(declared: string, packageDirectory: string): string | undefined {
    if (this.snapshot.hasFile(declared)) return declared;
    let outputs: string[];
    if (outputExtensionOf(declared) !== undefined) {
      outputs = [declared];
    } else if (SOURCE_FILE.test(declared)) {
      return undefined;
    } else {
      const probed = probeFile(this.snapshot, declared) ?? probeIndex(this.snapshot, declared);
      if (probed !== undefined) return probed;
      outputs = declared === "" ? ["index.js"] : [`${declared}.js`, `${declared}/index.js`];
    }
    for (const output of outputs) {
      const source = this.#viaConfiguration(output);
      if (source !== undefined) return source;
    }
    for (const output of outputs) {
      const source = this.#viaHeuristics(output, packageDirectory);
      if (source !== undefined) return source;
    }
    return undefined;
  }

  #firstSource(outputPath: string): string | undefined {
    const output = outputExtensionOf(outputPath);
    if (output === undefined) return undefined;
    const stem = outputPath.slice(0, -output.extension.length);
    for (const extension of output.sources) {
      if (this.snapshot.hasFile(stem + extension)) return stem + extension;
    }
    return undefined;
  }

  #viaConfiguration(output: string): string | undefined {
    for (const { config, outputDirectory } of this.configs.outputConfigs(output)) {
      const relative = outputDirectory === "" ? output : output.slice(outputDirectory.length + 1);
      for (const rootDirectory of this.configs.rootDirectories(config)) {
        const candidate = joinLoose(rootDirectory, relative);
        if (!isInsideRoot(candidate)) continue;
        const source = this.#firstSource(candidate);
        if (source !== undefined) return source;
      }
    }
    return undefined;
  }

  #viaHeuristics(output: string, packageDirectory: string): string | undefined {
    if (!isWithin(output, packageDirectory) || output === packageDirectory) return undefined;
    const relative = packageDirectory === "" ? output : output.slice(packageDirectory.length + 1);
    const segments = relative.split("/");
    const candidates = [relative];
    for (let strip = 1; strip <= 2 && strip < segments.length; strip++) {
      if (!segments.slice(0, strip).every((segment) => OUTPUT_DIRECTORY_NAMES.has(segment))) break;
      const rest = segments.slice(strip).join("/");
      candidates.push(`src/${rest}`, rest);
    }
    for (const candidate of candidates) {
      const source = this.#firstSource(joinLoose(packageDirectory, candidate));
      if (source !== undefined) return source;
    }
    return undefined;
  }
}
