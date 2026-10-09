import { BAYS, PLAN_MEMBERS, PLAN_EDGES, MEMBER_LABELS, labelCost, bayNameBox, edgesThrough, memberLabelBox, CORNERS, LABEL_CHOICES, SCALES } from "./plan.ts";
const bayId = process.argv[2] ?? "gateway";
const bay = BAYS.find((b) => b.id === bayId)!;
const own = PLAN_MEMBERS.filter((m) => m.module === bay.id);
for (const { corner, preference } of CORNERS) {
  const nameCost = SCALES.map((s) => edgesThrough(bayNameBox(bay, corner, s.bay), s.unit));
  console.log("corner", JSON.stringify(corner), "pref", preference, "name crossings", nameCost.join("/"));
  for (const m of own) {
    const costs = LABEL_CHOICES.map(({ label, preference: p }) => `${label.side}-${label.align}:${(labelCost(m, label, bay, corner, MEMBER_LABELS) + p).toFixed(2)}`);
    console.log("   ", m.id, costs.join("  "));
  }
}
