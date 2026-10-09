/**
 * The act interface: what one act contributes to the one continuous film, and what the film gives each act.
 *
 * The film is one pinned track scrubbed by one clock (timeline.ts): Act I "See what your code stands on." (hang.ts),
 * Act II "Every conclusion has evidence." (acts/evidence.ts), Act III "Know what a change will touch before you make
 * it." (acts/change.ts) and the landing "Trace any file." (acts/landing.ts). Each act has three parts:
 *
 * - Timing (ActTiming): its pinned length per framing, its page-key stops and its anchor, as pure data. Act I's is in
 *   timeline.ts, the others' in acts/timing.ts; the server reads them to size the track and place the anchors.
 * - Behaviour (ActDefinition): its camera keys, what it lights, its overlays and its still figure, run by the
 *   director in film mode (director.ts) and by the still controller otherwise (still.ts). Registered in acts/index.ts.
 * - Markup (server components): the act's block (h2, narration in full sentences, record, controls), which Film.tsx
 *   places in the act's slot, and its frame words (visual captions, counters), which Film.tsx places in the act's
 *   layer over the drawing.
 *
 * Act modules never import three.js, GSAP or stage.ts: everything they need from the drawing comes through
 * ActContext, so the still mode (reduced motion, no usable WebGL 2) runs every act without downloading either.
 */
import type { GraphData, HangingModel } from "./model";
import type { CameraState, Framing } from "./timeline";

export type ActId = "hang" | "evidence" | "change" | "trace";

/**
 * A camera key: the act's local time t (0..1), then where the camera is, as an orbit round its target: yaw and pitch
 * (radians; yaw 0 looks along -z), distance and target (model units, world space: the standing structure's ground is
 * y = 0), the vertical field of view (degrees, for the framing's reference aspect; narrower windows widen it), and
 * the lens shift (normalized device units: lensX 0.3 moves the picture right by 15 percent of the frame's width).
 */
export type CameraKey = readonly [
  t: number,
  yaw: number,
  pitch: number,
  distance: number,
  targetX: number,
  targetY: number,
  targetZ: number,
  fov: number,
  lensX: number,
  lensY: number,
];

/** An act's place on the clock: pure data, read on the server (track height, anchors) and in the browser. */
export interface ActTiming {
  readonly id: ActId;
  /** Pinned scroll length in viewports, per framing (wide: words beside the drawing; tall: phones in portrait). */
  readonly length: { readonly wide: number; readonly tall: number };
  /** Local 0..1 stops for Space, Page Down and Page Up while the film is pinned, ascending. */
  readonly stops: readonly number[];
  /** Local t where the act's anchor lands (#film-start, #evidence, #impact, #trace): its first caption in full view. */
  readonly anchor: number;
}

/** What is lit (load blue) and how far everything else steps back (0..1). */
export interface LitMask {
  /** One entry per file of the model (model.n): 1 lit. */
  readonly nodes: Uint8Array;
  /** One entry per chain of the model (model.m), a runtime dependency between source files: 1 lit. */
  readonly edges: Uint8Array;
  /** How far whatever is not lit steps back: 0 not at all, 0.85 to about 15 percent. */
  readonly dim: number;
}

/** A box on the frame, CSS px from its top left (as the director's label layout uses it). */
export interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

/** Where something is on the frame, CSS px from its top left, in the last drawn frame. */
export interface ScreenPoint {
  x: number;
  y: number;
  /** Distance from the camera, model units. */
  depth: number;
  /** In front of the camera and on (or near) the frame. */
  visible: boolean;
}

/** How a traced file is lit, and the sentence its label carries under its path. */
export interface TraceView {
  readonly mask: LitMask;
  /** One computed sentence (fileNote's form): "Level 9, 369 lines. Stands on 52 files, 12 of them foundations." */
  readonly note: string;
}

/**
 * A leader label on the drawing: the film's own (a mono path that breaks only after a slash, a short note, a
 * knock-out ground, a hairline leader to its joint), placed clear of every word on the frame and of the labels
 * placed before it. Labels hide on their own while their point is behind the frame's words or off the frame.
 */
export interface ActLabel {
  /** Sets its words; its size is measured again the next time it is placed. */
  set(code: string, note: string): void;
  /** Points it at file v of the model (-1 hides it). Takes effect at the next placement. */
  at(v: number): void;
  /** Points it at a world-space point of the standing structure (model units). */
  atWorld(x: number, y: number, z: number): void;
  /** Hides it. */
  hide(): void;
}

