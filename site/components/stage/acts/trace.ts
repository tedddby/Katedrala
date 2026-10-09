/**
 * Tracing one file through Katedrala's analysis of CodeVerse (public/data/codeverse-graph.json): down through
 * what it stands on (its dependencies, to the foundations) or up through what rests on it (its dependents), one
 * dependency per step, with one shortest path from every file reached back to the file traced.
 *
 * This page computes the traces itself, over the dependencies Katedrala recorded. They are not Katedrala's impact
 * analysis, which is planned for v1 (milestone 9), and wherever their numbers appear the page says so.
 *
 * Pure and deterministic: the server states the acts' counts with it and the browser traces any file with it, and
 * both get the same numbers. Three scopes, each adding to the one before:
 * - "runtime": runtime dependencies between source files, the chains the film draws;
 * - "types": also the type-only dependencies between source files;
 * - "tests": also the test files, and every dependency to or from them.
 * Where paths are equally short, a file's path runs through the file one step closer whose path sorts first, so a
 * trace has exactly one tree, whatever order the data lists its dependencies in.
 *
 * Numbering: source files are numbered as the hanging model numbers its files (the data's source files, in the
 * data's order) and runtime dependencies between source files as it numbers its chains, so a trace lights the
 * model directly. Test files follow the source files.
 */

/** Down to what a file stands on, or up through what rests on it. */
export type TraceDirection = "down" | "up";
/** What a trace follows, each scope adding to the one before. */
export type TraceScope = "runtime" | "types" | "tests";

export const TRACE_SCOPES: readonly TraceScope[] = ["runtime", "types", "tests"];

/** The fields of the graph data a trace reads (the hanging model's GraphData has them all). */
export interface TraceData {
  readonly files: readonly (readonly [
    path: string,
    group: number,
    role: number,
    ...rest: number[],
  ])[];
  readonly edges: readonly (readonly [
    dependent: number,
    dependency: number,
    observations: number,
    runtime: number,
  ])[];
  readonly foundations: readonly number[];
}

export interface TraceGraph {
  /** Source files: numbered 0 to sources - 1, as the hanging model numbers them. */
  readonly sources: number;
  /** Every file: the source files, then the test files. */
  readonly files: number;
  readonly paths: readonly string[];
  /** Each file's position in path order, which breaks ties between equally short paths. */
  readonly rank: Int32Array;
  /** 1 for a foundation: a source file others depend on at runtime that depends on no other at runtime. */
  readonly foundation: Uint8Array;
  /**
   * The folders files are grouped in, in path order: the first folder under src/ ("src/analysis"), src itself
   * for a file at its root, the top-level folder outside src/ ("tests"), and "" for the repository's root.
   */
  readonly folders: readonly string[];
  /** Each file's folder, an index into folders. */
  readonly folder: Int32Array;
  /** Runtime dependencies between source files, numbered as the hanging model numbers its chains. */
  readonly chains: number;
  /** The dependent end of each chain: the file that depends. */
  readonly chainA: Int32Array;
  /** The dependency end of each chain. */
  readonly chainB: Int32Array;
}

export interface Trace {
  readonly graph: TraceGraph;
  readonly subject: number;
  readonly direction: TraceDirection;
  readonly scope: TraceScope;
  /** Dependencies between each file and the subject on the shortest path: 0 for the subject, -1 if not reached. */
  readonly step: Int32Array;
  /** The next file on that path, towards the subject; -1 for the subject and for files not reached. */
  readonly parent: Int32Array;
  /** The chain from a file to its parent; -1 where that dependency is no chain (type-only, or a test file's). */
  readonly via: Int32Array;
  /** The files at each step, in path order: layers[0] holds the subject alone. */
  readonly layers: readonly (readonly number[])[];
  /** Files reached, the subject left out. */
  readonly count: number;
  /** Of those, the source files. */
  readonly sourceCount: number;
  /** Of those, the foundations. */
  readonly foundationCount: number;
}

/** What a trace lights in the hanging model, 1 for lit: files by their number, chains by theirs. */
export interface TraceMask {
  readonly nodes: Uint8Array;
  readonly edges: Uint8Array;
}

/** One direction of a file's reach, as the landing's readout and the acts state it. */
export interface Reach {
  /** Files one runtime dependency away. */
  readonly direct: number;
  /** Source files reached at runtime. */
  readonly runtime: number;
  /** Of those, the foundations. */
  readonly foundations: number;
  /** Source files reached with type-only dependencies too. */
  readonly types: number;
  /** Files reached with the tests too. */
  readonly tests: number;
}

/** Dependencies in trace numbering, and the adjacency built for each scope and direction on first use. */
interface Edges {
  readonly a: Int32Array;
  readonly b: Int32Array;
  /** The chain each dependency is, -1 when it is none. */
  readonly chain: Int32Array;
  readonly links: Map<string, Links>;
}

/** Adjacency, compressed: the files a file leads to are to[start[v]] up to to[start[v + 1]]. */
interface Links {
  readonly start: Int32Array;
  readonly to: Int32Array;
  readonly chain: Int32Array;
}

