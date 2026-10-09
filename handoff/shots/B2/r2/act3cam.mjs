import { model, idx, standing, project, bbox, T } from "./proj.mjs";
const ty = idx("src/graph/model/types.ts");
const path = ["src/app/page.tsx", "src/components/landing/landing-page.tsx", "src/components/landing/features.tsx", "src/components/landing/feature-mockups.tsx", "src/graph/model/types.ts"].map(idx);
for (const [framing, W, H, base] of [["wide", 1440, 900, 0], ["tall", 390, 844, Math.PI / 2]]) {
  const st = standing(framing);
  const sc = T.stillCamera(model, framing);
  console.log(framing, "types", st[ty].map((x) => x.toFixed(1)), "path", path.map((v) => st[v].map((x) => x.toFixed(1)).join(",")).join(" | "));
  for (const dy of [-0.4, -0.2, 0, 0.2, 0.42, 0.7, 1.0, 1.3, 1.6, 2.0]) {
    const yaw = base + Math.PI + dy;
    const vals = framing === "wide" ? [yaw, 0.14, 47, 0, 7.65, 0, 31, 0.3, 0.065] : [yaw, 0.14, 62, 0, 7.65, 0, 38, 0, -0.27];
    const pr = project(vals, framing, W, H);
    const pts = path.map((v) => pr(st[v]).map(Math.round));
    console.log(` yaw ${yaw.toFixed(2)} (pi+${dy}) bbox ${bbox(vals, framing, W, H)} path ${pts.map((p) => `${p[0]},${p[1]}@${p[2]}`).join(" ")}`);
  }
}
