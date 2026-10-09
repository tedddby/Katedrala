import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge" });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, forcedColors: "active", colorScheme: "dark" });
const page = await context.newPage();
await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.addStyleTag({ content: "body > header, body > a.skip-link { visibility: hidden !important; }" });
for (const id of ["history", "open-source", "ecosystem"]) {
  const el = page.locator(`#${id}`);
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await el.screenshot({ path: `final/forced-${id}.png` });
}
await browser.close();