const EDGES = new WeakMap<TraceGraph, Edges>();

function folderOf(path: string): string {
  const parts = path.split("/");
  if (parts[0] === "src" && parts.length > 2) return `src/${parts[1]!}`;
  return parts.length > 1 ? parts[0]! : "";
}

const byText = (p: string, q: string) => (p < q ? -1 : p > q ? 1 : 0);

export function traceGraph(data: TraceData): TraceGraph {
  const total = data.files.length;
  // Source files first, then test files, each in the data's order (as the hanging model numbers them).
  const order: number[] = [];
  data.files.forEach((f, i) => {
    if (f[2] === 0) order.push(i);
  });
  const sources = order.length;
  data.files.forEach((f, i) => {
    if (f[2] !== 0) order.push(i);
  });
  const index = new Int32Array(total);
  order.forEach((i, v) => (index[i] = v));
  const paths = order.map((i) => data.files[i]![0]);

  const rank = new Int32Array(total);
  [...paths.keys()].sort((p, q) => byText(paths[p]!, paths[q]!)).forEach((v, r) => (rank[v] = r));

  const foundation = new Uint8Array(total);
  for (const i of data.foundations) {
    const v = index[i];
    if (v === undefined || v >= sources) throw new Error(`foundation ${i} is not a source file`);
    foundation[v] = 1;
  }

  const folderNames = paths.map(folderOf);
  const folders = [...new Set(folderNames)].sort(byText);
  const folderIndex = new Map(folders.map((f, i) => [f, i]));
  const folder = Int32Array.from(folderNames, (f) => folderIndex.get(f)!);

  const m = data.edges.length;
  const a = new Int32Array(m);
  const b = new Int32Array(m);
  const chain = new Int32Array(m).fill(-1);
  const chainA: number[] = [];
  const chainB: number[] = [];
  data.edges.forEach((e, k) => {
    const u = index[e[0]];
    const w = index[e[1]];
    if (u === undefined || w === undefined) throw new Error(`dependency ${k} names no file`);
    a[k] = u;
    b[k] = w;
    if (e[3] === 1 && u < sources && w < sources) {
      chain[k] = chainA.length;
      chainA.push(u);
      chainB.push(w);
    }
  });

  const graph: TraceGraph = {
    sources,
    files: total,
    paths,
    rank,
    foundation,
    folders,
    folder,
    chains: chainA.length,
    chainA: Int32Array.from(chainA),
    chainB: Int32Array.from(chainB),
  };
  EDGES.set(graph, { a, b, chain, links: new Map() });
  return graph;
}

function linksOf(graph: TraceGraph, scope: TraceScope, direction: TraceDirection): Links {
  const edges = EDGES.get(graph);
  if (edges === undefined) throw new Error("not a graph made by traceGraph");
  const key = `${scope} ${direction}`;
  const known = edges.links.get(key);
  if (known !== undefined) return known;

  const { a, b, chain } = edges;
  const keep = (k: number) =>
    scope === "tests" ||
    (scope === "types" ? a[k]! < graph.sources && b[k]! < graph.sources : chain[k]! >= 0);
  const from = direction === "down" ? a : b;
  const to = direction === "down" ? b : a;
  const start = new Int32Array(graph.files + 1);
  for (let k = 0; k < a.length; k++) {
    if (keep(k)) start[from[k]! + 1] = start[from[k]! + 1]! + 1;
  }
  for (let v = 0; v < graph.files; v++) start[v + 1] = start[v + 1]! + start[v]!;
  const next = start.slice(0, graph.files);
  const target = new Int32Array(start[graph.files]!);
  const via = new Int32Array(target.length);
  for (let k = 0; k < a.length; k++) {
    if (!keep(k)) continue;
    const at = next[from[k]!]!;
    next[from[k]!] = at + 1;
    target[at] = to[k]!;
    via[at] = chain[k]!;
  }
  const links = { start, to: target, chain: via };
  edges.links.set(key, links);
  return links;
}

/** A file's number from its path; -1 for a path the data does not list. */
export function fileOf(graph: TraceGraph, path: string): number {
  return graph.paths.indexOf(path);
}

/** Traces one file in one direction over one scope, breadth first: every file reached at its fewest steps. */
export function trace(
  graph: TraceGraph,
  subject: number,
  direction: TraceDirection,
  scope: TraceScope,
): Trace {
  if (!Number.isInteger(subject) || subject < 0 || subject >= graph.files) {
    throw new RangeError(`no file ${subject}`);
  }
  const { start, to, chain } = linksOf(graph, scope, direction);
  const step = new Int32Array(graph.files).fill(-1);
  const parent = new Int32Array(graph.files).fill(-1);
  const via = new Int32Array(graph.files).fill(-1);
  step[subject] = 0;
  const layers: number[][] = [[subject]];
  // Each step's files are visited in path order, so the first to reach a file is, of the files one step closer
  // that lead to it, the one whose path sorts first.
  for (let frontier = layers[0]!; ;) {
    const next: number[] = [];
    for (const u of frontier) {
      for (let i = start[u]!; i < start[u + 1]!; i++) {
        const w = to[i]!;
        if (step[w] !== -1) continue;
        step[w] = layers.length;
        parent[w] = u;
        via[w] = chain[i]!;
        next.push(w);
      }
    }
    if (next.length === 0) break;
    next.sort((p, q) => graph.rank[p]! - graph.rank[q]!);
    layers.push(next);
    frontier = next;
  }
  let count = 0;
  let sourceCount = 0;
  let foundationCount = 0;
  for (let d = 1; d < layers.length; d++) {
    for (const v of layers[d]!) {
      count++;
      if (v < graph.sources) sourceCount++;
      foundationCount += graph.foundation[v]!;
    }
  }
  return {
    graph,
    subject,
    direction,
    scope,
    step,
    parent,
    via,
    layers,
    count,
    sourceCount,
    foundationCount,
  };
}

