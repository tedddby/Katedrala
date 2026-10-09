const t0 = performance.now();
const m = await import("./plan.ts");
const t1 = performance.now();
console.log("plan.ts module evaluation ms", (t1 - t0).toFixed(1), m.PLAN_MEMBERS.length);
