// The hinge, the final statement and the footer under forced colors (dark and light system themes).
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge" });
for (const scheme of ["dark", "light"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, forcedColors: "active", colorScheme: scheme });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  for (const sel of ["#how-it-works", "#get-started"]) {
    await page.locator(sel).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.locator(sel).screenshot({ path: `r1/forced-${scheme}-${sel.slice(1)}.png` });
  }
  await page.locator("body > footer").screenshot({ path: `r1/forced-${scheme}-footer.png` });
  await ctx.close();
}
await browser.close();
