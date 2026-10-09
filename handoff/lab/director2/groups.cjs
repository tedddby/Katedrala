const fs = require("fs");
const g = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const src = g.files.filter((f) => f[2] === 0);
const byGroup = {};
for (const f of src) { const k = g.groups[f[1]]; byGroup[k] = (byGroup[k] || 0) + 1; }
console.log("source files by group", byGroup);
const top = {};
for (const f of src) { const parts = f[0].split("/"); const k = parts[0] === "src" ? (parts.length > 2 ? "src/" + parts[1] : "src/(root)") : parts[0]; top[k] = (top[k] || 0) + 1; }
console.log("by real folder", top);
// level distribution
const lv = {}; for (const f of src) lv[f[5]] = (lv[f[5]] || 0) + 1; console.log("levels", lv);
