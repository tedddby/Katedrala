// Simplifies a found layout: drops bend overrides and nudges that are not needed to keep the crossing counts.
import { BAYS } from "./plan.ts";
import { layout, place, SIZES } from "./opt.ts";
const nudge0: Record<string, number> = JSON.parse(process.argv[2]!);
const over0: Record<string, number> = JSON.parse(process.argv[3]!);
const order: Record<string, string[]> = JSON.parse(process.argv[4]!);
function score(nudge: Record<string, number>, over: Record<string, number>) {
  const L = layout(Object.fromEntries(Object.entries(nudge).map(([k, v]) => [k, { dx: v }])), over, order);
  for (const bay of BAYS) {
    const own = L.members.filter((m) => m.module === bay.id).sort((a, b) => a.x - b.x);
    for (const m of own) if (m.x < bay.x + 34 || m.x > bay.x + bay.width - 34) return Infinity;
    for (let i = 1; i < own.length; i++) if (own[i]!.x - own[i - 1]!.x < 120) return Infinity;
  }
  for (const e of L.edges) { if (L.clearance(e.source, e.target, e.bend) < 14) return Infinity; const a = L.pos.get(e.source)!, b = L.pos.get(e.target)!; if (Math.abs(e.bend) > Math.hypot(b.x - a.x, b.y - a.y) / 3) return Infinity; }
  let n = 0; for (const S of SIZES) { const p = place(L, S); n += p.issues.length * (S.member === 12.5 ? 100 : S.member < 17 ? 10 : 1); }
  return n;
}
let nudge = { ...nudge0 }; let over = { ...over0 };
const target = score(nudge, over);
console.log("target", target);
// Bends: try deleting each override (computed bend), then straight, then smaller magnitudes.
for (const key of Object.keys(over)) {
  const v = over[key]!;
  const tries: (number | undefined)[] = [undefined, 0];
  for (let m = Math.abs(v) - 8; m > 0; m -= 8) tries.push(Math.sign(v) * m);
  for (const t of tries) {
    const o = { ...over }; if (t === undefined) delete o[key]; else o[key] = t;
    if (score(nudge, o) <= target) { over = o; console.log("bend", key, v, "->", t ?? "computed"); break; }
  }
}
// Nudges: try smaller magnitudes.
for (const id of Object.keys(nudge)) {
  const v = nudge[id]!;
  for (let m = 0; m < Math.abs(v); m += 4) { const n = { ...nudge, [id]: Math.sign(v) * m }; if (score(n, over) <= target) { nudge = n; if (m !== Math.abs(v)) console.log("nudge", id, v, "->", Math.sign(v) * m); break; } }
}
console.log("NUDGE", JSON.stringify(Object.fromEntries(Object.entries(nudge).filter(([, v]) => v !== 0))));
console.log("OVER", JSON.stringify(over));
console.log("final", score(nudge, over));
