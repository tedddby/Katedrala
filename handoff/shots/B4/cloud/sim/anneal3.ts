// Simulated annealing over in-bay orders, member nudges and bend overrides, scored with the shipped plan code
// (plan-param.ts, rebuilt from site/lib/demo/plan.ts by make-param.py).
import { EDGES, NODES } from "./system.ts";
let counter = 0;
type Cfg = { order: Record<string, string[]>; nudge: Record<string, number>; bend: Record<string, number> };
const defaults = new Map<string, string[]>();
{
  (globalThis as any).__PLAN_CFG = { order: {}, nudge: {}, bend: {} };
  const m = await import(`./plan-param.ts?n=${counter++}`);
  for (const b of m.BAYS) defaults.set(b.id, [...b.members]);
}
const UNITS = [[1.018, 1], [1.24, 0.8], [1.43, 0.6], [18 / 11, 0.3]] as const;
export async function evaluate(cfg: Cfg) {
  (globalThis as any).__PLAN_CFG = cfg;
  const m = await import(`./plan-param.ts?n=${counter++}`);
  const invalid = m.__valid();
  if (invalid) return { s: Infinity, per: [invalid] as (number | string)[], m };
  let s = 0;
  const per: (number | string)[] = [];
  for (const [unit, w] of UNITS) { const issues = m.__issues(unit); per.push(issues.length); s += w * 10 * issues.length; }
  const es = m.__edgeStats(); per.push(es.crossings, es.near); s += 0.8 * es.crossings + 6 * es.near;
  const pos = new Map(m.PLAN_MEMBERS.map((x: any) => [x.id, x]));
  s += 0.5 * m.PLAN_EDGES.reduce((sum: number, e: any) => { const a: any = pos.get(e.source), b: any = pos.get(e.target); return sum + Math.abs(e.bend) / Math.hypot(b.x - a.x, b.y - a.y); }, 0);
  s += 0.01 * Object.values(cfg.nudge).reduce((sum, n) => sum + Math.abs(n), 0);
  s += 0.5 * Object.entries(cfg.order).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(defaults.get(k))).length;
  return { s, per, m };
}
if (process.argv[1]!.endsWith("anneal3.ts")) {
  let seed = Number(process.argv[2] ?? 7);
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const ids = NODES.map((n) => n.id);
  const keys = EDGES.map((e) => `${e.source}>${e.target}`);
  const multi = [...defaults].filter(([, v]) => v.length > 1).map(([k]) => k);
  let cfg: Cfg = JSON.parse(process.argv[3] ?? '{"order":{},"nudge":{"ApiGateway":-30},"bend":{}}');
  let cur = await evaluate(cfg);
  let best = { s: cur.s, per: cur.per, cfg: structuredClone(cfg) };
  console.log("start", cur.s.toFixed(2), JSON.stringify(cur.per));
  const iters = Number(process.argv[4] ?? 3000);
  for (let i = 0; i < iters; i++) {
    const T = 20 * Math.pow(0.002, i / iters);
    const next: Cfg = structuredClone(cfg);
    const moves = 1 + Math.floor(rand() * 2);
    for (let k = 0; k < moves; k++) {
      const pick = rand();
      if (pick < 0.12) {
        const bay = multi[Math.floor(rand() * multi.length)]!;
        const list = next.order[bay] ?? [...defaults.get(bay)!];
        const a = Math.floor(rand() * list.length); const b = (a + 1 + Math.floor(rand() * (list.length - 1))) % list.length;
        [list[a], list[b]] = [list[b]!, list[a]!];
        if (JSON.stringify(list) === JSON.stringify(defaults.get(bay))) delete next.order[bay]; else next.order[bay] = list;
      } else if (pick < 0.6) {
        const id = ids[Math.floor(rand() * ids.length)]!;
        next.nudge[id] = Math.max(-56, Math.min(56, Math.round(((next.nudge[id] ?? 0) + (rand() - 0.5) * 48) / 4) * 4));
        if (next.nudge[id] === 0) delete next.nudge[id];
      } else {
        const key = keys[Math.floor(rand() * keys.length)]!;
        if (rand() < 0.25) delete next.bend[key]; else next.bend[key] = Math.round(((next.bend[key] ?? 0) + (rand() - 0.5) * 80) / 8) * 8;
      }
    }
    const r = await evaluate(next);
    if (r.s < cur.s || rand() < Math.exp((cur.s - r.s) / T)) { cfg = next; cur = r; if (r.s < best.s) best = { s: r.s, per: r.per, cfg: structuredClone(next) }; }
    if (i % 250 === 0) console.log(i, T.toFixed(2), cur.s.toFixed(2), JSON.stringify(cur.per), "best", best.s.toFixed(2), JSON.stringify(best.per));
  }
  console.log("BEST", best.s.toFixed(3), JSON.stringify(best.per));
  console.log("CFG", JSON.stringify(best.cfg));
}
