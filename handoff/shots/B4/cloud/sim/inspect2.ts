import { evaluate } from "./opt.ts";
const nudge = Object.fromEntries(Object.entries(JSON.parse(process.argv[2]!)).map(([k, v]) => [k, { dx: v as number }]));
const over = JSON.parse(process.argv[3] ?? "{}");
const order = JSON.parse(process.argv[4] ?? "null") ?? undefined;
const r = evaluate(nudge, true, over, order);
console.log(r.report);
console.log("positions", r.L.members.map((m) => `${m.id}:${Math.round(m.x)}`).join(" "));
