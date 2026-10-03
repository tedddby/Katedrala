/**
 * End-to-end check of the structure stage (extraction, module resolution, linking, graph model and graph
 * algorithms) against every fixture's ground truth in `fixtures/<name>/expected.json`.
 *
 * Expectations that belong to later pipeline stages (inference, metrics, rules, frameworks) are listed as
 * `todo` so the remaining coverage stays visible.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { InMemorySource } from "@katedrala/core";
import { analyzeStructure, type StructureAnalysis } from "@katedrala/engine";
import { Digraph, longestPathLengths, stronglyConnectedComponents } from "@katedrala/graph";
import {
  FILE_ROLES,
  compareStrings,
  type EdgeKind,
  type FileEntity,
  type ImportEntry,
} from "@katedrala/ir";
import { beforeAll, describe, expect, it } from "vitest";

const FIXTURES = resolve(import.meta.dirname, "../../fixtures");

interface Expected {
  files: number;
  imports: [string, string, string][];
  externals: string[];
  unresolved: [string, string][];
  fileCycles: string[][];
  expectations: Record<string, unknown>;
}

const NAMES = readdirSync(FIXTURES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(FIXTURES, entry.name, "expected.json")))
  .map((entry) => entry.name)
  .sort(compareStrings);

/** The fixture as a snapshot: every file except the root README.md and expected.json. */
function fixtureSource(name: string): InMemorySource {
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

// ---------------------------------------------------------------------------------------------------------
// Ordering helpers (fixtures/README.md: strings by UTF-16 code units, tuples element by element)

function compareTuples(a: readonly string[], b: readonly string[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const order = compareStrings(a[i]!, b[i]!);
    if (order !== 0) return order;
  }
  return a.length - b.length;
}

function sortTuples<T extends readonly string[]>(tuples: Iterable<T>): T[] {
  return [...tuples].sort(compareTuples);
}

function uniqueTuples<T extends readonly string[]>(tuples: Iterable<T>): T[] {
  const byKey = new Map<string, T>();
  for (const tuple of tuples) byKey.set(tuple.join("\u0000"), tuple);
  return sortTuples(byKey.values());
}

function sortGroups(groups: Iterable<Iterable<string>>): string[][] {
  return sortTuples([...groups].map((group) => [...group].sort(compareStrings)));
}

const stripId = (id: string): string => id.replace(/^(?:sym|file):/, "");
const directoryOf = (path: string): string => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

// ---------------------------------------------------------------------------------------------------------
// Facts derived from the document

/** The fixture vocabulary for an import entry (fixtures/README.md, "imports"). */
function fixtureKind(entry: ImportEntry): string | undefined {
  if (entry.kind === "module-declaration") return undefined;
  if (entry.mechanism === "triple-slash-reference") return "triple-slash";
  if (entry.typeOnly) return "type";
  if (entry.mechanism === "require-call") return "require";
  if (entry.mechanism === "import-equals") return "import-equals";
  if (entry.mechanism === "dynamic-import" || entry.kind === "dynamic") return "dynamic";
  if (entry.kind === "side-effect") return "side-effect";
  if (entry.kind === "re-export") return "re-export";
  return "static";
}

function externalName(id: string): string {
  const rest = id.slice("ext:".length);
  const colon = rest.indexOf(":");
  const namespace = rest.slice(0, colon);
  const name = rest.slice(colon + 1);
  if (namespace === "node") return `node:${name}`;
  return namespace === "npm" ? name : `${namespace}:${name}`;
}

interface Facts {
  readonly analysis: StructureAnalysis;
  /** `[from, to, kind]` per resolved import statement. */
  readonly imports: [string, string, string][];
  /** Distinct `[from, to]` file pairs over all import kinds. */
  readonly pairs: [string, string][];
  readonly externals: string[];
  readonly unresolved: [string, string][];
  readonly files: string[];
}

function factsOf(analysis: StructureAnalysis): Facts {
  const { document } = analysis;
  const imports: [string, string, string][] = [];
  const externals = new Set<string>();
  const unresolved: [string, string][] = [];
  for (const file of document.files) {
    for (const entry of file.imports) {
      const kind = fixtureKind(entry);
      if (kind === undefined) continue;
      const resolution = entry.resolution;
      switch (resolution.status) {
        case "resolved":
          for (const target of resolution.targets) imports.push([file.path, stripId(target), kind]);
          break;
        case "excluded":
          // The file exists but the configuration excludes it from the document: the import resolves.
          for (const path of resolution.paths) imports.push([file.path, path, kind]);
          break;
        case "external":
        case "builtin":
          externals.add(externalName(resolution.target));
          break;
        case "unresolved":
        case "non-literal":
          unresolved.push([file.path, entry.specifier]);
          break;
      }
    }
  }
  return {
    analysis,
    imports: sortTuples(imports),
    pairs: uniqueTuples(imports.map(([from, to]): [string, string] => [from, to])),
    externals: [...externals].sort(compareStrings),
    unresolved: sortTuples(unresolved),
    files: document.files.map((file) => file.path),
  };
}

/** Strongly connected components with more than one node of a graph given as pairs. */
function cyclesOf(pairs: readonly (readonly [string, string])[]): string[][] {
  const nodes = [...new Set(pairs.flat())].sort(compareStrings);
  const index = new Map(nodes.map((node, i) => [node, i]));
  const graph = Digraph.fromPairs(
    nodes.length,
    pairs.map(([from, to]): [number, number] => [index.get(from)!, index.get(to)!]),
  );
  const { components } = stronglyConnectedComponents(graph);
  return sortGroups(
    components.filter((members) => members.length > 1).map((members) => [...members].map((i) => nodes[i]!)),
  );
}

const IMPORT_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>(["imports", "re-exports"]);

/** File-level import graph of the model projection (the graph metrics and anomalies will run on). */
function importProjection(analysis: StructureAnalysis, includeTypeOnly: boolean) {
  return analysis.model.projection({
    level: "file",
    edgeKinds: IMPORT_EDGE_KINDS,
    includeTypeOnly,
    fileRoles: new Set(FILE_ROLES),
    includeExternals: false,
  });
}

function projectionPairs(analysis: StructureAnalysis, includeTypeOnly: boolean): [string, string][] {
  const projection = importProjection(analysis, includeTypeOnly);
  const pairs: [string, string][] = [];
  for (let source = 0; source < projection.nodes.length; source++) {
    for (const target of projection.graph.successors(source)) {
      pairs.push([stripId(projection.nodes[source]!), stripId(projection.nodes[target]!)]);
    }
  }
  return sortTuples(pairs);
}

function projectionCycles(analysis: StructureAnalysis, includeTypeOnly: boolean): string[][] {
  const projection = importProjection(analysis, includeTypeOnly);
  const { components } = stronglyConnectedComponents(projection.graph);
  return sortGroups(
    components
      .filter((members) => members.length > 1)
      .map((members) => [...members].map((i) => stripId(projection.nodes[i]!))),
  );
}

function fanIn(facts: Facts): Map<string, string[]> {
  const importers = new Map<string, string[]>();
  for (const [from, to] of facts.pairs) importers.set(to, [...(importers.get(to) ?? []), from]);
  return importers;
}

function fanOut(facts: Facts): Map<string, string[]> {
  const targets = new Map<string, string[]>();
  for (const [from, to] of facts.pairs) targets.set(from, [...(targets.get(from) ?? []), to]);
  return targets;
}

function countByDirectory(paths: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const path of paths) counts[directoryOf(path)] = (counts[directoryOf(path)] ?? 0) + 1;
  return counts;
}