/** What the film gives an act: the drawing as it is on screen, the label layout and the trace. */
export interface ActContext {
  /** "film": the pinned WebGL film; "still": one Canvas 2D figure of this act (still.ts). */
  readonly mode: "film" | "still";
  readonly id: ActId;
  /** The film's section. */
  readonly root: HTMLElement;
  /** The frame the drawing fills (film: the pinned stage; still: this act's figure). Overlays use its CSS px. */
  readonly frame: HTMLElement;
  /**
   * This act's frame words: in film mode the act's layer over the drawing ([data-act-layer], with the markup the
   * act's frame component rendered); in still mode the figure's own layer ([data-still-layer]). Null if none.
   */
  readonly layer: HTMLElement | null;
  /** This act's block ([data-act-slot]): its h2, narration, record and controls. */
  readonly slot: HTMLElement | null;
  readonly model: HangingModel;
  /** The analysis as public/data/codeverse-graph.json gives it (tests and type-only dependencies included). */
  readonly data: GraphData;
  /** What the server computed for the acts (acts/payload.ts), passed to the browser with the page. */
  readonly payload: unknown;
  readonly framing: Framing;
  /** The frame's size, CSS px. */
  size(): { readonly width: number; readonly height: number };
  /** Where file v of the model is on the frame, in the last drawn frame. */
  screenOf(v: number, out: ScreenPoint): ScreenPoint;
  /** Where a world-space point is on the frame (the standing structure: its ground is y = 0). */
  screenOfWorld(x: number, y: number, z: number, out: ScreenPoint): ScreenPoint;
  /** Boxes that labels and overlays keep clear of: the frame's words as they are shown now. */
  obstacles(): readonly Box[];
  /**
   * A new label on the drawing, placed every frame while it points somewhere. `active` draws its leader in load blue
   * (what is active right now); `micro` makes it one line of the mono face at 11px, for naming parts of the drawing
   * (a folder on the plan) rather than a file (its note is not shown).
   */
  label(options?: { readonly active?: boolean; readonly micro?: boolean }): ActLabel;
  /** The file traced now (a hover previews over a pin), or -1. */
  traced(): number;
  /** The file pinned now (by a click or tap on the drawing, or by pin()), or -1. */
  pinnedFile(): number;
  /**
   * Pins file v (-1 clears it): the drawing lights it at once; a hover still previews over it. The act tells
   * assistive technology through its own readout (pins made on the drawing are announced by the film).
   */
  pin(v: number): void;
  /** Listens for pins made on the drawing (a click, a tap, Escape), so controls can follow. Returns the unsubscribe. */
  onPin(listener: (v: number) => void): () => void;
  /** Lights the current trace again: call it after traceOf would answer differently (a direction changed). */
  retrace(): void;
  /** Brings the film to this act's local time t at once (focus reveal). Does nothing in still mode. */
  reveal(t: number): void;
  /** Asks for the frame to be placed again (an overlay changed what it shows, or measured new words). */
  invalidate(): void;
}

/** DOM overlays an act adds to the frame (rulers, leaders, counters, controls): bound once, placed every frame. */
export interface ActOverlay {
  /**
   * Called on every drawn frame with the act's local time, unclamped: below 0 before the act, above 1 after it,
   * so the overlay can hide itself. In still mode, called once with the still figure's t (and again on resize).
   */
  update(t: number): void;
  /** Removes everything the overlay added and every listener it bound. */
  dispose(): void;
}

/** The act as one still figure: still mode draws it in Canvas 2D through one camera with one lighting. */
export interface StillFigure {
  camera(model: HangingModel, framing: Framing): CameraState;
  lit(model: HangingModel): LitMask | null;
  /** The local time the figure stands for: its overlay is updated with it. */
  readonly t: number;
}

/** What an act does: the director runs it in film mode, the still controller in still mode. */
export interface ActDefinition {
  readonly id: ActId;
  /**
   * Camera keys in local t, ascending, the first at t 0 and the last at t 1. `from` is the previous act's last key
   * (with t 0): the first key must equal it, so the camera never cuts (the director enforces it). Null only for the
   * first act. Called once per framing.
   */
  cameraKeys(model: HangingModel, framing: Framing, from: CameraKey | null): readonly CameraKey[];
  /**
   * What is lit at local t (0..1), and how far the rest steps back; null leaves the structure unlit. Return the same
   * object while nothing changes: the director uploads a mask only when the object it gets changes.
   */
  lit(t: number, model: HangingModel): LitMask | null;
  /** 0..1: every chain brightens in chalk (not load blue), as in "every chain brightens once". Optional. */
  emphasis?(t: number): number;
  /**
   * How a file traced while this act is on screen is lit, and its label's sentence. Optional: the default lights what
   * the file stands on (or, for a foundation, what rests on it), as Act I does. A trace always wins over lit().
   */
  traceOf?(v: number, model: HangingModel): TraceView | null;
  /** DOM overlays, bound once per mode. Optional. */
  mount?(ctx: ActContext): ActOverlay;
  /** The act's still figure (still mode, the 2D fallback), or null when the act has none. */
  readonly still: StillFigure | null;
}
