// axe-core at the film's beats in every act (film mode) and in the still layout, 1440 and 390.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const beats = [[0, 0], [0, 0.965], [1, 0.75], [2, 0.9], [3, 0.5]];
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const mobile = w < 600;
  for (const reduced of [false, true]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, reducedMotion: reduced ? "reduce" : "no-preference" });
    await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
    await page.waitForFunction(() => document.documentElement.dataset.kfilmLive !== undefined, null, { timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.addScriptTag({ content: axeSource });
    for (const [index, t] of reduced ? [[0, 0]] : beats) {
      if (!reduced) {
        await page.evaluate(([index, t]) => { const f = window.__kfilm; const tr = f.trigger; window.scrollTo({ top: tr.start + f.clock.progressOf(index, t) * (tr.end - tr.start), behavior: "instant" }); }, [index, t]);
        await page.waitForTimeout(1800);
      }
      const res = await page.evaluate(async () => {
        const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } });
        return r.violations.map((v) => `${v.impact} ${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
      });
      console.log(`${w}x${h} ${reduced ? "still" : `film ${["hang", "evidence", "change", "trace"][index]} ${t}`}: ${res.length} violations${res.length ? "\n  " + res.join("\n  ") : ""}`);
    }
    await page.close();
  }
}
await browser.close();
