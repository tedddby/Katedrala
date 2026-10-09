import { BAYS, MEMBER_LABELS, PLAN_MEMBERS } from "./plan.ts";
for (const b of BAYS) console.log(b.id, b.label, b.labelRow, Math.round(b.x), Math.round(b.y), Math.round(b.width));
for (const m of PLAN_MEMBERS) console.log(m.id, Math.round(m.x), Math.round(m.y), JSON.stringify(MEMBER_LABELS.get(m.id)));
