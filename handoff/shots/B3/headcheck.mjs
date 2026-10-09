// The layout head: what the inline scripts leave on <html> on a page without the film and on the film's route,
// with motion allowed and reduced; console errors; and the skip links each page shows.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge" });
for (const path of ["", "lab/cinematic/", "lab/kit/"]) {
  for (const reducedMotion of ["no-preference", "reduce"]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
    // What the head script decided before the body existed.
    await page.addInitScript(() => {
      document.addEventListener("readystatechange", () => {
        if (document.readyState === "interactive") window.__atInteractive = { kfilm: document.documentElement.dataset.kfilm ?? null };
      });
    });
    await page.goto("http://localhost:3100/" + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => ({
      js: document.documentElement.dataset.js ?? null,
      kfilm: document.documentElement.dataset.kfilm ?? null,
      under: document.documentElement.dataset.kfilmUnder !== undefined,
      scripts: [...document.head.querySelectorAll("script:not([src])")].map((s) => s.textContent.slice(0, 40)),
      skips: [...document.querySelectorAll("a.skip-link")].map((a) => `${a.innerText}->${a.getAttribute("href")}:${getComputedStyle(a).display}`),
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    }));
    console.log(`/${path} ${reducedMotion}: ${JSON.stringify(r)} errors ${errors.length} ${errors.join(" | ")}`);
    await ctx.close();
  }
}
await browser.close();
