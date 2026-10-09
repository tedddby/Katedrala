// Prototype: member nudges + joint-aware bends + exhaustive per-bay label placement, evaluated at three sizes.
import { BAYS, PLAN, PLAN_MEMBERS } from "./plan.ts";
import { EDGES } from "./system.ts";

export const EM: Record<string, number> = { ApiGateway: 4.8473, CheckoutController: 7.7238, CheckoutService: 6.7485, OrderController: 6.2047, OrderService: 5.2294, OrderRepository: 6.6008, AuthService: 4.8169, SessionStore: 5.2954, InvoiceService: 5.8267, PaymentService: 6.4554, PaymentRepository: 7.8268, StripeClient: 4.7156, UserService: 4.8286, UserRepository: 6.2, Database: 3.7954, EventBus: 3.8462 };
const BAY_EM = 0.6891;
const R = 6.5; // joint radius
export const SIZES = [
  { member: 12.5, bay: 11.2, unit: 1.018, weight: 1 },
  { member: 15.73, bay: 15.73, unit: 1.43, weight: 0.6 },
  { member: 18, bay: 18, unit: 1.64, weight: 0.3 },
];
type Pt = { x: number; y: number };
type Box = { l: number; t: number; r: number; b: number };
export const OPTIONS = ["below-middle", "above-middle", "below-start", "below-end", "above-start", "above-end", "right", "left"] as const;
type Opt = (typeof OPTIONS)[number];
const PREF: Record<Opt, number> = { "below-middle": 0, "above-middle": 0.3, "below-start": 0.6, "below-end": 0.6, "above-start": 0.9, "above-end": 0.9, right: 1.2, left: 1.2 };
const CORNERS = [ { x: "start", row: "top", pref: 0 }, { x: "end", row: "top", pref: 0.1 }, { x: "start", row: "bottom", pref: 0.6 }, { x: "end", row: "bottom", pref: 0.7 } ] as const;

const base = new Map(PLAN_MEMBERS.map((m) => [m.id, { ...m, x: m.x - (m.id === "ApiGateway" ? -30 : 0) }]));
/** Members of each bay in their default order, left to right. */
export const DEFAULT_ORDER: Record<string, string[]> = Object.fromEntries(BAYS.map((b) => [b.id, [...b.members]]));

export function layout(nudge: Record<string, { dx?: number; dy?: number }>, overrides: Record<string, number> = {}, order: Record<string, string[]> = DEFAULT_ORDER) {
  const slot = new Map<string, number>();
  for (const bay of BAYS) (order[bay.id] ?? bay.members).forEach((id, j) => slot.set(id, bay.x + PLAN.bayPadding + 30 + j * PLAN.memberGap));
  const members = [...base.values()].map((m) => ({ ...m, x: slot.get(m.id)! + (nudge[m.id]?.dx ?? 0), y: m.y + (nudge[m.id]?.dy ?? 0) }));
  const pos = new Map(members.map((m) => [m.id, m]));
  const control = (a: Pt, b: Pt, bend: number) => { const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1; return { x: (a.x + b.x) / 2 - (dy / L) * bend, y: (a.y + b.y) / 2 + (dx / L) * bend }; };
  const pts = (a: Pt, b: Pt, bend: number, n = 64) => { const c = control(a, b, bend); const out: Pt[] = []; for (let i = 1; i < n; i++) { const t = i / n; out.push({ x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y }); } return out; };
  const clearance = (s: string, t: string, bend: number) => { let c = Infinity; for (const p of pts(pos.get(s)!, pos.get(t)!, bend)) for (const m of members) if (m.id !== s && m.id !== t) c = Math.min(c, Math.hypot(m.x - p.x, m.y - p.y) - R); return c; };
  const bendOf = (s: string, t: string) => {
    if (clearance(s, t, 0) >= 14) return 0;
    const a = pos.get(s)!, b = pos.get(t)!; const L = Math.hypot(b.x - a.x, b.y - a.y);
    const side = (m: Pt) => ((b.x - a.x) * (m.y - a.y) - (b.y - a.y) * (m.x - a.x)) / L;
    const offLine = (m: Pt) => { const tt = ((m.x - a.x) * (b.x - a.x) + (m.y - a.y) * (b.y - a.y)) / (L * L); return tt <= 0 || tt >= 1 ? Infinity : Math.abs(side(m)); };
    const nearest = members.filter((m) => m.id !== s && m.id !== t).reduce((best, m) => (offLine(m) < offLine(best) ? m : best));
    const over = control(a, b, 1).y < control(a, b, -1).y ? 1 : -1;
    const away = Math.abs(side(nearest)) < 1 ? over : -Math.sign(side(nearest));
    for (let size = 16; size <= 160; size += 8) for (const bend of [away * size, -away * size]) if (clearance(s, t, bend) >= 14) return bend;
    return 0;
  };
  const edges = EDGES.map((e) => ({ ...e, bend: overrides[`${e.source}>${e.target}`] ?? bendOf(e.source, e.target) }));
  return { members, pos, edges, control, clearance };
}

