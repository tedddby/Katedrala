// Seals a baseline folder: manifest.sha256 (checkable with `sha256sum -c manifest.sha256` from the folder) and
// manifest.json (path, bytes, sha256, created and modified times). The two manifest files list everything else.
// Usage: node manifest.mjs <baselineDir>
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(process.argv[2]);
const SKIP = new Set(["manifest.sha256", "manifest.json"]);
const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (!SKIP.has(relative(root, path))) files.push(path);
  }
};
walk(root);
files.sort();
const local = (d) => {
  const offset = -d.getTimezoneOffset();
  const t = new Date(d.getTime() + offset * 60000).toISOString().slice(0, 19);
  const sign = offset >= 0 ? "+" : "-";
  return `${t}${sign}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0")}:${String(Math.abs(offset) % 60).padStart(2, "0")}`;
};
const rows = files.map((path) => {
  const data = readFileSync(path);
  const st = statSync(path);
  return {
    path: relative(root, path).split("\\").join("/"),
    bytes: st.size,
    sha256: createHash("sha256").update(data).digest("hex"),
    created: local(st.birthtime),
    modified: local(st.mtime),
  };
});
writeFileSync(join(root, "manifest.sha256"), rows.map((r) => `${r.sha256}  ${r.path}`).join("\n") + "\n");
const byTop = {};
for (const r of rows) {
  const top = r.path.includes("/") ? r.path.slice(0, r.path.indexOf("/")) : "(root)";
  byTop[top] ??= { files: 0, bytes: 0, firstCreated: r.created, lastCreated: r.created };
  const g = byTop[top];
  g.files += 1;
  g.bytes += r.bytes;
  if (r.created < g.firstCreated) g.firstCreated = r.created;
  if (r.created > g.lastCreated) g.lastCreated = r.created;
}
writeFileSync(
  join(root, "manifest.json"),
  `${JSON.stringify({ sealed: local(new Date()), files: rows.length, bytes: rows.reduce((s, r) => s + r.bytes, 0), groups: byTop, rows }, null, 2)}\n`,
);
console.log(`${rows.length} files sealed`);
for (const [k, g] of Object.entries(byTop)) console.log(`${k.padEnd(18)} ${String(g.files).padStart(4)} files ${String(Math.round(g.bytes / 1024)).padStart(7)} KB created ${g.firstCreated} .. ${g.lastCreated}`);
