import type { Camera } from "./view";

/**
 * What the stage writes and a renderer draws: three layers of records (see `RECORD` in catenary.ts for lines).
 *
 * Joint record (DOT floats):
 *   [0..3]  x, y, z, radius (CSS px)
 *   [4..7]  r, g, b, alpha
 *   [8..11] kind (0 a weight, 1 a pin), ring stroke (CSS px), unused, unused
 */
export const DOT = 12;

export interface Layer {
  readonly data: Float32Array;
  count: number;
  /** The first `n` records changed (all counted records when omitted). */
  upload(n?: number): void;
}

export interface DrawingRenderer {
  readonly construction: Layer;
  readonly chains: Layer;
  readonly joints: Layer;
  resize(width: number, height: number, dpr: number): void;
  /**
   * `depthRange`: farthest and nearest depth of the model in this view, for the "beyond" line weight.
   * `chainFade`: strength of the chains (1 normal), so a view can quiet them; lit stretches keep full strength.
   */
  render(cam: Camera, depthRange: readonly [number, number], chainFade?: number): void;
  dispose(): void;
}

export interface Palette {
  readonly sheet: readonly [number, number, number];
  readonly load: readonly [number, number, number];
}

export type RendererFactory = (
  canvas: HTMLCanvasElement,
  sizes: { construction: number; chains: number; joints: number },
  palette: Palette,
) => DrawingRenderer;
