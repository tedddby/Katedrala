import { BAYS } from "./plan.ts";
import { evaluate, layout, place, SIZES } from "./opt.ts";

function score(nudge: Record<string, { dx?: number }>) {
  const L = layout(nudge);
  // Constraints: inside bay, spacing.
  for (const bay of BAYS) {
    const own = L.members.filter((m) => m.module === bay.id).sort((a, b) => a.x - b.x);
    for (const m of own) if (m.x < bay.x + 34 || m.x > bay.x + bay.width - 34) return { s: Infinity, per: [] as number[] };
    for (let i = 1; i < own.length; i++) if (own[i]!.x - own[i - 1]!.x < 120) return { s: Infinity, per: [] as number[] };
  }
  let s = 0; const per: number[] = [];
  for (const S of SIZES) { const p = place(L, S); const n = p.issues.filter((i) => !i.includes("outside")).length; const out = p.issues.filter((i) => i.includes("outside")).length; per.push(n); s += S.weight * (n * 10 + out * 30) + 0.001 * p.cost; }
  return { s, per };
}
const ids = ["ApiGateway","CheckoutController","CheckoutService","OrderController","OrderService","OrderRepository","AuthService","SessionStore","InvoiceService","PaymentService","PaymentRepository","StripeClient","UserService","UserRepository","Database","EventBus"];
let nudge: Record<string, { dx?: number }> = { ApiGateway: { dx: -30 } };
let best = score(nudge);
console.log("start", best.s.toFixed(3), best.per);
const steps = [-48, -40, -32, -24, -16, -8, 0, 8, 16, 24, 32, 40, 48];
for (let round = 0; round < 4; round++) {
  let improved = false;
  for (const id of ids) {
    const current = nudge[id]?.dx ?? 0;
    let bestDx = current;
    for (const dx of steps) {
      if (dx === current) continue;
      const trial = { ...nudge, [id]: { dx } };
      const r = score(trial);
      if (r.s < best.s - 1e-6) { best = r; bestDx = dx; }
    }
    if (bestDx !== current) { nudge = { ...nudge, [id]: { dx: bestDx } }; improved = true; console.log(round, id, bestDx, best.s.toFixed(3), best.per); }
  }
  if (!improved) break;
}
console.log(JSON.stringify(nudge));
console.log(evaluate(nudge, true).report);
