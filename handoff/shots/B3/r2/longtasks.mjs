// Long tasks and resource timing before the film starts (kfilm:start), per route: where the extra time goes.
import { chromium } from "playwright-core";
const [size = "1440x900", ...urls] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const browser = await chromium.launch({ channel: "msedge", headless: true });
for (const url of urls) {
  for (let i = 0; i < 2; i++) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__lt = [];
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: "longtask", buffered: true });
    });
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => performance.getEntriesByName("kfilm:first-frame").length > 0, null, { timeout: 30000 }).catch(() => {});
    const r = await page.evaluate(() => {
      const start = performance.getEntriesByName("kfilm:start")[0]?.startTime ?? 0;
      const nav = performance.getEntriesByType("navigation")[0];
      const res = performance.getEntriesByType("resource").filter((e) => e.startTime < start);
      const js = res.filter((e) => /\.js/.test(e.name));
      return {
        start: Math.round(start),
        html: { bytes: nav.transferSize, responseEnd: Math.round(nav.responseEnd), dcl: Math.round(nav.domContentLoadedEventEnd) },
        jsCount: js.length,
        jsBytes: js.reduce((a, e) => a + (e.encodedBodySize || 0), 0),
        lastJsEnd: Math.round(Math.max(0, ...js.map((e) => e.responseEnd))),
        long: window.__lt.filter(([s]) => s < start),
      };
    });
    console.log(`${url} run ${i + 1}: start ${r.start}  html ${r.html.bytes} B responseEnd ${r.html.responseEnd} DCL ${r.html.dcl}  js ${r.jsCount} files ${Math.round(r.jsBytes / 1024)} KB lastEnd ${r.lastJsEnd}  long tasks before start: ${r.long.map(([s, d]) => `${s}+${d}`).join(" ")}`);
    await ctx.close();
  }
}
await browser.close();
