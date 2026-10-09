import type { Model } from "./model";
import type { Plan } from "./plan";
import type { Sim, SimSpec } from "./sim";

/**
 * The rig: Gaudí's model built from the data. Every source file is a weight (its mass in proportion to its lines);
 * every runtime dependency is a chain from the dependency down to the dependent; foundations (and the one isolated
 * file) are pinned to the board at their anchor points.
 *
 * Gaudí cut each string to the length that would hang its load at the height he wanted. The chains here are cut the
 * same way: long enough to hang each file one level-height per level below the board, between the files it depends
 * on (drawn a little towards the bay of its own directory), plus a little slack. Gravity does the rest: which chains
 * go taut, where exactly each weight comes to rest, how every chain sags. Chains have weight too, in proportion to
 * the load they carry, as a builder sizes a member to its load.
 *
 * Particle layout: [0, files) are the files in model order, then every chain's links. Segment layout: chain by
 * chain, from the dependency (top) down to the dependent.
 */

export interface RigOptions {
  readonly plan: Plan;
  /** Height of one level, in model units. */
  readonly unit: number;
  /** Chain length as a multiple of the cut length: slack lets chains sag. */
  readonly slack: number;
  /** Target link length, and the fewest and most links one chain gets. */
  readonly linkLength: number;
  readonly minLinks: number;
  readonly maxLinks: number;
  /** Mass of one line of code. */
  readonly massPerLine: number;
  /** Chain mass as a share of the load it carries. */
  readonly chainMass: number;
  /** Radius of a 100-line weight (radius grows with the cube root of lines: volume tracks mass). */
  readonly radius100: number;
  /** Lightest a file weighs in the solver, in lines (keeps mass ratios solvable; drawn sizes stay true). */
  readonly minLines: number;
  /** A chain weighs at least this share of the file hanging from it. */
  readonly minChainShare: number;
  /** How strongly a shallow file is cut to hang under its own directory's bay rather than between its dependencies. */
  readonly bayPull: number;
  /** Levels over which that pull fades: deep files hang between their dependencies. */
  readonly bayFade: number;
  /**
   * How far the deepest level is drawn towards the centre line of the plan (0: not at all, 1: onto it), as Gaudí cut
   * his strings to give a vault its profile. Levels in between follow taperPower.
   */
  readonly taper: number;
  readonly taperPower: number;
}

export interface Rig {
  readonly spec: SimSpec;
  readonly files: number;
  readonly segments: number;
  readonly chains: number;
  /** Per chain: first segment and number of segments. */
  readonly chainStart: Uint32Array;
  readonly chainLinks: Uint8Array;
  /** Per chain: its cut length. */
  readonly chainLength: Float32Array;
  /** Per segment: its chain. */
  readonly segChain: Uint32Array;
  /** Per segment: 0 at the dependency end of its chain, 1 at the dependent end (midpoint). */
  readonly segT: Float32Array;
  /** Per particle: the level it sits at (links interpolate along their chain). */
  readonly particleLevel: Float32Array;
  /** Per particle: the chain it belongs to, or -1 for files. */
  readonly particleChain: Int32Array;
  /** Per file: visual and collision radius. */
  readonly fileRadius: Float32Array;
  /** The cut form: where every particle would hang if every chain were taut and straight. */
  readonly target: Float32Array;
  /** Deepest a file can hang (its shortest chain path to the board). */
  readonly height: number;
}

