/**
 * Deeply nested files are extracted the same way in the main thread (concurrency 1) and in worker threads:
 * the TypeScript adapter decides by fixed nesting limits instead of by the stack of the thread it runs in. The
 * snapshot holds files just under and just over each limit, and files far deeper than the main thread's
 * stack allows (formerly extracted without scopes, or not parsed, in the main thread only).
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { createTypeScriptAdapter, ParsedTypeScriptFile } from "@katedrala/adapter-typescript";
import {
  InMemorySource,
  discoverFiles,
  extractFiles,
  resolveCoreSettings,
  type ExtractionResults,
} from "@katedrala/core";
import type { LanguageAdapter, ParseInput } from "@katedrala/plugin-api";
import { describe, expect, it } from "vitest";

/** Worker threads load the adapter and core's worker entry from `dist`; the main thread uses the same build. */
const ADAPTER = new URL("../../adapter-typescript/dist/index.js", import.meta.url);
const WORKER_ENTRY = new URL("../../core/dist/extraction/worker-entry.js", import.meta.url);
const BUILT = existsSync(fileURLToPath(ADAPTER)) && existsSync(fileURLToPath(WORKER_ENTRY));

const operands = (n: number, operand: (index: number) => string, operator: string): string =>
  Array.from({ length: n }, (_, index) => operand(index)).join(` ${operator} `);

/** Deeply nested constructs by size: the binder's limit applies to the first two, the parser's to the others. */
const CONSTRUCTS: Readonly<Record<string, (n: number) => string>> = {
  or: (n) =>
    `declare const k: number;\nexport const known = ${operands(n, (index) => `k === ${index}`, "||")};\n`,
  calls: (n) => `import { program } from "commander";\nprogram${'.option("-x")'.repeat(n)};\n`,
  types: (n) => `type A<T> = T;\nexport type T = ${"A<".repeat(n)}string${">".repeat(n)};\n`,
  compare: (n) => `declare const a: any;\nexport const c = ${operands(n, () => "a", "<")};\n`,
};

/** Sizes far beyond the limits, which the main thread's stack did not hold without them. */
const FAR: Readonly<Record<string, number>> = { or: 1200, calls: 1000, types: 1000, compare: 1000 };

function input(name: string, n: number): ParseInput {
  const make = CONSTRUCTS[name];
  if (make === undefined) throw new Error(`no construct ${name}`);
  return { path: `src/deep/${name}.ts`, text: make(n), language: "typescript", dialect: "ts" };
}

/** The largest size the main thread accepts, by bisection: bound (the binder's limit) or parsed at all. */
async function largest(
  adapter: LanguageAdapter<ParsedTypeScriptFile>,
  name: string,
  accept: "bound" | "parsed",
): Promise<number> {
  const accepts = async (n: number): Promise<boolean> => {
    try {
      const parsed = await adapter.parse(input(name, n));
      return accept === "parsed" || parsed.bound;
    } catch {
      return false;
    }
  };
  let low = 1;
  let high = 2;
  while (await accepts(high)) {
    low = high;
    high *= 2;
  }
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (await accepts(middle)) low = middle;
    else high = middle;
  }
  return low;
}

describe("deeply nested files", () => {
  it.runIf(BUILT)(
    "are extracted identically in the main thread and in worker threads, around and beyond the limits",
    async () => {
      const { createTypeScriptAdapter: create } = (await import(ADAPTER.href)) as {
        createTypeScriptAdapter: typeof createTypeScriptAdapter;
      };
      const adapter = create();
      const files: Record<string, string> = {};
      // Enough files for the worker pool to start (it needs 64 pending parse jobs).
      for (let index = 0; index < 80; index += 1) {
        files[`src/fill/f${String(index).padStart(2, "0")}.ts`] =
          `export const v${index} = ${index};\n`;
      }
      const limits: Record<string, number> = {
        or: await largest(adapter, "or", "bound"),
        calls: await largest(adapter, "calls", "bound"),
        types: await largest(adapter, "types", "parsed"),
        compare: await largest(adapter, "compare", "parsed"),
      };
      for (const [name, limit] of Object.entries(limits)) {
        const make = CONSTRUCTS[name] ?? ((): string => "");
        files[`src/deep/${name}-under.ts`] = make(limit);
        files[`src/deep/${name}-over.ts`] = make(limit + 1);
        files[`src/deep/${name}-far.ts`] = make(FAR[name] ?? limit * 4);
      }
      const source = new InMemorySource({ files });
      const discovered = discoverFiles(await source.list(), resolveCoreSettings({}), [adapter]);
      const run = (concurrency: number): Promise<ExtractionResults> =>
        extractFiles(source, discovered, [adapter], { concurrency, workerUrl: WORKER_ENTRY });

      const main = await run(1);
      const workers = await run(3);
      expect(main.stats.workers).toBe(0);
      expect(workers.stats.workers).toBeGreaterThan(0);
      expect(workers.results).toEqual(main.results);
      expect(workers.diagnostics).toEqual(main.diagnostics);

      const outcome = (path: string) => main.results.find((result) => result.path === path);
      for (const name of ["or", "calls"]) {
        expect(outcome(`src/deep/${name}-under.ts`)?.status).toBe("parsed");
        for (const variant of ["over", "far"]) {
          const extracted = outcome(`src/deep/${name}-${variant}.ts`);
          expect(extracted?.status).toBe("partial");
          expect(extracted?.extraction?.syntaxErrors[0]?.message).toContain(
            "nested beyond the limit for binding",
          );
        }
      }
      for (const name of ["types", "compare"]) {
        expect(outcome(`src/deep/${name}-under.ts`)?.status).toBe("parsed");
        for (const variant of ["over", "far"]) {
          const failed = outcome(`src/deep/${name}-${variant}.ts`);
          expect(failed?.status).toBe("failed");
          expect(failed?.reason).toContain("nested beyond the limit for parsing");
        }
      }
    },
  );
});
