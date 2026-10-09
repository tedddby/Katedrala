import { VIEWPORTS, launch, open, scrollTo, frames } from "./lib.mjs";
const browser = await launch();
const { page, context } = await open(browser, VIEWPORTS[1440]);
await scrollTo(page, "#architecture", 0);
await page.waitForTimeout(400);
const toggle = page.locator("#architecture .kind-toggle").first();
await toggle.focus();
await page.keyboard.press("Enter");
await frames(page, 1);
const s1 = await page.evaluate(() => [...document.querySelectorAll("#architecture .chain")].map((g) => `${g.dataset.present}:${g.style.opacity}`));
console.log("after keyboard Enter: inline opacities", s1.filter((x) => !x.endsWith(":")).length, "absent", s1.filter((x) => x.startsWith("false")).length);
await page.keyboard.press("Space");
await frames(page, 1);
const s2 = await page.evaluate(() => [...document.querySelectorAll("#architecture .chain")].map((g) => `${g.dataset.present}:${g.style.opacity}`));
console.log("after keyboard Space: inline opacities", s2.filter((x) => !x.endsWith(":")).length, "absent", s2.filter((x) => x.startsWith("false")).length);
// Rapid pointer toggling: 5 clicks within ~100 ms must not stack.
for (let i = 0; i < 5; i++) await toggle.click({ delay: 0 });
const t0 = Date.now();
await page.waitForFunction(() => [...document.querySelectorAll("#architecture .chain")].every((g) => g.style.opacity === ""), null, { timeout: 3000 });
console.log("rapid 5 clicks settled", Date.now() - t0, "ms after the last; present",
  await page.evaluate(() => [...document.querySelectorAll("#architecture .chain")].filter((g) => g.dataset.present === "true").length));
await context.close(); await browser.close();
