/**
 * The real data behind the stage: Katedrala's dependency graph of CodeVerse (commit 6b942bc), lifted to files by
 * site/scripts/build-codeverse-graph.mjs and served as /data/codeverse-graph.json. The model keeps the source files
 * and the runtime dependencies between them; test files and type-only imports are left out. Every number the stage
 * shows is computed here, from that file.
 */

/** [path, group, role (0 source, 1 test), lines, symbols, level, reach, fanIn, fanOut] */
export type FileRow = readonly [
  path: string,
  group: number,
  role: number,
  lines: number,
  symbols: number,
  level: number,
  reach: number,
  fanIn: number,
  fanOut: number,
];
/** [dependent, dependency, observations, runtime (1) or type-only (0)] */
export type EdgeRow = readonly [
  dependent: number,
  dependency: number,
  observations: number,
  runtime: number,
];

export interface GraphData {
  readonly source: {
    readonly repository: string;
    readonly commit: string | null;
    readonly generator: string;
    readonly schemaVersion: string;
  };
  readonly counts: {
    readonly files: number;
    readonly sourceFiles: number;
    readonly testFiles: number;
    readonly dependencies: number;
    readonly runtimeSourceDependencies: number;
    readonly foundations: number;
    readonly entries: number;
    readonly isolated: number;
    readonly maxLevel: number;
  };
  readonly groups: readonly string[];
  readonly files: readonly FileRow[];
  readonly edges: readonly EdgeRow[];
  readonly foundations: readonly number[];
  readonly entries: readonly number[];
}

/** What a file is in the structure: on the ground, at a crown, alone, or a member in between. */
export type FileKind = "foundation" | "entry" | "isolated" | "member";

export interface FileNode {
  /** Index in the model (source files only). */
  readonly id: number;
  /** Index in data.files. */
  readonly row: number;
  readonly path: string;
  readonly group: number;
  readonly lines: number;
  readonly symbols: number;
  /** Longest runtime dependency path down to a foundation. */
  readonly level: number;
  /** Source files resting on this one, directly or not. */
  readonly reach: number;
  readonly fanIn: number;
  readonly fanOut: number;
  readonly kind: FileKind;
}

/** One runtime dependency: the dependent hangs from (and, turned over, stands on) its dependency. */
export interface Chain {
  readonly dependent: number;
  readonly dependency: number;
  readonly observations: number;
  /** Lines of code this chain carries in the static load flow (see loadFlow). */
  readonly load: number;
}

export interface Model {
  readonly data: GraphData;
  readonly nodes: readonly FileNode[];
  readonly chains: readonly Chain[];
  /** Chain indices per node: the dependencies it hangs from. */
  readonly up: readonly (readonly number[])[];
  /** Chain indices per node: the dependents hanging from it. */
  readonly down: readonly (readonly number[])[];
  readonly maxLevel: number;
  /** Groups that hold at least one anchor (foundation or isolated file), in data order. */
  readonly anchorGroups: readonly number[];
}

export function buildModel(data: GraphData): Model {
  const rowToId = new Map<number, number>();
  const rows: number[] = [];
  data.files.forEach((file, row) => {
    if (file[2] === 0) {
      rowToId.set(row, rows.length);
      rows.push(row);
    }
  });
  const foundations = new Set(data.foundations);
  const entries = new Set(data.entries);

  const nodes: FileNode[] = rows.map((row, id) => {
    const f = data.files[row]!;
    const kind: FileKind = foundations.has(row)
      ? "foundation"
      : entries.has(row)
        ? "entry"
        : f[7] === 0 && f[8] === 0
          ? "isolated"
          : "member";
    return {
      id,
      row,
      path: f[0],
      group: f[1],
      lines: f[3],
      symbols: f[4],
      level: f[5],
      reach: f[6],
      fanIn: f[7],
      fanOut: f[8],
      kind,
    };
  });

  const raw: { dependent: number; dependency: number; observations: number }[] = [];
  for (const e of data.edges) {
    if (e[3] !== 1) continue;
    const a = rowToId.get(e[0]);
    const b = rowToId.get(e[1]);
    if (a === undefined || b === undefined) continue;
    raw.push({ dependent: a, dependency: b, observations: e[2] });
  }

  const up: number[][] = nodes.map(() => []);
  const down: number[][] = nodes.map(() => []);
  raw.forEach((c, i) => {
    up[c.dependent]!.push(i);
    down[c.dependency]!.push(i);
  });

  const load = loadFlow(nodes, raw, up, down);
  const chains: Chain[] = raw.map((c) => ({
    ...c,
    load: load[c.dependent]! / Math.max(1, up[c.dependent]!.length),
  }));

  const anchorGroups = [
    ...new Set(
      nodes.filter((n) => n.kind === "foundation" || n.kind === "isolated").map((n) => n.group),
    ),
  ].sort((a, b) => a - b);

  return {
    data,
    nodes,
    chains,
    up,
    down,
    maxLevel: Math.max(...nodes.map((n) => n.level)),
    anchorGroups,
  };
}

