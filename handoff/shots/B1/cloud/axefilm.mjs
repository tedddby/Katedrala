// axe-core on the preview route at given Act I beats (film) and in still mode, 1440 and 390.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const runs = [
  { w: 1440, h: 900, reduced: false, t: 0 },
  { w: 1440, h: 900, reduced: false, t: 0.965 },
  { w: 1440, h: 900, reduced: true },
  { w: 390, h: 844, reduced: false, t: 0 },
  { w: 390, h: 844, reduced: false, t: 0.965 },
  { w: 390, h: 844, reduced: true },
];
for (const r of runs) {
  const mobile = r.w < 600;
  const page = await browser.newPage({ viewport: { width: r.w, height: r.h }, isMobile: mobile, hasTouch: mobile, reducedMotion: r.reduced ? "reduce" : "no-preference" });
  await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
  await page.waitForFunction(() => document.documentElement.dataset.kfilmLive !== undefined, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  if (!r.reduced && r.t !== undefined) {
    await page.evaluate((t) => { const f = window.__kfilm; const P = f.clock.progressOf(0, t); window.scrollTo({ top: f.trigger.start + P * (f.trigger.end - f.trigger.start), behavior: "instant" }); }, r.t);
    await page.waitForTimeout(2500);
  }
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () => {
    const res = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } });
    return { violations: res.violations.map((v) => `${v.impact} ${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), incomplete: res.incomplete.map((v) => `${v.id} (${v.nodes.length})`) };
  });
  console.log(`${r.w}x${r.h} ${r.reduced ? "still" : `film t ${r.t}`}: ${result.violations.length} violations`);
  for (const v of result.violations) console.log("  -", v);
  console.log("  needs review:", result.incomplete.join(", ") || "none");
  await page.close();
}
await browser.close();
