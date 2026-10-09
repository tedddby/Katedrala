/**
 * The hanging model of CodeVerse, built from Katedrala's real analysis (public/data/codeverse-graph.json).
 *
 * Pure and deterministic: the server uses it for the plan poster and the text alternative, the browser for the
 * stage, and both get the same numbers. What comes from the data and what this file draws:
 *
 * - From the data: the 404 source files, their lines, levels (longest runtime path down to a foundation), reach,
 *   the 1,369 runtime dependencies between source files, the foundations and the entry points.
 * - Drawn here: the plan (where each foundation sits on the board) and the horizontal position of every hanging
 *   file. A file hangs one level below the deepest file it depends on, under the files it hangs from (the
 *   shorter the chain, the harder it pulls), spread so that files on one level do not collide.
 * - Load (line weight): every file's lines, plus the load hanging from it, shared equally among the files it
 *   depends on, down to the foundations. A drawing convention, not a Katedrala metric.
 */

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

export interface HangingModel {
  /** Source files drawn (tests are left out: nothing rests on them). */
  readonly n: number;
  readonly paths: readonly string[];
  readonly lines: Float32Array;
  readonly level: Int32Array;
  readonly reach: Int32Array;
  readonly fanIn: Int32Array;
  readonly fanOut: Int32Array;
  readonly foundation: Uint8Array;
  readonly entry: Uint8Array;
  /** Rest position of every file in model space: the board is y = 0, files hang below it. */
  readonly rest: Float32Array;
  /** Joint radius in model units, from the file's lines (its weight): the size it is drawn at. */
  readonly radius: Float32Array;
  /** Lines carried: the file's own and everything hanging from it. */
  readonly carried: Float32Array;
  /** The file each one is released from when it drops (its main support), -1 on the board. */
  readonly primary: Int32Array;
  readonly m: number;
  /** Dependent end of each chain: the file that hangs. */
  readonly edgeA: Int32Array;
  /** Dependency end: the file it hangs from. */
  readonly edgeB: Int32Array;
  readonly edgeLoad: Float32Array;
  /** Sag at mid-span in model units, along gravity. */
  readonly edgeSag: Float32Array;
  readonly edgeLength: Float32Array;
  readonly out: readonly (readonly number[])[];
  readonly inn: readonly (readonly number[])[];
  readonly maxLevel: number;
  readonly levelCount: readonly number[];
  readonly levelHeight: number;
  readonly planRadius: number;
  readonly maxEdgeLoad: number;
  readonly maxCarried: number;
  /** The highest file. */
  readonly crown: number;
  /** One longest load path, from its foundation (index 0) up to the crown. */
  readonly spine: readonly number[];
  /** Foundations by the number of files resting on them, heaviest first. */
  readonly heaviest: readonly number[];
}

/** Where the browser fetches the analysis from (public/data, served as is). */
export const DATA_URL = "/data/codeverse-graph.json";

export const LEVEL_HEIGHT = 1.1;
/** The plan is an ellipse: its long axis (x) is the nave the camera walks up, its short axis (z) the span. */
export const PLAN_RADIUS = 11;
export const PLAN_MINOR = 7.4;
/** Half the width of the band of foundations around the plan, as a fraction of the radius. */
const BAND = 0.07;
/** Where the first district starts on the ellipse (radians from +x). */
export const PLAN_TURN = -2.2;

/** The board's thickness (model units): the slab the model hangs from, the ground once it stands. */
export const SLAB = 0.62;

/**
 * Ink of a chain (0..1) from the square root of its load (0..1): line weight and density follow the load the
 * chain carries (its square root, as a cable's diameter does), stretched so that the few heavily loaded chains
 * read as the structure and the many light ones as a fine web. A drawing convention, not a Katedrala metric.
 */
export function inkOf(rootLoad: number): number {
  const t = Math.min(1, Math.max(0, (rootLoad - 0.045) / (0.5 - 0.045)));
  return t * t * (3 - 2 * t);
}

/** Layout constants (exported so the preview tooling can try alternatives; the page uses the defaults). */
export const TUNE = { pull: 0.35, spread: 2.6, pad: 0.12 };

/** FNV-1a of a path, to [0, 1): deterministic jitter that does not depend on file order. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** Directory group of a path: the first directory under src/, or the top directory outside it. */
function groupOf(path: string): string {
  const parts = path.split("/");
  if (parts[0] === "src" && parts.length > 2) return parts[1]!;
  return parts.length > 1 ? parts[0]! : "(root)";
}

/**
 * Orders the districts around the plan so that directories with many dependencies between them sit side by side
 * (a short tour over the similarity), deterministic: greedy from the heaviest district, then 2-opt.
 */
