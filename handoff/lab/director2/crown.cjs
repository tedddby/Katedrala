const fs = require("fs");
const g = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const f = g.files, src = (i) => f[i][2] === 0;
const idx = new Map(f.map((x, i) => [x[0], i]));
const out = f.map(() => []);
for (const e of g.edges) if (e[3] === 1 && src(e[0]) && src(e[1])) out[e[0]].push(e[1]);
const found = new Set(g.foundations);
const c = idx.get("src/app/page.tsx");
const seen = new Set(); const st = [c];
while (st.length) { const u = st.pop(); for (const w of out[u]) if (!seen.has(w) && w !== c) { seen.add(w); st.push(w); } }
console.log("crown level", f[c][5], "direct", new Set(out[c]).size, "supports", seen.size, "foundations", [...seen].filter((v) => found.has(v)).length);
console.log("entries", g.entries.length, "foundations", g.foundations.length);
