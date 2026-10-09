/**
 * End-to-end check of the analysis pipeline (extraction, module resolution, linking, graph model, graph
 * algorithms and, since milestone 5, inference) against every fixture's ground truth in
 * `fixtures/<name>/expected.json`.
 *
 * The analysis is `analyzeArchitecture`'s, a superset of `analyzeStructure`'s whose structural sections are
 * unchanged (tests/fixtures/inference.test.ts checks that on every fixture). Expectations that belong to later
 * pipeline stages (metrics, rules, frameworks) are listed as `todo` so the remaining coverage stays visible.
 */
import type { ArchitectureAnalysis } from "@katedrala/engine";
import { Digraph, longestPathLengths, stronglyConnectedComponents } from "@katedrala/graph";
import { sStem } from "@katedrala/inference";
import {
  FILE_ROLES,
  compareStrings,
  isWithin,
  type EdgeKind,
  type FileEntity,
  type ImportEntry,
  type LayerEntity,
  type ModuleEntity,
} from "@katedrala/ir";
import { beforeAll, describe, expect, it } from "vitest";
import { FIXTURE_NAMES, analyzeFixture, expectedOf } from "./support.js";

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
  readonly analysis: ArchitectureAnalysis;
  /** `[from, to, kind]` per resolved import statement. */
  readonly imports: [string, string, string][];
  /** Distinct `[from, to]` file pairs over all import kinds. */
  readonly pairs: [string, string][];
  readonly externals: string[];
  readonly unresolved: [string, string][];
  readonly files: string[];
}

