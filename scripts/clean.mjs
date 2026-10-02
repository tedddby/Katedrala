#!/usr/bin/env node
/** Removes build output (dist/ and TypeScript build info) from every workspace package. */
import { readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = join(root, "packages");

for (const entry of await readdir(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const target = join(packagesDir, entry.name, "dist");
  await rm(target, { recursive: true, force: true });
  console.log(`Removed ${target}`);
}
await rm(join(root, "coverage"), { recursive: true, force: true });
