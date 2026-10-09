import { model, idx, standing, project, bbox, T } from "./proj.mjs";
import { solve } from "./solve.mjs";
const a = idx("src/analysis/analysis-service.ts"), b = idx("src/analysis/cache-key.ts");
for (const [framing, W, H, sa, sb, pitch, fov, yawPref] of [
  ["tall", 390, 844, [285, 96], [105, 246], 0.25, 36, 7.04],
  ["tall", 390, 844, [290, 100], [100, 250], 0.3, 36, 7.04],
]) {
  const st = standing(framing);
  const mid = st[a].map((x, i) => (x + st[b][i]) / 2);
  const r = solve(framing, W, H, [[st[a], sa], [st[b], sb]], { tx: mid[0], ty: mid[1], tz: mid[2], fov }, [yawPref, pitch, 40, 0.0, 0.5], { pitch, wPitch: 80000, yaw: yawPref, wYaw: 300 });
  const pr = project(r.values, framing, W, H);
  console.log(framing, "err", r.err.toFixed(1), "values", r.values.map((x) => +x.toFixed(3)).join(", "), "a", pr(st[a]).map(Math.round), "b", pr(st[b]).map(Math.round), "bbox", bbox(r.values, framing, W, H));
}
// Pull back and Act III / landing bboxes.
const H = model.maxLevel * model.levelHeight;
const cams = {
  "wide pull 58": ["wide", 1440, 900, [4.62, 0.16, 58, 0, H / 2 - 0.6, 0, 31, 0.3, 0.04]],
  "wide pull 60 ly0": ["wide", 1440, 900, [4.62, 0.16, 60, 0, H / 2 - 0.6, 0, 31, 0.3, 0.0]],
  "tall pull 82": ["tall", 390, 844, [6.18, 0.16, 82, 0, H / 2 - 0.6, 0, 38, 0, 0.06]],
  "tall pull 90": ["tall", 390, 844, [6.18, 0.16, 90, 0, H / 2 - 0.6, 0, 38, 0, 0.08]],
  "tall c1 84": ["tall", 390, 844, [5.92, 0.15, 84, 0, H / 2 - 0.6, 0, 38, 0, 0.12]],
  "tall c4 86": ["tall", 390, 844, [5.3, 0.18, 86, 0, H / 2 - 0.2, 0, 38, 0, 0.12]],
  "tall land 84": ["tall", 390, 844, [Math.PI * 1.5 + 0.42, 0.16, 84, 0, H / 2 - 0.6, 0, 38, 0, 0.45]],
  "tall land 96": ["tall", 390, 844, [Math.PI * 1.5 + 0.42, 0.16, 96, 0, H / 2 - 0.6, 0, 38, 0, 0.42]],
  "wide c1": ["wide", 1440, 900, [4.36, 0.15, 48, 0, H / 2 - 0.6, 0, 31, 0.3, 0.05]],
  "wide c4": ["wide", 1440, 900, [3.74, 0.18, 49, 0, H / 2 - 0.2, 0, 31, 0.3, 0.05]],
  "wide land": ["wide", 1440, 900, [Math.PI + 0.42, 0.14, 47, 0, H / 2 - 0.6, 0, 31, 0.3, 0.065]],
};
for (const [name, [framing, W, Hh, vals]] of Object.entries(cams)) console.log(name, "bbox", bbox(vals, framing, W, Hh));
