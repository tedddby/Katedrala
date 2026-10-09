import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const REPO = "C:/Users/Awab/Desktop/PROJECTS/Katedrala";
const packagesDir = join(REPO, "packages");
const alias = {};
for (const dir of readdirSync(packagesDir)) {
  const manifestPath = join(packagesDir, dir, "package.json");
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const entry = join(packagesDir, dir, "src", "index.ts");
  if (manifest.name && existsSync(entry)) alias[manifest.name] = entry;
}
export default {
  root: REPO,
  resolve: { alias },
  test: {
    dir: "C:/Users/Awab/AppData/Local/Temp/claude/c--Users-Awab-Desktop-PROJECTS-Katedrala/f7609e3b-1ca5-4e98-a818-ae87ef209574/scratchpad/probe2",
    include: ["**/*.probe.ts"],
    globals: true,
    environment: "node",
    testTimeout: 600000,
  },
};
