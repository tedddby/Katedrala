/**
 * The hanging model of CodeVerse, computed from Katedrala's real structure analysis
 * (public/data/codeverse-graph.json, written by scripts/build-codeverse-graph.mjs).
 *
 * Pure functions, shared by the server (the text alternative, the captions) and the browser (the drawing).
 * Nothing here is hand-tuned per file: every number is read from the analysis or derived from it by a rule
 * stated next to the code that applies it.
 */

/** [path, group, role (0 source, 1 test), lines, symbols, level, reach, fanIn, fanOut] */
export type FileRow = readonly [
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
/** [dependent, dependency, observations, runtime (1) or type-only (0)] */
export type EdgeRow = readonly [number, number, number, number];

export interface GraphDocument {
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

export const KIND_FOUNDATION = 0;
export const KIND_MIDDLE = 1;
export const KIND_ENTRY = 2;
export const KIND_ISOLATED = 3;

/**
 * The source files of the analysis and the runtime dependencies between them: the members of the model.
 * Test files and type-only dependencies are left out (they carry nothing at runtime).
 */
export interface Structure {
  readonly repository: string;
  readonly commit: string;
  readonly generator: string;
  readonly counts: GraphDocument["counts"];
  /** Source files. */
  readonly n: number;
  readonly path: readonly string[];
  /** Directory group (the first directory under src/). */
  readonly group: readonly string[];
  /** Room on the plan: the directory two levels under src/ (or the group itself for its own files). */
  readonly room: readonly string[];
  readonly lines: Int32Array;
  readonly symbols: Int32Array;
  readonly level: Int32Array;
  readonly reach: Int32Array;
  readonly fanIn: Int32Array;
  readonly fanOut: Int32Array;
  readonly kind: Uint8Array;
  /** Runtime dependencies between source files: the chains. */
  readonly chainCount: number;
  readonly dependent: Int32Array;
  readonly dependency: Int32Array;
  readonly observations: Int32Array;
  /** 1 when both ends belong to one dependency cycle (they share a level and lean on each other). */
  readonly inCycle: Uint8Array;
  /** Lines of code the chain carries (see `carry`). */
  readonly chainLoad: Float64Array;
  /** Lines of code resting on the file through the chains, plus its own. */
  readonly nodeLoad: Float64Array;
  /** Chains by node: where it is the dependent (it hangs from them) and where it is the dependency. */
  readonly out: readonly (readonly number[])[];
  readonly inc: readonly (readonly number[])[];
  readonly foundations: readonly number[];
  readonly entries: readonly number[];
  readonly isolated: readonly number[];
  readonly maxLevel: number;
  /** Source files per level, from 0 (foundations) up. */
  readonly levelCounts: readonly number[];
  readonly totalLines: number;
  readonly maxChainLoad: number;
  /** Cycle-condensed groups of files, highest level first, and the chains leaving each (for `carry`). */
  readonly members: readonly (readonly number[])[];
  readonly leaving: readonly (readonly number[])[];
}

/** The room a file belongs to on the plan: src/<group>/<directory>, or src/<group> for files at its top. */
export function roomOf(path: string): string {
  const parts = path.split("/");
  if (parts.length >= 4) return parts.slice(0, 3).join("/");
  if (parts.length === 3) return parts.slice(0, 2).join("/");
  return parts.length === 2 ? (parts[0] ?? path) : "(root)";
}

export function analyze(doc: GraphDocument): Structure {
  const sourceRows: number[] = [];
  doc.files.forEach((row, i) => {
    if (row[2] === 0) sourceRows.push(i);
  });
  const n = sourceRows.length;
  const nodeOf = new Map<number, number>();
  sourceRows.forEach((row, i) => nodeOf.set(row, i));

  const path: string[] = [];
  const group: string[] = [];
  const room: string[] = [];
  const lines = new Int32Array(n);
  const symbols = new Int32Array(n);
  const level = new Int32Array(n);
  const reach = new Int32Array(n);
  const fanIn = new Int32Array(n);
  const fanOut = new Int32Array(n);
  sourceRows.forEach((rowIndex, i) => {
    const row = doc.files[rowIndex]!;
    path.push(row[0]);
    group.push(doc.groups[row[1]] ?? "(root)");
    room.push(roomOf(row[0]));
    lines[i] = row[3];
    symbols[i] = row[4];
    level[i] = Math.max(0, row[5]);
    reach[i] = row[6];
    fanIn[i] = row[7];
    fanOut[i] = row[8];
  });

  const chainRows = doc.edges.filter((e) => e[3] === 1 && nodeOf.has(e[0]) && nodeOf.has(e[1]));
  const chainCount = chainRows.length;
  const dependent = new Int32Array(chainCount);
  const dependency = new Int32Array(chainCount);
  const observations = new Int32Array(chainCount);
  const out: number[][] = Array.from({ length: n }, () => []);
  const inc: number[][] = Array.from({ length: n }, () => []);
  chainRows.forEach((e, c) => {
    const a = nodeOf.get(e[0])!;
    const b = nodeOf.get(e[1])!;
    dependent[c] = a;
    dependency[c] = b;
    observations[c] = e[2];
    out[a]!.push(c);
    inc[b]!.push(c);
  });

  const foundations = doc.foundations.map((i) => nodeOf.get(i)).filter((i) => i !== undefined);
  const entries = doc.entries.map((i) => nodeOf.get(i)).filter((i) => i !== undefined);
  const kind = new Uint8Array(n).fill(KIND_MIDDLE);
  for (const f of foundations) kind[f] = KIND_FOUNDATION;
  for (const e of entries) kind[e] = KIND_ENTRY;
  const isolated: number[] = [];
  for (let v = 0; v < n; v++) {
    if (out[v]!.length === 0 && inc[v]!.length === 0) {
      kind[v] = KIND_ISOLATED;
      isolated.push(v);
    }
  }

  // Cycles: a dependency between two files of one level only exists inside a cycle (the analysis defines a
  // level as the longest path over the condensation), so the cycles are the components of those chains.
  const inCycle = new Uint8Array(chainCount);
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (v: number): number => {
    let r = v;
    while (parent[r] !== r) r = parent[r]!;
    while (parent[v] !== r) {
      const next = parent[v]!;
      parent[v] = r;
      v = next;
    }
    return r;
  };
  for (let c = 0; c < chainCount; c++) {
    const a = dependent[c]!;
    const b = dependency[c]!;
    if (level[a] === level[b]) {
      inCycle[c] = 1;
      parent[find(a)] = find(b);
    }
  }

  // Load: every file passes its own lines, plus everything resting on it, to the files it depends on, in
  // equal shares. A cycle passes its combined load out through the chains that leave it. Processing from the
  // highest level down, every share has arrived before a file passes its total on.
  const memberMap = new Map<number, number[]>();
  for (let v = 0; v < n; v++) {
    const r = find(v);
    const list = memberMap.get(r);
    if (list) list.push(v);
    else memberMap.set(r, [v]);
  }
  const roots = [...memberMap.keys()].sort((x, y) => level[y]! - level[x]! || x - y);
  const members = roots.map((r) => memberMap.get(r)!);
  const leaving = members.map((list) => {
    const chains: number[] = [];
    for (const v of list) for (const c of out[v]!) if (inCycle[c] === 0) chains.push(c);
    return chains;
  });
  const chainLoad = new Float64Array(chainCount);
  const nodeLoad = new Float64Array(n);
  carry({ n, dependency, members, leaving }, lines, chainLoad, nodeLoad);
  let maxChainLoad = 0;
  for (let c = 0; c < chainCount; c++) maxChainLoad = Math.max(maxChainLoad, chainLoad[c]!);

  let maxLevel = 0;
  for (let v = 0; v < n; v++) maxLevel = Math.max(maxLevel, level[v]!);
  const levelCounts = new Array<number>(maxLevel + 1).fill(0);
  for (let v = 0; v < n; v++) levelCounts[level[v]!]! += 1;
  let totalLines = 0;
  for (let v = 0; v < n; v++) totalLines += lines[v]!;

  return {
    repository: doc.source.repository,
    commit: doc.source.commit ?? "unknown",
    generator: doc.source.generator,
    counts: doc.counts,
    n,
    path,
    group,
    room,
    lines,
    symbols,
    level,
    reach,
    fanIn,
    fanOut,
    kind,
    chainCount,
    dependent,
    dependency,
    observations,
    inCycle,
    chainLoad,
    nodeLoad,
    out,
    inc,
    foundations,
    entries,
    isolated,
    maxLevel,
    levelCounts,
    totalLines,
    maxChainLoad,
    members,
    leaving,
  };
}

/**
 * The load flow: each file (or cycle) passes its weight, plus everything it received, to the files it depends
 * on in equal shares. `weight` is lines of code for the whole model, or zero for files not hung yet.
 */
export function carry(
  s: Pick<Structure, "n" | "dependency" | "members" | "leaving">,
  weight: ArrayLike<number>,
  chainLoad: Float64Array,
  nodeLoad: Float64Array,
): void {
  const received = new Float64Array(s.n);
  chainLoad.fill(0);
  s.members.forEach((list, k) => {
    let total = 0;
    for (const v of list) total += weight[v]! + received[v]!;
    for (const v of list) nodeLoad[v] = total;
    const chains = s.leaving[k]!;
    if (chains.length === 0) return;
    const share = total / chains.length;
    for (const c of chains) {
      chainLoad[c] = share;
      received[s.dependency[c]!] = received[s.dependency[c]!]! + share;
    }
  });
}

/** Files resting on `v` (directly or not) and the files it rests on, down to the foundations. */
export function loadPath(s: Structure, v: number): { above: Set<number>; below: Set<number> } {
  const above = new Set<number>();
  const below = new Set<number>();
  const queue = [v];
  while (queue.length > 0) {
    const u = queue.pop()!;
    for (const c of s.inc[u]!) {
      const w = s.dependent[c]!;
      if (w !== v && !above.has(w)) {
        above.add(w);
        queue.push(w);
      }
    }
  }
  queue.push(v);
  while (queue.length > 0) {
    const u = queue.pop()!;
    for (const c of s.out[u]!) {
      const w = s.dependency[c]!;
      if (w !== v && !below.has(w)) {
        below.add(w);
        queue.push(w);
      }
    }
  }
  return { above, below };
}

// ---------------------------------------------------------------------------------------------------------
// The plan on the board.
// ---------------------------------------------------------------------------------------------------------

export interface PlanSpec {
  /** Board width and depth, in level units (one level is one unit of height). */
  readonly width: number;
  readonly depth: number;
  /** Smallest horizontal gap between two files of one level, in level units. */
  readonly separation: number;
}

export interface PlanRect {
  readonly name: string;
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  readonly lines: number;
}

export interface Layout {
  readonly spec: PlanSpec;
  /** One strip per directory group, as wide as its share of the code. */
  readonly strips: readonly PlanRect[];
  /** Rooms (directories) inside the strips, as deep as their share of the strip's code. */
  readonly rooms: readonly PlanRect[];
  /** The hanging form: x, y (= -level), z of every file, in level units. */
  readonly target: Float64Array;
  /** Chain lengths (taut, in the hanging form). Chains inside a cycle are cut with slack. */
  readonly rest: Float64Array;
  /** Horizontal component of each chain's tension, in lines of code (sets how far a chain sags). */
  readonly tensionH: Float64Array;
}

/** A deterministic hash in [0, 1) for small per-file offsets. */
export function jitter(i: number, salt = 0): number {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Lays the plan on the board and finds the hanging form.
 *
 * The plan: each directory group is a strip of the board as wide as its lines of code; each strip is divided
 * into rooms (its directories), as deep as their lines of code. Foundations are pinned inside their own room.
 * The order of strips, and of foundations within a strip, is chosen to keep chains short: a few rounds of
 * barycentric ordering, as in layered graph drawing, keeping the round with the least load-weighted span.
 *
 * The form: force density method (Schek, 1974). Every file hangs at its level; each chain carries, vertically,
 * the load share computed in `analyze`, so its force density is that share over the levels it spans. With the
 * heights fixed, horizontal equilibrium is linear: every file sits at the force-density-weighted mean of the
 * files it is chained to, above and below. That is the shape the weights take under gravity.
 */
export function layout(s: Structure, spec: PlanSpec): Layout {
  const { width: W, depth: D } = spec;
  const groups = [...new Set(s.group)];
  const groupLines = new Map<string, number>();
  const roomLines = new Map<string, number>();
  for (let v = 0; v < s.n; v++) {
    groupLines.set(s.group[v]!, (groupLines.get(s.group[v]!) ?? 0) + s.lines[v]!);
    roomLines.set(s.room[v]!, (roomLines.get(s.room[v]!) ?? 0) + s.lines[v]!);
  }
  const roomsOfGroup = new Map<string, string[]>();
  for (let v = 0; v < s.n; v++) {
    const list = roomsOfGroup.get(s.group[v]!) ?? [];
    if (!list.includes(s.room[v]!)) list.push(s.room[v]!);
    roomsOfGroup.set(s.group[v]!, list);
  }
  for (const list of roomsOfGroup.values()) list.sort();

  const foundationsOf = new Map<string, number[]>();
  for (const f of s.foundations) {
    const list = foundationsOf.get(s.group[f]!) ?? [];
    list.push(f);
    foundationsOf.set(s.group[f]!, list);
  }
  for (const list of foundationsOf.values())
    list.sort((a, b) => s.nodeLoad[b]! - s.nodeLoad[a]! || a - b);

  const byLevel: number[][] = Array.from({ length: s.maxLevel + 1 }, () => []);
  for (let v = 0; v < s.n; v++) byLevel[s.level[v]!]!.push(v);

  // Force density of every chain: vertical load share over the levels it spans. Chains inside a cycle carry
  // nothing down (their ends share a level) and pull nothing sideways.
  const q = new Float64Array(s.chainCount);
  for (let c = 0; c < s.chainCount; c++) {
    const span = s.level[s.dependent[c]!]! - s.level[s.dependency[c]!]!;
    q[c] = span > 0 ? s.chainLoad[c]! / span : 0;
  }

  let stripOrder = [...groups].sort((a, b) => (groupLines.get(b) ?? 0) - (groupLines.get(a) ?? 0));
  const total = s.totalLines;
  const target = new Float64Array(s.n * 3);
  for (let v = 0; v < s.n; v++) target[v * 3 + 1] = -s.level[v]!;
  let best: { order: string[]; fOrder: Map<string, number[]>; span: number } | null = null;

  const place = (order: readonly string[], fOrder: Map<string, number[]>, iterations: number) => {
    const strips: PlanRect[] = [];
    const rooms: PlanRect[] = [];
    const roomRect = new Map<string, PlanRect>();
    let x = 0;
    for (const g of order) {
      const gl = groupLines.get(g) ?? 0;
      const w = (gl / total) * W;
      const strip = { name: g, x0: x, x1: x + w, z0: -D / 2, z1: D / 2, lines: gl };
      strips.push(strip);
      let z = -D / 2;
      for (const r of roomsOfGroup.get(g) ?? []) {
        const rl = roomLines.get(r) ?? 0;
        const d = (rl / gl) * D;
        const rect = { name: r, x0: strip.x0, x1: strip.x1, z0: z, z1: z + d, lines: rl };
        rooms.push(rect);
        roomRect.set(r, rect);
        z += d;
      }
      // Foundations take evenly spaced positions across their strip (so no two share a line of sight in
      // elevation) and sit inside their own room.
      const list = fOrder.get(g) ?? [];
      const inset = Math.min(0.12 * w, 0.35);
      list.forEach((f, k) => {
        const fx =
          list.length === 1
            ? (strip.x0 + strip.x1) / 2
            : strip.x0 + inset + ((w - 2 * inset) * k) / (list.length - 1);
        const rect = roomRect.get(s.room[f]!)!;
        const depth = rect.z1 - rect.z0;
        target[f * 3] = fx;
        target[f * 3 + 2] = (rect.z0 + rect.z1) / 2 + (jitter(f, 3) - 0.5) * 0.6 * depth;
      });
      x += w;
    }
    for (const v of s.isolated) {
      const rect = roomRect.get(s.room[v]!)!;
      target[v * 3] = (rect.x0 + rect.x1) / 2;
      target[v * 3 + 2] = (rect.z0 + rect.z1) / 2;
    }
    findForm(s, byLevel, q, target, spec, iterations);
    return { strips, rooms };
  };

  let fOrder = new Map([...foundationsOf.entries()].map(([g, list]) => [g, centerOut(list)]));
  for (let round = 0; round < 8; round++) {
    place(stripOrder, fOrder, 60);
    let span = 0;
    for (let c = 0; c < s.chainCount; c++) {
      span +=
        Math.abs(target[s.dependent[c]! * 3]! - target[s.dependency[c]! * 3]!) * s.chainLoad[c]!;
    }
    if (best === null || span < best.span)
      best = { order: [...stripOrder], fOrder: new Map(fOrder), span };
    // Reorder foundations by the mean position of what hangs from them, strips by the mean of their files.
    const key = new Float64Array(s.n);
    for (const f of s.foundations) {
      let sum = 0;
      let weight = 0;
      for (const c of s.inc[f]!) {
        sum += target[s.dependent[c]! * 3]! * s.chainLoad[c]!;
        weight += s.chainLoad[c]!;
      }
      key[f] = weight > 0 ? sum / weight : target[f * 3]!;
    }
    fOrder = new Map(
      [...fOrder.entries()].map(([g, list]) => [
        g,
        [...list].sort((a, b) => key[a]! - key[b]! || a - b),
      ]),
    );
    const groupKey = new Map<string, number>();
    for (const g of groups) {
      let sum = 0;
      let weight = 0;
      for (let v = 0; v < s.n; v++) {
        if (s.group[v] !== g) continue;
        sum += target[v * 3]! * s.lines[v]!;
        weight += s.lines[v]!;
      }
      groupKey.set(g, weight > 0 ? sum / weight : 0);
    }
    stripOrder = [...stripOrder].sort(
      (a, b) => groupKey.get(a)! - groupKey.get(b)! || a.localeCompare(b),
    );
  }
  const { strips, rooms } = place(best!.order, best!.fOrder, 400);

  const rest = new Float64Array(s.chainCount);
  const tensionH = new Float64Array(s.chainCount);
  for (let c = 0; c < s.chainCount; c++) {
    const a = s.dependent[c]! * 3;
    const b = s.dependency[c]! * 3;
    const dx = target[a]! - target[b]!;
    const dy = target[a + 1]! - target[b + 1]!;
    const dz = target[a + 2]! - target[b + 2]!;
    const h = Math.hypot(dx, dz);
    const d = Math.hypot(h, dy);
    if (s.inCycle[c] === 1) {
      // Two files of one cycle lean on each other: a loose loop between them, carrying nothing down.
      rest[c] = Math.max(d, 0.2) * 1.25;
      tensionH[c] = 0;
    } else {
      rest[c] = Math.max(d, 1e-3);
      tensionH[c] = (s.chainLoad[c]! * h) / Math.max(1e-6, Math.abs(dy));
    }
  }
  return { spec, strips, rooms, target, rest, tensionH };
}

/** Heaviest in the middle, lighter ones alternating outwards. */
function centerOut(list: readonly number[]): number[] {
  const out: number[] = [];
  list.forEach((v, i) => {
    if (i % 2 === 0) out.push(v);
    else out.unshift(v);
  });
  return out;
}

/**
 * Horizontal equilibrium by successive over-relaxation, with foundations (and the isolated file) fixed.
 * Files of one level are then kept a minimum distance apart in x, so none hides another in elevation.
 */
function findForm(
  s: Structure,
  byLevel: readonly (readonly number[])[],
  q: Float64Array,
  target: Float64Array,
  spec: PlanSpec,
  iterations: number,
) {
  const free: number[] = [];
  for (let L = 1; L <= s.maxLevel; L++) for (const v of byLevel[L]!) free.push(v);
  // Start every file below the mean of what it hangs from (levels in order, so supports are placed first).
  for (const v of free) {
    let x = 0;
    let z = 0;
    let count = 0;
    for (const c of s.out[v]!) {
      const u = s.dependency[c]!;
      if (s.level[u]! >= s.level[v]!) continue;
      x += target[u * 3]!;
      z += target[u * 3 + 2]!;
      count++;
    }
    target[v * 3] = count > 0 ? x / count : spec.width / 2;
    target[v * 3 + 2] = count > 0 ? z / count : 0;
  }
  const omega = 1.5;
  const relax = () => {
    for (const v of free) {
      let sx = 0;
      let sz = 0;
      let sq = 0;
      for (const c of s.out[v]!) {
        const w = q[c]!;
        if (w === 0) continue;
        const u = s.dependency[c]! * 3;
        sx += w * target[u]!;
        sz += w * target[u + 2]!;
        sq += w;
      }
      for (const c of s.inc[v]!) {
        const w = q[c]!;
        if (w === 0) continue;
        const u = s.dependent[c]! * 3;
        sx += w * target[u]!;
        sz += w * target[u + 2]!;
        sq += w;
      }
      if (sq === 0) continue;
      const i = v * 3;
      target[i] = target[i]! + omega * (sx / sq - target[i]!);
      target[i + 2] = target[i + 2]! + omega * (sz / sq - target[i + 2]!);
    }
  };
  const separate = () => {
    const margin = 0.2;
    for (let L = 1; L <= s.maxLevel; L++) {
      const sorted = [...byLevel[L]!].sort((a, b) => target[a * 3]! - target[b * 3]! || a - b);
      for (let pass = 0; pass < 30; pass++) {
        let moved = false;
        for (let i = 1; i < sorted.length; i++) {
          const a = sorted[i - 1]! * 3;
          const b = sorted[i]! * 3;
          const gap = target[b]! - target[a]!;
          if (gap < spec.separation) {
            const push = (spec.separation - gap) / 2;
            target[a] = target[a]! - push;
            target[b] = target[b]! + push;
            moved = true;
          }
        }
        for (const v of sorted)
          target[v * 3] = Math.min(spec.width - margin, Math.max(margin, target[v * 3]!));
        if (!moved) break;
      }
    }
  };
  for (let it = 0; it < iterations; it++) {
    relax();
    if (it % 20 === 19) separate();
  }
  separate();
}