function districtOrder(
  names: readonly string[],
  weight: (g: string) => number,
  sim: (a: string, b: string) => number,
) {
  const start = [...names].sort((p, q) => weight(q) - weight(p) || p.localeCompare(q))[0]!;
  const tour = [start];
  const left = new Set(names.filter((g) => g !== start));
  while (left.size > 0) {
    const last = tour[tour.length - 1]!;
    const next = [...left].sort(
      (p, q) => sim(last, q) - sim(last, p) || weight(q) - weight(p) || p.localeCompare(q),
    )[0]!;
    tour.push(next);
    left.delete(next);
  }
  const k = tour.length;
  const gain = (i: number, j: number) => {
    const a = tour[i]!;
    const b = tour[(i + 1) % k]!;
    const c = tour[j]!;
    const d = tour[(j + 1) % k]!;
    return sim(a, c) + sim(b, d) - sim(a, b) - sim(c, d);
  };
  for (let improved = true, guard = 0; improved && guard < 50; guard++) {
    improved = false;
    for (let i = 0; i < k - 1; i++) {
      for (let j = i + 2; j < k; j++) {
        if (i === 0 && j === k - 1) continue;
        if (gain(i, j) > 0) {
          tour.splice(i + 1, j - i, ...tour.slice(i + 1, j + 1).reverse());
          improved = true;
        }
      }
    }
  }
  return tour;
}

/**
 * Builds the model. `fixedRest` (x, y, z per source file, as a previous build produced) skips the layout
 * iterations: the server computes the layout once and the browser reuses it.
 */
