import { model, idx, standing, project, bbox, T } from "./proj.mjs";
import { solve } from "./solve.mjs";
const a = idx("src/analysis/analysis-service.ts"), b = idx("src/analysis/cache-key.ts");
const cases = [
  ["wide", 1440, 900, [770, 165], [1100, 560], 0.2, 30, 5.26],
  ["wide", 1440, 900, [770, 165], [1100, 560], 0.3, 30, 5.26],
  ["wide", 1440, 900, [760, 150], [1120, 600], 0.15, 32, 5.2],
  ["tall", 390, 844, [110, 120], [290, 300], 0.2, 34, 7.03],
  ["tall", 390, 844, [100, 130], [290, 300], 0.3, 34, 6.6],
  ["tall", 390, 844, [100, 130], [290, 300], 0.25, 34, 6.2],
];
for (const [framing, W, H, sa, sb, pitch, fov, yawPref] of cases) {
  const st = standing(framing);
  const mid = st[a].map((x, i) => (x + st[b][i]) / 2);
  const r = solve(framing, W, H, [[st[a], sa], [st[b], sb]], { tx: mid[0], ty: mid[1], tz: mid[2], fov }, [yawPref, pitch, 35, 0.2, 0.2], { pitch, wPitch: 80000, yaw: yawPref, wYaw: 300 });
  const pr = project(r.values, framing, W, H);
  console.log(framing, "err", r.err.toFixed(1), "values", r.values.map((x) => +x.toFixed(3)).join(", "), "a", pr(st[a]).map(Math.round), "b", pr(st[b]).map(Math.round), "bbox", bbox(r.values, framing, W, H));
}