/** The file with the most entries and the runner-up (ties broken by path). */
function ranked(degrees: Map<string, string[]>): [string, string[]][] {
  return [...degrees.entries()].sort(
    (a, b) => b[1].length - a[1].length || compareStrings(a[0], b[0]),
  );
}

function longestChain(facts: Facts): string[] {
  const nodes = [...new Set(facts.pairs.flat())].sort(compareStrings);
  const index = new Map(nodes.map((node, i) => [node, i]));
  const graph = Digraph.fromPairs(
    nodes.length,
    facts.pairs.map(([from, to]): [number, number] => [index.get(from)!, index.get(to)!]),
  );
  const lengths = longestPathLengths(graph, "out");
  let current = -1;
  for (let i = 0; i < nodes.length; i++) if (current < 0 || lengths[i]! > lengths[current]!) current = i;
  if (current < 0) return [];
  const chain = [nodes[current]!];
  while (lengths[current]! > 0) {
    const next = [...graph.successors(current)].find((v) => lengths[v] === lengths[current]! - 1)!;
    chain.push(nodes[next]!);
    current = next;
  }
  return chain;
}

function edgePairs(facts: Facts, kind: EdgeKind): [string, string][] {
  return uniqueTuples(
    facts.analysis.document.edges
      .filter((edge) => edge.kind === kind)
      .map((edge): [string, string] => [stripId(edge.source), stripId(edge.target)]),
  );
}

/** Edges of a kind towards externals of a namespace, as `[file, name]`. */
function externalFacts(facts: Facts, kind: EdgeKind, namespace: string): [string, string][] {
  const prefix = `ext:${namespace}:`;
  const fileOf = (id: string): string => stripId(id).split("#")[0]!;
  return uniqueTuples(
    facts.analysis.document.edges
      .filter((edge) => edge.kind === kind && edge.target.startsWith(prefix))
      .map((edge): [string, string] => [fileOf(edge.source), edge.target.slice(prefix.length)]),
  );
}

