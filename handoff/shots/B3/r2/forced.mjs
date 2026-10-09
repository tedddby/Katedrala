// Forced colors (dark and light): the hatched grounds of the hinge board, the final statement, the Open source gauge,
// the Ecosystem elevation and Gravity's schedule; and the navigation over the film.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
mkdirSync("r2/forced", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
for (const scheme of ["dark", "light"]) {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, forcedColors: "active", colorScheme: scheme, reducedMotion: "reduce" });
    await page.goto("http://localhost:3100/lab/promoted/", { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const nav = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector(".site-nav"));
      return { under: document.documentElement.dataset.kfilmUnder !== undefined, bg: cs.backgroundColor, rule: cs.borderBottomColor, link: getComputedStyle(document.querySelector(".site-nav a")).color };
    });
    const grounds = await page.evaluate(() =>
      [...document.querySelectorAll(".ground-hatch")].map((g) => {
        const cs = getComputedStyle(g);
        return `${g.className.split(" ")[0]}: img ${cs.backgroundImage.slice(0, 40)} line ${cs.borderTopWidth}/${cs.borderBottomWidth} ${cs.borderTopColor}`;
      }),
    );
    console.log(`${scheme} ${w}: nav at top ${JSON.stringify(nav)}`);
    if (w === 1440) for (const g of grounds) console.log("   " + g);
    for (const sel of [".hinge-board", ".statement-ground", ".gauge-ground", ".eco-ground"]) {
      const el = page.locator(sel).first();
      await el.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const box = await el.boundingBox();
      await page.screenshot({ path: `r2/forced/${scheme}-${w}-${sel.slice(1)}.png`, clip: { x: 0, y: Math.max(0, box.y - 30), width: w, height: Math.min(box.height + 60, 200) } });
    }
    await page.close();
  }
}
await browser.close();
