import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { InMemorySource } from "@katedrala/core";
import { analyzeStructure } from "@katedrala/engine";
const FIXTURES = "C:/Users/Awab/Desktop/PROJECTS/Katedrala/fixtures";
const OUT = "C:/Users/Awab/AppData/Local/Temp/claude/c--Users-Awab-Desktop-PROJECTS-Katedrala/f7609e3b-1ca5-4e98-a818-ae87ef209574/scratchpad/probe2/pairs.out.txt";
function fixtureSource(name: string): InMemorySource {
  const files: Record<string, Uint8Array> = {};
  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(directory, entry.name), path);
      else if (prefix !== "" || (entry.name !== "README.md" && entry.name !== "expected.json")) files[path] = readFileSync(join(directory, entry.name));
    }
  };
  walk(join(FIXTURES, name), "");
  return new InMemorySource({ files });
}
it("pairs", async () => {
  const out: string[] = [];
  for (const name of ["layered-architecture", "dependency-violations"]) {
    const { model } = await analyzeStructure({ source: fixtureSource(name), cache: false, concurrency: 1 });
    const p = model.projection({ level: "file", fileRoles: new Set(["source"]) });
    out.push(`=== ${name}`);
    for (let u = 0; u < p.nodes.length; u++) {
      for (let i = p.graph.outOffsets[u]; i < p.graph.outOffsets[u + 1]; i++) {
        const info = p.edgeInfoAt(i);
        out.push(`${p.nodes[u].slice(5)} -> ${p.nodes[p.graph.outTargets[i]].slice(5)} ${info.runtimeEdgeCount > 0 ? "run" : "type"} ${JSON.stringify(info.kindCounts)}`);
      }
    }
  }
  writeFileSync(OUT, out.join("\n"));
});
