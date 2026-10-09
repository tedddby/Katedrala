import { model, idx, standing, project, bbox, T } from "./proj.mjs";
const a = idx("src/analysis/analysis-service.ts"), b = idx("src/analysis/cache-key.ts");
for (const framing of ["wide", "tall"]) {
  const [W, H] = framing === "wide" ? [1440, 900] : [390, 844];
  const keys = T.hangCameraKeys(model, framing);
  const last = keys[keys.length - 1].slice(1);
  const pr = project(last, framing, W, H);
  const st = standing(framing);
  console.log(framing, "crown hold end: a", pr(st[a]).map(Math.round), "b", pr(st[b]).map(Math.round), "bbox", bbox(last, framing, W, H));
  const still = T.stillCamera(model, framing);
  console.log(" still cam", still);
}