/**
 * Static load flow: every file weighs its lines, and passes its own weight plus everything hanging from it to the
 * files it depends on, in equal shares. Foundations end up carrying the whole structure. Used to size the chains;
 * the line weight on the stage comes from the simulated tension instead.
 */
function loadFlow(
  nodes: readonly FileNode[],
  chains: readonly { dependent: number; dependency: number }[],
  up: readonly (readonly number[])[],
  down: readonly (readonly number[])[],
): Float64Array {
  const load = new Float64Array(nodes.length);
  const order = nodes.map((n) => n.id).sort((a, b) => nodes[b]!.level - nodes[a]!.level || a - b);
  for (const id of order) {
    let total = nodes[id]!.lines;
    for (const c of down[id]!) {
      const d = chains[c]!.dependent;
      total += load[d]! / Math.max(1, up[d]!.length);
    }
    load[id] = total;
  }
  return load;
}

/** Every file a node rests on, down to the foundations: its load path. */
export function loadPath(model: Model, id: number): Set<number> {
  const seen = new Set<number>([id]);
  const stack = [id];
  while (stack.length > 0) {
    const n = stack.pop()!;
    for (const c of model.up[n]!) {
      const b = model.chains[c]!.dependency;
      if (!seen.has(b)) {
        seen.add(b);
        stack.push(b);
      }
    }
  }
  return seen;
}

/** Every file resting on a node, directly or not (its reach, as a set). */
export function restingOn(model: Model, id: number): Set<number> {
  const seen = new Set<number>([id]);
  const stack = [id];
  while (stack.length > 0) {
    const n = stack.pop()!;
    for (const c of model.down[n]!) {
      const a = model.chains[c]!.dependent;
      if (!seen.has(a)) {
        seen.add(a);
        stack.push(a);
      }
    }
  }
  return seen;
}

/** The facts the page states in words: all computed from the data, never typed in. */
export interface Facts {
  readonly repository: string;
  readonly commit: string;
  readonly sourceFiles: number;
  readonly testFiles: number;
  readonly chains: number;
  readonly foundations: number;
  readonly entries: number;
  readonly isolated: number;
  readonly levels: number;
  readonly anchorGroups: number;
  readonly lines: number;
  readonly heaviest: readonly {
    readonly path: string;
    readonly reach: number;
    readonly lines: number;
  }[];
}

export function factsOf(model: Model): Facts {
  const { data, nodes } = model;
  const heaviest = nodes
    .filter((n) => n.kind === "foundation")
    .sort((a, b) => b.reach - a.reach || (a.path < b.path ? -1 : 1))
    .slice(0, 5)
    .map((n) => ({ path: n.path, reach: n.reach, lines: n.lines }));
  return {
    repository: data.source.repository,
    commit: data.source.commit ?? "unknown",
    sourceFiles: nodes.length,
    testFiles: data.counts.testFiles,
    chains: model.chains.length,
    foundations: nodes.filter((n) => n.kind === "foundation").length,
    entries: nodes.filter((n) => n.kind === "entry").length,
    isolated: nodes.filter((n) => n.kind === "isolated").length,
    levels: model.maxLevel + 1,
    anchorGroups: model.anchorGroups.length,
    lines: nodes.reduce((sum, n) => sum + n.lines, 0),
    heaviest,
  };
}

/**
 * What the identity card says about a file, from Katedrala's analysis: its place in the structure, its size, the
 * files resting on it (its reach) and the files it rests on (its load path).
 */
export function describeFile(model: Model, id: number): string[] {
  const node = model.nodes[id]!;
  const rests = loadPath(model, id).size - 1;
  const carries = restingOn(model, id).size - 1;
  const count = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "file" : "files"}`;
  const role =
    node.kind === "foundation"
      ? "foundation"
      : node.kind === "entry"
        ? `entry point, level ${node.level}`
        : node.kind === "isolated"
          ? "stands alone"
          : `level ${node.level}`;
  return [
    role,
    `${node.lines.toLocaleString("en-US")} ${node.lines === 1 ? "line" : "lines"}`,
    carries > 0
      ? `${count(carries)} ${carries === 1 ? "rests" : "rest"} on it`
      : "nothing rests on it",
    rests > 0 ? `rests on ${count(rests)}` : "on the ground",
  ];
}

/** "src/graph/model/types.ts" -> "types.ts" */
export function baseName(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? path : path.slice(i + 1);
}

/** "src/graph/model/types.ts" -> "src/graph/model/" */
export function dirName(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i + 1);
}