function externalNames(facts: Facts, namespace: string): string[] {
  const prefix = `ext:${namespace}:`;
  return facts.analysis.document.externals
    .filter((external) => external.id.startsWith(prefix))
    .map((external) => external.id.slice(prefix.length))
    .sort(compareStrings);
}

const PACKAGE_ENTRY_KINDS = new Set(["main", "module", "exports", "bin", "types"]);

function declaredEntryPoints(facts: Facts): string[] {
  return [
    ...new Set(
      facts.analysis.document.entryPoints
        .filter((entry) => PACKAGE_ENTRY_KINDS.has(entry.kind))
        .map((entry) => stripId(entry.entity).split("#")[0]!),
    ),
  ].sort(compareStrings);
}

function workspacePackages(facts: Facts) {
  return facts.analysis.document.packages.filter((pkg) => pkg.path !== "");
}

function packageDependencies(facts: Facts): [string, string][] {
  const { model } = facts.analysis;
  const names = new Map(workspacePackages(facts).map((pkg) => [pkg.id as string, pkg.name]));
  const projection = model.projection({
    level: "package",
    edgeKinds: IMPORT_EDGE_KINDS,
    includeTypeOnly: true,
    fileRoles: new Set(FILE_ROLES),
  });
  const pairs: [string, string][] = [];
  for (let source = 0; source < projection.nodes.length; source++) {
    for (const target of projection.graph.successors(source)) {
      const from = names.get(projection.nodes[source]!);
      const to = names.get(projection.nodes[target]!);
      if (from !== undefined && to !== undefined) pairs.push([from, to]);
    }
  }
  return uniqueTuples(pairs);
}

function manifestDependencies(facts: Facts): [string, string][] {
  const workspace = workspacePackages(facts);
  const names = new Map(workspace.map((pkg) => [pkg.id as string, pkg.name]));
  return uniqueTuples(
    workspace.flatMap((pkg) =>
      pkg.declaredDependencies
        .filter((dependency) => names.has(dependency.target))
        .map((dependency): [string, string] => [pkg.name, names.get(dependency.target)!]),
    ),
  );
}

function isDomain(path: string): boolean {
  return path.startsWith("src/domain/");
}

// ---------------------------------------------------------------------------------------------------------
// Expectation keys this stage can answer; `subset` keys list representative, not exhaustive, entries.

type Check = { readonly compute: (facts: Facts) => unknown; readonly subset?: boolean };

