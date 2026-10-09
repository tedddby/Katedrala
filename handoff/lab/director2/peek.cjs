const fs = require("fs");
const doc = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const show = (o, depth = 0, pre = "") => {
  if (depth > 2 || o === null || typeof o !== "object") return;
  for (const [k, v] of Object.entries(o)) {
    const t = Array.isArray(v) ? `array(${v.length})` : typeof v;
    console.log(`${pre}${k}: ${t}${typeof v !== "object" ? " = " + String(v).slice(0, 80) : ""}`);
    if (!Array.isArray(v)) show(v, depth + 1, pre + "  ");
  }
};
show(doc);
console.log(JSON.stringify(doc.relationships?.[0] ?? doc.edges?.[0], null, 1).slice(0, 1200));
