// Simulated annealing over member nudges and bend overrides, deterministic (seeded).
import { BAYS } from "./plan.ts";
import { DEFAULT_ORDER, edgeCrossings, evaluate, layout, place, SIZES } from "./opt.ts";
import { EDGES } from "./system.ts";

function score(nudge: Record<string, number>, overrides: Record<string, number>, order: Record<string, string[]>) {
  const N = Object.fromEntries(Object.entries(nudge).map(([k, v]) => [k, { dx: v }]));
  const L = layout(N, overrides, order);
  for (const bay of BAYS) {
    const own = L.members.filter((m) => m.module === bay.id).sort((a, b) => a.x - b.x);
    for (const m of own) if (m.x < bay.x + 34 || m.x > bay.x + bay.width - 34) return { s: Infinity, per: [] as number[] };
    for (let i = 1; i < own.length; i++) if (own[i]!.x - own[i - 1]!.x < 120) return { s: Infinity, per: [] as number[] };
  }
  for (const e of L.edges) {
    if (L.clearance(e.source, e.target, e.bend) < 14) return { s: Infinity, per: [] as number[] };
    const a = L.pos.get(e.source)!, b = L.pos.get(e.target)!;
    if (Math.abs(e.bend) > Math.hypot(b.x - a.x, b.y - a.y) / 3) return { s: Infinity, per: [] as number[] };
  }
  let s = 0; const per: number[] = [];
  for (const S of SIZES) { const p = place(L, S); const n = p.issues.filter((i) => !i.includes("outside")).length; const out = p.issues.filter((i) => i.includes("outside")).length; per.push(n); s += S.weight * (n * 10 + out * 30) + 0.001 * p.cost; }
  s += 0.5 * L.edges.reduce((sum, e) => { const a = L.pos.get(e.source)!, b = L.pos.get(e.target)!; return sum + Math.abs(e.bend) / Math.hypot(b.x - a.x, b.y - a.y); }, 0);
  s += 0.01 * Object.values(nudge).reduce((sum, n) => sum + Math.abs(n), 0);
  const ec = edgeCrossings(L); s += 0.8 * ec.crossings + 6 * ec.near; per.push(ec.crossings, ec.near);
  for (const [bay, list] of Object.entries(order)) if (JSON.stringify(list) !== JSON.stringify(DEFAULT_ORDER[bay])) s += 0.5;
  return { s, per };
}
let seed = Number(process.argv[2] ?? 7);
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const ids = ["ApiGateway","CheckoutController","CheckoutService","OrderController","OrderService","OrderRepository","AuthService","SessionStore","InvoiceService","PaymentService","PaymentRepository","StripeClient","UserService","UserRepository","Database","EventBus"];
const keys = EDGES.map((e) => `${e.source}>${e.target}`);
let nudge: Record<string, number> = JSON.parse(process.argv[3] ?? '{"ApiGateway":-30}');
let over: Record<string, number> = JSON.parse(process.argv[4] ?? '{}');
let order: Record<string, string[]> = JSON.parse(process.argv[6] ?? "null") ?? structuredClone(DEFAULT_ORDER);
let cur = score(nudge, over, order); let best = { ...cur, nudge: { ...nudge }, over: { ...over }, order: structuredClone(order) };
const iters = Number(process.argv[5] ?? 4000);
for (let i = 0; i < iters; i++) {
  const T = 20 * Math.pow(0.002, i / iters);
  const n2 = { ...nudge }; const o2 = { ...over }; const r2 = structuredClone(order);
  const moves = 1 + Math.floor(rand() * 2);
  for (let m = 0; m < moves; m++) {
    const pick = rand();
    if (pick < 0.12) { const bays = Object.keys(r2).filter((k) => r2[k]!.length > 1); const b = bays[Math.floor(rand() * bays.length)]!; const arr = r2[b]!; const i = Math.floor(rand() * arr.length); const j = (i + 1 + Math.floor(rand() * (arr.length - 1))) % arr.length; [arr[i], arr[j]] = [arr[j]!, arr[i]!]; }
    else if (pick < 0.6) { const id = ids[Math.floor(rand() * ids.length)]!; n2[id] = Math.round(((n2[id] ?? 0) + (rand() - 0.5) * 48) / 4) * 4; n2[id] = Math.max(-56, Math.min(56, n2[id]!)); }
    else { const k = keys[Math.floor(rand() * keys.length)]!; const r = rand(); if (r < 0.25) delete o2[k]; else o2[k] = Math.round(((o2[k] ?? 0) + (rand() - 0.5) * 80) / 8) * 8; }
  }
  const c = score(n2, o2, r2);
  if (c.s < cur.s || rand() < Math.exp((cur.s - c.s) / T)) { nudge = n2; over = o2; order = r2; cur = c; if (c.s < best.s) { best = { ...c, nudge: { ...n2 }, over: { ...o2 }, order: structuredClone(r2) }; } }
  if (i % 500 === 0) console.log(i, T.toFixed(2), cur.s.toFixed(2), cur.per, "best", best.s.toFixed(2), best.per);
}
console.log("BEST", best.s.toFixed(3), best.per);
console.log("NUDGE", JSON.stringify(best.nudge));
console.log("OVER", JSON.stringify(best.over));
console.log("ORDER", JSON.stringify(best.order));
