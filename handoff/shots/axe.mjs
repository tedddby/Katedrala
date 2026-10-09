// Runs axe-core (WCAG 2.2 A/AA rules) on a URL at desktop and mobile widths, after scrolling every section in.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const url = process.argv[2];
const browser = await chromium.launch({ channel: "msedge", headless: true });
for (const vp of [{ tag: "desktop", width: 1440, height: 900 }, { tag: "mobile", width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(url, { waitUntil: "networkidle" });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 500) { await page.evaluate((t) => window.scrollTo(0, t), y); await page.waitForTimeout(80); }
  await page.waitForTimeout(1500);
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } });
    return {
      violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => `${n.target.join(" ")} :: ${n.failureSummary?.split("\n").slice(1, 2).join(" ")}`), count: v.nodes.length })),
      incomplete: r.incomplete.map((v) => `${v.id} (${v.nodes.length})`),
    };
  });
  console.log(`== ${vp.tag}: ${result.violations.length} violation types`);
  for (const v of result.violations) {
    console.log(`- [${v.impact}] ${v.id}: ${v.help} (${v.count})`);
    for (const n of v.nodes) console.log(`    ${n}`);
  }
  console.log(`  needs review: ${result.incomplete.join(", ") || "none"}`);
  await page.close();
}
await browser.close();