export function buildModel(data: GraphData, fixedRest?: ArrayLike<number>): HangingModel {
  const sourceIndex: number[] = [];
  data.files.forEach((f, i) => {
    if (f[2] === 0) sourceIndex.push(i);
  });
  const nodeOf = new Map<number, number>(sourceIndex.map((f, v) => [f, v]));
  const n = sourceIndex.length;
  const row = (v: number): FileRow => data.files[sourceIndex[v]!]!;

  const paths = sourceIndex.map((_, v) => row(v)[0]);
  const lines = new Float32Array(n);
  const level = new Int32Array(n);
  const reach = new Int32Array(n);
  const fanIn = new Int32Array(n);
  const fanOut = new Int32Array(n);
  for (let v = 0; v < n; v++) {
    const r = row(v);
    lines[v] = r[3];
    level[v] = r[5];
    reach[v] = r[6];
    fanIn[v] = r[7];
    fanOut[v] = r[8];
  }
  const foundation = new Uint8Array(n);
  for (const f of data.foundations) {
    const v = nodeOf.get(f);
    if (v !== undefined) foundation[v] = 1;
  }
  const entry = new Uint8Array(n);
  for (const f of data.entries) {
    const v = nodeOf.get(f);
    if (v !== undefined) entry[v] = 1;
  }

  // Runtime dependencies between source files: the chains.
  const chains: [number, number][] = [];
  for (const e of data.edges) {
    if (e[3] !== 1) continue;
    const a = nodeOf.get(e[0]);
    const b = nodeOf.get(e[1]);
    if (a === undefined || b === undefined) continue;
    chains.push([a, b]);
  }
  const m = chains.length;
  const edgeA = new Int32Array(m);
  const edgeB = new Int32Array(m);
  const out: number[][] = Array.from({ length: n }, () => []);
  const inn: number[][] = Array.from({ length: n }, () => []);
  chains.forEach(([a, b], k) => {
    edgeA[k] = a;
    edgeB[k] = b;
    out[a]!.push(k);
    inn[b]!.push(k);
  });

  let maxLevel = 0;
  for (let v = 0; v < n; v++) maxLevel = Math.max(maxLevel, level[v]!);
  const levelCount = new Array<number>(maxLevel + 1).fill(0);
  for (let v = 0; v < n; v++) levelCount[level[v]!] = levelCount[level[v]!]! + 1;

  // Load: from the top of the hanging model down, each file passes what it carries to the files it hangs from.
  // Files of one dependency cycle share a level; a member without a lower support passes its load to the others.
  const byLevelDesc = [...Array(n).keys()].sort(
    (p, q) => level[q]! - level[p]! || paths[p]!.localeCompare(paths[q]!),
  );
  const carried = Float32Array.from(lines);
  const edgeLoad = new Float32Array(m);
  const downOf = (v: number) => out[v]!.filter((k) => level[edgeB[k]!]! < level[v]!);
  const tiesOf = (v: number) => out[v]!.filter((k) => level[edgeB[k]!]! === level[v]!);
  for (let i = 0; i < n;) {
    const L = level[byLevelDesc[i]!]!;
    let j = i;
    while (j < n && level[byLevelDesc[j]!]! === L) j++;
    const same = byLevelDesc.slice(i, j);
    const ordered = [
      ...same.filter((v) => downOf(v).length === 0),
      ...same.filter((v) => downOf(v).length > 0),
    ];
    for (const v of ordered) {
      const down = downOf(v);
      const via = down.length > 0 ? down : tiesOf(v);
      for (const k of via) {
        const b = edgeB[k]!;
        edgeLoad[k] = carried[v]! / via.length;
        carried[b] = carried[b]! + edgeLoad[k]!;
      }
    }
    i = j;
  }

  // Drawn radius (area follows the lines), and the larger room each file keeps around it in the layout.
  const radius = new Float32Array(n);
  const room = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    radius[v] = 0.032 + 0.0088 * Math.sqrt(lines[v]!);
    room[v] = 0.05 + 0.0125 * Math.sqrt(lines[v]!);
  }

  // Plan: the foundations around an elliptical band, one district per directory, districts that depend on each
  // other side by side; inside a district the file most rest on sits at its centre, the rest alternate outwards.
  const x = new Float64Array(n);
  const z = new Float64Array(n);
  const group = paths.map(groupOf);
  const districts = new Map<string, number[]>();
  for (let v = 0; v < n; v++) {
    if (foundation[v] !== 1) continue;
    const list = districts.get(group[v]!) ?? [];
    list.push(v);
    districts.set(group[v]!, list);
  }
  const between = new Map<string, number>();
  for (let k = 0; k < m; k++) {
    const a = group[edgeA[k]!]!;
    const b = group[edgeB[k]!]!;
    if (a === b) continue;
    const key = a < b ? `${a}\n${b}` : `${b}\n${a}`;
    between.set(key, (between.get(key) ?? 0) + 1);
  }
  const sim = (a: string, b: string) => between.get(a < b ? `${a}\n${b}` : `${b}\n${a}`) ?? 0;
  const reachOf = (g: string) => (districts.get(g) ?? []).reduce((s, v) => s + reach[v]!, 0);
  const order = districtOrder([...districts.keys()], reachOf, sim);
  // Arc per district: its foundations plus room for its heaviest pier, so singletons are not crushed together.
  const share = (g: string) => districts.get(g)!.length + 0.15 * Math.sqrt(reachOf(g));
  const total = order.reduce((s, g) => s + share(g), 0);
  let angle = PLAN_TURN;
  const districtAngle = new Map<string, number>();
  for (const g of order) {
    const span = (share(g) / total) * Math.PI * 2;
    const members = districts
      .get(g)!
      .sort((p, q) => reach[q]! - reach[p]! || paths[p]!.localeCompare(paths[q]!));
    // Centre-out: 0, +1, -1, +2, -2 ... slots across the district's arc.
    const slots = members.length;
    members.forEach((v, i) => {
      const side = i === 0 ? 0 : i % 2 === 1 ? (i + 1) / 2 : -i / 2;
      const t = angle + span / 2 + (side / Math.max(1, slots)) * span * 0.92;
      // Two rows: the heavier half of the district on the inner edge of the band.
      const inner = i < Math.ceil(slots / 2);
      const r =
        1 + (inner ? -BAND : BAND) * (slots > 1 ? 1 : 0) + (hash01(paths[v]!) - 0.5) * BAND * 0.5;
      x[v] = Math.cos(t) * PLAN_RADIUS * r;
      z[v] = Math.sin(t) * PLAN_MINOR * r;
    });
    districtAngle.set(g, angle + span / 2);
    angle += span;
  }
  // A file on the board that nothing rests on (isolated): outside the band, by its own district if it has one.
  for (let v = 0; v < n; v++) {
    if (level[v] !== 0 || foundation[v] === 1) continue;
    const t = (districtAngle.get(group[v]!) ?? PLAN_TURN) + 0.08;
    x[v] = Math.cos(t) * PLAN_RADIUS * 1.16;
    z[v] = Math.sin(t) * PLAN_MINOR * 1.16;
  }

  // Hanging files: under their supports, the shorter chains pulling harder, then spread within the level.
  const primary = new Int32Array(n).fill(-1);
  for (let L = 1; L <= maxLevel; L++) {
    const nodes = [...Array(n).keys()].filter((v) => level[v] === L);
    const tx = new Map<number, number>();
    const tz = new Map<number, number>();
    for (const v of nodes) {
      let sx = 0;
      let sz = 0;
      let sw = 0;
      let best = -1;
      for (const k of downOf(v)) {
        const b = edgeB[k]!;
        const w = 1 / (L - level[b]!);
        sx += x[b]! * w;
        sz += z[b]! * w;
        sw += w;
        if (level[b] === L - 1 && (best === -1 || carried[b]! > carried[best]!)) best = b;
      }
      if (best === -1) best = edgeB[downOf(v)[0]!]!;
      primary[v] = best;
      // Under its supports (the shorter chains pulling harder), drawn towards the file it is released from.
      const cx = (sx / sw) * (1 - TUNE.pull) + x[best]! * TUNE.pull;
      const cz = (sz / sw) * (1 - TUNE.pull) + z[best]! * TUNE.pull;
      tx.set(v, cx);
      tz.set(v, cz);
      const j = hash01(paths[v]!) * Math.PI * 2;
      x[v] = cx + Math.cos(j) * 0.3;
      z[v] = cz + Math.sin(j) * 0.3;
    }
    if (fixedRest !== undefined) {
      for (const v of nodes) {
        x[v] = fixedRest[v * 3]!;
        z[v] = fixedRest[v * 3 + 2]!;
      }
      continue;
    }
    for (let it = 0; it < 110; it++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let k = i + 1; k < nodes.length; k++) {
          const p = nodes[i]!;
          const q = nodes[k]!;
          let dx = x[q]! - x[p]!;
          let dz = z[q]! - z[p]!;
          let d = Math.hypot(dx, dz);
          const min = (room[p]! + room[q]!) * TUNE.spread + TUNE.pad;
          if (d >= min) continue;
          if (d < 1e-6) {
            dx = 1;
            dz = 0;
            d = 1;
          }
          const push = (min - d) * 0.5;
          x[p] = x[p]! - (dx / d) * push;
          z[p] = z[p]! - (dz / d) * push;
          x[q] = x[q]! + (dx / d) * push;
          z[q] = z[q]! + (dz / d) * push;
        }
      }
      for (const v of nodes) {
        x[v] = x[v]! + (tx.get(v)! - x[v]!) * 0.08;
        z[v] = z[v]! + (tz.get(v)! - z[v]!) * 0.08;
      }
    }
  }

  const rest = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    rest[v * 3] = x[v]!;
    rest[v * 3 + 1] = -level[v]! * LEVEL_HEIGHT;
    rest[v * 3 + 2] = z[v]!;
  }

  // Sag: a chain under its own weight sags with the square of its horizontal span, less the more it carries.
  const edgeSag = new Float32Array(m);
  const edgeLength = new Float32Array(m);
  let maxEdgeLoad = 0;
  for (let k = 0; k < m; k++) {
    const a = edgeA[k]!;
    const b = edgeB[k]!;
    const span = Math.hypot(x[a]! - x[b]!, z[a]! - z[b]!);
    const len = Math.hypot(span, (level[a]! - level[b]!) * LEVEL_HEIGHT);
    edgeLength[k] = len;
    edgeSag[k] = Math.min((0.5 * span * span) / (Math.sqrt(edgeLoad[k]!) + 6), len * 0.14);
    maxEdgeLoad = Math.max(maxEdgeLoad, edgeLoad[k]!);
  }
  let maxCarried = 0;
  for (let v = 0; v < n; v++) maxCarried = Math.max(maxCarried, carried[v]!);

  // The crown and one longest load path down from it (always through the highest file it rests on).
  let crown = 0;
  for (let v = 1; v < n; v++) {
    if (level[v]! > level[crown]! || (level[v] === level[crown] && paths[v]! < paths[crown]!))
      crown = v;
  }
  const spine = [crown];
  for (let v = crown; level[v]! > 0;) {
    let next = -1;
    for (const k of downOf(v)) {
      const b = edgeB[k]!;
      if (
        next === -1 ||
        level[b]! > level[next]! ||
        (level[b] === level[next] && paths[b]! < paths[next]!)
      )
        next = b;
    }
    spine.push(next);
    v = next;
  }
  spine.reverse();

  const heaviest = [...Array(n).keys()]
    .filter((v) => foundation[v] === 1)
    .sort((p, q) => reach[q]! - reach[p]! || paths[p]!.localeCompare(paths[q]!));

  return {
    n,
    paths,
    lines,
    level,
    reach,
    fanIn,
    fanOut,
    foundation,
    entry,
    rest,
    radius,
    carried,
    primary,
    m,
    edgeA,
    edgeB,
    edgeLoad,
    edgeSag,
    edgeLength,
    out,
    inn,
    maxLevel,
    levelCount,
    levelHeight: LEVEL_HEIGHT,
    planRadius: PLAN_RADIUS,
    maxEdgeLoad,
    maxCarried,
    crown,
    spine,
    heaviest,
  };
}

