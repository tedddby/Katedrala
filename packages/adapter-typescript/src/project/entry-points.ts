/**
 * Entry points declared by package manifests, mapped back to source files.
 *
 * Per `package.json`: `main` (kind `main`), `module` (`module`), `types` / `typings` (`types`), `bin` as a
 * string or an object (`bin`), every string target of `exports`, recursively through subpaths, conditions
 * and fallback arrays (`exports`; subpath patterns and targets containing `*` are skipped), and the files
 * run by `scripts` (`script`, see {@link scriptFiles}). Each declared path is mapped to a source file of
 * the snapshot (see {@link OutputMapper}); paths that cannot be mapped are dropped.
 *
 * `source` names the declaring field: `package.json#main`, `package.json#bin` (string form),
 * `package.json#bin.<name>`, `package.json#exports` (string form), `package.json#exports[./sub].import`,
 * `package.json#exports.import` (conditions without subpaths), `package.json#exports[.][0]` (fallback
 * arrays), `package.json#scripts.<name>`.
 */
import { compareStrings } from "@katedrala/ir";
import type { EntryPointDescriptor } from "@katedrala/plugin-api";
import { isJsonObject } from "./json.js";
import { isInsideRoot } from "./locations.js";
import type { Locator } from "./locations.js";
import type { Manifest } from "./manifests.js";
import type { OutputMapper } from "./output-mapping.js";
import { scriptFiles } from "./scripts.js";

type EntryKind = EntryPointDescriptor["kind"];

interface DeclaredEntry {
  kind: EntryKind;
  source: string;
  target: string;
}

function exportsEntries(
  value: unknown,
  source: string,
  topLevel: boolean,
  into: DeclaredEntry[],
): void {
  if (typeof value === "string") {
    into.push({ kind: "exports", source, target: value });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => {
      exportsEntries(item, `${source}[${index}]`, false, into);
    });
  } else if (isJsonObject(value)) {
    const keys = Object.keys(value);
    const subpaths = topLevel && keys.some((key) => key.startsWith("."));
    for (const key of keys) {
      if (subpaths) {
        if (key.startsWith(".") && !key.includes("*")) {
          exportsEntries(value[key], `${source}[${key}]`, false, into);
        }
      } else if (!key.startsWith(".")) {
        exportsEntries(value[key], `${source}.${key}`, false, into);
      }
    }
  }
}

/** The entry points a manifest declares, before mapping (targets as written). */
export function declaredEntries(manifest: Manifest): DeclaredEntry[] {
  const { json } = manifest;
  const entries: DeclaredEntry[] = [];
  const field = (name: string, kind: EntryKind): void => {
    const value = json[name];
    if (typeof value === "string")
      entries.push({ kind, source: `package.json#${name}`, target: value });
  };
  field("main", "main");
  field("module", "module");
  field("types", "types");
  field("typings", "types");
  const bin = json.bin;
  if (typeof bin === "string") {
    entries.push({ kind: "bin", source: "package.json#bin", target: bin });
  } else if (isJsonObject(bin)) {
    for (const [name, target] of Object.entries(bin)) {
      if (typeof target === "string")
        entries.push({ kind: "bin", source: `package.json#bin.${name}`, target });
    }
  }
  if (json.exports !== undefined)
    exportsEntries(json.exports, "package.json#exports", true, entries);
  const scripts = json.scripts;
  if (isJsonObject(scripts)) {
    for (const [name, script] of Object.entries(scripts)) {
      if (typeof script !== "string") continue;
      for (const file of scriptFiles(script)) {
        if (file === "." || file === "./") continue;
        entries.push({ kind: "script", source: `package.json#scripts.${name}`, target: file });
      }
    }
  }
  return entries;
}

function compareEntryPoints(a: EntryPointDescriptor, b: EntryPointDescriptor): number {
  return (
    compareStrings(a.path, b.path) ||
    compareStrings(a.kind, b.kind) ||
    compareStrings(a.source, b.source) ||
    compareStrings(a.packagePath ?? "", b.packagePath ?? "") ||
    compareStrings(a.mappedFrom ?? "", b.mappedFrom ?? "")
  );
}

/**
 * The entry points of every manifest, mapped to source files, sorted by path, kind, source, package and
 * mapped-from path; exact duplicates are removed.
 */
export function collectEntryPoints(
  manifests: readonly Manifest[],
  mapper: OutputMapper,
  locator: Locator,
): EntryPointDescriptor[] {
  const result = new Map<string, EntryPointDescriptor>();
  for (const manifest of manifests) {
    for (const entry of declaredEntries(manifest)) {
      if (/[*?]/.test(entry.target) || entry.target.trim() === "") continue;
      if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(entry.target) || entry.target.startsWith("/")) continue;
      const declared = locator.resolve(manifest.directory, entry.target);
      if (declared === undefined || !isInsideRoot(declared)) continue;
      const mapped = mapper.map(declared, manifest.directory);
      if (mapped === undefined) continue;
      const descriptor: EntryPointDescriptor = {
        path: mapped.path,
        kind: entry.kind,
        source: entry.source,
        packagePath: manifest.directory,
      };
      if (mapped.mappedFrom !== undefined) descriptor.mappedFrom = mapped.mappedFrom;
      const key = JSON.stringify([
        descriptor.path,
        descriptor.kind,
        descriptor.source,
        descriptor.packagePath,
        descriptor.mappedFrom ?? "",
      ]);
      result.set(key, descriptor);
    }
  }
  return [...result.values()].sort(compareEntryPoints);
}