function factsOf(analysis: ArchitectureAnalysis): Facts {
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
function importProjection(analysis: ArchitectureAnalysis, includeTypeOnly: boolean) {
  return analysis.model.projection({
    level: "file",
    edgeKinds: IMPORT_EDGE_KINDS,
    includeTypeOnly,
    fileRoles: new Set(FILE_ROLES),
    includeExternals: false,
  });
}

function projectionPairs(analysis: ArchitectureAnalysis, includeTypeOnly: boolean): [string, string][] {
  const projection = importProjection(analysis, includeTypeOnly);
  const pairs: [string, string][] = [];
  for (let source = 0; source < projection.nodes.length; source++) {
    for (const target of projection.graph.successors(source)) {
      pairs.push([stripId(projection.nodes[source]!), stripId(projection.nodes[target]!)]);
    }
  }
  return sortTuples(pairs);
}

function projectionCycles(analysis: ArchitectureAnalysis, includeTypeOnly: boolean): string[][] {
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
// Modules and layers (milestone 5, plan 7.2). Keys a README defines over imports are computed from imports, as
// defined, and each such check also asserts that the aggregated dependencies contain those pairs.

type Expectations = Readonly<Record<string, unknown>>;

/** The kind signals of inferred modules (D-48); declared modules have none. */
const KIND_SIGNALS: ReadonlySet<string> = new Set([
  "feature-directory",
  "layer-directory",
  "shared-directory",
  "root-files",
  "file-stem",
  "split-piece",
]);

/** The module with a name, which must be unique among the modules of the document. */
function moduleNamed(facts: Facts, name: string): ModuleEntity {
  const found = facts.analysis.document.modules.filter((module) => module.name === name);
  expect(found.map((module) => module.id), `one module named ${name}`).toHaveLength(1);
  return found[0]!;
}

/** The D-48 kind signal of a module (`feature-directory`, ...), or `declared`. */
function kindOf(module: ModuleEntity): string {
  const signals = (module.inference?.evidence ?? [])
    .map((evidence) => evidence.signal)
    .filter((signal) => KIND_SIGNALS.has(signal));
  if (module.origin === "declared") return "declared";
  expect(signals).toHaveLength(1);
  return signals[0]!;
}

/** The layer a fixture name denotes: the fixture's directory names map through the S-stemmer. */
function layerNamed(facts: Facts, fixtureName: string): LayerEntity | undefined {
  const name = sStem(fixtureName);
  return facts.analysis.document.layers.find((layer) => layer.name === name);
}

/** The inference nodes among a module's files: attached tests and declarations are left out. */
function nodeMembers(facts: Facts, module: ModuleEntity): string[] {
  const roles = facts.analysis.inference.modules.fileRoles;
  const roleOf = new Map(facts.analysis.document.files.map((file) => [file.id, file.role]));
  return module.files
    .filter((file) => roles.has(roleOf.get(file) ?? "other"))
    .map(stripId)
    .sort(compareStrings);
}

/** The file of a file or symbol identifier; undefined for other entities. */
function fileOfNode(id: string): string | undefined {
  if (!id.startsWith("file:") && !id.startsWith("sym:")) return undefined;
  return stripId(id).split("#")[0];
}

const IMPORT_KINDS: ReadonlySet<string> = new Set(["imports", "re-exports"]);

/** Distinct `[file, file]` pairs of the `imports` and `re-exports` IR edges, any type-only flag. */
function importFilePairs(facts: Facts): [string, string][] {
  return uniqueTuples(
    facts.analysis.document.edges.flatMap((edge): [string, string][] => {
      if (!IMPORT_KINDS.has(edge.kind)) return [];
      const from = fileOfNode(edge.source);
      const to = fileOfNode(edge.target);
      return from === undefined || to === undefined || from === to ? [] : [[from, to]];
    }),
  );
}

/**
 * The `imports` and `re-exports` IR edges between files grouped by a file → group function (review #25):
 * distinct `[group, group]` pairs between different groups, files without a group left out.
 */
function importPairs(
  facts: Facts,
  groupOf: (path: string) => string | undefined,
): [string, string][] {
  return uniqueTuples(
    importFilePairs(facts).flatMap(([from, to]): [string, string][] => {
      const a = groupOf(from);
      const b = groupOf(to);
      return a === undefined || b === undefined || a === b ? [] : [[a, b]];
    }),
  );
}

/** The innermost directory containing every path ("" when they share none). */
function commonDirectory(paths: readonly string[]): string {
  const directories = paths.map(directoryOf);
  let common = directories[0] ?? "";
  for (const directory of directories) {
    while (!isWithin(directory, common)) common = directoryOf(common);
  }
  return common;
}

/** Fixture names (of `layers` and `layerDirectories`) by the identifier of the layer each denotes. */
function fixtureLayerNames(facts: Facts, expectations: Expectations): Map<string, string> {
  const names = [
    ...((expectations.layers as string[] | undefined) ?? []),
    ...Object.keys((expectations.layerDirectories as object | undefined) ?? {}),
  ];
  const byLayer = new Map<string, string>();
  for (const name of names) {
    const layer = layerNamed(facts, name);
    if (layer !== undefined) byLayer.set(layer.id, name);
  }
  return byLayer;
}

/** Asserts that every pair of named units appears in the aggregated dependencies of its source unit. */
function expectAggregated(
  pairs: readonly (readonly [string, string])[],
  unitOf: (name: string) => ModuleEntity | LayerEntity | undefined,
): void {
  for (const [from, to] of pairs) {
    const target = unitOf(to)?.id;
    expect(
      unitOf(from)?.dependencies.map((dependency) => dependency.entity),
      `${from} -> ${to} among the aggregated dependencies`,
    ).toContain(target);
  }
}

/** Every module's evidence entries with a signal, with the module. */
function evidenceOf(facts: Facts, signal: string) {
  return facts.analysis.document.modules.flatMap((module) =>
    (module.inference?.evidence ?? [])
      .filter((evidence) => evidence.signal === signal)
      .map((evidence) => ({ module, evidence })),
  );
}

/** The relocated files (`relocated-files` evidence, D-36) with the module that holds them. */
function relocations(facts: Facts): { file: string; module: ModuleEntity; description: string }[] {
  return evidenceOf(facts, "relocated-files")
    .flatMap(({ module, evidence }) =>
      (evidence.entities ?? []).map((entity) => ({
        file: stripId(entity),
        module,
        description: evidence.description,
      })),
    )
    .sort((a, b) => compareStrings(a.file, b.file));
}

/**
 * ambiguous-boundaries' "feature" of a file (its README): the first directory under `src/`, when that is a
 * feature directory. Feature directories are the anchors of the feature-directory modules.
 */
function featureOf(facts: Facts): (path: string) => string | undefined {
  const features = new Map(
    facts.analysis.document.modules
      .filter((module) => kindOf(module) === "feature-directory")
      .map((module) => [module.anchor?.directory, module.name]),
  );
  return (path) => {
    const [root, first] = path.split("/");
    return root === "src" && first !== undefined && path.split("/").length > 2
      ? features.get(`src/${first}`)
      : undefined;
  };
}

/** The distinct files with an import of `file`, or that `file` imports, counted per group. */
function countByGroup(
  facts: Facts,
  file: string,
  direction: "dependents" | "dependencies",
  groupOf: (path: string) => string | undefined,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [from, to] of importFilePairs(facts)) {
    const other = direction === "dependents" ? (to === file ? from : undefined) : from === file ? to : undefined;
    const group = other === undefined ? undefined : groupOf(other);
    if (group !== undefined) counts[group] = (counts[group] ?? 0) + 1;
  }
  return counts;
}

/** The module of every node member, by path. */
function moduleOfFile(facts: Facts): Map<string, ModuleEntity> {
  const result = new Map<string, ModuleEntity>();
  for (const module of facts.analysis.document.modules) {
    for (const path of nodeMembers(facts, module)) result.set(path, module);
  }
  return result;
}

/** ambiguous-boundaries: import pairs between the feature-directory modules after relocation, by name. */
function featurePairsAfterRelocation(facts: Facts): [string, string][] {
  const modules = moduleOfFile(facts);
  const pairs = importPairs(facts, (path) => {
    const module = modules.get(path);
    return module !== undefined && kindOf(module) === "feature-directory" ? module.name : undefined;
  });
  expectAggregated(pairs, (name) => moduleNamed(facts, name));
  return pairs;
}

/** dependency-violations: the declared module of every member file, by name. */
function declaredModuleOf(facts: Facts): (path: string) => string | undefined {
  const names = new Map<string, string>();
  for (const module of facts.analysis.document.modules) {
    if (module.origin !== "declared") continue;
    for (const file of module.files) names.set(stripId(file), module.name);
  }
  return (path) => names.get(path);
}

const ARCHITECTURE_CHECKS: Readonly<Record<string, Check>> = {
  // layered-architecture, ambiguous-boundaries: node members of each named module ∩ the listed files.
  logicalModules: {
    compute: (facts, expectations) => {
      const expected = expectations.logicalModules as Record<string, string[]>;
      const listed = new Set(Object.values(expected).flat());
      return Object.fromEntries(
        Object.keys(expected).map((name) => [
          name,
          nodeMembers(facts, moduleNamed(facts, name)).filter((path) => listed.has(path)),
        ]),
      );
    },
  },
  // layered-architecture: listed files in none of the modules named in logicalModules.
  notInAnyExpectedModule: {
    compute: (facts, expectations) => {
      const expected = expectations.logicalModules as Record<string, string[]>;
      const listed = [
        ...Object.values(expected).flat(),
        ...(expectations.notInAnyExpectedModule as string[]),
      ];
      const members = new Set(
        Object.keys(expected).flatMap((name) => moduleNamed(facts, name).files.map(stripId)),
      );
      return [...new Set(listed)].filter((path) => !members.has(path)).sort(compareStrings);
    },
  },
  // layered-architecture: ModuleEntity.dependencies among the modules named in logicalModules.
  moduleDependencies: {
    compute: (facts, expectations) => {
      const names = Object.keys(expectations.logicalModules as object);
      const nameOf = new Map(names.map((name) => [moduleNamed(facts, name).id as string, name]));
      return uniqueTuples(
        names.flatMap((name) =>
          moduleNamed(facts, name).dependencies.flatMap((dependency): [string, string][] => {
            const to = nameOf.get(dependency.entity);
            return to === undefined ? [] : [[name, to]];
          }),
        ),
      );
    },
  },
  // Expected names that exist as layers, ordered by rank; equal ranks fail.
  layers: {
    compute: (facts, expectations) => {
      const present = (expectations.layers as string[]).flatMap((name) => {
        const layer = layerNamed(facts, name);
        return layer === undefined ? [] : [{ name, rank: layer.rank }];
      });
      const ranks = present.map((entry) => entry.rank);
      expect(new Set(ranks).size, `distinct ranks ${ranks.join(", ")}`).toBe(ranks.length);
      return present.sort((a, b) => a.rank - b.rank).map((entry) => entry.name);
    },
  },
  // Per layer: the expected directory if the members are exactly its source files, else their common one.
  layerDirectories: {
    compute: (facts, expectations) => {
      const sources = facts.analysis.document.files
        .filter((file) => file.role === "source")
        .map((file) => file.path);
      return Object.fromEntries(
        Object.entries(expectations.layerDirectories as Record<string, string>).map(
          ([name, directory]) => {
            const members = (layerNamed(facts, name)?.files ?? []).map(stripId);
            const under = sources.filter((path) => isWithin(path, directory)).sort(compareStrings);
            const exact = members.length === under.length && members.every((p, i) => p === under[i]);
            return [name, exact ? directory : commonDirectory(members)];
          },
        ),
      );
    },
  },
  // Pairs of layers with an import between their files (fixtures/README.md), in the aggregated dependencies.
  layerDependencies: {
    compute: (facts, expectations) => {
      const names = fixtureLayerNames(facts, expectations);
      const layerOf = new Map<string, string>();
      for (const layer of facts.analysis.document.layers) {
        const name = names.get(layer.id);
        if (name !== undefined) for (const file of layer.files) layerOf.set(stripId(file), name);
      }
      const pairs = importPairs(facts, (path) => layerOf.get(path));
      expectAggregated(pairs, (name) => layerNamed(facts, name));
      return pairs;
    },
  },
  // clean-architecture: the composition roots over all modules, a single file (D-49).
  compositionRoot: {
    compute: (facts) => {
      const roots = [
        ...new Set(
          evidenceOf(facts, "composition-roots").flatMap(({ evidence }) =>
            (evidence.entities ?? []).map(stripId),
          ),
        ),
      ].sort(compareStrings);
      return roots.length === 1 ? roots[0] : roots;
    },
  },
  // ambiguous-boundaries: the feature-directory modules.
  features: {
    compute: (facts) =>
      facts.analysis.document.modules
        .filter((module) => kindOf(module) === "feature-directory")
        .map((module) => module.name)
        .sort(compareStrings),
  },
  // Each relocated file, where it is located and the module that holds it.
  misplaced: {
    compute: (facts) =>
      relocations(facts).map(({ file, module }) => ({
        file,
        locatedIn: facts.analysis.document.modules.find(
          (candidate) =>
            candidate.anchor?.directory === directoryOf(file) && candidate.anchor.stem === undefined,
        )?.name,
        usedMostlyBy: module.name,
        dependsMostlyOn: module.name,
      })),
  },
  // Distinct importing and imported files per feature (README); they agree with the relocation evidence.
  misplacementEvidence: {
    compute: (facts) => {
      const feature = featureOf(facts);
      return Object.fromEntries(
        relocations(facts).map(({ file, module, description }) => {
          const dependents = countByGroup(facts, file, "dependents", feature);
          const dependencies = countByGroup(facts, file, "dependencies", feature);
          const counts = /has (\d+) of its (\d+) dependents/.exec(description);
          expect(counts, description).not.toBeNull();
          expect(Number(counts![1])).toBe(dependents[module.name] ?? 0);
          expect(Number(counts![2])).toBe(
            Object.values(dependents).reduce((sum, count) => sum + count, 0),
          );
          return [file, { dependents, dependencies }];
        }),
      );
    },
  },
  // Feature-directory files that were not relocated.
  wellPlaced: {
    compute: (facts) => {
      const feature = featureOf(facts);
      const moved = new Set(relocations(facts).map((relocation) => relocation.file));
      return facts.analysis.document.files
        .filter((file) => file.role === "source" && feature(file.path) !== undefined)
        .map((file) => file.path)
        .filter((path) => !moved.has(path))
        .sort(compareStrings);
    },
  },
  // The shared directory's files and the features importing each (README); the module view agrees.
  grabBag: {
    compute: (facts) => {
      const shared = facts.analysis.document.modules.filter(
        (module) => kindOf(module) === "shared-directory",
      );
      expect(shared).toHaveLength(1);
      const module = shared[0]!;
      const feature = featureOf(facts);
      const modules = moduleOfFile(facts);
      const usedBy: Record<string, string[]> = {};
      const byModule: Record<string, string[]> = {};
      for (const file of nodeMembers(facts, module)) {
        const importers = importFilePairs(facts)
          .filter(([, to]) => to === file)
          .map(([from]) => from);
        const distinct = (names: (string | undefined)[]) =>
          [...new Set(names.filter((name) => name !== undefined))].sort(compareStrings);
        usedBy[file] = distinct(importers.map(feature));
        byModule[file] = distinct(
          importers.map((path) => {
            const holder = modules.get(path);
            return holder !== undefined && kindOf(holder) === "feature-directory"
              ? holder.name
              : undefined;
          }),
        );
      }
      expect(byModule).toEqual(usedBy);
      const singleUser = evidenceOf(facts, "single-user-files").filter(
        (entry) => entry.module.id === module.id,
      );
      expect(singleUser.flatMap(({ evidence }) => (evidence.entities ?? []).map(stripId))).toEqual(
        Object.keys(usedBy).filter((file) => usedBy[file]!.length === 1),
      );
      return { directory: module.anchor?.directory, usedBy };
    },
  },
  featureDependenciesAfterRelocation: { compute: featurePairsAfterRelocation },
  featureCyclesAfterRelocation: {
    compute: (facts) => cyclesOf(featurePairsAfterRelocation(facts)),
  },
  // dependency-violations: declared modules are exact (D-22).
  declaredModules: {
    compute: (facts) =>
      Object.fromEntries(
        facts.analysis.document.modules
          .filter((module) => module.origin === "declared")
          .map((module) => [module.name, module.files.map(stripId)]),
      ),
  },
  declaredModuleDependencies: {
    compute: (facts) => {
      const pairs = importPairs(facts, declaredModuleOf(facts));
      expectAggregated(pairs, (name) => moduleNamed(facts, name));
      return pairs;
    },
  },
  // D-62: cycles among the declared modules; inferred modules may form cycles (observations, §3.14).
  moduleCycles: {
    compute: (facts) => {
      const declared = facts.analysis.document.modules.filter(
        (module) => module.origin === "declared",
      );
      const nameOf = new Map(declared.map((module) => [module.id as string, module.name]));
      return cyclesOf(
        declared.flatMap((module) =>
          module.dependencies.flatMap((dependency): [string, string][] => {
            const to = nameOf.get(dependency.entity);
            return to === undefined ? [] : [[module.name, to]];
          }),
        ),
      );
    },
  },
};

// ---------------------------------------------------------------------------------------------------------
// Expectation keys this stage can answer; `subset` keys list representative, not exhaustive, entries.

type Check = {
  readonly compute: (facts: Facts, expectations: Expectations) => unknown;
  readonly subset?: boolean;
};

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
  // Modules and layers (milestone 5).
  ...ARCHITECTURE_CHECKS,
};

// ---------------------------------------------------------------------------------------------------------

describe.each(FIXTURE_NAMES)("fixture %s", (name) => {
  const expected = expectedOf(name);
  let facts: Facts;

  beforeAll(async () => {
    facts = factsOf(await analyzeFixture(name));
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
      const actual = check.compute(facts, expected.expectations);
      if (check.subset === true) {
        expect(actual).toEqual(expect.arrayContaining(value as unknown[]));
      } else {
        expect(actual).toEqual(value);
      }
    });
  }
});
