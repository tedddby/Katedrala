// Where the heap grows in a leave-and-return cycle: forced GC and heap size after each phase (left the film, clock
// off, came back, clock on and drawing), with the real toggling or with it stubbed (control).
import { chromium } from "playwright-core";
const control = process.argv.includes("--control");
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--js-flags=--expose-gc"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
if (control) await page.addInitScript(() => { window.__control = true; });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => window.__kfilm?.trigger, null, { timeout: 60000 });
await page.evaluate(() => {
  const spacer = document.createElement("div");
  spacer.style.height = "3000px";
  document.querySelector("main").append(spacer);
  const ST = window.__kfilm.scrollClock;
  if (window.__control) { ST.disable = () => {}; ST.enable = () => {}; }
  else {
    // The cost of each enable() on the main thread.
    const en = ST.enable.bind(ST);
    window.__enableMs = [];
    ST.enable = (...a) => { const t = performance.now(); const r = en(...a); window.__enableMs.push(+(performance.now() - t).toFixed(1)); return r; };
  }
});
await page.waitForTimeout(4000);
const heap = () => page.evaluate(() => { gc(); gc(); return Math.round(performance.memory.usedJSHeapSize / 1024); });
const rows = [];
for (let i = 0; i < 12; i++) {
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  await page.waitForTimeout(1600);
  const off = await heap();
  await page.evaluate(() => { const tr = window.__kfilm.trigger; window.scrollTo({ top: tr.start + 0.3 * (tr.end - tr.start), behavior: "instant" }); });
  await page.waitForTimeout(600);
  const on = await heap();
  rows.push([off, on]);
}
console.log(control ? "control" : "real", JSON.stringify(rows), control ? "" : `enable() ms: ${JSON.stringify(await page.evaluate(() => window.__enableMs))}`);
await browser.close();
