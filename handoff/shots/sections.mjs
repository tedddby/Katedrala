// Screenshots individual sections (by id) at desktop width, with optional interactions for the explorer.
import { chromium } from "playwright-core";
const [url, out, ...ids] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(url, { waitUntil: "networkidle" });
for (const id of ids) {
  const section = page.locator(`#${id}`);
  await section.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await section.screenshot({ path: `${out}/section-${id}.png` });
  if (id === "architecture") {
    await page.locator('.plan-member[aria-label^="PaymentService,"] .plan-hit').click();
    await page.waitForTimeout(350);
    await section.screenshot({ path: `${out}/section-${id}-selected.png` });
    await page.getByRole("button", { name: "Modules" }).click();
    await page.waitForTimeout(700);
    await section.screenshot({ path: `${out}/section-${id}-modules.png` });
  }
}
console.log(errors.length ? errors.join("\n") : "no console errors");
await browser.close();
