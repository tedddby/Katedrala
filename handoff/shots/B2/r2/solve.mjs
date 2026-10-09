// Finds camera values that put world points at chosen screen positions (Nelder-Mead over yaw, pitch, dist, lensX, lensY).
import { project } from "./proj.mjs";
export function nelder(f, x0, step, iters = 4000) {
  const n = x0.length;
  let pts = [x0.slice()];
  for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += step[i]; pts.push(p); }
  let vals = pts.map(f);
  for (let it = 0; it < iters; it++) {
    const order = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    pts = order.map((i) => pts[i]); vals = order.map((i) => vals[i]);
    const c = Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += pts[i][j] / n;
    const r = c.map((cj, j) => cj + (cj - pts[n][j]));
    const fr = f(r);
    if (fr < vals[0]) {
      const e = c.map((cj, j) => cj + 2 * (cj - pts[n][j]));
      const fe = f(e);
      if (fe < fr) { pts[n] = e; vals[n] = fe; } else { pts[n] = r; vals[n] = fr; }
    } else if (fr < vals[n - 1]) { pts[n] = r; vals[n] = fr; }
    else {
      const k = c.map((cj, j) => cj + 0.5 * (pts[n][j] - cj));
      const fk = f(k);
      if (fk < vals[n]) { pts[n] = k; vals[n] = fk; }
      else { for (let i = 1; i <= n; i++) { pts[i] = pts[i].map((x, j) => pts[0][j] + 0.5 * (x - pts[0][j])); vals[i] = f(pts[i]); } }
    }
  }
  return { x: pts[0], v: vals[0] };
}
// targets: [[worldPoint, [sx, sy], weight]], fixed: { tx, ty, tz, fov }, free: yaw pitch dist lensX lensY; prefs: {pitch, wPitch}
export function solve(framing, W, H, targets, fixed, init, prefs = {}) {
  const f = (x) => {
    const [yaw, pitch, dist, lx, ly] = x;
    if (dist < 8 || Math.abs(pitch) > 1.4) return 1e12;
    const pr = project([yaw, pitch, dist, fixed.tx, fixed.ty, fixed.tz, fixed.fov, lx, ly], framing, W, H);
    let e = 0;
    for (const [p, s, w = 1] of targets) { const q = pr(p); if (q[2] < 1) return 1e12; e += w * ((q[0] - s[0]) ** 2 + (q[1] - s[1]) ** 2); }
    if (prefs.pitch !== undefined) e += (prefs.wPitch ?? 2000) * (pitch - prefs.pitch) ** 2;
    if (prefs.yaw !== undefined) e += (prefs.wYaw ?? 2000) * (yaw - prefs.yaw) ** 2;
    if (prefs.dist !== undefined) e += (prefs.wDist ?? 5) * (dist - prefs.dist) ** 2;
    return e;
  };
  const r = nelder(f, init, [0.2, 0.1, 5, 0.1, 0.1]);
  return { values: [r.x[0], r.x[1], r.x[2], fixed.tx, fixed.ty, fixed.tz, fixed.fov, r.x[3], r.x[4]], err: Math.sqrt(r.v / targets.length) };
}
