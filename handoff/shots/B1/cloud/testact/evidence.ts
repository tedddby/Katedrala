/**
 * TEMPORARY TEST ACT (B1's interface check, not shipped): exercises every part of the act interface in film and still
 * mode. Restored to the stub right after the check.
 */
import type { ActDefinition, CameraKey, LitMask } from "../act";
import type { HangingModel } from "../model";
import { standingOf, type Framing } from "../timeline";

const cache = new WeakMap<HangingModel, { a: number; b: number; mask: LitMask }>();
function dep(model: HangingModel) {
  let c = cache.get(model);
  if (c === undefined) {
    const a = model.paths.indexOf("src/analysis/analysis-service.ts");
    const b = model.paths.indexOf("src/analysis/cache-key.ts");
    const nodes = new Uint8Array(model.n);
    const edges = new Uint8Array(model.m);
    nodes[a] = 1;
    nodes[b] = 1;
    for (let k = 0; k < model.m; k++) if (model.edgeA[k] === a && model.edgeB[k] === b) edges[k] = 1;
    c = { a, b, mask: { nodes, edges, dim: 0.85 } };
    cache.set(model, c);
  }
  return c;
}
function aim(model: HangingModel, framing: Framing): number[] {
  const { a, b } = dep(model);
  const pa = standingOf(model, framing, a);
  const pb = standingOf(model, framing, b);
  return [0.6, 0.18, 18, (pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2, 34, framing === "wide" ? 0.3 : 0, 0];
}
declare global {
  interface Window {
    __actTest?: { calls: number; lastT: number; mode: string; labelAt: number; mounted: number; disposed: number };
  }
}
export const evidenceAct: ActDefinition = {
  id: "evidence",
  cameraKeys(model, framing, from) {
    const v = aim(model, framing);
    return [from!, [0.5, ...v] as unknown as CameraKey, [1, ...v] as unknown as CameraKey];
  },
  lit: (t, model) => (t >= 0.2 ? dep(model).mask : null),
  emphasis: (t) => Math.max(0, 1 - Math.abs(t - 0.95) / 0.05),
  mount(ctx) {
    const label = ctx.label({ active: true });
    const { b } = dep(ctx.model);
    label.set(ctx.model.paths[b]!, "test label: the dependency");
    window.__actTest = { calls: 0, lastT: NaN, mode: ctx.mode, labelAt: b, mounted: (window.__actTest?.mounted ?? 0) + 1, disposed: window.__actTest?.disposed ?? 0 };
    return {
      update(t) {
        window.__actTest!.calls++;
        window.__actTest!.lastT = t;
        if (t >= 0.3 && t <= 1) label.at(b);
        else label.hide();
      },
      dispose() {
        label.hide();
        window.__actTest!.disposed++;
      },
    };
  },
  still: {
    camera(model, framing) {
      const v = aim(model, framing);
      const [yaw, pitch, dist, tx, ty, tz, fov, lensX, lensY] = v as [number, number, number, number, number, number, number, number, number];
      const cp = Math.cos(pitch);
      return { eye: [tx + dist * cp * Math.sin(yaw), ty + dist * Math.sin(pitch), tz + dist * cp * Math.cos(yaw)], target: [tx, ty, tz], fov, lensX, lensY };
    },
    lit: (model) => dep(model).mask,
    t: 0.6,
  },
};
