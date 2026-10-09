// axe-core (WCAG 2.2 A/AA and best practices) on the dev server's page and the plate-kit specimen, at 1440 and
// 390 (touch), with every disclosure closed and then open. Violations are listed by the unit they sit in, so B3's
// units (skip links, header, hinge, final statement, footer) can be read apart from other owners' work in progress.
// Usage: node axe-units.mjs [--url=http://localhost:3100/]
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith("--url=")) ?? "--url=http://localhost:3100/").slice(6);
const browser = await chromium.launch({ channel: "msedge" });
for (const path of ["", "lab/kit/"]) {
  for (const vp of [
    { tag: "1440", width: 1440, height: 900 },
    { tag: "390 touch", width: 390, height: 844, touch: true },
  ]) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      ...(vp.touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}),
    });
    const page = await context.newPage();
    await page.goto(base + path, { waitUntil: "networkidle" });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += 600) {
      await page.evaluate((t) => window.scrollTo(0, t), y);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(1200);
    await page.addScriptTag({ content: axeSource });
    for (const pass of ["closed", "open"]) {
      if (pass === "open") {
        await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
        await page.waitForTimeout(300);
      }
      const result = await page.evaluate(async () => {
        const r = await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
        });
        const unitOf = (selector) => {
          const el = document.querySelector(selector);
          if (!el) return "?";
          const u = el.closest("main > section[id], body > header, body > footer, body > a.skip-link");
          return u ? u.id || u.tagName.toLowerCase() : "page";
        };
        return r.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => ({ unit: unitOf(n.target[0]), target: n.target.join(" "), summary: n.failureSummary?.split("\n")[1] })),
        }));
      });
      const count = result.reduce((n, v) => n + v.nodes.length, 0);
      console.log(`/${path} ${vp.tag} ${pass}: ${count} violation nodes`);
      for (const v of result)
        for (const n of v.nodes) console.log(`   ${v.id} (${v.impact}) [${n.unit}] ${n.target} :: ${n.summary}`);
    }
    await context.close();
  }
}
await browser.close();