export function buildRig(model: Model, options: RigOptions): Rig {
  const { nodes, chains } = model;
  const {
    plan,
    unit,
    slack,
    linkLength,
    minLinks,
    maxLinks,
    massPerLine,
    chainMass,
    radius100,
    minLines,
  } = options;
  const files = nodes.length;
  const pinned = (id: number) => nodes[id]!.kind === "foundation" || nodes[id]!.kind === "isolated";
  const massOf = (id: number) => Math.max(minLines, nodes[id]!.lines) * massPerLine;

  // Where each file hangs in the cut form: one unit per level below the board, between its dependencies, drawn
  // towards its own bay while it is shallow. Files of one directory spread over their bay on a sunflower spiral.
  const bayOf = new Map(plan.bays.map((b) => [b.group, b]));
  const groupCount = new Map<number, number>();
  const tx = new Float64Array(files);
  const ty = new Float64Array(files);
  const tz = new Float64Array(files);
  const order = nodes.map((n) => n.id).sort((a, b) => nodes[a]!.level - nodes[b]!.level || a - b);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (const id of order) {
    const node = nodes[id]!;
    if (pinned(id)) {
      tx[id] = plan.anchorX[id]!;
      ty[id] = 0;
      tz[id] = plan.anchorZ[id]!;
      continue;
    }
    let sx = 0;
    let sz = 0;
    let k = 0;
    for (const c of model.up[id]!) {
      const b = chains[c]!.dependency;
      sx += tx[b]!;
      sz += tz[b]!;
      k++;
    }
    let x = k > 0 ? sx / k : 0;
    let z = k > 0 ? sz / k : 0;
    const bay = bayOf.get(node.group);
    const i = groupCount.get(node.group) ?? 0;
    groupCount.set(node.group, i + 1);
    if (bay) {
      const r = plan.pitch * 0.55 * Math.sqrt(i + 0.5);
      const bx = bay.cx * 0.86 + Math.cos(i * golden) * r;
      const bz = bay.cz * 0.86 + Math.sin(i * golden) * r;
      const pull = options.bayPull * Math.exp(-(node.level - 1) / options.bayFade);
      x += (bx - x) * pull;
      z += (bz - z) * pull;
    }
    // The profile: each level a little closer to the centre line than the one above it.
    const shrink =
      1 - options.taper * Math.pow(node.level / Math.max(1, model.maxLevel), options.taperPower);
    x *= shrink;
    z *= shrink;
    // A small, deterministic offset so files with the same supports do not start in one spot.
    const a = id * golden;
    const spread = plan.pitch * (0.18 + 0.06 * (id % 3));
    tx[id] = x + Math.cos(a) * spread;
    tz[id] = z + Math.sin(a) * spread;
    ty[id] = -node.level * unit;
  }

  // Chains cut to the cut form, plus slack; links in proportion to length.
  const chainLength = new Float32Array(chains.length);
  const chainLinks = new Uint8Array(chains.length);
  let segments = 0;
  chains.forEach((c, i) => {
    const a = c.dependent;
    const b = c.dependency;
    const d = Math.hypot(tx[a]! - tx[b]!, ty[a]! - ty[b]!, tz[a]! - tz[b]!);
    const length = Math.max(d, 0.35 * unit) * slack;
    chainLength[i] = length;
    const links = Math.min(maxLinks, Math.max(minLinks, Math.round(length / linkLength)));
    chainLinks[i] = links;
    segments += links;
  });
  const count = files + segments - chains.length;

  // Deepest possible hang per file: the shortest chain path up to the board (Bellman-Ford; all lengths > 0).
  const fileLimit = new Float64Array(files).fill(Number.POSITIVE_INFINITY);
  for (let i = 0; i < files; i++) if (pinned(i)) fileLimit[i] = 0;
  for (let pass = 0; pass < files; pass++) {
    let changed = false;
    for (let i = 0; i < chains.length; i++) {
      const c = chains[i]!;
      const via = fileLimit[c.dependency]! + chainLength[i]!;
      if (via < fileLimit[c.dependent]!) {
        fileLimit[c.dependent] = via;
        changed = true;
      }
    }
    if (!changed) break;
  }

  const invMass = new Float32Array(count);
  const position = new Float32Array(count * 3);
  const depthLimit = new Float32Array(count);
  const radius = new Float32Array(count);
  const particleLevel = new Float32Array(count);
  const particleChain = new Int32Array(count).fill(-1);
  const fileRadius = new Float32Array(files);

  for (let id = 0; id < files; id++) {
    const node = nodes[id]!;
    const r = radius100 * Math.cbrt(Math.max(node.lines, 1) / 100);
    fileRadius[id] = r;
    radius[id] = r;
    particleLevel[id] = node.level;
    const j = id * 3;
    position[j] = tx[id]!;
    position[j + 1] = ty[id]!;
    position[j + 2] = tz[id]!;
    invMass[id] = pinned(id) ? 0 : 1 / massOf(id);
    depthLimit[id] = pinned(id) ? 0 : fileLimit[id]! * 1.01 + 0.02;
  }

  // Links strung from the dependency down to the dependent, in a shallow sag.
  const segA = new Uint32Array(segments);
  const segB = new Uint32Array(segments);
  const rest = new Float32Array(segments);
  const segChain = new Uint32Array(segments);
  const segT = new Float32Array(segments);
  const chainStart = new Uint32Array(chains.length);
  let p = files;
  let s = 0;
  chains.forEach((c, ci) => {
    const links = chainLinks[ci]!;
    const length = chainLength[ci]!;
    const top = c.dependency;
    const bottom = c.dependent;
    const linkMass =
      Math.max(chainMass * c.load * massPerLine, options.minChainShare * massOf(bottom)) /
      Math.max(1, links - 1);
    const t3 = top * 3;
    const b3 = bottom * 3;
    const lt = nodes[top]!.level;
    const lb = nodes[bottom]!.level;
    const chord = Math.hypot(
      tx[bottom]! - tx[top]!,
      ty[bottom]! - ty[top]!,
      tz[bottom]! - tz[top]!,
    );
    const sag = Math.sqrt(Math.max(0, (3 * chord * (length - chord)) / 8));
    chainStart[ci] = s;
    let prevParticle = top;
    for (let k = 1; k <= links; k++) {
      const last = k === links;
      const particle = last ? bottom : p++;
      if (!last) {
        const t = k / links;
        const j = particle * 3;
        position[j] = position[t3]! + (position[b3]! - position[t3]!) * t;
        position[j + 1] =
          position[t3 + 1]! + (position[b3 + 1]! - position[t3 + 1]!) * t - sag * 4 * t * (1 - t);
        position[j + 2] = position[t3 + 2]! + (position[b3 + 2]! - position[t3 + 2]!) * t;
        invMass[particle] = 1 / linkMass;
        depthLimit[particle] = (fileLimit[top]! + length * t) * 1.01 + 0.02;
        particleLevel[particle] = lt + (lb - lt) * t;
        particleChain[particle] = ci;
      }
      segA[s] = prevParticle;
      segB[s] = particle;
      rest[s] = length / links;
      segChain[s] = ci;
      segT[s] = (k - 0.5) / links;
      s++;
      prevParticle = particle;
    }
  });

  const colliders = new Uint32Array(files);
  for (let i = 0; i < files; i++) colliders[i] = i;

  let height = 0;
  for (let i = 0; i < files; i++) height = Math.max(height, fileLimit[i]!);

  return {
    spec: { count, invMass, position, segA, segB, rest, depthLimit, colliders, radius },
    files,
    segments,
    chains: chains.length,
    chainStart,
    chainLinks,
    chainLength,
    segChain,
    segT,
    particleLevel,
    particleChain,
    fileRadius,
    target: Float32Array.from(position),
    height,
  };
}

/**
 * Let the model find its rest: run with heavy damping until nothing moves (or the step budget runs out).
 * Returns the steps it took. Deterministic: same data, same form.
 */
export function settle(sim: Sim, maxSteps: number, dt = 1 / 60, threshold = 0.05): number {
  const damping = sim.damping;
  sim.damping = 6;
  let steps = 0;
  for (; steps < maxSteps; steps++) {
    sim.step(dt);
    if (steps > 20 && sim.maxSpeed2 < threshold * threshold) break;
  }
  sim.damping = damping;
  return steps;
}
