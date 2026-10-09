import { model, idx, standing, project, bbox, T } from "./proj.mjs";
import { solve } from "./solve.mjs";
const a = idx("src/analysis/analysis-service.ts"), b = idx("src/analysis/cache-key.ts");
const cases = [
  ["tall", 390, 844, [285, 120], [105, 300], 0.2, 34, 7.03],
  ["tall", 390, 844, [290, 110], [100, 310], 0.25, 36, 6.9],
  ["tall", 390, 844, [280, 110], [110, 300], 0.15, 34, 7.2],
];
for (const [framing, W, H, sa, sb, pitch, fov, yawPref] of cases) {
  const st = standing(framing);
  const mid = st[a].map((x, i) => (x + st[b][i]) / 2);
  const r = solve(framing, W, H, [[st[a], sa], [st[b], sb]], { tx: mid[0], ty: mid[1], tz: mid[2], fov }, [yawPref, pitch, 35, 0.0, 0.3], { pitch, wPitch: 80000, yaw: yawPref, wYaw: 300 });
  const pr = project(r.values, framing, W, H);
  console.log(framing, "err", r.err.toFixed(1), "values", r.values.map((x) => +x.toFixed(3)).join(", "), "a", pr(st[a]).map(Math.round), "b", pr(st[b]).map(Math.round), "bbox", bbox(r.values, framing, W, H));
}
