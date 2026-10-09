import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
  const info = await page.evaluate(() => ({
    kfilm: document.documentElement.dataset.kfilm ?? null,
    js: document.documentElement.dataset.js ?? null,
    canvases: [...document.querySelectorAll("canvas")].map((c) => getComputedStyle(c).display),
    figures: [...document.querySelectorAll("[data-still-act]")].map((f) => getComputedStyle(f).display),
    h2: [...document.querySelectorAll("section h2")].map((h) => h.textContent),
    record: document.querySelector("[data-ev-record]")?.textContent?.slice(0, 80),
    selectOptions: document.querySelectorAll("[data-ld-file] option").length,
    optgroups: document.querySelectorAll("[data-ld-file] optgroup").length,
    readout: document.querySelector("[data-ld-readout]")?.textContent,
  }));
  console.log(w, JSON.stringify(info));
  for (const id of ["evidence", "change", "trace"]) {
    await page.evaluate((id) => document.querySelector(`[data-act-slot="${id}"]`).scrollIntoView({ behavior: "instant" }), id);
    await page.waitForTimeout(600); await page.screenshot({ path: `r2/nojs-${w}-${id}.png` });
  }
  await ctx.close();
}
await browser.close();
