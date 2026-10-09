// axe-core (WCAG 2.2 A/AA plus best practice) on each of my plates, at 1440 and 390 (touch), with motion and with
// reduced motion, in the resting state and in changed states (Gravity term shown, Entropy commits applied, Rules
// import removed, explorer member selected).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { VIEWPORTS, launch, open, scrollTo } from "./lib.mjs";
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const PLATES = ["architecture", "gravity", "entropy", "rules"];
const run = (page, id) =>
  page.evaluate(async (id) => {
    const r = await window.axe.run(document.querySelector(`#${id}`), {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
    });
    return r.violations.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
  }, id);

const browser = await launch();
let total = 0;
for (const w of ["1440", "390"]) {
  for (const reducedMotion of ["no-preference", "reduce"]) {
    const { page, context } = await open(browser, VIEWPORTS[w], { reducedMotion });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += 600) {
      await page.evaluate((t) => window.scrollTo(0, t), y);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(800);
    await page.addScriptTag({ content: axeSource });
    const report = async (label) => {
      for (const id of PLATES) {
        const v = await run(page, id);
        total += v.length;
        console.log(`${w} ${reducedMotion} ${label} #${id}: ${v.length === 0 ? "0 violations" : v.join("; ")}`);
      }
    };
    await report("rest");
    // Changed states.
    await scrollTo(page, "#gravity", 0);
    await page.locator("#gravity .term-show").nth(3).click();
    await page.locator('#gravity [role="radio"]').nth(1).click();
    await scrollTo(page, "#entropy", 0);
    await page.locator("#entropy .commit").nth(5).click();
    await scrollTo(page, "#rules", 0);
    await page.locator("#rules .rules-toggle").click();
    await scrollTo(page, "#architecture", 0);
    const members = page.locator('#architecture [role="radio"][data-mode="members"]');
    if ((await members.getAttribute("aria-checked")) !== "true") await members.click();
    await page.waitForTimeout(400);
    await page.locator('#architecture [data-id="OrderService"]').click({ force: true });
    await page.locator("#architecture .kind-toggle").nth(1).click();
    await page.waitForTimeout(800);
    await report("changed");
    await context.close();
  }
}
console.log("total violations", total);
await browser.close();
