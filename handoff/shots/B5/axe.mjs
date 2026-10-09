import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const IDS = ["history", "developers", "open-source", "ecosystem"];
const browser = await chromium.launch({ channel: "msedge" });
for (const [width, height, phone] of [[1440, 900, false], [390, 844, true], [768, 1024, false]]) {
  for (const reduced of [false, true]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 2 : 1, reducedMotion: reduced ? "reduce" : "no-preference" });
    const page = await context.newPage();
    await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    // Put the terminal in an overflowing state on phones (health), so the region role is audited too.
    await page.locator('#developers [role="tab"]').nth(1).click();
    await page.waitForTimeout(600);
    await page.addScriptTag({ content: axeSource });
    const result = await page.evaluate(async (ids) => {
      const r = await window.axe.run({ include: ids.map((id) => [`#${id}`]) }, { resultTypes: ["violations", "incomplete"] });
      return {
        violations: r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" ; ")}`),
        incomplete: r.incomplete.map((v) => `${v.id}: ${v.nodes.length}`),
      };
    }, IDS);
    console.log(`${width}${reduced ? " reduced" : ""}: violations ${result.violations.length} ${result.violations.join(" | ")}; needs review: ${result.incomplete.join(", ")}`);
    await context.close();
  }
}
await browser.close();
