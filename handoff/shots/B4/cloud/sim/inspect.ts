import { evaluate } from "./opt.ts";
const nudge = Object.fromEntries(Object.entries(JSON.parse(process.argv[2]!)).map(([k, v]) => [k, { dx: v as number }]));
const over = JSON.parse(process.argv[3] ?? "{}");
console.log(evaluate(nudge, true, over).report);
