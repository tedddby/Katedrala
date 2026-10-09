
export function __issues(unit: number) {
  const labels = planLabels(unit);
  const size = memberNameSize(unit);
  const baySize = bayNameSize(unit);
  const edges = drawnEdges(unit);
  const list: string[] = [];
  const boxes: { name: string; box: Box; bay: string }[] = [];
  for (const m of members) {
    const box = nameBox(m, m.id, labels.members.get(m.id)!, size);
    boxes.push({ name: m.id, box, bay: m.module });
    const n = crossings(grow(box, 1.5), edges);
    if (n) list.push(`${m.id} crossed x${n}`);
    const bay = BAYS.find((b) => b.id === m.module)!;
    const inside = grow({ l: bay.x, t: bay.y, r: bay.x + bay.width, b: bay.y + bay.height }, -2);
    if (box.l < inside.l || box.r > inside.r || box.t < inside.t || box.b > inside.b) list.push(`${m.id} outside`);
  }
  for (const bay of BAYS) {
    const box = bayNameBox(bay, labels.bays.get(bay.id)!, baySize);
    boxes.push({ name: bay.name.toUpperCase(), box, bay: bay.id });
    const n = crossings(grow(box, 1.5), edges);
    if (n) list.push(`${bay.name} crossed x${n}`);
  }
  const apartX = size;
  const apartY = size / 3;
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      if (boxes[i]!.bay === boxes[j]!.bay && overlaps(grow(boxes[i]!.box, apartX, apartY), boxes[j]!.box))
        list.push(`${boxes[i]!.name} near ${boxes[j]!.name}`);
  return list;
}
export function __valid() {
  for (const bay of BAYS) {
    const own = members.filter((m) => m.module === bay.id).sort((a, b) => a.x - b.x);
    for (const m of own) if (m.x < bay.x + 34 || m.x > bay.x + bay.width - 34) return `${m.id} off its bay`;
    for (let i = 1; i < own.length; i++) if (own[i]!.x - own[i - 1]!.x < 120) return `${own[i]!.id} too close`;
  }
  for (const e of PLAN_EDGES) {
    if (clearance(e.source, e.target, e.bend) < EDGE_CLEARANCE) return `${e.source}>${e.target} near a joint`;
    const a = positionOf.get(e.source)!;
    const b = positionOf.get(e.target)!;
    if (Math.abs(e.bend) > Math.hypot(b.x - a.x, b.y - a.y) / 3) return `${e.source}>${e.target} bends too far`;
  }
  return "";
}
export function __edgeStats() {
  const runs = drawnEdges(1.018).map((r) => r.slice(0, -3));
  const segX = (p: Point, q: Point, r: Point, s: Point) => {
    const d = (q.x - p.x) * (s.y - r.y) - (q.y - p.y) * (s.x - r.x);
    if (Math.abs(d) < 1e-9) return false;
    const t = ((r.x - p.x) * (s.y - r.y) - (r.y - p.y) * (s.x - r.x)) / d;
    const u = ((r.x - p.x) * (q.y - p.y) - (r.y - p.y) * (q.x - p.x)) / d;
    return t > 0 && t < 1 && u > 0 && u < 1;
  };
  let crossingsCount = 0;
  let near = 0;
  const pairs: string[] = [];
  for (let i = 0; i < runs.length; i++)
    for (let j = i + 1; j < runs.length; j++) {
      const A = runs[i]!;
      const B = runs[j]!;
      let hit = false;
      for (let a = 0; a + 1 < A.length && !hit; a++)
        for (let b = 0; b + 1 < B.length && !hit; b++) if (segX(A[a]!, A[a + 1]!, B[b]!, B[b + 1]!)) hit = true;
      if (hit) crossingsCount++;
      const ei = PLAN_EDGES[i]!;
      const ej = PLAN_EDGES[j]!;
      const shared = [ei.source, ei.target].some((x) => x === ej.source || x === ej.target);
      if (shared) continue;
      const bb = (R: Point[]) => R.reduce((o, p) => ({ l: Math.min(o.l, p.x), t: Math.min(o.t, p.y), r: Math.max(o.r, p.x), b: Math.max(o.b, p.y) }), { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity });
      if (!overlaps(grow(bb(A), 6), bb(B))) continue;
      const dist = (p: Point) => {
        let m = Infinity;
        for (let b = 0; b + 1 < B.length; b++) {
          const r = B[b]!;
          const s2 = B[b + 1]!;
          const dx = s2.x - r.x;
          const dy = s2.y - r.y;
          const t = Math.max(0, Math.min(1, ((p.x - r.x) * dx + (p.y - r.y) * dy) / (dx * dx + dy * dy || 1)));
          m = Math.min(m, Math.hypot(r.x + t * dx - p.x, r.y + t * dy - p.y));
        }
        return m;
      };
      let run = 0;
      let longest = 0;
      for (let a = 0; a + 1 < A.length; a++) {
        const p = A[a]!;
        const q = A[a + 1]!;
        const len = Math.hypot(q.x - p.x, q.y - p.y);
        const steps = Math.max(1, Math.ceil(len / 4));
        for (let k = 0; k < steps; k++) {
          const pt = { x: p.x + ((q.x - p.x) * k) / steps, y: p.y + ((q.y - p.y) * k) / steps };
          if (dist(pt) < 6) {
            run += len / steps;
            longest = Math.max(longest, run);
          } else run = 0;
        }
      }
      if (longest > 24) {
        near++;
        pairs.push(`${ei.source}>${ei.target} ~ ${ej.source}>${ej.target}`);
      }
    }
  return { crossings: crossingsCount, near, pairs };
}
