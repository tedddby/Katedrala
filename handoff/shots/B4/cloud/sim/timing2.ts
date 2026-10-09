const t0 = performance.now();
const m = await import("./plan.ts");
const t1 = performance.now();
const units = [1, 1.018, 1.136, 1.24, 1.43, 1.64];
const times = units.map((u) => { const a = performance.now(); m.planLabels(u); return (performance.now() - a).toFixed(2); });
const again = units.map((u) => { const a = performance.now(); m.planLabels(u); return (performance.now() - a).toFixed(3); });
console.log("module", (t1 - t0).toFixed(1), "ms; planLabels per unit", times.join(" "), "memo", again.join(" "));
for (const u of [1.018, 1.43, 1.64]) {
  const L = m.planLabels(u);
  console.log(u, [...L.members].map(([k, v]) => `${k}:${v.side}-${v.align}`).join(" "));
  console.log("   bays", [...L.bays].map(([k, v]) => `${k}:${v.x}-${v.row}`).join(" "));
}
