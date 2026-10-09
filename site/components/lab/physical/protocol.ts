import type { Profile } from "./config";

/** Messages between the stage (main thread) and the simulation worker. Buffers travel back and forth, transferred. */

export type Mode = "live" | "still";

export interface InitMessage {
  readonly type: "init";
  readonly url: string;
  readonly profile: Profile;
  /** live: the drop, the sway, the turn-over. still: the settled, standing form once (reduced motion, fallback). */
  readonly mode: Mode;
}

export interface DragInput {
  /** Particle (file) being tugged, and where the pointer wants it, in the board's frame. */
  readonly particle: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Air the pointer moves as it sweeps across the model, in the board's frame. */
export interface AirInput {
  /** The pointer's ray: origin and unit direction. */
  readonly ox: number;
  readonly oy: number;
  readonly oz: number;
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  /** Velocity of the air (units/s). */
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  /** Radius of the gust around the ray (units). */
  readonly radius: number;
}

export interface FrameMessage {
  readonly type: "frame";
  /** Seconds since the last frame message. */
  readonly dt: number;
  /** How far the board should be turned over: 0 hanging, 1 standing. */
  readonly flip: number;
  readonly drag: DragInput | null;
  readonly air: AirInput | null;
  /** Buffers from the last reply, handed back for reuse (or null to have the worker allocate). */
  readonly positions: Float32Array | null;
  readonly forces: Float32Array | null;
}

export type ToWorker = InitMessage | FrameMessage;

export interface ReadyMessage {
  readonly type: "ready";
}

export interface FrameReply {
  readonly type: "frame";
  /** xyzw per particle (w unused), sized for the position texture. */
  readonly positions: Float32Array;
  /** Force per segment (positive: tension), sized for the force texture. */
  readonly forces: Float32Array;
  /** Board angle (radians, about z through the pivot) and angular velocity. */
  readonly angle: number;
  readonly omega: number;
  /** True while anything moves; false once the model sleeps (the stage may stop drawing). */
  readonly awake: boolean;
  /** True once the form is fixed (turning or standing); `fixedForces` then carries the photograph's tensions. */
  readonly fixed: boolean;
  readonly fixedForces: Float32Array | null;
  /** 99th percentile of the chains' tension at rest, for line weights (0 until known). */
  readonly forceScale: number;
  /** Simulation cost of this frame, ms. */
  readonly stepMs: number;
  /** Seconds since the drop began. */
  readonly time: number;
}

export interface StillReply {
  readonly type: "still";
  readonly positions: Float32Array;
  /** The rest tensions: standing, the same forces carried in compression. */
  readonly forces: Float32Array;
  readonly forceScale: number;
  readonly settleMs: number;
}

export interface ErrorReply {
  readonly type: "error";
  readonly message: string;
}

export type FromWorker = ReadyMessage | FrameReply | StillReply | ErrorReply;

/** Texture layout shared by the worker (writes) and the stage (uploads): 128 texels per row. */
export const TEX_WIDTH = 128;
export function texRows(count: number): number {
  return Math.max(1, Math.ceil(count / TEX_WIDTH));
}
