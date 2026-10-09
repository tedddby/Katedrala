import { model, idx, standing, project, bbox } from "./proj.mjs";
import { solve } from "./solve.mjs";
const a = idx("src/analysis/analysis-service.ts"), b = idx("src/analysis/cache-key.ts");
for (const [framing, W, H, sa, sb, pitch, fov] of [
  ["wide", 1440, 900, [763, 160], [1094, 560], 0.18, 30],
  ["tall", 390, 844, [110, 120], [290, 300], 0.18, 34],
]) {
  const st = standing(framing);
  const mid = st[a].map((x, i) => (x + st[b][i]) / 2);
  for (const yawPref of [-0.4, 0, 0.4, 0.8, Math.PI / 2, Math.PI]) {
    const r = solve(framing, W, H, [[st[a], sa], [st[b], sb]], { tx: mid[0], ty: mid[1], tz: mid[2], fov }, [yawPref, pitch, 30, 0.2, 0.2], { pitch, wPitch: 50000, yaw: yawPref, wYaw: 200 });
    const pr = project(r.values, framing, W, H);
    console.log(framing, "yawPref", yawPref.toFixed(2), "err", r.err.toFixed(1), "values", r.values.map((x) => +x.toFixed(3)).join(", "), "a", pr(st[a]).map(Math.round), "b", pr(st[b]).map(Math.round), "bbox", bbox(r.values, framing, W, H));
  }
}
