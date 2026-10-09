// Silhouette preview of the hanging model (real data, real model code) from a few cameras, as one PNG sheet.
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
const { buildModel, TUNE } = await import("file:///katedrala/site/components/lab/cinematic/model.ts");
const data = JSON.parse(readFileSync("/katedrala/site/public/data/codeverse-graph.json", "utf8"));
if (process.argv[3]) Object.assign(TUNE, JSON.parse(process.argv[3]));
const t0 = performance.now();
const M = buildModel(data);
console.log("build ms", (performance.now() - t0).toFixed(1));
const H = M.maxLevel * M.levelHeight;
const out = process.argv[2] ?? "preview.png";

// World: hanging = board at y=H; standing = flipped about x through y=H/2.
function world(v, flip) {
  const x = M.rest[v * 3], y = M.rest[v * 3 + 1], z = M.rest[v * 3 + 2];
  return flip ? [x, -y, -z] : [x, y + H, z];
}
function cam({ eye, target, fov, w, h }) {
  const f = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
  const fl = Math.hypot(...f); f[0] /= fl; f[1] /= fl; f[2] /= fl;
  let up = [0, 1, 0];
  if (Math.abs(f[1]) > 0.99) up = [0, 0, -1];
  let r = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]];
  const rl = Math.hypot(...r); r = r.map((c) => c / rl);
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const k = (h / 2) / Math.tan((fov * Math.PI) / 360);
  return (p) => {
    const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
    const zc = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
    const xc = d[0] * r[0] + d[1] * r[1] + d[2] * r[2];
    const yc = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
    return [w / 2 + (xc * k) / zc, h / 2 - (yc * k) / zc, zc];
  };
}
function view(opts) {
  const { flip, w, h } = opts;
  const P = cam(opts);
  let s = "";
  const order = [...Array(M.m).keys()].sort((p, q) => M.edgeLoad[p] - M.edgeLoad[q]);
  let zmin = Infinity, zmax = -Infinity;
  for (let v = 0; v < M.n; v++) { const z = P(world(v, flip))[2]; zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); }
  for (const k of order) {
    const a = M.edgeA[k], b = M.edgeB[k];
    const A = world(a, flip), B = world(b, flip);
    const sagDir = flip ? 1 : -1;
    const pts = [];
    let zs = 0;
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const p = [B[0] + (A[0] - B[0]) * t, B[1] + (A[1] - B[1]) * t + sagDir * M.edgeSag[k] * 4 * t * (1 - t), B[2] + (A[2] - B[2]) * t];
      const q = P(p);
      zs += q[2];
      pts.push(q[0].toFixed(1) + "," + q[1].toFixed(1));
    }
    const depth = (zs / 15 - zmin) / (zmax - zmin);
    const l = Math.sqrt(M.edgeLoad[k] / M.maxEdgeLoad);
    const op = (0.13 + 0.8 * l) * (1 - 0.55 * depth);
    s += `<polyline points="${pts.join(" ")}" fill="none" stroke="#e9e6df" stroke-opacity="${op.toFixed(3)}" stroke-width="${(0.55 + 3.6 * l).toFixed(2)}" stroke-linecap="round"/>`;
  }
  const nodes = [...Array(M.n).keys()].sort((p, q) => P(world(q, flip))[2] - P(world(p, flip))[2]);
  for (const v of nodes) {
    const q = P(world(v, flip));
    const r = (M.radius[v] * (h / 2) / Math.tan((opts.fov * Math.PI) / 360)) / q[2];
    const fnd = M.foundation[v] === 1;
    s += `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="${Math.max(1.2, r).toFixed(1)}" fill="${fnd ? "#e9e6df" : "#0e1012"}" stroke="#e9e6df" stroke-width="1"/>`;
  }
  // crown + spine
  const sp = M.spine.map((v) => P(world(v, flip)));
  s += `<polyline points="${sp.map((q) => q[0].toFixed(1) + "," + q[1].toFixed(1)).join(" ")}" fill="none" stroke="#3ea6ff" stroke-width="1.5"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" style="background:#0e1012;display:block">${s}</svg>`;
}
const W = 900, Hh = 560;
const C = [0, H / 2, 0];
const views = [
  view({ flip: false, w: W, h: Hh, fov: 34, eye: [0, H + 40, 12], target: [0, H, 0] }), // plan, oblique from above
  view({ flip: false, w: W, h: Hh, fov: 34, eye: [6, H * 0.45, 46], target: [0, H * 0.5, 0] }), // hanging side
  view({ flip: true, w: W, h: Hh, fov: 34, eye: [14, H * 0.45, 42], target: [0, H * 0.45, 0] }), // standing 3/4
  view({ flip: true, w: W, h: Hh, fov: 60, eye: [-8, 1.2, 1.5], target: [2, H * 0.8, 0] }), // inside, looking up
];
const html = `<html><body style="margin:0;background:#0e1012;display:grid;grid-template-columns:repeat(2,${W}px);gap:2px">${views.join("")}</body></html>`;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: W * 2 + 2, height: Hh * 2 + 2 } });
await page.setContent(html);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log("wrote", out);
