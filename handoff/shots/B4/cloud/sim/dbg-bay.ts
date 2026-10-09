import { BAYS, PLAN_MEMBERS, MEMBER_JOINT_RADIUS, nameBox, drawnEdges, crossings, LABEL_CHOICES, grow, overlaps, around, memberNameSize } from "./plan-dbg.ts";
const unit = Number(process.argv[2] ?? 1.64); const bayId = process.argv[3] ?? "orders";
const size = memberNameSize(unit); const edges = drawnEdges(unit); const ring = MEMBER_JOINT_RADIUS + 6 * unit;
const bay = BAYS.find((b) => b.id === bayId)!; const own = PLAN_MEMBERS.filter((m) => m.module === bayId);
const inside = grow({ l: bay.x, t: bay.y, r: bay.x + bay.width, b: bay.y + bay.height }, -2);
for (const m of own) {
  const row = LABEL_CHOICES.map(({ label, preference }) => {
    const box = nameBox(m, m.id, label, size); const x = crossings(grow(box, 1.5), edges);
    const out = box.l < inside.l || box.r > inside.r || box.t < inside.t || box.b > inside.b;
    const rings = own.filter((o) => o !== m && overlaps(grow(box, 1), around(o, ring))).map((o) => o.id);
    return `${label.side}-${label.align}: x${x}${out ? " OUT" : ""}${rings.length ? " ring:" + rings.join(",") : ""}`;
  });
  console.log(m.id, Math.round(m.x), "|", row.join(" | "));
}
console.log("bay", Math.round(bay.x), Math.round(bay.x + bay.width));
