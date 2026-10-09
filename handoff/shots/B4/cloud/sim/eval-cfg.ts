import { evaluate } from "./anneal3.ts";
const cfg = JSON.parse(process.argv[2]!);
const r = await evaluate(cfg);
console.log(r.s.toFixed(2), JSON.stringify(r.per));
if (r.m) { for (const u of [1.018, 1.24, 1.43, 18 / 11]) console.log(u.toFixed(3), r.m.__issues(u).join("; ")); console.log(JSON.stringify(r.m.__edgeStats())); }
