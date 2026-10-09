/**
 * Test support for module clustering (P1–P6, plan 6.3), shared by the tests of `modules/`:
 *
 * - **Naive reference implementations** of P3 (the prototype's repeated id-order passes for the orchestrator
 *   fixpoint, D-30) and P5 (the map-based passes of §3.15), written for clarity rather than speed, against
 *   which the production code is compared on random graphs (plan 7.1, "Reference equality").
 * - **Scopes for tests**: a scope built directly from paths and weighted arcs, the scopes of a model as P0
 *   forms them, the files of a model's entry points, and synthetic layer labels.
 * - **Random scopes** (fast-check arbitraries) with directory trees made of layer, feature, shared and
 *   container names, file names with recurring stems, and arc weights from the 1/1024 lattice (D-67).
 *
 * Not part of the package build (`tsconfig.build.json` excludes `*test-support.ts`); like tests, it may use
 * Node.js and other workspace packages. These are test inputs and oracles, not analysis results, so no
 * truth label applies to them.
 *
 * Determinism: every builder is a pure function of its arguments; the arbitraries are driven by fast-check's
 * seeded generator.
 */
import { Digraph } from "@katedrala/graph";
import { compareStrings, fileId, parentPath } from "@katedrala/ir";
import type { ArchitecturalRole, FileId } from "@katedrala/ir";
import { DEFAULT_EDGE_KINDS } from "@katedrala/model";
import type { ArchitectureModel } from "@katedrala/model";
import fc from "fast-check";
import { directoryLayer, sourceRoot } from "../directories.js";
import { fileStem } from "../lexical.js";
import { resolveInferenceSettings } from "../settings.js";
import type {
  ClusteringContext,
  FileLabel,
  InferenceSettings,
  ModuleSettings,
  Scope,
  ScopeId,
  UnitKind,
  WeightedFileGraph,
} from "../types.js";
import { buildWeightedFileGraph, restrictWeightedGraph } from "../weighted-graph.js";
import { membersByUnit } from "./prior.js";
import type { Partition } from "./prior.js";

// ─── Settings ─────────────────────────────────────────────────────────────────────────────────────────

/** The default settings (computed once: method strings hash the vocabularies). */
export const DEFAULT_SETTINGS: InferenceSettings = resolveInferenceSettings();

/** The default settings with some module settings replaced (method strings are left as they are). */
export function withModuleSettings(
  overrides: Partial<ModuleSettings>,
  base: InferenceSettings = DEFAULT_SETTINGS,
): InferenceSettings {
  return { ...base, modules: { ...base.modules, ...overrides } };
}

// ─── Scopes for tests ─────────────────────────────────────────────────────────────────────────────────

/** A weighted file graph over given nodes and arcs (the test counterpart of `buildWeightedFileGraph`). */
class TestGraph implements WeightedFileGraph {
  readonly nodes: readonly FileId[];
  readonly graph: Digraph;
  readonly admittedOutDegree: Int32Array;
  readonly reexportOutDegree: Int32Array;
  readonly #index: ReadonlyMap<FileId, number>;

  constructor(
    nodes: readonly FileId[],
    graph: Digraph,
    admittedOutDegree: Int32Array,
    reexportOutDegree: Int32Array,
  ) {
    this.nodes = nodes;
    this.graph = graph;
    this.admittedOutDegree = admittedOutDegree;
    this.reexportOutDegree = reexportOutDegree;
    this.#index = new Map(nodes.map((node, index) => [node, index] as const));
  }

  indexOf(file: FileId): number {
    return this.#index.get(file) ?? -1;
  }
}

/** An arc of a test scope: source path, target path and weight (default 1). */
export type TestArc = readonly [source: string, target: string, weight?: number];

/** The description of a test scope. */
export interface TestScopeSpec {
  /** File paths of the nodes, in any order (they are sorted, as node numbers are file id order). */
  readonly paths: readonly string[];
  /** Arcs between nodes; a repeated pair keeps its first weight. */
  readonly arcs?: readonly TestArc[];
  /**
   * Pairs reached through an admitted `re-exports` relationship (facades, P3). A pair that is not an arc
   * counts as an admitted pair of weight 0 (D-04).
   */
  readonly reexports?: readonly (readonly [source: string, target: string])[];
  readonly id?: ScopeId;
  /** Default "". */
  readonly directory?: string;
  readonly packageName?: string;
}

