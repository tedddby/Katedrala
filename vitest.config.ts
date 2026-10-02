import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Resolve every workspace package to its TypeScript sources so tests never depend on a prior build.
 * Mirrors the `katedrala-source` export condition used by the type-checking tsconfig.
 */
function workspaceAliases(): Record<string, string> {
  const packagesDir = resolve(import.meta.dirname, "packages");
  const aliases: Record<string, string> = {};
  for (const dir of readdirSync(packagesDir)) {
    const manifestPath = join(packagesDir, dir, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { name?: string };
    const entry = join(packagesDir, dir, "src", "index.ts");
    if (manifest.name !== undefined && existsSync(entry)) aliases[manifest.name] = entry;
  }
  return aliases;
}

export default defineConfig({
  resolve: {
    alias: workspaceAliases(),
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "fixtures/**"],
    environment: "node",
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/index.ts"],
      reporter: ["text-summary", "html", "json-summary"],
    },
  },
});
