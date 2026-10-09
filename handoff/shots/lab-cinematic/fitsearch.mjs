// Search camera keys so the plan fits a target box. usage: node fitsearch.mjs W H x0 x1 yCenter targetW ty fov
const [W, H, X0, X1, YC, TW, TY, FOV] = process.argv.slice(2).map(Number);
const PLAN_RADIUS = 11, PLAN_MINOR = 7.4, HM = 16.5, SLAB = 0.62;
const ring = (rad, y) => Array.from({ length: 120 }, (_, i) => { const a = (i / 120) * Math.PI * 2; return [Math.cos(a) * PLAN_RADIUS * rad, y, Math.sin(a) * PLAN_MINOR * rad]; });
const pts = [...ring(1.145, HM), ...ring(1.145, HM + SLAB), ...ring(0.9, HM - 1.1)];
function bounds(yaw, pitch, dist, lensX, lensY, tx = 0, ty = TY, tz = 0) {
  const eye = [tx + dist * Math.cos(pitch) * Math.sin(yaw), ty + dist * Math.sin(pitch), tz + dist * Math.cos(pitch) * Math.cos(yaw)];
  const f0 = [tx - eye[0], ty - eye[1], tz - eye[2]]; const fl = Math.hypot(...f0); const f = f0.map((v) => v / fl);
  let r = [-f[2], 0, f[0]]; const rl = Math.hypot(...r); r = r.map((v) => v / rl);
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const t = Math.tan((FOV * Math.PI) / 360), aspect = W / H;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) {
    const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
    const zc = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
    const nx = (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / zc / (t * aspect) + lensX;
    const ny = (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / zc / t + lensY;
    const sx = ((nx + 1) / 2) * W, sy = ((1 - ny) / 2) * H;
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  return { x0, x1, y0, y1 };
}
for (const yaw of (process.env.YAWS||"-1.1,-0.9,-0.75,-0.6,-0.45").split(",").map(Number)) for (const pitch of (process.env.PITCHES||"0.36,0.44,0.52").split(",").map(Number)) {
  // distance for the target width (bisection), then lens to centre it
  let lo = 15, hi = 200;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; const b = bounds(yaw, pitch, mid, 0, 0); if (b.x1 - b.x0 > TW) lo = mid; else hi = mid; }
  const dist = (lo + hi) / 2;
  const b0 = bounds(yaw, pitch, dist, 0, 0);
  const lensX = (((X0 + X1) / 2 - (b0.x0 + b0.x1) / 2) / W) * 2;
  const lensY = -(((YC) - (b0.y0 + b0.y1) / 2) / H) * 2;
  const b = bounds(yaw, pitch, dist, lensX, lensY);
  console.log(`yaw ${yaw} pitch ${pitch} dist ${dist.toFixed(1)} lensX ${lensX.toFixed(3)} lensY ${lensY.toFixed(3)} -> x ${b.x0.toFixed(0)}..${b.x1.toFixed(0)} y ${b.y0.toFixed(0)}..${b.y1.toFixed(0)} (h ${(b.y1 - b.y0).toFixed(0)})`);
}
