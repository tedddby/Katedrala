// Projects the plan (outer wall ellipse, its slab, and the first hanging level) through a camera key, with the
// same math as stage.ts (lookAt, vertical fov, lens shift in NDC), and prints the screen bounds.
// usage: node fit.mjs W H yaw pitch dist tx ty tz fov lensX lensY
const [W, H, yaw, pitch, dist, tx, ty, tz, fov, lensX, lensY] = process.argv.slice(2).map(Number);
const PLAN_RADIUS = 11, PLAN_MINOR = 7.4, LEVEL = 1.1, HM = 15 * LEVEL, SLAB = 0.62;
const eye = [tx + dist * Math.cos(pitch) * Math.sin(yaw), ty + dist * Math.sin(pitch), tz + dist * Math.cos(pitch) * Math.cos(yaw)];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
const f = norm(sub([tx, ty, tz], eye));
const r = norm(cross(f, [0, 1, 0]));
const u = cross(r, f);
const t = Math.tan((fov * Math.PI) / 360);
const aspect = W / H;
const proj = (p) => {
  const d = sub(p, eye);
  const zc = dot(d, f);
  const nx = dot(d, r) / zc / (t * aspect) + lensX;
  const ny = dot(d, u) / zc / t + lensY;
  return [((nx + 1) / 2) * W, ((1 - ny) / 2) * H];
};
const bounds = (pts) => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { const [x, y] = proj(p); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x0: Math.round(x0), x1: Math.round(x1), y0: Math.round(y0), y1: Math.round(y1), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
};
const ring = (rad, y) => Array.from({ length: 180 }, (_, i) => { const a = (i / 180) * Math.PI * 2; return [Math.cos(a) * PLAN_RADIUS * rad, y, Math.sin(a) * PLAN_MINOR * rad]; });
console.log("plan  ", JSON.stringify(bounds([...ring(1.145, HM), ...ring(1.145, HM + SLAB)])));
console.log("level1", JSON.stringify(bounds(ring(0.95, HM - LEVEL))));
console.log("level3", JSON.stringify(bounds(ring(0.85, HM - 3 * LEVEL))));