/** What a file rests on, down to the foundations (its load path to the ground), and what rests on it. */
export interface LoadPath {
  readonly file: number;
  readonly supports: Uint8Array;
  readonly carriedBy: Uint8Array;
  /** Chains its load runs down, from the file to the foundations. */
  readonly below: Uint8Array;
  /** Chains that bring load down onto it. */
  readonly above: Uint8Array;
  readonly supportCount: number;
  readonly carriedCount: number;
  readonly foundationCount: number;
}

export function loadPathOf(model: HangingModel, file: number): LoadPath {
  const { n, m, edgeA, edgeB, out, inn, foundation } = model;
  const supports = new Uint8Array(n);
  const carriedBy = new Uint8Array(n);
  const walk = (
    start: number,
    mark: Uint8Array,
    next: (k: number) => number,
    adjacency: readonly (readonly number[])[],
  ) => {
    const queue = [start];
    while (queue.length > 0) {
      const u = queue.pop()!;
      for (const k of adjacency[u]!) {
        const w = next(k);
        if (w === start || mark[w] === 1) continue;
        mark[w] = 1;
        queue.push(w);
      }
    }
  };
  walk(file, supports, (k) => edgeB[k]!, out);
  walk(file, carriedBy, (k) => edgeA[k]!, inn);
  const below = new Uint8Array(m);
  const above = new Uint8Array(m);
  for (let k = 0; k < m; k++) {
    const a = edgeA[k]!;
    const b = edgeB[k]!;
    if ((a === file || supports[a] === 1) && supports[b] === 1) below[k] = 1;
    if (carriedBy[a] === 1 && (b === file || carriedBy[b] === 1)) above[k] = 1;
  }
  let supportCount = 0;
  let carriedCount = 0;
  let foundationCount = 0;
  for (let v = 0; v < n; v++) {
    supportCount += supports[v]!;
    carriedCount += carriedBy[v]!;
    if (supports[v] === 1 && foundation[v] === 1) foundationCount++;
  }
  return { file, supports, carriedBy, below, above, supportCount, carriedCount, foundationCount };
}