/** Files reached within the given number of steps, the subject left out: the trace's running count. */
export function within(t: Trace, steps: number): number {
  let count = 0;
  for (let d = 1; d < t.layers.length && d <= steps; d++) count += t.layers[d]!.length;
  return count;
}

/** The shortest path from a file back to the subject, both included; empty for a file the trace did not reach. */
export function pathTo(t: Trace, file: number): number[] {
  if ((t.step[file] ?? -1) < 0) return [];
  const path = [file];
  for (let v = file; v !== t.subject;) {
    v = t.parent[v]!;
    path.push(v);
  }
  return path;
}

function maskFor(graph: TraceGraph, into: TraceMask | undefined): TraceMask {
  const mask = into ?? {
    nodes: new Uint8Array(graph.sources),
    edges: new Uint8Array(graph.chains),
  };
  mask.nodes.fill(0);
  mask.edges.fill(0);
  return mask;
}

/**
 * What a trace lights in the model, up to a number of steps (all of them by default): the subject and the source
 * files reached; then either the chains of its tree (tree: true, each file's chain to its parent) or every chain
 * that carries load between lit files in the trace's direction (its far end reached, its near end lit).
 * `into` reuses masks of the model's sizes instead of allocating new ones.
 */
export function traceMask(
  t: Trace,
  options: { readonly upTo?: number; readonly tree?: boolean; readonly into?: TraceMask } = {},
): TraceMask {
  const { graph, step, via } = t;
  const upTo = options.upTo ?? Infinity;
  const mask = maskFor(graph, options.into);
  const lit = (v: number) => step[v]! >= 0 && step[v]! <= upTo;
  for (let v = 0; v < graph.sources; v++) if (lit(v)) mask.nodes[v] = 1;
  if (options.tree === true) {
    for (let v = 0; v < graph.sources; v++) {
      if (step[v]! > 0 && lit(v) && via[v]! >= 0) mask.edges[via[v]!] = 1;
    }
  } else {
    const far = t.direction === "up" ? graph.chainA : graph.chainB;
    const near = t.direction === "up" ? graph.chainB : graph.chainA;
    for (let k = 0; k < graph.chains; k++) {
      if (step[far[k]!]! > 0 && lit(far[k]!) && lit(near[k]!)) mask.edges[k] = 1;
    }
  }
  return mask;
}

/** What the shortest path from a file back to the subject lights: its files and its chains. */
export function pathMask(t: Trace, file: number, into?: TraceMask): TraceMask {
  const mask = maskFor(t.graph, into);
  for (const v of pathTo(t, file)) {
    if (v < t.graph.sources) mask.nodes[v] = 1;
    if (t.via[v]! >= 0) mask.edges[t.via[v]!] = 1;
  }
  return mask;
}

/** A file's reach in one direction over the three scopes. */
export function reachOf(graph: TraceGraph, file: number, direction: TraceDirection): Reach {
  const runtime = trace(graph, file, direction, "runtime");
  return {
    direct: runtime.layers[1]?.length ?? 0,
    runtime: runtime.count,
    foundations: runtime.foundationCount,
    types: trace(graph, file, direction, "types").count,
    tests: trace(graph, file, direction, "tests").count,
  };
}

/** Files reached in each folder (indexed as graph.folders), the subject left out. */
export function folderCounts(t: Trace): Int32Array {
  const counts = new Int32Array(t.graph.folders.length);
  for (let d = 1; d < t.layers.length; d++) {
    for (const v of t.layers[d]!) counts[t.graph.folder[v]!] = counts[t.graph.folder[v]!]! + 1;
  }
  return counts;
}

/** The source files by folder, folders and files in path order: the groups a list of every file shows. */
export function listing(
  graph: TraceGraph,
): readonly { readonly folder: string; readonly files: readonly number[] }[] {
  const groups = new Map<number, number[]>();
  const order = [...Array(graph.sources).keys()].sort((p, q) => graph.rank[p]! - graph.rank[q]!);
  for (const v of order) {
    const f = graph.folder[v]!;
    const list = groups.get(f);
    if (list === undefined) groups.set(f, [v]);
    else list.push(v);
  }
  return [...groups]
    .sort((x, y) => x[0] - y[0])
    .map(([f, files]) => ({ folder: graph.folders[f]!, files }));
}