/**
 * A scope built directly from paths and arcs: node `i` is the i-th path by `compareStrings`, arcs keep their
 * weights, and the admitted (re-export) out-degree of a node counts its distinct arc and re-export targets
 * (its distinct re-export targets).
 *
 * @throws {Error} when an arc or re-export names a path that is not a node, or is a self-loop.
 */
export function testScope(spec: TestScopeSpec): Scope {
  const paths = [...new Set(spec.paths)].sort(compareStrings);
  const index = new Map(paths.map((path, node) => [path, node] as const));
  const nodeOf = (path: string): number => {
    const node = index.get(path);
    if (node === undefined) throw new Error(`Not a node of the test scope: ${path}`);
    return node;
  };
  const weights = new Map<string, readonly [number, number, number]>();
  const admitted = paths.map(() => new Set<number>());
  const reexported = paths.map(() => new Set<number>());
  for (const [source, target, weight = 1] of spec.arcs ?? []) {
    const u = nodeOf(source);
    const v = nodeOf(target);
    if (u === v) throw new Error(`Self-loop in a test scope: ${source}`);
    const key = `${u} ${v}`;
    if (!weights.has(key)) weights.set(key, [u, v, weight]);
    admitted[u]?.add(v);
  }
  for (const [source, target] of spec.reexports ?? []) {
    const u = nodeOf(source);
    const v = nodeOf(target);
    admitted[u]?.add(v);
    reexported[u]?.add(v);
  }
  const arcs = [...weights.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const graph = Digraph.fromEdges(
    paths.length,
    arcs.map((arc) => arc[0]),
    arcs.map((arc) => arc[1]),
    arcs.map((arc) => arc[2]),
  );
  const scope: Scope = {
    id: spec.id ?? "",
    directory: spec.directory ?? "",
    graph: new TestGraph(
      paths.map((path) => fileId(path)),
      graph,
      Int32Array.from(admitted.map((targets) => targets.size)),
      Int32Array.from(reexported.map((targets) => targets.size)),
    ),
  };
  return spec.packageName === undefined ? scope : { ...scope, packageName: spec.packageName };
}

/** The path of every node of a scope, in node order. */
export function scopePaths(scope: Scope): string[] {
  return scope.graph.nodes.map((node) => node.slice("file:".length));
}

/**
 * The units of a working partition as `key kind[*] = paths` (`*` marks destinations), in unit order,
 * empty units included.
 */
export function partitionLines(paths: readonly string[], partition: Partition): string[] {
  const members = membersByUnit(partition.unitOf, partition.units.length);
  return partition.units.map((unit, index) => {
    const files = [...(members[index] ?? [])].map((node) => paths[node] ?? "?");
    return `${unit.key} ${unit.kind}${unit.destination ? "*" : ""} = ${files.join(", ")}`;
  });
}

/** The node number of a path in a scope; throws when it is not a node. */
export function nodeOfPath(scope: Scope, path: string): number {
  const node = scope.graph.indexOf(fileId(path));
  if (node === -1) throw new Error(`Not a node of the scope: ${path}`);
  return node;
}

/**
 * The scopes of a model as P0 forms them (plan 4.4 P0 steps 2–3): the nodes are the files with a role in
 * `settings.modules.fileRoles` minus `declared`, weighted with the default metrics edge kinds (D-02), grouped
 * by package, `""` first, each graph restricted to its scope (D-03).
 */
export function modelScopes(
  model: ArchitectureModel,
  settings: InferenceSettings = DEFAULT_SETTINGS,
  declared: ReadonlySet<FileId> = new Set(),
): Scope[] {
  const graph = buildWeightedFileGraph(model, {
    ...settings.weighting,
    edgeKinds: new Set(DEFAULT_EDGE_KINDS),
    fileRoles: settings.modules.fileRoles,
    exclude: declared,
  });
  const byScope = new Map<ScopeId, number[]>();
  graph.nodes.forEach((file, node) => {
    const id: ScopeId = model.index.file(file)?.package ?? "";
    const nodes = byScope.get(id);
    if (nodes === undefined) byScope.set(id, [node]);
    else nodes.push(node);
  });
  return [...byScope.keys()].sort(compareStrings).map((id): Scope => {
    const restricted = restrictWeightedGraph(graph, Int32Array.from(byScope.get(id) ?? []));
    const pkg = id === "" ? undefined : model.index.package(id);
    return pkg === undefined
      ? { id, directory: "", graph: restricted }
      : { id, directory: pkg.path, packageName: pkg.name, graph: restricted };
  });
}

/** The files of a model's entry points, a file or a symbol's file (D-31). */
export function entryPointFiles(model: ArchitectureModel): ReadonlySet<FileId> {
  const files = new Set<FileId>();
  for (const entry of model.document.entryPoints ?? []) {
    const file = model.fileOf(entry.entity);
    if (file !== undefined) files.add(file);
  }
  return files;
}

/** A synthetic file label with naming votes for the given roles. */
export function testLabel(
  file: FileId,
  label: string | null,
  roles: readonly ArchitecturalRole[] = [],
): FileLabel {
  return {
    file,
    votes: roles.map((role) => ({
      label,
      confidence: 0.8,
      source: "naming" as const,
      producer: "naming",
      role,
      signal: "name-qualifier" as const,
    })),
    label,
    score: label === null ? 0 : 0.8,
  };
}

/**
 * Synthetic layer labels of a scope's nodes, as location votes would give them: the layer of the outermost
 * layer-kind directory between the source root and the file (D-18), when there is one.
 */
export function locationLabels(
  scope: Scope,
  settings: InferenceSettings = DEFAULT_SETTINGS,
): Map<FileId, FileLabel> {
  const paths = scopePaths(scope);
  const root = sourceRoot(scope.directory, paths);
  const labels = new Map<FileId, FileLabel>();
  scope.graph.nodes.forEach((file, node) => {
    const path = paths[node] ?? "";
    const relative = root === "" ? path : path.slice(root.length + 1);
    const segments = relative.split("/").slice(0, -1);
    let prefix = root;
    for (const segment of segments) {
      prefix = prefix === "" ? segment : `${prefix}/${segment}`;
      const layer = directoryLayer(prefix, settings.vocabulary);
      if (layer !== undefined) {
        labels.set(file, testLabel(file, layer));
        return;
      }
    }
  });
  return labels;
}

/** A clustering context with defaults: default settings, no labels, no entry points, `repository`. */
export function testContext(overrides: Partial<ClusteringContext> = {}): ClusteringContext {
  return {
    settings: DEFAULT_SETTINGS,
    labels: new Map(),
    entryPoints: new Set(),
    repositoryName: "repository",
    ...overrides,
  };
}

// ─── Naive reference: P3 (§3.7, the prototype's passes) ───────────────────────────────────────────────

/** The classes of P3 as the naive reference computes them. */
export interface ReferenceClasses {
  readonly firstPassUtilities: ReadonlySet<number>;
  readonly orchestrators: ReadonlySet<number>;
  /** Per orchestrator, the rule that holds at the fixpoint: 1 = entry point, 2 = shape (D-30, D-66). */
  readonly orchestratorRule: ReadonlyMap<number, 1 | 2>;
  /** Per node, the other units its non-utility dependencies reach (shape rule (ii)). */
  readonly dependencyUnits: readonly number[];
  readonly utilities: ReadonlySet<number>;
  /** Per node, the other units among its non-orchestrator dependents. */
  readonly dependentUnits: readonly number[];
  readonly facades: ReadonlySet<number>;
}

/** Arcs into and out of every node: `[neighbour, weight]`. */
function adjacency(scope: Scope): {
  readonly incoming: [number, number][][];
  readonly outgoing: [number, number][][];
} {
  const n = scope.graph.graph.nodeCount;
  const incoming: [number, number][][] = Array.from({ length: n }, () => []);
  const outgoing: [number, number][][] = Array.from({ length: n }, () => []);
  for (const [u, v, w] of scope.graph.graph.edges()) {
    outgoing[u]?.push([v, w]);
    incoming[v]?.push([u, w]);
  }
  return { incoming, outgoing };
}

/**
 * P3 by the prototype's method (`m5/infer3.py`): utilities counted with sets, orchestrators by repeated
 * passes over the nodes in id order until nothing changes (D-30's "naive passes"), facades by degrees.
 *
 * @param unitOf - the prior unit of every node; `kinds[u]` is the kind of unit `u`.
 */
export function referenceStructuralClasses(
  scope: Scope,
  unitOf: Int32Array,
  kinds: readonly UnitKind[],
  settings: InferenceSettings,
  entryPoints: ReadonlySet<FileId>,
): ReferenceClasses {
  const n = scope.graph.graph.nodeCount;
  const { incoming, outgoing } = adjacency(scope);
  const unit = (node: number): number => unitOf[node] ?? -1;
  const threshold = (node: number): number => {
    const kind = kinds[unit(node)];
    return kind === "shared" || kind === "root" ? 2 : settings.modules.utilityMinModules;
  };
  const dependentUnitsOf = (node: number, ignored: ReadonlySet<number>): number => {
    const units = new Set<number>();
    for (const [source] of incoming[node] ?? []) {
      if (!ignored.has(source)) units.add(unit(source));
    }
    units.delete(unit(node));
    return units.size;
  };
  const utilitiesOf = (excluded: ReadonlySet<number>): Set<number> => {
    const found = new Set<number>();
    for (let node = 0; node < n; node++) {
      if (excluded.has(node)) continue;
      if (dependentUnitsOf(node, excluded) >= threshold(node)) found.add(node);
    }
    return found;
  };
  const firstPassUtilities = utilitiesOf(new Set());
  const isEntry = (node: number): boolean => {
    const file = scope.graph.nodes[node];
    return file !== undefined && entryPoints.has(file);
  };

  const dependencyUnits: number[] = [];
  const shape: boolean[] = [];
  for (let node = 0; node < n; node++) {
    const weights = new Map<number, number>();
    for (const [target, w] of outgoing[node] ?? []) {
      if (firstPassUtilities.has(target)) continue;
      weights.set(unit(target), (weights.get(unit(target)) ?? 0) + w);
    }
    const total = [...weights.values()].reduce((sum, w) => sum + w, 0);
    const others = [...weights.keys()].filter((u) => u !== unit(node)).length;
    const largest = Math.max(0, ...weights.values());
    const own = weights.get(unit(node)) ?? 0;
    dependencyUnits.push(others);
    shape.push(total > 0 && others >= 2 && largest <= 0.5 * total && own <= 0.25 * total);
  }

  const orchestrators = new Set<number>();
  let changed = true;
  while (changed) {
    changed = false;
    for (let node = 0; node < n; node++) {
      if (orchestrators.has(node) || firstPassUtilities.has(node)) continue;
      const dependents = (incoming[node] ?? [])
        .map(([source]) => source)
        .filter((source) => !orchestrators.has(source));
      if (isEntry(node) && dependents.length === 0) {
        orchestrators.add(node);
        changed = true;
        continue;
      }
      if (dependents.some((source) => unit(source) !== unit(node))) continue;
      if (shape[node] === true) {
        orchestrators.add(node);
        changed = true;
      }
    }
  }
  const orchestratorRule = new Map<number, 1 | 2>();
  for (const node of orchestrators) {
    const dependents = (incoming[node] ?? []).filter(([source]) => !orchestrators.has(source));
    orchestratorRule.set(node, isEntry(node) && dependents.length === 0 ? 1 : 2);
  }
  const utilities = utilitiesOf(orchestrators);
  const dependentUnits: number[] = [];
  for (let node = 0; node < n; node++) dependentUnits.push(dependentUnitsOf(node, orchestrators));
  const facades = new Set<number>();
  for (let node = 0; node < n; node++) {
    const admitted = scope.graph.admittedOutDegree[node] ?? 0;
    const reexports = scope.graph.reexportOutDegree[node] ?? 0;
    if (admitted > 0 && reexports / admitted >= 0.5) facades.add(node);
  }
  return {
    firstPassUtilities,
    orchestrators,
    orchestratorRule,
    dependencyUnits,
    utilities,
    dependentUnits,
    facades,
  };
}

// ─── Naive reference: P5 (§3.9, §3.15) ───────────────────────────────────────────────────────────────

/** A unit as the P5 reference sees it. */
export interface ReferenceUnit {
  readonly key: string;
  readonly destination: boolean;
}

/** One move's evidence: weight and files per unit key, and dependency weight per unit key. */
export interface ReferenceMove {
  readonly dependents: ReadonlyMap<string, { readonly weight: number; readonly files: number }>;
  readonly dependencies: ReadonlyMap<string, number>;
}

/** The result of the P5 reference. */
export interface ReferenceReassignment {
  readonly unitOf: Int32Array;
  readonly passes: number;
  readonly converged: boolean;
  /** Per node whose final unit differs from its initial one: the evidence of its last move. */
  readonly relocations: ReadonlyMap<number, ReferenceMove>;
}

/**
 * P5 written as §3.15's pseudo-code: per node, maps from unit keys to in-weights, dependent files and
 * out-weights; the strongest unit by in-weight, ties to the smallest key; the five conditions of §3.9 with
 * the current size of the file's unit (D-74). Passes in id order with immediate updates, at most
 * `maxPasses`; when every allowed pass moved a file, one more pass is evaluated without applying it to
 * decide `converged` (D-37).
 */
export function referenceReassign(
  scope: Scope,
  initial: Int32Array,
  units: readonly ReferenceUnit[],
  pinned: ReadonlySet<number>,
  excluded: ReadonlySet<number>,
  settings: InferenceSettings,
): ReferenceReassignment {
  const { moveMinSupport, moveMinWeight, maxPasses } = settings.modules;
  const n = scope.graph.graph.nodeCount;
  const { incoming, outgoing } = adjacency(scope);
  const unitOf = Int32Array.from(initial);
  const keyOf = (node: number): string => units[unitOf[node] ?? -1]?.key ?? "";
  const unitByKey = new Map(units.map((unit, index) => [unit.key, index] as const));
  const lastMove = new Map<number, ReferenceMove>();

  /** The unit `node` would move to, with the evidence, or undefined. */
  const decide = (
    node: number,
  ): { readonly to: number; readonly move: ReferenceMove } | undefined => {
    const inW = new Map<string, number>();
    const inFiles = new Map<string, Set<number>>();
    const outW = new Map<string, number>();
    for (const [source, w] of incoming[node] ?? []) {
      if (excluded.has(source)) continue;
      const key = keyOf(source);
      inW.set(key, (inW.get(key) ?? 0) + w);
      const files = inFiles.get(key) ?? new Set<number>();
      files.add(source);
      inFiles.set(key, files);
    }
    for (const [target, w] of outgoing[node] ?? []) {
      if (excluded.has(target)) continue;
      const key = keyOf(target);
      outW.set(key, (outW.get(key) ?? 0) + w);
    }
    const totalIn = [...inW.values()].reduce((sum, w) => sum + w, 0);
    const totalOut = [...outW.values()].reduce((sum, w) => sum + w, 0);
    if (totalIn === 0) return undefined;
    const [best] = [...inW.keys()].sort(
      (a, b) => (inW.get(b) ?? 0) - (inW.get(a) ?? 0) || compareStrings(a, b),
    );
    if (best === undefined) return undefined;
    const target = unitByKey.get(best);
    if (target === undefined) return undefined;
    const current = unitOf[node] ?? -1;
    let size = 0;
    for (const other of unitOf) if (other === current) size++;
    const minSupport = size >= 2 ? moveMinSupport : 1;
    const weight = inW.get(best) ?? 0;
    const moves =
      target !== current &&
      units[target]?.destination === true &&
      weight > 0.5 * totalIn &&
      weight >= moveMinWeight &&
      (inFiles.get(best)?.size ?? 0) >= minSupport &&
      (totalOut === 0 || (outW.get(best) ?? 0) > 0.5 * totalOut);
    if (!moves) return undefined;
    const keys = [...new Set([...inW.keys(), ...outW.keys()])].sort(compareStrings);
    const dependents = new Map<string, { weight: number; files: number }>();
    const dependencies = new Map<string, number>();
    for (const key of keys) {
      const files = inFiles.get(key)?.size ?? 0;
      if (files > 0) dependents.set(key, { weight: inW.get(key) ?? 0, files });
      const out = outW.get(key) ?? 0;
      if (out > 0) dependencies.set(key, out);
    }
    return { to: target, move: { dependents, dependencies } };
  };

  let passes = 0;
  let converged = false;
  while (passes < maxPasses) {
    passes++;
    let moved = false;
    for (let node = 0; node < n; node++) {
      if (pinned.has(node)) continue;
      const decision = decide(node);
      if (decision === undefined) continue;
      unitOf[node] = decision.to;
      lastMove.set(node, decision.move);
      moved = true;
    }
    if (!moved) {
      converged = true;
      break;
    }
  }
  if (!converged) {
    converged = true;
    for (let node = 0; node < n; node++) {
      if (!pinned.has(node) && decide(node) !== undefined) converged = false;
    }
  }
  const relocations = new Map<number, ReferenceMove>();
  for (let node = 0; node < n; node++) {
    if (unitOf[node] === initial[node]) continue;
    relocations.set(node, lastMove.get(node) ?? { dependents: new Map(), dependencies: new Map() });
  }
  return { unitOf, passes, converged, relocations };
}

// ─── Random scopes ────────────────────────────────────────────────────────────────────────────────────

/**
 * Directory names of random trees (default vocabulary): four layer directories, then three feature, two
 * shared and two container directories.
 */
export const RANDOM_DIRECTORIES: readonly string[] = [
  "controllers",
  "services",
  "models",
  "repositories",
  "orders",
  "payments",
  "cart",
  "shared",
  "utils",
  "features",
  "src",
];

/** File-name heads of random files: recurring stems, plural and capitalized spellings, generic tokens. */
export const RANDOM_HEADS: readonly string[] = [
  "order",
  "orders",
  "Order",
  "payment",
  "user",
  "cart",
  "index",
  "main",
  "format",
  "formatDate",
];

/** File-name qualifiers of random files. */
export const RANDOM_QUALIFIERS: readonly string[] = ["", ".service", ".controller", ".model"];

/** Arc weights of random scopes: multiples of 1/4, a sublattice of D-67's 1/1024 lattice with many ties. */
export const RANDOM_WEIGHTS: readonly number[] = [0.25, 0.5, 0.75, 1];

/** A random scope and the path of each of its nodes, in node order (sorted). */
export interface RandomScope {
  readonly scope: Scope;
  readonly paths: readonly string[];
}

/** Options of {@link arbitraryScope}. */
export interface RandomScopeOptions {
  /** Maximum number of random files (default 30); chains add up to 12 more. */
  readonly maxFiles?: number;
  /** Maximum number of uniformly random arcs (default 90). */
  readonly maxArcs?: number;
  /** Maximum directory depth below `src/` (default 2). */
  readonly maxDepth?: number;
  /** Every file except `src/main.ts` directly in one flat directory, `src/lib` (the case of P4). */
  readonly flat?: boolean;
}

/**
 * Random scopes of up to `maxFiles` random nodes below `src/` (plus the files of chains), in directories
 * drawn from {@link RANDOM_DIRECTORIES} (mostly a layer or feature directory directly below `src/`; or one
 * flat directory), with arcs weighted from {@link RANDOM_WEIGHTS} of four sorts, so that every phase has
 * work to do:
 *
 * - up to `maxArcs` uniformly random arcs;
 * - *links* between files with the same file stem, which make stems recur connected across directories (P2);
 * - *pulls*: two or three files of one directory depend on a file elsewhere, which depends on one of them,
 *   the evidence P5 moves files on;
 * - *chains* (not in flat scopes): two to four added files `link<j><i>.ts` of one directory, each used by the
 *   same two added files `user<j>a.ts` and `user<j>b.ts` of a feature directory and depending on the next
 *   link. Only the last link can move first; each move lets the link before it follow in the next pass, so
 *   P5 runs several passes and can stop at `maxPasses` with moves pending (D-37, D-74);
 *
 * plus some re-export pairs (facades).
 */
export function arbitraryScope(options: RandomScopeOptions = {}): fc.Arbitrary<RandomScope> {
  const { maxFiles = 30, maxArcs = 90, maxDepth = 2, flat = false } = options;
  // Mostly one level below `src/` (layer and feature directories, as P2 and P5 need), else random depths.
  const directories = fc.oneof(
    { weight: 3, arbitrary: fc.tuple(fc.constantFrom(...RANDOM_DIRECTORIES.slice(0, 4))) },
    { weight: 2, arbitrary: fc.tuple(fc.constantFrom(...RANDOM_DIRECTORIES.slice(4, 7))) },
    {
      weight: 2,
      arbitrary: fc.array(fc.constantFrom(...RANDOM_DIRECTORIES), { maxLength: maxDepth }),
    },
  );
  const file = fc.tuple(
    directories,
    fc.constantFrom(...RANDOM_HEADS),
    fc.constantFrom(...RANDOM_QUALIFIERS),
    fc.integer({ min: 0, max: 2 }),
  );
  const weight = fc.constantFrom(...RANDOM_WEIGHTS);
  return fc
    .record({
      files: fc.array(file, { minLength: 1, maxLength: maxFiles, size: "max" }),
      arcs: fc.array(fc.tuple(fc.nat(), fc.nat(), weight), { maxLength: maxArcs }),
      links: fc.array(fc.tuple(fc.nat(), fc.nat(), fc.nat(), weight), { maxLength: maxFiles }),
      pulls: fc.array(fc.tuple(fc.nat(), fc.nat(), fc.nat(), weight), { maxLength: 8 }),
      chains: fc.array(
        fc.tuple(
          fc.constantFrom(...RANDOM_DIRECTORIES.slice(4, 7)),
          fc.constantFrom(...RANDOM_DIRECTORIES),
          fc.integer({ min: 2, max: 4 }),
          weight,
        ),
        { maxLength: 2 },
      ),
      reexports: fc.array(fc.tuple(fc.nat(), fc.nat()), { maxLength: 6 }),
    })
    .map(({ files, arcs, links, pulls, chains, reexports }) => {
      const names = files.map(([directories, head, qualifier, variant]) =>
        [
          "src",
          ...(flat ? ["lib"] : directories),
          `${head}${variant === 0 ? "" : String(variant)}${qualifier}.ts`,
        ].join("/"),
      );
      // Chains: the users and links of each chain, as `[users, links, weight]`.
      const chainFiles: [string[], string[], number][] = [];
      chains.forEach(([userDirectory, linkDirectory, length, w], j) => {
        if (flat || userDirectory === linkDirectory) return;
        const users = ["a", "b"].map((x) => `src/${userDirectory}/user${String(j)}${x}.ts`);
        const links = Array.from(
          { length },
          (_, i) => `src/${linkDirectory}/link${String(j)}${String(i)}.ts`,
        );
        names.push(...users, ...links);
        chainFiles.push([users, links, w]);
      });
      const paths = [...new Set(flat ? ["src/main.ts", ...names] : names)].sort(compareStrings);
      const n = paths.length;
      const testArcs: TestArc[] = [];
      const add = (source: string | undefined, target: string | undefined, w: number): void => {
        if (source !== undefined && target !== undefined && source !== target) {
          testArcs.push([source, target, w]);
        }
      };
      for (const [a, b, w] of arcs) add(paths[a % n], paths[b % n], w);
      // Links: groups of files with the same stem, sorted by stem.
      const byStem = new Map<string, string[]>();
      for (const path of paths) {
        const stem = fileStem(path, DEFAULT_SETTINGS.vocabulary)?.stem;
        if (stem === undefined) continue;
        const group = byStem.get(stem);
        if (group === undefined) byStem.set(stem, [path]);
        else group.push(path);
      }
      const groups = [...byStem.keys()].sort(compareStrings).map((stem) => byStem.get(stem) ?? []);
      for (const [g, a, b, w] of links) {
        const group = groups.length === 0 ? [] : (groups[g % groups.length] ?? []);
        if (group.length >= 2) add(group[a % group.length], group[b % group.length], w);
      }
      // Pulls: files of one directory depend on a file elsewhere, which depends on one of them.
      for (const [f, d, k, w] of pulls) {
        const pulled = paths[f % n];
        const directory = parentPath(paths[d % n] ?? "");
        const users = paths.filter((path) => parentPath(path) === directory && path !== pulled);
        for (const user of users.slice(0, 2 + (k % 2))) add(user, pulled, w);
        add(pulled, users[0], w);
      }
      // Chains: every link is used by both users and uses the next link.
      for (const [users, links, w] of chainFiles) {
        links.forEach((link, i) => {
          for (const user of users) add(user, link, w);
          add(link, links[i + 1], w);
        });
      }
      const testReexports: (readonly [string, string])[] = [];
      for (const [a, b] of reexports) {
        const source = paths[a % n];
        const target = paths[b % n];
        if (source === undefined || target === undefined || source === target) continue;
        testReexports.push([source, target]);
      }
      return { scope: testScope({ paths, arcs: testArcs, reexports: testReexports }), paths };
    });
}
