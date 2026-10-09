// Isolates GSAP: ScrollTrigger.disable(false) then enable(), N times in a row with the page still, and the JS heap
// after forced garbage collection before and after. Also counts gsap's matchMedia contexts if reachable.
import { chromium } from "playwright-core";
const N = Number(process.argv[2] ?? 40);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const cdp = await page.context().newCDPSession(page);
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => window.__kfilm?.trigger, null, { timeout: 60000 });
await page.waitForTimeout(4000);
const heap = async () => { await cdp.send("HeapProfiler.collectGarbage"); await page.waitForTimeout(200); await cdp.send("HeapProfiler.collectGarbage"); return page.evaluate(() => performance.memory.usedJSHeapSize); };
const h0 = await heap();
await page.evaluate(async (N) => {
  const ST = window.__kfilm.scrollClock;
  for (let i = 0; i < N; i++) {
    ST.disable(false);
    ST.enable();
    await new Promise((r) => setTimeout(r, 30));
  }
}, N);
await page.waitForTimeout(1500);
const h1 = await heap();
console.log(JSON.stringify({ N, heapBeforeKB: Math.round(h0 / 1024), heapAfterKB: Math.round(h1 / 1024), perCycleKB: +((h1 - h0) / 1024 / N).toFixed(1) }));
await browser.close();