/** Everything the page states in words about the structure, computed once from the model. */
export interface StructureSummary {
  readonly repository: string;
  readonly commit: string;
  readonly generator: string;
  readonly schemaVersion: string;
  readonly sourceFiles: number;
  readonly testFiles: number;
  readonly dependencies: number;
  readonly foundations: number;
  readonly entries: number;
  readonly isolated: number;
  readonly levels: number;
  readonly maxLevel: number;
  readonly levelCount: readonly number[];
  readonly heaviest: readonly { readonly path: string; readonly reach: number }[];
  readonly crown: {
    readonly path: string;
    readonly level: number;
    readonly lines: number;
    /** Files it depends on directly (runtime, source). */
    readonly direct: number;
    readonly supports: number;
    readonly foundations: number;
  };
  readonly spine: readonly string[];
}

export function summarize(model: HangingModel, data: GraphData): StructureSummary {
  const crownPath = loadPathOf(model, model.crown);
  return {
    repository: data.source.repository,
    commit: data.source.commit ?? "unknown",
    generator: data.source.generator,
    schemaVersion: data.source.schemaVersion,
    sourceFiles: data.counts.sourceFiles,
    testFiles: data.counts.testFiles,
    dependencies: model.m,
    foundations: data.counts.foundations,
    entries: data.counts.entries,
    isolated: data.counts.isolated,
    levels: model.maxLevel + 1,
    maxLevel: model.maxLevel,
    levelCount: model.levelCount,
    heaviest: model.heaviest
      .slice(0, 5)
      .map((v) => ({ path: model.paths[v]!, reach: model.reach[v]! })),
    crown: {
      path: model.paths[model.crown]!,
      level: model.level[model.crown]!,
      lines: model.lines[model.crown]!,
      direct: model.out[model.crown]!.length,
      supports: crownPath.supportCount,
      foundations: crownPath.foundationCount,
    },
    spine: model.spine.map((v) => model.paths[v]!),
  };
}

/** The rest positions, rounded, for the browser to reuse (see buildModel). */
export function restOf(model: HangingModel): number[] {
  return Array.from(model.rest, (c) => Math.round(c * 1000) / 1000);
}

/** "1,369" */
export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/** "1 file", "137 files" */
export function countOf(n: number, one: string, many = `${one}s`): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}
