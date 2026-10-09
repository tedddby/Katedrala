// Drops bend overrides and nudges a layout does not need: each is removed or shrunk if the score does not rise.
import { evaluate } from "./anneal5.ts";
let cfg = JSON.parse(process.argv[2]!);
const score = (c: any) => evaluate(c).s;
let target = score(cfg);
console.log("start", target.toFixed(3), JSON.stringify(evaluate(cfg).per));
for (const key of Object.keys(cfg.bend)) {
  const v = cfg.bend[key];
  const tries: (number | undefined)[] = [undefined, 0];
  for (let m = Math.abs(v) - 8; m > 0; m -= 8) tries.push(Math.sign(v) * m);
  for (const t of tries) {
    const c = structuredClone(cfg); if (t === undefined) delete c.bend[key]; else c.bend[key] = t;
    const s = score(c); if (s <= target + 1e-9) { cfg = c; target = s; break; }
  }
}
for (const id of Object.keys(cfg.nudge)) {
  const v = cfg.nudge[id];
  for (let m = 0; m < Math.abs(v); m += 4) { const c = structuredClone(cfg); if (m === 0) delete c.nudge[id]; else c.nudge[id] = Math.sign(v) * m; const s = score(c); if (s <= target + 1e-9) { cfg = c; target = s; break; } }
}
for (const bay of Object.keys(cfg.order)) { const c = structuredClone(cfg); delete c.order[bay]; const s = score(c); if (s <= target + 1e-9) { cfg = c; target = s; } }
const r = evaluate(cfg);
console.log("end", r.s.toFixed(3), JSON.stringify(r.per));
console.log("CFG", JSON.stringify(cfg));
for (const u of [1.018, 1.24, 1.43, 18 / 11]) console.log(u.toFixed(3), r.m.__issues(u).join("; "));
console.log(JSON.stringify(r.m.__edgeStats()));
console.log("bends", r.m.PLAN_EDGES.filter((e: any) => e.bend).map((e: any) => `${e.source}>${e.target}:${e.bend}`).join(" "));
