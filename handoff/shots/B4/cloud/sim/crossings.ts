// Label crossings in the explorer's member plan, per scale, with measured name widths (em per name).
import { BAYS, MEMBER_LABELS, PLAN, PLAN_EDGES, PLAN_MEMBERS, MEMBER_JOINT_RADIUS, LABEL_ALIGN_INSET, edgeControl } from "./plan.ts";
// Measured in Edge at 12.5 px: width / font size.
const EM: Record<string, number> = {
  ApiGateway: 60.59 / 12.5, CheckoutController: 96.55 / 12.5, CheckoutService: 84.36 / 12.5, OrderController: 77.56 / 12.5,
  OrderService: 65.37 / 12.5, OrderRepository: 82.51 / 12.5, AuthService: 60.21 / 12.5, SessionStore: 66.19 / 12.5,
  InvoiceService: 72.83 / 12.5, PaymentService: 80.69 / 12.5, PaymentRepository: 97.83 / 12.5, StripeClient: 58.95 / 12.5,
  UserService: 60.36 / 12.5, UserRepository: 77.5 / 12.5, Database: 47.44 / 12.5, EventBus: 48.08 / 12.5,
};
const BAY_EM = 0.6891; // per letter, Martian Mono capitals with tracking
const SCALES = [ { member: 12.5, bay: 11.2, unit: 1.018 }, { member: 15.73, bay: 15.73, unit: 1.43 }, { member: 18, bay: 18, unit: 1.64 } ];
const pos = new Map(PLAN_MEMBERS.map((m) => [m.id, m]));
type Box = { l: number; t: number; r: number; b: number; name: string };
function memberBox(id: string, size: number): Box {
  const m = pos.get(id)!; const lab = MEMBER_LABELS.get(id)!; const w = EM[id]! * size;
  // Glyph box from getBBox at 12.5: below y 10.3..24.56 (dy .72em from y 12.5), above -28.33..-14.07.
  const top = lab.side === "below" ? 12.5 + 0.72 * size - 0.896 * size : -14 - 0.25 * size - 0.896 * size;
  const [l, r] = lab.align === "middle" ? [-w / 2, w / 2] : lab.align === "start" ? [-LABEL_ALIGN_INSET, w - LABEL_ALIGN_INSET] : [LABEL_ALIGN_INSET - w, LABEL_ALIGN_INSET];
  return { l: m.x + l, r: m.x + r, t: m.y + top, b: m.y + top + 1.141 * size, name: id };
}
function bayBox(bay: (typeof BAYS)[number], size: number): Box {
  const w = bay.name.length * BAY_EM * size;
  const left = bay.label === "start" ? bay.x + PLAN.labelInset : bay.x + bay.width - PLAN.labelInset - w;
  // text y = top: bay.y + labelTop with dy .8em (baseline), glyph top ~ baseline - 0.75em (caps), bottom: baseline + 0.05em
  const baseline = bay.labelRow === "top" ? bay.y + PLAN.labelTop + 0.8 * size : bay.y + bay.height - PLAN.labelTop - 0.2 * size;
  return { l: left, r: left + w, t: baseline - 0.78 * size, b: baseline + 0.05 * size, name: bay.name.toUpperCase() };
}
function samples(e: (typeof PLAN_EDGES)[number], unit: number) {
  const a = pos.get(e.source)!; const b = pos.get(e.target)!; const c = edgeControl(a, b, e.bend);
  const gap = MEMBER_JOINT_RADIUS + 6 * unit; const pts = [];
  for (let i = 1; i < 400; i++) { const t = i / 400; const x = (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x; const y = (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y;
    if (Math.hypot(x - a.x, y - a.y) > gap && Math.hypot(x - b.x, y - b.y) > gap) pts.push({ x, y }); }
  return pts;
}
let total = 0;
for (const s of SCALES) {
  const boxes = [...PLAN_MEMBERS.map((m) => memberBox(m.id, s.member)), ...BAYS.map((b) => bayBox(b, s.bay))];
  const hits: string[] = [];
  for (const e of PLAN_EDGES) {
    const pts = samples(e, s.unit);
    for (const box of boxes) {
      const n = pts.filter((p) => p.x > box.l + 0.5 && p.x < box.r - 0.5 && p.y > box.t + 0.5 && p.y < box.b - 0.5).length;
      if (n > 0) hits.push(`${e.source}>${e.target} through ${box.name} (${n})`);
    }
  }
  total += hits.length;
  console.log(`scale ${s.member}: ${hits.length}`); for (const h of hits) console.log("   ", h);
}
console.log("total", total);
