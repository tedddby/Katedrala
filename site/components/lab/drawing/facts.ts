import { KIND_FOUNDATION, analyze, layout, loadPath } from "./model";
import type { GraphDocument, PlanSpec } from "./model";

/**
 * Every number the hero prints, computed on the server from Katedrala's analysis of CodeVerse
 * (public/data/codeverse-graph.json). Nothing here is typed by hand.
 */

/** The board for a wide drawing (desktop) and for a square one (the phone's drawing band). */
export const WIDE_SPEC: PlanSpec = { width: 22, depth: 9, separation: 0.13 };
export const MEDIUM_SPEC: PlanSpec = { width: 14.5, depth: 9, separation: 0.1 };
/** The drawing switches to the medium board when its standing frame is narrower than this (width / height). */
export const WIDE_ASPECT = 1.15;
/** Must match MARGIN, SLAB and the line weights in engine/stage.ts. */
export const BOARD_MARGIN = 0.7;
export const BOARD_SLAB = 0.22;
export const LINE_WEIGHT_MAX = { wide: 4.2, narrow: 3.2 } as const;
export const LINE_WEIGHT_MIN = 0.16;

export interface Facts {
  readonly repository: string;
  readonly commit: string;
  readonly generator: string;
  readonly files: number;
  readonly sourceFiles: number;
  readonly testFiles: number;
  readonly dependencies: number;
  readonly chains: number;
  readonly foundations: number;
  readonly entries: number;
  readonly isolated: number;
  readonly levels: number;
  readonly maxLevel: number;
  readonly perLevel: readonly number[];
  readonly totalLines: number;
  readonly groups: number;
  /** The highest file, and how many source files it rests on, directly or through others. */
  readonly crown: { readonly path: string; readonly level: number; readonly restsOn: number };
  readonly heaviest: readonly {
    readonly path: string;
    readonly reach: number;
    readonly lines: number;
  }[];
  /** The heaviest chain load, in lines of code (the top of the line-weight scale). */
  readonly maxChainLoad: number;
  /** Foundation positions along the board for the server-drawn board, per plan. */
  readonly anchors: {
    readonly wide: readonly { readonly x: number; readonly r: number }[];
    readonly medium: readonly { readonly x: number; readonly r: number }[];
  };
}

export function factsOf(doc: GraphDocument): Facts {
  const s = analyze(doc);
  const wide = layout(s, WIDE_SPEC);
  const medium = layout(s, MEDIUM_SPEC);
  let crown = 0;
  for (let v = 0; v < s.n; v++) if (s.level[v]! > s.level[crown]!) crown = v;
  const heaviest = [...s.foundations]
    .sort((a, b) => s.reach[b]! - s.reach[a]! || a - b)
    .slice(0, 5)
    .map((f) => ({ path: s.path[f]!, reach: s.reach[f]!, lines: s.lines[f]! }));
  const pins = [...s.foundations, ...s.isolated];
  const anchorsOf = (target: Float64Array) =>
    pins.map((v) => ({
      x: Math.round(target[v * 3]! * 1000) / 1000,
      r:
        Math.round(
          (s.kind[v] === KIND_FOUNDATION ? 2.1 + Math.sqrt(s.lines[v]!) / 12 : 2.1) * 100,
        ) / 100,
    }));
  return {
    repository: s.repository,
    commit: s.commit,
    generator: s.generator,
    files: s.counts.files,
    sourceFiles: s.counts.sourceFiles,
    testFiles: s.counts.testFiles,
    dependencies: s.counts.dependencies,
    chains: s.chainCount,
    foundations: s.foundations.length,
    entries: s.entries.length,
    isolated: s.isolated.length,
    levels: s.maxLevel + 1,
    maxLevel: s.maxLevel,
    perLevel: s.levelCounts,
    totalLines: s.totalLines,
    groups: wide.strips.length,
    crown: { path: s.path[crown]!, level: s.level[crown]!, restsOn: loadPath(s, crown).below.size },
    heaviest,
    maxChainLoad: s.maxChainLoad,
    anchors: { wide: anchorsOf(wide.target), medium: anchorsOf(medium.target) },
  };
}

/** Line width, CSS px, of a chain carrying `load` lines of code (the same rule as the drawing). */
export function lineWeight(load: number, maxLoad: number, max: number): number {
  return Math.max(LINE_WEIGHT_MIN, max * Math.sqrt(load / maxLoad));
}

export const fmt = (n: number) => n.toLocaleString("en-US");