/** The drawn polyline of an edge at a unit (trimmed by the gap at both joints, as edgePath does). */
function drawn(L: ReturnType<typeof layout>, e: { source: string; target: string; bend: number }, unit: number): Pt[] {
  const a = L.pos.get(e.source)!, b = L.pos.get(e.target)!; const gap = R + 6 * unit;
  const trim = (p: Pt, q: Pt, s0: number, s1 = s0) => { const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1; return { a: { x: p.x + (dx / len) * s0, y: p.y + (dy / len) * s0 }, b: { x: q.x - (dx / len) * s1, y: q.y - (dy / len) * s1 } }; };
  if (e.bend === 0) { const t = trim(a, b, gap); return [t.a, t.b]; }
  const c = L.control(a, b, e.bend); const s = trim(a, c, gap).a; const en = trim(c, b, gap).b; const out: Pt[] = [];
  for (let i = 0; i <= 24; i++) { const t = i / 24; out.push({ x: (1 - t) ** 2 * s.x + 2 * (1 - t) * t * c.x + t * t * en.x, y: (1 - t) ** 2 * s.y + 2 * (1 - t) * t * c.y + t * t * en.y }); }
  return out;
}
/** Whether a segment enters a box (Liang-Barsky). */
function segBox(p: Pt, q: Pt, box: Box): boolean {
  let t0 = 0, t1 = 1; const dx = q.x - p.x, dy = q.y - p.y;
  const clip = (pp: number, qq: number) => { if (pp === 0) return qq >= 0; const r = qq / pp; if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } return true; };
  return clip(-dx, p.x - box.l) && clip(dx, box.r - p.x) && clip(-dy, p.y - box.t) && clip(dy, box.b - p.y) && t0 <= t1;
}
const grow = (b: Box, m: number): Box => ({ l: b.l - m, t: b.t - m, r: b.r + m, b: b.b + m });
const overlap = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

export function labelBox(at: Pt, id: string, opt: Opt, size: number): Box {
  const w = (EM[id] ?? id.length * 0.5) * size, h = 1.1406 * size;
  let top: number, l: number;
  const side = R + 0.5 * size;
  if (opt === "right" || opt === "left") { top = 0.34 * size - 0.8961 * size; l = opt === "right" ? side : -side - w; }
  else {
    const below = opt.startsWith("below");
    top = below ? 12.5 + 0.72 * size - 0.8961 * size : -14 - 0.25 * size - 0.8961 * size;
    const align = opt.split("-")[1];
    l = align === "middle" ? -w / 2 : align === "start" ? -4 : 4 - w;
  }
  return { l: at.x + l, t: at.y + top, r: at.x + l + w, b: at.y + top + h };
}
export function bayBox(bay: (typeof BAYS)[number], corner: (typeof CORNERS)[number], size: number): Box {
  const w = bay.name.length * BAY_EM * size;
  const l = corner.x === "start" ? bay.x + PLAN.labelInset : bay.x + bay.width - PLAN.labelInset - w;
  const baseline = corner.row === "top" ? bay.y + PLAN.labelTop + 0.8 * size : bay.y + bay.height - PLAN.labelTop - 0.2 * size;
  return { l, r: l + w, t: baseline - 1.0 * size, b: baseline + 0.18 * size };
}

