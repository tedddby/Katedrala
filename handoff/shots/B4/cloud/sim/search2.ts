import { BAYS } from "./plan.ts";
import { evaluate, layout, place, SIZES } from "./opt.ts";
import { EDGES } from "./system.ts";

function score(nudge: Record<string, { dx?: number }>, overrides: Record<string, number>) {
  const L = layout(nudge, overrides);
  for (const bay of BAYS) {
    const own = L.members.filter((m) => m.module === bay.id).sort((a, b) => a.x - b.x);
    for (const m of own) if (m.x < bay.x + 34 || m.x > bay.x + bay.width - 34) return { s: Infinity, per: [] as number[] };
    for (let i = 1; i < own.length; i++) if (own[i]!.x - own[i - 1]!.x < 120) return { s: Infinity, per: [] as number[] };
  }
  // Every edge keeps 14 units from every joint it does not join, and bows at most a third of its length.
  for (const e of L.edges) {
    if (L.clearance(e.source, e.target, e.bend) < 14) return { s: Infinity, per: [] as number[] };
    const a = L.pos.get(e.source)!, b = L.pos.get(e.target)!;
    if (Math.abs(e.bend) > Math.hypot(b.x - a.x, b.y - a.y) / 3) return { s: Infinity, per: [] as number[] };
  }
  let s = 0; const per: number[] = [];
  for (const S of SIZES) { const p = place(L, S); const n = p.issues.filter((i) => !i.includes("outside")).length; const out = p.issues.filter((i) => i.includes("outside")).length; per.push(n); s += S.weight * (n * 10 + out * 30) + 0.001 * p.cost; }
  // Prefer gentle bends (relative to the edge's length) and members near their places.
  s += 0.5 * L.edges.reduce((sum, e) => { const a = L.pos.get(e.source)!, b = L.pos.get(e.target)!; return sum + Math.abs(e.bend) / Math.hypot(b.x - a.x, b.y - a.y); }, 0);
  s += 0.01 * Object.values(nudge).reduce((sum, n) => sum + Math.abs(n.dx ?? 0), 0);
  return { s, per };
}
const ids = ["ApiGateway","CheckoutController","CheckoutService","OrderController","OrderService","OrderRepository","AuthService","SessionStore","InvoiceService","PaymentService","PaymentRepository","StripeClient","UserService","UserRepository","Database","EventBus"];
let nudge: Record<string, { dx?: number }> = JSON.parse(process.argv[2] ?? '{"ApiGateway":{"dx":-30}}');
let overrides: Record<string, number> = {};
let best = score(nudge, overrides);
console.log("start", best.s.toFixed(3), best.per);
const steps = [-48, -40, -32, -24, -16, -8, 0, 8, 16, 24, 32, 40, 48];
const bends = [0, ...[16, 24, 32, 40, 48, 56, 64, 72, 80, 96, 112, 128].flatMap((b) => [b, -b])];
for (let round = 0; round < 10; round++) {
  let improved = false;
  for (const id of ids) {
    const current = nudge[id]?.dx ?? 0; let bestDx = current;
    for (const dx of steps) { if (dx === current) continue; const r = score({ ...nudge, [id]: { dx } }, overrides); if (r.s < best.s - 1e-6) { best = r; bestDx = dx; } }
    if (bestDx !== current) { nudge = { ...nudge, [id]: { dx: bestDx } }; improved = true; console.log(round, "nudge", id, bestDx, best.s.toFixed(3), best.per); }
  }
  for (const e of EDGES) {
    const key = `${e.source}>${e.target}`;
    const L = layout(nudge, overrides); const current = L.edges.find((x) => x.source === e.source && x.target === e.target)!.bend;
    let bestBend: number | undefined;
    for (const b of bends) { if (b === current) continue; const r = score(nudge, { ...overrides, [key]: b }); if (r.s < best.s - 1e-6) { best = r; bestBend = b; } }
    if (bestBend !== undefined) { overrides = { ...overrides, [key]: bestBend }; improved = true; console.log(round, "bend", key, bestBend, best.s.toFixed(3), best.per); }
  }
  if (!improved) break;
}
console.log("NUDGE", JSON.stringify(nudge));
console.log("OVERRIDES", JSON.stringify(overrides));
console.log(evaluate(nudge, true, overrides).report);
