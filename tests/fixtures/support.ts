/**
 * Shared support of the end-to-end fixture tests: the fixture repositories as snapshots, their ground truth
 * (`expected.json`) and their analysis.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { InMemorySource } from "@katedrala/core";
import { analyzeArchitecture, type ArchitectureAnalysis } from "@katedrala/engine";
import { compareStrings } from "@katedrala/ir";

/** The fixture repositories (`fixtures/` at the repository root). */
export const FIXTURES = resolve(import.meta.dirname, "../../fixtures");

/** A fixture's `expected.json` (fixtures/README.md). */
export interface Expected {
  files: number;
  imports: [string, string, string][];
  externals: string[];
  unresolved: [string, string][];
  fileCycles: string[][];
  expectations: Record<string, unknown>;
}

/** The fixtures with an `expected.json`, sorted. */
export const FIXTURE_NAMES: readonly string[] = readdirSync(FIXTURES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(FIXTURES, entry.name, "expected.json")))
  .map((entry) => entry.name)
  .sort(compareStrings);

/** The ground truth of a fixture. */
export function expectedOf(name: string): Expected {
  return JSON.parse(readFileSync(join(FIXTURES, name, "expected.json"), "utf8")) as Expected;
}

/** The fixture as a snapshot: every file except the root README.md and expected.json. */
export function fixtureSource(name: string): InMemorySource {
  const files: Record<string, Uint8Array> = {};
  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(directory, entry.name), path);
      else if (prefix !== "" || (entry.name !== "README.md" && entry.name !== "expected.json")) {
        files[path] = readFileSync(join(directory, entry.name));
      }
    }
  };
  walk(join(FIXTURES, name), "");
  return new InMemorySource({ files });
}

/** The architecture analysis of a fixture: no cache, extraction in process (deterministic and quick). */
export function analyzeFixture(name: string): Promise<ArchitectureAnalysis> {
  return analyzeArchitecture({ source: fixtureSource(name), cache: false, concurrency: 1 });
}