export function place(L: ReturnType<typeof layout>, S: (typeof SIZES)[number]) {
  const lines = L.edges.map((e) => ({ e, poly: drawn(L, e, S.unit) }));
  const crossCount = (box: Box) => { let n = 0; const names: string[] = []; for (const { e, poly } of lines) { for (let i = 0; i + 1 < poly.length; i++) if (segBox(poly[i]!, poly[i + 1]!, box)) { n++; names.push(`${e.source}>${e.target}`); break; } } return { n, names }; };
  const result = new Map<string, Opt>(); const corners = new Map<string, (typeof CORNERS)[number]>(); let cost = 0; const issues: string[] = [];
  for (const bay of BAYS) {
    const own = L.members.filter((m) => m.module === bay.id);
    const inner: Box = { l: bay.x + 2, t: bay.y + 2, r: bay.x + bay.width - 2, b: bay.y + bay.height - 2 };
    // Unary costs.
    const unary = own.map((m) => OPTIONS.map((opt) => {
      const box = labelBox(m, m.id, opt, S.member); let c = PREF[opt]; const why: string[] = [];
      if (box.l < inner.l || box.r > inner.r || box.t < inner.t || box.b > inner.b) { c += 100; why.push("outside bay"); }
      const x = crossCount(grow(box, 1.5)); c += 10 * x.n; if (x.n) why.push(`crossed by ${x.names.join(",")}`);
      for (const o of own) if (o !== m) { const ring = R + 4 * S.unit + 2; if (overlap(grow(box, 1), { l: o.x - ring, t: o.y - ring, r: o.x + ring, b: o.y + ring })) { c += 50; why.push(`over ${o.id}`); } }
      return { opt, c, box, why };
    }));
    const cornerCosts = CORNERS.map((corner) => { const box = bayBox(bay, corner, S.bay); const x = crossCount(grow(box, 1.5)); let c = corner.pref + 10 * x.n; const why = x.n ? [`bay name crossed by ${x.names.join(",")}`] : []; for (const m of L.members) { const ring = R + 4 * S.unit + 2; if (overlap(grow(box, 1), { l: m.x - ring, t: m.y - ring, r: m.x + ring, b: m.y + ring })) { c += 50; why.push(`bay name over ${m.id}`); } } return { corner, c, box, why }; });
    let best: { c: number; picks: number[]; corner: number } | undefined;
    const k = own.length; const combos = 8 ** k;
    for (let ci = 0; ci < 4; ci++) for (let code = 0; code < combos; code++) {
      const picks: number[] = []; let x = code; for (let i = 0; i < k; i++) { picks.push(x % 8); x = Math.floor(x / 8); }
      let c = cornerCosts[ci]!.c;
      for (let i = 0; i < k; i++) { const u = unary[i]![picks[i]!]!; c += u.c; if (overlap(grow(u.box, 1), cornerCosts[ci]!.box)) c += 50; for (let j = i + 1; j < k; j++) if (overlap(grow(u.box, 2), unary[j]![picks[j]!]!.box)) c += 50; }
      if (!best || c < best.c - 1e-9) best = { c, picks, corner: ci };
    }
    corners.set(bay.id, CORNERS[best!.corner]!);
    own.forEach((m, i) => { const u = unary[i]![best!.picks[i]!]!; result.set(m.id, u.opt); for (const w of u.why) issues.push(`${m.id} ${u.opt}: ${w}`); });
    for (const w of cornerCosts[best!.corner]!.why) issues.push(`${bay.name}: ${w}`);
    cost += best!.c;
  }
  return { labels: result, corners, cost, issues };
}