const CHECKS: Readonly<Record<string, Check>> = {
  // Cycles and the directory graph (graph algorithms over the import graph).
  runtimeCycles: { compute: (facts) => projectionCycles(facts.analysis, false) },
  typeOnlyCycles: {
    compute: (facts) =>
      projectionCycles(facts.analysis, true).filter((group) => {
        const members = new Set(group);
        return facts.imports.every(
          ([from, to, kind]) => !(members.has(from) && members.has(to)) || kind === "type",
        );
      }),
  },
  directoryDependencies: {
    compute: (facts) =>
      uniqueTuples(
        facts.pairs
          .filter(([from, to]) => directoryOf(from) !== directoryOf(to))
          .map(([from, to]): [string, string] => [directoryOf(from), directoryOf(to)]),
      ),
  },
  directoryCycles: {
    compute: (facts) =>
      cyclesOf(
        facts.pairs
          .filter(([from, to]) => directoryOf(from) !== directoryOf(to))
          .map(([from, to]): [string, string] => [directoryOf(from), directoryOf(to)]),
      ),
  },
  // Depth and fan-in/out.
  maxDepth: { compute: (facts) => Math.max(0, longestChain(facts).length - 1) },
  longestChain: { compute: longestChain },
  highestFanIn: { compute: (facts) => ranked(fanIn(facts))[0]?.[0] },
  fanIn: { compute: (facts) => ranked(fanIn(facts))[0]?.[1].length },
  loggerImporters: { compute: (facts) => [...(ranked(fanIn(facts))[0]?.[1] ?? [])].sort(compareStrings) },
  loggerImportersByDirectory: {
    compute: (facts) => countByDirectory(ranked(fanIn(facts))[0]?.[1] ?? []),
  },
  loggerFanOut: {
    compute: (facts) => fanOut(facts).get(ranked(fanIn(facts))[0]?.[0] ?? "")?.length ?? 0,
  },
  runnerUp: {
    compute: (facts) => {
      const second = ranked(fanIn(facts))[1];
      return second === undefined ? undefined : { file: second[0], fanIn: second[1].length };
    },
  },
  maxFanInOfOtherFiles: { compute: (facts) => ranked(fanIn(facts))[1]?.[1].length ?? 0 },
  highestFanOut: { compute: (facts) => ranked(fanOut(facts))[0]?.[0] },
  fanOut: { compute: (facts) => ranked(fanOut(facts))[0]?.[1].length },
  orchestratorDependencies: {
    compute: (facts) => [...(ranked(fanOut(facts))[0]?.[1] ?? [])].sort(compareStrings),
  },
  orchestratorDependenciesByDirectory: {
    compute: (facts) => countByDirectory(ranked(fanOut(facts))[0]?.[1] ?? []),
  },
  orchestratorFanIn: {
    compute: (facts) => fanIn(facts).get(ranked(fanOut(facts))[0]?.[0] ?? "")?.length ?? 0,
  },
  maxFanOutOfOtherFiles: { compute: (facts) => ranked(fanOut(facts))[1]?.[1].length ?? 0 },
  // Symbol-level relationships (linker).
  calls: { compute: (facts) => edgePairs(facts, "calls"), subset: true },
  instantiates: { compute: (facts) => edgePairs(facts, "instantiates"), subset: true },
  uses: { compute: (facts) => edgePairs(facts, "uses"), subset: true },
  infrastructureImplements: { compute: (facts) => edgePairs(facts, "implements"), subset: true },
  domainExternals: {
    compute: (facts) => [
      ...new Set(
        facts.analysis.document.files
          .filter((file) => isDomain(file.path))
          .flatMap((file: FileEntity) =>
            file.imports.flatMap((entry) =>
              entry.resolution.status === "external" || entry.resolution.status === "builtin"
                ? [externalName(entry.resolution.target)]
                : [],
            ),
          ),
      ),
    ].sort(compareStrings),
  },
  domainDependsOnNothingInternal: {
    compute: (facts) => facts.pairs.every(([from, to]) => !isDomain(from) || isDomain(to)),
  },
  // Packages and entry points.
  entryPoints: { compute: declaredEntryPoints },
  packages: {
    compute: (facts) =>
      workspacePackages(facts)
        .map((pkg) => pkg.name)
        .sort(compareStrings),
  },
  rootPackage: {
    compute: (facts) => facts.analysis.document.packages.find((pkg) => pkg.path === "")?.name,
  },
  packageDependencies: { compute: packageDependencies },
  manifestDependencies: { compute: manifestDependencies },
  declaredButUnused: {
    compute: (facts) => {
      const used = new Set(packageDependencies(facts).map((pair) => pair.join("\u0000")));
      return manifestDependencies(facts).filter((pair) => !used.has(pair.join("\u0000")));
    },
  },
  resolutionMethods: {
    compute: (facts) =>
      uniqueTuples(
        facts.analysis.document.files.flatMap((file) =>
          file.imports.flatMap((entry): [string, string, string][] =>
            entry.resolution.status === "resolved" || entry.resolution.status === "external"
              ? [[file.path, entry.specifier, entry.resolution.method]]
              : [],
          ),
        ),
      ),
    subset: true,
  },
  // Facts recorded by the extractor (environment reads, outgoing HTTP calls).
  envVars: { compute: (facts) => externalNames(facts, "env") },
  envReads: { compute: (facts) => externalFacts(facts, "reads-configuration", "env") },
  httpHosts: { compute: (facts) => externalNames(facts, "http") },
};

// ---------------------------------------------------------------------------------------------------------

describe.each(NAMES)("fixture %s", (name) => {
  const expected = JSON.parse(
    readFileSync(join(FIXTURES, name, "expected.json"), "utf8"),
  ) as Expected;
  let facts: Facts;

  beforeAll(async () => {
    const analysis = await analyzeStructure({
      source: fixtureSource(name),
      cache: false,
      concurrency: 1,
    });
    facts = factsOf(analysis);
  });

  it("lists every file", () => {
    expect(facts.files).toHaveLength(expected.files);
  });

  it("resolves every import with its kind", () => {
    expect(facts.imports).toEqual(sortTuples(expected.imports));
  });

  it("identifies externals", () => {
    expect(facts.externals).toEqual(expected.externals);
  });

  it("reports unresolved imports", () => {
    expect(facts.unresolved).toEqual(sortTuples(expected.unresolved));
  });

  it("records one import edge per importing file pair", () => {
    expect(projectionPairs(facts.analysis, true)).toEqual(facts.pairs);
  });

  it("finds file cycles through the graph model", () => {
    expect(projectionCycles(facts.analysis, true)).toEqual(sortGroups(expected.fileCycles));
  });

  for (const [key, value] of Object.entries(expected.expectations)) {
    const check = CHECKS[key];
    if (check === undefined) {
      it.todo(`expectation ${key} (later pipeline stage)`);
      continue;
    }
    it(`meets expectation ${key}`, () => {
      const actual = check.compute(facts);
      if (check.subset === true) {
        expect(actual).toEqual(expect.arrayContaining(value as unknown[]));
      } else {
        expect(actual).toEqual(value);
      }
    });
  }
});
