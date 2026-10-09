// axe-core on the film at the hero, E4, C4 and the landing (film), and on each act's block (still), 1440 and 390.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const browser = await chromium.launch({ channel: "msedge", headless: true, args: process.argv.includes("--nowebgl") ? ["--disable-webgl", "--disable-3d-apis"] : [] });
const film = [["hero", 0, 0], ["E4", 1, 0.76], ["C4", 2, 0.9], ["landing", 3, 0.4]];
const still = [["hero", null], ["evidence", "evidence"], ["change", "change"], ["trace", "trace"]];
const only = process.argv.find((a) => a.startsWith("--mode="))?.slice(7);
let total = 0;
for (const [w, h] of [[1440, 900], [390, 844]]) {
  for (const mode of only ? [only] : ["film", "still"]) {
    const mobile = w < 600;
    const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, reducedMotion: mode === "still" ? "reduce" : "no-preference" });
    await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
    await page.waitForFunction(() => document.documentElement.dataset.kfilmLive !== undefined, null, { timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.addScriptTag({ content: axeSource });
    for (const point of mode === "film" ? film : still) {
      if (mode === "film") {
        await page.evaluate(([act, t]) => { const f = window.__kfilm; const P = f.clock.progressOf(act, t); window.scrollTo({ top: f.trigger.start + P * (f.trigger.end - f.trigger.start), behavior: "instant" }); }, [point[1], point[2]]);
      } else if (point[1] !== null) {
        await page.evaluate((id) => document.querySelector(`[data-act-slot="${id}"]`).scrollIntoView({ behavior: "instant" }), point[1]);
      } else await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.waitForTimeout(2600);
      const result = await page.evaluate(async () => {
        const res = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } });
        return { violations: res.violations.map((v) => `${v.impact} ${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join(" | ")}`), incomplete: res.incomplete.map((v) => `${v.id} (${v.nodes.length})`) };
      });
      total += result.violations.length;
      console.log(`${w}x${h} ${mode} ${point[0]}: ${result.violations.length} violations; review: ${result.incomplete.join(", ") || "none"}`);
      for (const v of result.violations) console.log("   -", v);
    }
    await page.close();
  }
}
console.log("total violations", total);
await browser.close();