export function evaluate(nudge: Record<string, { dx?: number; dy?: number }>, verbose = false, overrides: Record<string, number> = {}, order: Record<string, string[]> = DEFAULT_ORDER) {
  const L = layout(nudge, overrides, order);
  let total = 0; const all: string[] = [];
  for (const S of SIZES) { const p = place(L, S); total += S.weight * p.issues.filter((i) => !i.includes("outside")).length * 10 + S.weight * p.cost * 0.01; if (verbose) { all.push(`size ${S.member}: cost ${p.cost.toFixed(1)}`); for (const i of p.issues) all.push("   " + i); all.push("   labels " + [...p.labels].map(([k, v]) => `${k}:${v}`).join(" ")); all.push("   corners " + [...p.corners].map(([k, v]) => `${k}:${v.x}-${v.row}`).join(" ")); } }
  if (verbose) all.push("bends " + L.edges.filter((e) => e.bend).map((e) => `${e.source}>${e.target}:${e.bend}`).join(" "));
  return { total, report: all.join("\n"), L };
}

if (process.argv[2] === "now") {
  const r = evaluate({ ApiGateway: { dx: -30 } }, true);
  console.log(r.report);
}

/** Edge-edge crossings (proper intersections of the drawn curves) and near runs (two edges closer than 5 units for
 * more than 24 units of length), at unit 1. */
export function edgeCrossings(L: ReturnType<typeof layout>) {
  const polys = L.edges.map((e) => ({ e, poly: drawn(L, e, 1.018) }));
  const segX = (p: Pt, q: Pt, r: Pt, s: Pt) => {
    const d = (q.x - p.x) * (s.y - r.y) - (q.y - p.y) * (s.x - r.x);
    if (Math.abs(d) < 1e-9) return false;
    const t = ((r.x - p.x) * (s.y - r.y) - (r.y - p.y) * (s.x - r.x)) / d;
    const u = ((r.x - p.x) * (q.y - p.y) - (r.y - p.y) * (q.x - p.x)) / d;
    return t > 0 && t < 1 && u > 0 && u < 1;
  };
  let crossings = 0; let near = 0; const pairs: string[] = [];
  for (let i = 0; i < polys.length; i++) for (let j = i + 1; j < polys.length; j++) {
    const A = polys[i]!.poly, B = polys[j]!.poly; let hit = false;
    for (let a = 0; a + 1 < A.length && !hit; a++) for (let b = 0; b + 1 < B.length && !hit; b++) if (segX(A[a]!, A[a + 1]!, B[b]!, B[b + 1]!)) hit = true;
    if (hit) crossings++;
    // Near run: sample A densely, measure distance to B's polyline.
    const dist = (p: Pt) => { let m = Infinity; for (let b = 0; b + 1 < B.length; b++) { const r = B[b]!, s2 = B[b + 1]!; const dx = s2.x - r.x, dy = s2.y - r.y; const t = Math.max(0, Math.min(1, ((p.x - r.x) * dx + (p.y - r.y) * dy) / (dx * dx + dy * dy || 1))); m = Math.min(m, Math.hypot(r.x + t * dx - p.x, r.y + t * dy - p.y)); } return m; };
    let run = 0, longest = 0;
    for (let a = 0; a + 1 < A.length; a++) { const p = A[a]!, q = A[a + 1]!; const len = Math.hypot(q.x - p.x, q.y - p.y); const steps = Math.max(1, Math.ceil(len / 4)); for (let k = 0; k < steps; k++) { const pt = { x: p.x + (q.x - p.x) * k / steps, y: p.y + (q.y - p.y) * k / steps }; if (dist(pt) < 5) { run += len / steps; longest = Math.max(longest, run); } else run = 0; } }
    const shared = [polys[i]!.e.source, polys[i]!.e.target].some((x) => x === polys[j]!.e.source || x === polys[j]!.e.target);
    if (longest > 24 && !shared) { near++; pairs.push(`${polys[i]!.e.source}>${polys[i]!.e.target} ~ ${polys[j]!.e.source}>${polys[j]!.e.target} (${longest.toFixed(0)})`); }
  }
  return { crossings, near, pairs };
}
