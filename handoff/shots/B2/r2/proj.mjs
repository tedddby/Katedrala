// Projection as the stage and the 2D fallback do it: camera values [yaw, pitch, dist, tx, ty, tz, fov, lensX, lensY].
import { readFileSync } from "node:fs";
const S = "/home/user/Katedrala/site/components/stage";
export const M = await import(`${S}/model.ts`);
export const T = await import(`${S}/timeline.ts`);
export const data = JSON.parse(readFileSync("/home/user/Katedrala/site/public/data/codeverse-graph.json", "utf8"));
export const model = M.buildModel(data);
export const idx = (p) => model.paths.indexOf(p);
const cache = {};
export function standing(framing) {
  return (cache[framing] ??= Array.from({ length: model.n }, (_, v) => T.standingOf(model, framing, v)));
}
export function project(values, framing, W, H) {
  const cam = T.cameraFrom(values, T.emptyCamera());
  const [ex, ey, ez] = cam.eye;
  const [tx, ty, tz] = cam.target;
  let fx = tx - ex, fy = ty - ey, fz = tz - ez;
  const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
  let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
  const u = [-rz * fy, rz * fx - rx * fz, rx * fy];
  const fov = T.lensFov(cam.fov, W / H, framing);
  const k = H / 2 / Math.tan((fov * Math.PI) / 360);
  const cx = (W / 2) * (1 + cam.lensX), cy = (H / 2) * (1 - cam.lensY);
  return (p) => {
    const wx = p[0] - ex, wy = p[1] - ey, wz = p[2] - ez;
    const d = wx * fx + wy * fy + wz * fz;
    return [cx + ((wx * rx + wz * rz) * k) / d, cy - ((wx * u[0] + wy * u[1] + wz * u[2]) * k) / d, d];
  };
}
export function bbox(values, framing, W, H, nodes) {
  const pr = project(values, framing, W, H);
  const st = standing(framing);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const v of nodes ?? st.keys()) {
    const [x, y] = pr(st[v]);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1].map(Math.round);
}
